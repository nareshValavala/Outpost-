"use client";

import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy web/.env.example to web/.env.local and fill it in.",
  );
}

/**
 * Browser-side Supabase client. Auth state is persisted in cookies by
 * @supabase/ssr so middleware.ts and server components can read it.
 */
export const supabase = createBrowserClient(url, anonKey);

export interface MessageRow {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  seq: number;
  created_at: string;
}

export interface SessionRow {
  id: string;
  cwd: string;
  started_at: string;
  last_seen_at: string;
}

export interface PendingInputRow {
  id: string;
  session_id: string;
  text: string;
  created_at: string;
  consumed_at: string | null;
  consumed_by: string | null;
}
