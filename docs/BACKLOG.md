# Backlog

Things we've decided not to build *yet*. Each item has enough context that future-us can pick it up without re-deriving the motivation.

Items in this file are **not** in any current phase. They get pulled into a phase only when explicitly scheduled via a story file. Writing something here is a way to acknowledge a good idea without derailing current work.

---

## UI-001 — Chat-bubble layout (user right, assistant left)

**Proposed:** 2026-04-11

**What:** Re-style the message list to look like a standard chat app: user messages right-aligned with one bubble color, assistant messages left-aligned with a different bubble color. Currently both are shown as uniform cards stacked top-to-bottom.

**Why:** Much faster visual scanning. At a glance you can tell "I said that, it said this" without reading the role label. Matches the mental model users already have from iMessage / WhatsApp / ChatGPT / Claude web.

**Scope:**
- Update `web/src/app/page.tsx` message rendering.
- User messages: right-aligned, blue bubble, max-width ~80%.
- Assistant messages: left-aligned, dark-neutral bubble, max-width ~90% (thinking/tool blocks are long).
- Tool messages: smaller, muted, left-aligned, italic.
- Keep the small role + seq badge for debugging.

**Not in scope:**
- Avatars.
- Markdown rendering.
- Syntax highlighting in code blocks.
- Timestamps per message (the whole thing is a stream of one conversation).

**Prerequisite:** none — can be done any time after Phase 2.

**Estimated cost:** ~30 minutes.

**Priority:** low. Cosmetic. Current layout is functional.
