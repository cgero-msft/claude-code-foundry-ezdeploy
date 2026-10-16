#!/usr/bin/env bash
# Read-only pre-workshop check for Claude Code on Microsoft Foundry (macOS, Linux, WSL).
# It changes nothing and never prints secret values. Compatible with macOS Bash 3.2.
set -u

# Facilitator: minimum Claude Code version for the workshop (oldest version tested with Foundry).
MIN_CLAUDE_VERSION="${MIN_CLAUDE_VERSION:-2.1.294}"
MIN_AZ_VERSION="2.83.0"
TENANT_ID=""
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
RESULTS=""

usage() {
  cat <<'EOF'
Pre-workshop workstation check for Claude Code on Microsoft Foundry (read-only).

Usage: bash check-workstation.sh [--tenant TENANT_ID]

  --tenant TENANT_ID   Tenant that will host your Foundry resource, if your facilitator gave you one.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tenant) TENANT_ID="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

record() {
  RESULTS="${RESULTS}${1}|${2}|${3}
"
  case "$1" in
    PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    WARN) WARN_COUNT=$((WARN_COUNT + 1)) ;;
    FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
  esac
  printf '[%s] %s: %s\n' "$1" "$2" "$3"
}

# Returns success when version $1 >= version $2.
version_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if ((x[i] + 0) > (y[i] + 0)) exit 0; if ((x[i] + 0) < (y[i] + 0)) exit 1 }
    exit 0
  }'
}

extract_version() {
  printf '%s' "$1" | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n1
}

printf 'Claude Code on Microsoft Foundry: pre-workshop workstation check (read-only)\n\n'

# Platform (Claude Code supports macOS 13+, Ubuntu 20.04+, Debian 10+, and WSL)
os_name="$(uname -s)"
platform="$os_name"
distro_id=""
is_wsl=false
if [ "$os_name" = Darwin ]; then
  mac_version="$(sw_vers -productVersion 2>/dev/null)"
  platform="macOS ${mac_version}"
  if [ -n "$mac_version" ] && version_ge "$mac_version" "13.0"; then
    record PASS "Platform" "macOS ${mac_version} (Claude Code needs macOS 13+)."
  else
    record FAIL "Platform" "macOS ${mac_version:-unknown}; Claude Code needs macOS 13 or later."
  fi
elif [ "$os_name" = Linux ]; then
  distro_version=""
  distro_name="Linux"
  if [ -r /etc/os-release ]; then
    distro_id="$(. /etc/os-release && printf '%s' "${ID:-}")"
    distro_version="$(. /etc/os-release && printf '%s' "${VERSION_ID:-}")"
    distro_name="$(. /etc/os-release && printf '%s' "${PRETTY_NAME:-Linux}")"
  fi
  grep -qi microsoft /proc/version 2>/dev/null && is_wsl=true
  platform="$distro_name"
  [ "$is_wsl" = true ] && platform="${platform} (WSL)"
  case "$distro_id" in
    ubuntu) min_os="20.04" ;;
    debian) min_os="10" ;;
    *) min_os="" ;;
  esac
  if [ -z "$min_os" ]; then
    record INFO "Platform" "${platform}. Claude Code officially lists Ubuntu 20.04+ and Debian 10+; other distributions usually work."
  elif [ -n "$distro_version" ] && version_ge "$distro_version" "$min_os"; then
    record PASS "Platform" "${platform} (needs ${distro_id} ${min_os}+)."
  else
    record FAIL "Platform" "${platform}; Claude Code needs ${distro_id} ${min_os} or later."
  fi
else
  record WARN "Platform" "${os_name} isn't supported by this script. On Windows, run check-workstation.ps1 in PowerShell instead."
fi

mem_kb=""
if [ "$os_name" = Darwin ]; then
  mem_bytes="$(sysctl -n hw.memsize 2>/dev/null)"
  [ -n "$mem_bytes" ] && mem_kb=$((mem_bytes / 1024))
elif [ -r /proc/meminfo ]; then
  mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
fi
if [ -n "$mem_kb" ]; then
  mem_gb=$(((mem_kb + 524288) / 1048576))
  if [ "$mem_kb" -ge 3800000 ]; then
    record PASS "Memory" "${mem_gb} GB (Claude Code needs 4 GB; 8 GB recommended)."
  else
    record WARN "Memory" "${mem_gb} GB; Claude Code needs at least 4 GB (8 GB recommended)."
  fi
fi

if ! command -v curl >/dev/null 2>&1; then
  record FAIL "curl" "Not installed. The Claude Code and workshop installers need it; install curl with your package manager."
