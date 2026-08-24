import type { SupabaseClient } from "@supabase/supabase-js";
import type { InputQueue } from "./input-queue.js";
import { INPUT_POLL_INTERVAL_MS } from "./config.js";

interface PendingInputRow {
  id: string;
  session_id: string;
  text: string;
  consumed_at: string | null;
}

/**
 * Polls Supabase for new unconsumed `pending_inputs` rows and pushes them
 * into the queue. See ADR-014 for why we poll instead of using Realtime.
 *
 * The class name is unchanged so callers don't need to know which transport
 * we use under the hood. Future revisions may swap polling for Realtime if
 * the Node SDK reliability issues are fixed.
 */
export class InputSubscriber {
  private timer: NodeJS.Timeout | null = null;
  private currentSessionId: string | null = null;
  private busy = false;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly queue: InputQueue,
  ) {}

  async startSession(sessionId: string): Promise<void> {
    if (this.currentSessionId === sessionId) return;
    await this.stop();

    this.currentSessionId = sessionId;
    console.log(`[input-poll] starting for session ${sessionId.slice(0, 8)}`);

    // Run a tick immediately to backfill, then schedule the loop.
    await this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, INPUT_POLL_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.currentSessionId = null;
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.currentSessionId) return;
    this.busy = true;
    try {
      const { data, error } = await this.supabase
        .from("pending_inputs")
        .select("id, session_id, text, consumed_at")
        .eq("session_id", this.currentSessionId)
        .is("consumed_at", null)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[input-poll] tick failed:", error.message);
        return;
      }
      if (!data) return;
      for (const row of data as PendingInputRow[]) {
        if (
          this.queue.enqueue({
            id: row.id,
            sessionId: row.session_id,
            text: row.text,
          })
        ) {
          console.log(
            `[input-poll] enqueued id=${row.id.slice(0, 8)} text="${row.text.slice(0, 60)}"`,
          );
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
