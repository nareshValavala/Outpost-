/**
 * One-time setup: saves Supabase credentials to ~/.agent-mirror/config.json
 * and runs the web-login flow to save auth tokens.
 *
 * Run: agent-mirror-setup
 */
import { createInterface } from "node:readline/promises";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createServer } from "node:http";
import { exec, spawn, type ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { saveStoredSession } from "./auth-storage.js";

const CONFIG_PATH = join(homedir(), ".agent-mirror", "config.json");
const AUTH_PATH = join(homedir(), ".agent-mirror", "auth.json");
const WEB_URL = process.env.AGENT_MIRROR_WEB_URL ?? "http://localhost:3000";

interface IncomingSession {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user_id: string;
  email: string;
}

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log("Agent Mirror — setup");
    console.log("This will save credentials to ~/.agent-mirror/");
    console.log();

    // Step 1: Supabase credentials (only prompt if config doesn't exist yet).
    if (existsSync(CONFIG_PATH)) {
      console.log(`[setup] config.json already exists at ${CONFIG_PATH} — reusing it.`);
      console.log("(delete it and re-run setup if you want to change Supabase project)");
    } else {
      const supabaseUrl = (await rl.question("Supabase URL (https://xxxxx.supabase.co): ")).trim();
      if (!supabaseUrl.startsWith("https://")) {
        console.error("[setup] invalid URL");
        process.exit(1);
      }
      const supabaseAnonKey = (await rl.question("Supabase anon key: ")).trim();
      if (!supabaseAnonKey) {
        console.error("[setup] key required");
        process.exit(1);
      }
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(
        CONFIG_PATH,
        JSON.stringify({ supabaseUrl, supabaseAnonKey }, null, 2),
        "utf8",
      );
      try { chmodSync(CONFIG_PATH, 0o600); } catch { /* windows */ }
      console.log(`[setup] saved ${CONFIG_PATH}`);
    }

    // Step 2: Auth — skip if auth.json already exists.
    if (existsSync(AUTH_PATH)) {
      console.log(`[setup] auth.json already exists at ${AUTH_PATH} — skipping login.`);
      console.log(`[setup] done. Run 'agent-mirror' from any project.`);
      return;
    }

    console.log();
    console.log("Now sign in via the web app (password stays in the browser).");
    console.log();
  } finally {
    rl.close();
  }

  // Step 3: Start web server if not already running, then web-login flow.
  const webProc = maybeStartWebServer();
  try {
    await waitForWebServer();
    await runWebLoginFlow();
  } finally {
    if (webProc) {
      try { webProc.kill(); } catch { /* ignore */ }
    }
  }
}

/**
 * Start the Next.js dev server in the background if it's not already running.
 * Returns the child process (null if already running or if we can't find it).
 */
function maybeStartWebServer(): ChildProcess | null {
  // Check if already running by trying to connect briefly.
  // Simpler approach: just always try to start it; if port is in use, the
  // existing server keeps handling requests and our spawn silently errors.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const webDir = resolve(scriptDir, "..", "..", "web");
  if (!existsSync(webDir)) {
    console.log(`[setup] web dir not found at ${webDir} — start it manually`);
    return null;
  }

  console.log(`[setup] starting web server at ${WEB_URL}...`);
  const proc = spawn("npm", ["run", "dev"], {
    cwd: webDir,
    stdio: ["ignore", "ignore", "ignore"],
    shell: true, // required on Windows Node 20+ to spawn npm.cmd
    detached: false,
  });
  return proc;
}

/**
 * Poll until the web server responds. Gives Next.js time to boot.
 */
async function waitForWebServer(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(WEB_URL, { method: "HEAD" }).catch(() => null);
      if (res && res.status < 500) return;
    } catch { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`web server at ${WEB_URL} did not respond after ${timeoutMs}ms`);
}

function runWebLoginFlow(): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const port = 8788;
    const callbackUrl = `http://localhost:${port}`;

    const server = createServer((req, res) => {
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");

      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
      if (req.method !== "POST") { res.writeHead(405); res.end(); return; }

      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const session = JSON.parse(body) as IncomingSession;
          if (!session.access_token || !session.refresh_token) {
            throw new Error("missing tokens");
          }
          saveStoredSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user_id: session.user_id,
            email: session.email,
          });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          console.log(`[setup] success. Logged in as ${session.email}`);
          console.log("[setup] done. Run 'agent-mirror' from any project.");
          setTimeout(() => { server.close(); resolvePromise(); }, 500);
        } catch (err) {
          res.writeHead(400);
          res.end(String(err));
          rejectPromise(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });

    server.listen(port, "127.0.0.1", () => {
      const target = `${WEB_URL}/connect-cli?callback=${encodeURIComponent(callbackUrl)}`;
      console.log(`[setup] opening browser to:`);
      console.log(`  ${target}`);
      console.log("(if your browser doesn't open, paste that URL manually)");
      openBrowser(target);
    });

    // Timeout after 5 minutes.
    setTimeout(() => {
      server.close();
      rejectPromise(new Error("timed out waiting for web login"));
    }, 5 * 60 * 1000);
  });
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"` :
    process.platform === "darwin" ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, { shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh" }, (err) => {
    if (err) console.error("[setup] could not launch browser. Open the URL manually.");
  });
}

main().catch((err) => {
  console.error("[setup] error:", err);
  process.exit(1);
});
