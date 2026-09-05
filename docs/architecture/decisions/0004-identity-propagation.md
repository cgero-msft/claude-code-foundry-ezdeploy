# ADR 0004: Separate client and backend identity

- Status: Accepted
- Scope: Gateway profiles

## Context

APIM must authorize the caller while Foundry needs a backend identity. Forwarding the original bearer token, using a shared key, and using managed identity have different trust and attribution properties.

## Decision

Validate client identity at the gateway and use a dedicated managed identity from the gateway to Foundry. Preserve approved principal attribution in gateway policy and telemetry, not in an unauthenticated header trusted by downstream services.

## Rationale

This separates client authorization from backend access, removes shared Foundry keys, and permits central model and rate policy. It also makes the loss of user identity at the Foundry boundary explicit.

## Consequences

- Governed users should not retain direct Foundry access unless bypass is intentional.
- User-level attribution must be generated and protected at the gateway.
- On-behalf-of token exchange is not part of the initial design.
- Expected-denial tests must cover both client policy and backend RBAC.