fi

case "${SHELL:-}" in
  */zsh) record INFO "Shell" "zsh. The workshop installer adds the Foundry settings to ~/.zshrc." ;;
  */bash) record INFO "Shell" "bash. The workshop installer adds the Foundry settings to ~/.bashrc." ;;
  *) record WARN "Shell" "${SHELL:-unknown}. The workshop installer only updates ~/.bashrc or ~/.zshrc, so you'll set the Foundry variables in your shell's config yourself." ;;
esac

case "$os_name" in
  Darwin) az_hint="brew install azure-cli" ;;
  *)
    case "$distro_id" in
      ubuntu|debian) az_hint="curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash" ;;
      *) az_hint="see https://aka.ms/installazurecli" ;;
    esac ;;
esac

# Azure CLI
if ! command -v az >/dev/null 2>&1; then
  record FAIL "Azure CLI" "Not installed. Install it: ${az_hint}"
else
  az_version="$(extract_version "$(az version 2>/dev/null | grep '"azure-cli"')")"
  if [ -z "$az_version" ]; then
    record WARN "Azure CLI" "Installed, but the version could not be read."
  elif version_ge "$az_version" "$MIN_AZ_VERSION"; then
    record PASS "Azure CLI" "${az_version}."
  else
    record WARN "Azure CLI" "${az_version} is older than ${MIN_AZ_VERSION}. Run 'az upgrade'."
  fi

  current_tenant="$(az account show --query tenantId -o tsv 2>/dev/null)"
  if [ -z "$current_tenant" ]; then
    record WARN "Azure sign-in" "Not signed in. Run 'az login' (or 'az login --tenant <tenant-id>') before the workshop."
  else
    if [ -n "$TENANT_ID" ] && [ "$(printf '%s' "$current_tenant" | tr 'A-Z' 'a-z')" != "$(printf '%s' "$TENANT_ID" | tr 'A-Z' 'a-z')" ]; then
      record WARN "Azure sign-in" "Signed in to a different tenant than the one provided. Run 'az login --tenant ${TENANT_ID}'."
    else
      record PASS "Azure sign-in" "Signed in."
    fi
    if az account get-access-token --resource https://ai.azure.com --query expiresOn -o tsv >/dev/null 2>&1; then
      record PASS "Foundry token" "Your sign-in can get a token for Microsoft Foundry."
    else
      record FAIL "Foundry token" "Couldn't get a token for https://ai.azure.com. Re-run 'az login'; if it persists, Conditional Access may block it. Tell your facilitator."
    fi
  fi
fi

# Claude Code
if ! command -v claude >/dev/null 2>&1; then
  record FAIL "Claude Code" "Not found on PATH. Install with 'curl -fsSL https://claude.ai/install.sh | bash', then open a new terminal."
else
  claude_version="$(extract_version "$(claude --version 2>/dev/null)")"
  claude_path="$(command -v claude)"
  claude_target="$(readlink "$claude_path" 2>/dev/null || true)"
  if [ -z "$claude_version" ]; then
    record WARN "Claude Code" "Installed, but the version could not be read."
  elif [ -n "$MIN_CLAUDE_VERSION" ] && ! version_ge "$claude_version" "$MIN_CLAUDE_VERSION"; then
    record FAIL "Claude Code" "${claude_version} is older than the workshop minimum ${MIN_CLAUDE_VERSION}. Run 'claude update'."
  else
    record PASS "Claude Code" "${claude_version}. Run 'claude update' the day before the workshop."
  fi
  case "${claude_path} ${claude_target}" in
    *node_modules*)
      record WARN "Claude Code install method" "Installed with npm, which is deprecated and doesn't auto-update. Run 'claude install' to switch to the native installer." ;;
    *Caskroom*|*homebrew*|*Homebrew*)
      record WARN "Claude Code install method" "Installed with Homebrew, which doesn't auto-update. Run 'brew upgrade claude-code' before the workshop." ;;
  esac
fi

# Existing configuration that can conflict with Foundry mode (names only, never values)
conflicts=""
foundry_set=""
profiles="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile $HOME/.zshrc $HOME/.zprofile"
for name in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX \
            CLAUDE_CODE_USE_FOUNDRY ANTHROPIC_FOUNDRY_RESOURCE ANTHROPIC_FOUNDRY_BASE_URL ANTHROPIC_FOUNDRY_API_KEY; do
  where=""
  [ -n "$(printenv "$name" 2>/dev/null)" ] && where="this shell"
  for profile in $profiles; do
    if [ -f "$profile" ] && grep -Eq "^[[:space:]]*(export[[:space:]]+)?${name}=" "$profile"; then
      where="${where:+${where}/}$(basename "$profile")"
    fi
  done
  [ -n "$where" ] || continue
  case "$name" in
    CLAUDE_CODE_USE_FOUNDRY|ANTHROPIC_FOUNDRY_*) foundry_set="${foundry_set:+${foundry_set}, }${name} (${where})" ;;
    *) conflicts="${conflicts:+${conflicts}, }${name} (${where})" ;;
  esac
