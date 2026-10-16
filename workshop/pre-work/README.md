<!--
FACILITATOR: complete before distributing this folder.
1. In check-azure.sh, set WORKSHOP_REGION and WORKSHOP_MODELS. Then update the region and models in "What you need" below.
   The default is the Claude 5.5 version 2 set (Sonnet, Haiku, Opus; hosted on Azure, retiring September 2027). Remove any model you won't deploy.
2. The minimum Claude Code version is 2.1.294, the oldest version verified with Foundry. To change it, edit MIN_CLAUDE_VERSION in check-workstation.sh and -MinClaudeVersion in check-workstation.ps1, and update "What you need" below.
3. Participants clone the public repo (https://github.com/cgero-msft/claude-code-foundry-ezdeploy). The Cloud Shell steps download check-azure.sh and the deployment engine from its main branch, so the workshop changes must be merged to main before you share the link.
-->

# Claude Code on Microsoft Foundry: pre-workshop checklist

In the workshop you'll deploy a Claude model to Microsoft Foundry in **your own Azure subscription**, then connect **your existing Claude Code** to it. The session is 60 minutes, which leaves no time to fix account, permission, or install problems. Complete this checklist before the workshop.

The check scripts only **read** information. They don't create, change, or delete anything, and they never print secrets.

**Workshop files:** everything for the workshop is in the public repo [cgero-msft/claude-code-foundry-ezdeploy](https://github.com/cgero-msft/claude-code-foundry-ezdeploy). You'll clone it in Step 2. This checklist is in `workshop/pre-work`. On the day you'll use the participant guide (`workshop/participant-guide.md`) and the wizard (`wizard/index.html`) from the same clone.

## What you need

| Area | Requirement |
|---|---|
| Azure subscription | A paid subscription with an **active pay-as-you-go billing method**, billed in a country or region where Anthropic sells Claude models. |
| Not supported | Cloud Solution Provider (CSP) subscriptions, free trial, student, startup-credit, and credit-only sponsored subscriptions, and Enterprise Agreements in South Korea. |
| Permissions | **Contributor** or **Owner** on the subscription, or on the resource group you'll use. You also need to be allowed to purchase Azure Marketplace offers. |
| Model access | **Cognitive Services User** or **Foundry User** on the Foundry resource. Alternatively, have permission to assign roles and the workshop will assign it for you. |
| Region and quota | Claude Global Standard quota in **East US 2** for **Claude Sonnet 5.5**, **Claude Haiku 5.5**, and **Claude Opus 5.5**. |
| Workstation | **Windows** 10+, **macOS** 13+, or **Linux** (Ubuntu 20.04+ or Debian 10+; WSL2 also works), with 4 GB of RAM (8 GB recommended). You need Git, Azure CLI, and Claude Code 2.1.294 or later. On Windows you also need Git Bash (included with Git for Windows) or WSL2. VS Code with the Claude Code extension is optional. |
| Information to bring | Your organization's **legal name**, **two-letter country code**, and **industry**. Azure requires these for Anthropic deployments. |
| Authority | Approval to accept the Anthropic Azure Marketplace terms and to incur usage charges on the subscription. |

**Cost:** Claude deployments are pay-per-token. You're billed only for the prompts you send; an idle deployment costs nothing. We'll show you how to delete everything at the end of the workshop.

## Checklist

- [ ] 1. Confirm your subscription type is eligible (see the table above). If you're unsure, ask your Azure administrator.
- [ ] 2. Install or update the workstation tools for your platform (Windows, macOS, or Linux/WSL), then clone the workshop repo.
- [ ] 3. Run the workstation check on the computer you'll bring.
- [ ] 4. Run the Azure check (in Azure Cloud Shell or your own terminal).
- [ ] 5. Fix anything marked **FAIL**, then rerun the check that failed.
- [ ] 6. The day before the workshop: run `git pull` in your clone, then `claude update` and `az login`.
- [ ] 7. On the day: open `workshop/participant-guide.md` from your clone and follow it.

### Step 2: Install or update tools

Use the section for the computer you'll bring to the workshop. If you work in **WSL**, follow the **Linux** steps inside WSL. WSL has its own Azure CLI and its own sign-in, separate from Windows.

<details open>
<summary><b>Windows</b></summary>

Run these in PowerShell:

| Tool | Install | Already installed? |
|---|---|---|
| Azure CLI | `winget install -e --id Microsoft.AzureCLI` | `az upgrade` |
| Claude Code | `irm https://claude.ai/install.ps1 \| iex` | `claude update`. If you installed it with npm, run `claude install`. |
| Git (includes Git Bash) | `winget install -e --id Git.Git` | Nothing to do. |

Open a **new** terminal after installing so `az` and `claude` are on your PATH. If you use the terminal inside VS Code, quit VS Code completely (close **all** its windows, or **File** > **Exit**) and start it again; its terminals keep the PATH from when VS Code started.

If `claude --version` says `claude` isn't recognized, the Claude Code installer put it in `%USERPROFILE%\.local\bin` without adding that folder to your PATH. Add it once, then restart your terminal:

```powershell
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ";$HOME\.local\bin", 'User')
```

</details>

<details>
<summary><b>macOS</b></summary>

Run these in Terminal:

| Tool | Install | Already installed? |
|---|---|---|
| Azure CLI | `brew install azure-cli` ([Homebrew](https://brew.sh)) | `brew upgrade azure-cli` |
| Git | `xcode-select --install` (or `brew install git`) | Nothing to do. |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude update`. If you installed it with Homebrew, run `brew upgrade claude-code`; with npm, run `claude install`. |

macOS uses zsh by default. The workshop installer adds its settings to `~/.zshrc`.

</details>

<details>
<summary><b>Linux (and WSL)</b></summary>

| Tool | Install | Already installed? |
|---|---|---|
| curl and Git | `sudo apt-get install -y curl git` (Ubuntu/Debian) or your package manager | Nothing to do. |
| Azure CLI | Ubuntu/Debian: `curl -sL https://aka.ms/InstallAzureCLIDeb \| sudo bash`. Other distributions: [install guide](https://aka.ms/installazurecli). | `az upgrade` |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude update`. If you installed it with npm, run `claude install`. |

The workshop installer adds its settings to `~/.bashrc`, or `~/.zshrc` if zsh is your shell.

</details>

**VS Code (optional, any platform):** install the [Claude Code extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code). If you use VS Code on Windows with WSL, you'll set the Foundry settings on both sides during the workshop.

> **Don't start Claude Code yet.** To confirm it's installed, run only `claude --version`. If you just installed it, don't run `claude` on its own or sign in to Anthropic. If you already use Claude Code, keep using it as usual, but don't connect it to Foundry yourself. We'll do that together in the workshop.

**Get the workshop files.** In a terminal, go to the folder where you keep projects and clone the repo:

```text
git clone https://github.com/cgero-msft/claude-code-foundry-ezdeploy.git
```

This creates a `claude-code-foundry-ezdeploy` folder. Keep it for the workshop. If you work in WSL, clone it inside WSL.

### Step 3: Run the workstation check

Open a terminal on the computer you'll use in the workshop, and go to the `workshop/pre-work` folder in your clone. For example:

```text
cd <path-to>/claude-code-foundry-ezdeploy/workshop/pre-work
```

Then run the command for your platform:

| Platform | Command |
|---|---|
| Windows (PowerShell) | `Unblock-File .\check-workstation.ps1; powershell -ExecutionPolicy Bypass -File .\check-workstation.ps1` |
| macOS | `bash check-workstation.sh` |
| Linux | `bash check-workstation.sh` |
| WSL (if you'll use Claude Code inside WSL) | `bash check-workstation.sh` from your WSL terminal |

If you use Claude Code both natively on Windows and in WSL, run both checks.

### Step 4: Run the Azure check

The Azure check works the same way on every platform. The easiest place to run it is Azure Cloud Shell, which already has everything installed.

**Option A: Azure Cloud Shell (recommended)**

1. Sign in to [Azure Cloud Shell](https://shell.azure.com) with the account you'll use in the workshop and select **Bash**. On first use, choose **No storage account required** if you're offered it.
2. Download the check script into Cloud Shell:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/cgero-msft/claude-code-foundry-ezdeploy/main/workshop/pre-work/check-azure.sh
   ```

3. Run:

   ```bash
   bash check-azure.sh
   ```

**Option B: Your own terminal.** You need Azure CLI signed in (`az login`), `jq`, and Bash 4 or later. Run the check from the `workshop/pre-work` folder in your clone.

| Platform | Setup | Run |
|---|---|---|
| macOS | `brew install bash jq` (macOS ships Bash 3.2) | `"$(brew --prefix)/bin/bash" check-azure.sh` |
| Linux / WSL | `sudo apt-get install -y jq` (or your package manager) | `bash check-azure.sh` |
| Windows | Use Cloud Shell, or WSL with the Linux steps. | |

### Step 5: Fix common failures

| Check | What it means | What to do |
|---|---|---|
| Subscription type / Spending limit | The subscription can't buy Claude models. | Use an eligible pay-as-you-go, Enterprise Agreement, or Microsoft Customer Agreement subscription. Ask your Azure administrator. |
| Deployment permissions | You can't create the Foundry resources. | Ask for **Contributor** on the subscription or on a resource group created for you. If you get a resource group, rerun the check with that group: `bash check-azure.sh --resource-group <your-resource-group>`. |
| Resource provider | `Microsoft.CognitiveServices` isn't registered and you can't register it. | Ask a subscription Owner or Contributor to run `az provider register -n Microsoft.CognitiveServices`. |
| Model access role | You have no inference role and can't assign one. | Ask an Owner or User Access Administrator to grant you **Cognitive Services User** (or **Foundry User**) on your resource group. |
| Model … not offered | Your subscription can't see the model in the region. | This usually means the subscription type or billing country isn't eligible. Tell your facilitator. |
| Quota … limit is 0 / only N available | Your subscription doesn't have enough Claude quota. | Request an increase in the [Foundry portal](https://ai.azure.com) under **Operate** > **Quota**, or through your Azure administrator. **Do this early**; approval isn't instant. |
| Foundry token | Your sign-in can't get a token for Foundry. | Run `az login` again, and add `--tenant <tenant-id>` if your subscription is in another tenant. If you see "device must be managed", your organization only allows sign-in from managed devices. WSL and VMs count as unmanaged, so sign in and run Claude Code on your managed Windows or macOS system instead. If it still fails, tell your facilitator. |
| Claude Code | It isn't installed, isn't on your PATH, is out of date, or was installed with npm or Homebrew. | Follow Step 2 for your platform. On Windows, see the PATH note at the end of the Windows section. |
| Platform | Your OS version is older than Claude Code supports. | Use macOS 13+, Ubuntu 20.04+, Debian 10+, or Windows 10+ with Git Bash or WSL2. |
| Memory (WARN) | The machine has less than 4 GB of RAM. | Use a different machine if you can. |
| curl (macOS/Linux) | The installers need `curl`. | Install it with your package manager. |
| Shell (WARN) | Your shell isn't bash or zsh (for example, fish). | Nothing to do now; we'll add the settings to your shell's config by hand. |
| Tools: Bash 4 / jq (Azure check, own terminal) | Your terminal is missing jq or has an old Bash (common on macOS). | Use Cloud Shell, or follow Option B in Step 4. |
| Git Bash / WSL | Windows has no POSIX shell for Claude Code. | Install Git for Windows or WSL2. |
| Environment variables / settings.json (WARN) | Existing Claude settings could override the workshop setup. | Leave them for now; we'll handle them in the workshop. |
| Foundry variables (FAIL) | Both `ANTHROPIC_FOUNDRY_RESOURCE` and `ANTHROPIC_FOUNDRY_BASE_URL` are set. | Remove one of them. |

**WARN** results don't block you, but read them. **FAIL** results will block you in the workshop.

### Step 6: The day before the workshop

In your clone, run `git pull` to get the latest workshop files. Then run `claude update` and `az login` so you start the workshop with a current Claude Code and a fresh Azure sign-in. Still don't start a Claude Code session; that happens in the workshop.

### Step 7: On the day

You're done with the pre-work. At the workshop, open the [participant guide](../participant-guide.md) (`workshop/participant-guide.md` in your clone) and follow it from Part 1.

## Stuck?

See the **Pre-work checks** section of the [troubleshooting sheet](../troubleshooting.md) (`workshop/troubleshooting.md` in your clone). If you bring a question to the workshop, share only the block between `----- COPY FROM HERE -----` and `----- COPY TO HERE -----` at the end of the script's output. It contains no subscription IDs, tenant IDs, or secrets; the output above it does.
