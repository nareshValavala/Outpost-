import { watch, type FSWatcher } from "chokidar";
import { readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { PROJECTS_ROOT, RESCAN_INTERVAL_MS, getPinnedSessionFile } from "./config.js";

export interface ActiveSessionFile {
  path: string;
  mtimeMs: number;
}

export type LineHandler = (rawLine: string) => void | Promise<void>;

/**
 * Watches ~/.claude/projects for the most-recently-modified .jsonl,
 * tails new bytes as they're appended, splits them into lines, and calls
 * `onLine` for each complete line.
 *
 * When a newer session file appears, the watcher switches to it. The previous
 * file is left alone (the daemon may still have state for it).
 *
 * Important: this watcher does NOT track where to resume from. The caller
 * tells it the starting offset when switching to a file, so state.json-based
 * resume logic lives in index.ts where it belongs.
 */
export class SessionWatcher {
  private watcher: FSWatcher | null = null;
  private currentPath: string | null = null;
  private offset = 0;
  private buffer = "";
  private rescanTimer: NodeJS.Timeout | null = null;
  private locked = false;

  constructor(
    private readonly onLine: LineHandler,
    private readonly onSessionSwitch: (file: ActiveSessionFile) => number,
  ) {}

  start(): void {
    this.evaluateActiveSession();
    this.rescanTimer = setInterval(() => this.evaluateActiveSession(), RESCAN_INTERVAL_MS);
  }

  stop(): void {
    if (this.rescanTimer) clearInterval(this.rescanTimer);
    if (this.watcher) this.watcher.close().catch(() => {});
    this.watcher = null;
  }

  /**
   * Lock the watcher to its current file. Prevents rescanning from ever
   * switching to a different session. Called by the CLI once it identifies
   * which session belongs to the spawned claude process.
   */
  lock(): void {
    this.locked = true;
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer);
      this.rescanTimer = null;
    }
    console.log(`[watcher] locked to ${this.currentPath}`);
  }

  private evaluateActiveSession(): void {
    if (this.locked) return;
    const active = findActiveSessionFile();
    if (!active) return;
    if (active.path === this.currentPath) return;

    // New active session — ask the owner for the starting offset to resume at.
    const startingOffset = this.onSessionSwitch(active);
    this.switchTo(active.path, startingOffset);
  }

  private switchTo(path: string, startingOffset: number): void {
    if (this.watcher) {
      this.watcher.close().catch(() => {});
      this.watcher = null;
    }
    this.currentPath = path;
    this.offset = startingOffset;
    this.buffer = "";

    console.log(`[watcher] tailing ${path} from offset ${startingOffset}`);
    this.watcher = watch(path, {
      usePolling: true,
      interval: 300,
      awaitWriteFinish: false,
    });
    this.watcher.on("change", () => void this.drain());
    this.watcher.on("error", (err) => console.error("[watcher] error", err));

    // Immediately drain in case there's already content past the offset.
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (!this.currentPath) return;
    try {
      const { text, newOffset } = readFromOffset(this.currentPath, this.offset);
      this.offset = newOffset;
      if (!text) return;
      this.buffer += text;
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? ""; // keep partial last line
      for (const line of lines) {
        if (!line.trim()) continue;
        await this.onLine(line);
      }
    } catch (err) {
      console.error("[watcher] drain error", err);
    }
  }

  /** Read-only accessor for the current file offset (used by state.ts). */
  getOffset(): number {
    return this.offset;
  }

  getCurrentPath(): string | null {
    return this.currentPath;
  }
}

export function findActiveSessionFile(): ActiveSessionFile | null {
  // If pinned to a specific session file (set by cli.ts after pty detection), use that.
  const pinned = getPinnedSessionFile();
  if (pinned) {
    try {
      const s = statSync(pinned);
      return { path: pinned, mtimeMs: s.mtimeMs };
    } catch (err) {
      console.error(`[watcher] pinned SESSION_FILE not found: ${pinned}`, err);
      return null;
    }
  }

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(PROJECTS_ROOT);
  } catch (err) {
    console.error(`[watcher] cannot read ${PROJECTS_ROOT}:`, err);
    return null;
  }
  let best: ActiveSessionFile | null = null;
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

function readFromOffset(
  path: string,
  fromOffset: number,
): { text: string; newOffset: number } {
  const size = statSync(path).size;
  if (size <= fromOffset) {
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
