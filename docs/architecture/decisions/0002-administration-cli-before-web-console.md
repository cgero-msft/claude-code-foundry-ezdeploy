# ADR 0002: Start with an administration CLI

- Status: Accepted
- Scope: Administration experience

## Context

The PRD calls for an admin console. The repository currently has an anonymous local wizard and an authenticated Cloud Shell execution path. Adding Azure authentication to the local `file://` wizard would change its security and distribution model.

## Decision

Build an authenticated administration CLI first. Preserve the anonymous wizard for discovery and manifest generation. A future web console must call the same validation, planning, deployment, and evidence contracts rather than implementing a separate control plane.

## Rationale

A CLI is easier to automate, test, audit, and run in customer-controlled environments. It avoids creating a hosted multi-tenant administration service before tenancy, support, data retention, and identity requirements are settled.

## Consequences

- The first release will not satisfy a web-console user experience.
- The CLI must produce machine-readable outputs suitable for a later console.
- Authentication uses the operator's approved Azure credential context.
- A web console requires a separate architecture and privacy review before pilot.
