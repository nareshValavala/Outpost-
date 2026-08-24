# Phase 0 — Foundations

**Phase goal:** Repo skeleton exists, Supabase project exists, and we have *proven* we can reliably tail a live Claude Code session file.

This phase is mostly setup and one high-risk spike. Zero user-visible output.

---

## Story 0.1 — Repo skeleton

**Goal:** Create the directory structure from `ARCHITECTURE.md` with empty placeholder files, `.gitignore`, and a top-level `README.md`.

**Files I expect to create:**
- `daemon/package.json` (empty scripts, TypeScript dep)
- `daemon/tsconfig.json`
- `daemon/src/.gitkeep`
- `daemon/README.md` (one paragraph describing what the daemon is)
- `web/README.md` (one paragraph — `web/` stays empty until phase 1 story 1.3)
- `shared/types.ts` (empty module, `export {}`)
- `supabase/.gitkeep`
- `.gitignore` (node_modules, .env, .env.local, dist, .next, .vercel)
- `README.md` at repo root

**Files I must NOT touch:**
- None yet — fresh repo.

**Acceptance criteria:**
- [ ] `git status` shows the new files tracked.
- [ ] `cd daemon && npm install` succeeds with no errors.
- [ ] Repo builds nothing yet, and that's correct.

**Smoke test:** `ls -la` of the repo matches the layout in ARCHITECTURE.md.

---

## Story 0.2 — Shared types initial set

**Goal:** Define the minimum TypeScript types that both daemon and web will use. Nothing more.

**Files I expect to create/change:**
- `shared/types.ts`

**Types to define (no more, no less):**
- `Message` — `{ id: string; session_id: string; role: 'user' | 'assistant' | 'tool'; content: string; created_at: string }`
- `SessionRef` — `{ id: string; user_id: string; cwd: string; started_at: string; last_seen_at: string }`
- `PendingInput` — `{ id: string; session_id: string; text: string; created_at: string; consumed_at: string | null }`

**Files I must NOT touch:**
- `daemon/*`, `web/*` — types are only defined here. Importers don't exist yet.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit shared/types.ts` succeeds.
- [ ] The three types are exported.
- [ ] No other types added "just in case."

---

## Story 0.3 — Supabase project bootstrap

**Goal:** A live Supabase project exists, credentials are saved locally, and an `.env.example` documents the required env vars.

**Manual steps (not code):**
- Create a new Supabase project via the Supabase dashboard.
- Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Paste them into `daemon/.env.local` and `web/.env.local` (both gitignored).

**Files I expect to create:**
- `daemon/.env.example` with the two keys as empty placeholders and a comment.
- `web/.env.example` with the two keys.

**Files I must NOT touch:**
- No schema migrations yet — that's story 1.1.

**Acceptance criteria:**
- [ ] Supabase dashboard shows a new project.
- [ ] `daemon/.env.local` and `web/.env.local` exist and are gitignored.
- [ ] `.env.example` files exist and are committed.

---

## Story 0.4 — THE SPIKE: prove we can tail a Claude Code session file

**This is the load-bearing story of phase 0. If this doesn't work, the project is not feasible and we stop.**

**Goal:** A 50-ish-line throwaway script that tails the currently-active Claude Code session JSONL and prints each new message to stdout within 1 second of Claude Code writing it.

**Files I expect to create:**
- `scripts/tail-session.ts` (throwaway — not part of the daemon, will be deleted in phase 1)
- `scripts/package.json` with `chokidar` and `tsx` as deps

**Behavior required:**
1. On startup, locate `~/.claude/projects/` and list the subdirectories.
2. For each subdirectory, find the most recently modified `.jsonl` file.
3. Pick the single globally most-recently-modified one as "active session."
4. Watch that file with chokidar. On every `change` event, read any lines appended since the last read and print them (one JSON object per line) to stdout.
5. Handle the case where the active session file changes (Claude Code starts a new session) — re-scan and switch.

**Files I must NOT touch:**
- `daemon/*`, `web/*`, `shared/*`, `supabase/*` — this is a pure spike.
- Anything under `~/.claude/` — **read-only**.

**Acceptance criteria:**
- [ ] Open two terminals. Run `tsx scripts/tail-session.ts` in terminal A.
- [ ] In terminal B, start Claude Code and have it answer a simple question.
- [ ] Terminal A prints the new JSONL lines within 1 second of Claude Code emitting them.
- [ ] Terminal A does not crash, does not print duplicate lines, and does not miss lines.
- [ ] Run for 10 minutes with intermittent Claude Code activity. No crashes, no leaks, no missing messages.

**If this story fails:** Stop. File findings in `docs/SPIKE-REPORT.md`. Do not proceed to phase 1 until we have a working tailing approach (even if it means using a different library, polling instead of watching, or something else entirely). The rest of the project assumes this works.

---

## Phase 0 exit checklist

Before starting phase 1, verify all of the following:

- [ ] Repo structure matches `ARCHITECTURE.md`.
- [ ] Shared types compile.
- [ ] Supabase project is live and credentials saved.
- [ ] Story 0.4 spike works reliably for 10+ minutes of continuous Claude Code activity.
- [ ] `docs/stories/CURRENT.md` has been created and points at phase 1 story 1.1.
- [ ] `docs/DECISIONS.md` is unchanged (no new ADRs needed in phase 0 — if one was, the phase is probably off-plan).
