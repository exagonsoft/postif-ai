# AWS Amplify SSR environment configuration

## Result and scope

The build now propagates an explicitly reviewed, source-audited set of application variables into the root `.env.production` before Next.js builds. Local tests using Next.js's actual environment loader confirm that MongoDB configuration reaches the production instrumentation hook without losing literal dollar signs in credentials.

**The deployed MongoDB startup failure is not yet confirmed resolved.** No Amplify deployment, AWS Console inspection, production database operation, live S3 operation or payment was performed. Local validation cannot establish the environment or IAM identity of a deployed compute instance.

This audit covers first-party application source, API routes, server components, authentication, MongoDB, AI/media integrations, social OAuth, notifications, billing, workers, instrumentation, Next.js configuration, deployment scripts, infrastructure and environment templates. Dependencies and generated bundles are not first-party configuration sources. Local configuration reporting is limited to names/presence/status; no secret values are reproduced here or logged.

The initial environment-only task updated the buildspec, allowlist, audit/preparation/check scripts, focused tests and this document. The subsequently authorized PayPal replacement updated the billing runtime and admin catalog; this inventory now reflects that implementation. MongoDB and S3 architectures remain unchanged. No real provider credentials, resource creation, database migration, payment or deployment were performed.

## Application inventory

The reviewed runtime list is `config\amplify-env.json`; `env_sample` documents exactly the same names, enforced by tests. Optional/defaulted overrides are commented out instead of adding unnecessary active assignments. Feature credentials remain documented because they are needed when those features are enabled.

Classification: **S** required at startup; **F** required when the relevant feature is enabled/used; **O** optional/defaulted; **P** deliberately client-public; **K** server secret; **B** build/platform control; **W** worker-only setting. Variables without K are still server-side configuration unless explicitly marked P. A feature requirement can also become a startup requirement through the existing conditional validator.

| Variable | Classification | Requirement / consumer |
| --- | --- | --- |
| `APP_URL` | S | Application origin for OAuth callbacks, account email, notifications and publishing links. Amplify preparation requires HTTPS. |
| `MONGODB_URI` | S, K | Real MongoDB connection URI; lazily consumed by the native MongoDB client. |
| `MONGODB_DB` | S | Explicit database name. |
| `ENCRYPTION_SECRET` | S, K | At least 32 characters; decrypts tenant/provider credentials and signs media access. |
| `WORKER_SECRET` | S, F, K | At least 32 characters, distinct from encryption secret; authenticates the in-app worker. Required by startup validation even without a configured scheduler. |
| `WORKER_BUDGET_MS` | O, W | In-app processing budget; defaults to 24000 ms and is bounded to 5000-25000 ms. |
| `MEDIA_STORAGE_PROVIDER` | S on Amplify | Must be `s3` in this build. Generic development storage may default to local. |
| `MEDIA_STORAGE_DIR` | O in S3 mode | Local development/legacy storage path; not required for permanent S3 storage. Absolute path required if supplied for local storage. |
| `S3_MEDIA_REGION` | F, startup on Amplify | S3 region; production target is `sa-east-1`. Not `AWS_REGION`. |
| `S3_MEDIA_BUCKET` | F, startup on Amplify | Actual private production bucket name, with no hardcoded application fallback. |
| `S3_MEDIA_PREFIX` | F, startup on Amplify | Validated safe prefix ending with `/`; configured convention is `media/`. |
| `POSTIF_S3_ACCESS_KEY_ID`, `POSTIF_S3_SECRET_ACCESS_KEY` | O, K | Explicit S3 credentials; set both together, or omit both to use the SDK credential provider. Prefer the compute role where available. |
| `POSTIF_S3_SESSION_TOKEN` | O, K | Session token for temporary explicit S3 credentials; requires the access key pair. |
| `OPENAI_API_KEY` | F, K | Platform-managed text/image generation. BYOK keys are encrypted per workspace in MongoDB, not supplied through this variable. |
| `OPENAI_IMAGE_MODEL` | O | Image model selection; existing default is `gpt-image-1.5`. |
| `OPENAI_IMAGE_RESPONSE_MODEL` | O | Responses model for supported asynchronous image generation; existing default is `gpt-5.2`. |
| `RUNWAY_API_KEY` | F, K | Managed video generation, also used in the GIF generation workflow. |
| `FFMPEG_PATH` | O | Explicit runtime-compatible executable override. Otherwise uses the traced `ffmpeg-static` binary; production does not silently fall back to PATH. |
| `SMTP_URL` | F, K | Credential-bearing SMTP/SMTPS URL for verification, password recovery and email notifications. Requires `MAIL_FROM` when set. |
| `MAIL_FROM` | F | Sender address/header, not a `mailto:` URL; needed for account email with SMTP. |
| `VAPID_PUBLIC_KEY` | F, P | Web-push public key, deliberately returned by the authenticated notification settings endpoint. Not exposed through a `NEXT_PUBLIC_` environment variable. |
| `VAPID_PRIVATE_KEY` | F, K | Server-only web-push private key. |
| `VAPID_SUBJECT` | F | Push contact URI. All three VAPID values must be present together or all omitted. |
| `BILLING_ENABLED` | O | Only exact `true` enables billing; absent means disabled. |
| `BILLING_APP_URL` | F | HTTPS billing return origin; required at startup when billing is enabled. Deliberately separate from `APP_URL`; not a fallback alias. |
| `PAYPAL_ENVIRONMENT` | O, F | `sandbox` by default, or explicit `live`; separates credentials, products/plans and paid evidence. |
| `PAYPAL_CLIENT_ID` | F | Server-only REST application identifier; required for enabled billing and provider catalog publication. |
| `PAYPAL_CLIENT_SECRET` | F, K | REST application secret; obtains temporary OAuth access tokens server-side. |
| `PAYPAL_WEBHOOK_ID` | F | Actual registered app webhook ID, used in server-side signature verification; required for enabled billing. |

