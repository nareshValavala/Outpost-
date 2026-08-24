import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InputQueue } from "./input-queue.js";
import { HOOK_SERVER_PORT } from "./config.js";

/**
 * Local HTTP server that Claude Code hooks call when they fire.
 *
 * Contract:
 *   POST /hook (any JSON body)
 *
 *   Empty queue → { "decision": "allow" }
 *     Tells Claude Code to proceed normally with whatever it was about to do.
 *
 *   Has items → { "decision": "block", "reason": "<text>" }
 *     Claude Code injects `reason` into the conversation as a user message.
 *     We dequeue and mark the row consumed in Supabase.
 *
 * Hard rule: bound to 127.0.0.1. Never 0.0.0.0. The hook server has zero
 * authentication and must never be reachable from the network.
 */
export class HookServer {
  private server = createServer((req, res) => this.handle(req, res));

  constructor(
    private readonly queue: InputQueue,
    private readonly supabase: SupabaseClient,
  ) {}

  start(): void {
    this.server.listen(HOOK_SERVER_PORT, "127.0.0.1", () => {
      console.log(`[hook] listening on http://127.0.0.1:${HOOK_SERVER_PORT}/hook`);
    });
    this.server.on("error", (err) => console.error("[hook] server error:", err));
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST" || req.url !== "/hook") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    // Drain the request body but ignore its contents for v1. Future versions
    // could parse Claude Code's hook payload (sessionId, hook type, etc.).
    await drainBody(req);

    const next = this.queue.peek();
    if (!next) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ decision: "allow" }));
      return;
    }

    // Mark consumed first so we don't double-deliver if the response trip
    // fails after Claude Code already sees it.
    const { error } = await this.supabase
      .from("pending_inputs")
      .update({ consumed_at: new Date().toISOString(), consumed_by: "hook" })
      .eq("id", next.id);

    if (error) {
      console.error(`[hook] failed to mark ${next.id} consumed:`, error.message);
      // Don't deliver if we can't mark it — better to keep it queued and
      // retry on the next hook firing than to silently double-fire.
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ decision: "allow" }));
      return;
    }

    // Now safe to dequeue and deliver.
    this.queue.dequeue();
    console.log(
      `[hook] delivering id=${next.id.slice(0, 8)} text="${next.text.slice(0, 60)}"`,
    );
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ decision: "block", reason: next.text }));
  }
}

function drainBody(req: IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    req.on("data", () => {});
    req.on("end", () => resolve());
    req.on("error", () => resolve());
  });
}
