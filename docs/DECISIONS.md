# Architecture Decision Records

Every non-trivial technical decision lives here. New decisions are appended at the bottom. Superseded decisions are marked but not deleted.

Format: each ADR has a short title, a status (`proposed` / `accepted` / `superseded by ADR-NNN`), the decision in one paragraph, and the reason.

---

## ADR-001 — Run as a standalone daemon, not a VS Code extension

**Status:** accepted

**Decision:** Agent Mirror runs as a standalone Node.js process outside VS Code. It is not a VS Code extension.

**Why:** VS Code extensions can't read data inside another extension's webview, and cannot reach another extension's network calls. Since our data source is Claude Code's on-disk session files and its hook system, we don't need to be inside VS Code at all. A standalone daemon avoids the marketplace review cycle, extension host crashes, and VS Code version coupling.

---

## ADR-002 — Read agent state from on-disk session files, not by interception

**Status:** accepted

**Decision:** We read Claude Code's session state by tailing its JSONL session files under `~/.claude/projects/`. We do not intercept API calls, scrape the chat UI, or proxy network traffic.

**Why:** It's the only stable, supported way to see the live conversation. Intercepting API calls would require a local proxy + cert trust, which is user-hostile. Scraping the UI would require DOM access we don't have. The JSONL files are updated in real time by Claude Code and are trivially tailable.

---

## ADR-003 — Supabase for the relay

**Status:** accepted

**Decision:** Use Supabase (hosted free tier) as the cloud relay. It provides Auth, Postgres, row-level security, and Realtime channels in one package.

**Why:** The alternative is writing our own Node WebSocket server plus auth plus a database, which is weeks of work for a solved problem. Supabase's free tier is sufficient for single-user usage. If we ever need to self-host, Supabase is open source and can be self-hosted; migration isn't a dead-end.

**Known risk:** We're vendor-coupled to Supabase's client SDK. Mitigation: keep the relay client code behind a thin interface (`RelayClient`) so we can swap implementations later.

---

## ADR-004 — Next.js + Vercel for the web app

**Status:** accepted

**Decision:** Web app is Next.js 15 deployed to Vercel free tier.

**Why:** Fastest path to a deployed web app with authentication, routing, and a real URL I can hit from my phone. Next.js has first-class Supabase integration. Vercel free tier is sufficient for single-user usage.

**Alternatives considered:** Vanilla HTML + Supabase JS, Astro, SvelteKit. Next.js wins on integration maturity and deploy speed, at the cost of being heavier than strictly necessary.

---

## ADR-005 — Claude Code only for v1

**Status:** accepted

**Decision:** The MVP supports Claude Code only. No Gemini CLI, no Codex CLI, no Aider, no Copilot, no Cursor.

**Why:** Multi-agent support is a moat conversation, not a v1 conversation. The primary user (me) uses Claude Code. Building an adapter interface before we have two adapters leads to the wrong abstraction. Phase 5+ may reconsider after real usage.

---

## ADR-006 — In-memory queue only for v1, no durable store on the daemon

**Status:** accepted

**Decision:** The daemon's queue of pending user inputs lives in memory only. If the daemon crashes, queued messages are lost.

**Why:** A durable queue is a SQLite database plus migration logic plus corruption handling. The Supabase `pending_inputs` table *is* the durable store — if the daemon restarts, it re-reads unconsumed rows. The daemon's in-memory copy is just a cache for fast hook responses.

---

## ADR-007 — Hook-response write path, not keystroke injection

**Status:** accepted

**Decision:** To send a phone-typed message back to Claude Code, we respond to a Claude Code hook (Notification / Stop / PreToolUse) with the message as the hook's output. We do not inject keystrokes, modify session files, or write to Claude Code's stdin.

**Why:** Hooks are a supported, documented Claude Code feature. Keystroke injection is fragile, OS-specific, and breaks silently. Writing to session files could corrupt them and Claude Code's own writes would race ours.

**Known limitation:** Messages can only be delivered at moments when Claude Code fires a hook. If no hook fires, messages queue until one does. This is documented as a v1 limitation.

---

## ADR-008 — No packaging, no autostart, no service wrapper for v1

**Status:** accepted

**Decision:** The daemon is run manually from a terminal (`node daemon/dist/index.js`). No installer, no systemd unit, no launchd plist, no Windows service.

