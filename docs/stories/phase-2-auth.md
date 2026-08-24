# Phase 2 — Auth

**Phase goal:** Only I can see my session. The web app requires magic-link login. The daemon authenticates with a personal token. Row-level security prevents anyone else from ever seeing my data, even if they know the Supabase URL.

**Prerequisite:** Phase 1 complete.

**⚠ Story order reordered from original plan.** The original plan had 2.2 (RLS migration) before 2.3 and 2.4. That sequencing breaks the daemon and web app mid-phase because RLS locks out the still-un-authenticated clients. New order, verified to keep each prior story working at every step:

1. **Story 2.1** — Enable Supabase Auth in dashboard (done)
2. **Story 2.3** — Web app login + auth gate (data still readable via anon key; login is additive)
3. **Story 2.4** — Daemon personal access token auth (daemon now inserts as the authenticated user)
4. **Story 2.2** — RLS migration (safe to lock down once both sides already authenticate)

See [ADR-011](../DECISIONS.md) for the related decision about deferring the Vercel deploy.

---

## Story 2.1 — Enable Supabase Auth + magic link

**Goal:** Magic-link email auth is enabled on the Supabase project. I can request a link and log in to the dashboard's demo auth flow.

**Manual steps:**
- In Supabase dashboard: Auth → Providers → enable Email (magic link).
- Set the Site URL to the Vercel deployment URL.
- Add `localhost:3000` to redirect allow-list.

**Files I expect to create/change:**
- None (dashboard config only).
- `docs/SETUP.md` — new file documenting these manual steps so they're reproducible.

**Acceptance criteria:**
- [ ] Requesting a magic link from the Supabase dashboard's auth section delivers an email.
- [ ] Clicking the link results in an authenticated session.

---

## Story 2.2 — Add `user_id` to sessions and enable RLS

**Goal:** Every `sessions` row is owned by a user. `messages` inherit ownership via their `session_id`. Nobody can read or write rows they don't own.

**Files I expect to create/change:**
- `supabase/migrations/0002_auth_and_rls.sql`

**Migration contents:**
- Make `sessions.user_id` NOT NULL (first, delete any existing test rows since v1 is pre-users).
- Enable RLS on `sessions` and `messages`.
- Policy: `sessions` — `select/insert/update/delete` where `user_id = auth.uid()`.
- Policy: `messages` — `select/insert` where `session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())`.

**Files I must NOT touch:**
- `daemon/*`, `web/*` — those get updated in the next two stories.

**Acceptance criteria:**
- [ ] Migration applies cleanly.
- [ ] A manual `select * from messages` as the anon role returns zero rows.
- [ ] A manual `select` as an authenticated test user returns only their own rows.

---

## Story 2.3 — Web app: login page and auth gate

**Goal:** Opening the app when not logged in shows a login form. After clicking the magic link, the app shows the live session view. Logging out returns to the login page.

**Files I expect to create/change:**
- `web/src/app/login/page.tsx` — email input + "send link" button
- `web/src/app/auth/callback/route.ts` — magic link callback handler
- `web/src/lib/supabase-server.ts` — server-side client for route handlers
- `web/src/app/page.tsx` — add auth check; redirect to `/login` if no session
- `web/src/components/logout-button.tsx`

**Files I must NOT touch:**
- `daemon/*`, `supabase/*`

**Acceptance criteria:**
- [ ] Visiting `/` when logged out redirects to `/login`.
- [ ] Submitting email on `/login` sends a magic link.
- [ ] Clicking the link logs me in and lands me on `/`.
- [ ] The live message view still works after login.
- [ ] Logout button returns me to `/login`.
- [ ] Opening the app in an incognito window shows `/login`, not session data.

**Smoke test:** Go through login flow on phone. See live messages. Open incognito tab on laptop — see login page, not session.

---

## Story 2.4 — Daemon: personal access token auth

**Goal:** The daemon no longer uses the Supabase anon key. It uses a personal access token (a Supabase service role key scoped via a custom user, or a signed JWT generated via a one-time login script) so that its inserts are attributed to my `user_id`.

**Design options (pick one via a new ADR):**
- **Option A** — Daemon uses the service role key (bypasses RLS). Simpler. Risk: if the key leaks, the whole DB leaks.
- **Option B** — Daemon uses a long-lived user JWT obtained by logging in once with magic link via a bootstrap script. Safer. More code.

**Recommendation:** Option B. Write it up as an ADR before implementing.

**Files I expect to create/change:**
- `daemon/src/bootstrap-auth.ts` — interactive one-time command: `node dist/bootstrap-auth.js`, prompts for email, sends magic link, waits for user to paste the code from the email, exchanges for a refresh token, saves to `~/.agent-mirror/config.json` with `chmod 600`.
- `daemon/src/relay-client.ts` — load token from config, refresh as needed.
- `daemon/src/index.ts` — fail loudly on startup if no token configured.
- `docs/DECISIONS.md` — new ADR for the chosen auth approach.

**Files I must NOT touch:**
- `web/*`, `supabase/*`

**Acceptance criteria:**
- [ ] Running the daemon without `~/.agent-mirror/config.json` prints a clear error pointing at the bootstrap command.
- [ ] Running the bootstrap command successfully stores a token.
- [ ] Running the daemon publishes messages, and those messages appear in the web app **only** when I'm logged in as the same user.
- [ ] Logging in as a different test user shows zero messages.
- [ ] Token refresh works after 1 hour (Supabase default access token lifetime).

---

## Phase 2 exit checklist

- [ ] All four stories meet acceptance criteria.
- [ ] RLS is enabled and verified — an unauthenticated request returns zero rows.
- [ ] I can log in from my phone and see my session. An incognito tab cannot.
- [ ] Daemon runs with a stored token and publishes correctly-attributed messages.
- [ ] Auth approach is documented as an ADR.
- [ ] `docs/stories/CURRENT.md` updated to point at phase 3 story 3.1.
