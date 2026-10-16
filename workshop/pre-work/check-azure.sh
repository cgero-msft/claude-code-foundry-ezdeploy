#!/usr/bin/env bash
# Read-only pre-workshop check for Claude on Microsoft Foundry. Run in Azure Cloud Shell (Bash),
# or locally with Bash 4+, Azure CLI, and jq. It changes nothing in Azure and prints no secrets.
set -uo pipefail

if ((BASH_VERSINFO[0] < 4)); then
  printf 'This script needs Bash 4 or later (found %s).\n' "$BASH_VERSION" >&2
  printf 'Run it in Azure Cloud Shell, or on macOS run: brew install bash jq && "$(brew --prefix)/bin/bash" check-azure.sh\n' >&2
  exit 2
fi

# Facilitator: set the workshop region and prescribed models (MODEL@VERSION=CAPACITY, space-separated).
WORKSHOP_REGION="${WORKSHOP_REGION:-eastus2}"
WORKSHOP_MODELS="${WORKSHOP_MODELS:-claude-sonnet-5-5@2=100 claude-haiku-5-5@2=100 claude-opus-5-5@2=100}"
readonly MIN_AZ_VERSION="2.83.0"
readonly DEPRECATION_WARN_DAYS=30
readonly SUBSCRIPTION_API_VERSION="2022-12-01"
readonly PERMISSIONS_API_VERSION="2022-04-01"
readonly DOMAIN_API_VERSION="2025-06-01"
readonly RUNTIME_ROLES='["Cognitive Services User","Cognitive Services OpenAI User","Cognitive Services OpenAI Contributor","Foundry User","Foundry Owner","Foundry Project Manager","Azure AI Project Manager","Azure AI User","Azure AI Owner","Azure AI Developer"]'

SUBSCRIPTION=""
RESOURCE_GROUP=""
ACCOUNT_NAME=""
SUB_ID=""
PERMISSIONS_JSON='{"value":[]}'
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
declare -a RESULTS=()

usage() {
  cat <<'EOF'
Pre-workshop Azure readiness check for Claude on Microsoft Foundry (read-only).

Usage: bash check-azure.sh [options]

Options:
  --subscription ID_OR_NAME   Subscription to check. Default: current Azure CLI subscription.
  --resource-group NAME       Resource group you plan to use (optional; may not exist yet).
  --account-name NAME         Foundry account name you plan to use; checks global availability (optional).
  --region REGION             eastus2 or swedencentral. Default: the workshop region.
  --models "SPEC ..."         MODEL@VERSION=CAPACITY list. Default: the workshop models.
  -h, --help                  Show this help.
EOF
}

record() {
  local status="$1" check="$2" detail="$3"
  RESULTS+=("${status}|${check}|${detail}")
  case "$status" in
    PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    WARN) WARN_COUNT=$((WARN_COUNT + 1)) ;;
    FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
  esac
  printf '[%s] %s: %s\n' "$status" "$check" "$detail"
}

require_value() {
  [[ $# -ge 2 && -n "$2" ]] || { printf 'Missing value for %s\n' "$1" >&2; exit 2; }
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --subscription) require_value "$@"; SUBSCRIPTION="$2"; shift 2 ;;
      --resource-group) require_value "$@"; RESOURCE_GROUP="$2"; shift 2 ;;
      --account-name) require_value "$@"; ACCOUNT_NAME="${2,,}"; shift 2 ;;
      --region) require_value "$@"; WORKSHOP_REGION="${2,,}"; shift 2 ;;
      --models) require_value "$@"; WORKSHOP_MODELS="$2"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) printf 'Unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
  done
  [[ "$WORKSHOP_REGION" == eastus2 || "$WORKSHOP_REGION" == swedencentral ]] ||
    { printf 'Region must be eastus2 or swedencentral.\n' >&2; exit 2; }
}

print_summary() {
  local line status check detail
  printf '\n========== Summary: %d PASS, %d WARN, %d FAIL ==========\n' "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
  printf '\nIf you ask your facilitator for help, share only the block below. It contains no IDs or secrets.\n\n'
  printf -- '----- COPY FROM HERE -----\n'
  printf 'Claude on Foundry pre-work: Azure check (%s)\n' "$(date -u +'%Y-%m-%d')"
  printf 'Region: %s | Models: %s\n' "$WORKSHOP_REGION" "$WORKSHOP_MODELS"
  for line in "${RESULTS[@]}"; do
    IFS='|' read -r status check detail <<<"$line"
    printf '%-4s  %s: %s\n' "$status" "$check" "$detail"
  done
  printf 'Result: %d PASS, %d WARN, %d FAIL\n' "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
  printf -- '----- COPY TO HERE -----\n'
  if ((FAIL_COUNT > 0)); then
    printf '\nAt least one check failed. See the README for fixes, then rerun this script.\n'
  elif ((WARN_COUNT > 0)); then
    printf '\nNo blockers found, but review the warnings above.\n'
  else
    printf '\nYou are ready for the Azure part of the workshop.\n'
  fi
}

