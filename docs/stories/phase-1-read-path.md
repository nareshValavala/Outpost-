# Phase 1 — Read path MVP

**Phase goal:** New messages from my live Claude Code session appear on a web page I can open from my phone, in real time. No auth, no write-back.

**Prerequisite:** Phase 0 complete, including the tailing spike.

---

## Story 1.1 — Supabase schema for sessions and messages

**Goal:** Create the database tables the daemon will write to and the web app will read from.

**Files I expect to create/change:**
- `supabase/migrations/0001_initial.sql`

**Schema:**
- `sessions` — `id uuid pk, user_id uuid (nullable until phase 2), cwd text, started_at timestamptz, last_seen_at timestamptz`
- `messages` — `id uuid pk, session_id uuid fk, role text check (user|assistant|tool), content text, created_at timestamptz, seq bigint` (seq is a per-session monotonic counter for ordering)
- Indexes on `messages(session_id, seq desc)` and `sessions(last_seen_at desc)`
- **No RLS yet** — that's phase 2. Document this limitation at the top of the migration file.

**Files I must NOT touch:**
- `daemon/*`, `web/*` — no code writes to this yet.

**Acceptance criteria:**
- [ ] Migration applies cleanly via Supabase CLI or dashboard SQL editor.
- [ ] Tables visible in Supabase dashboard with correct columns.
- [ ] A manual `insert` via the SQL editor succeeds.

---

## Story 1.2 — Daemon: minimum viable tail → publish

**Goal:** A real daemon package that does what the phase 0 spike did, but publishes each new message as a Supabase `insert` into `messages` instead of printing to stdout.

**Files I expect to create/change:**
- `daemon/src/index.ts` — entry point
- `daemon/src/session-watcher.ts` — file tailing (adapted from the spike)
- `daemon/src/relay-client.ts` — thin wrapper around `@supabase/supabase-js` exposing `publishMessage()` and `ensureSession()`
- `daemon/src/parse-jsonl.ts` — convert a raw JSONL line into a `Message` shape
- `daemon/package.json` — add `@supabase/supabase-js`, `chokidar`, `dotenv`
- `daemon/tsconfig.json` — compile to `dist/`

**Files I may delete:**
- `scripts/tail-session.ts` (the spike is now obsolete)
- `scripts/package.json`

**Files I must NOT touch:**
- `web/*`, `supabase/migrations/*`, `shared/types.ts` (unless a type is clearly missing — if so, stop and file a new story).

**Behavior:**
1. Load Supabase URL/key from `.env.local`.
2. On startup, `ensureSession()`: upsert a row into `sessions` with the current cwd and `started_at=now()`, capture its `id`.
3. Start the session watcher (same logic as the spike).
4. For every new JSONL line, parse it into a `Message`, assign the next `seq`, and call `publishMessage()`.
5. Log every publish to stdout: `[publish] seq=42 role=assistant len=1204`.

**Acceptance criteria:**
- [ ] `npm run build && node dist/index.js` starts the daemon.
- [ ] Triggering new Claude Code activity results in rows appearing in `messages` within 2 seconds.
- [ ] Row count matches the number of JSONL lines. No duplicates, no gaps in `seq`.
- [ ] Killing and restarting the daemon does not re-publish old messages (track the last-published `seq` in a local file `~/.agent-mirror/state.json`).

**Smoke test:** Start daemon. Run Claude Code for 5 messages. Check Supabase dashboard — should see 5 rows in `messages` with correct roles and content.

---

## Story 1.3 — Web app: bare-minimum live message viewer

**Goal:** A Next.js page that subscribes to the `messages` table and displays every row in order, newest at bottom, auto-scrolling.

**Files I expect to create/change:**
- `web/package.json` — Next.js 15, React, @supabase/supabase-js, Tailwind
- `web/tsconfig.json`, `web/next.config.ts`, `web/tailwind.config.ts`, `web/postcss.config.js`
- `web/src/app/layout.tsx`
- `web/src/app/page.tsx` — the entire app is this one page
- `web/src/lib/supabase.ts` — browser client
- `web/.env.example`, `web/.env.local`

**Files I must NOT touch:**
- `daemon/*`, `shared/*`, `supabase/*`

**Behavior:**
1. On load, query the most recent session from `sessions` (by `last_seen_at`).
2. Fetch the last 200 messages for that session (ordered by `seq asc`).
3. Subscribe to Realtime `INSERT` events on `messages` filtered by `session_id=eq.<id>`.
4. Append each new message to the list; auto-scroll to bottom.
5. Display each message as: `[role] content` in a plain div. No markdown, no syntax highlighting.

**Mobile-first requirements (non-negotiable — this is a phone app first):**
- Viewport meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- Layout designed at 375px width first. Desktop is a happy accident, not a target.
- Message list uses `100dvh` (dynamic viewport) so it plays nice with mobile browser chrome.
- Input box (added in phase 3) must stick above the on-screen keyboard on iOS Safari — use `env(safe-area-inset-bottom)` padding.
- All interactive elements ≥ 44px tap targets.
- No hover-only affordances. Everything must work with touch.
- Test in Chrome DevTools device emulation *and* on a real phone before marking done. Emulation lies about keyboards and safe areas.

**Acceptance criteria:**
- [ ] `npm run dev` serves the app at `localhost:3000`.
- [ ] Opening `localhost:3000` shows the last 200 messages of the latest session.
- [ ] With Claude Code running and daemon publishing, new messages appear in the browser within 2 seconds of Claude Code emitting them.
- [ ] Refreshing the page re-loads the last 200 messages (no state lost).

**Smoke test:** Run daemon, run Claude Code, open `localhost:3000` in a browser. Ask Claude Code a question. See both sides of the exchange appear in the browser.

---

## Story 1.4 — Deploy web app to Vercel

**Goal:** A public Vercel URL I can open from my phone on cellular.

**Manual steps:**
- Create Vercel project, link to `web/` directory of the repo.
- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Vercel env vars.
- Push to main → Vercel auto-deploys.

**Files I expect to create/change:**
- `web/vercel.json` only if needed for monorepo root-dir config.

**Files I must NOT touch:**
- `daemon/*`, `supabase/*`

**Acceptance criteria:**
- [ ] Vercel build succeeds.
- [ ] Opening the Vercel URL on a laptop shows the same page as `localhost:3000`.
- [ ] **Opening the Vercel URL on my phone on cellular shows live messages from my running Claude Code session.** This is the phase 1 exit criterion.

---

## Phase 1 exit checklist

- [ ] All four stories meet their acceptance criteria.
- [ ] I have personally opened the Vercel URL on my phone, on cellular, outside my house, and watched at least 10 messages stream in from my desktop.
- [ ] The daemon has run for at least 30 continuous minutes without crashing.
- [ ] `docs/stories/CURRENT.md` updated to point at phase 2 story 2.1.
- [ ] Any new decisions (tech swaps, schema changes, etc.) are recorded as ADRs in `DECISIONS.md`.
