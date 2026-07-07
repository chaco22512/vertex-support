# Deferred to M8 (or a pre-deploy follow-up)

Running list of items intentionally postponed. Anything deferred in later milestones
must be appended here so nothing is silently dropped.

## Fonts (from M4, spec §5.2 / acceptance criterion 14)
- [ ] Obtain **Noto Sans Devanagari** subset **woff2** (Devanagari block only) and
      place it under `apps/chat/public/fonts/` (and `apps/admin` if admin needs it).
- [ ] Wire the self-hosted `@font-face` (currently the CSS uses the font-family
      stack `'Noto Sans','Noto Sans Devanagari',system-ui,sans-serif` with
      `font-display: swap`, relying on system fonts as a fallback).
- [ ] **Real-device check of acceptance criterion 14**: Nepali (Devanagari) and
      Vietnamese (diacritics) render correctly on the customer chat AND admin.
      M4 status: wiring only — provisionally passing via system fonts; final
      verification belongs here at M8.
- [ ] Consider a subset **Noto Sans** (Latin + Vietnamese) woff2 if system-font
      Vietnamese rendering proves inconsistent on target devices.

## Infrastructure (to be filled as milestones progress)
- [ ] Create real Cloudflare **KV namespace** for rate limiting and replace the
      `rate_limit_placeholder` id in `apps/api/wrangler.toml` (from M3).
- [ ] Set Worker **secrets** (`wrangler secret put`) and local `.dev.vars` for
      running the real Worker (SUPABASE_*, GEMINI_API_KEY, SLACK_WEBHOOK_URL,
      RESEND_API_KEY) (from M3).

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
