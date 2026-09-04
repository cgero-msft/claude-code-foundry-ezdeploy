# Claude Code on Microsoft Foundry EZDeploy

Deploy the Azure resources and exact Claude model versions needed to use Claude Code with Microsoft Foundry. The browser wizard generates an Azure Cloud Shell launcher; the Bash engine validates the live catalog and quota, creates or reuses resources, and produces a workstation configuration.

> [!IMPORTANT]
> This is an unofficial community sample. It is not an official Microsoft or Anthropic product and is not supported under either company's product support commitments. Microsoft, Azure, Microsoft Foundry, Anthropic, Claude, and Claude Code are trademarks of their respective owners.

## What this repository contains

| Path | Purpose |
|---|---|
| `wizard/index.html` | Select exact model versions, deployment names, capacities, Azure targets, and Claude Code family defaults. |
| `scripts/ezdeploy-engine.sh` | Validate and deploy the selected configuration from Azure Cloud Shell. |
| `tests/run-regression.ps1` | Run the wizard and engine regression suites locally. |
| `tests/wizard-regression.js` | Test wizard validation and launcher generation. |
| `tests/engine-regression.sh` | Test engine behavior with fixtures and a fake Azure CLI. |

The wizard-generated launcher and `scripts/ezdeploy-engine.sh` must be uploaded to the same Cloud Shell folder.

## Before you start

You need:

1. A paid Azure subscription. Model deployments and supporting resources can incur charges.
2. Permission to create or update a resource group, an `AIServices` account, a Foundry project, and model deployments.
3. Role-assignment permission only if you choose to assign the signed-in user.
4. A runtime role recognized by the engine for each Claude Code user: Cognitive Services User, Cognitive Services OpenAI User, Cognitive Services OpenAI Contributor, Foundry User, Foundry Owner, Foundry Project Manager, Azure AI Project Manager, Azure AI User, Azure AI Owner, or Azure AI Developer.
5. Authority to provide the responsible legal organization's name, two-letter country code, and industry.
6. Authority to approve the selected billable capacities, applicable Anthropic Azure Marketplace terms, and each model version's hosting and data boundary.
7. Regional model availability and quota for every exact model, version, SKU, and capacity selected.
8. Azure CLI 2.83.0 or later. Azure Cloud Shell also supplies Bash, `jq`, and `tar`.

New Foundry accounts are configured for Microsoft Entra ID authentication only. When an existing account is reused, the engine preserves its current local-authentication setting by default so existing key-authenticated workloads are not broken. The project does not create, retrieve, or store API keys.

Owner, Contributor, Cognitive Services Contributor, Foundry Account Owner, and Azure AI Account Owner are management-plane roles. They do not provide the data-plane access required for Entra-authenticated model inference.

## Security and network considerations

The engine creates or reuses an `AIServices` account with a custom service endpoint. It does not configure private endpoints, network isolation, firewall rules, or an organization-specific data perimeter. Unless you separately restrict the Azure resource, its service endpoint is public and protected by Azure authentication and authorization. Review your organization's networking, Conditional Access, data residency, logging, and model-use requirements before deployment.

Generated configuration files contain identifiers such as subscription ID, tenant ID, resource names, project endpoints, deployment names, and model versions. They are not intended to contain secrets, but they may expose environment metadata. Store and share them accordingly. See [SECURITY.md](SECURITY.md) for additional limitations.

## Select exact model versions

Open `wizard/index.html` in a browser. Each checked item represents an exact catalog model and version and becomes a separate `GlobalStandard` deployment with:

- A unique deployment name.
- A positive whole-number capacity.
- A version-specific quota pool.
- A displayed hosting boundary.
- `NoAutoUpgrade` version pinning.

The wizard currently highlights these as recommended starting choices; no billable model deployment is selected by default:

| Claude Code family | Catalog model | Exact version | Default deployment name | Expected hosting boundary |
|---|---|---:|---|---|
| Sonnet | `claude-sonnet-5` | `2` | `claude-sonnet-5` | Azure infrastructure |
| Haiku | `claude-haiku-4-5` | `2` | `claude-haiku-4-5` | Azure infrastructure |
| Opus | `claude-opus-4-8` | `2` | `claude-opus-4-8` | Azure infrastructure |

These are sample defaults, not an availability guarantee. Azure's live regional catalog, model metadata, SKU support, quota, commercial terms, and hosting information are authoritative at execution time. Stop if the engine's live output differs from what you are authorized to deploy.

Claude Code routes the `sonnet`, `haiku`, and `opus` aliases to deployment names. Select one family default for every family you deploy. If you select multiple versions from one family, explicitly choose which deployment Claude Code should use by default.

## Generate the launchers

In the wizard:

1. Select every exact model version you intend to deploy.
2. Set a unique deployment name and capacity for each selection.
3. Choose one Claude Code default for every selected model family.
4. Enter the subscription, resource group, supported region, globally unique Foundry account name, and project name.
5. Choose whether the engine may assign the current user a least-privilege runtime role when no supported inherited role is effective.
6. Enter the responsible legal organization, country code, and industry.
7. Confirm authority for billable resources, Marketplace terms, and the displayed hosting boundaries.
8. Review the exact versions, capacities, deployment names, family mappings, and Azure target.
9. Download the dry-run launcher first.

