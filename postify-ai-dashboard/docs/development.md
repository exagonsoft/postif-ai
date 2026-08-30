# Development Plan

## Delivery Stages

1. Define TypeScript domain contracts for publications, destinations, account connections, delivery results, and metrics.
2. Build the dashboard shell and primary navigation with simulated data.
3. Implement post list, composer, scheduling controls, lifecycle states, and reusable-post workflow against simulated feature services.
4. Build account-connection and analytics views with explicit simulated states.
5. Select and implement authentication, persistence, media storage, and background scheduling.
6. Add provider adapters one at a time after each provider's current documentation, approval requirements, and production credentials are available.
7. Add automated tests, operational monitoring, and production compliance material before enabling real publishing.

## Current Project Baseline

- Framework: Next.js 16.3.3 with the App Router.
- Language: TypeScript.
- UI: React 19 and Tailwind CSS 4.
- Lint command: `npm run lint`.
- Production build command: `npm run build`.
- Local development command: `npm run dev`.
- Planned persistence: MongoDB, introduced after simulated contracts are extracted from the dashboard.
- Development media location: `storage/profiles/<profile-id>/media/`; the directory is not committed.

Read the relevant bundled documentation under `node_modules/next/dist/docs/` before using Next.js APIs. The installed documentation matches the installed framework version.

## Implementation Conventions

- Prefer Server Components; introduce client components only for browser APIs, events, or client-side state.
- Keep provider integrations behind server-side feature or adapter boundaries.
- Keep test fixtures and simulated services aligned with documented domain states.
- Do not commit environment files containing credentials or any OAuth artifact.
- Never use a profile display name directly as a filesystem path. The server creates the profile-scoped media path from an internal identifier.
- Add dependencies only when an existing project capability or standard browser/Next.js API cannot meet the requirement.
- Keep landing copy in `components/landing/texts.json` as flat string keys. Initialize `flat-i18n` once in `components/landing/i18n.ts` before rendering translated landing components.
- The public landing belongs at `/`; protected product workflows belong under `/dashboard` and related authenticated routes.

## Validation Expectations

- Run the narrowest relevant check after a focused change.
- Run `npm run lint` for frontend changes.
- Run `npm run build` for route, rendering, configuration, deployment, or integration-boundary changes.
- Exercise status transitions and destination-level outcomes with simulated data before connecting a provider.
- Verify responsive behavior and keyboard access for changed user-facing workflows.

## Environment Placeholders

Provider credentials, encryption keys, database credentials, storage configuration, OAuth callback URLs, and any queue configuration remain intentionally undefined until the corresponding architecture decisions are approved. Store them in deployment-managed environment configuration, not in the repository.