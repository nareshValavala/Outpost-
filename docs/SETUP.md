# Agent Mirror — Setup Guide

One-time setup steps for a fresh Agent Mirror install. This replaces the "signup in the app" flow — see [ADR-013](DECISIONS.md) for why.

## Prerequisites

- Node.js 20+
- A Supabase account (free tier is fine)
- Claude Code installed and used regularly on the machine you're setting this up on

## Step 1 — Create a Supabase project

1. https://supabase.com/dashboard
2. **New project** → name it `agent-mirror` (or anything) → region close to you → strong DB password (you won't need to type it often)
3. Wait ~1 minute for provisioning
4. **Project Settings → API** → copy:
   - `Project URL`
   - `anon public` key

## Step 2 — Fill in environment variables

Copy the template files to `.env.local` and paste in your values:

```
cp daemon/.env.example daemon/.env.local
cp web/.env.example web/.env.local
```

Edit `daemon/.env.local`:
```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
```

Edit `web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

Both files are gitignored.

## Step 3 — Apply the database migrations

In the Supabase dashboard, **SQL Editor → New query**. Paste the contents of each migration in order and run them:

1. `supabase/migrations/0001_initial.sql` — creates `sessions` and `messages` tables.
2. (future migrations will be applied in order as they're added)

## Step 4 — Create your account

In the Supabase dashboard, **Auth → Users → Add user → Create new user**:

- Email: your email address
- Password: pick a strong one
- **Auto Confirm User:** ✅ (checkbox) — skips email verification

Click **Create user**. That's your account.

## Step 5 — Disable public signup

Still in the dashboard, **Auth → Providers → Email**:

- **Allow new users to sign up:** ❌ (toggle off)

Reason: the app has no signup UI, but Supabase's default is to allow anonymous signups via the JS SDK. Turning this off means your URL can never be used to create an account, even by accident.

Click **Save**.

## Step 6 — Install and run

Install dependencies:

```
cd daemon && npm install
cd ../web && npm install
```

Run the daemon (in one terminal):

```
cd daemon
npm start
```

Run the web app (in a second terminal):

```
cd web
npm run dev
```

Open http://localhost:3000 in your browser. You'll be redirected to `/login`. Sign in with the email + password from step 4.

If everything works, you'll see your live Claude Code messages appearing as you interact with Claude Code.

## Step 7 — Verify phone access (optional, same wifi)

Find your machine's LAN IP. Next.js prints it at startup as "Network: http://192.168.x.x:3000". Open that URL on your phone (same wifi) and log in with the same credentials.

## Troubleshooting

**"Missing NEXT_PUBLIC_SUPABASE_URL" on web startup**
→ Restart `npm run dev` after editing `web/.env.local`. Next.js only reads env vars at startup.

**"Invalid login credentials" in the login form**
→ Double-check that "Auto Confirm User" was ticked when you created the user in step 4. If not, delete the user and recreate with it ticked.

**Daemon publishes nothing**
→ Check that Claude Code is actually writing to `~/.claude/projects/<dir>/*.jsonl`. The daemon logs its current session file on startup.

**"RLS policy violation" errors (after Phase 2.2 lands)**
→ The daemon needs to be authenticated with your user credentials, not the anon key. Re-run the daemon bootstrap command (to be added in Story 2.4).
