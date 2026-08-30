# Product Definition

## Purpose

Postify is a dashboard for people and businesses to manage social-media publications from one place. It begins with simulated data and well-defined publishing states; real provider APIs are introduced after the flows and domain model are stable.

The public landing page introduces the product, its workflow, social-platform coverage, and a free workspace call to action. It is the acquisition funnel; operational publishing is available only after a user registers or signs in.

## Users

- Personal account owners who manage their own social presence.
- Business teams that manage branded accounts, pages, organizations, channels, or boards.

## Core Capabilities

1. Authorize and manage social accounts.
2. Create, edit, save, and reuse publications.
3. Attach images or videos.
4. Select one or more destination networks and a specific account for each destination.
5. Publish immediately or schedule a publication for a future date and time.
6. Browse draft, scheduled, published, failed, canceled, and stopped publications.
7. Stop or cancel scheduled publications before they are sent.
8. View basic metrics: likes, comments, reach, and engagement.
9. Duplicate a publication and adapt its content to another network.

## Primary Workflow

1. A visitor learns about Postify on the public landing page and creates an account or signs in.
2. The user receives a personal workspace and can enter the protected dashboard.
3. The user authorizes a social provider through its official OAuth flow.
4. Postify discovers manageable destinations such as profiles, pages, organizations, channels, or boards.
5. The user creates a post, adds text and media, then chooses one or more destinations.
6. The user supplies destination-specific fields when needed, such as a Pinterest board or YouTube privacy.
7. The user saves a draft, publishes immediately, or schedules the post in their selected time zone.
8. Postify records a separate delivery result for each selected destination.
9. The user monitors results and adapts or reuses successful content where appropriate.

## Post Domain Model

| Field | Description |
| --- | --- |
| `id` | Internal publication identifier. |
| `title` | Optional internal label for recognizing a draft or campaign. |
| `content` | Canonical text content before destination-specific adaptations. |
| `media` | Ordered image and video attachments with metadata and storage references. |
| `destinations` | Selected provider accounts and their platform-specific settings. |
| `scheduledFor` | Optional ISO date-time used for future delivery. |
| `timeZone` | IANA time-zone identifier used to interpret scheduling. |
| `status` | Aggregate lifecycle status for the publication. |
| `deliveryResults` | Per-destination state, external reference, errors, and metrics. |
| `createdAt` / `updatedAt` | Audit timestamps. |

### Publication States

| State | Meaning | Allowed next states |
| --- | --- | --- |
| Draft | Editable and not queued for delivery. | Scheduled, publishing, canceled |
| Scheduled | Queued for a future delivery time. | Draft, publishing, canceled, stopped |
| Publishing | Delivery attempts are in progress. | Published, partially failed, failed |
| Published | Every selected destination succeeded. | None; can be reused |
| Partially failed | At least one destination succeeded and at least one failed. | None; failed destinations can be retried or reused |
| Failed | No selected destination succeeded. | Draft, publishing |
| Stopped | A scheduled publication was paused before delivery. | Draft, scheduled, canceled |
| Canceled | A scheduled or draft publication was intentionally abandoned. | Draft when restored by an explicit future feature |

The aggregate status must not hide destination outcomes. A multi-network post can be published for one account and failed for another.

## Metrics

The dashboard exposes basic per-destination metrics: likes or reactions, comments, reach, and engagement. The data model must record the retrieval time because availability, definitions, and refresh cadence vary by provider.

## Acceptance Criteria For The First Dashboard

- Users can navigate Overview, Posts, Calendar, Create Post, Analytics, Social Accounts, and Settings.
- The interface uses simulated accounts, posts, delivery results, and metrics only; it makes clear functional distinctions between states.
- A user can create a simulated post with media placeholders, multiple destinations, and immediate or scheduled delivery.
- Scheduled posts can be stopped or canceled before their scheduled time.
- Posts can be filtered or viewed by status.
- A published or failed post can be duplicated into a new editable draft.
- No screen requests or stores social-network passwords, tokens, client secrets, cookies, or technical account IDs from the user.

## Open Product Decisions

- Roles, team membership, and ownership boundaries for business accounts.
- Supported locales, default time zone, and calendar-week convention.
- Media size, duration, format, and storage-retention policies.
- Whether a stopped publication retains its original scheduled time or requires a new time.
- Retry policy, user notifications, and handling of partial failures.