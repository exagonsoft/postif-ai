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

PayPal subscriptions, server-verified webhooks, cancellation with paid-through retention, same-product changes at the next paid renewal, monthly allowances and server-side entitlements are implemented. Platform operators manage products, prices, limits, AI modes and features in `/app/admin`. Published versions preserve existing subscribers' terms. Team invitations, email verification and password recovery require their configured services. Top-ups remain disabled. New accounts start on Free/BYOK with zero credits. Payment redirects never grant access; actual Sandbox payment flows remain unverified.

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

## Languages

The public site, customer application, and administration use `flat-i18n` with English (`en`), Spanish (`es`), German (`de`), and Brazilian Portuguese (`pt-BR`). The language selector updates the shared React context without changing URLs or discarding mounted forms. A validated `postif_locale` cookie preserves the selection for server rendering and refreshes; English is the default. Localized pages are rendered per request so their initial HTML and metadata match the saved language.

Keep all translations in `src/i18n/translations.json`, using flat keys with matching `{placeholder}` names in every language. Client components use `useAppLanguage()` from `src/i18n/provider.tsx`; server components use `await getServerI18n()` from `src/i18n/server.ts`. These expose `t`, `locale`, `formatDate`, and `formatNumber`. MongoDB content, provider resource names/IDs, user-authored text, and billing currencies are not rewritten when switching languages.

Run `npm run test:i18n` for dictionary/reference checks, real React language switching, cookie persistence, draft preservation, and hydration tests.

## Platform administrator

The application's root administrator is a normal authenticated user with `users.systemRole` set to `operator`. Workspace `owner`/`admin` roles do not grant platform access. There is no root username/password environment variable, default administrator password or automatic first-user promotion.

Platform administrators do not need a workspace, brand, subscription or customer onboarding. With trusted access to the configured MongoDB database and initialized schema, create an account-only operator locally:

```sh
npm run admin:create
```

The interactive command prompts for name, email, a hidden password of at least 12 characters and confirmation before connecting/writing. It creates only a user, never a workspace, brand or subscription. It refuses to overwrite/promote an existing account and does not mark email verified automatically. No password is passed through environment variables, command arguments or logs. The command is not exposed through a public API and does not run during deployment.

For an existing account, use trusted MongoDB administrator access to change only that user's `systemRole` from `user` to `operator`. In Atlas, select the database configured by `MONGODB_DB`, use Browse Collections, locate the exact lowercase email in `users`, and edit that one field. Alternatively, run this manually in `mongosh`, replacing the placeholders:

```javascript
const appDb = db.getSiblingDB("<MONGODB_DB>");
const result = appDb.users.updateOne(
  { email: "<registered-lowercase-email>", systemRole: "user" },
  { $set: { systemRole: "operator" }, $inc: { _revision: 1 } }
);
if (result.matchedCount !== 1) {
  throw new Error("Expected one ordinary registered user; check the database, email and current role.");
}
```

Never promote an unverified account identity or grant database access to ordinary application users. Keep the existing password hash and account identity unchanged. Operators sign in through `/login` and go directly to `/app/admin`, with a platform-only shell and no workspace selector or branding onboarding; roles are loaded from MongoDB on each request. Existing workspaces are not deleted or modified. Public `/register` remains the customer signup flow and cannot assign operator access. Production startup configuration and initialized collection indexes/validators must already be in place. No account or database role is modified until you explicitly run a provisioning operation.

### Internal platform control panel

`/app/admin` is the ExagonSoft administration area, not a customer workspace dashboard. Its dedicated navigation includes platform totals, searchable/paginated customers and workspaces, current-environment PayPal subscriptions and verified payment history, the existing product/plan catalog, publishing jobs and stored worker heartbeats, audit history, and administrators.

An authenticated operator can create additional account-only administrators at `/app/admin/admins`. All administrators have the same full platform permissions, including creating other administrators; there are no granular staff roles in this phase. Creation and feature-registry changes are committed with their audit records in a MongoDB transaction. Existing accounts cannot be overwritten or promoted through the form. Passwords, session tokens, encrypted provider state and worker tokens are excluded from directory/detail responses.

Customer/workspace/billing/operations inspection is read-only: there are no refunds, deletions, impersonation, credit adjustments or manual job retries here. MRR uses stored ACTIVE, paid-through subscription snapshots in the configured PayPal environment; it is not a live provider check and excludes cancelled contracts even while their paid access remains valid. Worker heartbeats show persisted phase activity, not a live health check. The feature-flag registry currently has no production feature consumers; changing a flag does not enable billing, publishing or automation. Catalog publishing remains the explicit operation that can create PayPal resources.

## Production setup

The Amplify buildspec selects Node 22, creates an allowlisted server-only `.env.production`, validates configuration, and builds Next.js. It never serializes AWS role credentials. Environment values in an ignored local file do not configure Amplify. AWS currently documents Next.js SSR support through version 15; this app's Next.js 16 deployment still requires staging validation.

