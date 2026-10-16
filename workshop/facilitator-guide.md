# Claude Code on Microsoft Foundry: facilitator guide

A 60-minute guided workshop. Each participant deploys three Claude models (Sonnet, Haiku, and Opus 5.5, version 2) to Microsoft Foundry in their own Azure subscription, then connects their existing Claude Code to them.

Participants use two documents from the public repo, [cgero-msft/claude-code-foundry-ezdeploy](https://github.com/cgero-msft/claude-code-foundry-ezdeploy):

- [Pre-workshop checklist](pre-work/README.md): self-directed homework. Participants don't send results.
- [Participant guide](participant-guide.md): the step-by-step for the session.

> **Timings in this guide are estimates.** Adjust them after you rehearse the workshop end to end.

## Before the workshop

### Two to three weeks before

1. **Confirm the workshop files are on `main`.** The pre-work and Part 2 download `check-azure.sh` and the deployment engine from the repo's `main` branch, and participants clone `main`. It must include the wizard with the Claude 5.5 catalog, the `workshop` folder, and the engine fixes for Azure CLI 2.91+.
2. **Send the repo link** with a short note: "Clone https://github.com/cgero-msft/claude-code-foundry-ezdeploy, complete `workshop/pre-work/README.md` before the workshop, and bring the computer you used." Mention that the subscription needs pay-as-you-go billing and Claude quota, because a quota request isn't instant.

### The week of the workshop

1. **Check the engine against today's Azure.** Azure CLI and the model catalog change without notice, and both have broken the engine before. From a clone, run a read-only dry run with the workshop models:

   ```bash
   bash scripts/ezdeploy-engine.sh --subscription <sub> --resource-group rg-ccws-check \
     --location eastus2 --account-name <unused-name> --project-name claude-code \
     --organization-name "<org>" --country-code US --industry technology --sku GlobalStandard \
     --model claude-sonnet-5-5:2:claude-sonnet-5-5:100 \
     --model claude-haiku-5-5:2:claude-haiku-5-5:100 \
     --model claude-opus-5-5:2:claude-opus-5-5:100 \
     --default-sonnet-model claude-sonnet-5-5 --default-haiku-model claude-haiku-5-5 \
     --default-opus-model claude-opus-5-5 --dry-run
   ```

   It should end with `Dry run completed`. If it fails, fix the engine and get the fix merged to `main` before the workshop.
2. **Check the models are still current.** Run the pre-work Azure check yourself. A WARN about deprecation means you should pick newer models.
3. **Prepare your reference environment**: a working deployment and Claude Code connected to it, for demos and as a fallback.

### On the day

- Open the participant guide, the wizard, and Cloud Shell on the screen you'll share.
- Have the reference environment's `/status` ready to show.

## Agenda

| Time (estimate) | Part | Participants do | Checkpoint before moving on |
|---|---|---|---|
| 0:00–0:05 | Welcome | Open the participant guide from their clone. | Everyone has the repo cloned and the pre-work done. |
| 0:05–0:15 | 1. Wizard | Fill in the wizard and select **Copy command**. | Everyone has the command copied. |
| 0:15–0:30 | 2. Deploy | Open Cloud Shell, download the engine, run the command, type `ACCEPT`, and download the package. | Everyone sees **Generated workstation package** and has `claude-code-foundry.tar.gz` in Downloads. |
| 0:30–0:45 | 3. Connect | Extract the package and run the installer. Open a new terminal. | The installer finished without errors. |
| 0:45–0:52 | 4. Verify | Run `claude`, check `/status`, and prompt each model. | `/status` shows **Microsoft Foundry** and the participant's own resource. |
| 0:52–0:57 | 5. Clean up | Walk through the cleanup commands. Participants can run them now or later. | Everyone knows how to delete and switch back. |
| 0:57–1:00 | Wrap-up | Questions and next steps. | |

Part 2 has the most waiting: model deployments take a few minutes. Use that time for the talking points below.

## Talking points

### Part 1: Wizard

- **What gets created:** one resource group, one Foundry account, one project, and one deployment per model. Nothing is created until `ACCEPT` in Part 2.
- **Names are suggestions.** The account name must be unique across Azure, because it becomes `<name>.services.ai.azure.com`.
- **Version 1 vs version 2:** the same model, hosted differently. Version 1 runs on Anthropic infrastructure; version 2 runs on Azure. The workshop uses version 2.
- **Capacity 100:** capacity sets the rate limit, not a charge. Participants pay only for the tokens they use.
- **The checkboxes on page 3** confirm authority to accept the Anthropic Marketplace terms and an understanding of where each model runs. The organization details go to Anthropic as provider data.

### Part 2: Deploy

- **The engine checks before it changes anything:** subscription, model availability, quota, and names. The output before `ACCEPT` is a full preview.
- **`ACCEPT` is the commit point.** Anything else stops the run with no changes.
- **Entra-only:** the new account has API keys turned off. Claude Code signs in with the participant's Azure identity, and no keys are stored anywhere.
- **Pinned versions:** each deployment uses `NoAutoUpgrade`, so the model version can't change under a running team.
- **Download the package right away.** Temporary Cloud Shell sessions lose their files when they close.

### Part 3: Connect

- **What the installer changes:** it signs in to the right tenant if needed, sets the workshop subscription as the default `az` subscription, copies settings to `~/.claude/`, and adds one line to the shell profile. On Windows, it updates both Windows PowerShell and PowerShell 7.
- **Why a new terminal:** the profile line only loads in new shells.

### Part 4: Verify

- **Foundry mode turns off `/login` and `/logout`.** Authentication comes from Azure.
- **Model aliases:** `sonnet`, `haiku`, and `opus` map to the participant's deployment names. `/model` switches between them.
- **"Not fetched" lines** in `/status` about managed settings and organization policy are expected with Foundry.

### Part 5: Clean up

- **Idle deployments cost nothing.** Participants can keep them and delete later.
- **Deleted accounts are kept for a while** and their names stay reserved until purged.

## Known issues

Participants have the same fixes, by step, in the [troubleshooting sheet](troubleshooting.md).

| Symptom | Cause | Fix |
|---|---|---|
| `Azure CLI does not support --disable-local-auth` | An engine from before the fix. Azure CLI 2.91+ dropped the option. | Download the engine again with the `curl` command in participant guide Part 2 (it replaces the old copy) and rerun. If `main` doesn't have the fix yet, that's the cause. |
| `jq: error ... Cannot index string with string "name"` | Old engine; the live model catalog changed shape. | Same: download the engine again. |
| `claude` isn't recognized (Windows) | The Claude Code installer doesn't add `%USERPROFILE%\.local\bin` to PATH. | Run the PATH command from pre-work Step 2, then quit VS Code completely or open a new terminal. Quick fix for one terminal: `$env:Path += ";$HOME\.local\bin"`. |
| Still not recognized after restarting VS Code | Closing one window doesn't restart VS Code; all windows share one process. | **File** > **Exit**, then reopen. |
| VS Code `/status` shows a different resource | An older `claudeCode.environmentVariables` entry in VS Code user `settings.json`. | Replace that entry with the one from `vscode-settings.snippet.json`. |
| Claude Code asks to sign in to Anthropic | Foundry mode isn't loaded in that terminal. | Open a new terminal, or load the settings file shown in the participant guide. |
| Cloud Shell session closed and the package is gone | Temporary session timed out. | Download the engine again and rerun the same command. It reuses the resources and regenerates the package. |
| Account name taken | The name isn't unique across Azure. | Change the random characters, copy the command again, and rerun. |
| Quota shortage | The subscription doesn't have enough Claude quota. | If the engine reports enough quota for a lower capacity, have the participant set that capacity in the wizard, copy the command again, and rerun. Otherwise pair them. |
| Marketplace or policy error | The organization blocks Anthropic offers. | Pair with another participant. This can't be fixed in the session. |
| 401 or 403 in Claude Code | Missing model-access role, or a new role hasn't propagated. | Wait up to about 5 minutes and retry in a new terminal. Check the role (Cognitive Services User or Foundry User) and `az account show`. |
| "device must be managed" on `az login` | Conditional Access blocks unmanaged devices (WSL, VMs). | Use the managed Windows or macOS system, not WSL. |

## When a participant is blocked

1. **Pair them** with a neighbor for Parts 2–4 so they still see the full flow.
2. **Demo on your reference environment** if several people are blocked at the same step.
3. **Send them away with the guide.** Everything they need is in the participant guide, so they can finish after the session once the blocker (quota, policy, or role) is resolved.

## After the workshop

- Remind participants how to clean up (participant guide, Part 5).
- Share next steps:
  - [Configure Claude Code for Foundry](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/configure-claude-code?tabs=bash): environment variables, VS Code, troubleshooting.
  - [Deploy and use Claude models in Foundry](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-claude?tabs=python): eligibility, quotas, and errors.
  - [Claude clients with Azure API Management](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/connecting-claude-clients-with-azure-api-management-and-claude-models-in-microso/4525212): team rollout with per-developer limits and metering.
- Clean up or keep your reference environment.
