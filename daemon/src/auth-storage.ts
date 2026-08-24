import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Inline the path so this file doesn't depend on config.ts, which validates
// credentials at import time and would fail during initial setup.
const AUTH_FILE = join(homedir(), ".agent-mirror", "auth.json");

/**
 * Persisted Supabase session for the daemon. Saved under ~/.agent-mirror/auth.json
 * with 0600 permissions (best-effort on Windows).
 *
 * Supabase rotates refresh tokens on every refresh, so we rewrite this file
 * whenever the Supabase client emits TOKEN_REFRESHED.
 */
export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number | null; // unix seconds, as returned by Supabase
  user_id: string;
  email: string;
}

export function loadStoredSession(): StoredSession | null {
  if (!existsSync(AUTH_FILE)) return null;
  try {
    const raw = readFileSync(AUTH_FILE, "utf8");
    return JSON.parse(raw) as StoredSession;
  } catch (err) {
    console.error("[auth] failed to load auth.json:", err);
    return null;
  }
}

export function saveStoredSession(session: StoredSession): void {
  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify(session, null, 2), "utf8");
  try {
    chmodSync(AUTH_FILE, 0o600);
  } catch {
    // Windows ignores chmod — best-effort only.
  }
}
