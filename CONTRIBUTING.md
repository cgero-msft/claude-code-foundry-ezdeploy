# Contributing

Contributions that improve correctness, safety, compatibility, tests, or public documentation are welcome.

## Before opening a change

1. Search existing issues and pull requests.
2. Keep changes focused on one problem.
3. Do not include credentials, customer data, tenant-specific identifiers, generated launchers, deployment reports, workstation activators, or other generated artifacts.
4. Preserve the dry-run-first workflow, explicit billable-resource confirmation, exact model/version selection, Microsoft Entra ID authentication, and safe rerun behavior.
5. Do not present this project as an official Microsoft or Anthropic product.

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
node tests/wizard-regression.js wizard/index.html
bash tests/engine-regression.sh scripts/ezdeploy-engine.sh
```

The engine regression suite uses a fake Azure CLI and must not make live Azure changes.

## Pull requests

Describe:

- The problem and intended behavior.
- User-visible, security, networking, billing, or compatibility effects.
- The exact tests run and their results.
- Any documentation that changed.

Keep public documentation free of internal discussions, private environment history, customer information, and machine-specific paths.

By contributing, you agree that your contribution is licensed under the MIT License.