**Why:** Packaging is at least a week of per-platform work and adds nothing to the core value test. I'll remember to start the daemon. If I stop remembering, that's a signal to invest in packaging — and that signal only matters *after* phase 4.

---

## ADR-009 — Monorepo, no workspace tool initially

**Status:** accepted

**Decision:** `daemon/`, `web/`, and `shared/` live in one git repo but with independent `package.json` files. No pnpm workspaces or turborepo until we feel friction.

**Why:** Premature tooling. At single-user, single-developer scale, the friction of two `npm install` calls is negligible. Adding workspaces later is trivial. Removing them if we regret it is annoying.

---

## ADR-010 — Acceptance criteria are manual smoke tests, not automated tests for v1

**Status:** accepted

**Decision:** We do not write unit or integration tests for v1. Acceptance is a manual smoke test checklist per phase. Tests get added in phase 5+ if the tool survives the 2-week usage trial.

**Why:** The system's core behaviors (file tailing, relay round-trips, hook callbacks) are integration-heavy and hard to unit-test meaningfully. At single-user scale with a tight feedback loop, manual testing is faster. This is explicitly a bet — not best practice — and will be revisited if we hit bugs that automated tests would have caught.

---

---

## ADR-011 — Defer Vercel deployment until after Phase 3

**Status:** accepted

**Decision:** Story 1.4 (deploy web app to Vercel) is deferred. We do not deploy during Phase 1. Instead, we run the web app locally via `npm run dev` on the desktop, develop Phase 2 (auth) and Phase 3 (write path) against localhost, and deploy once at the end of Phase 3 when the product is actually useful (read + write + auth).

**Why:**
- A read-only viewer on a public URL is low value compared to waiting a few days for a real interactive tool.
- Deploying once means one round of env var setup, one round of Vercel-specific gotchas, one URL to share.
- The Phase 1 exit criterion ("open on phone on cellular") is relaxed to "open on phone on same wifi" for now. The cellular test moves to end of Phase 3.
- Accepts the tradeoff that if a Vercel-specific bug exists, we find it with a larger surface area. Mitigation: keep the web app simple and framework-stock so surprises are unlikely.

**Supersedes:** the deploy step in ROADMAP.md Phase 1. Story 1.4 is marked deferred, not deleted. It will be re-scheduled as Story 3.6 after the write path is green.

---

## ADR-012 — Email + password auth instead of magic link