### Optional managed social OAuth

The explicit runtime allowlist also includes the variables below. None is
`NEXT_PUBLIC_`. Provider secrets are copied only through the existing protected
Amplify environment preparation; treat build artifacts containing the generated
runtime environment as secret-bearing, just as for PayPal/AI credentials.

| Variables | Requirement |
| --- | --- |
| `SOCIAL_MANAGED_PROVIDERS` | Explicit comma-separated enablement: `facebook,instagram,linkedin,x,tiktok,pinterest,youtube,threads`; empty disables new managed authorization without deleting legacy connections. Enable only providers with the required access. |
| `SOCIAL_OAUTH_ANALYTICS_PROVIDERS` | Providers whose additional reporting scopes are approved; requested only after user opt-in. |
| `SOCIAL_OAUTH_PUBLIC_POSTING_PROVIDERS` | Only `tiktok,youtube`; leave empty until each required posting audit and product-compliance review is complete. Default is private-only for those managed connections. |
| `FACEBOOK_OAUTH_CLIENT_ID`, `FACEBOOK_OAUTH_CLIENT_SECRET` | Required only when managed Facebook is enabled. |
| `INSTAGRAM_OAUTH_CLIENT_ID`, `INSTAGRAM_OAUTH_CLIENT_SECRET` | Required only when managed Instagram Login is enabled; use the Instagram-specific app credentials. |
| `LINKEDIN_OAUTH_CLIENT_ID`, `LINKEDIN_OAUTH_CLIENT_SECRET` | Required only when managed LinkedIn is enabled. |
| `X_OAUTH_CLIENT_ID`, `X_OAUTH_CLIENT_SECRET` | Required only when managed X is enabled; confidential web client with S256 PKCE. |
| `TIKTOK_OAUTH_CLIENT_ID`, `TIKTOK_OAUTH_CLIENT_SECRET` | Required only when managed TikTok is enabled; client ID means TikTok's client key. |
| `PINTEREST_OAUTH_CLIENT_ID`, `PINTEREST_OAUTH_CLIENT_SECRET` | Required only when managed Pinterest is enabled. |
| `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET` | Required only when managed YouTube is enabled; Google's web application credentials. |
| `THREADS_OAUTH_CLIENT_ID`, `THREADS_OAUTH_CLIENT_SECRET` | Required only when managed Threads is enabled. |
| `META_GRAPH_API_VERSION` | Optional Graph version, default `v27.0`; validate support before changing. |
| `LINKEDIN_API_VERSION` | Supported `YYYYMM`, required when managed LinkedIn is enabled. |
| `LINKEDIN_ORGANIZATIONS_ENABLED` | Exact `true` only after Community Management organization publishing approval; default false. |

