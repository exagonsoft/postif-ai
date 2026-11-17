# Managed social OAuth migration

## Architecture audit (before implementation)

The existing implementation was inspected before editing. Reuse:

- `src/db/schema.ts`: workspace/brand-scoped `social_accounts`, encrypted
  `social_credentials`, existing audit log and membership/session collections.
- `src/db/social-lifecycle-schema.ts`: hashed, expiring, single-use OAuth attempts,
  lifecycle reporting and real provider analytics observations. Existing payload
  storage is encrypted JSON and can accommodate selection without schema migration.
- `src/app/api/social/oauth/[platform]/start/route.ts` and `callback/route.ts`:
  owner/admin checks, user/workspace/brand/provider binding, ten-minute state,
  one-time consumption, X/Google S256 PKCE and fixed HTTPS callbacks.
- `src/lib/social-oauth-provider.ts`: official provider endpoints, bounded requests,
  long-lived Meta exchanges and provider-specific refresh-token responses.
- `src/lib/social-provider.ts`: strict credential schema, official identity checks,
  eight existing publishing adapters, durable media processing and uncertainty handling.
- `src/lib/social-connect.ts` and `social-lifecycle.ts`: encrypted persistence,
  workspace locks before channel counts, account refresh leases and token CAS.
- `src/lib/social-analytics-provider.ts`: existing provider-specific analytics.
- `src/lib/entitlements.ts`: retained connections and oldest-channel allowance
  after downgrades; brand, publishing, channel and feature limits.
- `src/lib/auth.ts` and `crypto.ts`: existing sessions, roles and AES-256-GCM.
- `SocialAccountsClient.tsx` and `/app/social/page.tsx`: existing advanced manual
  and customer-owned OAuth forms, callback display and lifecycle management.
- `src/i18n/translations.json`: four complete flat dictionaries.
- `runtime-config.ts`, `env_sample`, `config/amplify-env.json`,
  `prepare-amplify-env.mjs`, `audit-amplify-env.mjs`, `test-amplify-env.mjs`:
  server-only configuration, allowlisting, secret-safe serialization and audits.

Identified gaps: the default UI requires developer credentials; Facebook,
Instagram and Pinterest require destination IDs before authorization; no managed
provider configuration or post-consent selector exists; analytics permissions are
requested by default; disconnection only deletes local credentials; two dashboard
counts explicitly exclude any integration mode other than customer credentials.
The publishing worker itself accepts existing account credentials independently
of connection mode and will be preserved.

## Managed architecture — IMPLEMENTED / VERIFIED LOCALLY

Facebook was implemented and tested end-to-end first, then the other providers.
The existing start/callback paths serve both modes. A request without customer
credentials defaults to managed mode; existing credential payloads remain the
advanced flow. Client-supplied managed credential markers are rejected.

1. Authenticated owner/admin starts a JSON, same-origin request. Configuration and
   brand entitlements are checked before generating a 256-bit random state.
2. Its SHA-256 hash and encrypted payload are saved in the existing OAuth-attempt
   collection. State expires after ten minutes and is bound to user, workspace,
   brand and provider. Managed states have a non-secret `m_` namespace prefix.
3. Callback validates state and the stored canonical redirect, atomically consumes
   and clears the authorization payload, exchanges the code on the server and
   discovers authorized destinations. Denials also consume state. X and Google
   use S256 PKCE; unsupported PKCE parameters are not invented for other
   confidential web flows.
4. A separate 256-bit, hashed, ten-minute selection ticket holds encrypted
   candidate tokens. Selection hashes use a distinct `select:` namespace and
   cannot substitute for authorization state. Only public destination DTOs reach
   the browser. Account IDs supplied outside that candidate set are rejected.
5. Selection revalidates the provider identity and required video declarations.
   The ticket is consumed/cleared in the **same MongoDB transaction** as the
   workspace quota lock, current plan check, encrypted credentials and audit
   event. Failure rolls back ticket consumption. Concurrent callbacks cannot
   bypass channel limits.

Callback paths and token/identity endpoints are fixed server-side. User-provided
redirects and provider pagination URLs are never followed. Discovery rebuilds
official URLs with bounded cursors/pages and fails explicitly if incomplete.
Provider/request deadlines and redirect rejection reuse the existing transport.

