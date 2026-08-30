# Dashboard Experience

## Navigation

The primary navigation begins with the following destinations:

- Overview
- Posts
- Calendar
- Create Post
- Analytics
- Social Accounts
- Settings

Navigation must clearly indicate the active location and remain usable on small screens through an accessible compact menu or navigation pattern.

## Public Landing

`/` is the public conversion page. It explains the product, workflow, platform coverage, and path to create an account. Its primary actions lead to `/register`; sign-in actions lead to `/login`. `/dashboard` is the protected operational workspace and redirects unauthenticated visitors to `/login`.

The landing supports English and Spanish. Text is stored as flat string keys in `components/landing/texts.json` and is supplied through `flat-i18n`. The selected language and light/dark theme are persisted locally in the browser. Both the language buttons and theme toggle need accessible pressed state or names.

## Visual Direction

The product uses a futuristic, high-contrast visual system: near-black and graphite surfaces, blue-to-violet accents, pale text, and restrained luminous depth. The public landing can use immersive radial light and gradient accents; the operational dashboard stays denser and more utilitarian, with clear panel boundaries and status colors. Preserve readable contrast and avoid using color alone to communicate a state.

### Design Principles

- **Quiet base, precise energy:** Near-black surfaces establish focus; blue and violet identify actions, selected states, and product energy.
- **Product before decoration:** The dashboard favors dense operational information, compact controls, and predictable panel structure. Landing pages can be more spacious and expressive.
- **Depth through surfaces:** Use subtle borders, layered graphite panels, and limited shadow or glow. Do not add floating decorative orbs, bokeh, or gradients without product context.
- **Stable typography:** Use fixed type sizes with responsive breakpoints, never viewport-scaled font sizing. Use a serif display face sparingly for high-level landing and authentication headings; use the sans-serif interface face for product controls and data.

### Core Tokens

| Role | Token or value | Usage |
| --- | --- | --- |
| Application background | `#090b16` | Dashboard canvas and deep product surfaces. |
| Sidebar/background depth | `#0d1020` | Persistent navigation and secondary dark regions. |
| Raised panel | `#101426` / `#161b31` | Cards, editors, dialogs, and data panels. |
| Boundary | `#252d4b` / `#34405f` | Borders, dividers, input outlines, and inactive controls. |
| Primary text | `#f4f6ff` | Headings and essential interface content on dark surfaces. |
| Muted text | `#9ba6c3` | Supporting labels, timestamps, and help text. |
| Product violet | `#8d67ff` | Selected navigation, emphasis, and focus states. |
| Product blue | `#4b8cff` | Primary controls and complement to violet gradients. |
| Positive | `#47c99b` | Successful publication, available connection, and positive movement. |
| Critical | `#ff8492` | Failure, disconnect, deletion, and destructive action. |

Primary conversion and command buttons use the blue-to-violet gradient from `#397cff` to `#8c4bff`. Use it for one dominant action in a local context; secondary actions use a graphite surface with a blue-gray border.

### Surface Rules

- **Landing (`/`):** Default to the deep dark treatment. Use one restrained radial blue-violet light field behind the hero, a real product preview or meaningful interface composition, and a gradient CTA. The lighter theme may use pale blue-violet surfaces while retaining dark ink and high contrast.
- **Authentication (`/login`, `/register`):** Use a dark, framed form panel with a high-contrast input surface. The supporting half of wide layouts may use a blue-violet field and concise product proposition.
- **Dashboard (`/dashboard`):** Use a near-black canvas, solid sidebar, graphite cards, compact 8-10 px corners, and high information density. Avoid landing-page hero proportions, oversized display type, or decorative treatment in routine workflows.
- **Admin (`/admin`):** Follow dashboard surface and control rules. Tables prioritize scanability, row separation, clear destructive actions, and readable empty or error states.

### Workspace Settings Data Management

Workspace settings and administrative model pages use the shared `WorkspaceSidebar` used by `/dashboard`; there must not be a second navigation pattern for admin workflows. Each model page uses a responsive data table with a text search, visible-record count, row-level edit/delete icon buttons, and a workspace selector for tenant-scoped records.

Create and edit forms open in a focused modal dialog. The deletion flow opens a separate destructive confirmation dialog; the user must type `DELETE` exactly before the final delete command is enabled. The server remains the source of truth for dependency and authorization errors, which must be shown in the table status message.

### Interaction And States

- Selected navigation uses a violet/blue-tinted surface plus text or icon emphasis, not color alone.
- Focus rings use violet with sufficient contrast against every panel and input surface.
- Success, scheduled, draft, and failed post states pair a label with a status chip; their color supports the label but does not replace it.
- Icon-only controls require an accessible name and a tooltip when the icon is not universally recognizable.
- Theme and language controls expose their selected state through `aria-pressed` or an equivalent accessible state.

## Screens

| Screen | User goal | Essential content and actions |
| --- | --- | --- |
| Overview | Understand publishing activity at a glance. | State totals, recent publications, upcoming scheduled posts, connected-account health, and metric summary. |
| Posts | Find and manage publications. | Search or filters, status, destinations, scheduled time, result summary, duplicate, edit draft, stop, or cancel where allowed. |
| Calendar | Plan upcoming content. | Time-zone-aware calendar of scheduled posts, clear status treatment, and access to edit or cancel. |
| Create Post | Compose and target a publication. | Text, media upload, destination selection, provider-specific fields, draft, publish now, and schedule actions. |
| Analytics | Review results. | Per-account and per-publication likes, comments, reach, engagement, and last-updated time. |
| Social Accounts | Authorize and manage destinations. | Authorize account, connection state, selected destinations, reconnect, and disconnect actions. |
| Settings | Configure workspace behavior. | Time-zone preference and future account or team settings. |

## Post Composer Flow

1. Capture canonical text and attachments.
2. Select one or more social destinations.
3. Show only the fields required by the selected destination, such as a Pinterest board or YouTube privacy.
4. Allow per-destination content adaptation without overwriting the canonical content.
5. Validate missing media, destination, and provider-specific requirements before publishing or scheduling.
6. Present Draft, Publish now, and Schedule as distinct commands with clear confirmation and outcome states.

## Status Communication

Use text plus a non-color cue for every publication state. For multi-network posts, show both the aggregate state and destination-level results. Failed results must provide a useful provider error summary when available, without revealing credentials or sensitive implementation details.

## Responsive And Accessibility Requirements

- Start from narrow screens, then enhance for larger dashboards; no essential action may rely on hover.
- Use semantic landmarks, headings, labels, native controls where possible, and logical keyboard order.
- Provide visible keyboard focus and accessible names for icon-only controls.
- Associate validation messages with their relevant input and announce asynchronous state changes appropriately.
- Do not convey publication state, chart meaning, or validation solely by color.
- Maintain readable contrast, allow text wrapping, and avoid horizontal scrolling in normal dashboard use.
- Confirm destructive actions such as Cancel publication and Disconnect account, and communicate their scope.

## Simulated Data Requirements

The initial interface should model realistic variations: empty states, drafts, future schedules, successful delivery, partial failure, complete failure, disconnected accounts, and unavailable metrics. Simulated data must never look like a real connected account or imply that OAuth has completed.