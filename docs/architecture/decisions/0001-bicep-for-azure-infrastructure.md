# ADR 0001: Use Bicep for Azure infrastructure

- Status: Accepted
- Scope: Future scaffold infrastructure

## Context

The current engine provisions Azure resources through Azure CLI and REST calls. Requirement 1 needs a declarative, reviewable contract for Foundry, identities, RBAC, networking, diagnostics, Key Vault, and optional APIM.

## Decision

Use Bicep as the primary infrastructure-as-code format. The initial modules under `infra/` establish this choice for Foundry, identities, RBAC, Key Vault, monitoring, and optional APIM. Keep imperative code for live preflight, model deployment until it is represented declaratively, orchestration, evidence collection, and operations that are not resource declarations.

## Rationale

Bicep provides direct Azure Resource Manager coverage, native what-if, module composition, and no separate state backend. It fits a customer-owned Azure deployment where the customer subscription remains the source of live state.

## Consequences

- The current shell engine remains authoritative until the Bicep modules are integrated with manifests, model deployment, preflight, verification, and lifecycle operations.
- Modules must expose stable outputs consumed by the administration CLI and deployment report.
- Role assignments, private endpoints, DNS, diagnostics, and APIM policies need explicit modules and tests.
- Terraform can be added later only with a compatibility and ownership plan. It is not a second default implementation.