The eight-card UI explains permissions before redirecting, offers approved
analytics only after explicit opt-in, displays authorized destinations, requires
explicit video privacy/audience declarations, and reports success only after
the selection API confirms persistence. The technical forms remain collapsed
under **Advanced — Use your own developer credentials**. All new UI strings,
availability statuses and managed errors are translated in en/es/de/pt-BR.

Managed token records contain the app client ID as a binding, **not the server
app secret**. Refresh resolves the current server secret and rejects a different
client ID. Existing refresh rotation, expiry, account leases and encrypted
compare-and-swap remain in place. Analytics opt-out prevents worker requests.
Provider-issued refresh expiry is honored; no refresh grant is fabricated.

## Provider status and setup

All eight flows are **IMPLEMENTED**, **VERIFIED LOCALLY** with mocked provider
responses, and **REQUIRES PROVIDER CONFIGURATION** /
**REQUIRES LIVE VERIFICATION**. These labels do not certify provider access,
an app review, or actual authorization.

| Provider | Authorized destination and minimal publishing scopes | Additional gates / lifecycle |
| --- | --- | --- |
| Facebook Pages | Discover `/me/accounts`, require content-creation tasks, select an actual Page. `pages_show_list pages_manage_posts pages_read_engagement`. Confirm granted permissions before offering Pages. | **REQUIRES PROVIDER APPROVAL** for serving external customers. Exchange short user token to long user token, then retain only the selected Page token. No scheduled expiry is not a permanent validity guarantee; invalidation requires reauthorization. Optional analytics adds `pages_read_user_content`. |
| Instagram | Instagram Login professional account, confirmed `account_type` and identity. `instagram_business_basic instagram_business_content_publish`. No arbitrary professional-account ID. | **REQUIRES PROVIDER APPROVAL** / Advanced Access for accounts not owned/managed by the app owner. Instagram-specific app credentials, not Facebook app credentials. Sixty-day long-lived exchange uses actual returned expiry; refresh requires valid token at least 24 hours old. Optional reviewed insights only. |
| LinkedIn | Member identity via userinfo; `openid profile w_member_social`. Optional organization flow discovers approved ACLs and names, accepts only ADMINISTRATOR/CONTENT_ADMINISTRATOR, rechecks the initiating member's ACL before selection. | Organizations **REQUIRES PROVIDER APPROVAL** for Community Management and explicit operator enablement; supported `YYYYMM` version required. No sponsored-content-only role is accepted for managed organic posting. `w_organization_social r_organization_admin` requested only for that mode; discovery does not need organization-admin write access. Refresh only if LinkedIn actually issued a grant to an eligible app. |
| X | `/2/users/me`; `tweet.read tweet.write users.read media.write offline.access`; confidential web client and mandatory S256 PKCE. | Actual developer-project/API access and permitted automation are external gates. Refresh retains rotated grants. No pricing tier is inferred or promised. |
| TikTok | Login Kit + creator-info query; `user.info.basic video.publish`, optional reviewed `user.info.stats`. Real creator privacy options; explicit AI declaration. Unreviewed managed posting is restricted to `SELF_ONLY`. | **REQUIRES PROVIDER APPROVAL** for required products/scopes; public Direct Post is **BLOCKED** until the app audit and complete product-compliance review. Connection-level choices alone do not certify TikTok's per-post privacy, preview/edit, commercial/music consent and interaction UX requirements. The existing publishing adapter is preserved, not certified as passing that audit. Rotating refresh token and `open_id` are validated. |
| Pinterest | Discover owned boards, excluding other users' collaborator boards. `boards:read pins:write user_accounts:read`; optional analytics adds `pins:read`. Each board is a distinct destination and channel. | **REQUIRES PROVIDER APPROVAL** / appropriate production API access. Business-account eligibility and actual board access remain provider-enforced. Continuous refresh explicitly requested; preserve returned rotated token and expiry. `/oauth/token/revoke` in the current official schema is **system-user only**, so do not use it for these user grants. |
| YouTube | Discover authorized channels, not a pasted ID; `youtube.upload youtube.readonly`, S256 PKCE and offline consent. Explicit made-for-kids and visibility selection. | **REQUIRES PROVIDER APPROVAL** where Google OAuth verification/upload audit applies. Default managed visibility is private-only. Non-private posting requires the operator's attestation of the necessary audit. Google can still restrict actual visibility; existing processing/visibility checks remain. |
| Threads | Verified `/me` account; `threads_basic threads_content_publish`, optional reviewed `threads_manage_insights`. Current official hosts are `threads.com` and `graph.threads.com`. | **REQUIRES PROVIDER APPROVAL** for required external-account access. Real long-lived exchange/expiry and documented unexpired-token refresh; no generic refresh-token grant. |