Enabling a provider without its required credentials fails runtime/production
validation. Configure `APP_URL` as the exact public HTTPS application origin and
register the exact callbacks in the
[managed OAuth setup guide](SOCIAL_MANAGED_OAUTH_MIGRATION.md).
No customer access/refresh tokens belong in environment variables.

PayPal product and monthly/annual plan IDs are persisted by the operator-managed versioned catalog, not supplied through environment Price-ID mappings. Published paid versions pin USD pricing, limits and features; Free remains local BYOK with zero price/credits. Enabling billing requires the four PayPal settings and HTTPS billing origin. Provider publication is an explicit admin operation and is possible before new checkout is enabled. No real PayPal resource has been created by local validation.

Principal code references:

- Startup and conditional requirements: `src\instrumentation.ts`, `src\lib\runtime-config.ts:4-20`.
- MongoDB URI/database access and lazy connection: `src\db\index.ts:6-15`.
- Storage requirements: `src\lib\media-storage-config.ts:5-20`; default-chain S3 clients: `src\lib\media-storage.ts:85-93`.
- Managed/BYOK media credentials and models: `src\lib\media-generation.ts:17-46`; text AI: `src\lib\ai-engine.ts`.
- SMTP/account actions: `src\lib\account-email.ts:10-45`; email and push: `src\lib\notification-service.ts`; public-key response: `src\app\api\notification-settings\route.ts`.
- OAuth origin and customer-owned credentials: `src\lib\social-oauth-provider.ts`; managed configuration/selection: `src\lib\social-managed-config.ts`, `src\lib\social-managed-oauth.ts`; encryption: `src\lib\crypto.ts`.
- Worker authentication/budget: `src\lib\worker-auth.ts`, `src\lib\worker-budget.ts:6-9`.
- FFmpeg configuration and AWS detection: `src\lib\ffmpeg-path.ts:8-19`; binary tracing: `next.config.ts`.
- PayPal configuration, OAuth and signature verification: `src\lib\paypal.ts`; subscription evidence: `src\lib\subscriptions.ts`; callback: `src\app\api\billing\webhook\route.ts`. Admin catalog: `src\lib\billing-catalog.ts`, `src\db\catalog-schema.ts`, `src\app\api\admin\catalog\route.ts`.

## Platform, invoker, test and obsolete names

These are not additional application variables to copy into `.env.production`.

