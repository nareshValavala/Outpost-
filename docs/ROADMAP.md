# Agent Mirror — Roadmap

Five phases. Each phase has a **single, testable outcome**. A phase is not done until that outcome works end-to-end on real hardware.

## Phase 0 — Foundations (no code, or near-zero code)

**Outcome:** The repo is set up, the Supabase project exists, a shared type file exists, and we have proven we can read Claude Code's session JSONL and see new lines appear as Claude Code writes them.

**Deliverables:**
- Repo skeleton per ARCHITECTURE.md's layout.
- `shared/types.ts` with initial `Message`, `SessionRef`, `PendingInput` types.
- Supabase project created, URL + anon key saved to `.env.example`.
- A 50-line throwaway script (`scripts/tail-session.ts`) that tails a Claude Code session file and prints new messages to stdout. **This is the spike that de-risks the whole project.** If we can't tail the file reliably, nothing else matters.

**Exit criteria:** Running the tail script in one terminal and Claude Code in another, every new Claude Code message appears in the tail script within 1 second.

**Stories:** `docs/stories/phase-0-foundations.md`

---

## Phase 1 — Read path MVP

**Outcome:** Messages from my live Claude Code session appear on a web page I can open on my phone. No auth yet. No write-back yet. Just a working pipe.

**Deliverables:**
- `daemon/` package: tails the active session file and publishes new messages to Supabase.
- `supabase/migrations/0001_initial.sql`: `sessions` and `messages` tables.
- `web/` package: minimal Next.js app that subscribes to the `messages` channel and renders the list.
- ~~Deploy web app to Vercel preview URL.~~ **Deferred to end of Phase 3** — see [ADR-011](DECISIONS.md).

**Exit criteria:** I can open `http://<lan-ip>:3000` on my phone (same wifi) and see new messages appear in real time as Claude Code writes them. The "cellular" test moves to end of Phase 3 when we deploy.

**Stories:** `docs/stories/phase-1-read-path.md`

---

## Phase 2 — Auth

**Outcome:** The web page is locked behind magic-link login. Only I can see my session. The daemon authenticates with a token I configure locally.

**Deliverables:**
- Supabase Auth configured for magic link.
- RLS policies on `sessions` and `messages` restricting to `auth.uid()`.
- Web app: login page, auth context, logout.
- Daemon: reads auth token from `~/.agent-mirror/config.json`, uses it for Supabase client.
- A one-time setup command for the daemon to generate/store the token.

**Exit criteria:** Opening the Vercel URL in a fresh browser shows the login page. Logging in shows my session. Logging out and re-opening the URL shows the login page again. Running the daemon without a valid token fails loudly.

**Stories:** `docs/stories/phase-2-auth.md`

---

## Phase 3 — Write path

**Outcome:** I can type text on the phone, tap send, and have Claude Code receive it as user input.

**Deliverables:**
- `pending_inputs` table + RLS.
- Web app: text input, send button, optimistic display.
- Daemon: subscribes to `pending_inputs`, maintains in-memory queue.
- Daemon: local HTTP server on 127.0.0.1 that Claude Code hooks call.
- Claude Code hook config (documented in `docs/stories/phase-3-write-path.md`) that calls back to the daemon.
- Hook handler returns the next queued message, which Claude Code injects as user input.

**Exit criteria:** I type "please rename this to foo" on my phone while Claude Code is running. Within 5 seconds of the next hook firing, Claude Code shows my message as user input and acts on it.

**Stories:** `docs/stories/phase-3-write-path.md`

---

## Phase 4 — Reliability

**Outcome:** I can leave the daemon running all day without babysitting it. Reconnects work. Network blips don't lose state.

**Deliverables:**
- Daemon: exponential backoff reconnect on WebSocket drop.
- Daemon: detect new session file when Claude Code starts a fresh session, switch tailing targets cleanly.
- Daemon: structured logging to `~/.agent-mirror/daemon.log` with rotation.
- Web app: localStorage queue for typed messages when offline, flushes on reconnect.
- Web app: "stale" indicator when no message seen in N seconds.
- Manual smoke test checklist (`docs/SMOKE-TEST.md`) run before each release.

**Exit criteria:** I run the daemon for a full 8-hour workday. I intentionally disconnect wifi on my phone for 5 minutes mid-session, then reconnect. I see the backlog catch up and my queued message gets delivered. The daemon log shows a clean reconnect with no errors.

**Stories:** `docs/stories/phase-4-reliability.md`

---

## After phase 4

**Stop.** Use the tool for two weeks. Keep a `FEEDBACK.md` file where I note every pain point, missed feature, or bug I hit in real usage. Only then, decide what phase 5 is — it should be driven by that file, not by speculation.

Candidate v2 themes (for later, not now):
- Packaging / autostart
- Gemini CLI adapter
- Codex CLI adapter
- Push notifications via web push API
- Multi-session support
- Approval-specific UI (diff view, accept/reject buttons)

None of those are on the roadmap until phase 4 is done and I've actually used the tool.
