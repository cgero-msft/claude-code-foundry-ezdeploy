# ADR 0005: Gate the MCP hosting decision

- Status: Proposed
- Scope: Hosted MCP profiles

## Context

Shared and dedicated MCP hosting create different tenancy, network, cost, authorization, and support models. Selecting a platform before tool scope and data boundaries are known would lock the scaffold into an unsupported security model.

## Decision

Do not select a default MCP host until the pilot defines tenancy, tool authorization, downstream identities, data classification, network reachability, scale, regional placement, telemetry, and support ownership.

## Exit criteria

A hosting decision requires:

- Approved shared versus dedicated isolation model.
- Defined tool and downstream-resource authorization.
- Prompt and tool-content logging policy.
- Managed identity and secret-reference design.
- Private-connectivity requirements.
- Load, availability, cost, upgrade, rollback, and incident targets.
- At least one deployable reference implementation and validation suite.

## Consequences

- Manifest package references remain inventory only.
- No MCP profile can enter pilot before this gate is closed.
- The future implementation can compare Container Apps, Functions, AKS, or another approved host against the same criteria.
