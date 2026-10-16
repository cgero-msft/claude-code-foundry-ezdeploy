# Claude Code on Microsoft Foundry: troubleshooting

Find the step where you're stuck, then the symptom. If nothing here fixes it, tell your facilitator the exact error text.

## Pre-work checks

| Symptom | Cause | Fix |
|---|---|---|
| `claude` isn't recognized (Windows) | The Claude Code installer put `claude.exe` in `%USERPROFILE%\.local\bin` but didn't add that folder to your PATH. | Run the PATH command in pre-work Step 2 (Windows), then open a new terminal. In VS Code, quit it completely (**File** > **Exit**) and reopen it. |
| Still not recognized after restarting VS Code | All VS Code windows share one process, so closing one window doesn't pick up the new PATH. | **File** > **Exit**, then reopen VS Code. |
| Azure check: subscription type or spending limit | The subscription can't buy Claude models. | Use a pay-as-you-go, Enterprise Agreement, or Microsoft Customer Agreement subscription with no spending limit. |
| Azure check: quota limit is 0 or too low | Not enough Claude quota in East US 2. | Request an increase in the [Foundry portal](https://ai.azure.com) under **Operate** > **Quota**. Approval isn't instant. |
| Azure check: no model access role and you can't assign one | You need Cognitive Services User or Foundry User to send prompts. | Ask an Owner or User Access Administrator to grant one of those roles. |
| "device must be managed" on `az login` | Your organization only allows sign-in from managed devices. WSL and VMs count as unmanaged. | Sign in and run Claude Code on your managed Windows or macOS system, not WSL or a VM. |

## Part 1: Wizard

| Symptom | Cause | Fix |
|---|---|---|
| The Claude 5.5 models aren't listed | Your clone of the repo is out of date. | In your `claude-code-foundry-ezdeploy` folder, run `git pull`, then reopen `wizard/index.html`. |
| "Use valid account and project names" | The account name breaks the naming rules. | Use 3–64 lowercase letters, numbers, and hyphens, starting and ending with a letter or number. |
| Not sure about the "Assign the current signed-in user" checkbox | | See the note under the wizard page 1 table in the participant guide. |

## Part 2: Deploy in Cloud Shell

| Symptom | Cause | Fix |
|---|---|---|
| `bash: ./ezdeploy-engine.sh: No such file or directory` | The engine isn't in your Cloud Shell home folder. | Download it with the `curl` command in participant guide Part 2, step 2, then run `ls -l ezdeploy-engine.sh`. |
| `Azure CLI does not support --disable-local-auth` | You're running an older copy of the engine. | Download it again with the `curl` command in Part 2, step 2 (it replaces the old copy), and rerun the command. |
| `jq: error ... Cannot index string with string "name"` | Same: an older copy of the engine. | Same fix. |
| The account name is taken or unavailable | Foundry account names must be unique across Azure. | Change the 4 random characters in the wizard, select **Copy command** again, and rerun. |
| Quota shortage | Your subscription doesn't have enough quota for the capacity you chose. | Tell your facilitator before changing the capacity. |
| A Marketplace or policy error | Your organization blocks Anthropic Marketplace offers or Claude deployments. | Tell your facilitator. This can't be fixed during the session; you'll pair with someone. |
| You typed something other than `ACCEPT` | The engine stops without changes. | Rerun the same command. |
| Cloud Shell closed and the package is gone | Temporary sessions delete their files when they close. | Download the engine again and rerun the same command. It reuses your resources and makes a new package. |

## Part 3: Connect Claude Code

| Symptom | Cause | Fix |
|---|---|---|
| `tar` can't find `claude-code-foundry.tar.gz` | You're not in the folder where your browser saved it. | Run `cd $HOME\Downloads` (Windows) or `cd ~/Downloads`, then retry. |
| The installer is blocked by execution policy (Windows) | PowerShell blocks unsigned scripts by default. | Run `Set-ExecutionPolicy -Scope Process Bypass` in the same window first. If Group Policy still blocks it, tell your facilitator. |
| The installer opens a browser sign-in | You were signed in to a different tenant. | Sign in with your workshop account. |

## Part 4: Verify in the terminal

| Symptom | Cause | Fix |
|---|---|---|
| Claude Code asks you to sign in to Anthropic | Foundry mode isn't loaded in this terminal. | Open a new terminal. Or load it now: `. $HOME\.claude\foundry.ps1` (Windows) or `source ~/.claude/foundry.env`. |
| `/status` shows a different Foundry resource | Another setting overrides the workshop one, for example `env` in `~/.claude/settings.json`. | Tell your facilitator. |
| 401 or 403 | You don't have a model access role on the account yet, or a new role hasn't taken effect. | Wait up to about 5 minutes, open a new terminal, and retry. Check you're in the right subscription with `az account show`. |
| "Token tenant does not match resource tenant" | `az` is signed in to a different tenant than your Foundry account. | Run `az login --tenant <tenant-id>`, then open a new terminal. |
| "ChainedTokenCredential authentication failed" or "Unable to get authority configuration" | Claude Code couldn't get an Azure token. | Run `az login` in the same terminal, then start `claude` again. |
| "baseURL and resource are mutually exclusive" | Both `ANTHROPIC_FOUNDRY_BASE_URL` and `ANTHROPIC_FOUNDRY_RESOURCE` are set. | Remove `ANTHROPIC_FOUNDRY_BASE_URL` from your environment and from `~/.claude/settings.json`. |
| "model ... is not available on your foundry deployment" | Claude Code asked for a model you didn't deploy. | Use `/model` to pick **sonnet**, **haiku**, or **opus**. If it still fails, tell your facilitator. |
| 429 (too many requests) | You hit the deployment's rate limit. | Wait a minute and retry. |

## Part 4: VS Code extension

| Symptom | Cause | Fix |
|---|---|---|
| The extension asks you to sign in to Anthropic | VS Code didn't load the new settings. | Check that both `claudeCode` entries are in your user settings, then quit VS Code completely (**File** > **Exit**) and start it with `code .` from a terminal. |
| `/status` in the panel shows a different resource | Your settings have an older `claudeCode.environmentVariables` entry. | Replace it with the one from `vscode-settings.snippet.json`, then restart VS Code completely. |

## Part 5: Clean up

| Symptom | Cause | Fix |
|---|---|---|
| `ResourceGroupNotFound` when you delete the resource group | You entered a different name, often the Foundry account name. `/status` and `~/.claude/foundry.*` show the account name, not the resource group. | List your accounts and their resource groups with `az cognitiveservices account list --query "[].{account:name, resourceGroup:resourceGroup}" -o table`, then delete the group shown. |
| You want to reuse the same account name, but it's still reserved | Deleted Foundry accounts are kept for a while. | Purge it: `az cognitiveservices account purge --location eastus2 --resource-group <your-resource-group> --name <your-account-name>`. |
| Purge says the account "is still active, please delete the account first" | The resource group deletion (`--no-wait`) is still running. | Wait for it with `az group wait --name <your-resource-group> --deleted`, then run the purge again. |
| Claude Code still uses Foundry after switching back | A profile line or VS Code setting is still there. | Repeat the switch-back steps in Part 5, including both PowerShell profiles on Windows, then open a new terminal. |
| "Can't reach the API server ... (ENOTFOUND)" after deleting the resources | Claude Code is still in Foundry mode and points at the deleted account, whose address no longer exists. | Finish the switch-back steps in Part 5, then quit VS Code completely (**File** > **Exit**) and open a new terminal. |
