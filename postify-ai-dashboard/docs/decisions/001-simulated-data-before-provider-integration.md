# ADR 001: Build The Dashboard With Simulated Data First

## Status

Accepted.

## Context

Postify will publish to multiple social providers. Each provider has different OAuth requirements, permission scopes, account eligibility, media formats, approval processes, quotas, rate limits, and analytics availability. Implementing real providers before the dashboard workflow and internal contracts are defined would couple product decisions to external API details too early.

## Decision

Build the first dashboard using typed simulated accounts, destinations, publications, delivery results, and metrics. The simulation must represent the full documented lifecycle, including drafts, scheduled posts, successful delivery, partial failures, complete failures, stopped posts, canceled posts, empty states, and disconnected accounts.

Real providers will be added one at a time through server-side adapters that implement the same internal contracts.

## Consequences

- The product workflow can be validated without OAuth credentials, provider approval, or real social accounts.
- UI and feature code must not directly depend on a provider's response schema.
- Simulated data needs maintenance as domain contracts evolve.
- Production publishing remains unavailable until security, operational, legal, and provider-specific requirements are complete.