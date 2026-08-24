# Agent Mirror — Daemon

Local background process that tails Claude Code session files and relays new messages to the Supabase cloud relay. Also runs a local-only HTTP server that Claude Code hooks call back into (phase 3+) to deliver phone-originated messages as user input.

Runs as a plain `node` process. No installer, no service wrapper. See [ADR-008](../docs/DECISIONS.md).

Not implemented yet — this is phase 0. See [`docs/stories/phase-0-foundations.md`](../docs/stories/phase-0-foundations.md).