Configure independent encryption/worker secrets, MongoDB, public HTTPS `APP_URL`, `MEDIA_STORAGE_PROVIDER=s3`, `S3_MEDIA_REGION=sa-east-1`, your actual `S3_MEDIA_BUCKET`, and `S3_MEDIA_PREFIX=media/`. Keep the bucket private and versioned. The SDK uses the attached SSR Compute role, never embedded credentials. `MEDIA_STORAGE_DIR` is unnecessary for permanent S3 storage.

S3 uploads use short-lived, authenticated upload intents and direct browser POSTs so 50 MiB files do not cross Amplify SSR body limits. Configure bucket CORS for the exact application origin and review the additional scoped version-access/temporary-version cleanup permissions in [S3 storage setup](docs/S3_MEDIA_STORAGE.md). Completion verifies the actual content before creating a usable asset. Original downloads use private, short-lived signed URLs.

For Sandbox payments, configure `PAYPAL_ENVIRONMENT=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` and an HTTPS `BILLING_APP_URL`. Register a real app webhook at `/api/billing/webhook`. Keep `BILLING_ENABLED=false` while an authenticated platform operator initializes and publishes the catalog in `/app/admin`; publication links selected existing PayPal resources or creates missing ones. Products/plan IDs live in MongoDB, not environment mappings. Operators may create/edit/archive products and plans and publish new monthly/annual USD prices, limits and features. Published terms are immutable; saving a draft never reprices existing subscribers. Ordinary workspace owners/admins cannot manage the global catalog.

In `/app/admin/catalog`, **Check PayPal connection (read-only)** authenticates against the configured Sandbox/live REST app and checks product/plan listing access. Each published version also offers read-only verification of its exact product, both ACTIVE plans, USD prices, intervals and payment preferences against its immutable snapshot. Results are timestamped and not cached or persisted. Local drafts, provider access and published mappings are distinct states; existing resources in the PayPal dashboard are not automatically imported or matched by name. Free remains local-only. Verification never creates resources, changes prices or takes payments; publishing remains a separate explicit operation. API access verifies the configured merchant app, not which PayPal account is signed into a browser.

The **Existing PayPal products and plans** browser loads automatically on that page and lists the configured account's remote resources separately from local drafts, including externally created and inactive plans. Switch between products/plans, paginate through 20 records per page, refresh, or inspect a plan's real price/currency, interval and product ID. Each row identifies exact-ID local mappings or says it is not linked. Reads are operator-only and uncached; browsing never reprices, publishes, imports or grants entitlements. Missing credentials/provider failures appear explicitly without blocking local catalog management. To see the same resources as your PayPal dashboard, use the same merchant/app and Sandbox/live environment.

### Publish a selected local plan to PayPal

In `/app/admin/catalog`, each unlinked paid plan has a purple **Set up PayPal Sandbox/Live** button. **Not linked locally** does not mean absent from PayPal. Select an existing product by exact ID, then select existing monthly/annual plans or explicitly choose to create each missing interval. For example, an existing `POSTIF-AI` product and compatible Starter BYOK monthly plan can be linked while creating only the annual plan. Existing remote names need not equal local names; names never establish a link automatically. Product ownership, ACTIVE status, USD prices, intervals, zero setup fee and no additional taxes/variable quantities are validated before creation. Payment retry/arrears policies come from the selected PayPal plans, not application compatibility constants: both boolean overdue-collection settings and integer failure thresholds 0-999 are supported.

Each interval's actual payment policy is saved with the immutable catalog version, displayed in version history, and copied into customer purchase/revision authorizations. Verification detects later provider-policy drift instead of silently adopting it for existing subscribers. A missing interval inherits the selected existing interval's policy; new revisions retain their published interval policies. Only entirely new setups without an existing policy use the creation defaults (no automatic overdue collection, failure threshold 1). Those defaults do not restrict linking existing plans, and linking never patches their PayPal settings.

Only the selected local plan is published, and its exact IDs and verified provider metadata are saved against an immutable revision. The local product retains its account/environment-scoped PayPal product association for later publications; an established association cannot silently switch products. A remote plan cannot be claimed by another local plan. Selecting both existing intervals creates no provider resources. Free stays local-only. There is no scheduled catalog processing, bulk publication or PayPal-to-local mirror.

Saving a draft does not publish. **Verify in PayPal** checks an unchanged published revision without creating duplicates. **Publish revision to PayPal** reuses its linked product and creates new billing plans without repricing existing subscribers. **Use existing PayPal setup** opens explicit resource selection, including for a pending attempt. Replacing an incomplete attempt requires confirmation of its exact version; the old attempt becomes `superseded`, retains its history/resources, and cannot be automatically retried. Nothing is deleted or deactivated in PayPal.

**MongoDB / PayPal records** separates the two actual sources. Here, "local" means MongoDB, not browser storage. The top-level **Refresh MongoDB catalog** reloads database records without contacting PayPal. On a plan card, **Read / refresh MongoDB + PayPal** reads its MongoDB draft/publication/mappings and fetches the exact linked product and monthly/yearly plan IDs directly from the configured PayPal account. Stored names/descriptions, current provider names/descriptions/status, prices/intervals and payment policies are displayed alongside their source and read timestamps. Missing names are shown as not recorded, never generated for display. Differences and per-resource read failures remain visible; reading does not synchronize, repair, publish or update either source. The separate PayPal account browser also includes resources not linked to MongoDB.

