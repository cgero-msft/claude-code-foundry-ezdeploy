# Manifest and administration CLI contract

## Current contract surfaces

The manifest administration command is `scripts/ezdeploy.js`. It validates and translates the desired state into Bicep parameters, shell-engine arguments, APIM configuration, and a sanitized orchestration report. `scripts/ezdeploy-engine.sh` remains the exact-model preflight and deployment implementation.

The repository also contains a version 1 deployment-manifest schema and a zero-dependency validator:

```text
node scripts/validate-manifest.js [--schema PATH] MANIFEST [MANIFEST ...]
```

The validator checks structure, implemented-profile rules, model defaults, identity references, network consistency, package secret references, allowed regions, release linkage, and embedded-secret patterns. The Node CLI consumes only validated manifests.

Versioned MCP server, skill, and plugin schemas under `packages/schemas/v1/` add ownership, compatibility, permissions, provenance, integrity, tenant-eligibility, lifecycle, and deprecation contracts. Their examples and regression tests validate the metadata shape. No registry, signing service, installer, or distribution workflow consumes them.

## Manifest purpose

The manifest is intended to become the desired-state contract shared by:

- An anonymous discovery or configuration experience.
- A future administration CLI.
- Bicep parameter generation.
- Preflight and deployment execution.
- Validation and evidence collection.
- Deployment reporting, drift comparison, upgrade, rollback, and cleanup.

The manifest must contain references, never secret values. Customer-specific manifests are deployment records and should not be committed to this public repository.

## Contract sections

| Section | Operator decision |
|---|---|
| `schemaVersion` and `release` | Contract and matched artifact version |
| `customer` and `environment` | Deployment ownership and environment classification |
| `architecture` | Selected profile and contract status |
| `azure` | Tenant, subscription, location, resource group, Foundry, and optional APIM target |
| `models` and `familyDefaults` | Exact model versions, capacities, deployment names, and client defaults |
| `identities` and `personas` | Workload identities and intended role assignments |
| `networking` | Public endpoint declaration; private endpoints are reserved for future profiles |
| `governance` | Region, authentication, approval, and policy intent |
| `observability` | Desired diagnostics and retention; version 1 requires cost alerts to remain disabled |
| `secretReferences` | Non-secret references to approved providers |
| `packages` | Versioned MCP, skill, and plugin declarations |
| `ownership` | Technical, business, and cost ownership |
| `lifecycle` and `cleanup` | Review, upgrade, expiry, retention, and deletion intent |

Schema acceptance does not prove the cloud environment matches the declaration. The plan command adds Bicep what-if and the engine's live dry run. Deploy adds exact `ACCEPT`, Bicep deployment, exact-model engine deployment, and APIM policy activation when selected. Private endpoints, CIDR firewall configuration, cost alerts, package installation, and cleanup execution are rejected or remain outside version 1.

## Administration CLI

Implemented version 1 operations:

| Operation | Behavior |
|---|---|
| `validate` | Schema and semantic validation without Azure access. |
| `render` | Local deterministic translation to sanitized Bicep, engine, and APIM plans. |
| `plan` | Tenant/subscription verification, Bicep what-if, and engine dry run without mutation. |
| `deploy` | Live preflight, exact `ACCEPT`, Bicep deployment, engine deployment, APIM configuration, report generation, and temporary-file cleanup. |

Future operations remain:

| Operation | Required behavior |
|---|---|
| Inspect | Read Azure state without mutation and report permissions, policy, networking, quota, collisions, and compatibility. |
| Verify | Run authorized and expected-denial checks and produce evidence. |
| Drift | Compare manifest, release, and live state without automatic correction. |
| Upgrade | Create a reviewed plan from one compatible release to another. |
| Roll back | Restore the prior compatible configuration where Azure and model availability permit. |
| Offboard | Inventory retained and deleted resources, require approval, and verify cleanup. |

Every mutating operation must support a non-mutating plan first, require an explicit approval record, and return a nonzero exit code on partial or failed execution. Automation may provide non-interactive approval only when the caller supplies an authorized, reviewable approval artifact.

## Output contract

CLI output should separate:

- Human-readable progress and remediation.
- A machine-readable plan or result.
- An evidence bundle reference.
- A stable diagnostic identifier for failures.

Outputs must identify the manifest schema version, scaffold release, source revision, profile, and deployment ID. They must not contain access tokens, secret values, prompt content, response content, or signed URLs.

## Compatibility rule

Validators may accept compatible minor schema versions within the same major version. Deployment tools must reject unknown major versions and any profile for which the matched release lacks an implementation. See [ADR 0007](decisions/0007-release-compatibility.md).
