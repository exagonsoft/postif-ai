# POSTIF-AI — AI-Powered Social Media Automation SaaS
**Developed by ExagonSoft** | *Create Once. Publish Everywhere. Grow Automatically.*

## Technology Stack
- **Framework:** Next.js 16.2.6 (App Router exclusively, React 19.2.6, strict TypeScript)
- **Styling:** Tailwind CSS v4 with Dark-First + Optional Light Mode theme tokens
- **Database:** PostgreSQL with Drizzle ORM (`src/db/schema.ts`, `src/db/index.ts`)
- **Security:** AES-256-GCM encryption for BYOK OpenAI API keys (`src/lib/crypto.ts`), scrypt password hashing, HTTP-only session cookies, and tenant isolation

## Environment Variables
- `DATABASE_URL` *(Required — pre-configured in `.env`)*: PostgreSQL connection URI
- `ENCRYPTION_SECRET` *(Optional)*: 32+ char key for AES-256-GCM BYOK OpenAI API key encryption
- `OPENAI_API_KEY` *(Optional)*: Enables live OpenAI API calls in Managed AI mode (falls back transparently to the local deterministic generator when omitted)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` *(Optional)*: Enables live Stripe checkout/webhook processing
- `LINKEDIN_CLIENT_ID`, `X_CLIENT_ID`, `META_APP_ID`, `TIKTOK_CLIENT_KEY`, `PINTEREST_APP_ID`, `GOOGLE_CLIENT_ID` *(Optional)*: Enables live OAuth 2.0 provider connectors

## Operational vs. Simulated Functionality
- **Fully Operational (PostgreSQL-backed):** Authentication & Demo Workspace switching, 11-step Onboarding & AI Brand Discovery, Multi-platform AI Content Studio, Smart Content Repurposing, Monthly/Weekly/Daily/List Content Calendar with Drag-and-Drop, Persistent Publishing Job Queue with Retry, Autonomous AI Marketing Agent (Manual / Assisted / Autopilot + Pause + Approval Inbox), Campaign Architect, Media Library & Aspect Ratio Presets, Analytics with CSV Export, Multi-Brand RBAC Workspaces, Dual-Dimension Billing (Plan Tiers + Encrypted BYOK Vault / Managed Credits), Notification Center, and Operator Admin Console.
- **Simulated Sandbox Adapters (Clearly Labeled in UI):** External OAuth 2.0 callbacks, external social network publishing HTTP calls, Stripe checkout redirects, and OpenAI completions when no live `OPENAI_API_KEY` or BYOK `sk-...` key is supplied.
