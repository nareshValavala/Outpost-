# Phase 4 — Reliability

**Phase goal:** I can leave the daemon running all day and trust it. Network blips recover cleanly. New sessions are picked up without a restart. I know when something's wrong because logs tell me.

**Prerequisite:** Phase 3 complete and I have actually used the tool at least once from away-from-desk.

---

## Story 4.1 — Daemon: WebSocket reconnect with backoff

**Goal:** When the Supabase Realtime connection drops, the daemon reconnects automatically with exponential backoff. No manual restart needed.

**Files I expect to create/change:**
- `daemon/src/relay-client.ts` — add reconnect logic
- `daemon/src/input-subscriber.ts` — re-subscribe on reconnect and re-fetch unconsumed rows

**Behavior:**
- Exponential backoff starting at 1s, doubling up to 60s cap.
- Reset backoff on successful reconnect.
- On reconnect, re-run the "fetch unconsumed `pending_inputs`" query to catch anything missed.

**Files I must NOT touch:**
- `web/*`, `supabase/*`

**Acceptance criteria:**
- [ ] Kill network on the machine for 2 minutes. Daemon logs show retry attempts.
- [ ] Restore network. Daemon reconnects within 60 seconds and logs success.
- [ ] Queued messages from during the outage get delivered.
- [ ] Daemon does not crash during the outage.

---

## Story 4.2 — Daemon: detect session switches

**Goal:** When Claude Code starts a new session (new file under `~/.claude/projects/`), the daemon detects it, closes the old watch, ensures a new `sessions` row, and starts tailing the new file.

**Files I expect to create/change:**
- `daemon/src/session-watcher.ts` — periodic rescan (every 5s) for newer active session
- `daemon/src/index.ts` — on new active session, call `ensureSession()` and reset `seq`

**Files I must NOT touch:**
- `web/*`, `supabase/*`

**Acceptance criteria:**
- [ ] Start daemon. Start Claude Code session A. Publish a few messages.
- [ ] Exit Claude Code. Start a new Claude Code session B.
- [ ] Daemon logs `[session] switching to new session id=<uuid>`.
- [ ] New session's messages appear in Supabase under a new `session_id`.
- [ ] Web app, after refresh, shows session B (because it queries the newest session).

---

## Story 4.3 — Daemon: structured logging to file

**Goal:** The daemon writes structured logs to `~/.agent-mirror/daemon.log` with rotation. I can tail that file to diagnose anything.

**Files I expect to create/change:**
- `daemon/src/logger.ts` — simple JSON-line logger, rotating at 10MB, keeping 3 files
- Replace `console.log` calls in daemon code with `logger.info/warn/error`

**Files I must NOT touch:**
- `web/*`, `supabase/*`

**Acceptance criteria:**
- [ ] `~/.agent-mirror/daemon.log` exists after daemon runs.
- [ ] Lines are JSON, one per line, with `level`, `ts`, `msg`, plus structured fields.
- [ ] After 10MB, rotation occurs and old file is renamed to `.1`, `.2`, `.3`.
- [ ] Daemon console output is still readable (logger writes to both).

---

## Story 4.4 — Web app: offline queue via localStorage

**Goal:** If I type a message while my phone has no connectivity, the message queues locally and sends on reconnect. I see a "queued" indicator while offline.

**Files I expect to create/change:**
- `web/src/lib/offline-queue.ts` — localStorage-backed FIFO
- `web/src/components/message-input.tsx` — on send, enqueue locally *first*, then attempt server send; retry loop on reconnect
- `web/src/app/page.tsx` — listen to `online` / `offline` events, flush queue on `online`

**Files I must NOT touch:**
- `daemon/*`, `supabase/*`

**Acceptance criteria:**
- [ ] With phone in airplane mode, typing and sending a message shows "queued (offline)".
- [ ] Taking phone out of airplane mode causes the message to send within 5 seconds.
- [ ] Refreshing the page while offline preserves the queue.
- [ ] Queued message eventually reaches Claude Code.

---

## Story 4.5 — Web app: staleness indicator

**Goal:** If no new message has been seen from the daemon in 60 seconds, show a yellow "stale" banner. If the Realtime subscription disconnects, show a red "disconnected" banner.

**Files I expect to create/change:**
- `web/src/components/status-banner.tsx`
- `web/src/app/page.tsx` — track last-message-at, subscription status

**Files I must NOT touch:**
- `daemon/*`, `supabase/*`

**Acceptance criteria:**
- [ ] With daemon running normally, no banner.
- [ ] Stop the daemon. Within 60 seconds, yellow "stale" banner appears.
- [ ] Disconnect phone network. Red "disconnected" banner appears immediately.
- [ ] Restore network. Red banner clears.

---

## Story 4.6 — Smoke test checklist

**Goal:** A single document listing every manual test to run before declaring any release "done."

**Files I expect to create/change:**
- `docs/SMOKE-TEST.md`

**Contents:** one checkbox per verifiable behavior across phases 0–4. Example items:
- [ ] Daemon starts with no `~/.agent-mirror/config.json` → clear error
- [ ] Daemon starts with valid config → connects, creates session row
- [ ] Claude Code activity → messages appear in web app within 2s
- [ ] Magic link login works from phone
- [ ] Phone-sent message reaches Claude Code within 5s of next hook
- [ ] Network drop on phone → reconnects cleanly
- [ ] Network drop on desktop → reconnects cleanly
- [ ] New Claude Code session → daemon switches without restart
- [ ] 8-hour daemon run → no crashes, no memory growth

**Files I must NOT touch:**
- Anything else.

**Acceptance criteria:**
- [ ] Document exists and is comprehensive for phases 0–4.
- [ ] I run through every item once and they all pass.

---

## Phase 4 exit checklist

- [ ] All stories pass.
- [ ] I have run the daemon for a full 8-hour workday with no babysitting.
- [ ] I have intentionally triggered network drops on both sides during that run and they recovered.
- [ ] I have started at least one new Claude Code session mid-run and the daemon picked it up.
- [ ] Log file has usable content, no error spam.
- [ ] `docs/FEEDBACK.md` created (empty) — I'll fill it during the 2-week real-usage trial.
- [ ] **Phases 1–4 smoke test all passes.**
- [ ] Stop. Use the tool for 2 weeks before starting phase 5 planning.
