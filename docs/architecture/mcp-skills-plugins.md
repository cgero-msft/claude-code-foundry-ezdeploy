# MCP, skills, and plugin governance

## Current boundary

The repository does not deploy an MCP server, distribute skills, install plugins, or operate an artifact registry. Package arrays in the deployment manifest are declarations only.

Versioned schemas and sanitized examples under `packages/` define governance metadata for MCP servers, skills, and plugins. They cover ownership, compatibility, permissions, allowed resources, provenance, integrity, tenant eligibility, lifecycle, and deprecation. These contracts do not inspect package contents, create signatures, publish artifacts, or authorize runtime use.

The generated workstation installers install or configure Claude Code. They do not establish an enterprise approval boundary for third-party executable content.

## Governance roles

| Role | Responsibility |
|---|---|
| Package owner | Source, maintenance, vulnerability response, and release notes |
| Security reviewer | Permission, data-flow, dependency, and supply-chain review |
| Platform approver | Customer and environment eligibility |
| Release operator | Integrity verification, promotion, rollback, and deprecation |
| Customer administrator | Deployment approval, configuration, and access assignment |
| User | Uses only approved versions and reports unexpected behavior |

## Required package metadata

Each MCP server, skill, or plugin must declare:

- Stable name, version, source, and owner.
- Integrity evidence appropriate to the distribution channel.
- Supported scaffold, client, schema, and profile ranges.
- Requested permissions and downstream systems.
- Data classes read, written, or transmitted.
- Secret references by name, never secret values.
- Network destinations and private-connectivity requirements.
- Logging behavior and retention.
- Upgrade, rollback, deprecation, and removal instructions.

## Approval boundary

Schema validation answers whether the package declaration is well formed. It does not approve the package or verify its contents.

Approval requires source and dependency review, permission review, integrity verification, compatibility tests, and an owner capable of responding to security and operational issues. A package approved for one environment or data classification is not automatically approved for another.

## MCP authorization

An MCP service must authenticate the caller and authorize each exposed tool. Access to the MCP endpoint alone must not grant access to every tool or downstream system.

For shared hosting, authorization and storage must be tenant-aware. For dedicated hosting, customer isolation must be preserved through identity, network, deployment, and telemetry configuration.

Tool descriptions and client configuration are not security controls. Enforcement belongs in the MCP service and downstream resource authorization.

## Distribution and release

Approved artifacts should be promoted through controlled release channels with immutable versions. Floating versions such as `latest` are not acceptable for customer deployment manifests.

The release process must:

1. Verify source and integrity.
2. Run compatibility and expected-denial tests.
3. Record approval and supported ranges.
4. Promote through pilot and supported channels.
5. Retain the previous rollback-compatible artifact.
6. Publish deprecation and removal dates.

## Plugin boundary

Plugins can execute with the permissions of their host process. Until a sandbox, permission model, and supported installation path are defined, plugin declarations remain future scope and should default to empty.

## Incident response

Compromised or unsafe artifacts require:

- Immediate block or unpublish action.
- Identification of affected manifests and deployments.
- Revocation or rotation of referenced credentials.
- Removal or rollback instructions.
- Customer notification through the declared support channel.
- Retained evidence that excludes customer workload content unless separately approved.
