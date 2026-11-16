# POSTIF-AI

AI-assisted social content planning, media, approvals, and scheduling. Built with Next.js 16, React 19, TypeScript, Tailwind CSS, and the native MongoDB driver for MongoDB Atlas.

## Core workflow

1. Enter a topic or creative brief and generate platform-specific post text.
2. Upload images/videos, or queue AI generation and attach the completed media.
3. Preview each platform's text and attachments.
4. Choose approval before sending or authorize automatic publishing, then choose a time and timezone.
   Choose Image, Video, or GIF: scheduling generates media from the topic and selected brand/workspace, chooses the format, and attaches it before approval or publishing. No separate media prompt is needed.
5. Review pending posts in the approval screen. Users choose email, on-site, and/or browser-push notifications in Settings.

Approval is enforced server-side. Content edits invalidate approval, rescheduling replaces old jobs, and cancellation prevents queued work. The worker runs **inside Next.js**, through the protected `/api/worker` endpoint. AWS scheduling only invokes that endpoint; it does not process application jobs.

Customers connect their own app credentials through OAuth or manual provider tokens for LinkedIn, X, Instagram, Facebook, TikTok, Pinterest, YouTube, and Threads. Credentials are encrypted per workspace/account. Renewal and analytics synchronization use real provider APIs, subject to provider permissions and reporting availability; missing metrics are not invented. Publishing uses persisted asynchronous checkpoints; ambiguous sends require verification instead of blind retries. See the [provider capability matrix and deployment gates](docs/PUBLISHING_WORKFLOW.md).

Text generation and opt-in recurring planning require live OpenAI with a configured server key or encrypted workspace BYOK key. Durable reservations and request keys prevent duplicate credit settlement. GPT Image generation uses background Responses jobs; Runway video generation is polled across requests. GIF processing uses bounded temporary FFmpeg work, never permanent local storage. BYOK images use the customer key; Runway video/GIF requires Managed AI. There is no template fallback.

Stripe Checkout, verified webhooks, Customer Portal, cancellation/reactivation, scheduled paid-tier/cycle changes, monthly allowances, server-side entitlements, team invitation acceptance/revocation, email verification, and password recovery are implemented. Configure the external services before enabling them. Top-ups remain deliberately disabled pending approved pricing. New accounts start on Free/BYOK with zero credits, no connected channels, and no fabricated metrics. Starter includes campaigns; Pro/Agency additionally include teams, recurring assisted planning and advanced analytics. Payment redirects never grant paid access.

## Run locally

Use Node 22.15 or newer. Configure `.env.local` using `env_sample`. Choose `MEDIA_STORAGE_PROVIDER=local` for filesystem development, or configure S3 access through your AWS profile/role, then:

```sh
npm install
npm run db:migrate
npm run dev
```

For a manual worker trigger, configure `WORKER_SECRET` and `APP_URL`, then:

```sh
npm run worker
```

The CLI is an HTTP invoker, not a separate processing service. Production uses the opt-in scheduler template in `infra`; no browser, resident Node loop, or `setInterval` is required. Review protected worker status at `/api/worker/status`.

Set `MONGODB_URI` and `MONGODB_DB` in `.env.local`. `db:migrate` (also `db:init`) initializes or updates collection validators, indexes, and numeric-ID counters without copying PostgreSQL data. Review this command before running it against production; implementation verification uses an isolated replica set only. MongoDB Atlas or a local replica set is required for transactions.

## Production setup

The Amplify buildspec selects Node 22, creates an allowlisted server-only `.env.production`, validates configuration, and builds Next.js. It never serializes AWS role credentials. Environment values in an ignored local file do not configure Amplify. AWS currently documents Next.js SSR support through version 15; this app's Next.js 16 deployment still requires staging validation.

Configure independent encryption/worker secrets, MongoDB, public HTTPS `APP_URL`, `MEDIA_STORAGE_PROVIDER=s3`, `S3_MEDIA_REGION=sa-east-1`, your actual `S3_MEDIA_BUCKET`, and `S3_MEDIA_PREFIX=media/`. Keep the bucket private and versioned. The SDK uses the attached SSR Compute role, never embedded credentials. `MEDIA_STORAGE_DIR` is unnecessary for permanent S3 storage.

S3 uploads use short-lived, authenticated upload intents and direct browser POSTs so 50 MiB files do not cross Amplify SSR body limits. Configure bucket CORS for the exact application origin and review the additional scoped version-access/temporary-version cleanup permissions in [S3 storage setup](docs/S3_MEDIA_STORAGE.md). Completion verifies the actual content before creating a usable asset. Original downloads use private, short-lived signed URLs.

To enable payments, configure `BILLING_ENABLED=true`, `BILLING_APP_URL`, Stripe server/webhook keys, a restricted Portal configuration, and all ten USD Price IDs in `env_sample`. Keep the existing catalog prices. Tier/cycle changes take effect at the paid-through boundary, not through unpaid client-side selection. Access expires at paid-through without a grace period; existing data is retained. Configure customer-owned social apps and callbacks, OpenAI/Runway as applicable, and SMTP/VAPID for account emails and notifications. Review and activate the authenticated HTTP scheduler separately; its template defaults disabled.

Run `npm run production:check` after configuration. No infrastructure, deployment, actual payment, live S3 access, or live social publishing is performed automatically.

Production startup validates configuration too; this does not verify provider approvals or live connectivity. No runtime demo login, automatic seeding, or development encryption fallback exists. Test fixtures can only be loaded by the isolated test runner. Existing database records are not deleted by this cleanup; audit any previously seeded users, sessions, metrics, and entitlements separately before deployment.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:db
npm run test:storage
# After building, include HTTP/auth/page integration checks:
npm run test:db -- --http
npm audit --omit=dev
```

Database, HTTP, and mocked provider checks are documented in the workflow guide. Automated tests do not publish to real social accounts or send paid provider requests.
