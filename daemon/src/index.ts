import { statSync } from "node:fs";
import { parseLine } from "./parse-jsonl.js";
import { RelayClient } from "./relay-client.js";
import { SessionWatcher, type ActiveSessionFile } from "./session-watcher.js";
import { loadState, saveState, type PersistedState } from "./state.js";
import { InputQueue } from "./input-queue.js";
import { InputSubscriber } from "./input-subscriber.js";
import { HookServer } from "./hook-server.js";

const relay = new RelayClient();
const state: PersistedState = loadState();
const ensuredSessions = new Set<string>();

await relay.init();

const inputQueue = new InputQueue();
const inputSubscriber = new InputSubscriber(relay.getRawClient(), inputQueue);
const hookServer = new HookServer(inputQueue, relay.getRawClient());
hookServer.start();

async function handleLine(rawLine: string): Promise<void> {
  const parsed = parseLine(rawLine);
  if (!parsed) return;

  const { sessionId, cwd, role, content, timestamp } = parsed;

  // Ensure a sessions row exists exactly once per sessionId per daemon run.
  if (!ensuredSessions.has(sessionId)) {
    try {
      await relay.ensureSession({ id: sessionId, cwd });
      ensuredSessions.add(sessionId);
      // First time we see this session — start listening for phone-originated
      // inputs targeted at it.
      void inputSubscriber.startSession(sessionId);
    } catch (err) {
      console.error(`[publish] ensureSession failed for ${sessionId}:`, err);
      return;
    }
  }

  // Assign the next seq from local state.
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
  } catch (err) {
    console.error(`[publish] failed seq=${nextSeq}:`, err);
    return;
  }

  sessionState.lastSeq = nextSeq;
  sessionState.lastOffset = watcher.getOffset();
  sessionState.path = watcher.getCurrentPath() ?? sessionState.path;
  state.sessions[sessionId] = sessionState;
  saveState(state);

  console.log(
    `[publish] seq=${nextSeq} role=${role} len=${content.length} session=${sessionId.slice(0, 8)}`,
  );
}

/**
 * Determine where to resume reading when the watcher picks a new (or same) file.
 * If we've seen this file's path before (by looking through state.sessions),
 * resume at its lastOffset. Otherwise start at end-of-file — we do NOT want
 * to bulk-publish an entire historical session the first time we see it.
 */
function resolveStartingOffset(file: ActiveSessionFile): number {
  for (const [, s] of Object.entries(state.sessions)) {
    if (s.path === file.path) return s.lastOffset;
  }
  // Brand new file: start at current end-of-file.
  try {
    return statSync(file.path).size;
  } catch {
    return 0;
  }
}

const watcher = new SessionWatcher(handleLine, resolveStartingOffset);

console.log("[daemon] starting");
watcher.start();

process.on("SIGINT", () => {
  console.log("\n[daemon] stopping");
  watcher.stop();
  void inputSubscriber.stop();
  void hookServer.stop();
  saveState(state);
  process.exit(0);
});
