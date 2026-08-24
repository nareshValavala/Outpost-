-- Agent Mirror — Phase 1 Story 1.1
-- Initial schema: sessions and messages.
--
-- NOTE: Row-level security is intentionally NOT enabled in this migration.
-- Phase 1 is a throwaway single-user demo. RLS is added in phase 2
-- (see supabase/migrations/0002_auth_and_rls.sql).
-- Until phase 2, anyone with the anon key can read/write these tables.
-- Do not put anything sensitive in the linked Supabase project yet.

-- Sessions represent one continuous Claude Code run.
-- The primary key matches Claude Code's own sessionId from the JSONL,
-- so the daemon can upsert idempotently.
create table public.sessions (
  id uuid primary key,
  user_id uuid null,                 -- populated in phase 2
  cwd text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index sessions_last_seen_at_idx
  on public.sessions (last_seen_at desc);

-- Messages are the visible user/assistant turns from a session.
-- `seq` is a per-session monotonic counter assigned by the daemon so the
-- viewer can order deterministically even when timestamps collide.
-- `content` is a pre-rendered text preview (phase 1 viewer is plain-text only).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  seq bigint not null,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create index messages_session_seq_idx
  on public.messages (session_id, seq desc);

-- Enable Supabase Realtime broadcasts on messages so the web app
-- can subscribe to inserts.
alter publication supabase_realtime add table public.messages;
