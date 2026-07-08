# Deferred to M8 (or a pre-deploy follow-up)

Running list of items intentionally postponed. Anything deferred in later milestones
must be appended here so nothing is silently dropped.

## ✅ Deployed (M8 pilot) — live URLs
- API (Worker): https://vertex-support-api.chaco22512.workers.dev
- Chat (Pages): https://vertex-support-chat.pages.dev
- Admin (Pages): https://vertex-support-admin.pages.dev
- KV `RATE_LIMIT` created; id committed in `apps/api/wrangler.toml`.
- 6 Worker secrets set from `.env`. Cron `0 * * * *` registered in production.
- Verified: `/health` 200, Pages 200, fonts 200, production admin sign-in →
  `/api/admin/me` 200 (role=admin) with correct CORS.

Remaining before general-customer launch: real-device acceptance (9/13/14/18),
human UAT (24), screenshots + PDFs, Resend domain, optional custom domains.

## Fonts (from M4, spec §5.2 / acceptance criterion 14)
- [x] Self-host **Noto Sans Devanagari** (devanagari subset, 400) and **Noto Sans
      Vietnamese** (400/600) woff2 under `apps/chat/public/fonts/` and `apps/admin`.
- [x] Wire self-hosted `@font-face` (`font-display: swap`, unicode-range) via
      bundled `src/styles/fonts.css`. English/Indonesian/Tagalog use system-ui.
- [ ] **Real-device check of acceptance criterion 14**: Nepali (Devanagari) and
      Vietnamese (diacritics) render correctly on the deployed chat AND admin, on a
      real phone. (Wiring + fonts confirmed served in production; visual confirm pending.)

## Infrastructure (to be filled as milestones progress)
- [x] Create Cloudflare **KV namespace** for rate limiting; id committed in
      `apps/api/wrangler.toml` (from M3).
- [x] Set Worker **secrets** from `.env` (SUPABASE_*, GEMINI_API_KEY,
      SLACK_WEBHOOK_URL, RESEND_API_KEY); `.dev.vars` holds local dev values.

## Documentation (from M7, spec §11)
- [ ] **Capture the screenshots** marked `> 📷 [SCREENSHOT — …]` in
      `docs/cs-staff-rulebook.md` and `docs/test-guide.md` (each placeholder states
      exactly which screen/state to capture) and place them inline.
- [ ] **Generate the PDFs** `docs/cs-staff-rulebook.pdf` and `docs/test-guide.pdf`
      once screenshots are in (PDF is a §11 deliverable; only meaningful after images).
- [ ] Build the actual onboarding slides from `docs/training-deck-outline.md`.
- [ ] **Acceptance criterion 24 (human UAT)**: one non-engineer staff member, using
      only the Rulebook, completes (a) a reply to a test escalation and (b) one fee
      change in Knowledge. Record sign-off in the Test Guide §8 table.

## Notifications (from M6, spec §8)
- [ ] **Email sender domain**: `apps/api/src/lib/email.ts` uses
      `Vertex Support <onboarding@resend.dev>` (test-only; delivers to the Resend
      account owner). Verify a Vertex domain in Resend and set the real `from`.
- [ ] **Email logo URL**: `notifyStaffReply` builds `${ADMIN_BASE_URL}/logo-horizontal.webp`.
      On localhost this won't load in mail clients; confirm it resolves once the
      admin app is deployed (or host the logo on a public CDN/asset URL).
- [ ] **Cron**: `[triggers] crons = ["0 * * * *"]` is set in wrangler.toml. Confirm
      the hourly reminder actually fires on the deployed Worker (Miniflare does not
      run crons locally). Reminder logic is unit-tested (`reminders.test.ts`).
- [ ] **Slack `@channel`**: unassigned escalations post `@channel`; confirm the
      Slack app/webhook has permission to notify the channel, and that assignee
      `slack_member_id` values are real member IDs for `<@…>` mentions.
- [ ] **Criterion 13 (real-device)**: from the Slack notification link, an already
      logged-in staff reaches reply-send within 3 clicks (deep link → /inbox/:id).