| Names | Classification | Treatment |
| --- | --- | --- |
| `NODE_ENV` | B, runtime platform control | Set to production by Next.js production commands; `production:check` explicitly selects production loading. Used for instrumentation, secure cookies and FFmpeg/storage guards. Do not configure it as an Amplify custom secret. |
| `FACEBOOK_OAUTH_DIAGNOSTICS` | Development-only control | Only read in development; classified but never copied into the production SSR environment. |
| `NEXT_RUNTIME` | B, runtime framework control | Next.js selects the instrumentation runtime. Do not supply it as custom configuration. |
| `AWS_APP_ID`, `AWS_BRANCH` | B, O runtime host markers | Amplify-owned build identifiers. Required by the environment-preparation CLI; also consulted by the FFmpeg host guard. Not serialized. |
| `AWS_EXECUTION_ENV` | O, platform runtime marker | AWS-owned FFmpeg host-detection signal; not serialized or required from Console. |
| `APP_ORIGIN` | F, W; separate HTTP invoker | `infra\worker-trigger.yaml:72-82` maps its AppOrigin template parameter to this variable. This is intentionally not an alias for Next.js `APP_URL`. |
| `WORKER_SECRET_ARN` | F, W; separate HTTP invoker | Same template maps an existing Secrets Manager secret identifier. The invoker reads the raw worker token and only sends authenticated HTTP requests to Next.js. The template's schedule is disabled by default; nothing was deployed. |
| `MONGO_TEST_DATABASE` | Test-only | Isolated MongoDB test/fixture safety guard, not a production feature flag. |
| `MEDIA_STORAGE_UNIT_TEST` | Test-only | Allows isolated S3 mocks, not production storage behavior. |
| `TEST_APP_URL`, `TEST_STORAGE_PROVIDER` | Test-only | Isolated integration server and local/mocked-S3 test selection. |
| `SystemRoot` | Test-only host inheritance | Windows child-process support in environment tests; not an app setting. |
| `ENABLE_DEMO_MODE` | Obsolete | No production reader. A regression test deliberately sets it to prove it cannot enable demo authentication. Remove from deployment configuration rather than propagating it. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION_ID`, `STRIPE_PRICE_*` | Obsolete | Stripe was replaced with PayPal. Remove these deployment entries; none is propagated or read by the application. Historical audit reports describe the previous implementation only. |
| `LINKEDIN_CLIENT_ID`, `X_CLIENT_ID` | Unused legacy local entries | Present as local configuration names, but no current first-party reader. Social application credentials/tokens are workspace-owned encrypted database settings, not these globals. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | SDK/platform credentials; exclusion fixtures | Never copied or introduced as application configuration. Tests use synthetic values solely to assert exclusion. AWS may supply its own temporary credential-provider context at runtime. |
| `UNRELATED_SECRET`, `NEXT_PUBLIC_SECRET` and synthetic access-pattern keys in tests | Test sentinels only | Not configuration requirements. Arbitrary names and public-prefixed secrets must not be copied. |

PayPal is the current first-party payment integration. No actual `NEXT_PUBLIC_*`, `import.meta.env` or `Deno.env` application reads were found. There are no additional custom build-only application variables. CloudFormation pseudo-parameters such as AWS account/region substitutions are infrastructure expressions, not Next.js environment requirements.

## Build specification and propagation

Current `amplify.yml`:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - nvm install 22
        - nvm use 22
        - npm ci
    build:
      commands:
        - nvm use 22
        - node scripts/prepare-amplify-env.mjs
        - npm run production:check
        - npm run typecheck
        - npm run lint
        - npm test
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - .next/cache/**/*
      - node_modules/**/*
```

The existing Node selection, clean dependency installation, production check, build, artifacts and cache settings are preserved. Existing typecheck/lint/test commands are now explicit build gates. Build tooling requires dev dependencies; do not omit them during `npm ci`. Latest Node 22 supplies the module-hook API used by repository scripts (22.15+ required).

Instead of raw `printenv | grep >>`, the helper performs the same documented root `.env.production` handoff with these safeguards:

1. Audit `src` and `next.config.ts` using the TypeScript AST. Cover direct, bracket, optional-chain, aliased, destructured, typed `ProcessEnv` and literal-loop accesses.
2. Compare every discovered name to the reviewed policy. PayPal uses static accesses and supported literal loops; no dynamic Price resolver remains. New unclassified names, stale entries, duplicate entries and unsupported dynamic lookups fail the build rather than being silently omitted or automatically published.
3. Keep only the explicit runtime allowlist. Omit unset/blank optional values; never copy arbitrary variables, platform markers, `AWS_*` credentials or `NEXT_PUBLIC_*` prefixes.
4. Run the existing full runtime validator against the selected values with production semantics. Require S3 on Amplify and HTTPS for its application origin. Do not require permanent `MEDIA_STORAGE_DIR` in S3 mode.
5. Encode one assignment per line, preserving quotes, hashes, backslashes and literal dollar signs under Next.js dotenv expansion. Reject actual CR/LF/NUL and values that cannot be represented losslessly; report names, never values.
6. Write a new restricted-permission temporary file and atomically replace `.env.production`. Repeated runs replace, not append; failed validation leaves an existing valid file untouched. Remove the named temporary file even on failure. POSIX mode is 0600; Windows does not enforce these POSIX mode bits.
7. Log completion and an artifact-security warning, not variable contents, credentials or signed URLs. The CLI is guarded by Amplify's build identifiers to prevent accidental local secret-file generation.

