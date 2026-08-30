# Architecture And Integrations

## Initial Technical Direction

MongoDB is the selected initial database. It will persist workspaces, user or business profiles, social-account connections, publications, per-destination delivery results, metrics snapshots, and audit records. The specific MongoDB hosting service and encryption-key provider remain open decisions.

The application uses Next.js with the App Router, TypeScript, React, and Tailwind CSS. The initial release renders simulated domain data so that the dashboard, data contracts, lifecycle states, and workflows can be validated before external publishing is enabled.

The proposed source layout is a target structure, not a requirement to create every directory before it has an owner:

```text
src/
  app/
    (auth)/
    dashboard/
    posts/
    calendar/
    analytics/
    accounts/
    api/
  components/
    dashboard/
    posts/
    calendar/
    ui/
  features/
    publishing/
    scheduling/
    analytics/
    social-accounts/
  lib/
    auth/
    database/
    storage/
    social/
  types/
```

## Bounded Areas

| Area | Responsibility |
| --- | --- |
| `publishing` | Post composition, validation, destination adaptation, and delivery results. |
| `scheduling` | Time-zone-safe scheduling, queue state, cancellation, and stopping. |
| `analytics` | Normalized metrics and provider refresh timestamps. |
| `social-accounts` | OAuth lifecycle, discovered destinations, account selection, and revocation. |
| `storage` | Private media uploads and references; providers receive media through supported flows. |

## OAuth And Account Connection

Social accounts are connected only through each provider's official OAuth flow:

1. The user selects an authorization action, such as Connect Instagram.
2. Postify redirects the user to the provider's official authorization page.
3. The provider authenticates the user and presents consent.
4. The provider redirects back to a registered Postify callback with an authorization result.
5. Postify exchanges the result server-side, encrypts provider credentials, and discovers manageable destinations.
6. The user chooses the specific profile, page, organization, channel, or board to manage.

Never request, handle, or persist a provider password. Never expose access tokens, refresh tokens, client secrets, or OAuth callback state to client components, logs, documentation, or source control.

## Provider Requirements To Verify Before Integration

Provider capability and approval terms change. Confirm current official documentation, scopes, rate limits, media requirements, and review requirements immediately before implementation.

| Provider | Intended destinations | Key constraints |
| --- | --- | --- |
| Instagram | Professional Business or Creator profiles | Personal profiles are not a supported publishing target; capabilities such as Stories can have additional restrictions. |
| Facebook | Managed Pages | The authorizing user needs a suitable Page role; personal-profile publishing is out of scope. |
| LinkedIn | Personal profiles and authorized organizations | Organization publishing and analytics can require reviewed Community Management access and administrative roles. |
| Pinterest | Boards belonging to a Business account | Each Pin requires a destination board; application access and account tier require verification. |
| X | Authenticated user account | OAuth 2.0 and offline access are needed for scheduled delivery; pricing and API access tiers affect feasibility. |
| YouTube | Authorized channel | Uploading requires video-specific metadata and consumes quota; standard channels generally require user OAuth. |

### Destination-Specific Inputs

- Pinterest: destination board.
- YouTube: title, description, video, optional thumbnail, privacy, category, made-for-kids declaration, and optional tags.
- All providers: selected managed destination and any media/content constraints required by the provider.

## Security And Operations

- Encrypt provider tokens at rest and restrict decryption to server-side delivery and refresh processes.
- Store only the least-privileged scopes necessary for enabled features.
- Support token expiration, refresh, revoked authorization, and reconnect states.
- Maintain audit records for account connections, authorization changes, publication attempts, provider responses, retries, and cancellation actions.
- Treat provider rate limits, quotas, retry behavior, idempotency, and partial delivery as first-class integration concerns.
- Keep uploaded media private until a provider-specific publishing workflow requires access.
- Prepare production legal endpoints: privacy policy, terms, data-deletion instructions, OAuth callbacks, and a verified product domain.

### Initial Media Storage

During the development phase, image and video files are stored locally under a profile-scoped directory such as `storage/profiles/<profile-id>/media/`. MongoDB stores the metadata and relative storage reference, not the binary file itself. The profile identifier must be an internal opaque identifier, not a provider account ID or a user-controlled path segment. Validate file type and size, generate server-side filenames, and ensure this local directory is excluded from version control.

This is a traceability-first development arrangement. Production media storage must move to private object storage before multi-instance deployment or real provider publishing.

## Integration Boundary

UI components must depend on internal typed contracts rather than provider response shapes. Provider adapters translate between each external API and Postify's account, destination, publication, delivery-result, and metrics models. This keeps simulated data and real providers interchangeable at the feature boundary.

## Multitenancy

A `Profile` is the tenant boundary for a personal identity or business workspace. `ProfileMembership` grants a `User` one of four roles: `owner`, `admin`, `editor`, or `viewer`. Campaigns, social accounts, media, and posts carry the tenant `profileId`; posts may additionally belong to a `Campaign`.

All tenant-scoped API reads and mutations derive the actor from the authenticated server session and confirm the actor's membership before access: viewers can read, editors can create or update, and admins can delete or manage memberships. Browser-provided user identities are never trusted for tenant authorization.

## Authentication

Postify uses email and password authentication backed by MongoDB. Passwords are hashed with bcrypt before storage and are never returned from the database. Successful registration or login creates a seven-day signed JWT session in an `httpOnly`, `sameSite=lax` cookie. The session token is signed with `SESSION_SECRET` and is read only by server-side code. Registration creates a personal Profile tenant and assigns the registered user its `owner` membership.

`MONGODB_URI` and `SESSION_SECRET` are mandatory for authentication. `.env.example` lists placeholders for these values plus future AI and OAuth provider credentials; production values belong only in deployment-managed environment configuration.

## Initial HTTP API

Route Handlers under `app/api/` expose the first server-side persistence boundary. They use MongoDB only on request and do not accept provider credentials from the browser.

| Endpoint | Methods | Responsibility |
| --- | --- | --- |
| `/api/users`, `/api/users/[userId]` | `GET`, `POST`, `PATCH`, `DELETE` | Create, list, update, and delete workspace users. |
| `/api/profiles`, `/api/profiles/[profileId]` | `GET`, `POST`, `PATCH`, `DELETE` | Manage profiles and their owner record. |
| `/api/accounts`, `/api/accounts/[accountId]` | `GET`, `POST`, `PATCH`, `DELETE` | Manage profile destinations discovered through provider authorization. |
| `/api/posts`, `/api/posts/[postId]` | `GET`, `POST`, `PATCH`, `DELETE` | Manage posts, editable content, scheduling, and non-delivery statuses. |
| `/api/posts/[postId]/sync` | `POST` | Refresh provider metrics; currently simulates provider results. |
| `/api/media` | `POST` | Store a validated image or video under the internal profile media directory. |

Authentication and ownership checks are intentionally pending the authentication decision. These routes are development-only until every request is bound to the authenticated user and verified profile membership.

The development-only administration pages at `/admin/users`, `/admin/profiles`, `/admin/accounts`, and `/admin/posts` consume these APIs to manage persisted records. The endpoints prevent a destructive deletion when related records still exist.

## Open Technical Decisions

- Authentication provider and multi-tenant authorization model.
- MongoDB hosting, encrypted-secret storage, and key-management service.
- Production media object storage and asynchronous processing pipeline.
- Job queue, scheduler, retry strategy, and observability stack.
- Metrics refresh cadence, retention, and normalization rules.