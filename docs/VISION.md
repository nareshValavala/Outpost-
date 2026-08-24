# Agent Mirror — Vision

## One-line

A local daemon that streams your AI coding agent's session to a web page you can open on your phone, and lets you type back.

## Who it's for (today)

One user: me. This is a personal tool first. If it works for me, we broaden later.

## The problem, concretely

I run Claude Code in VS Code. When I step away — driving, errands, lunch — the agent is either mid-run (and I can't see what it's doing) or waiting on an approval (and it's blocked until I'm back). Hours of potential work are lost per week.

## The solution, scoped

A background process on my machine that:

1. Watches the active Claude Code session on disk.
2. Pushes new messages to a small cloud relay.
3. Serves them to a mobile web page I can open from anywhere.
4. Accepts text I type on the phone and feeds it back into the live session.

That's the whole product.

## Non-goals (explicit)

These are things Agent Mirror is **not** doing, and pushing back is required if scope creeps toward them:

- **Not** a VS Code extension. The daemon runs standalone.
- **Not** a chat-window scraper. We use on-disk session files and official hooks only.
- **Not** multi-agent at MVP. Claude Code only until it works end-to-end.
- **Not** multi-user. Single user, single machine, single session.
- **Not** a hosted SaaS. Self-hosted relay on a free tier for now.
- **Not** a governance / audit / compliance product. That's a future pivot, not today.
- **Not** a native mobile app. Mobile web only.
- **Not** doing prompt redaction, E2E encryption, or enterprise features.
- **Not** rewriting or hosting the agent itself. We observe, we relay. That's it.

## Success criteria for v1

I can, from my phone, outside my house:

1. See the last N messages of my active Claude Code session within 2 seconds of them being written locally.
2. Type a message and have Claude Code receive it as user input within 5 seconds.
3. Trust that only I can see/send to my session (basic auth).
4. Leave the daemon running for a full workday without it crashing or desyncing.

If these four things work, v1 is done. Everything else is v2.

## What "good enough" looks like

- Ugly UI is fine.
- No notifications is fine.
- Losing a message on a dropped connection is fine if it recovers on reconnect.
- One session at a time is fine.
- Manual start/stop of the daemon is fine.

Ship the ugly version. Use it for a week. Let real usage dictate v2.