`npm run production:check` now uses `@next/env`, with the same production precedence as Next.js: existing process variables, `.env.production.local`, `.env.local`, `.env.production`, then `.env`. Existing process variables win. Production repository clones must not contain committed local environment overrides. Optional files may be absent.

The instrumentation hook is unchanged: production Node.js registration still calls `validateRuntimeConfig()` before serving. MongoDB remains lazy: successful validation proves configuration shape/presence, not DNS, network, authentication or transaction connectivity. Manual `scripts\migrate.mjs` and the development HTTP poller retain their existing local dotenv behavior; neither is an Amplify startup step and neither was executed by this task.

For future application variables, update the reviewed policy, `env_sample`, this inventory and focused tests after examining the actual consumer. Unsupported dynamic access requires an explicit implementation review; do not suppress the coverage check or add a wildcard. Source-only names/references can be inspected with `node scripts/audit-amplify-env.mjs`.

## Required Amplify Console configuration

These **nine names must be nonempty** for this Amplify S3 application to initialize:

```text
APP_URL
MONGODB_URI
MONGODB_DB
ENCRYPTION_SECRET
WORKER_SECRET
MEDIA_STORAGE_PROVIDER
S3_MEDIA_REGION
S3_MEDIA_BUCKET
S3_MEDIA_PREFIX
```

Set the storage provider to S3, the application origin to its public HTTPS origin and the region/prefix to the production settings above. Supply secrets through the operator's approved configuration process, never source control. Check active branch overrides, not just the all-branches display. Do not put literal `""` into optional Console fields to mean empty; leave them absent/actually empty.

Feature groups are conditional: configure the managed OpenAI key for platform AI, Runway for managed video/GIF, SMTP plus sender for email, all VAPID fields for push, and the PayPal billing group before setting the billing flag to true. Configure a real Sandbox REST app and register `/api/billing/webhook`; the returned webhook ID belongs to that app/environment. Publish actual provider products/plans explicitly through `/app/admin`. Defaulted model/budget settings and local storage directory need not be supplied. Configuring `MAIL_FROM` alone does not enable email.

**Missing production configuration:** live Console/branch/runtime state is unverified, so no production missing-name claim is made. Local inspection found all nine startup names present. It found these optional names absent/blank (names only):

```text
BILLING_APP_URL
FFMPEG_PATH
MEDIA_STORAGE_DIR
OPENAI_IMAGE_RESPONSE_MODEL
RUNWAY_API_KEY
SMTP_URL
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_WEBHOOK_ID
WORKER_BUDGET_MS
```

Absent defaulted settings are not errors. Local billing is disabled, Runway and SMTP are unconfigured, and local `APP_URL` is a development loopback origin rather than the production Console origin. A local `production:check` pass is not approval to deploy `.env.local` or a claim that email, payments or video work.

## AWS and browser isolation

S3 configuration comes from `S3_MEDIA_REGION`, `S3_MEDIA_BUCKET` and `S3_MEDIA_PREFIX`. S3 clients use the explicit `POSTIF_S3_ACCESS_KEY_ID` and `POSTIF_S3_SECRET_ACCESS_KEY` pair, with optional `POSTIF_S3_SESSION_TOKEN`, when configured. Otherwise they use the SDK default credential chain, such as the Amplify SSR compute role. Partial explicit credentials fail validation instead of falling back silently. Live credential and bucket access still need confirmation.

Do not add `AWS_REGION` or `AWS_*` credential names as custom Amplify variables. Prefer least-privilege access through the compute role. If explicit POSTIF S3 credentials are configured, they are copied into the sensitive server deployment artifact and require restricted artifact access and rotation; SDK-managed credential-provider context remains runtime-managed.

