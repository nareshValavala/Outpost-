# Agent Mirror

A local daemon that streams your AI coding agent's session to a web page you can open on your phone, and lets you type back.

**Status:** planning only. No code yet. All planning artifacts live in [docs/](docs/).

## Start here (read in order)

1. [docs/VISION.md](docs/VISION.md) — what this is, what it isn't, success criteria
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, data flow, tech choices
3. [docs/MINDMAP.md](docs/MINDMAP.md) — the whole system on one page
4. [docs/ROADMAP.md](docs/ROADMAP.md) — five phases, each with a single testable outcome
5. [docs/WORKING-AGREEMENTS.md](docs/WORKING-AGREEMENTS.md) — discipline rules (read this twice)
6. [docs/DECISIONS.md](docs/DECISIONS.md) — architecture decision records
7. [docs/stories/](docs/stories/) — the actual work, broken down by phase

## The TL;DR

- **Desktop:** small Node.js daemon that tails Claude Code's session files and holds a WebSocket to a cloud relay.
- **Cloud:** Supabase (free tier) for auth + Postgres + Realtime.
- **Phone:** Next.js web app on Vercel (free tier).
- **v1 target user:** me, and only me.
- **v1 target agent:** Claude Code only.
- **v1 budget:** under $500, maybe 6–8 weeks part-time.

## Before touching code

Every code change must belong to a numbered story in [docs/stories/](docs/stories/). No drive-by edits. See [WORKING-AGREEMENTS.md](docs/WORKING-AGREEMENTS.md) for the full discipline.

## Current phase

Not started. Next step: read through all the docs above, poke holes, then begin [Phase 0](docs/stories/phase-0-foundations.md).
