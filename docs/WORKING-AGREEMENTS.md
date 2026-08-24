

# Working Agreements

The point of this file is to prevent the failure mode of "you fixed X and broke Y." Both the human and Claude agree to these rules before any code is written.

## The golden rule

**A story is not done until every previously-done story still works.** No exceptions. "I'll fix it in the next story" is not allowed.

## Story discipline

1. **One story in flight at a time.** The current story is tracked in `docs/stories/CURRENT.md` (created at the start of phase 1). If it isn't in that file, we aren't working on it.
2. **Every story has explicit acceptance criteria** written *before* code starts. If we discover the criteria are wrong mid-story, we stop, update the story file, and get re-alignment.
3. **Stories don't grow.** If mid-implementation we realize a story needs something we didn't plan for, we either:
   - Cut the "something" from the current story and file it as a new story, or
   - Stop, update the story, and explicitly acknowledge the scope change.
   We never silently expand a story.
4. **No bundled refactors.** If code cleanup is tempting mid-story, write the temptation in a `docs/REFACTOR-BACKLOG.md` file and move on. Refactors are their own stories.

## Change discipline

5. **Touch only what the current story requires.** If a file isn't in the story's "files I expect to change" list and you're about to edit it, stop and ask: is this really required?
6. **No drive-by fixes.** If you notice an unrelated bug, file it in `docs/BUGS.md`. Do not fix it in the current story.
7. **No speculative abstractions.** Don't build a generic adapter interface "in case we add Gemini later." We add the interface when we add the second adapter.
8. **No hypothetical error handling.** Only handle errors that can actually happen given the current code paths. At v1, crashing loudly is better than silently catching and continuing.

## Regression discipline

9. **Manual smoke test after every story.** Each phase has a smoke test checklist. Before marking a story done, run the checklist for every *prior* phase as well. If any step fails, the story isn't done.
10. **Commit only on green.** A commit only lands when the smoke test passes. No "WIP" commits on main.
11. **Commits describe the story, not the code.** Commit message format: `phase-X story-Y: <story title>`. The diff explains the how; the message explains the what.

## Scope discipline

12. **The non-goals in VISION.md are load-bearing.** If a task starts drifting toward a non-goal, stop. Do not build it. Update VISION.md only if we're making a real, considered pivot — not because we got excited.
13. **No second agent before phase 4 is done.** Claude Code only. No "while we're here, let me add Gemini support."
14. **No premature UI polish.** Ugly is fine. Tailwind + default fonts + no animations is fine. Polish is a phase 5+ decision.

## Decision discipline

15. **Every non-trivial technical choice gets an ADR** entry in `DECISIONS.md`. If we can't point to an ADR, we haven't decided — we've assumed.
16. **Reversing an ADR is allowed, but noisily.** Add a new ADR that supersedes the old one. Never silently change an old decision.

## When in doubt

If unsure whether something fits a story, the default answer is **"file it for later, not now."** The cost of deferring a good idea is small. The cost of scope creep is a broken project.

## How Claude should behave given these rules

- Before writing any code in a story, restate the story's acceptance criteria and list the files expected to change.
- If the list needs to grow, stop and say so before editing.
- After the code is written, run through the smoke-test checklist out loud (even if manually).
- Never "tidy up" files that aren't on the list.
- Never bundle a refactor and a feature.
- If the human asks for something that violates these rules, push back once, then defer to them — but note the exception in `DECISIONS.md`.
