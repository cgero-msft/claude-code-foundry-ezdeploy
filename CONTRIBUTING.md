# Contributing

Contributions that improve correctness, safety, compatibility, tests, or public documentation are welcome.

## Before opening a change

1. Search existing issues and pull requests.
2. Keep changes focused on one problem.
3. Do not include credentials, customer data, tenant-specific identifiers, generated launchers, deployment reports, workstation activators, or other generated artifacts.
4. Preserve the dry-run-first workflow, explicit billable-resource confirmation, exact model/version selection, Microsoft Entra ID authentication, and safe rerun behavior.
5. Do not present this project as an official Microsoft or Anthropic product.
6. Do not add browser Azure authentication or a user-triggered commit path. The wizard must remain anonymous and usable from `file://`.

## Development setup

The regression suite requires:

- PowerShell.
- Node.js.
- Bash with `jq` and `tar`.
- Git for Windows when running the Windows wrapper.

On Windows, run the tests from the repository root:

```powershell
.\tests\run-regression.ps1
```

On Linux, run:

```bash
node tests/catalog-generator-regression.js scripts/generate-model-catalog.js
node tests/wizard-regression.js wizard/index.html
bash tests/engine-regression.sh scripts/ezdeploy-engine.sh
```

The engine regression suite uses a fake Azure CLI and must not make live Azure changes.

## Model catalog changes

The wizard catalog has three layers:

- `wizard/catalog/catalog.generated.js` is generated from the official regional Azure catalog and must not be hand-edited.
- `wizard/catalog/catalog.overlay.js` is the reviewed source for friendly names, ordering, default deployment names, and EZDeploy Recommended/Tested status.
- `wizard/catalog/catalog.fallback.js` is the curated emergency fallback used only when the generated snapshot is missing or malformed.

To reproduce a refresh locally, authenticate Azure CLI to an appropriate reference subscription, capture exactly the two supported regions, and run the zero-install generator:

```bash
mkdir -p .tmp/catalog-refresh
az cognitiveservices model list --location eastus2 --output json >.tmp/catalog-refresh/eastus2.json
az cognitiveservices model list --location swedencentral --output json >.tmp/catalog-refresh/swedencentral.json
node scripts/generate-model-catalog.js \
  --region eastus2=.tmp/catalog-refresh/eastus2.json \
  --region swedencentral=.tmp/catalog-refresh/swedencentral.json \
  --output wizard/catalog/catalog.generated.js
```

The generator accepts only complete data for both regions, deduplicates models by `format|name|version`, deduplicates SKUs by `name|usageName`, and writes atomically. Empty, malformed, or incomplete input must leave the checked-in last-known-good snapshot unchanged.

The daily `refresh-model-catalog.yml` workflow uses GitHub OIDC, opens or updates an automation pull request for valid changes, and opens or updates one failure issue without replacing the snapshot when refresh or validation fails. Never add a client secret to this workflow. The workflow's owner setup — federated credential, reference identity role, and repository secrets — is documented in [docs/catalog-refresh.md](docs/catalog-refresh.md).

## Pull requests

Describe:

- The problem and intended behavior.
- User-visible, security, networking, billing, or compatibility effects.
- The exact tests run and their results.
- Any documentation that changed.

Keep public documentation free of internal discussions, private environment history, customer information, and machine-specific paths.

By contributing, you agree that your contribution is licensed under the MIT License.
