/**
 * agent-mirror CLI — the single entry point that does everything.
 *
 * Run: npx tsx src/cli.ts
 *   or: agent-mirror (once linked via npm)
 *
 * What it does:
 *   1. Authenticates with Supabase using stored credentials (~/.agent-mirror/auth.json)
 *   2. Spawns `claude` inside a pseudo-terminal (transparent to the user)
 *   3. Tails the active Claude Code session JSONL → publishes to Supabase (read path)
 *   4. Polls Supabase for pending_inputs → writes to the pty (write path)
 *
 * One process. One command. Any terminal.
 */
import { config as loadDotenv } from "dotenv";
import { PtyWrapper } from "./pty-wrapper.js";
import { RelayClient } from "./relay-client.js";
import { SessionWatcher, type ActiveSessionFile } from "./session-watcher.js";
import { parseLine } from "./parse-jsonl.js";
import { loadState, saveState, type PersistedState } from "./state.js";
import { InputQueue } from "./input-queue.js";
import { statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadStoredSession } from "./auth-storage.js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  INPUT_POLL_INTERVAL_MS,
} from "./config.js";

// Load env.
loadDotenv({ path: ".env.local" });

// ── Auth ──────────────────────────────────────────────────────────────────
const relay = new RelayClient();
await relay.init();

// Clean up stale sessions on startup. If a session hasn't been touched in
// 5 minutes, it's dead (daemon crashed or terminal was force-closed).
try {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: stale } = await relay.getRawClient()
    .from("sessions")
    .select("id")
    .lt("last_seen_at", cutoff);
  if (stale && stale.length > 0) {
    const ids = stale.map((s: { id: string }) => s.id);
    await relay.getRawClient()
      .from("sessions")
      .delete()
      .in("id", ids);
    process.stderr.write(`[agent-mirror] cleaned up ${ids.length} stale session(s)\n`);
  }
} catch { /* non-fatal */ }

// Separate authenticated client for the input poller (relay client doesn't
// expose raw query for pending_inputs polling).
const pollerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});
const stored = loadStoredSession();
if (stored) {
  await pollerClient.auth.setSession({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
  });
}

// ── State ─────────────────────────────────────────────────────────────────
const state: PersistedState = loadState();
const ensuredSessions = new Set<string>();

// ── Pty ───────────────────────────────────────────────────────────────────
// Spawn claude in the CURRENT working directory by default. The user `cd`s
// into whatever project they want to work on and then runs `agent-mirror`.
// Pass a path as the first CLI arg to override.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const cliArg = process.argv[2];
const projectRoot = cliArg ? resolve(cliArg) : process.cwd();
process.stderr.write(`[agent-mirror] project root: ${projectRoot}\n`);

// ── Web server (auto-started) ─────────────────────────────────────────────
// Start the Next.js web app in the background so the user doesn't need a
// separate terminal. Looks for the web/ folder sibling to daemon/ (i.e. in
// the Agent Mirror repo itself, not the project the user is working on).
const scriptDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(scriptDir, "..", "..", "web");
if (existsSync(webDir)) {
  const webProc = spawn("npm", ["run", "dev"], {
    cwd: webDir,
    stdio: ["ignore", "ignore", "ignore"],
    shell: true, // required on Windows Node 20+ to spawn npm.cmd
    detached: false,
  });
  process.stderr.write(`[agent-mirror] web server starting at http://localhost:3000 (pid=${webProc.pid})\n`);
  // Kill the web server when we exit.
  process.on("exit", () => {
    try { webProc.kill(); } catch { /* ignore */ }
  });
} else {
  process.stderr.write(`[agent-mirror] web dir not found at ${webDir} — start manually\n`);
}

const wrapper = new PtyWrapper(projectRoot);
wrapper.onExit(cleanup);

// Detect which JSONL file our spawned claude is writing to.
// This prevents cross-talk with other Claude Code sessions.
const ownSessionFile = await wrapper.detectOwnSessionFile(projectRoot);
if (ownSessionFile) {
  process.env.SESSION_FILE = ownSessionFile;
  // Log to stderr so it doesn't mix with pty output.
  process.stderr.write(`[agent-mirror] pinned to session: ${ownSessionFile}\n`);
} else {
  process.stderr.write(`[agent-mirror] warning: could not detect session file, using auto-detect\n`);
}

