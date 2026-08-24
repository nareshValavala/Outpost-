# Agent Mirror — Architecture

## Shape at a glance

```
  ┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
  │    Your Desktop     │         │      Cloud Relay    │         │       Phone         │
  │                     │         │                     │         │                     │
  │  ┌───────────────┐  │         │  ┌───────────────┐  │         │  ┌───────────────┐  │
  │  │ Claude Code   │  │         │  │  Supabase     │  │         │  │  Mobile Web   │  │
  │  │ (runs as-is)  │  │         │  │  Realtime +   │  │         │  │  (Next.js)    │  │
  │  └───────┬───────┘  │         │  │  Postgres +   │  │         │  └───────┬───────┘  │
  │          │ writes   │         │  │  Auth         │  │         │          │          │
  │          │ session  │         │  └───────┬───────┘  │         │          │          │
  │          │ JSONL    │         │          │          │         │          │          │
  │          ▼          │         │          │          │         │          │          │
  │  ┌───────────────┐  │  WSS    │          │          │  HTTPS  │          │          │
  │  │   Daemon      │◄─┼─────────┼──────────┤          ├─────────┼──────────┤          │
  │  │  (Node.js)    │──┼────────►│          │          │◄────────┼──────────┘          │
  │  │               │  │         │          │          │         │                     │
  │  │  - tails JSONL│  │         │          │          │         │                     │
  │  │  - hook server│  │         │          │          │         │                     │
  │  │  - relay      │  │         │          │          │         │                     │
  │  │    client     │  │         │          │          │         │                     │
  │  └───────────────┘  │         │          │          │         │                     │
  │          ▲          │         │          │          │         │                     │
  │          │ hook     │         │          │          │         │                     │
  │          │ callback │         │          │          │         │                     │
  │  ┌───────┴───────┐  │         │          │          │         │                     │
  │  │ Claude Code   │  │         │          │          │         │                     │
  │  │ hooks         │  │         │          │          │         │                     │
  │  └───────────────┘  │         │          │          │         │                     │
  └─────────────────────┘         └─────────────────────┘         └─────────────────────┘
```

No inbound ports to the desktop. All desktop→cloud traffic is outbound WSS. Phone talks to the cloud only.

## The three components

### 1. Daemon (desktop-side)

A small Node.js/TypeScript process that runs in the background on the user's machine.

**Responsibilities:**
- Watch the Claude Code session directory (`~/.claude/projects/<encoded-cwd>/*.jsonl`).
- Identify the *active* session file (most recently modified).
- Tail new lines as they're written, parse each JSONL entry, and publish to the relay.
- Run a local HTTP server (localhost only) that Claude Code hooks call when events fire.
- Maintain a long-lived WebSocket to the relay for bidirectional messages.
- Receive "user wants to send this text" messages from the relay, buffer them, and inject via hook callback or stdin.

**What it deliberately does not do:**
- Parse or render markdown.
- Modify session files.
- Call the Claude API itself.
- Know anything about multiple agents (Claude Code only for v1).

### 2. Relay (cloud-side)

A minimal cloud service. Start with **Supabase free tier** — it gives us Auth, Postgres, and Realtime channels in one package, so we write almost no server code.

**Responsibilities:**
- Authenticate the user (magic link via Supabase Auth).
- Hold a Postgres row per active session with the last N messages (ring buffer, say 200).
- Broadcast incoming messages from the daemon to subscribed web clients via Realtime.
- Accept phone-originated messages and broadcast them to the daemon's channel.
- Enforce row-level security so only the authenticated user can read/write their rows.

**What we do not build:**
- A custom WebSocket server.
- A custom auth system.
- Push notifications (v2+).

### 3. Mobile web app

A static Next.js site deployed to Vercel free tier.

**Responsibilities:**
- Magic-link login.
- Subscribe to the user's session channel.
- Render the message stream (last 200 messages, newest at bottom).
- Text input box + send button.
- Show connection state (connected / reconnecting / offline).

