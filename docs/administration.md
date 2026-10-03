# Administration

This guide covers the manifest-driven direct and APIM-governed deployment paths and the compatible anonymous wizard workflow.

## Before deployment

1. Confirm the customer, environment classification, business owner, technical owner, cost owner, approved region, and cleanup intent.
2. Confirm the operator has Azure management-plane access and only the role-assignment permissions required by the chosen run.
3. Confirm intended users have or can receive a Foundry data-plane role.
4. Review model versions, capacities, quota, Marketplace terms, hosting information, network requirements, and local-authentication policy.
5. Treat generated launchers, manifests, and reports as internal deployment material.

Private networking, hosted MCP, governed package distribution, adoption of an unrelated existing APIM service, and an authenticated web console are not current capabilities.

## Manifest deployment procedure

1. Copy the closest sanitized manifest example outside the repository.
2. Replace the customer, Azure, ownership, model, and profile values.
3. Run `validate`, then local `render`.
4. Run `plan`; it verifies Azure context, runs Bicep what-if, and runs the model engine dry run.
5. Run `deploy`, review the repeated live preflight, and type exact `ACCEPT`.
6. Retain the sanitized orchestration and engine deployment reports with the approval record.
7. Install the generated workstation package and verify Claude Code with `/status`.
8. For APIM, confirm the client base URL is the reported `https://<service>.azure-api.net/<path>` endpoint and verify approved and denied model routes.

## Compatible wizard procedure

1. Generate dry-run and deployment launchers with `wizard/index.html`.
2. Upload the dry-run launcher and `scripts/ezdeploy-engine.sh` to the same Azure Cloud Shell folder.
3. Run the dry run and resolve every error or unexpected live result.
4. Upload and run the deployment launcher.
5. Review the exact target, billable capacity, Marketplace information, hosting boundary, and any local-authentication change.
6. Type `ACCEPT`, or use `--yes` only in an approved automation process.
7. Download the workstation archive and store `deployment-report.json` with the approved deployment record.
8. Install the workstation package and verify Claude Code with `/status`.

The dry run is authoritative for the current Azure catalog and quota. The anonymous wizard catalog is discovery guidance.

## CLI contract

The shell engine requires subscription, resource group, location, account name, legal organization, country code, and industry. Exact models should be supplied with repeatable `--model` arguments and explicit family defaults when multiple deployments from one family are selected.

Use:

- `--dry-run` for non-mutating live validation.
- `--assign-current-user` only when the deployment is authorized to add access.
- `--disable-local-auth-on-reuse` only after identifying key-authenticated workloads that may break.
- `--output-dir` to control local artifact placement.
- `--yes` only after an external approval process has captured the same decisions as interactive `ACCEPT`.

The manifest CLI is:

```text
node scripts/ezdeploy.js <validate|render|plan|deploy> MANIFEST [--output-dir PATH]
```

The CLI checks the actual resource-group location and ownership tags for every deterministic Bicep resource before approval. It preserves the tags of a same-region unrelated resource group, rejects unrelated child-resource collisions, writes temporary Bicep parameter and ARM body files with restrictive permissions, and removes them in `finally` cleanup. Plan and deploy reports use unique atomic filenames; render does not persist evidence. Reports redact secret-shaped fields and values. Customer-specific manifests and generated reports remain internal records and must not be committed.

## Access administration

Maintain separate records for:

- Deployment operators and their management-plane scope.
- Role-assignment administrators.
- Claude Code users and their Foundry data-plane roles.
- Automation identities used by GitHub Actions.
- Future gateway or MCP workload identities.

Review inherited roles as well as direct assignments. Remove access at the narrowest appropriate scope when a user changes role or leaves the engagement.

## Network administration

Both version 1 profiles use a public Foundry service endpoint. The governed profile adds a public APIM endpoint, Entra caller validation, model allowlisting, rate limiting, and managed-identity backend authentication.

Do not disable public network access until the client path, private DNS, routing, administrative access, and recovery path are implemented and tested. The current engine does not create or validate these components.

## Model and quota administration

Model deployments are pinned with `NoAutoUpgrade`. Before increasing capacity or changing a model:

1. Refresh the live preflight.
2. Confirm the exact model version and lifecycle state.
3. Confirm the SKU capacity rules and version-specific quota pool.
4. Review additional billable capacity.
5. Record the approval and deployment report.
6. Verify client family defaults after the change.

The engine can increase capacity. It does not reduce capacity when the requested value is lower than an existing deployment.

## Package administration

The repository does not approve or distribute MCP servers, skills, or plugins. A manifest package declaration and a package schema validation result are governance metadata only.

Do not deploy a package until its owner, version, source, permissions, data handling, secret references, integrity, compatibility, rollback, and deprecation have been reviewed. See [MCP, skills, and plugin governance](architecture/mcp-skills-plugins.md).

## Operational checks

At a minimum, the customer operator should review:

- Azure Activity Log for unexpected resource or role changes.
- Foundry account, project, and deployment provisioning state.
- Model quota headroom and cost.
- Effective runtime access.
- Local-authentication and public-network settings.
- Catalog-refresh workflow health if operating a fork.
- Model lifecycle and deprecation information.
- Ownership and cleanup review dates.

The repository does not currently deploy an operations dashboard or alerts.

## Future administration model

An authenticated web console may later orchestrate the same manifest, validation, planning, deployment, and evidence contracts, but should not become a separate deployment implementation.

See [Manifest and administration CLI contract](architecture/manifest-admin-contract.md) and [ADR 0002](architecture/decisions/0002-administration-cli-before-web-console.md).
