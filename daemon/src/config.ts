import { config as loadDotenv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Global config file lives in ~/.agent-mirror/config.json so the CLI works
// from any directory. Falls back to .env.local in cwd for dev use.
const GLOBAL_CONFIG_PATH = join(homedir(), ".agent-mirror", "config.json");

interface GlobalConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

function loadGlobalConfig(): GlobalConfig {
  if (!existsSync(GLOBAL_CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf8")) as GlobalConfig;
  } catch {
    return {};
  }
}

const globalConfig = loadGlobalConfig();
// Also load .env.local if present in cwd (dev fallback).
loadDotenv({ path: ".env.local" });

function resolve(name: string, globalValue: string | undefined): string {
  const v = globalValue ?? process.env[name];
  if (!v) {
    console.error(
      `[fatal] missing ${name}. Run \`agent-mirror setup\` or create ~/.agent-mirror/config.json with { "supabaseUrl": "...", "supabaseAnonKey": "..." }`,
    );
    process.exit(1);
  }
  return v;
}

export const SUPABASE_URL = resolve("SUPABASE_URL", globalConfig.supabaseUrl);
export const SUPABASE_ANON_KEY = resolve("SUPABASE_ANON_KEY", globalConfig.supabaseAnonKey);

export const PROJECTS_ROOT = join(homedir(), ".claude", "projects");
export const STATE_DIR = join(homedir(), ".agent-mirror");
export const STATE_FILE = join(STATE_DIR, "state.json");
export const AUTH_FILE = join(STATE_DIR, "auth.json");

export const RESCAN_INTERVAL_MS = 5_000;

// Optional: pin the daemon to a specific session file instead of auto-detecting.
// Read at call time (not import time) so cli.ts can set it after pty spawn.
export function getPinnedSessionFile(): string {
  return process.env.SESSION_FILE ?? "";
}

// Local HTTP port the daemon listens on for Claude Code hook callbacks.
// Bound to 127.0.0.1 only — never reachable from the network.
export const HOOK_SERVER_PORT = Number(process.env.HOOK_SERVER_PORT ?? "8787");

// How often the daemon polls Supabase for new pending_inputs rows.
// See ADR-014 for why we poll instead of using Realtime.
export const INPUT_POLL_INTERVAL_MS = Number(
  process.env.INPUT_POLL_INTERVAL_MS ?? "1500",
);