**Not in scope for v1:**
- Fancy markdown rendering.
- Code syntax highlighting.
- Multiple sessions.
- History scroll beyond the ring buffer.

## Data flow, by path

### Read path (desktop → phone)

1. Claude Code writes a new line to `<session>.jsonl`.
2. Daemon's file watcher fires, reads the new line, parses it.
3. Daemon emits a `message.new` event over its WebSocket to the relay.
4. Relay inserts into `messages` table (which triggers Realtime broadcast) and trims the ring buffer.
5. Subscribed phone client receives the broadcast and appends to the view.

**Target latency: < 2 seconds end-to-end.**

### Write path (phone → desktop)

1. User types "please use snake_case instead" and taps send.
2. Phone POSTs to Supabase (insert into `pending_inputs` table).
3. Realtime broadcasts the row to the daemon's subscription.
4. Daemon stores the message in an in-memory queue.
5. When Claude Code next fires a hook (`Notification`, `Stop`, or `PreToolUse`) at the local daemon HTTP server, the daemon returns the queued message as the hook's response, which Claude Code injects into the conversation.
6. (Fallback for v1: if no hook fires within N seconds, the message stays queued until one does. Document this limitation clearly.)

**Target latency: < 5 seconds end-to-end when a hook is active.**

## Tech choices (proposed, not final — see DECISIONS.md)

| Layer | Choice | Why |
|---|---|---|
| Daemon language | Node.js + TypeScript | Same types as web, fast to iterate, chokidar for file watching is bulletproof |
| Daemon runtime | Plain `node` process, no packaging | Run from a terminal for v1. Packaging (installer, autostart) is v2 |
| Relay | Supabase (hosted, free tier) | Auth + Postgres + Realtime + RLS, all solved |
| Web app | Next.js 15 on Vercel free tier | Trivial deploy, fine for static + realtime client |
| Transport | Supabase Realtime (WebSocket) | Already included; no custom server |
| Auth | Supabase magic link | One email, zero password management |

**None of these are locked in.** Each is an ADR in DECISIONS.md and can be revisited if we hit a wall.

## Repo layout

```
agent-mirror/
├── docs/                         ← you are here
│   ├── VISION.md
│   ├── ARCHITECTURE.md
│   ├── MINDMAP.md
│   ├── ROADMAP.md
│   ├── WORKING-AGREEMENTS.md
│   ├── DECISIONS.md
│   └── stories/
│       ├── phase-0-foundations.md
│       ├── phase-1-read-path.md
│       ├── phase-2-auth.md
│       ├── phase-3-write-path.md
│       └── phase-4-reliability.md
├── daemon/                       ← desktop process (phase 1+)
│   ├── src/
│   ├── package.json
│   └── README.md
├── web/                          ← Next.js app (phase 1+)
│   ├── src/
│   ├── package.json
│   └── README.md
├── shared/                       ← shared TS types
│   └── types.ts
├── supabase/                     ← schema, RLS policies, migrations
│   └── migrations/
└── README.md
```

Monorepo, no workspace tool at first. Add pnpm workspaces only if the shared types friction is real.

## Failure modes we accept for v1

- Daemon crash → user restarts it manually. No autostart, no supervisor.
- Relay down → phone shows "disconnected", daemon keeps buffering locally in memory (lost on crash — acceptable).
- Phone offline → user's typed message stays in phone localStorage until reconnect.
- Message lost in transit → no retry logic. Reconnect will pull the current ring buffer.
- Multiple Claude Code sessions open → daemon picks the most recently modified. Documented, not fixed.

## Failure modes we do not accept

- The daemon writing to Claude Code's session files. **Read-only.**
- The daemon crashing Claude Code.
- Leaking session contents to anyone but the authenticated user.
- The relay storing more than the ring buffer (no permanent history for v1).