`next.config.ts` has no `env` object that would inline server credentials into browser bundles. No public-prefixed environment variables are propagated. Only the VAPID public key has a justified browser delivery path through authenticated settings; private VAPID/provider/DB/encryption values remain server configuration. The output directory is `.next`, not a public directory containing `.env.production`.

## Important security tradeoff

**`.env.production` is sensitive deployment-artifact content, not a secret vault.** AWS explicitly warns that anyone able to read deployment artifacts can read these credentials. File mode 0600 and absence from browser bundles do not protect against artifact readers, privileged build operators or compromised build tooling.

This requested handoff preserves the application's existing environment-based secret architecture, but makes its distribution to SSR explicit. Packaging MongoDB credentials and the encryption key together is especially sensitive: artifact compromise can expose database access and the key protecting stored tenant/provider credentials. SMTP and provider/API secrets have their own external account impact.

Restrict Amplify app/build/artifact/cache access and retention to necessary trusted principals; secure the connected source branch and build dependencies; never echo, upload for debugging, commit or place generated environment files in a public directory. `.env*`, including temporary generated names, remains ignored. Only this explicitly requested document is exempted from the existing docs ignore rule.

**Separate recommended future change, not implemented:** retrieve server secrets at runtime using AWS Secrets Manager or SSM SecureString. This needs an approved secret layout and nonsecret identifier, exact-resource compute-role read permissions (plus KMS decrypt permissions if required), a bounded/cached server-only loader before instrumentation validation and before MongoDB/crypto/provider consumers, and a reviewed initialization strategy. Build-time validation and any prerendering must be separated from real runtime secret retrieval without weakening production startup checks or fetching secrets back into the artifact. The current direct `process.env` consumers would need coordinated adaptation. No such dependency, IAM change or secret-management replacement was silently introduced.

The optional HTTP invoker already has its own Secrets Manager token retrieval in its undeployed template; that does not make the Next.js application's secrets runtime-managed.

## Publishing schedule design

New scheduled posts select one of six local times: 06:00, 09:00, 12:00, 15:00, 18:00 or 21:00, in the post's chosen IANA timezone. The server validates the slot; previously scheduled times remain valid unless changed. Publish Now is independent of these slots. Calendar drag opens the editor so the user can confirm the date and time.

A single six-times-per-day UTC cron cannot represent these local slots worldwide, including fractional offsets and daylight-saving transitions. The existing disabled `infra\worker-trigger.yaml` template invokes `/api/worker` every minute; the application compares due UTC timestamps and uses the existing claims, approval checks and subscription reservations. The local `npm run worker` poller invokes it every 30 seconds. Execution can be late because of trigger delays, outages, backlogs or provider processing; slots are not a delivery-time guarantee.

Interactive Studio media drafts are advanced by authenticated requests while the page is open, without invoking the worker sweep or processing other posts. Provider task IDs and reservations remain durable; after leaving the page, the user can resume a waiting draft from Posts. If provider submission is uncertain, it is not automatically repeated. The existing worker can still process queued media, including scheduled-media jobs, and also runs other maintenance phases.

This design does not provision, enable or validate a production trigger. Before production, confirm the hosting runtime, configure and authorize a reliable trigger and monitoring, and separately design the remaining periodic phases. Starting the current poller processes due publications and other queued work.

## Verification and remaining deployment work