// ── Input queue + poller ──────────────────────────────────────────────────
const inputQueue = new InputQueue();
let currentSessionId: string | null = null;

setInterval(async () => {
  if (!currentSessionId) return;
  try {
    const { data, error } = await pollerClient
      .from("pending_inputs")
      .select("id, session_id, text, consumed_at")
      .eq("session_id", currentSessionId)
      .is("consumed_at", null)
      .order("created_at", { ascending: true })
      .limit(10);
    if (error || !data) return;
    for (const row of data) {
      if (!inputQueue.enqueue({ id: row.id, sessionId: row.session_id, text: row.text })) continue;

      // Deliver to the pty.
      wrapper.write(row.text);
      process.stderr.write(
        `[agent-mirror] delivering: "${row.text.slice(0, 60)}" (id=${row.id.slice(0, 8)})\n`,
      );

      // Mark consumed.
      await pollerClient
        .from("pending_inputs")
        .update({ consumed_at: new Date().toISOString(), consumed_by: "agent-mirror" })
        .eq("id", row.id);

      // One message per tick to avoid flooding.
      break;
    }
  } catch {
    // Swallow — next tick will retry.
  }
}, INPUT_POLL_INTERVAL_MS);

// ── Read path (JSONL → Supabase) ─────────────────────────────────────────
async function handleLine(rawLine: string): Promise<void> {
  const parsed = parseLine(rawLine);
  if (!parsed) return;

  const { sessionId, cwd, role, content, timestamp } = parsed;

  if (!ensuredSessions.has(sessionId)) {
    try {
      await relay.ensureSession({ id: sessionId, cwd });
      ensuredSessions.add(sessionId);
      currentSessionId = sessionId;
      // Lock the watcher to this session — prevents rescanning from
      // switching to other Claude Code sessions running in parallel.
      watcher.lock();
    } catch {
      return;
    }
  }

  const sessionState = state.sessions[sessionId] ?? {
    path: watcher.getCurrentPath() ?? "",
    lastOffset: watcher.getOffset(),
    lastSeq: 0,
  };
  const nextSeq = sessionState.lastSeq + 1;

  try {
    await relay.publishMessage({
      sessionId,
      role,
      content,
      seq: nextSeq,
      createdAt: timestamp,
    });
    process.stderr.write(
      `[agent-mirror] publish seq=${nextSeq} role=${role} len=${content.length}\n`,
    );
  } catch (err) {
    const msg = String(err);
    // Duplicate key = row already exists (stale state.json). Skip silently
    // and advance seq so we don't keep hitting the same conflict.
    if (msg.includes("duplicate key")) {
      sessionState.lastSeq = nextSeq;
      state.sessions[sessionId] = sessionState;
      saveState(state);
      return;
    }
    process.stderr.write(`[agent-mirror] publish failed: ${err}\n`);
    return;
  }

  sessionState.lastSeq = nextSeq;
  sessionState.lastOffset = watcher.getOffset();
  sessionState.path = watcher.getCurrentPath() ?? sessionState.path;
  state.sessions[sessionId] = sessionState;
  saveState(state);
}

function resolveStartingOffset(file: ActiveSessionFile): number {
  for (const [, s] of Object.entries(state.sessions)) {
    if (s.path === file.path) return s.lastOffset;
  }
  try {
    return statSync(file.path).size;
  } catch {
    return 0;
  }
}

const watcher = new SessionWatcher(handleLine, resolveStartingOffset);
watcher.start();

// Heartbeat: touch the session every 30s so stale-cleanup knows it's alive.
// If the terminal is force-closed (click X), the heartbeat stops and the
// next startup cleans up the orphaned session after 5 minutes.
setInterval(async () => {
  if (!currentSessionId) return;
  try {
    await relay.touchSession(currentSessionId);
  } catch { /* non-fatal */ }
}, 30_000);

// ── Cleanup on exit ──────────────────────────────────────────────────────
async function cleanup() {
  watcher.stop();
  // Delete this session's data from Supabase so it doesn't accumulate.
  if (currentSessionId) {
    process.stderr.write(`[agent-mirror] cleaning up session ${currentSessionId.slice(0, 8)}...\n`);
    // Cascade deletes messages + pending_inputs automatically.
    await relay.getRawClient()
      .from("sessions")
      .delete()
      .eq("id", currentSessionId);
  }
  saveState(state);
}

process.on("SIGINT", () => {
  void cleanup().finally(() => process.exit(0));
});