**Status:** accepted (supersedes the magic-link choice in ADR-003's implied scope)

**Decision:** The web app uses Supabase email + password authentication. Magic link is not used.

**Why:** At single-user scale, the magic link flow adds noticeable friction every time the user signs out and back in (email round-trip, link click). Password auth is a one-click sign-in. Password storage is Supabase's responsibility, so the security tradeoff is minimal for a personal tool. If we later add multi-user or enterprise tiers, we can add SSO/SAML as a separate path without removing password auth.

**Implementation notes:**
- Account creation happens via the Supabase dashboard (Auth → Users → Add user) — no signup UI in the app for v1.
- The `auth/callback/route.ts` file created during the brief magic-link implementation has been removed.
- `middleware.ts` no longer treats `/auth/*` as a public path (no such routes exist).

---

## ADR-013 — OSS-first auth: account creation via Supabase dashboard, no in-app signup

**Status:** accepted

**Decision:** The Agent Mirror web app has sign-in only. User accounts are created through the Supabase dashboard ("Add user → Create new user") as a one-time setup step. Public signup is disabled at the Supabase project level.

**Why:**
- Agent Mirror is self-hosted OSS first. In self-hosted deployments (Sentry, PostHog, Mattermost, Grafana, Outline), account provisioning via an admin dashboard is the established norm. Users don't expect an in-app signup flow.
- Exposing public signup without strong protections (email verification, rate limiting, CAPTCHA, etc.) creates an abuse vector even if RLS isolates account data — random visitors can still pollute `auth.users`.
- A future SaaS tier is a *different* product surface, not an addition to the OSS app: it needs a marketing page, Stripe, pricing, possibly OAuth, onboarding, billing state. Building a tiny "signup form" today does not accelerate that and would be thrown away when the real SaaS product is designed.
- Working agreements forbid speculative scope. We stay OSS-only until Phase 4 + 2-week usage trial decides otherwise.

**What we keep open (no coupling decisions made):**
- `middleware.ts`, `supabase.ts`, `supabase-server.ts` contain all auth logic — swapping to a SaaS-style flow is a contained change.
- Schema already has `user_id` and RLS planned, so multi-user works the same in both OSS and hypothetical SaaS.
- Nothing in the daemon or viewer assumes single-user.

**What the user does instead of a signup form:**
- Follows `docs/SETUP.md` to configure Supabase and create their account via the dashboard.
- Disables public signups in the Supabase Auth settings so the account creation path is admin-only.

---

## ADR-014 — Daemon polls `pending_inputs` instead of using Supabase Realtime

**Status:** accepted

**Decision:** The daemon polls Supabase for new unconsumed `pending_inputs` rows every 1.5 seconds instead of subscribing via Supabase Realtime. The web app continues to use Realtime (it works fine in the browser).

**Why:**
- Empirically, the Supabase Realtime client in Node.js / Windows hits `TIMED_OUT` channel status when subscribing to RLS-protected tables, even after `realtime.setAuth(jwt)` is called. The JWT auth handshake works for HTTP requests (SELECTs are fine — backfill works) but the WebSocket join silently times out.
- We could keep digging — alternate WebSocket libs, custom transport, downgrading the SDK, etc. — but every minute spent on this is a minute not spent on the actual product.
- Polling at 1.5s is well within our latency budget. The real bottleneck is Claude Code's hook firing rate, which is per-tool-use and per-prompt, on the order of seconds anyway. The user will not notice the difference between 500ms and 1.5s of additional pickup latency.
- Polling is simpler code, easier to debug, has no handshake failures, and works identically across platforms. For a single-user daemon hitting Supabase a couple of times a second, the load is negligible (free tier covers it many orders of magnitude over).

**Implementation notes:**
- `InputSubscriber` becomes `InputPoller`. Same interface (`startSession`, `stop`).
- Polling cadence: 1.5 seconds. Configurable via `INPUT_POLL_INTERVAL_MS` env var.
- Backfill on `startSession` is unchanged — it's already a SELECT.
- The poller queries `where session_id = $1 and consumed_at is null and id not in (...seen)`. We track seen IDs locally to avoid re-enqueueing items already in the in-memory queue.
- The Realtime auth fix from earlier this phase (calling `realtime.setAuth`) is left in place for any future Realtime usage in the daemon — it's harmless and may be needed later.

**Tradeoffs accepted:**
- Slightly higher Supabase API call volume (~40 calls/minute instead of 0 for the input channel). Trivial.
- ~1.5s extra pickup latency from web → daemon. Trivial in context.
- If we ever need true sub-second daemon-side updates, we'll have to revisit Node Realtime — but that's a problem for SaaS scale, not for a personal tool.

---

## ADR-015 — Write path via VS Code extension + Terminal.sendText(), replacing hook-based approach

**Status:** accepted (supersedes ADR-007's hook-response write path)

**Decision:** Phone-originated messages are delivered to Claude Code via a VS Code extension that polls `pending_inputs` from Supabase and calls `terminal.sendText()` + `sendSequence("\r")` on the VS Code integrated terminal running `claude`. The hook-based write path (hook server on port 8787, Claude Code Stop hook config) is retired.

**Why:**
- The hook approach only works when Claude Code is actively running (Stop hook fires on response completion). When Claude Code is idle — the primary use case ("I'm away from my desk and the agent is waiting for input") — hooks never fire and queued messages sit forever.
- The VS Code `Terminal.sendText()` API writes directly to the terminal's stdin, which works whether Claude Code is idle or active. This solves the idle wake-up problem completely.
- Spike-tested and confirmed working on Windows 10 with Claude Code's TUI. Text is delivered and Enter is triggered via a 200ms-delayed `workbench.action.terminal.sendSequence` with `\r`.
- The extension is ~200 lines, reads auth from the daemon's existing `~/.agent-mirror/auth.json`, and requires no additional infrastructure.

**Trade-offs accepted:**
- User must run `claude` in a VS Code integrated terminal, not the Claude Code side panel. The terminal experience is slightly different (text-based TUI vs. rich panel UI). Code editing in VS Code is unaffected.
- The extension is a new component to maintain (previously the project was daemon + web only).
- `Terminal.sendText()` has no guaranteed delivery — if the terminal is closed or Claude Code crashes, the message is marked consumed but lost. Acceptable for v1.

**Components retired:**
- `daemon/src/hook-server.ts` — no longer needed.
- `.claude/settings.json` Stop hook config — removed.

*(New ADRs append below. Never delete a superseded one — mark it and keep the history.)*