| Check | Exact result |
| --- | --- |
| Source-derived environment audit | Passed; 27 runtime names plus 5 recognized platform names. Unsupported dynamic access and unreviewed names fail closed. |
| YAML parsing | Passed with the existing installed `js-yaml` parser in environment tests; commands, artifacts and cache assertions passed. No dependency added. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm test` | Passed: workflow, environment, client retries, offline PayPal billing, admin catalog, social lifecycle, worker AI and direct-upload suites. Expected sanitized failure-path logs in mocked suites are not live provider failures. |
| Environment handoff regression tests | Passed: missing required config, conditional VAPID/billing config, blank optional values, AWS/public-secret exclusion, repeatable atomic writes, no corruption on validation failure, injection rejection and Next.js quote/backslash/dollar roundtrips. |
| Isolated production initialization | Passed using synthetic config in a temporary directory, Next.js's actual loader and the unchanged instrumentation hook. No production DB/provider calls; generated files cleaned up. |
| Production check regression tests | Passed: `.env.production` loading, injected-value precedence and sanitized credential-bearing URL errors. |
| `npm run production:check` | Passed with ignored local configuration. This checks configuration, not external service access. |
| `npm run build` | Passed locally with Next.js 16.4.6; static generation and dynamic routes completed. Local build used `.env.local`; the handoff itself was separately tested with synthetic `.env.production`. |
| Browser asset secret-value inspection | Checked 35 files under `.next\static` in the final PayPal build against configured local server-secret values (raw, JSON-escaped and URL-encoded forms) without logging values; no matches. This is a bounded check, not a general proof against every possible data leak. |
| `npm run test:db` | PARTIAL: isolated native MongoDB initialization, constraints/transactions and entitlement/account suites passed. The unchanged media integration test then failed at `scripts\test-media-generation.mjs:117`, expecting an immediate approval notification. Existing automatic-media completion queues a durable worker notice (`src\lib\automatic-post-media.ts:34`); delivery is a separate worker phase (`src\lib\notification-service.ts:31-43`). No unrelated code/test changes were made to suppress this failure. The isolated replica set and temporary media directory were cleaned up. |
| Live Amplify SSR startup / MongoDB connectivity | Pending authorized manual deployment and observation. |
| Live S3 role identity, bucket region/access and media roundtrip | Unverified; not exercised by this task. |
| Real PayPal Sandbox checkout, signatures, renewals, revisions and refunds/disputes | Unverified; requires actual app credentials, registered webhook, published catalog, public HTTPS endpoint and Sandbox buyer approval. Offline tests and simulator events do not establish this. |

The final offline PayPal suite has 21 passing cases and the admin catalog suite has 12. Dispute policy was explicitly selected by the user: pending and seller-winning disputes retain already-verified paid access; refunds, reversals and backend-confirmed buyer-winning resolutions revoke the affected payment. Dispute handling re-fetches PayPal's current dispute and subscription/payment state instead of treating an old signed event as the current outcome. The REST app must have seller dispute-read access; denied or malformed responses remain retryable failures. Exact Sandbox permissions and event-to-transaction linkage remain deployment gates.

**Hosting compatibility caveat:** the installed Next.js version is 16.4.6, while AWS's currently published Amplify SSR support page lists versions 12-15. A local successful build does not prove Amplify's managed adapter supports this version. Confirm the hosting support/runtime compatibility before launch; this environment-only task did not downgrade the framework or deploy a different architecture.

After operator review, deploy the intended branch manually, verify the audited handoff/check/build gates run, and inspect startup logs for absence of the MongoDB instrumentation error without printing values. Confirm an actual SSR/database-backed authenticated request and the intended compute-role S3 behavior separately. If startup still fails, inspect branch-scoped name presence, artifact handoff and supported runtime/adapter behavior; do not remove validation to hide the failure.

## AWS references

- [Making environment variables accessible to server-side runtimes](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html) documents the pre-build `.env.production` handoff and explicitly warns about artifact readers.
- [Amplify support for Next.js](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html) describes the published managed SSR feature/version support.
- [Using an SSR compute role](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-SSR-compute-role.html) describes IAM-based AWS resource access.
- [PayPal authentication](https://developer.paypal.com/api/rest/authentication/), [idempotency](https://developer.paypal.com/api/rest/reference/idempotency/) and [subscription webhooks](https://developer.paypal.com/subscriptions/webhooks/) define server credentials, request-key retention and event delivery.
- [PayPal subscription revisions](https://developer.paypal.com/platforms/subscriptions/customize/revise-subscriptions) documents buyer reapproval and next-cycle changes.
- [Dispute details](https://developer.paypal.com/api/customer-disputes/v1/disputes-get/) and [outcome codes](https://developer.paypal.com/api/customer-disputes/v1/definitions/dispute_outcome_code/) support fetching current outcomes rather than revoking access for every dispute event.