Instagram/Threads insights and LinkedIn analytics are requested only after both
operator approval configuration and user opt-in. No optional insights scope is
silently added to ordinary managed onboarding. Existing plan analytics
entitlements still apply even when scopes are granted.

### Official references consulted

- [Facebook Pages getting started](https://developers.facebook.com/documentation/pages-api/getting-started)
  and [long-lived user/Page tokens](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived).
  The getting-started page currently also spells a permission
  `pages_manage_read_engagement`; the implementation retains the existing
  `pages_read_engagement` permission rather than inventing a replacement.
  Confirm the actual approved permission in the app dashboard/live test.
- [Instagram Business Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login).
- [Threads access tokens and permissions](https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions).
- [LinkedIn organization ACLs](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role)
  and [native-only PKCE flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native).
  Native PKCE endpoints are not substituted for the confidential web flow.
- [X authorization-code PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code).
- [TikTok web Login Kit](https://developers.tiktok.com/docs/en/login-kit-web),
  [token lifecycle](https://developers.tiktok.com/docs/en/oauth-user-access-token-management),
  [revocation](https://developers.tiktok.com/docs/en/oauth-revoke-a-user-access-token)
  and [content-sharing guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines).
- [Pinterest official OpenAPI](https://github.com/pinterest/api-description/blob/main/v5/openapi.yaml):
  `/oauth/token`, `/boards`, token response fields and system-user-only revocation.
- [Google confidential web-server flow and revocation](https://developers.google.com/identity/protocols/oauth2/web-server).

## Required environment configuration

No values were invented or configured. Existing deployments default to managed
providers disabled. `env_sample` and the Amplify runtime allowlist contain exactly
these optional server-side settings:

| Setting | Meaning |
| --- | --- |
| `SOCIAL_MANAGED_PROVIDERS` | Comma-separated enabled provider identifiers; blank disables new managed authorization. |
| `SOCIAL_OAUTH_APPROVED_PROVIDERS` | Providers whose app production access the operator has actually obtained. Configured-but-unapproved cards show approval required. |
| `SOCIAL_OAUTH_ANALYTICS_PROVIDERS` | Reviewed optional reporting integrations, requested only after user consent. |
| `SOCIAL_OAUTH_PUBLIC_POSTING_PROVIDERS` | Only `tiktok,youtube`; blank means private-only. Never set before required provider audit AND product-compliance verification. |
| `FACEBOOK_OAUTH_CLIENT_ID`, `FACEBOOK_OAUTH_CLIENT_SECRET` | POSTIF-AI Facebook app. |
| `INSTAGRAM_OAUTH_CLIENT_ID`, `INSTAGRAM_OAUTH_CLIENT_SECRET` | POSTIF-AI Instagram Login app. |
| `LINKEDIN_OAUTH_CLIENT_ID`, `LINKEDIN_OAUTH_CLIENT_SECRET` | POSTIF-AI LinkedIn app. |
| `X_OAUTH_CLIENT_ID`, `X_OAUTH_CLIENT_SECRET` | POSTIF-AI confidential X web client. |
| `TIKTOK_OAUTH_CLIENT_ID`, `TIKTOK_OAUTH_CLIENT_SECRET` | TikTok client key and secret. |
| `PINTEREST_OAUTH_CLIENT_ID`, `PINTEREST_OAUTH_CLIENT_SECRET` | POSTIF-AI Pinterest app. |
| `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET` | POSTIF-AI Google web client. |
| `THREADS_OAUTH_CLIENT_ID`, `THREADS_OAUTH_CLIENT_SECRET` | POSTIF-AI Threads app. |
| `META_GRAPH_API_VERSION` | Existing default `v27.0`, configurable to a supported version. |
| `LINKEDIN_API_VERSION` | Required supported `YYYYMM` for enabled managed LinkedIn. |
| `LINKEDIN_ORGANIZATIONS_ENABLED` | Default false; true requires actual Community Management access. |

Enabling any managed provider requires its complete client pair and public HTTPS
`APP_URL`. Credentials remain optional when that provider is disabled.
Approval flags are operator attestations, not a provider review API and not proof
that a provider will authorize those scopes. Secrets never use `NEXT_PUBLIC_`.
No customer access/refresh token belongs in environment configuration.

### Exact production callbacks

Register exact values, without a trailing slash or query:

| Provider | Callback |
| --- | --- |
| Facebook | `https://postifai.app/api/social/oauth/facebook/callback` |
| Instagram | `https://postifai.app/api/social/oauth/instagram/callback` |
| LinkedIn | `https://postifai.app/api/social/oauth/linkedin/callback` |
| X | `https://postifai.app/api/social/oauth/x/callback` |
| TikTok | `https://postifai.app/api/social/oauth/tiktok/callback` |
| Pinterest | `https://postifai.app/api/social/oauth/pinterest/callback` |
| YouTube | `https://postifai.app/api/social/oauth/youtube/callback` |
| Threads | `https://postifai.app/api/social/oauth/threads/callback` |

Set `APP_URL=https://postifai.app` in that deployment. Staging needs separately
registered HTTPS callbacks on its own actual origin, with the initiating user
signed into that origin. Local HTTP cannot be advertised as an OAuth production
callback. No arbitrary redirect or developer-supplied token endpoint is accepted.

## Disconnection, privacy and security review

- Existing AES-256-GCM encryption and tenant/session/role infrastructure are
  preserved. No new collection, ORM, auth service or database migration.
- Authorization/selection payloads and candidates are encrypted; consumed payloads
  are cleared and existing expiry/TTL cleanup removes expired attempts.
- Only the selected Facebook Page token persists. Intermediate user tokens and
  unselected destination tokens are not copied into account credentials.
- Provider app secrets remain server-owned; selection responses and React props
  contain no access tokens, refresh tokens or app secrets.
- Same-origin JSON mutation checks complement session cookies and bound random
  OAuth state. Provider/user/workspace substitution, account tampering, expiry
  and replay are rejected.
- Existing quota enforcement is reused transactionally, including concurrent
  selections. Reconnect matches stable provider identity even after a handle
  changes; Pinterest board IDs distinguish separate destinations. Over-limit
  records are retained; existing publishing policy is unchanged.
- Connection/disconnection audit events record metadata only, never credentials.
  Transport failures omit raw provider bodies and tokens. Next.js incoming request
  logs exclude social OAuth routes and the selection page; the page also sends
  `Referrer-Policy: no-referrer`. Configure hosting/APM
  access logs to redact callback/selection query strings: OAuth authorization
  codes/state/tickets appear in protocol URLs even though application logs do
  not print credentials.
- Default disconnect removes **only local account credentials**, preserving the
  existing behavior and explicitly warning that provider authorization remains.
  Google/TikTok managed connections additionally offer explicit grant revocation
  with a shared-grant warning. Revocation is serialized with token renewal and
  must be confirmed before a successful revoked result; failure retains local
  credentials so the user can retry or choose local-only removal.
- Google revocation can remove all scopes/tokens for that user's project and
  affect other connections/workspaces. It is never silently triggered by
  removing a single destination. No cross-workspace credentials are read.
- Facebook/Instagram/Threads/LinkedIn/X/Pinterest use provider-account settings
  for remote removal in this implementation. No undocumented revoke endpoint is
  fabricated. Provider-specific deauthorization/data-deletion webhooks and app
  review privacy URLs must be registered/reviewed by the operator as required;
  this migration does not claim to implement a universal deletion callback.
- Social passwords are never requested or stored. AI BYOK and social BYO apps
  remain independent; Starter BYOK customers can use managed social OAuth.

This is an implementation review and regression assessment, not an independent
penetration test or a certification of provider privacy compliance.

## Compatibility and migration

Legacy accounts and encrypted credentials are not rewritten or deleted. Existing
advanced start payloads, manual tokens, public X clients, publishing declarations,
refresh flows and analytics continue to work. New fields are optional inside the
existing encrypted credential JSON. Existing unmarked credentials keep their
existing analytics behavior; explicit opt-out is respected.

Managed accounts use `integrationMode=managed_oauth`; dependent dashboard counts
include both modes. Each connected destination counts against the same existing
plan limit. No PayPal/catalog/subscription logic changed. No reauthorization is
required solely to retain an existing connection. Operators may enable providers
independently; disabling new managed onboarding does not delete connections.

## Exact files changed

- `.gitignore` (include the explicitly requested migration document)
- `README.md`, `docs/AMPLIFY_ENV_CONFIGURATION.md`, this document
- `env_sample`, `config/amplify-env.json`, `src/lib/runtime-config.ts`, `next.config.ts`
- `src/lib/social-managed-config.ts`, `social-managed-types.ts`,
  `social-managed-provider.ts`, `social-managed-oauth.ts`,
  `social-managed-revocation.ts`
- `src/lib/social-oauth-provider.ts`, `social-provider.ts`,
  `social-connect.ts`, `social-lifecycle.ts`
- `src/app/api/social/oauth/[platform]/start/route.ts`,
  `callback/route.ts`, `select/route.ts`, `src/app/api/social/route.ts`
- `src/app/app/social/page.tsx`, `src/components/SocialAccountsClient.tsx`,
  `src/components/ManagedSocialConnect.tsx`, `src/i18n/translations.json`
- `src/app/app/page.tsx`, `src/lib/platform-admin.ts`
- `package.json`, `scripts/test-social-lifecycle.mjs`,
  `scripts/test-social-managed-ui.mjs`, `scripts/test-social-managed-mongo.mjs`,
  `scripts/test-mongo.mjs`

## Validation results

| Check | Result |
| --- | --- |
| `npm run typecheck` | **VERIFIED LOCALLY**; passed. |
| `npm run lint` | **VERIFIED LOCALLY**; passed. |
| `npm test` | **VERIFIED LOCALLY**; all offline suites passed (332 Node test cases plus standalone assertion suites). No real providers called. |
| `node --test scripts/test-social-lifecycle.mjs scripts/test-social-managed-ui.mjs` | **VERIFIED LOCALLY**; 61 covered, including all eight mocked managed flows, confidentiality, expiry, identity/state/workspace isolation, selection, refresh, quota and legacy behavior; these also run in the full offline suite. |
| `npm run test:db -- --managed-social` | **VERIFIED LOCALLY**; isolated replica-set repository/entitlement checks and real concurrent managed selection, quota lock, atomic ticket rollback, replay and secret-exclusion assertions passed. No staging/production DB used. |
| `npm run test:db` | **BLOCKED** by existing media approval-notification assertion at `scripts/test-media-generation.mjs:117` (`0 !== 1`). Reproduced on untouched HEAD in a temporary detached worktree; not introduced by this migration. That worktree was removed. |
| `npm run test:db -- --social` | Existing social publishing assertions ran, then failed at unrelated legacy AI usage-count assertion `scripts/test-social.mjs:254` (`2 !== 0`). This suite is not reported as passing. |
| `$env:CIRCLE_NODE_TOTAL='2'; npm run build` | **VERIFIED LOCALLY**; production build passed, including new selection route. |
| `npm run production:check` | **VERIFIED LOCALLY**; configuration validation passed; does not certify external provider configuration/access. |
| `node scripts/audit-amplify-env.mjs` and existing environment tests | **VERIFIED LOCALLY**; exact runtime allowlist/reader/template coverage passed. |
| Unauthenticated local `HEAD /app/social` | **VERIFIED LOCALLY**; login redirect returned `Referrer-Policy: no-referrer`. No authenticated account access. |
| Real OAuth, publishing, revocation and analytics | **REQUIRES LIVE VERIFICATION** for every provider. No live authorization or posting was performed. |

## Remaining operator/manual actions

1. Create/configure actual POSTIF-AI developer applications and obtain their
   real credentials, API products, account eligibility and required app reviews.
2. Register the exact callbacks and privacy policy, terms, deauthorization and
   data-deletion requirements in each provider dashboard. Verify minimal scopes
   and actual grant responses; resolve the noted Meta permission documentation
   discrepancy against the live app.
3. Configure the matching server-only Amplify variables, approve only actual
   reviewed integrations, and enable one provider at a time. Never use approval
   flags to bypass a missing provider approval.
4. Keep public TikTok posting disabled pending the required audit and complete
   post-level consent/product compliance work. Confirm Google upload audit and
   actual resulting visibility before allowing non-private managed uploads.
5. Run authorized real-account tests for consent/denial, destination choice,
   publishing, token expiry/rotation, remote revocation, provider-side removal
   and current-version analytics. Capture review evidence without logging tokens.
6. Resolve the separately documented baseline integration-suite failures before
   treating the entire repository integration gate as green.
7. Review access-log redaction and provider-specific data-retention/deletion
   handling before deployment. Deployment is deliberately manual.

**No deployment, MongoDB migration, existing account deletion, credential
configuration or PayPal modification was performed.**
