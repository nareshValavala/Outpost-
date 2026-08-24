import * as pty from "node-pty";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

/**
 * Spawns `claude` inside a pseudo-terminal that we control. All I/O is
 * proxied transparently between the real terminal and the pty — the user
 * sees exactly what they'd see running `claude` directly. The wrapper also
 * exposes a `write()` method the poller uses to inject phone-originated
 * messages into the pty as if the user typed them.
 */
export class PtyWrapper {
  private proc: pty.IPty;
  private onExitCallback: (() => Promise<void>) | null = null;

  /** Snapshot of JSONL files BEFORE claude spawns. Used to detect which file is ours. */
  private preSpawnFiles: Map<string, number>;

  constructor(cwd?: string) {
    const shell = platform() === "win32" ? "claude.cmd" : "claude";
    const spawnCwd = cwd ?? process.cwd();

    // Snapshot existing session files so we can detect the new one after spawn.
    this.preSpawnFiles = this.snapshotSessionFiles();

    this.proc = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: process.stdout.columns ?? 120,
      rows: process.stdout.rows ?? 30,
      cwd: spawnCwd,
      env: process.env as Record<string, string>,
    });

    // Proxy pty output → real terminal.
    this.proc.onData((data) => {
      process.stdout.write(data);
    });

    // Proxy real terminal input → pty.
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      this.proc.write(data.toString());
    });

    // Handle terminal resize.
    process.stdout.on("resize", () => {
      this.proc.resize(
        process.stdout.columns ?? 120,
        process.stdout.rows ?? 30,
      );
    });

    // When Claude Code exits, fire the onExit callback then exit.
    this.proc.onExit(({ exitCode }) => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      if (this.onExitCallback) {
        this.onExitCallback().finally(() => process.exit(exitCode));
      } else {
        process.exit(exitCode);
      }
    });
  }

  /**
   * Inject text into the pty as if the user typed it, then press Enter.
   * Used by the poller to deliver phone-originated messages.
   */
  write(text: string): void {
    this.proc.write(text);
    // Small delay then Enter, matching the timing that worked in the
    // VS Code extension spike.
    setTimeout(() => {
      this.proc.write("\r");
    }, 200);
  }

  /** Get the underlying pty PID for logging. */
  getPid(): number {
    return this.proc.pid;
  }

  /** Register a callback to run when claude exits (for cleanup). */
  onExit(callback: () => Promise<void>): void {
    this.onExitCallback = callback;
  }

  /**
   * Detect which JSONL file belongs to OUR spawned claude session by comparing
   * the current files against the pre-spawn snapshot. Returns the path of a
   * file that either didn't exist before or has grown since spawn.
   * Retries for up to `timeoutMs` since claude may take a moment to start writing.
   */
  async detectOwnSessionFile(expectedCwd: string, timeoutMs = 15000): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    const normalizedExpected = expectedCwd.toLowerCase().replace(/\\/g, "/");

    while (Date.now() < deadline) {
      const current = this.snapshotSessionFiles();

      // Pass 1: prefer brand-new files (most reliable signal).
      for (const [path] of current) {
        if (!this.preSpawnFiles.has(path) && this.fileCwdMatches(path, normalizedExpected)) {
          return path;
        }
      }

      // Pass 2: grown existing files, but ONLY if their cwd matches ours.
      // Prevents picking up files from unrelated Claude Code sessions.
      for (const [path, size] of current) {
        const prevSize = this.preSpawnFiles.get(path);
        if (prevSize !== undefined && size > prevSize && this.fileCwdMatches(path, normalizedExpected)) {
          return path;
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }

  /**
   * Check if a JSONL file's sessions belong to the expected cwd. Reads the
   * first complete line and checks its `cwd` field.
   */
  private fileCwdMatches(path: string, expectedNormalized: string): boolean {
    try {
      const { readFileSync } = require("node:fs") as typeof import("node:fs");
      const content = readFileSync(path, "utf8");
      const firstLineEnd = content.indexOf("\n");
      if (firstLineEnd < 0) return false;
      const obj = JSON.parse(content.slice(0, firstLineEnd));
      const cwd = typeof obj.cwd === "string" ? obj.cwd.toLowerCase().replace(/\\/g, "/") : "";
      return cwd === expectedNormalized;
    } catch {
      return false;
    }
  }

  private snapshotSessionFiles(): Map<string, number> {
    const projectsRoot = join(homedir(), ".claude", "projects");
    const result = new Map<string, number>();
    try {
      for (const dir of readdirSync(projectsRoot)) {
        const dirPath = join(projectsRoot, dir);
        try {
          for (const f of readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"))) {
            const p = join(dirPath, f);
            try {
              result.set(p, statSync(p).size);
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return result;
  }
}
