-- Agent Mirror — Phase 2 Story 2.2
-- Lock down sessions and messages with row-level security.
--
-- Assumes Story 2.4 is already deployed (daemon authenticates as a real user
-- and populates sessions.user_id on insert). If you run this while the daemon
-- is still using the anon key, new inserts will fail.

-- Drop any legacy rows with null user_id (pre-auth test data).
-- The ON DELETE CASCADE on messages.session_id will cascade cleanup.
delete from public.sessions where user_id is null;

-- Require user_id going forward.
alter table public.sessions alter column user_id set not null;

-- Enable row-level security.
alter table public.sessions enable row level security;
alter table public.messages enable row level security;

-- Sessions: a user can see and modify only their own sessions.
-- `for all` covers SELECT / INSERT / UPDATE / DELETE with one policy.
create policy "sessions_owner_all" on public.sessions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Messages: read and write permitted only when the parent session belongs
-- to the authenticated user.
create policy "messages_owner_select" on public.messages
  for select
  using (
    session_id in (select id from public.sessions where user_id = auth.uid())
  );

create policy "messages_owner_insert" on public.messages
  for insert
  with check (
    session_id in (select id from public.sessions where user_id = auth.uid())
  );
