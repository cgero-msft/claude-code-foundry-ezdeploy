# Deployment lifecycle

## Lifecycle states

| State | Meaning |
|---|---|
| Planned | Inputs and approvals are being prepared. No deployed capability is implied. |
| Active | The environment is in use and has current ownership, access, and review dates. |
| Retiring | New use is stopped and offboarding or migration is in progress. |
| Retired | Workload access and billable resources have been removed or explicitly retained. |

The manifest currently models planned, active, and retiring. A future lifecycle command should record retired evidence outside the active deployment manifest.

## Upgrade

The current engine has no general upgrade command. Operators rerun the engine with reviewed parameters. Exact model deployments use `NoAutoUpgrade`.

Before an upgrade:

1. Record the current engine revision, launcher inputs, deployment report, client version, and model defaults.
2. Run the new release's manifest validation and dry run.
3. Review Azure catalog lifecycle, quota, capacity, pricing, hosting, policy, network, and identity changes.
4. Confirm compatibility for the client, schema, profile, Azure CLI, Foundry API, models, MCP packages, skills, and plugins in scope.
5. Define rollback criteria and retain the prior compatible artifacts.
6. Apply to a non-production or pilot environment before broader rollout.
7. Verify authentication, model routing, streaming, tool behavior, telemetry boundaries, and expected denials as applicable.

Capacity increases can be in-place. Model version changes should use a new deployment name when rollback requires the prior deployment to remain available.

## Rollback

Rollback is a reviewed deployment action, not an automatic response.

For the current direct profile:

- Restore the prior client environment and family-default deployment names.
- Reuse a prior model deployment only if it still exists and remains available.
- Do not assume Azure can recreate a retired model version.
- Confirm capacity and quota before switching traffic.
- Retain the failed deployment and evidence until the incident owner approves removal.

For the APIM-governed profile, retain the prior policy file, named-value contract, API path, model-route map, and workstation base URL. Rollback may restore a prior policy and route map only when every referenced model deployment still exists and remains approved. MCP profiles remain future scope and must version packages independently.

## Drift

The current repository does not provide an automated drift command. Operators should compare:

- Resource location, kind, custom domain, identity, and local-authentication state.
- Foundry project identity and location.
- Model name, exact version, SKU, capacity, upgrade policy, and provisioning state.
- Role assignments and inherited access.
- Public network, private endpoint, DNS, firewall, and gateway policy state when applicable.
- Client defaults and installed package versions.
- APIM backend URL, API path, POST wildcard operation, named values, policy content/version, system-assigned identity, and Foundry role assignment.
- Manifest release, ownership, review, expiry, and cleanup fields.

Drift reports should be read-only. Automatic correction requires a reviewed plan because some drift can represent an intentional customer change.

## Deprecation

Deprecation applies separately to:

- Manifest schema versions.
- Scaffold releases.
- Architecture profiles.
- Azure CLI and API versions.
- Claude Code and other clients.
- Model versions and SKUs.
- MCP servers, skills, and plugins.

A deprecation notice should name the affected versions, replacement path, compatibility impact, final validation date, end-of-support date, and removal date. Model availability is controlled by Azure and the model provider, so the scaffold cannot guarantee rollback to a deprecated version.

Unknown manifest major versions must be rejected. Compatible minor versions may be accepted only within the rules of the matched release.

## Offboarding

1. Identify the business owner, technical owner, cost owner, and authorized approver.
2. Inventory users, workload identities, role assignments, model deployments, account and project resources, network resources, gateways, MCP services, packages, telemetry, and retained outputs.
3. Stop new access and revoke client or package distribution.
4. Remove runtime roles and future gateway or MCP authorization.
5. Export only the evidence required by the approved retention policy.
6. Remove workstation environment files and profile-loading lines.
7. Delete resources according to the approved cleanup strategy.
8. Verify that billable deployments, public endpoints, identities, role assignments, and automation credentials are removed or explicitly retained.
9. Record completion, retained items, owners, and expiration dates.

## Cleanup

The engine and manifest CLI do not delete Azure resources. Cleanup is manual.

Use the least destructive strategy:

- Delete selected model deployments when the Foundry account is shared.
- Delete the resource group only when it was created for this deployment and contains no unrelated resources.
- Retain resources only with an owner, cost center, reason, and review date.

Never delete a reused account, project, role assignment, network resource, gateway, log destination, or secret store based only on a generated launcher. Inspect live ownership and dependencies first.

Cleanup must require approval and produce a post-cleanup inventory. Retain logs only for the approved period, then remove them through the owning service's retention controls.

## Release retirement

A scaffold release can retire only after:

- A replacement or explicit end-of-life decision is published.
- Supported schema and profile ranges are updated.
- Upgrade and rollback guidance is available.
- Known deployed manifests can be identified.
- Security and operational owners approve the timeline.
- Release artifacts remain available for the required evidence period or are archived through an approved process.

See [ADR 0007](architecture/decisions/0007-release-compatibility.md).