finish() {
  print_summary
  ((FAIL_COUNT == 0))
  exit $?
}

version_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if ((x[i] + 0) > (y[i] + 0)) exit 0; if ((x[i] + 0) < (y[i] + 0)) exit 1 }
    exit 0
  }'
}

# Converts an ISO 8601 timestamp to epoch seconds with GNU date (Linux) or BSD date (macOS).
to_epoch() {
  date -u -d "$1" +%s 2>/dev/null ||
    date -u -j -f '%Y-%m-%dT%H:%M:%S' "${1%%[Z+]*}" +%s 2>/dev/null
}

check_tools() {
  local tool version
  for tool in az jq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      record FAIL "Tools" "${tool} is not installed. Run this script in Azure Cloud Shell (Bash), or install ${tool} locally (macOS: brew install ${tool/az/azure-cli})."
      finish
    fi
  done
  version="$(az version -o json 2>/dev/null | jq -r '."azure-cli" // empty')"
  if [[ -z "$version" ]]; then
    record FAIL "Azure CLI version" "Unable to read the Azure CLI version."
  elif version_ge "$version" "$MIN_AZ_VERSION"; then
    record PASS "Azure CLI version" "${version} (needs ${MIN_AZ_VERSION}+)."
  else
    record FAIL "Azure CLI version" "${version} is older than ${MIN_AZ_VERSION}. In Cloud Shell, restart the session; elsewhere run 'az upgrade'."
  fi
}

check_sign_in() {
  local account
  if ! az account show -o none 2>/dev/null; then
    record FAIL "Azure sign-in" "No active Azure CLI session. Run 'az login'."
    finish
  fi
  # Look up the subscription without changing the CLI's default subscription.
  if ! account="$(az account show ${SUBSCRIPTION:+--subscription "$SUBSCRIPTION"} -o json 2>/dev/null)"; then
    record FAIL "Subscription access" "The subscription you passed isn't available to your account. Check 'az account list -o table'."
    finish
  fi
  SUB_ID="$(jq -r '.id' <<<"$account")"
  printf '\nChecking subscription "%s" (%s) in tenant %s\n' \
    "$(jq -r '.name' <<<"$account")" "$SUB_ID" "$(jq -r '.tenantId' <<<"$account")"
  printf 'Region: %s | Models: %s\n\n' "$WORKSHOP_REGION" "$WORKSHOP_MODELS"
  record PASS "Azure sign-in" "Signed in and subscription selected."
}

check_subscription_type() {
  local sub state quota_id spending quota_lower
  if ! sub="$(az rest --method get \
      --url "https://management.azure.com/subscriptions/${SUB_ID}?api-version=${SUBSCRIPTION_API_VERSION}" \
      -o json 2>/dev/null)"; then
    record WARN "Subscription type" "Unable to read subscription details; confirm eligibility manually (see README)."
    return
  fi
  state="$(jq -r '.state // "Unknown"' <<<"$sub")"
  quota_id="$(jq -r '.subscriptionPolicies.quotaId // "Unknown"' <<<"$sub")"
  spending="$(jq -r '.subscriptionPolicies.spendingLimit // "Unknown"' <<<"$sub")"
  quota_lower="${quota_id,,}"

  if [[ "$state" != Enabled ]]; then
    record FAIL "Subscription state" "Subscription state is ${state}; it must be Enabled."
  else
    record PASS "Subscription state" "Enabled."
  fi

  case "$quota_lower" in
    *freetrial*|*student*|*azurepass*)
      record FAIL "Subscription type" "${quota_id}: trial, student, and pass subscriptions can't deploy Claude models. Use a pay-as-you-go, EA, or MCA subscription." ;;
    *csp*)
      record FAIL "Subscription type" "${quota_id}: Cloud Solution Provider (CSP) subscriptions can't deploy Claude models." ;;
    *sponsored*)
      record WARN "Subscription type" "${quota_id}: credit-only sponsored subscriptions aren't supported unless a pay-as-you-go payment method is on file." ;;
    *msdn*|*visualstudio*)
      record WARN "Subscription type" "${quota_id}: Visual Studio/MSDN credit subscriptions need an active pay-as-you-go payment method (no spending limit)." ;;
    unknown)
      record WARN "Subscription type" "Type not reported; confirm eligibility manually (see README)." ;;
    *)
      record PASS "Subscription type" "${quota_id}." ;;
  esac

  if [[ "$spending" == On ]]; then
    record WARN "Spending limit" "A spending limit is on, which usually means a credit-only subscription. Claude requires an active pay-as-you-go billing method."
  fi
}

