import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import type { MessageRole } from "../../shared/types.js";
import { loadStoredSession, saveStoredSession } from "./auth-storage.js";

export interface EnsureSessionInput {
  id: string;
  cwd: string;
}

export interface PublishMessageInput {
  id?: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  seq: number;
  createdAt?: string;
}

/**
 * Thin wrapper around @supabase/supabase-js. Loads the persisted session
 * from ~/.agent-mirror/auth.json on startup and persists rotated tokens
 * whenever Supabase refreshes them.
 */
export class RelayClient {
  private client: SupabaseClient;
  private userId: string | null = null;
  private initialized = false;

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });

    // Persist rotated tokens back to disk. Supabase rotates refresh tokens
    // on every refresh — if we don't save, the daemon breaks on restart.
    // Also re-auth the Realtime socket so RLS-protected tables continue to
    // broadcast events to us.
    this.client.auth.onAuthStateChange((event, session) => {
      if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session) {
        saveStoredSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at ?? null,
          user_id: session.user.id,
          email: session.user.email ?? "",
        });
        this.client.realtime.setAuth(session.access_token);
      }
    });
  }

  /**
   * Load the stored session and install it on the Supabase client.
   * Must be called before any ensureSession / publishMessage call.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    const stored = loadStoredSession();
    if (!stored) {
      console.error(
        "[relay] no auth.json found at ~/.agent-mirror/auth.json. Run `agent-mirror-setup` first to sign in.",
      );
      process.exit(1);
    }
    const { data, error } = await this.client.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (error || !data.session) {
      console.error(
        `[relay] stored session rejected: ${error?.message ?? "no session"}. ` +
          "Re-run `npm run bootstrap`.",
      );
      process.exit(1);
    }
    this.userId = data.session.user.id;
    // Tell the Realtime client to use the user JWT instead of the anon key.
    // Without this, RLS-protected tables won't broadcast inserts to us, even
    // though the regular HTTP client is authenticated.
    this.client.realtime.setAuth(data.session.access_token);
    this.initialized = true;
    console.log(`[relay] authenticated as ${data.session.user.email} (${this.userId.slice(0, 8)})`);
  }

  getUserId(): string {
    if (!this.userId) throw new Error("RelayClient not initialized");
    return this.userId;
  }

  /** Escape hatch for components that need raw Supabase access (subscriptions). */
  getRawClient(): SupabaseClient {
    return this.client;
  }

  async ensureSession(input: EnsureSessionInput): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client.from("sessions").upsert(
      {
        id: input.id,
        user_id: this.userId,
        cwd: input.cwd,
        last_seen_at: now,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`ensureSession failed: ${error.message}`);
  }

  async publishMessage(input: PublishMessageInput): Promise<void> {
    const { error } = await this.client.from("messages").insert({
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      seq: input.seq,
      created_at: input.createdAt,
    });
    if (error) throw new Error(`publishMessage failed: ${error.message}`);
  }

  async touchSession(id: string): Promise<void> {
    const { error } = await this.client
      .from("sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(`touchSession failed: ${error.message}`);
  }
}
