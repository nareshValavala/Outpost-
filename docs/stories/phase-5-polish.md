# Phase 5 — Polish (post-MVP)

**Phase goal:** Small quality-of-life improvements after the 2-week real-usage trial from Phase 4. This phase only starts if the tool has survived the trial and is worth investing in further.

**Prerequisite:** Phase 4 complete, tool used for at least 2 weeks, `docs/FEEDBACK.md` reviewed.

---

## Story 5.1 — UI-001: chat-bubble layout

See [BACKLOG.md → UI-001](../BACKLOG.md) for full context.

**Goal:** Re-style the message list so user messages are right-aligned and assistant messages are left-aligned, with distinct bubble colors.

**Files I expect to change:**
- `web/src/app/page.tsx`

**Files I must NOT touch:**
- Any daemon file.
- Any supabase migration.
- Any auth / middleware file.

**Acceptance criteria:**
- [ ] User messages render right-aligned with a blue-ish bubble, max-width ~80%.
- [ ] Assistant messages render left-aligned with a neutral bubble, max-width ~90%.
- [ ] Tool messages render muted / small, left-aligned.
- [ ] The existing `role · #seq` badge is still visible (for debugging).
- [ ] Auto-scroll on new message still works.
- [ ] Layout still looks correct on a 375px-wide phone viewport.
- [ ] Layout still looks correct on desktop width.

**Not in scope:**
- Markdown rendering.
- Syntax highlighting.
- Avatars / per-message timestamps.

**Estimated cost:** ~30 minutes.