done
if [ -n "$conflicts" ]; then
  record WARN "Environment variables" "Set: ${conflicts}. These can override Foundry mode; we'll handle them in the workshop."
fi
case "$foundry_set" in
  *ANTHROPIC_FOUNDRY_RESOURCE*ANTHROPIC_FOUNDRY_BASE_URL*|*ANTHROPIC_FOUNDRY_BASE_URL*ANTHROPIC_FOUNDRY_RESOURCE*)
    record FAIL "Foundry variables" "Both ANTHROPIC_FOUNDRY_RESOURCE and ANTHROPIC_FOUNDRY_BASE_URL are set; Claude Code rejects that. Remove one." ;;
  "") ;;
  *) record INFO "Foundry variables" "Already set: ${foundry_set}. The workshop will replace them with your new resource." ;;
esac
if [ -z "$conflicts" ] && [ -z "$foundry_set" ]; then
  record PASS "Environment variables" "No conflicting Claude variables set."
fi

settings="$HOME/.claude/settings.json"
if [ -f "$settings" ]; then
  notes=""
  if command -v jq >/dev/null 2>&1; then
    if ! jq -e . "$settings" >/dev/null 2>&1; then
      record WARN "Claude settings.json" "${settings} isn't valid JSON."
    else
      jq -e 'has("apiKeyHelper")' "$settings" >/dev/null 2>&1 && notes="apiKeyHelper"
      env_names="$(jq -r '(.env // {}) | keys[] | select(test("^(ANTHROPIC_|CLAUDE_CODE_USE_)"))' "$settings" 2>/dev/null | paste -sd ',' -)"
      [ -n "$env_names" ] && notes="${notes:+${notes}; }env: ${env_names}"
    fi
  else
    grep -q '"apiKeyHelper"' "$settings" && notes="apiKeyHelper"
    grep -Eq '"(ANTHROPIC_[A-Z_]+|CLAUDE_CODE_USE_[A-Z]+)"' "$settings" && notes="${notes:+${notes}; }ANTHROPIC_/CLAUDE_CODE_USE_ keys"
  fi
  if [ -n "$notes" ]; then
    record WARN "Claude settings.json" "Contains ${notes}. These may override Foundry mode; bring this up at the workshop."
  elif jq -e . "$settings" >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
    record PASS "Claude settings.json" "No provider overrides found."
  fi
fi

for managed in "/Library/Application Support/ClaudeCode/managed-settings.json" "/etc/claude-code/managed-settings.json"; do
  if [ -f "$managed" ]; then
    record WARN "Managed settings" "Your organization manages Claude Code settings, which override personal settings. Tell your facilitator."
    break
  fi
done

if [ "$is_wsl" = true ]; then
  record INFO "WSL" "WSL has its own Azure CLI sign-in, separate from Windows. If you use VS Code from Windows, the Foundry settings must be set in both Windows and WSL."
fi

# VS Code extension (optional)
if command -v code >/dev/null 2>&1; then
  if code --list-extensions 2>/dev/null | grep -qx 'anthropic.claude-code'; then
    record PASS "VS Code extension" "Claude Code extension installed (optional)."
  else
    record INFO "VS Code extension" "Claude Code extension not installed (optional)."
  fi
fi

printf '\n========== Summary: %d PASS, %d WARN, %d FAIL ==========\n' "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
printf '\nIf you ask your facilitator for help, share only the block below. It contains no IDs or secrets.\n\n'
printf -- '----- COPY FROM HERE -----\n'
printf 'Claude on Foundry pre-work: workstation check, %s (%s)\n' "$platform" "$(date -u +'%Y-%m-%d')"
printf '%s' "$RESULTS" | while IFS='|' read -r status check detail; do
  [ -n "$status" ] && printf '%-4s  %s: %s\n' "$status" "$check" "$detail"
done
printf 'Result: %d PASS, %d WARN, %d FAIL\n' "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
printf -- '----- COPY TO HERE -----\n'

[ "$FAIL_COUNT" -eq 0 ]
