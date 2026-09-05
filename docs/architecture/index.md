# Architecture

This documentation describes the reusable deployment scaffold without implying that every documented profile is implemented. The manifest-driven CLI deploys direct and APIM-governed profiles. Private networking, hosted MCP services, customer gateways, and an authenticated web administration console remain proposed or future work.

## Capability status

| Status | Meaning |
|---|---|
| Current | Implemented in the repository and exercised by the existing deployment path. |
| Contract only | Represented in a schema, example, or validation rule, but not connected to deployment execution. |
| Proposed | Design direction selected for implementation or pilot work. No production capability is claimed. |
| Pilot | Implemented and under limited validation with named owners and exit criteria. |
| Supported | Released with documented compatibility, operations, upgrade, rollback, and support boundaries. |
| Future | An architecture option that remains behind one or more decision gates. |

The `architecture.status` value in the deployment manifest is a validator field, not the operator-facing capability status above. A manifest that passes validation does not prove that infrastructure, policies, clients, or operations for that profile exist.

## Profile matrix

| Profile | Repository status | Data path | Network posture | Primary identity path | Governance point |
|---|---|---|---|---|---|
| [Direct](direct-profile.md) | Deployable through the manifest CLI and current shell engine | Claude Code to Foundry | Public Foundry endpoint | User signs in through Azure CLI; Claude Code obtains Microsoft Entra credentials | Foundry RBAC and local client configuration |
| [APIM-governed](apim-governed-profile.md) | Deployable through the manifest CLI | Claude Code to APIM to Foundry | Public APIM ingress and public Foundry backend in version 1 | Client identity at APIM; APIM system-assigned managed identity to Foundry | APIM policy plus Foundry RBAC |
| [Private direct](future-profiles.md#private-direct-profile) | Future | Claude Code to private Foundry endpoint | Private endpoint and private DNS | User or workload identity to Foundry | Foundry RBAC and customer network controls |
| [Shared MCP](future-profiles.md#shared-mcp-profile) | Future | Client to shared MCP service and selected downstream systems | Private or controlled public ingress, to be decided | User or workload identity with tenant-aware authorization | Shared MCP authorization and artifact governance |
| [Dedicated MCP](future-profiles.md#dedicated-mcp-profile) | Future | Client to customer-dedicated MCP service | Customer-isolated network boundary | Customer-scoped user or workload identity | Dedicated MCP policy and customer ownership |
| [Customer gateway](future-profiles.md#customer-gateway-profile) | Future | Client to customer gateway to Foundry | Customer-defined | Customer-defined at ingress; managed workload identity preferred to Foundry | Customer gateway, with an explicit responsibility split |

Both version 1 profiles are deployable community-sample capabilities. Neither carries a service-level agreement or Microsoft or Anthropic product support commitment.

## Architecture views

- [Current direct profile](direct-profile.md)
- [APIM-governed profile](apim-governed-profile.md)
- [Future profiles](future-profiles.md)
- [Trust, identity, data, and network boundaries](trust-identity-network.md)
- [Manifest and administration CLI contract](manifest-admin-contract.md)
- [MCP, skills, and plugin governance](mcp-skills-plugins.md)
- [Deployment outputs](deployment-outputs.md)
- [Administration](../administration.md)
- [Lifecycle](../lifecycle.md)

## Decisions

| Decision | Status |
|---|---|
| [ADR 0001: Use Bicep for Azure infrastructure](decisions/0001-bicep-for-azure-infrastructure.md) | Accepted |
| [ADR 0002: Start with an administration CLI](decisions/0002-administration-cli-before-web-console.md) | Accepted |
| [ADR 0003: Place APIM in the customer governance boundary](decisions/0003-apim-placement.md) | Accepted |
| [ADR 0004: Separate client and backend identity](decisions/0004-identity-propagation.md) | Accepted |
| [ADR 0005: Gate the MCP hosting decision](decisions/0005-mcp-hosting-decision-gate.md) | Proposed |
| [ADR 0006: Limit the default telemetry boundary](decisions/0006-telemetry-boundary.md) | Accepted |
| [ADR 0007: Release matched, versioned artifacts](decisions/0007-release-compatibility.md) | Accepted |

## Source-of-truth rule

The executable source remains authoritative for current capability:

- `wizard/index.html` defines the anonymous launcher-generation experience.
- `scripts/ezdeploy-engine.sh` defines current preflight, deployment, and workstation-package behavior.
- `schemas/deployment-manifest-v1.schema.json` and `scripts/validate-manifest.js` define the manifest contract consumed by `scripts/ezdeploy.js`.
- `examples/` contains sanitized contract examples, not evidence of deployed profiles.
- `infra/` defines the subscription-scope Bicep infrastructure deployed by the manifest CLI. Exact model deployment remains in the shell engine.
- `policies/apim-governed/` contains the APIM policy and named-value contract installed by the manifest CLI.
- `packages/` defines versioned package governance schemas and sanitized examples. It is not a package registry or distribution service.

When documentation and executable behavior differ, treat the profile as not implemented until the executable path and tests are updated.
