# Future architecture profiles

These profiles are design options, not repository capabilities. A future profile cannot be selected for deployment until its decision records, infrastructure, validation, operations, and lifecycle controls are complete.

## Private direct profile

Claude Code connects directly to a Foundry private endpoint. Customer-managed DNS and client network connectivity replace the public endpoint path.

Decision gates:

- Supported client locations and connectivity method.
- Private DNS ownership and forwarding.
- Whether public network access is always disabled.
- Conditional Access and tenant restrictions.
- Diagnostic path when the client cannot reach or resolve the endpoint.
- Guarded transition from a current public deployment.

## Shared MCP profile

A centrally operated MCP service is shared across customers or environments with tenant-aware authorization and data isolation.

Decision gates:

- Hosting platform and regional footprint.
- Tenant-isolation model.
- User, application, and downstream-service identity.
- Tool allowlists and per-tool authorization.
- Prompt, tool-input, and tool-output logging policy.
- Versioning, compatibility, noisy-neighbor protection, and incident ownership.

This profile carries the highest cross-tenant risk and must not be inferred from the presence of package references in a manifest.

## Dedicated MCP profile

Each customer or environment receives a dedicated MCP deployment and network boundary.

Decision gates:

- Dedicated resource group, subscription, or tenant boundary.
- Customer versus scaffold ownership.
- Upgrade fleet management and release rings.
- Cost allocation and minimum operational footprint.
- Private connectivity to Foundry and downstream tools.
- Deletion, retained evidence, and customer offboarding.

Dedicated hosting reduces shared-runtime risk but increases deployment count, drift exposure, and operational cost.

## Customer gateway profile

The customer's existing gateway remains the client-facing policy boundary. The scaffold supplies Foundry resources, backend identity requirements, configuration contracts, and validation tests.

Decision gates:

- Required gateway capabilities and supported products.
- Client authentication and principal attribution.
- Backend token acquisition and role scope.
- Model allowlisting, rate limiting, correlation, and error contracts.
- Telemetry ownership and evidence exchange.
- Support boundary when the customer gateway changes independently.

The handoff must identify which party owns every control. The scaffold cannot claim enforcement for a policy that exists only in a customer-managed gateway.

## Promotion requirements

Each profile moves through proposed, pilot, and supported states independently. Promotion requires:

1. An accepted architecture decision set.
2. A versioned manifest contract.
3. Deployable infrastructure and policy artifacts.
4. Positive and expected-denial integration tests.
5. Operations, rollback, drift, deprecation, and cleanup procedures.
6. A compatibility declaration for the matched release.
7. A named owner and support route.
