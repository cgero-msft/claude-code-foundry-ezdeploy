# ADR 0006: Limit the default telemetry boundary

- Status: Accepted
- Scope: Gateway, administration, and MCP telemetry

## Context

Operations need request, latency, error, token, deployment, and correlation signals. Prompts, responses, tool inputs, and tool outputs can contain customer confidential data and are not required for baseline service health.

## Decision

Collect metadata only by default. Do not collect prompt bodies, response bodies, tool arguments, tool results, access tokens, secret values, or signed URLs.

Approved metadata may include timestamp, release, profile, environment identifier, region, gateway or deployment identifier, pseudonymous principal or application identifier, model deployment, status category, latency, token counts when available, retry count, and correlation identifier.

## Consequences

- Content-level debugging requires a separate, time-bound customer approval process.
- Retention, regional storage, access, and deletion must be declared per deployment.
- Telemetry cannot be treated as a complete audit of model or tool content.
- Direct-profile request correlation remains unavailable until a supported instrumentation path exists.