The generated files are:

- `claude-code-foundry-dry-run.sh`
- `claude-code-foundry-deploy.sh`

These files contain deployment parameters and organization metadata. Review them before use and do not commit them.

## Run the dry run first

Open [Azure Cloud Shell](https://shell.azure.com/), select Bash, and upload:

- `scripts/ezdeploy-engine.sh`
- `claude-code-foundry-dry-run.sh`

Keep both files in the same Cloud Shell folder, then run:

```bash
chmod +x ezdeploy-engine.sh
bash claude-code-foundry-dry-run.sh
```

The dry run validates authentication, subscription and tenant selection, account compatibility, exact catalog versions, `GlobalStandard` support, version-specific quota, existing deployments, requested incremental capacity, Marketplace information exposed by Azure, hosting boundaries, and Claude Code family defaults. It does not create resources, deployments, role assignments, or Marketplace agreements.

If any live result differs from your approval, update the wizard selections, generate a new launcher, and repeat the dry run.

## Confirm and deploy

Upload `claude-code-foundry-deploy.sh` beside the engine and run:

```bash
bash claude-code-foundry-deploy.sh
```

Before billable changes, the engine prints the target and exact version list and requires the operator to type:

```text
ACCEPT
```

This confirms the selected resources and capacities, applicable Anthropic Azure Marketplace commercial terms, and displayed hosting and data boundaries. The generated launcher does not include `--yes`. Use `--yes` for deliberate automation only after an authorized operator has reviewed the live preflight output.

For a reused account, local authentication is preserved unless the engine is invoked with `--disable-local-auth-on-reuse`. That opt-in can break workloads that still authenticate with account keys. The engine displays this change in the deployment choices, and `ACCEPT` or `--yes` explicitly confirms it before mutation.

The engine creates or reuses:

- The resource group.
- An `AIServices` Foundry account with a custom endpoint and system-assigned identity. New accounts are Entra-only; reused accounts retain their existing local-authentication setting unless explicitly hardened.
- The named Foundry project with a system-assigned identity.
- One pinned deployment for each selected exact model version.
- An optional `Cognitive Services User` assignment for the signed-in user, only when requested and no supported effective runtime role is found.

Existing compatible deployments are reused. Higher requested capacity increases them; lower requested capacity does not reduce them. A deployment-name collision with another model, format, SKU, or exact version stops the run.

## Generated workstation package

A successful deployment creates `~/claude-code-foundry` and `~/claude-code-foundry.tar.gz` in Cloud Shell. The package includes:

| File | Contents |
|---|---|
| `claude-foundry.env` | Bash environment activator with tenant, subscription, Foundry resource, and family defaults. |
| `claude-foundry.ps1` | PowerShell environment activator with the same identifiers. |
| `vscode-settings.snippet.json` | Claude Code extension environment settings. |
| `deployment-report.json` | Deployment identifiers, endpoints, model versions, capacities, and provisioning states. |
| `install-claude-code-local.sh` | Bash/WSL installer and profile setup. |
| `install-claude-code-windows.ps1` | Windows PowerShell installer and profile setup. |

Download the archive from Cloud Shell using **Manage files** > **Download**.

For Bash or WSL:

```bash
tar -xzf claude-code-foundry.tar.gz
cd claude-code-foundry
bash install-claude-code-local.sh
```

For native Windows PowerShell, extract the archive, open PowerShell in the extracted folder, and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-claude-code-windows.ps1
```

The installers may download Claude Code from Anthropic's published installer endpoints. Review generated scripts and your organization's software-installation policy before execution.

## Verify Claude Code

Open a trusted repository and run:

```bash
claude
```

Inside Claude Code, run:

```text
/status
```

Confirm that the API provider is Microsoft Foundry, the Foundry resource is correct, and the `sonnet`, `haiku`, and `opus` aliases resolve to the deployment names selected in the wizard.

For 401 or 403 responses, confirm the expected tenant and subscription are selected and the user has one of the supported runtime roles listed in [Before you start](#before-you-start). Management-plane roles alone, including Owner, Contributor, Cognitive Services Contributor, Foundry Account Owner, and Azure AI Account Owner, are not sufficient for Entra inference.

## Run tests

The full regression suite requires Node.js, Bash, `jq`, `tar`, and PowerShell.

On Windows, run from the repository root in PowerShell. The wrapper uses Git Bash for the engine tests:

```powershell
.\tests\run-regression.ps1
```

On Linux, run the wizard and engine suites directly:

```bash
node tests/wizard-regression.js wizard/index.html
bash tests/engine-regression.sh scripts/ezdeploy-engine.sh
```

The engine tests use a fake Azure CLI and local fixtures; they do not deploy Azure resources.

## Cleanup

This project does not automatically delete Azure resources. To stop charges, use the Azure portal or Azure CLI to remove model deployments and other resources you no longer need. Delete the entire resource group only when it was created for this sample and contains nothing else.

Also remove generated workstation files and any profile lines that source:

- `$HOME/.claude/foundry.env`
- `$HOME\.claude\foundry.ps1`

Review role assignments before removing them; the engine may have reused pre-existing access rather than creating a new assignment.

## License

Licensed under the [MIT License](LICENSE).
