import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { STATE_FILE } from "./config.js";

/**
 * Per-session bookkeeping so a daemon restart doesn't re-publish old messages.
 */
export interface SessionState {
  path: string;       // jsonl file path this session lives in
  lastOffset: number; // last byte offset we've read from the file
  lastSeq: number;    // last seq we successfully published
}

export interface PersistedState {
  sessions: Record<string, SessionState>; // key = Claude Code sessionId
}

const EMPTY: PersistedState = { sessions: {} };

export function loadState(): PersistedState {
  try {
    if (!existsSync(STATE_FILE)) return structuredClone(EMPTY);
    const raw = readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed.sessions) return structuredClone(EMPTY);
    return parsed;
  } catch (err) {
    console.error("[state] failed to load, starting fresh:", err);
    return structuredClone(EMPTY);
  }
}

export function saveState(state: PersistedState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}
