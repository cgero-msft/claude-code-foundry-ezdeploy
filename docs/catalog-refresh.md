# Catalog refresh automation

This document is for repository maintainers and fork owners. Deploying Claude Code with the wizard and engine requires none of this setup; see the [README](../README.md).

## What the workflow does

`.github/workflows/refresh-model-catalog.yml` runs daily and supports `workflow_dispatch`. It signs in with `azure/login@v2` and GitHub OIDC, queries:

```bash
az cognitiveservices model list --location eastus2 --subscription "$AZURE_SUBSCRIPTION_ID" --output json
az cognitiveservices model list --location swedencentral --subscription "$AZURE_SUBSCRIPTION_ID" --output json
```

The generator normalizes duplicate API rows by `format|name|version` and duplicate SKUs by `name|usageName`. It requires nonempty eligible data for both regions and writes the snapshot atomically. A failed, empty, malformed, or region-incomplete refresh leaves the checked-in snapshot unchanged and opens or updates one GitHub issue. A valid change is pushed only to `automation/model-catalog-refresh` and opens or updates an automated pull request; the workflow never commits directly to the default branch.

## Owner setup

1. Create a Microsoft Entra application or user-assigned managed identity for this repository.
2. Add a GitHub federated credential scoped to this repository and the default branch used by scheduled and manually dispatched runs.
3. On the designated reference subscription, assign a custom read-only role containing only `Microsoft.CognitiveServices/locations/models/read`.
4. Add repository Actions secrets named `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`. These identifiers are not Azure client secrets and no Azure client secret is used, but they are stored as GitHub Actions secrets rather than variables so GitHub masks them in the publicly readable workflow logs of this public repository.
5. In **Settings > Actions > General**, set default workflow permissions to read-only and enable **Allow GitHub Actions to create and approve pull requests**. If organization policy prevents this, replace the PR step's `GITHUB_TOKEN` with a narrowly scoped GitHub App token.

The branch-scoped federated credential subject for this repository is:

```text
repo:cgero-msft/claude-code-foundry-ezdeploy:ref:refs/heads/main
```

A fork replaces the repository path with its own. Run manual dispatches from the default branch so they use the same trust.

## Reference identity permissions

A minimal custom role definition uses the reference subscription as its only assignable scope:

```json
{
  "Name": "Foundry Regional Model Catalog Reader",
  "IsCustom": true,
  "Description": "Read only the regional Microsoft Foundry model catalog.",
  "Actions": [
    "Microsoft.CognitiveServices/locations/models/read"
  ],
  "NotActions": [],
  "DataActions": [],
  "NotDataActions": [],
  "AssignableScopes": [
    "/subscriptions/<reference-subscription-id>"
  ]
}
```

The reference identity should not receive Contributor, Owner, deployment, quota-write, or resource-write permissions. The current workflow uses repository Actions secrets and a branch-scoped federated credential; it does not declare a GitHub environment.

Reproducing a refresh locally and the rules for each catalog layer are covered in [CONTRIBUTING.md](../CONTRIBUTING.md).
