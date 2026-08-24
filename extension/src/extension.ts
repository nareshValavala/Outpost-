import * as vscode from "vscode";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let poller: InputPoller | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log("[agent-mirror] extension activated");

  // Start command — begins polling Supabase for pending inputs.
  context.subscriptions.push(
    vscode.commands.registerCommand("agentMirror.start", async () => {
      if (poller) {
        vscode.window.showInformationMessage("Agent Mirror: already running.");
        return;
      }
      const config = loadConfig();
      if (!config) return;

      poller = new InputPoller(config.supabaseUrl, config.supabaseKey);
      poller.start();
      vscode.window.showInformationMessage("Agent Mirror: polling started.");
    }),
  );

  // Stop command.
  context.subscriptions.push(
    vscode.commands.registerCommand("agentMirror.stop", () => {
      if (poller) {
        poller.stop();
        poller = null;
        vscode.window.showInformationMessage("Agent Mirror: polling stopped.");
      }
    }),
  );

  // Test command from the spike — kept for manual testing.
  context.subscriptions.push(
    vscode.commands.registerCommand("agentMirror.testSendText", () => {
      const terminal = findClaudeTerminal();
      if (!terminal) {
        vscode.window.showWarningMessage(
          "Agent Mirror: no terminal found. Open a terminal and run `claude` first.",
        );
        return;
      }
      sendToTerminal(terminal, "hello from Agent Mirror test");
    }),
  );
}

/**
 * Load Supabase credentials. Tries workspace .env.local first, then
 * falls back to VS Code settings, then prompts.
 */
function loadConfig(): { supabaseUrl: string; supabaseKey: string } | null {
  const vsConfig = vscode.workspace.getConfiguration("agentMirror");
  let url = vsConfig.get<string>("supabaseUrl") ?? "";
  let key = vsConfig.get<string>("supabaseKey") ?? "";

  // Fallback: read from the daemon's .env.local if present in the workspace.
  if (!url || !key) {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (wsFolder) {
      try {
        const fs = require("fs") as typeof import("fs");
        const path = require("path") as typeof import("path");
        const envPath = path.join(wsFolder.uri.fsPath, "daemon", ".env.local");
        const envContent = fs.readFileSync(envPath, "utf8");
        for (const line of envContent.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("SUPABASE_URL=")) {
            url = url || trimmed.slice("SUPABASE_URL=".length).trim();
          }
          if (trimmed.startsWith("SUPABASE_ANON_KEY=")) {
            key = key || trimmed.slice("SUPABASE_ANON_KEY=".length).trim();
          }
        }
      } catch {
        // .env.local not found — will fail below.
      }
    }
  }

  if (!url || !key) {
    vscode.window.showErrorMessage(
      "Agent Mirror: missing Supabase credentials. " +
        "Set agentMirror.supabaseUrl and agentMirror.supabaseKey in VS Code settings, " +
        "or ensure daemon/.env.local exists in the workspace.",
    );
    return null;
  }
  return { supabaseUrl: url, supabaseKey: key };
}

/**
 * Send text to the terminal + submit it (Enter key).
 */
function sendToTerminal(terminal: vscode.Terminal, text: string): void {
  terminal.show();
  terminal.sendText(text, false);
  // Claude Code's TUI needs a small delay between text and Enter.
  setTimeout(() => {
    vscode.commands.executeCommand(
      "workbench.action.terminal.sendSequence",
      { text: "\r" },
    );
  }, 200);
}

/**
 * Find the VS Code terminal most likely running Claude Code.
 */
function findClaudeTerminal(): vscode.Terminal | undefined {
  const terminals = vscode.window.terminals;
  if (terminals.length === 0) return undefined;

  const claude = terminals.find((t) =>
    t.name.toLowerCase().includes("claude"),
  );
  if (claude) return claude;

  return vscode.window.activeTerminal ?? terminals[0];
}

// ---------------------------------------------------------------------------
// Input poller — replaces the daemon's hook server for the write path
// ---------------------------------------------------------------------------

interface PendingInputRow {
  id: string;
  session_id: string;
  text: string;
  consumed_at: string | null;
}

class InputPoller {
  private supabase: SupabaseClient;
  private timer: NodeJS.Timeout | null = null;
  private seen = new Set<string>();
  private busy = false;
  private outputChannel: vscode.OutputChannel;
  constructor(url: string, key: string) {
    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: true },
    });
    this.outputChannel = vscode.window.createOutputChannel("Agent Mirror");
  }

  async start(): Promise<void> {
    this.outputChannel.show(true);

    // Authenticate using the same stored session the daemon uses.
    const authed = await this.authenticate();
    if (!authed) {
      this.log("failed to authenticate — run `npm run bootstrap` in daemon/ first");
      vscode.window.showErrorMessage(
        "Agent Mirror: no auth.json found. Run `npm run bootstrap` in daemon/ to sign in.",
      );
      return;
    }

    this.log("polling started (every 1.5s)");
    this.tick(); // immediate first tick
    this.timer = setInterval(() => this.tick(), 1500);
  }

  private async authenticate(): Promise<boolean> {
    try {
      const fs = require("fs") as typeof import("fs");
      const path = require("path") as typeof import("path");
      const os = require("os") as typeof import("os");
      const authPath = path.join(os.homedir(), ".agent-mirror", "auth.json");

      if (!fs.existsSync(authPath)) {
        this.log(`auth.json not found at ${authPath}`);
        return false;
      }

      const raw = fs.readFileSync(authPath, "utf8");
      const stored = JSON.parse(raw) as {
        access_token: string;
        refresh_token: string;
      };

      const { data, error } = await this.supabase.auth.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
      });

      if (error || !data.session) {
        this.log(`auth failed: ${error?.message ?? "no session"}`);
        return false;
      }

      this.log(`authenticated as ${data.session.user.email}`);
      return true;
    } catch (err) {
      this.log(`auth error: ${err}`);
      return false;
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.log("polling stopped");
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const { data, error } = await this.supabase
        .from("pending_inputs")
        .select("id, session_id, text, consumed_at")
        .is("consumed_at", null)
        .order("created_at", { ascending: true })
        .limit(10);

      if (error) {
        this.log(`poll error: ${error.message}`);
        return;
      }
      if (!data || data.length === 0) return;

      for (const row of data as PendingInputRow[]) {
        if (this.seen.has(row.id)) continue;
        this.seen.add(row.id);

        this.log(`delivering: "${row.text.slice(0, 80)}"`);

        const terminal = findClaudeTerminal();
        if (!terminal) {
          this.log("no Claude Code terminal found — message stays queued");
          this.seen.delete(row.id); // allow retry
          return;
        }

        sendToTerminal(terminal, row.text);

        // Mark consumed in Supabase.
        const { error: updateErr } = await this.supabase
          .from("pending_inputs")
          .update({
            consumed_at: new Date().toISOString(),
            consumed_by: "extension",
          })
          .eq("id", row.id);

        if (updateErr) {
          this.log(`failed to mark consumed: ${updateErr.message}`);
        } else {
          this.log(`delivered and consumed: ${row.id.slice(0, 8)}`);
        }

        // Only deliver one message per tick to avoid flooding the terminal.
        break;
      }
    } finally {
      this.busy = false;
    }
  }

  private log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 23);
    this.outputChannel.appendLine(`[${ts}] ${msg}`);
  }
}

export function deactivate() {
  if (poller) {
    poller.stop();
    poller = null;
  }
  console.log("[agent-mirror] extension deactivated");
}
