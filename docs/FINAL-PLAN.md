# Agent Mirror — Final Plan

## Current state (2026-04-15)

Working end-to-end:
- **Read path**: Claude Code → JSONL → daemon → Supabase → web app (phone)
- **Write path**: phone → web app → Supabase → agent-mirror CLI (pty) → Claude Code
- **Approvals**: tool call details on web + contextual Yes/No/Allow-all buttons
- **Auth**: password login + RLS + daemon JWT
- **Session isolation**: watcher locks to spawned session, no cross-talk
- **Cleanup**: on-exit delete + heartbeat + 5-min stale cleanup on startup

Not yet deployed to Vercel (tomorrow).

---

## Phase A — Deploy (tomorrow)

### A.1 — Deploy web app to Vercel
- `cd web && npx vercel --prod`
- Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Get production URL

### A.2 — Update Supabase auth redirect URLs
- Dashboard → Auth → URL Configuration
- Add Vercel production URL to redirect allow-list
- Update Site URL to the Vercel URL

### A.3 — Test from phone on cellular
- Disable wifi on phone
- Open Vercel URL → login → see messages
- Send message → arrives in agent-mirror terminal
- Test approval flow over cellular
- Verify latency is acceptable (<3s each direction)

---

## Phase B — PWA (before native apps, ~1 hour)

### B.1 — Add PWA manifest
- `web/public/manifest.json` — app name, icons, theme color, display: standalone
- `web/public/icons/` — 192x192 and 512x512 PNG icons
- Link manifest in `layout.tsx`

### B.2 — Add service worker (offline shell)
- Cache the app shell so it loads instantly
- Show "connecting..." when offline instead of blank page
- Use `next-pwa` package or manual service worker

### B.3 — Test "Add to Home Screen"
- iOS Safari: Share → Add to Home Screen
- Android Chrome: Menu → Add to Home Screen
- App opens full-screen with icon, no browser chrome

---

## Phase C — Open source prep (~2-3 hours)

### C.1 — Code cleanup
- Remove `daemon/src/hook-server.ts` (dead code, replaced by extension/pty)
- Remove old `.claude/settings.json` hook config
- Clean up `daemon/src/index.ts` (old daemon entry point) — keep as fallback "daemon-only" mode or remove
- Remove `scripts/` directory (phase 0 spike, long obsolete)
- Audit all files for hardcoded URLs, keys, paths

### C.2 — README.md rewrite
- Hero section: what it does, 30-second demo GIF
- Architecture diagram (simplified from docs/ARCHITECTURE.md)
- Quick start: 5 steps from clone to running
- Supported agents: Claude Code (more coming)
- Screenshots: web app on phone, terminal with agent-mirror running
- Contributing section pointing to CONTRIBUTING.md
- License badge

### C.3 — New files
- `LICENSE` — MIT
- `CONTRIBUTING.md` — how to add agent adapters, code style, PR process
- `CHANGELOG.md` — initial release notes
- `.github/ISSUE_TEMPLATE/` — bug report + feature request templates

### C.4 — Git hygiene
- Squash development history into clean commits (optional — some prefer full history)
- Ensure no secrets in git history (`git log -p | grep -i "supabase\|password\|token"`)
- Create `main` branch, set as default
- Tag `v0.1.0`

### C.5 — Publish
- Create GitHub repo: `github.com/<your-username>/agent-mirror`
- Push
- Create a release with v0.1.0 tag
- Post on: Hacker News, dev Twitter/X, r/programming, Claude Discord

---

## Phase D — Native apps (only after PWA proves insufficient)

### D.0 — Decision gate
Use the PWA for at least 2 weeks. Track in FEEDBACK.md:
- What can't the PWA do that you need?
- Do iOS push notification limitations matter for your workflow?
- Does "Add to Home Screen" feel native enough?

If PWA is sufficient → skip native apps entirely. Seriously.

### D.1 — If native is needed: React Native
- Single codebase for iOS + Android
- Reuse all web logic (Supabase client, auth, types)
- New UI layer using React Native components (not web HTML)
- `apps/mobile/` directory in the monorepo

### D.2 — Key native features (things PWA can't do well)
- Push notifications for approval requests (via Supabase Edge Functions → FCM/APNs)
- Background refresh
- Biometric auth (Face ID / fingerprint)
- Haptic feedback on approval buttons

### D.3 — App Store logistics
- Apple Developer Program: $99/yr
- Google Play Developer: $25 one-time
- App review process: 1-3 days for iOS, hours for Android
- Need privacy policy page (even for OSS)

---

## Phase E — Multi-agent support (community-driven)

### E.1 — Adapter interface
- Define a standard `AgentAdapter` interface:
  ```typescript
  interface AgentAdapter {
    name: string;
    spawn(cwd: string): PtyLike;
    detectSessionFile(): Promise<string | null>;
    parseSessionLine(line: string): ParsedEntry | null;
  }
  ```
- Current Claude Code logic becomes `adapters/claude-code.ts`
- New adapters plug in without touching core code

### E.2 — Community adapters (contributions welcome)
- Gemini CLI
- Codex CLI
- Aider
- Cline
- Continue
- Cursor (if they ever expose session data)

### E.3 — Agent selector in web UI
- Dropdown or config to select which agent adapter to use
- Different adapters may have different approval UX

---

## Phase F — Possible commercialization (only if community traction proves demand)

### F.1 — Hosted tier
- We run the Supabase + Vercel infra
- User just installs `agent-mirror` CLI and signs up on our web app
- Free tier: 1 agent, 1 device
- Pro tier ($10-15/mo): unlimited agents, multi-device, push notifications

### F.2 — Team tier ($20-40/seat/mo)
- Shared sessions (pair programming from mobile)
- Audit log (who approved what tool call when)
- SSO/SAML
- Admin controls (which tools can be approved from mobile, which require desktop)

### F.3 — Enterprise (custom pricing)
- Self-hosted relay (BYO Supabase / BYO database)
- On-prem deployment
- Compliance features (E2E encryption, field-level redaction)
- SLA

---

## Priority order

1. **Deploy to Vercel** (tomorrow) — makes it usable from anywhere
2. **PWA** (this week) — makes it feel like a native app
3. **Open source** (this week) — gets it in front of people
4. **Use for 2 weeks** — collect FEEDBACK.md
5. **Decide on native apps** (based on PWA feedback)
6. **Multi-agent adapters** (community-driven after open source)
7. **Commercialization** (only if traction warrants it)

Do NOT skip the 2-week usage trial. Everything after step 3 depends on real-world feedback.
