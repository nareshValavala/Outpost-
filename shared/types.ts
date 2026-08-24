/**
 * Shared types used by both the daemon and the web app.
 *
 * Keep this file small. Only add a type when both sides need to agree on it.
 * If only one side needs a type, put it in that side's source tree.
 */

export type MessageRole = "user" | "assistant" | "tool";

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  seq: number;
  created_at: string;
}

export interface SessionRef {
  id: string;
  user_id: string | null;
  cwd: string;
  started_at: string;
  last_seen_at: string;
}

export interface PendingInput {
  id: string;
  session_id: string;
  text: string;
  created_at: string;
  consumed_at: string | null;
}
