# Agent Mirror — Mindmap

A flat tree view of everything the product touches. If something isn't on this mindmap, it isn't in v1.

```
Agent Mirror
│
├── WHY
│   ├── I step away from my desk and lose hours of agent time
│   ├── Agents block on approvals I can't see from anywhere else
│   └── Existing tools (RDP, VPN) are overkill and expose my machine
│
├── WHAT (v1)
│   ├── Desktop daemon
│   │   ├── Tails Claude Code session JSONL
│   │   ├── Runs local hook HTTP server (127.0.0.1 only)
│   │   ├── Holds a WebSocket to the cloud relay
│   │   ├── Queues phone-originated messages
│   │   └── Injects queued messages via hook callback
│   │
│   ├── Cloud relay (Supabase)
│   │   ├── Auth (magic link)
│   │   ├── Postgres tables
│   │   │   ├── sessions       ← one row per active session
│   │   │   ├── messages       ← ring buffer, newest 200
│   │   │   └── pending_inputs ← phone → daemon queue
│   │   ├── Row-level security (user can only see their own rows)
│   │   └── Realtime broadcast channels
│   │
│   └── Mobile web app
│       ├── Login (magic link)
│       ├── Live message view (subscribes to Realtime)
│       ├── Text input + send button
│       └── Connection status indicator
│
├── WHAT NOT (explicit non-goals)
│   ├── Not a VS Code extension
│   ├── Not a chat-window scraper
│   ├── Not multi-agent (Claude Code only for v1)
│   ├── Not multi-user
│   ├── Not a hosted SaaS product
│   ├── Not a native mobile app
│   ├── Not governance / audit / compliance
│   ├── No prompt redaction or E2E encryption
│   ├── No push notifications
│   └── No markdown or syntax highlighting
│
├── HOW (tech stack)
│   ├── Daemon: Node.js 20+ with TypeScript
│   ├── File watching: chokidar
│   ├── Local hook server: Node http module (no framework)
│   ├── Relay client: @supabase/supabase-js
│   ├── Relay: Supabase free tier
│   ├── Web app: Next.js 15 + React + Tailwind
│   ├── Hosting: Vercel free tier
│   └── Shared types: TypeScript files imported from both daemon and web
│
├── DATA FLOW
│   ├── Read path: Claude Code → JSONL → daemon → Supabase → phone
│   └── Write path: phone → Supabase → daemon → hook response → Claude Code
│
├── SECURITY MODEL (v1)
│   ├── Outbound-only from desktop
│   ├── TLS for all relay traffic
│   ├── Magic-link auth on phone
│   ├── Row-level security in Postgres
│   ├── Daemon auth token stored in ~/.agent-mirror/config.json (chmod 600)
│   └── Hook server binds to 127.0.0.1, never 0.0.0.0
│
├── FAILURE HANDLING (v1 — minimal)
│   ├── Daemon crash → manual restart
│   ├── Relay disconnect → daemon retries with backoff
│   ├── Phone offline → localStorage queue
│   └── Message lost → ring buffer resync on reconnect
│
├── FUTURE (v2+, do NOT build now)
│   ├── Multi-agent adapters (Gemini CLI, Codex CLI, Aider)
│   ├── Native iOS / Android apps
│   ├── Push notifications for approval requests
│   ├── Autostart / service wrapper (launchd, systemd, Windows service)
│   ├── Packaged installer
│   ├── Multi-session / multi-device
│   ├── Team features (shared sessions, audit log)
│   ├── Self-hosted relay option
│   └── Possible commercialization (OSS + hosted + team tier)
│
└── DISCIPLINE (see WORKING-AGREEMENTS.md)
    ├── One story in flight at a time
    ├── No refactors bundled with features
    ├── Every story has acceptance criteria
    ├── Manual smoke test before marking a story done
    └── Commit after every story, not mid-story
```
