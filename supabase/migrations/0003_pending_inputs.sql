-- Agent Mirror — Phase 3 Story 3.1
-- Phone-originated messages the daemon consumes and feeds into Claude Code
-- via hook callbacks.
--
-- Flow:
--   1. Web app inserts a row here (authenticated as the user).
--   2. Daemon subscribes via Realtime and stores the text in its in-memory queue.
--   3. On the next Claude Code hook firing, daemon returns the text as the
--      hook's response, which Claude Code injects as user input.
--   4. Daemon updates `consumed_at` so the row isn't re-delivered on restart.

create table public.pending_inputs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz null,
  consumed_by text null
);

-- Fast lookup for the daemon's "give me everything not yet consumed" query.
create index pending_inputs_unconsumed_idx
  on public.pending_inputs (session_id, created_at asc)
  where consumed_at is null;

-- Broadcast inserts and updates so the daemon sees them via Realtime.
alter publication supabase_realtime add table public.pending_inputs;

-- RLS: same rule as messages — a user can only touch pending_inputs whose
-- parent session belongs to them.
alter table public.pending_inputs enable row level security;

create policy "pending_inputs_owner_select" on public.pending_inputs
  for select
  using (
    session_id in (select id from public.sessions where user_id = auth.uid())
  );

create policy "pending_inputs_owner_insert" on public.pending_inputs
  for insert
  with check (
    session_id in (select id from public.sessions where user_id = auth.uid())
  );

create policy "pending_inputs_owner_update" on public.pending_inputs
  for update
  using (
    session_id in (select id from public.sessions where user_id = auth.uid())
  )
  with check (
    session_id in (select id from public.sessions where user_id = auth.uid())
  );
