<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Context

Before making changes, read the relevant documents in `docs/`:

- `docs/product.md` for product scope, workflows, and post states.
- `docs/architecture.md` for planned technical boundaries, OAuth, provider constraints, and security requirements.
- `docs/ui-guidelines.md` for dashboard navigation, screens, responsive behavior, and accessibility.
- `docs/development.md` for the delivery plan, commands, and validation expectations.
- `docs/decisions/` for accepted architectural decisions.

Keep these documents current when a change affects their subject. Do not place secrets, OAuth tokens, passwords, or production account identifiers in documentation or source control.
