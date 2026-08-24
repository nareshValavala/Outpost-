/**
 * Phase 0 Story 0.4 — the load-bearing spike.
 *
 * Finds the currently-active Claude Code session JSONL and tails it, printing
 * every new user/assistant message within ~1 second of it being written.
 *
 * This is a THROWAWAY. It exists to prove tailing works. The real daemon in
 * phase 1 rewrites this properly.
 *
 * Run:  npx tsx tail-session.ts
 */

import { watch, type FSWatcher } from "chokidar";
import { readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECTS_ROOT = join(homedir(), ".claude", "projects");
const RESCAN_INTERVAL_MS = 5_000;

// --all: read the current session from the beginning instead of tailing end-of-file.
// Useful to verify parsing catches every message type in an existing session.
const FROM_START = process.argv.includes("--all");

interface ActiveSession {
  path: string;
  mtimeMs: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

interface SessionLine {
  type?: string;
  sessionId?: string;
  timestamp?: string;
  uuid?: string;
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
  };
}

function findActiveSession(): ActiveSession | null {
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(PROJECTS_ROOT);
  } catch (err) {
    console.error(`[fatal] cannot read ${PROJECTS_ROOT}:`, err);
    return null;
  }

  let best: ActiveSession | null = null;
  for (const dir of projectDirs) {
    const dirPath = join(PROJECTS_ROOT, dir);
    let files: string[];
    try {
      files = readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const p = join(dirPath, f);
      try {
        const s = statSync(p);
        if (!best || s.mtimeMs > best.mtimeMs) {
          best = { path: p, mtimeMs: s.mtimeMs };
        }
      } catch {
        continue;
      }
    }
  }
  return best;
}

/**
 * Reads bytes from `fromOffset` to end-of-file and returns them plus the new
 * offset. We use low-level fs calls so we can track exact positions — stream
 * APIs hide that detail.
 */
function readFromOffset(path: string, fromOffset: number): { text: string; newOffset: number } {
  const size = statSync(path).size;
  if (size <= fromOffset) {
    // File was truncated or unchanged. If truncated, start fresh.
    return { text: "", newOffset: size < fromOffset ? size : fromOffset };
  }
  const length = size - fromOffset;
  const buf = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, length, fromOffset);
  } finally {
    closeSync(fd);
  }
  return { text: buf.toString("utf8"), newOffset: size };
}

function extractContentText(content: ContentBlock[] | string | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) parts.push(block.text);
    else if (block.type === "thinking" && block.thinking) parts.push(`[thinking] ${block.thinking}`);
    else if (block.type === "tool_use") parts.push(`[tool_use:${block.name ?? "?"}]`);
    else if (block.type === "tool_result") parts.push(`[tool_result]`);
    else parts.push(`[${block.type}]`);
  }
  return parts.join(" ");
}

function printLine(raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) return;
  let obj: SessionLine;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    console.log(`[warn] non-json line: ${trimmed.slice(0, 80)}`);
    return;
  }
  const type = obj.type;
  if (type !== "user" && type !== "assistant") {
    // Noise we ignore: queue-operation, file-history-snapshot, attachment, ai-title.
    return;
  }
  const text = extractContentText(obj.message?.content);
  const preview = text.replace(/\s+/g, " ").slice(0, 160);
  const ts = obj.timestamp ?? "?";
  console.log(`[${ts}] ${type}: ${preview}${text.length > 160 ? "…" : ""}`);
}

class Tailer {
  private current: string | null = null;
  private offset = 0;
  private buffer = "";
  private watcher: FSWatcher | null = null;

  start(): void {
    this.switchTo(findActiveSession());
    setInterval(() => {
      const active = findActiveSession();
      if (!active) return;
      if (active.path !== this.current) {
        console.log(`[session] switching to ${active.path}`);
        this.switchTo(active);
      }
    }, RESCAN_INTERVAL_MS);
  }

  private switchTo(active: ActiveSession | null): void {
    if (this.watcher) {
      this.watcher.close().catch(() => {});
      this.watcher = null;
    }
    this.buffer = "";
    if (!active) {
      console.log("[session] no active session found; retrying every 5s");
      this.current = null;
      this.offset = 0;
      return;
    }
    this.current = active.path;
    // Default: start from end-of-file (new messages only).
    // --all: start from offset 0 to replay the whole session.
    this.offset = FROM_START ? 0 : statSync(active.path).size;
    console.log(
      `[session] ${FROM_START ? "replaying from start of" : "tailing"} ${active.path} (offset ${this.offset})`,
    );
    if (FROM_START) this.drainChanges();

    this.watcher = watch(active.path, {
      usePolling: true, // more reliable on Windows for appended writes
      interval: 300,
      awaitWriteFinish: false,
    });
    this.watcher.on("change", () => this.drainChanges());
    this.watcher.on("error", (err) => console.error("[watch error]", err));
  }

  private drainChanges(): void {
    if (!this.current) return;
    try {
      const { text, newOffset } = readFromOffset(this.current, this.offset);
      this.offset = newOffset;
      if (!text) return;
      this.buffer += text;
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? ""; // keep last (possibly partial) line
      for (const line of lines) printLine(line);
    } catch (err) {
      console.error("[drain error]", err);
    }
  }
}

console.log("[spike] tail-session starting");
console.log(`[spike] projects root: ${PROJECTS_ROOT}`);
new Tailer().start();

process.on("SIGINT", () => {
  console.log("\n[spike] stopping");
  process.exit(0);
});
