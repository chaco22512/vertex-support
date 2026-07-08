# Deploy Runbook — SIM Point Support (M8)

Production for the pilot: **API** on Cloudflare Workers, **chat** and **admin** on
Cloudflare Pages, **DB/Auth** on the existing Supabase project, and Gemini / Slack
/ Resend already configured. URLs use the free Cloudflare subdomains
(`*.workers.dev`, `*.pages.dev`).

> **Secrets rule (Hard rule 1):** never print or commit secret values. They live
> only in `.env` (git-ignored) and in `wrangler secret` / Pages build env. The KV
> namespace **id** is not secret and is committed in `wrangler.toml`.

## 0. Prerequisites (operator does this once)
- Node 22 + pnpm 9 installed; repo dependencies installed (`pnpm install`).
- Cloudflare account.
- **`wrangler login`** — run this yourself; it opens a browser to authorize.
  Everything below can then run from the terminal.

## 1. Create the KV namespace (rate limiting)
```
cd apps/api
wrangler kv namespace create RATE_LIMIT
```
Copy the returned `id` into `apps/api/wrangler.toml`, replacing `rate_limit_placeholder`:
```
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<the id printed above>"
```

## 2. Set Worker secrets from `.env` (values never printed)
From the repo root, for each name set its value from `.env`:
```
for K in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY \
         GEMINI_API_KEY SLACK_WEBHOOK_URL RESEND_API_KEY; do
  grep -E "^$K=" .env | cut -d= -f2- | (cd apps/api && wrangler secret put "$K")
done
```
`EMAIL_FROM` is optional (defaults to the Resend test sender) — set it only once a
verified SIM Point domain sender exists.

## 3. Deploy the Worker (first pass)
```
cd apps/api
wrangler deploy
```
Note the URL printed, e.g. `https://vertex-support-api.<sub>.workers.dev`.
Record it below as **API_URL**.

## 4. Build the front-ends with the production API URL
- **chat** reads `VITE_API_BASE_URL`:
```
cd apps/chat
VITE_API_BASE_URL="<API_URL>" pnpm build
```
- **admin** reads the root `.env` at build time (`vite.config.ts` injects
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_API_BASE_URL`). Set `ADMIN_API_BASE_URL`
  in `.env` to **API_URL**, then:
```
cd apps/admin
pnpm build
```

## 5. Publish to Cloudflare Pages
```
wrangler pages deploy apps/chat/dist  --project-name vertex-support-chat
wrangler pages deploy apps/admin/dist --project-name vertex-support-admin
```
Record the two `*.pages.dev` URLs as **CHAT_URL** and **ADMIN_URL**.

## 6. Wire the cross-origin URLs, then redeploy the Worker
In `apps/api/wrangler.toml` set the real Pages URLs (used for CORS, the Slack
"Open conversation" link, the email chat link, and the email logo):
```
[vars]
ADMIN_BASE_URL = "<ADMIN_URL>"
CHAT_BASE_URL  = "<CHAT_URL>"
```
Then redeploy so the new vars take effect:
```
cd apps/api
wrangler deploy
```

## 6b. Configure Supabase Auth URLs (REQUIRED — do not skip)
Invitation and password-reset emails use Supabase's redirect settings. If these
still point at localhost, invite links open `http://localhost` and fail with
ERR_CONNECTION_REFUSED. In the Supabase dashboard → **Authentication → URL
Configuration**:
- **Site URL:** `<ADMIN_URL>` (e.g. `https://vertex-support-admin.pages.dev`)
- **Redirect URLs:** add `<ADMIN_URL>/set-password` and `<ADMIN_URL>/*`

The invite API also pins `redirectTo` to `<ADMIN_URL>/set-password`
(`apps/api/src/routes/admin/staff.ts`), so links are correct even if this setting
drifts — but keep Site URL current for password-reset and other Auth emails.

## 7. Verify
- `curl <API_URL>/health` → `{"status":"ok",...}`.
- Open **CHAT_URL** — language selection appears; run one lost-SIM question end to end.
- Open **ADMIN_URL** — sign in; the Inbox loads (confirms admin → API CORS works
  from the real origin).
- **Cron:** in the Cloudflare dashboard → Workers → the API worker → Triggers, the
  hourly cron is listed. Use "Trigger scheduled" (or wait for the top of the hour)
  and confirm a reminder appears in Slack if any escalation is near/past due.

## Reference — where each value comes from
| Setting | Where | Committed? |
|---|---|---|
| KV namespace `id` | `apps/api/wrangler.toml` | Yes (not secret) |
| `ADMIN_BASE_URL`, `CHAT_BASE_URL` | `apps/api/wrangler.toml [vars]` | Yes |
| SUPABASE_*, GEMINI_API_KEY, SLACK_WEBHOOK_URL, RESEND_API_KEY | `wrangler secret` (from `.env`) | **No** |
| `VITE_API_BASE_URL` (chat) | build-time env | No (baked into the built JS) |
| `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`ADMIN_API_BASE_URL` (admin) | root `.env` at build time | No |
| `EMAIL_FROM` | optional Worker secret/var | No |

## Rollback
- Worker: `wrangler deployments list` then `wrangler rollback [id]`.
- Pages: in the dashboard, promote a previous deployment.

## Still open before public launch (see docs/TODO-M8.md)
- Verify a SIM Point domain in Resend and set `EMAIL_FROM` (pilot uses the test sender,
  which only delivers to the sending-account owner).
- Optional custom domains for chat/admin/API.
