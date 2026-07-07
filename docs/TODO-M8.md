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
