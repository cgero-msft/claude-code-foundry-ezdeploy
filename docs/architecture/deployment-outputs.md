# Deployment outputs

## Current outputs

A successful deployment creates an output directory and a compressed workstation archive. The default paths are `~/claude-code-foundry` and `~/claude-code-foundry.tar.gz`. Each plan or deployment attempt writes an atomic `orchestration-<operation>-<timestamp>-<manifest-digest>-<nonce>.json`; render remains stdout-only. The engine creates the archive before orchestration finishes, so orchestration reports are not included in the archive.

| Output | Purpose | Classification |
|---|---|---|
| `claude-foundry.env` | Bash environment variables for Claude Code | Internal |
| `claude-foundry.ps1` | PowerShell environment variables for Claude Code | Internal |
| `vscode-settings.snippet.json` | VS Code Claude Code environment settings | Internal |
| `deployment-report.json` | Azure target, endpoints, model versions, capacities, state, and approval time | Internal |
| `orchestration-*.json` | Operation-specific manifest digest, Bicep status and outputs, engine status, and APIM configuration result | Internal |
| `install-claude-code-local.sh` | Bash or WSL installer and profile setup | Internal executable |
| `install-claude-code-windows.ps1` | Windows installer and PowerShell profile setup | Internal executable |
| `claude-code-foundry.tar.gz` | Transfer package containing the workstation files above, excluding orchestration reports | Internal archive |

These files are designed not to contain Foundry API keys or access tokens. They do contain tenant and subscription identifiers and other environment metadata. Do not commit them.

## Current deployment report

The report records:

- Generation and terms-confirmation timestamps.
- Subscription, tenant, resource group, location, account, and project.
- Project and Anthropic endpoint URLs.
- Microsoft Entra authentication and `secretsStored: false`.
- Exact model, deployment, family, format, version, SKU, quota usage name, requested and actual capacity, provisioning state, version-upgrade policy, content-filter policy, and family-default selection.
- Bicep deployment status and sanitized outputs.
- APIM service, backend, API, operation, policy version, named-value names, and gateway base URL for the governed profile.

The report is evidence of the engine's observed state at generation time. It is not a continuous inventory and does not prove later health or absence of drift.

## Additional future outputs

A future administration CLI should add:

- Validated manifest copy with secret references only.
- Deterministic deployment plan.
- Bicep parameter file and module-version inventory.
- Approval record.
- Machine-readable deployment result with resource IDs.
- Verification evidence with authorized and expected-denial results.
- Drift report.
- Cleanup plan and cleanup result.
- Compatibility declaration for the matched release.

APIM, MCP, private-network, and telemetry outputs must appear only when the profile implementation creates and verifies those resources.

The orchestration report consumes Bicep outputs for Foundry, identities, Key Vault, monitoring, and optional APIM. Secret-shaped output keys, including connection strings, are redacted before the report is written.

## Retention

The customer administrator owns storage and retention for generated outputs. Retain enough desired-state and evidence material to support audit, recovery, upgrade, rollback, and offboarding. Remove workstation configuration when access is revoked or the deployment is retired.

Never include secret values, bearer tokens, private keys, prompt content, response content, or signed URLs in a deployment output.