**Edit published plan name and description** appears on a currently published paid plan card and beside older published versions in its history. Enter an editable base name and a description (1-127 characters), review the exact monthly/yearly IDs and `POSTIF-AI {name}` plus Monthly/Yearly previews, then confirm **Save name and description to local + PayPal Sandbox/Live**. The action patches only `/name` and `/description` on those existing PayPal plans and reads both back before saving local display details. Updating the current publication also updates its local draft and public catalog without creating a financial revision; a historical-only update does not overwrite a newer current plan. Original publication/subscriber snapshots, IDs, prices, payment policies and features remain unchanged. INACTIVE plans are rejected without activation. Shared local mappings remain consistent. Partial updates block other plan edits/publication until explicitly retried with their original values; already-applied changes are confirmed by reads instead of patched again. New local drafts require a description, which is sent when creating their PayPal plans. No automatic update is scheduled.

**Retry in PayPal** resumes the original pending setup with durable request IDs; it does not adopt different resources. Manual publication is serialized by environment, remains bound to its approved app, and switches the current mapping only after both intervals are verified. Uncertain requests beyond the safe idempotency window require explicit reconciliation. Provider errors now report a safe operation, recognized validation codes/field paths and PayPal debug ID when available; raw values, arbitrary provider messages and credentials are excluded. The earlier HTTP 400's precise cause remains unknown without its provider details.

No new environment variables or mirror collections are required. Review and run `npm run db:init` against the intended database before using incomplete-setup replacement: its catalog validator now permits `superseded` versions. PayPal credentials are required, but publication is independent of `BILLING_ENABLED`. Real linking/creation still requires explicit Sandbox verification; automated checks simulate PayPal and use isolated MongoDB, without real provider writes or production database operations.

For automatic overdue collection, a latest completed whole-period aggregate can activate only the current paid period when PayPal reports an ACTIVE subscription, a matching last-payment amount, a valid next billing time and zero outstanding USD balance. It cannot cover more cycles than have elapsed. Historical credits are not granted, and webhook replays do not reset consumed credits. Partial/mixed-price collections, unsettled balances and aggregates during a pending plan revision require explicit reconciliation instead of guessing entitlement periods. The provider's retry threshold alone never grants unpaid access.

Enable billing only after setup and verify a real Sandbox buyer purchase, signed webhook, renewal, refund/dispute, cancellation and interval revision. Register these complete webhook event names:

```text
BILLING.SUBSCRIPTION.CREATED
BILLING.SUBSCRIPTION.ACTIVATED
BILLING.SUBSCRIPTION.UPDATED
BILLING.SUBSCRIPTION.SUSPENDED
BILLING.SUBSCRIPTION.CANCELLED
BILLING.SUBSCRIPTION.EXPIRED
BILLING.SUBSCRIPTION.PAYMENT.FAILED
PAYMENT.SALE.COMPLETED
PAYMENT.SALE.REFUNDED
PAYMENT.SALE.REVERSED
CUSTOMER.DISPUTE.CREATED
CUSTOMER.DISPUTE.UPDATED
CUSTOMER.DISPUTE.RESOLVED
```

Simulator events do not verify PayPal's remote signature verification. No live PayPal credentials or existing subscribers were configured during this replacement.

Same-product changes require buyer approval and start at the next verified paid renewal, without proration. Different products require cancellation, retained paid access, expiry, then a new purchase. Cancelled PayPal subscriptions cannot resume. Pending initial approvals cannot safely be discarded and replaced: the original authorization is retained to avoid duplicate subscriptions; uncertain operations beyond the safe retry window require operator reconciliation. Pending or seller-winning disputes retain verified paid access; confirmed refunds, reversals or backend-confirmed buyer-winning resolutions revoke the affected payment. The REST app must permit reading seller disputes; denied/malformed responses fail for retry, not silent success. Refund/reversal/dispute transaction linkage, monthly/annual transitions and late-payment schedules still need real Sandbox evidence. Access expires without a grace period; data is retained. Free remains BYOK with zero credits and no unpaid premium activation.

Configure customer-owned social apps, OpenAI/Runway, SMTP and VAPID as needed. Activate authenticated HTTP worker invocations separately: all processing remains inside Next.js, but periodic renewals, credit resets and publishing need a reliable trigger. The optional scheduler defaults disabled. Production database index/validator initialization and trusted provisioning of a platform operator remain manual; signup does not self-assign operator access. See [Amplify environment configuration](docs/AMPLIFY_ENV_CONFIGURATION.md) for propagation and artifact-secret risks.

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
npm run test:catalog:db
# After building, include HTTP/auth/page integration checks:
npm run test:db -- --http
npm audit --omit=dev
```

Database, HTTP, and mocked provider checks are documented in the workflow guide. Automated tests do not publish to real social accounts or send paid provider requests.
