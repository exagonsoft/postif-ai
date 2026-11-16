# POSTIF-AI

AI-assisted social content planning, media, approvals, and scheduling. Built with Next.js 16, React 19, TypeScript, Tailwind CSS, and the native MongoDB driver for MongoDB Atlas.

## Core workflow

1. Enter a topic or creative brief and generate platform-specific post text.
2. Upload images/videos, or queue AI generation and attach the completed media.
3. Preview each platform's text and attachments.
4. Choose approval before sending or authorize automatic publishing, then choose a time and timezone.
   Choose Image, Video, or GIF: scheduling generates media from the topic and selected brand/workspace, chooses the format, and attaches it before approval or publishing. No separate media prompt is needed.
5. Review pending posts in the approval screen. Users choose email, on-site, and/or browser-push notifications in Settings.

Approval is enforced server-side. Content edits invalidate approval, rescheduling replaces old jobs, and cancellation prevents queued work. A separate background worker processes due jobs and media generation without an open browser.

Customers connect their own platform-issued access tokens for LinkedIn, X, Instagram, Facebook, TikTok, Pinterest, YouTube, and Threads. Tokens are verified with the provider and stored encrypted per workspace/account, separately from account metadata. Publishing uses provider responses and persisted asynchronous checkpoints; ambiguous sends require verification instead of blind retries. See the [provider capability matrix and deployment gates](docs/PUBLISHING_WORKFLOW.md).

Text generation and on-demand weekly planning require live OpenAI with a configured server key or encrypted workspace BYOK key. There is no template fallback. Media generation uses OpenAI for images and Runway for video, with explicit errors instead of placeholder output. Email and push require provider configuration.

Automatic OAuth authorization/token renewal, paid checkout/top-ups, live analytics ingestion, automated password recovery, and recurring autonomous planning are not implemented. Unsupported actions return explicit errors rather than simulated success. New accounts start on Free/BYOK with zero credits, no connected channels, and no fabricated metrics.

## Run locally

Configure `.env.local` using `env_sample`. Choose `MEDIA_STORAGE_PROVIDER=local` for filesystem development, or configure S3 access through your AWS profile/role, then:

```sh
npm install
npm run db:migrate
npm run dev
```

In a separate terminal, after configuring `WORKER_SECRET` and `APP_URL`:

```sh
npm run worker
```

Set `MONGODB_URI` and `MONGODB_DB` in `.env.local`. `db:migrate` (also `db:init`) creates all collections, validators, indexes, and numeric-ID counters from scratch. MongoDB Atlas or a local replica set is required for transactions. Existing PostgreSQL data is not copied or modified. See [MongoDB setup](docs/MONGODB.md). Uploaded/generated files still need persistent storage. See [Publishing workflow and deployment setup](docs/PUBLISHING_WORKFLOW.md) for provider settings and deployment limitations.

Before production, supply independent encryption/worker secrets, a public HTTPS `APP_URL`, and storage configuration, then run `npm run production:check`. On Amplify, use `MEDIA_STORAGE_PROVIDER=s3`, `S3_MEDIA_REGION=sa-east-1`, `S3_MEDIA_BUCKET=postif-ai-media-prod`, and `S3_MEDIA_PREFIX=media/`; the AWS SDK uses the SSR Compute role, not embedded credentials. `MEDIA_STORAGE_DIR` is only required for local production storage. See [private S3 storage](docs/S3_MEDIA_STORAGE.md) for role permissions, signed downloads, FFmpeg, legacy files, and Amplify limits.

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