load_permissions() {
  local scope="$1"
  PERMISSIONS_JSON="$(az rest --method get \
    --url "https://management.azure.com${scope}/providers/Microsoft.Authorization/permissions?api-version=${PERMISSIONS_API_VERSION}" \
    -o json 2>/dev/null)" || PERMISSIONS_JSON='{"value":[]}'
}

matches_any() {
  local action="${1,,}" patterns="$2" pattern
  while IFS= read -r pattern; do
    [[ -n "$pattern" ]] || continue
    pattern="${pattern,,}"
    # shellcheck disable=SC2053 # Intentional glob match against RBAC wildcards.
    [[ "$action" == $pattern ]] && return 0
  done <<<"$patterns"
  return 1
}

has_action() {
  local action="$1" count index actions not_actions
  count="$(jq '.value | length' <<<"$PERMISSIONS_JSON")"
  for ((index = 0; index < count; index++)); do
    actions="$(jq -r --argjson i "$index" '.value[$i].actions[]?' <<<"$PERMISSIONS_JSON")"
    not_actions="$(jq -r --argjson i "$index" '.value[$i].notActions[]?' <<<"$PERMISSIONS_JSON")"
    if matches_any "$action" "$actions" && ! matches_any "$action" "$not_actions"; then
      return 0
    fi
  done
  return 1
}

