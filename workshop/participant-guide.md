<!--
FACILITATOR: complete before the workshop.
1. Participants use their clone of the public repo (https://github.com/cgero-msft/claude-code-foundry-ezdeploy) from the pre-work, which includes the wizard with the Claude 5.5 models.
2. In Part 2, participants download the deployment engine from the repo's main branch. The workshop changes, including the engine fixes for Azure CLI 2.91+, must be merged to main first.
-->

# Claude Code on Microsoft Foundry: participant guide

In this workshop you'll deploy three Claude models to Microsoft Foundry in your own Azure subscription. Then you'll connect your existing Claude Code to them. Today your Claude Code calls Anthropic directly; by the end, it will call the Claude models in your Azure subscription instead, and you'll see how to switch it back.

## Before you start

- You completed the [pre-workshop checklist](pre-work/README.md), and both checks passed.
- **If you use Azure CLI for other work, note your current default subscription.** This has nothing to do with Claude Code: the workshop installer sets your Azure CLI default to the workshop subscription, and this lets you set it back in Part 5. Run this in a terminal on your workstation and write down the result:

  ```text
  az account show --query name -o tsv
  ```

| Part | What you do | Time |
|---|---|---|
| 1 | Fill in the wizard | 10 min |
| 2 | Deploy from Azure Cloud Shell | 15 min |
| 3 | Connect Claude Code | 15 min |
| 4 | Verify | 7 min |
| 5 | Clean up | 5 min |

## Part 1: Fill in the wizard

Open the wizard from the `claude-code-foundry-ezdeploy` folder you cloned for the pre-work. Either double-click `wizard/index.html`, or run this in a terminal in that folder:

| Platform | Command |
|---|---|
| Windows (PowerShell) | `Start-Process .\wizard\index.html` |
| macOS | `open wizard/index.html` |
| Linux or WSL | `xdg-open wizard/index.html` (WSL: `explorer.exe wizard\\index.html`) |

The wizard runs in your browser and doesn't sign in to Azure or send data anywhere.

### Wizard page 1: Azure target

The names below are **suggestions**. You can use your own names if they follow the rules.

| Field | What to enter | Rules |
|---|---|---|
| Subscription ID or name | Your subscription ID. To find it, run `az account show --query id -o tsv`. | |
| Resource group | Suggested: `rg-ccws-<alias>`, for example `rg-ccws-jdoe`. Use a new group so cleanup is a single command. | |
| Region | **East US 2**. Use Sweden Central only if your facilitator tells you to. | |
| Foundry account name | Suggested: `ccws-<alias>-<4 random characters>`, for example `ccws-jdoe-7k2q`. | 3–64 characters: lowercase letters, numbers, and hyphens. The name must be unique across all of Azure, because it becomes `<name>.services.ai.azure.com`. |
| Foundry project name | Keep `claude-code`. | 3–64 characters: letters, numbers, `_`, `.`, or `-`. |
| Assign the current signed-in user... | See the note below the table. | |

**About the "Assign the current signed-in user" checkbox.** The wizard's wording is technical. In plain terms: to *send prompts* to Claude you need a model-access role (**Cognitive Services User** or **Foundry User**). Owner or Contributor alone isn't enough. This checkbox asks the deployment to give you that role on your new Foundry account if you don't already have it.

| Your pre-work Azure check said (line "Model access role") | What to do |
|---|---|
| *"You already have inference access through: ..."* | **Leave it unchecked.** You already have the role. |
| *"No inference role yet, but you can assign one."* | **Check it.** The deployment gives you Cognitive Services User. |
| *"No inference role and you can't assign one."* | Leave it unchecked and tell your facilitator; an administrator must grant you the role. |

Checking it when you already have access does no harm: the deployment sees your existing role and doesn't add another.

### Wizard page 2: Models

Select these three models. Each one appears with **@ 2** and **Azure infrastructure**.

| Family | Select | Capacity | Deployment name |
|---|---|---|---|
| Sonnet | Claude Sonnet 5.5 @ 2 | Change to `100` | Keep `claude-sonnet-5-5` |
| Haiku | Claude Haiku 5.5 @ 2 | Change to `100` | Keep `claude-haiku-5-5` |
| Opus | Claude Opus 5.5 @ 2 | Change to `100` | Keep `claude-opus-5-5` |

The wizard fills in a capacity of 10; change each one to **100**. Capacity sets your rate limit, not a charge: you still pay only for the tokens you use.

Don't select the **@ 1** versions. Version 1 runs on Anthropic infrastructure; version 2 runs on Azure.

### Wizard page 3: Provider details

Azure sends these values to Anthropic for every Claude deployment.

| Field | What to enter |
|---|---|
| Legal organization name | Your company's **legal** name, for example `Contoso Ltd.` |
| Country code | Your company's two-letter country code, for example `US`. |
| Industry | The closest match to your company. |
| Both checkboxes | Read them, then check them. The first confirms that you're authorized to accept the Anthropic Azure Marketplace terms and the usage charges. The second confirms that you understand where each model runs. |

### Wizard pages 4 and 5: Claude Code defaults and review

1. On **Claude Code defaults**, confirm that each family shows your deployment: Sonnet → `claude-sonnet-5-5`, Haiku → `claude-haiku-5-5`, Opus → `claude-opus-5-5`.
2. On **Review**, check the resource group, account name, and the three deployments.
3. Select **Copy command**. You'll paste it into Cloud Shell in Part 2.

You don't need the download buttons.

## Part 2: Deploy from Azure Cloud Shell

1. Open [Azure Cloud Shell](https://shell.azure.com) with your workshop account and choose **Bash**.
2. Download the deployment engine into Cloud Shell and confirm it's there:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/cgero-msft/claude-code-foundry-ezdeploy/main/scripts/ezdeploy-engine.sh
   ls -l ezdeploy-engine.sh
   ```

3. Paste the command you copied from the wizard and press Enter. It starts with `bash './ezdeploy-engine.sh'`.
4. The engine checks everything first and changes nothing yet. It checks your subscription, model availability, quota, and names. Read the output, especially the model list and where each model is hosted.
5. If everything is correct, type `ACCEPT` and press Enter. Typing anything else stops the run without changes.
6. Wait for **Generated workstation package**. This usually takes a few minutes.
7. Download the package right away: select **Manage files** > **Download**, enter `claude-code-foundry.tar.gz`, and select **Download**. Your browser saves it to your usual downloads folder, normally **Downloads** (`%USERPROFILE%\Downloads` on Windows, `~/Downloads` on macOS and Linux). If your browser asks where to save it, choose **Downloads**.

Cloud Shell closes after about 20 minutes of inactivity. A temporary session (no storage account) deletes its files when it closes. If you lose the package, download the engine again (step 2) and run the same command. It reuses your resources and generates a new package.

## Part 3: Connect Claude Code

Open a terminal **on your workstation** (not Cloud Shell). The commands below start in your Downloads folder, where you saved the package in Part 2.

The installer does the following:

- It signs you in to Azure if you're signed in to a different tenant, then makes the workshop subscription your **default** `az` subscription.
- It installs Claude Code only if it's missing.
- It copies the Foundry settings to `~/.claude/` and adds one line to your shell profile, so every **new** terminal uses Foundry. On Windows it updates both the Windows PowerShell and PowerShell 7 profiles, so you can run it from either.

**Windows (PowerShell):**

```powershell
cd $HOME\Downloads
tar -xzf claude-code-foundry.tar.gz
cd claude-code-foundry
Set-ExecutionPolicy -Scope Process Bypass
.\install-claude-code-windows.ps1
```

**macOS or Linux:**

```bash
cd ~/Downloads
tar -xzf claude-code-foundry.tar.gz
cd claude-code-foundry
bash install-claude-code-local.sh
```

**WSL:** your browser saved the package in Windows, so copy it into WSL first. Replace `<windows-user>` with your Windows user name:

```bash
cp /mnt/c/Users/<windows-user>/Downloads/claude-code-foundry.tar.gz ~/
cd ~
tar -xzf claude-code-foundry.tar.gz
cd claude-code-foundry
bash install-claude-code-local.sh
```

Close the terminal and open a new one. If your organization requires a managed device for Azure sign-in, use your main operating system, not WSL or a VM.

## Part 4: Verify

1. In the new terminal, go to any folder, ideally a repository you work in so the test prompt has something to look at, and run `claude`.
2. Run `/status`. On the **Status** tab, confirm these lines:

   | Line | Should show |
   |---|---|
   | `API provider:` | `Microsoft Foundry` |
   | `Microsoft Foundry resource:` | **Your** Foundry account name, for example `ccws-jdoe-7k2q` |
   | `Model:` | An alias with your deployment name in parentheses, for example `opus (claude-opus-5-5)` |

   Lines about managed settings and organization policy say "not fetched" when you use Foundry. That's expected. Press **Esc** to close the panel.
3. Send a test prompt, for example `Summarize what this repository does in two sentences.`
4. Run `/model`, switch to **sonnet** and then **haiku**, and send a short prompt with each.

Claude Code now uses your Azure sign-in. `/login` and `/logout` are turned off while Foundry mode is on.

**Optional, VS Code extension:**

1. In VS Code, open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run **Preferences: Open User Settings (JSON)**.
2. Open `claude-code-foundry/vscode-settings.snippet.json` from the package and copy the `claudeCode.disableLoginPrompt` and `claudeCode.environmentVariables` entries into your settings file.
   - Don't copy the `deploymentOutputWarning` line.
3. Save, then fully quit VS Code (**File** > **Exit**, which closes all windows). **Reload Window** isn't enough.
4. From the terminal where you ran `az login`, run `code .`.
5. Open the Claude Code panel and type `/status`. Check that `Microsoft Foundry resource` shows **your** account name, then send a short prompt.

## Part 5: Clean up

Each prompt is billed to your subscription. Deployments you don't use cost nothing, so delete them when you're done with them, not necessarily today.

**Delete the Azure resources** (Cloud Shell or your terminal). Replace `<your-resource-group>` and `<your-account-name>` with the names you entered on wizard page 1, for example `rg-ccws-jdoe` and `ccws-jdoe-7k2q`. Not sure of your names? This lists each Foundry account with its resource group:

```bash
az cognitiveservices account list --query "[].{account:name, resourceGroup:resourceGroup}" -o table
```

Then delete the resource group:

```bash
az group delete --name <your-resource-group> --yes --no-wait
```

Azure keeps deleted Foundry accounts for a while and keeps their names reserved. To reuse the same account name, wait for the deletion to finish (this can take several minutes), then purge the account:

```bash
az group wait --name <your-resource-group> --deleted
az cognitiveservices account purge --location eastus2 --resource-group <your-resource-group> --name <your-account-name>
```

**Switch Claude Code back to Anthropic:**

These steps turn off Foundry mode, so Claude Code goes back to calling Anthropic directly, as it did before the workshop.

1. Remove the Foundry line from your shell profile:
   - Windows: Windows PowerShell and PowerShell 7 have separate profiles, so check both. Run `notepad $PROFILE.CurrentUserAllHosts` in **Windows PowerShell**, and again in **PowerShell 7** (`pwsh`). In each file, delete the line that contains `.claude\foundry.ps1` and save.
   - macOS, Linux, or WSL: open `~/.bashrc` or `~/.zshrc` and delete the line that contains `.claude/foundry.env`.
2. Delete `~/.claude/foundry.env` or `~/.claude/foundry.ps1`.
3. If you did the optional VS Code step: in VS Code, open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`), run **Preferences: Open User Settings (JSON)**, delete the `claudeCode.environmentVariables` and `claudeCode.disableLoginPrompt` entries, and save. Then fully quit VS Code (**File** > **Exit**) and reopen it.
4. Open a new terminal.
5. If you noted a default Azure CLI subscription in [Before you start](#before-you-start), set it back: `az account set --subscription "<your usual subscription>"`.
6. Run `claude` and check `/status`: `API provider` should no longer say `Microsoft Foundry`. If Claude Code asks you to sign in to Anthropic, run `/login`.

## If something goes wrong

Find your step and symptom in the [troubleshooting sheet](troubleshooting.md). If that doesn't fix it, raise your hand and tell your facilitator the exact error text.
