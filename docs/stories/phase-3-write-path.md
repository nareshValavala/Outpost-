# Phase 3 — Write path

**Phase goal:** I can type a message on my phone, tap send, and have Claude Code receive it as user input within seconds.

**Prerequisite:** Phase 2 complete.

**Key constraint:** We only write back via Claude Code's official hook system. No keystroke injection, no session file mutation. See ADR-007.

---

## Story 3.1 — Supabase `pending_inputs` table + RLS

**Goal:** Database structure for phone-originated messages the daemon will consume.

**Files I expect to create/change:**
- `supabase/migrations/0003_pending_inputs.sql`

**Schema:**
- `pending_inputs` — `id uuid pk, session_id uuid fk, text text, created_at timestamptz, consumed_at timestamptz null, consumed_by text null`
- Index on `(session_id, created_at asc) where consumed_at is null`
- Enable RLS.
- Policy: insert/select/update allowed when the underlying session's `user_id = auth.uid()`.

**Files I must NOT touch:**
- Daemon and web code — separate stories.

**Acceptance criteria:**
- [ ] Migration applies.
- [ ] Inserting a row as an authenticated user works.
- [ ] Inserting a row as anon fails.

---

## Story 3.2 — Web app: text input and send

**Goal:** A text input and send button at the bottom of the live view. Submitting inserts into `pending_inputs` and shows the text optimistically in the message list with a "queued" marker.

**Files I expect to create/change:**
- `web/src/app/page.tsx` — add input form at bottom
- `web/src/components/message-input.tsx`
- `web/src/lib/send-input.ts` — supabase insert call

**Files I must NOT touch:**
- `daemon/*`, `supabase/*`

**Acceptance criteria:**
- [ ] Typing a message and tapping send inserts a row into `pending_inputs`.
- [ ] The message appears immediately in the message list as "(queued) <text>".
- [ ] On failure, the message shows a retry option. (For v1, "failure" = network error only; do not try to distinguish cases.)
- [ ] Input box clears after successful send.

**Smoke test:** Type a message on phone. Verify the row appears in `pending_inputs` via Supabase dashboard.

---

## Story 3.3 — Daemon: pending input subscription + in-memory queue

**Goal:** The daemon subscribes to `pending_inputs` for its session. New rows go into an in-memory FIFO queue. No hook handling yet — just queueing.

**Files I expect to create/change:**
- `daemon/src/input-queue.ts` — simple FIFO, `enqueue()`, `dequeue()`, `peek()`, `size()`
- `daemon/src/input-subscriber.ts` — Supabase Realtime subscription on `pending_inputs` filtered by current `session_id`
- `daemon/src/index.ts` — wire the subscriber to the queue on startup

**Files I must NOT touch:**
- `web/*`, `supabase/*`

**Acceptance criteria:**
- [ ] Inserting a row into `pending_inputs` via the web app results in the daemon logging `[queue] enqueued id=<uuid>` within 2 seconds.
- [ ] Queue size increments correctly.
- [ ] Restarting the daemon re-fetches all rows where `consumed_at is null` for the current session and re-queues them.

---

## Story 3.4 — Daemon: local hook HTTP server

**Goal:** The daemon exposes a local HTTP endpoint on 127.0.0.1:<port> that Claude Code hooks can call. Calling the endpoint returns the next queued message (if any) and marks it consumed.

**Files I expect to create/change:**
- `daemon/src/hook-server.ts` — Node http module, single endpoint `POST /hook`
- `daemon/src/index.ts` — start the server on daemon boot, log the bound port

**Server contract:**
- Binds to `127.0.0.1` only. Never `0.0.0.0`.
- Port is configurable via env, defaults to `8787`.
- `POST /hook` with any JSON body returns:
  - If queue empty: `{ "decision": "allow" }` (pass-through for the hook).
  - If queue has items: `{ "decision": "block", "reason": "<the-queued-text>" }`. This is the format Claude Code hooks accept to feed a message back into the conversation.
- On return, mark the dequeued row `consumed_at = now()` in Supabase.

**Files I must NOT touch:**
- `web/*`, `supabase/*`

**Acceptance criteria:**
- [ ] `curl -X POST http://127.0.0.1:8787/hook -d '{}'` returns a JSON response.
- [ ] With queue empty, response is `{"decision":"allow"}`.
- [ ] With a queued message, response contains that message and the Supabase row gets `consumed_at` set.
- [ ] Calling again returns the next queued message, or `allow` if empty.
- [ ] The server refuses binds from non-loopback addresses (verified with `curl` from another machine on the LAN — should fail).

---

## Story 3.5 — Wire up Claude Code hooks

**Goal:** Claude Code is configured to call the daemon's hook endpoint on relevant events.

**This is user-side config, not code.** The daemon is unchanged.

**Files I expect to create/change:**
- `docs/CLAUDE-CODE-HOOKS.md` — instructions for configuring `settings.json` to add a `Notification` hook (and/or `Stop` / `PreToolUse`) that calls `curl http://127.0.0.1:8787/hook`.

**Suggested hook config** (to be verified during the story, not blindly copied):
```json
{
  "hooks": {
    "Notification": [{"matcher": "", "hooks": [{"type": "command", "command": "curl -s -X POST http://127.0.0.1:8787/hook -d '{}'"}]}]
  }
}
```

**Acceptance criteria:**
- [ ] With hook configured and daemon running, Claude Code fires the hook on at least one event type.
- [ ] **End-to-end test:** I type "add a comment at the top of the file" on my phone, the daemon queues it, Claude Code fires a hook, the hook pulls the message, and Claude Code receives it as user input.
- [ ] This works from my phone on cellular.

**Known v1 limitation:** If no hook fires, the message sits in the queue. Document this.

---

## Phase 3 exit checklist

- [ ] All five stories pass acceptance criteria.
- [ ] **I have sent a real message from my phone while away from my desk, and Claude Code has acted on it.** This is the phase 3 exit criterion.
- [ ] Hook configuration is documented so I can reproduce it after a Claude Code upgrade.
- [ ] `docs/stories/CURRENT.md` updated to point at phase 4 story 4.1.
- [ ] Any behavior quirks observed during integration get new ADRs.