check_provider_and_permissions() {
  local provider_state scope="/subscriptions/${SUB_ID}" scope_label="subscription" missing=() action rg_exists=false
  if [[ -n "$RESOURCE_GROUP" ]]; then
    if az group show -n "$RESOURCE_GROUP" --subscription "$SUB_ID" -o none 2>/dev/null; then
      rg_exists=true
      scope="/subscriptions/${SUB_ID}/resourceGroups/${RESOURCE_GROUP}"
      scope_label="resource group"
    fi
  fi
  load_permissions "$scope"
  if [[ "$(jq '.value | length' <<<"$PERMISSIONS_JSON")" == 0 ]]; then
    record WARN "Deployment permissions" "Unable to read your effective permissions at ${scope_label} scope; confirm you have Contributor or Owner."
  else
    if [[ "$rg_exists" == false ]]; then
      has_action "Microsoft.Resources/subscriptions/resourceGroups/write" ||
        missing+=("create resource groups")
    fi
    for action in \
        Microsoft.CognitiveServices/accounts/write \
        Microsoft.CognitiveServices/accounts/projects/write \
        Microsoft.CognitiveServices/accounts/deployments/write; do
      has_action "$action" || missing+=("${action#Microsoft.CognitiveServices/}")
    done
    if ((${#missing[@]} == 0)); then
      record PASS "Deployment permissions" "You can create the Foundry account, project, and model deployments at ${scope_label} scope."
    else
      record FAIL "Deployment permissions" "Missing at ${scope_label} scope: ${missing[*]}. Ask for Contributor or Owner."
    fi
  fi

  provider_state="$(az provider show --namespace Microsoft.CognitiveServices --subscription "$SUB_ID" \
    --query registrationState -o tsv 2>/dev/null || true)"
  if [[ "$provider_state" == Registered ]]; then
    record PASS "Resource provider" "Microsoft.CognitiveServices is registered."
  else
    load_permissions "/subscriptions/${SUB_ID}"
    if has_action "Microsoft.CognitiveServices/register/action"; then
      record WARN "Resource provider" "Microsoft.CognitiveServices is ${provider_state:-not registered}. The deployment will register it; you have permission."
    else
      record FAIL "Resource provider" "Microsoft.CognitiveServices is ${provider_state:-not registered} and you can't register it. Ask a subscription Owner/Contributor to run: az provider register -n Microsoft.CognitiveServices"
    fi
  fi
}

check_runtime_access() {
  local object_id scope="/subscriptions/${SUB_ID}" assignments roles can_assign=false
  [[ -n "$RESOURCE_GROUP" ]] && az group show -n "$RESOURCE_GROUP" --subscription "$SUB_ID" -o none 2>/dev/null &&
    scope="/subscriptions/${SUB_ID}/resourceGroups/${RESOURCE_GROUP}"
  load_permissions "$scope"
  has_action "Microsoft.Authorization/roleAssignments/write" && can_assign=true

  if ! object_id="$(az ad signed-in-user show --query id -o tsv 2>/dev/null)" || [[ -z "$object_id" ]]; then
    record WARN "Model access role" "Couldn't resolve your user object ID; confirm you'll have Cognitive Services User or Foundry User on the Foundry account."
    return
  fi
  assignments="$(az role assignment list --assignee "$object_id" --scope "$scope" \
      --include-inherited --include-groups -o json 2>/dev/null ||
    az role assignment list --assignee "$object_id" --scope "$scope" --include-inherited -o json 2>/dev/null ||
    printf '[]')"
  roles="$(jq -r --argjson runtime "$RUNTIME_ROLES" \
    '[.[] | .roleDefinitionName | select(. as $r | $runtime | index($r))] | unique | join(", ")' <<<"$assignments")"

  if [[ -n "$roles" ]]; then
    record PASS "Model access role" "You already have inference access through: ${roles}."
  elif [[ "$can_assign" == true ]]; then
    record PASS "Model access role" "No inference role yet, but you can assign one. Check 'Assign the current signed-in user' in the wizard."
  else
    record WARN "Model access role" "No inference role and you can't assign one. Ask an Owner or User Access Administrator to grant you Cognitive Services User (or Foundry User) on the resource group you'll use."
  fi
}

check_models_and_quota() {
  local catalog usage spec name version capacity definition sku usage_name lifecycle deprecation dep_epoch now days
  local entry current limit available
  declare -A required=()
  declare -a pools=()

  if ! catalog="$(az cognitiveservices model list --location "$WORKSHOP_REGION" --subscription "$SUB_ID" -o json 2>/dev/null)"; then
    record FAIL "Model catalog" "Unable to read the ${WORKSHOP_REGION} model catalog for your subscription."
    return
  fi
  now="$(date -u +%s)"

  for spec in $WORKSHOP_MODELS; do
    if [[ ! "$spec" =~ ^([a-z0-9.-]+)@([A-Za-z0-9._-]+)=([1-9][0-9]*)$ ]]; then
      record FAIL "Model spec" "'${spec}' isn't MODEL@VERSION=CAPACITY."
      continue
    fi
    name="${BASH_REMATCH[1]}"
    version="${BASH_REMATCH[2]}"
    capacity="${BASH_REMATCH[3]}"

    definition="$(jq -c --arg n "$name" --arg v "$version" '
      [.[] | (.model // .) |
        select(.name == $n and ((.version | tostring) == $v) and ((.format // "") | ascii_downcase) == "anthropic")
      ] | .[0] // empty' <<<"$catalog")"
    if [[ -z "$definition" ]]; then
      record FAIL "Model ${name}@${version}" "Not offered to your subscription in ${WORKSHOP_REGION}. This often means the subscription type or billing country isn't eligible."
      continue
    fi
    lifecycle="$(jq -r '.lifecycleStatus // "unknown"' <<<"$definition")"
    if [[ "${lifecycle,,}" == deprecated || "${lifecycle,,}" == retired ]]; then
      record FAIL "Model ${name}@${version}" "Lifecycle is ${lifecycle}; it can't be deployed. Tell your facilitator."
      continue
    fi
    sku="$(jq -c '[.skus[]? | select(.name == "GlobalStandard")][0] // empty' <<<"$definition")"
    if [[ -z "$sku" ]]; then
      record FAIL "Model ${name}@${version}" "GlobalStandard deployment isn't offered in ${WORKSHOP_REGION}."
      continue
    fi
    usage_name="$(jq -r '.usageName // empty' <<<"$sku")"
    deprecation="$(jq -r --argjson d "$definition" '.deprecationDate // $d.deprecation.inference // empty' <<<"$sku")"
    if [[ -n "$deprecation" ]] && dep_epoch="$(to_epoch "$deprecation")"; then
      days=$(((dep_epoch - now) / 86400))
      if ((days < DEPRECATION_WARN_DAYS)); then
        record WARN "Model ${name}@${version}" "Available (${lifecycle}), but scheduled for deprecation on ${deprecation%%T*} (${days} days). Tell your facilitator."
      else
        record PASS "Model ${name}@${version}" "Available in ${WORKSHOP_REGION} (${lifecycle}, GlobalStandard)."
      fi
    else
      record PASS "Model ${name}@${version}" "Available in ${WORKSHOP_REGION} (${lifecycle}, GlobalStandard)."
    fi

    if [[ -z "$usage_name" ]]; then
      record WARN "Quota ${name}@${version}" "The catalog didn't report a quota pool for this model."
      continue
    fi
    if [[ -z "${required[$usage_name]+x}" ]]; then
      pools+=("$usage_name")
      required["$usage_name"]=0
    fi
    required["$usage_name"]=$((required["$usage_name"] + capacity))
  done

  ((${#pools[@]} > 0)) || return
  if ! usage="$(az cognitiveservices usage list --location "$WORKSHOP_REGION" --subscription "$SUB_ID" -o json 2>/dev/null)"; then
    record FAIL "Quota" "Unable to read quota usage in ${WORKSHOP_REGION}."
    return
  fi
  for usage_name in "${pools[@]}"; do
    entry="$(jq -c --arg n "$usage_name" '[.[] | select(.name.value == $n)][0] // empty' <<<"$usage")"
    if [[ -z "$entry" ]]; then
      record WARN "Quota ${usage_name}" "Quota pool not reported for ${WORKSHOP_REGION}; the workshop dry run will confirm."
      continue
    fi
    current="$(jq -r '(.currentValue // 0) | tonumber' <<<"$entry")"
    limit="$(jq -r '(.limit // 0) | tonumber' <<<"$entry")"
    available="$(jq -n --argjson l "$limit" --argjson c "$current" '$l - $c')"
    if jq -e -n --argjson a "$available" --argjson r "${required[$usage_name]}" '$a >= $r' >/dev/null; then
      record PASS "Quota ${usage_name}" "${available} available (limit ${limit}, used ${current}); workshop needs ${required[$usage_name]}."
    elif jq -e -n --argjson l "$limit" '$l == 0' >/dev/null; then
      record FAIL "Quota ${usage_name}" "Limit is 0 for your subscription. Request a quota increase now (see README); approval isn't instant."
    else
      record FAIL "Quota ${usage_name}" "Only ${available} available (limit ${limit}, used ${current}); workshop needs ${required[$usage_name]}. Free up capacity or request an increase."
    fi
  done
}

check_account_name() {
  local body response available reason
  [[ -n "$ACCOUNT_NAME" ]] || return 0
  if [[ ! "$ACCOUNT_NAME" =~ ^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$ ]]; then
    record FAIL "Foundry account name" "Use 3-64 lowercase letters, numbers, or hyphens, starting and ending with a letter or number."
    return
  fi
  body="$(jq -cn --arg name "$ACCOUNT_NAME" '{subdomainName:$name,type:"Microsoft.CognitiveServices/accounts"}')"
  if ! response="$(az rest --method post \
      --url "https://management.azure.com/subscriptions/${SUB_ID}/providers/Microsoft.CognitiveServices/checkDomainAvailability?api-version=${DOMAIN_API_VERSION}" \
      --body "$body" -o json 2>/dev/null)"; then
    record WARN "Foundry account name" "Unable to check name availability."
    return
  fi
  available="$(jq -r '.isSubdomainAvailable // .isAvailable // false' <<<"$response")"
  reason="$(jq -r '.reason // .message // empty' <<<"$response")"
  if [[ "$available" == true ]]; then
    record PASS "Foundry account name" "'${ACCOUNT_NAME}' is available right now (not reserved)."
  else
    record FAIL "Foundry account name" "'${ACCOUNT_NAME}' is taken${reason:+: ${reason}}. Pick another name."
  fi
}

main() {
  parse_args "$@"
  printf 'Claude on Microsoft Foundry: pre-workshop Azure check (read-only)\n'
  check_tools
  check_sign_in
  check_subscription_type
  check_provider_and_permissions
  check_runtime_access
  check_models_and_quota
  check_account_name
  record INFO "Not checked here" "Marketplace purchase rights, private marketplace, Azure Policy, and Anthropic's billing-country rules. The workshop dry run validates these."
  finish
}

main "$@"
