#!/usr/bin/env bash
set -Eeuo pipefail

readonly API_VERSION="2025-12-01"
readonly DOMAIN_API_VERSION="2025-06-01"
readonly MARKETPLACE_API_VERSION="2021-01-01"
readonly MIN_AZ_VERSION="2.83.0"
readonly POLL_SECONDS=10
readonly POLL_TIMEOUT_SECONDS=1800

SUBSCRIPTION=""
TENANT_ID=""
EXPECTED_TENANT=""
RESOURCE_GROUP=""
LOCATION=""
ACCOUNT_NAME=""
PROJECT_NAME="claude-code"
ORGANIZATION_NAME=""
COUNTRY_CODE=""
INDUSTRY=""
PROFILE="lean"
PROFILE_EXPLICIT=false
FAMILY_CAPACITY_EXPLICIT=false
SKU="GlobalStandard"
SONNET_CAPACITY=10
HAIKU_CAPACITY=10
OPUS_CAPACITY=10
DEFAULT_SONNET_MODEL=""
DEFAULT_HAIKU_MODEL=""
DEFAULT_OPUS_MODEL=""
OUTPUT_DIR="${HOME}/claude-code-foundry"
DRY_RUN=false
YES=false
ASSIGN_CURRENT_USER=false
DISABLE_LOCAL_AUTH_ON_REUSE=false
ACCOUNT_EXISTS=false
ACCOUNT_JSON=""
LOCAL_AUTH_COMMAND=""
CATALOG_JSON="[]"
DEPLOYMENTS_JSON="[]"
TERMS_CONFIRMED_AT=""

declare -a MODEL_SPECS=()
declare -a DEPLOYMENT_NAME_SPECS=()
declare -a MODEL_IDS=()
declare -a MODEL_REQUESTED_VERSIONS=()
declare -a MODEL_DEPLOYMENT_NAMES=()
declare -a MODEL_CAPACITIES=()
declare -a MODEL_FAMILIES=()
declare -a MODEL_DEFINITIONS=()
declare -a MODEL_FORMATS=()
declare -a MODEL_VERSIONS=()
declare -a MODEL_USAGE_NAMES=()
declare -a MODEL_EXISTING_CAPACITIES=()
declare -a MODEL_ADDITIONAL_CAPACITIES=()
declare -a QUOTA_NAMES=()
declare -A DEPLOYMENT_NAME_OVERRIDES=()
declare -A QUOTA_ADDITIONAL=()

usage() {
  cat <<'EOF'
Deploy Claude Code prerequisites to Microsoft Foundry.

Required:
  --subscription ID_OR_NAME
  --resource-group NAME
  --location eastus2|swedencentral
  --account-name NAME
  --organization-name LEGAL_NAME
  --country-code ISO_2_LETTER_CODE
  --industry technology|finance|healthcare|education|retail|manufacturing|government|media|other

Model selection:
  --model MODEL:VERSION:DEPLOYMENT:CAPACITY
                                    Repeat for every exact catalog version and deployment.
                                    Example: --model claude-haiku-4-5:2:haiku-4-5-v2:10
  --model MODEL@VERSION=CAPACITY    Exact-selection alias. Deployment defaults to MODEL.
                                    Example: --model claude-haiku-4-5@2=10
  --deployment-name MODEL@VERSION=DEPLOYMENT
                                    Override an alias selection's deployment name.
  --default-sonnet-model SELECTOR   Selected Sonnet used by Claude Code.
  --default-haiku-model SELECTOR    Selected Haiku used by Claude Code.
  --default-opus-model SELECTOR     Selected Opus used by Claude Code.
                                    SELECTOR may be DEPLOYMENT or MODEL@VERSION;
                                    generated configuration always uses DEPLOYMENT.

Compatibility options:
  --profile lean|full          Used only when no --model is supplied.
                               Default: lean
                               lean: Sonnet 4.6 + Haiku 4.5
                               full: adds Opus 4.6
  --sonnet-capacity NUMBER     Family default; default: 10
  --haiku-capacity NUMBER      Family default; default: 10
  --opus-capacity NUMBER       Family default; default: 10

Other options:
  --tenant TENANT_ID           Require the selected subscription to use this tenant.
  --project-name NAME          Default: claude-code
  --sku NAME                   Default: GlobalStandard
  --assign-current-user        Add Cognitive Services User only if no effective runtime role exists.
  --disable-local-auth-on-reuse
                               Explicitly disable local authentication on an existing account.
                               Existing accounts preserve their current setting by default.
  --output-dir PATH            Default: ~/claude-code-foundry
  --dry-run                    Validate configuration, live catalog, and quota without changes.
  --yes                        Confirm billable resources, Anthropic terms, and hosting boundaries.
  -h, --help

When more than one deployment from a family is selected, the first one supplied
is the deterministic family default unless --default-*-model selects another.
EOF
}

log() { printf '[%s] %s\n' "$1" "$2"; }
info() { log INFO "$1"; }
ok() { log OK "$1"; }
warn() { log WARN "$1" >&2; }
die() { log ERROR "$1" >&2; exit 1; }

require_value() {
  [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "$1 requires a value."
}

positive_integer() {
  [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "$1 must be a positive integer."
}

model_family() {
  local model="$1"
  [[ "$model" =~ ^claude-(sonnet|haiku|opus)- ]] ||
    die "Unsupported model identifier '${model}'. Expected claude-sonnet-*, claude-haiku-*, or claude-opus-*."
  printf '%s' "${BASH_REMATCH[1]}"
}

validate_model_identifier() {
  local model="$1"
  [[ ${#model} -le 64 &&
     "$model" =~ ^claude-(sonnet|haiku|opus)-[a-z0-9]+(-[a-z0-9]+)*$ ]] ||
    die "Invalid model identifier '${model}'. Use a lowercase exact Claude catalog name such as claude-sonnet-4-6."
}

validate_model_version() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] ||
    die "Invalid catalog model version '$1'."
}

validate_deployment_name() {
  local deployment="$1"
  [[ ${#deployment} -le 64 &&
     "$deployment" =~ ^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$ ]] ||
    die "Invalid deployment name '${deployment}'. Use 1-64 letters, numbers, periods, underscores, or hyphens."
}

family_capacity() {
  case "$1" in
    sonnet) printf '%s' "$SONNET_CAPACITY" ;;
    haiku) printf '%s' "$HAIKU_CAPACITY" ;;
    opus) printf '%s' "$OPUS_CAPACITY" ;;
    *) die "Unsupported Claude model family '$1'." ;;
  esac
}

parse_args() {
  while (($#)); do
    case "$1" in
      --subscription) require_value "$@"; SUBSCRIPTION="$2"; shift 2 ;;
      --tenant) require_value "$@"; EXPECTED_TENANT="$2"; shift 2 ;;
      --resource-group) require_value "$@"; RESOURCE_GROUP="$2"; shift 2 ;;
      --location) require_value "$@"; LOCATION="${2,,}"; shift 2 ;;
      --account-name) require_value "$@"; ACCOUNT_NAME="$2"; shift 2 ;;
      --project-name) require_value "$@"; PROJECT_NAME="$2"; shift 2 ;;
      --organization-name) require_value "$@"; ORGANIZATION_NAME="$2"; shift 2 ;;
      --country-code) require_value "$@"; COUNTRY_CODE="${2^^}"; shift 2 ;;
      --industry) require_value "$@"; INDUSTRY="${2,,}"; shift 2 ;;
      --profile) require_value "$@"; PROFILE="$2"; PROFILE_EXPLICIT=true; shift 2 ;;
      --model) require_value "$@"; MODEL_SPECS+=("$2"); shift 2 ;;
      --deployment-name) require_value "$@"; DEPLOYMENT_NAME_SPECS+=("$2"); shift 2 ;;
      --default-sonnet-model) require_value "$@"; DEFAULT_SONNET_MODEL="$2"; shift 2 ;;
      --default-haiku-model) require_value "$@"; DEFAULT_HAIKU_MODEL="$2"; shift 2 ;;
      --default-opus-model) require_value "$@"; DEFAULT_OPUS_MODEL="$2"; shift 2 ;;
      --sku) require_value "$@"; SKU="$2"; shift 2 ;;
      --sonnet-capacity) require_value "$@"; SONNET_CAPACITY="$2"; FAMILY_CAPACITY_EXPLICIT=true; shift 2 ;;
      --haiku-capacity) require_value "$@"; HAIKU_CAPACITY="$2"; FAMILY_CAPACITY_EXPLICIT=true; shift 2 ;;
      --opus-capacity) require_value "$@"; OPUS_CAPACITY="$2"; FAMILY_CAPACITY_EXPLICIT=true; shift 2 ;;
      --assign-current-user) ASSIGN_CURRENT_USER=true; shift ;;
      --disable-local-auth-on-reuse) DISABLE_LOCAL_AUTH_ON_REUSE=true; shift ;;
      --output-dir) require_value "$@"; OUTPUT_DIR="$2"; shift 2 ;;
      --dry-run) DRY_RUN=true; shift ;;
      --yes) YES=true; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  [[ -n "$SUBSCRIPTION" ]] || die "--subscription is required."
  [[ -n "$RESOURCE_GROUP" ]] || die "--resource-group is required."
  [[ -n "$LOCATION" ]] || die "--location is required."
  [[ -n "$ACCOUNT_NAME" ]] || die "--account-name is required."
  [[ -n "$ORGANIZATION_NAME" ]] || die "--organization-name is required."
  [[ -n "$COUNTRY_CODE" ]] || die "--country-code is required."
  [[ -n "$INDUSTRY" ]] || die "--industry is required."

  [[ "$PROFILE" == lean || "$PROFILE" == full ]] || die "--profile must be lean or full."
  [[ "$LOCATION" == eastus2 || "$LOCATION" == swedencentral ]] ||
    die "--location must be eastus2 or swedencentral for the supported Claude deployment flow."
  [[ "$COUNTRY_CODE" =~ ^[A-Z]{2}$ ]] || die "--country-code must be a two-letter ISO code."
  [[ "$INDUSTRY" =~ ^(technology|finance|healthcare|education|retail|manufacturing|government|media|other)$ ]] ||
    die "--industry is not in the current provider allowlist."
  [[ "$ACCOUNT_NAME" =~ ^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$ ]] ||
    die "--account-name must use 3-64 lowercase letters, numbers, or hyphens."
  [[ "$PROJECT_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{1,62}[A-Za-z0-9]$ ]] ||
    die "--project-name must use 3-64 letters, numbers, periods, underscores, or hyphens."
  [[ -n "$SKU" && "$SKU" =~ ^[A-Za-z0-9._-]+$ ]] || die "--sku contains unsupported characters."
  positive_integer "--sonnet-capacity" "$SONNET_CAPACITY"
  positive_integer "--haiku-capacity" "$HAIKU_CAPACITY"
  positive_integer "--opus-capacity" "$OPUS_CAPACITY"

  resolve_model_requests
}

resolve_model_requests() {
  local spec model requested_version deployment capacity family existing index selection_key
  declare -A used_deployment_overrides=()

  for spec in "${DEPLOYMENT_NAME_SPECS[@]}"; do
    [[ "$spec" =~ ^([^@=]+)@([^=]+)=([^=]+)$ ]] ||
      die "--deployment-name must use MODEL@VERSION=DEPLOYMENT."
    model="${BASH_REMATCH[1]}"
    requested_version="${BASH_REMATCH[2]}"
    deployment="${BASH_REMATCH[3]}"
    validate_model_identifier "$model"
    validate_model_version "$requested_version"
    validate_deployment_name "$deployment"
    selection_key="${model}@${requested_version}"
    [[ -z "${DEPLOYMENT_NAME_OVERRIDES[$selection_key]+x}" ]] ||
      die "Deployment override for ${selection_key} was provided more than once."
    DEPLOYMENT_NAME_OVERRIDES["$selection_key"]="$deployment"
  done

  if ((${#MODEL_SPECS[@]} == 0)); then
    MODEL_SPECS=(
      "claude-sonnet-4-6:1:claude-sonnet-4-6:${SONNET_CAPACITY}"
      "claude-haiku-4-5:2:claude-haiku-4-5:${HAIKU_CAPACITY}"
    )
    [[ "$PROFILE" == lean ]] ||
      MODEL_SPECS+=("claude-opus-4-6:1:claude-opus-4-6:${OPUS_CAPACITY}")
  elif [[ "$PROFILE_EXPLICIT" == true || "$FAMILY_CAPACITY_EXPLICIT" == true ]]; then
    die "Do not mix explicit --model selections with --profile or family capacity flags."
  fi

  for spec in "${MODEL_SPECS[@]}"; do
    model="$spec"
    requested_version=""
    deployment=""
    if [[ "$spec" =~ ^([^:]+):([^:]+):([^:]+):([0-9]+)$ ]]; then
      model="${BASH_REMATCH[1]}"
      requested_version="${BASH_REMATCH[2]}"
      deployment="${BASH_REMATCH[3]}"
      capacity="${BASH_REMATCH[4]}"
      selection_key="${model}@${requested_version}"
      [[ -z "${DEPLOYMENT_NAME_OVERRIDES[$selection_key]+x}" ]] ||
        die "Do not combine four-field --model syntax with --deployment-name for ${selection_key}."
    elif [[ "$spec" =~ ^([^@=]+)@([^=]+)=([0-9]+)$ ]]; then
      model="${BASH_REMATCH[1]}"
      requested_version="${BASH_REMATCH[2]}"
      capacity="${BASH_REMATCH[3]}"
      selection_key="${model}@${requested_version}"
      deployment="${DEPLOYMENT_NAME_OVERRIDES[$selection_key]:-$model}"
      used_deployment_overrides["$selection_key"]=true
    else
      die "--model must use MODEL:VERSION:DEPLOYMENT:CAPACITY or MODEL@VERSION=CAPACITY."
    fi

    validate_model_identifier "$model"
    validate_model_version "$requested_version"
    validate_deployment_name "$deployment"
    family="$(model_family "$model")"
    existing=false
    for index in "${!MODEL_DEPLOYMENT_NAMES[@]}"; do
      [[ "${MODEL_DEPLOYMENT_NAMES[$index]}" != "$deployment" ]] || existing=true
    done
    [[ "$existing" == false ]] ||
      die "Deployment ${deployment} was selected more than once. Use --deployment-name overrides for multiple versions of one model."
    positive_integer "Capacity for ${deployment}" "$capacity"
    MODEL_IDS+=("$model")
    MODEL_REQUESTED_VERSIONS+=("$requested_version")
    MODEL_DEPLOYMENT_NAMES+=("$deployment")
    MODEL_CAPACITIES+=("$capacity")
    MODEL_FAMILIES+=("$family")
  done

  for selection_key in "${!DEPLOYMENT_NAME_OVERRIDES[@]}"; do
    [[ -n "${used_deployment_overrides[$selection_key]+x}" ]] ||
      die "--deployment-name references ${selection_key}, but no matching MODEL@VERSION selection was supplied."
  done

  DEFAULT_SONNET_MODEL="$(determine_family_default sonnet "$DEFAULT_SONNET_MODEL")"
  DEFAULT_HAIKU_MODEL="$(determine_family_default haiku "$DEFAULT_HAIKU_MODEL")"
  DEFAULT_OPUS_MODEL="$(determine_family_default opus "$DEFAULT_OPUS_MODEL")"
}

determine_family_default() {
  local family="$1" requested="$2" index first="" exact_selector
  for index in "${!MODEL_IDS[@]}"; do
    if [[ "${MODEL_FAMILIES[$index]}" == "$family" ]]; then
      [[ -n "$first" ]] || first="${MODEL_DEPLOYMENT_NAMES[$index]}"
      exact_selector="${MODEL_IDS[$index]}@${MODEL_REQUESTED_VERSIONS[$index]}"
      if [[ -n "$requested" && "${MODEL_DEPLOYMENT_NAMES[$index]}" == "$requested" ]]; then
        printf '%s' "$requested"
        return
      fi
      if [[ -n "$requested" && "$exact_selector" == "$requested" ]]; then
        printf '%s' "${MODEL_DEPLOYMENT_NAMES[$index]}"
        return
      fi
    fi
  done
  [[ -z "$requested" ]] ||
    die "Default ${family} selector ${requested} is not a selected ${family} deployment or MODEL@VERSION."
  printf '%s' "$first"
}

require_tools() {
  local tool version
  for tool in az jq tar; do
    command -v "$tool" >/dev/null 2>&1 || die "${tool} is required. Use Azure Cloud Shell."
  done
  version="$(az version --query '"azure-cli"' -o tsv)"
  [[ "$(printf '%s\n%s\n' "$MIN_AZ_VERSION" "$version" | sort -V | head -n1)" == "$MIN_AZ_VERSION" ]] ||
    die "Azure CLI ${MIN_AZ_VERSION}+ is required; found ${version}."
}

select_subscription() {
  local account_name
  az account show >/dev/null 2>&1 || die "No Azure CLI session is active."
  az account set --subscription "$SUBSCRIPTION" >/dev/null ||
    die "Subscription '${SUBSCRIPTION}' is unavailable to the current Azure CLI identity."
  SUBSCRIPTION="$(az account show --query id -o tsv)"
  TENANT_ID="$(az account show --query tenantId -o tsv)"
  account_name="$(az account show --query name -o tsv)"
  [[ -z "$EXPECTED_TENANT" || "${TENANT_ID,,}" == "${EXPECTED_TENANT,,}" ]] ||
    die "Subscription ${SUBSCRIPTION} belongs to tenant ${TENANT_ID}, not requested tenant ${EXPECTED_TENANT}."
  ok "Using ${account_name} (${SUBSCRIPTION}) in tenant ${TENANT_ID}."
}

provider_registration_state() {
  az provider show --namespace Microsoft.CognitiveServices \
    --subscription "$SUBSCRIPTION" --query registrationState -o tsv 2>/dev/null || true
}

discover_account() {
  local accounts count account_group kind account_location custom_domain
  accounts="$(az cognitiveservices account list --subscription "$SUBSCRIPTION" -o json)"
  count="$(jq --arg name "$ACCOUNT_NAME" '[.[] | select((.name | ascii_downcase) == ($name | ascii_downcase))] | length' <<<"$accounts")"
  ((count <= 1)) || die "More than one Cognitive Services account matched ${ACCOUNT_NAME}; use a unique account name."
  if ((count == 0)); then
    ACCOUNT_EXISTS=false
    validate_custom_domain_available
    return
  fi

  ACCOUNT_EXISTS=true
  ACCOUNT_JSON="$(jq -c --arg name "$ACCOUNT_NAME" \
    '[.[] | select((.name | ascii_downcase) == ($name | ascii_downcase))][0]' <<<"$accounts")"
  account_group="$(jq -r '.resourceGroup // (.id | split("/")[4])' <<<"$ACCOUNT_JSON")"
  [[ "${account_group,,}" == "${RESOURCE_GROUP,,}" ]] ||
    die "Account ${ACCOUNT_NAME} already exists in resource group ${account_group}, not ${RESOURCE_GROUP}."
  ACCOUNT_JSON="$(az cognitiveservices account show \
    -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --subscription "$SUBSCRIPTION" -o json)"
  kind="$(jq -r '.kind // empty' <<<"$ACCOUNT_JSON")"
  account_location="$(jq -r '.location // empty | ascii_downcase' <<<"$ACCOUNT_JSON")"
  custom_domain="$(jq -r '.properties.customSubDomainName // empty' <<<"$ACCOUNT_JSON")"
  [[ "$kind" == AIServices ]] ||
    die "${ACCOUNT_NAME} exists but is kind ${kind}, not AIServices."
  [[ "$account_location" == "$LOCATION" ]] ||
    die "${ACCOUNT_NAME} exists in ${account_location}, not ${LOCATION}."
  [[ -z "$custom_domain" || "${custom_domain,,}" == "${ACCOUNT_NAME,,}" ]] ||
    die "${ACCOUNT_NAME} uses custom domain ${custom_domain}; expected ${ACCOUNT_NAME}."
  ok "Validated existing Foundry account ${ACCOUNT_NAME}."
}

verify_local_auth_compatibility() {
  local help_text
  if [[ "$ACCOUNT_EXISTS" == true && "$DISABLE_LOCAL_AUTH_ON_REUSE" == false ]]; then
    LOCAL_AUTH_COMMAND=""
    ok "Existing Foundry account local-authentication setting will be preserved."
    return
  elif [[ "$ACCOUNT_EXISTS" == true ]]; then
    LOCAL_AUTH_COMMAND="update"
  else
    LOCAL_AUTH_COMMAND="create"
  fi
  help_text="$(az cognitiveservices account "$LOCAL_AUTH_COMMAND" --help 2>&1)" ||
    die "Unable to verify Azure CLI compatibility for Foundry account ${LOCAL_AUTH_COMMAND}."
  grep -Eq -- '(^|[[:space:]])--disable-local-auth([[:space:]]|$)' <<<"$help_text" ||
    die "Azure CLI does not support --disable-local-auth for 'az cognitiveservices account ${LOCAL_AUTH_COMMAND}'. Upgrade Azure CLI before changing Foundry resources."
  ok "Verified Azure CLI can disable local authentication during account ${LOCAL_AUTH_COMMAND}."
}

validate_custom_domain_available() {
  local body response available reason url
  body="$(jq -cn --arg name "$ACCOUNT_NAME" \
    '{subdomainName:$name,type:"Microsoft.CognitiveServices/accounts"}')"
  url="https://management.azure.com/subscriptions/${SUBSCRIPTION}/providers/Microsoft.CognitiveServices/checkDomainAvailability?api-version=${DOMAIN_API_VERSION}"
  response="$(az rest --method post --url "$url" --body "$body" -o json)" ||
    die "Unable to validate global custom-domain availability for ${ACCOUNT_NAME}."
  available="$(jq -r '.isSubdomainAvailable // .isAvailable // false' <<<"$response")"
  reason="$(jq -r '.reason // .message // empty' <<<"$response")"
  [[ "$available" == true ]] ||
    die "Foundry custom domain ${ACCOUNT_NAME} is unavailable${reason:+: ${reason}}."
  ok "Foundry custom domain ${ACCOUNT_NAME} is globally available."
}

normalize_catalog() {
  jq -c '
    def unwrap:
      if type == "object" and (.model? | type) == "object" then
        . as $wrapper
        | ($wrapper | del(.model)) * $wrapper.model
      else .
      end;
    if type == "array" then map(unwrap)
    elif (.value? | type) == "array" then .value | map(unwrap)
    elif (.models? | type) == "array" then .models | map(unwrap)
    elif (.model? | type) == "array" then .model | map(unwrap)
    elif (.model? | type) == "object" then [unwrap]
    else []
    end
  '
}

catalog_model() {
  local catalog="$1" model="$2" requested_version="${3:-}"
  jq -c --arg model "$model" --arg version "$requested_version" '
    [.[] |
      select(.name == $model) |
      select(((.lifecycleStatus // "") | ascii_downcase) != "deprecated")
    ] as $matches
    | if $version != "" then
        [$matches[] | select((.version | tostring) == $version)] | first // empty
      else
        (([$matches[] | select(.isDefaultVersion == true)] | sort_by(.version | tostring) | last)
          // ($matches | sort_by(.version | tostring) | last)
          // empty)
      end
  ' <<<"$catalog"
}

load_live_catalog() {
  local raw
  raw="$(az cognitiveservices model list \
    --location "$LOCATION" --subscription "$SUBSCRIPTION" -o json)" ||
    die "Unable to load the live Cognitive Services model catalog for ${LOCATION}."
  CATALOG_JSON="$(normalize_catalog <<<"$raw")"
  jq -e 'type == "array" and length > 0' <<<"$CATALOG_JSON" >/dev/null ||
    die "The live model catalog response for ${LOCATION} was empty or unsupported."
  ok "Loaded and normalized the live ${LOCATION} model catalog."
}

load_existing_deployments() {
  if [[ "$ACCOUNT_EXISTS" == true ]]; then
    DEPLOYMENTS_JSON="$(az cognitiveservices account deployment list \
      -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --subscription "$SUBSCRIPTION" -o json)" ||
      die "Unable to list existing deployments on ${ACCOUNT_NAME}."
  else
    DEPLOYMENTS_JSON="[]"
  fi
}

validate_selected_models() {
  local index model requested_version deployment requested definition version format sku_definition usage_name
  local existing existing_model existing_format existing_version existing_sku existing_capacity
  local additional publisher hosting quota_known

  MODEL_DEFINITIONS=()
  MODEL_FORMATS=()
  MODEL_VERSIONS=()
  MODEL_USAGE_NAMES=()
  MODEL_EXISTING_CAPACITIES=()
  MODEL_ADDITIONAL_CAPACITIES=()
  QUOTA_NAMES=()
  QUOTA_ADDITIONAL=()

  for index in "${!MODEL_IDS[@]}"; do
    model="${MODEL_IDS[$index]}"
    requested_version="${MODEL_REQUESTED_VERSIONS[$index]}"
    deployment="${MODEL_DEPLOYMENT_NAMES[$index]}"
    requested="${MODEL_CAPACITIES[$index]}"
    existing="$(jq -c --arg deployment "$deployment" \
      '[.[] | select(.name == $deployment)][0] // empty' <<<"$DEPLOYMENTS_JSON")"
    version="$requested_version"
    if [[ -n "$existing" ]]; then
      existing_model="$(jq -r '.properties.model.name // empty' <<<"$existing")"
      existing_format="$(jq -r '.properties.model.format // empty' <<<"$existing")"
      existing_version="$(jq -r '.properties.model.version // empty | tostring' <<<"$existing")"
      existing_sku="$(jq -r '.sku.name // empty' <<<"$existing")"
      [[ "$existing_model" == "$model" ]] ||
        die "Deployment-name collision: ${deployment} currently targets ${existing_model}, not ${model}."
      [[ "$existing_sku" == "$SKU" ]] ||
        die "Deployment ${deployment} uses SKU ${existing_sku}; refusing to replace it with ${SKU}."
      [[ -z "$requested_version" || "$existing_version" == "$requested_version" ]] ||
        die "Deployment ${deployment} uses ${model} version ${existing_version}; refusing to replace it with version ${requested_version}."
      version="$existing_version"
    fi

    definition="$(catalog_model "$CATALOG_JSON" "$model" "$version")"
    [[ -n "$definition" ]] ||
      die "${model}${version:+ version ${version}} for deployment ${deployment} is not active in the live ${LOCATION} catalog."
    version="$(jq -r '.version // empty | tostring' <<<"$definition")"
    format="$(jq -r '.format // empty' <<<"$definition")"
    [[ -n "$version" && -n "$format" ]] ||
      die "Catalog metadata for ${model} is missing format or version."
    sku_definition="$(jq -c --arg sku "$SKU" \
      '[.skus[]? | select(.name == $sku)][0] // empty' <<<"$definition")"
    [[ -n "$sku_definition" ]] ||
      die "${model} version ${version} does not support ${SKU} in ${LOCATION}."
    usage_name="$(jq -r '.usageName // empty' <<<"$sku_definition")"
    [[ -n "$usage_name" ]] ||
      die "${model} version ${version} has no version-specific usageName for ${SKU}."

    existing_capacity=0
    if [[ -n "$existing" ]]; then
      existing_format="$(jq -r '.properties.model.format // empty' <<<"$existing")"
      [[ "$existing_format" == "$format" ]] ||
        die "Deployment-name collision: ${deployment} uses provider format ${existing_format}, not ${format}."
      existing_capacity="$(jq -r '(.sku.capacity // 0) | tonumber | floor' <<<"$existing")"
    fi
    if ((requested > existing_capacity)); then
      additional=$((requested - existing_capacity))
    else
      additional=0
    fi

    MODEL_DEFINITIONS+=("$definition")
    MODEL_FORMATS+=("$format")
    MODEL_VERSIONS+=("$version")
    MODEL_USAGE_NAMES+=("$usage_name")
    MODEL_EXISTING_CAPACITIES+=("$existing_capacity")
    MODEL_ADDITIONAL_CAPACITIES+=("$additional")

    quota_known=false
    if [[ -n "${QUOTA_ADDITIONAL[$usage_name]+x}" ]]; then
      quota_known=true
    fi
    if [[ "$quota_known" == false ]]; then
      QUOTA_NAMES+=("$usage_name")
      QUOTA_ADDITIONAL["$usage_name"]=0
    fi
    QUOTA_ADDITIONAL["$usage_name"]=$((QUOTA_ADDITIONAL["$usage_name"] + additional))

    publisher="$(jq -r '.publisher.name // .publisher // .publisherName // .modelPublisher // "unknown"' <<<"$definition")"
    hosting="$(jq -r '.hostingType // .hostingModel // .inferenceContainerProperties.hostingType // "review model card"' <<<"$definition")"
    ok "${deployment}: ${model} version ${version}, ${SKU}, quota ${usage_name}, publisher ${publisher}, hosting ${hosting}."
  done
}

check_quota() {
  local usage entry usage_name required current limit available
  usage="$(az cognitiveservices usage list \
    --location "$LOCATION" --subscription "$SUBSCRIPTION" -o json)" ||
    die "Unable to read Cognitive Services quota in ${LOCATION}."

  for usage_name in "${QUOTA_NAMES[@]}"; do
    required="${QUOTA_ADDITIONAL[$usage_name]}"
    entry="$(jq -c --arg name "$usage_name" \
      '[.[] | select(.name.value == $name)][0] // empty' <<<"$usage")"
    [[ -n "$entry" ]] ||
      die "Quota pool ${usage_name} was not returned for ${LOCATION}."
    current="$(jq -r '(.currentValue // 0) | tonumber' <<<"$entry")"
    limit="$(jq -r '(.limit // 0) | tonumber' <<<"$entry")"
    available="$(jq -n --argjson limit "$limit" --argjson current "$current" '$limit - $current')"
    jq -e -n --argjson available "$available" --argjson requested "$required" \
      '$available >= $requested' >/dev/null ||
      die "${usage_name} needs ${required} additional capacity in ${LOCATION}; only ${available} of ${limit} is available."
    ok "${usage_name}: ${available} available; ${required} additional capacity required."
  done
}

check_marketplace_terms() {
  local index definition publisher_id offer_id plan_id offer_type agreement_url agreement accepted
  for index in "${!MODEL_IDS[@]}"; do
    definition="${MODEL_DEFINITIONS[$index]}"
    publisher_id="$(jq -r '.marketplace.publisherId // .publisherId // .publisher.id // empty' <<<"$definition")"
    offer_id="$(jq -r '.marketplace.offerId // .offerId // .offer.id // empty' <<<"$definition")"
    plan_id="$(jq -r '.marketplace.planId // .planId // .plan.id // empty' <<<"$definition")"
    offer_type="$(jq -r '.marketplace.offerType // .offerType // "SaaS"' <<<"$definition")"
    if [[ -z "$publisher_id" || -z "$offer_id" || -z "$plan_id" ]]; then
      info "${MODEL_DEPLOYMENT_NAMES[$index]} (${MODEL_IDS[$index]}) is visible in the live catalog; Marketplace agreement identifiers were not exposed by this catalog response."
      continue
    fi

    agreement_url="https://management.azure.com/subscriptions/${SUBSCRIPTION}/providers/Microsoft.MarketplaceOrdering/offerTypes/${offer_type}/publishers/${publisher_id}/offers/${offer_id}/plans/${plan_id}/agreements/current?api-version=${MARKETPLACE_API_VERSION}"
    if agreement="$(az rest --method get --url "$agreement_url" -o json 2>/dev/null)"; then
      accepted="$(jq -r '.properties.accepted // .accepted // false' <<<"$agreement")"
      info "${MODEL_DEPLOYMENT_NAMES[$index]} Marketplace agreement currently reports accepted=${accepted}."
    else
      warn "Could not read the Marketplace agreement state for ${MODEL_DEPLOYMENT_NAMES[$index]}; deployment remains gated by explicit confirmation and the Azure deployment API."
    fi
  done
}

print_choices() {
  local index marker local_auth_action
  if [[ "$ACCOUNT_EXISTS" == true ]]; then
    if [[ "$DISABLE_LOCAL_AUTH_ON_REUSE" == true ]]; then
      local_auth_action="disable on existing account (explicit opt-in)"
    else
      local_auth_action="preserve existing account setting"
    fi
  else
    local_auth_action="disable on new account (Entra-only default)"
  fi
  cat <<EOF

Deployment choices
  Subscription:       ${SUBSCRIPTION}
  Tenant:             ${TENANT_ID}
  Resource group:     ${RESOURCE_GROUP}
  Region:             ${LOCATION}
  Foundry account:    ${ACCOUNT_NAME}
  Foundry project:    ${PROJECT_NAME}
  Deployment SKU:    ${SKU}
  Assign current user:${ASSIGN_CURRENT_USER}
  Local authentication:${local_auth_action}
  Legal entity:       ${ORGANIZATION_NAME}
  Country / industry: ${COUNTRY_CODE} / ${INDUSTRY}
  Models:
EOF
  for index in "${!MODEL_IDS[@]}"; do
    marker=""
    [[ "${MODEL_DEPLOYMENT_NAMES[$index]}" != "$DEFAULT_SONNET_MODEL" &&
       "${MODEL_DEPLOYMENT_NAMES[$index]}" != "$DEFAULT_HAIKU_MODEL" &&
       "${MODEL_DEPLOYMENT_NAMES[$index]}" != "$DEFAULT_OPUS_MODEL" ]] || marker=" [family default]"
    printf '    - %s: %s version %s, capacity %s%s\n' \
      "${MODEL_DEPLOYMENT_NAMES[$index]}" "${MODEL_IDS[$index]}" \
      "${MODEL_VERSIONS[$index]}" "${MODEL_CAPACITIES[$index]}" "$marker"
  done
  cat <<'EOF'

Commercial notice
  Selected deployments are billable and may reserve quota/deployment slots.
  Anthropic Marketplace terms and each model card's hosting/data boundary apply.
  No Marketplace agreement is changed during --dry-run.

EOF
}

confirm() {
  if [[ "$YES" == true ]]; then
    TERMS_CONFIRMED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    ok "--yes confirms billable resources, Anthropic terms, and displayed hosting boundaries."
    if [[ "$ACCOUNT_EXISTS" == true && "$DISABLE_LOCAL_AUTH_ON_REUSE" == true ]]; then
      ok "--yes also confirms disabling local authentication on the existing Foundry account."
    fi
    return
  fi
  [[ -t 0 ]] ||
    die "Rerun interactively or add --yes after reviewing billable resources, Anthropic terms, and hosting boundaries."
  local answer
  printf '%s\n' \
    "This creates or resizes billable model deployments." \
    "By continuing, you confirm the Anthropic Marketplace terms and the hosting/data boundaries shown above."
  if [[ "$ACCOUNT_EXISTS" == true && "$DISABLE_LOCAL_AUTH_ON_REUSE" == true ]]; then
    printf '%s\n' "You also explicitly requested disabling local authentication on the existing Foundry account."
  fi
  read -r -p "Type ACCEPT to continue: " answer
  [[ "$answer" == ACCEPT ]] || die "Deployment canceled."
  TERMS_CONFIRMED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}

wait_for_state() {
  local description="$1" command_name="$2" deadline state
  shift 2
  deadline=$((SECONDS + POLL_TIMEOUT_SECONDS))
  while ((SECONDS < deadline)); do
    case "$command_name" in
      account)
        state="$(az cognitiveservices account show "$@" \
          --query properties.provisioningState -o tsv 2>/dev/null || true)"
        ;;
      project)
        state="$(az cognitiveservices account project show "$@" \
          --query properties.provisioningState -o tsv 2>/dev/null || true)"
        ;;
      deployment)
        state="$(az cognitiveservices account deployment show "$@" \
          --query properties.provisioningState -o tsv 2>/dev/null || true)"
        ;;
      *) die "Unknown polling target ${command_name}." ;;
    esac
    [[ "$state" == Succeeded ]] && { ok "${description} reached Succeeded."; return; }
    [[ "$state" == Failed || "$state" == Canceled ]] &&
      die "${description} provisioning ended in state ${state}."
    sleep "$POLL_SECONDS"
  done
  die "${description} did not reach Succeeded within 30 minutes."
}

ensure_provider_registered() {
  local state deadline
  state="$(provider_registration_state)"
  if [[ "$state" == Registered ]]; then
    ok "Microsoft.CognitiveServices is registered."
    return
  fi
  info "Registering Microsoft.CognitiveServices..."
  az provider register --namespace Microsoft.CognitiveServices \
    --subscription "$SUBSCRIPTION" --wait >/dev/null ||
    die "Microsoft.CognitiveServices provider registration failed."
  deadline=$((SECONDS + POLL_TIMEOUT_SECONDS))
  while ((SECONDS < deadline)); do
    state="$(provider_registration_state)"
    [[ "$state" == Registered ]] && { ok "Microsoft.CognitiveServices is registered."; return; }
    sleep "$POLL_SECONDS"
  done
  die "Microsoft.CognitiveServices did not reach Registered within 30 minutes."
}

ensure_foundry_account() {
  local was_existing previous_disable_local_auth current_disable_local_auth
  was_existing="$ACCOUNT_EXISTS"
  previous_disable_local_auth="$(jq -r '.properties.disableLocalAuth // false' <<<"$ACCOUNT_JSON")"
  info "Creating or reusing resource group ${RESOURCE_GROUP}..."
  az group create -n "$RESOURCE_GROUP" -l "$LOCATION" \
    --subscription "$SUBSCRIPTION" -o none ||
    die "Unable to create or reuse resource group ${RESOURCE_GROUP}."

  if [[ "$ACCOUNT_EXISTS" == true ]]; then
    info "Enabling project management and validating custom endpoint on ${ACCOUNT_NAME}..."
    if [[ "$DISABLE_LOCAL_AUTH_ON_REUSE" == true ]]; then
      az cognitiveservices account update \
        -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" \
        --custom-domain "$ACCOUNT_NAME" \
        --allow-project-management true \
        --disable-local-auth true \
        --subscription "$SUBSCRIPTION" -o none ||
        die "Unable to update Foundry account ${ACCOUNT_NAME}."
    else
      az cognitiveservices account update \
        -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" \
        --custom-domain "$ACCOUNT_NAME" \
        --allow-project-management true \
        --subscription "$SUBSCRIPTION" -o none ||
        die "Unable to update Foundry account ${ACCOUNT_NAME}."
    fi
  else
    info "Creating Microsoft Foundry account ${ACCOUNT_NAME}..."
    az cognitiveservices account create \
      -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" -l "$LOCATION" \
      --kind AIServices --sku S0 \
      --custom-domain "$ACCOUNT_NAME" \
      --allow-project-management true \
      --disable-local-auth true \
      --assign-identity --yes \
      --subscription "$SUBSCRIPTION" -o none ||
      die "Unable to create Foundry account ${ACCOUNT_NAME}."
    ACCOUNT_EXISTS=true
  fi

  ACCOUNT_JSON="$(az cognitiveservices account show \
    -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --subscription "$SUBSCRIPTION" -o json)"
  current_disable_local_auth="$(jq -r '.properties.disableLocalAuth // false' <<<"$ACCOUNT_JSON")"
  if [[ "$was_existing" == true && "$DISABLE_LOCAL_AUTH_ON_REUSE" == false ]]; then
    [[ "$current_disable_local_auth" == "$previous_disable_local_auth" ]] ||
      die "Foundry account ${ACCOUNT_NAME} local-authentication setting changed unexpectedly."
  else
    [[ "$current_disable_local_auth" == true ]] ||
      die "Foundry account ${ACCOUNT_NAME} did not report local authentication as disabled."
  fi
  if ! jq -e '(.identity.type // "") | contains("SystemAssigned")' <<<"$ACCOUNT_JSON" >/dev/null; then
    info "Assigning a system-managed identity to ${ACCOUNT_NAME}..."
    az cognitiveservices account identity assign \
      -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" \
      --subscription "$SUBSCRIPTION" -o none ||
      die "Unable to assign a system-managed identity to ${ACCOUNT_NAME}."
  fi
  wait_for_state "Foundry account ${ACCOUNT_NAME}" account \
    -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --subscription "$SUBSCRIPTION"
}

ensure_foundry_project() {
  local project_json project_location
  if project_json="$(az cognitiveservices account project show \
      -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --project-name "$PROJECT_NAME" \
      --subscription "$SUBSCRIPTION" -o json 2>/dev/null)"; then
    project_location="$(jq -r '.location // empty | ascii_downcase' <<<"$project_json")"
    [[ "$project_location" == "$LOCATION" ]] ||
      die "Project ${PROJECT_NAME} exists in ${project_location}, not ${LOCATION}."
    if ! jq -e '(.identity.type // "") | contains("SystemAssigned")' <<<"$project_json" >/dev/null; then
      info "Assigning a system-managed identity to project ${PROJECT_NAME}..."
      az cognitiveservices account project create \
        -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --project-name "$PROJECT_NAME" \
        -l "$LOCATION" --assign-identity \
        --subscription "$SUBSCRIPTION" -o none ||
        die "Unable to assign a system-managed identity to project ${PROJECT_NAME}."
    fi
    ok "Reusing Foundry project ${PROJECT_NAME}."
  else
    info "Creating Foundry project ${PROJECT_NAME}..."
    az cognitiveservices account project create \
      -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --project-name "$PROJECT_NAME" \
      -l "$LOCATION" --assign-identity \
      --subscription "$SUBSCRIPTION" -o none ||
      die "Unable to create Foundry project ${PROJECT_NAME}."
  fi
  wait_for_state "Foundry project ${PROJECT_NAME}" project \
    -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --project-name "$PROJECT_NAME" \
    --subscription "$SUBSCRIPTION"
}

ensure_current_user_access() {
  [[ "$ASSIGN_CURRENT_USER" == true ]] || return
  local object_id scope assignments count
  object_id="$(az ad signed-in-user show --query id -o tsv 2>/dev/null)" ||
    die "--assign-current-user requires an interactive signed-in Microsoft Entra user."
  [[ -n "$object_id" ]] || die "Unable to resolve the signed-in user's object ID."
  scope="/subscriptions/${SUBSCRIPTION}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.CognitiveServices/accounts/${ACCOUNT_NAME}"
  assignments="$(az role assignment list \
    --assignee-object-id "$object_id" --scope "$scope" --include-inherited \
    --subscription "$SUBSCRIPTION" -o json)" ||
    die "Unable to inspect effective Foundry role assignments for the signed-in user."
  count="$(jq '[
    .[] | select(.roleDefinitionName as $role | [
      "Cognitive Services User",
      "Cognitive Services OpenAI User",
      "Cognitive Services OpenAI Contributor",
      "Foundry User",
      "Foundry Owner",
      "Foundry Project Manager",
      "Azure AI Project Manager",
      "Azure AI User",
      "Azure AI Owner",
      "Azure AI Developer"
    ] | index($role))
  ] | length' <<<"$assignments")"
  if ((count > 0)); then
    ok "The signed-in user already has inherited or direct Foundry runtime access."
    return
  fi
  info "Assigning Cognitive Services User to the signed-in user..."
  az role assignment create \
    --assignee-object-id "$object_id" --assignee-principal-type User \
    --role "Cognitive Services User" --scope "$scope" \
    --subscription "$SUBSCRIPTION" -o none ||
    die "Unable to assign Cognitive Services User at ${scope}."
  ok "Assigned Cognitive Services User to the signed-in user."
}

deploy_model() {
  local index="$1" model deployment capacity format version existing_capacity body deployment_id
  local request_output state
  model="${MODEL_IDS[$index]}"
  deployment="${MODEL_DEPLOYMENT_NAMES[$index]}"
  capacity="${MODEL_CAPACITIES[$index]}"
  format="${MODEL_FORMATS[$index]}"
  version="${MODEL_VERSIONS[$index]}"
  existing_capacity="${MODEL_EXISTING_CAPACITIES[$index]}"

  if ((existing_capacity >= capacity)); then
    ok "Reusing ${deployment} (${model} version ${version}) at capacity ${existing_capacity}; requested capacity ${capacity} does not require a reduction."
    return
  fi

  body="$(jq -cn \
    --arg sku "$SKU" --argjson capacity "$capacity" \
    --arg format "$format" --arg model "$model" --arg version "$version" \
    --arg org "$ORGANIZATION_NAME" --arg country "$COUNTRY_CODE" --arg industry "$INDUSTRY" \
    '{
      sku:{name:$sku,capacity:$capacity},
      properties:{
        model:{format:$format,name:$model,version:$version},
        versionUpgradeOption:"NoAutoUpgrade",
        raiPolicyName:"Microsoft.DefaultV2",
        modelProviderData:{
          organizationName:$org,
          countryCode:$country,
          industry:$industry
        }
      }
    }')"
  deployment_id="/subscriptions/${SUBSCRIPTION}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.CognitiveServices/accounts/${ACCOUNT_NAME}/deployments/${deployment}"

  if ((existing_capacity > 0)); then
    info "Increasing ${deployment} from capacity ${existing_capacity} to ${capacity}; preserving ${model} version ${version}..."
  else
    info "Creating ${deployment} with ${model} (${format}/${version}, ${SKU} ${capacity})..."
  fi

  if ! request_output="$(az rest --method put \
      --url "https://management.azure.com${deployment_id}?api-version=${API_VERSION}" \
      --body "$body" -o none 2>&1)"; then
    state="$(az cognitiveservices account deployment show \
      -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --deployment-name "$deployment" \
      --subscription "$SUBSCRIPTION" --query properties.provisioningState -o tsv 2>/dev/null || true)"
    if [[ -z "$state" ]]; then
      die "Azure rejected ${deployment}: ${request_output}. Review provider terms, onboarding data, quota, and RBAC."
    fi
    warn "The initial ${deployment} request reported an error, but Azure returned provisioning state ${state}; continuing to poll."
  fi

  wait_for_state "Model deployment ${deployment}" deployment \
    -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --deployment-name "$deployment" \
    --subscription "$SUBSCRIPTION"
}

build_environment_json() {
  local environment
  environment="$(jq -cn \
    --arg account "$ACCOUNT_NAME" \
    --arg subscription "$SUBSCRIPTION" \
    --arg tenant "$TENANT_ID" \
    '[
      {name:"CLAUDE_CODE_USE_FOUNDRY",value:"1"},
      {name:"ANTHROPIC_FOUNDRY_RESOURCE",value:$account},
      {name:"AZURE_SUBSCRIPTION_ID",value:$subscription},
      {name:"AZURE_TENANT_ID",value:$tenant}
    ]')"
  [[ -z "$DEFAULT_SONNET_MODEL" ]] || environment="$(jq -c \
    --arg value "$DEFAULT_SONNET_MODEL" '. + [{name:"ANTHROPIC_DEFAULT_SONNET_MODEL",value:$value}]' <<<"$environment")"
  [[ -z "$DEFAULT_HAIKU_MODEL" ]] || environment="$(jq -c \
    --arg value "$DEFAULT_HAIKU_MODEL" '. + [{name:"ANTHROPIC_DEFAULT_HAIKU_MODEL",value:$value}]' <<<"$environment")"
  [[ -z "$DEFAULT_OPUS_MODEL" ]] || environment="$(jq -c \
    --arg value "$DEFAULT_OPUS_MODEL" '. + [{name:"ANTHROPIC_DEFAULT_OPUS_MODEL",value:$value}]' <<<"$environment")"
  printf '%s' "$environment"
}

build_deployment_report() {
  local models="[]" index actual default_for_family
  for index in "${!MODEL_IDS[@]}"; do
    actual="$(az cognitiveservices account deployment show \
      -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" --deployment-name "${MODEL_DEPLOYMENT_NAMES[$index]}" \
      --subscription "$SUBSCRIPTION" -o json)"
    default_for_family=false
    [[ "${MODEL_DEPLOYMENT_NAMES[$index]}" != "$DEFAULT_SONNET_MODEL" &&
       "${MODEL_DEPLOYMENT_NAMES[$index]}" != "$DEFAULT_HAIKU_MODEL" &&
       "${MODEL_DEPLOYMENT_NAMES[$index]}" != "$DEFAULT_OPUS_MODEL" ]] || default_for_family=true
    models="$(jq -c \
      --arg model "${MODEL_IDS[$index]}" \
      --arg deployment "${MODEL_DEPLOYMENT_NAMES[$index]}" \
      --arg family "${MODEL_FAMILIES[$index]}" \
      --arg format "${MODEL_FORMATS[$index]}" \
      --arg version "${MODEL_VERSIONS[$index]}" \
      --arg sku "$SKU" \
      --arg usageName "${MODEL_USAGE_NAMES[$index]}" \
      --argjson requested "${MODEL_CAPACITIES[$index]}" \
      --argjson actualCapacity "$(jq -r '(.sku.capacity // 0) | tonumber' <<<"$actual")" \
      --arg state "$(jq -r '.properties.provisioningState // empty' <<<"$actual")" \
      --argjson isDefault "$default_for_family" \
      '. + [{
        deploymentName:$deployment,
        modelName:$model,
        family:$family,
        format:$format,
        version:$version,
        sku:$sku,
        usageName:$usageName,
        requestedCapacity:$requested,
        actualCapacity:$actualCapacity,
        provisioningState:$state,
        versionUpgradeOption:"NoAutoUpgrade",
        raiPolicyName:"Microsoft.DefaultV2",
        familyDefault:$isDefault
      }]' <<<"$models")"
  done

  jq -n \
    --arg generatedAt "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg termsConfirmedAt "$TERMS_CONFIRMED_AT" \
    --arg subscriptionId "$SUBSCRIPTION" \
    --arg tenantId "$TENANT_ID" \
    --arg resourceGroup "$RESOURCE_GROUP" \
    --arg location "$LOCATION" \
    --arg accountName "$ACCOUNT_NAME" \
    --arg projectName "$PROJECT_NAME" \
    --arg projectEndpoint "https://${ACCOUNT_NAME}.services.ai.azure.com/api/projects/${PROJECT_NAME}" \
    --arg anthropicBaseUrl "https://${ACCOUNT_NAME}.services.ai.azure.com/anthropic" \
    --argjson models "$models" \
    '{
      deploymentOutputWarning:"WARNING: Subscription and tenant identifiers are local deployment outputs and must not be committed.",
      generatedAt:$generatedAt,
      termsConfirmedAt:$termsConfirmedAt,
      subscriptionId:$subscriptionId,
      tenantId:$tenantId,
      resourceGroup:$resourceGroup,
      location:$location,
      accountName:$accountName,
      projectName:$projectName,
      projectEndpoint:$projectEndpoint,
      anthropicBaseUrl:$anthropicBaseUrl,
      authentication:"Microsoft Entra ID",
      secretsStored:false,
      models:$models
    }'
}

generate_artifacts() {
  local environment_json archive
  environment_json="$(build_environment_json)"
  mkdir -p "$OUTPUT_DIR"

  {
    printf '# WARNING: Subscription and tenant identifiers are local deployment outputs and must not be committed.\n'
    printf 'export CLAUDE_CODE_USE_FOUNDRY=1\n'
    printf 'export ANTHROPIC_FOUNDRY_RESOURCE=%q\n' "$ACCOUNT_NAME"
    printf 'export AZURE_SUBSCRIPTION_ID=%q\n' "$SUBSCRIPTION"
    printf 'export AZURE_TENANT_ID=%q\n' "$TENANT_ID"
    printf 'export PATH="$HOME/.local/bin:$PATH"\n'
    [[ -z "$DEFAULT_SONNET_MODEL" ]] || printf 'export ANTHROPIC_DEFAULT_SONNET_MODEL=%q\n' "$DEFAULT_SONNET_MODEL"
    [[ -z "$DEFAULT_HAIKU_MODEL" ]] || printf 'export ANTHROPIC_DEFAULT_HAIKU_MODEL=%q\n' "$DEFAULT_HAIKU_MODEL"
    [[ -z "$DEFAULT_OPUS_MODEL" ]] || printf 'export ANTHROPIC_DEFAULT_OPUS_MODEL=%q\n' "$DEFAULT_OPUS_MODEL"
  } >"${OUTPUT_DIR}/claude-foundry.env"

  {
    printf "# WARNING: Subscription and tenant identifiers are local deployment outputs and must not be committed.\n"
    printf "\$env:CLAUDE_CODE_USE_FOUNDRY = '1'\n"
    printf "\$env:ANTHROPIC_FOUNDRY_RESOURCE = '%s'\n" "$ACCOUNT_NAME"
    printf "\$env:AZURE_SUBSCRIPTION_ID = '%s'\n" "$SUBSCRIPTION"
    printf "\$env:AZURE_TENANT_ID = '%s'\n" "$TENANT_ID"
    printf '$env:PATH = "$HOME\\.local\\bin;$env:PATH"\n'
    [[ -z "$DEFAULT_SONNET_MODEL" ]] || printf "\$env:ANTHROPIC_DEFAULT_SONNET_MODEL = '%s'\n" "$DEFAULT_SONNET_MODEL"
    [[ -z "$DEFAULT_HAIKU_MODEL" ]] || printf "\$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = '%s'\n" "$DEFAULT_HAIKU_MODEL"
    [[ -z "$DEFAULT_OPUS_MODEL" ]] || printf "\$env:ANTHROPIC_DEFAULT_OPUS_MODEL = '%s'\n" "$DEFAULT_OPUS_MODEL"
  } >"${OUTPUT_DIR}/claude-foundry.ps1"

  jq -n --argjson environment "$environment_json" '{
    "deploymentOutputWarning":"WARNING: Subscription and tenant identifiers are local deployment outputs and must not be committed.",
    "claudeCode.disableLoginPrompt":true,
    "claudeCode.environmentVariables":$environment
  }' >"${OUTPUT_DIR}/vscode-settings.snippet.json"

  build_deployment_report >"${OUTPUT_DIR}/deployment-report.json"

  cat >"${OUTPUT_DIR}/install-claude-code-local.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
# WARNING: Subscription and tenant identifiers are local deployment outputs and must not be committed.
readonly TARGET_TENANT='${TENANT_ID}'
readonly TARGET_SUBSCRIPTION='${SUBSCRIPTION}'
here="\$(cd -- "\$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
installer=""
cleanup() {
  [[ -z "\$installer" ]] || rm -f -- "\$installer"
}
trap cleanup EXIT
command -v az >/dev/null || { echo "Install Azure CLI: https://aka.ms/installazurecli" >&2; exit 1; }
current_tenant="\$(az account show --query tenantId -o tsv 2>/dev/null || true)"
if [[ "\${current_tenant,,}" != "\${TARGET_TENANT,,}" ]]; then
  az login --tenant "\$TARGET_TENANT"
fi
az account set --subscription "\$TARGET_SUBSCRIPTION"
export PATH="\$HOME/.local/bin:\$PATH"
if ! command -v claude >/dev/null; then
  installer="\$(mktemp "\${TMPDIR:-/tmp}/claude-install.XXXXXX.sh")"
  echo "Downloading the official Anthropic installer from https://claude.ai/install.sh to a temporary file..."
  if ! curl --fail --show-error --silent --location \
      --output "\$installer" https://claude.ai/install.sh; then
    echo "HTTPS download failed. Claude Code was not installed; review the error above and retry." >&2
    exit 1
  fi
  bash "\$installer"
fi
mkdir -p "\${HOME}/.claude"
cp "\${here}/claude-foundry.env" "\${HOME}/.claude/foundry.env"
profile="\${HOME}/.bashrc"
[[ "\${SHELL:-}" == */zsh ]] && profile="\${HOME}/.zshrc"
line='[ -f "\$HOME/.claude/foundry.env" ] && source "\$HOME/.claude/foundry.env"'
touch "\$profile"
grep -Fqx "\$line" "\$profile" || printf '\n%s\n' "\$line" >>"\$profile"
source "\${HOME}/.claude/foundry.env"
claude --version
echo "Run 'claude' in a trusted repository, then use /status."
EOF
  chmod +x "${OUTPUT_DIR}/install-claude-code-local.sh"

  cat >"${OUTPUT_DIR}/install-claude-code-windows.ps1" <<EOF
[CmdletBinding()]
param()

# WARNING: Subscription and tenant identifiers are local deployment outputs and must not be committed.
\$ErrorActionPreference = 'Stop'
\$TargetTenant = '${TENANT_ID}'
\$TargetSubscription = '${SUBSCRIPTION}'
\$Here = Split-Path -Parent \$MyInvocation.MyCommand.Path

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Install Azure CLI from https://aka.ms/installazurecli'
}

\$CurrentTenant = az account show --query tenantId -o tsv 2>\$null
if (\$LASTEXITCODE -ne 0 -or \$CurrentTenant -ne \$TargetTenant) {
    az login --tenant \$TargetTenant
    if (\$LASTEXITCODE -ne 0) { throw 'Azure sign-in failed.' }
}
az account set --subscription \$TargetSubscription
if (\$LASTEXITCODE -ne 0) { throw 'Unable to select the target subscription.' }

\$env:PATH = "\$HOME\\.local\\bin;\$env:PATH"
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    \$Installer = Join-Path ([System.IO.Path]::GetTempPath()) ("claude-install-{0}.ps1" -f [guid]::NewGuid())
    try {
        Write-Host 'Downloading the official Anthropic installer from https://claude.ai/install.ps1 to a temporary file...'
        try {
            Invoke-WebRequest -Uri 'https://claude.ai/install.ps1' -OutFile \$Installer
        }
        catch {
            throw "HTTPS download failed. Claude Code was not installed; review the error and retry. \$($_.Exception.Message)"
        }
        & \$Installer
    }
    finally {
        Remove-Item -LiteralPath \$Installer -Force -ErrorAction SilentlyContinue
    }
}

\$ClaudeDir = Join-Path \$HOME '.claude'
New-Item -ItemType Directory -Path \$ClaudeDir -Force | Out-Null
Copy-Item (Join-Path \$Here 'claude-foundry.ps1') (Join-Path \$ClaudeDir 'foundry.ps1') -Force

if (-not (Test-Path \$PROFILE.CurrentUserAllHosts)) {
    New-Item -ItemType File -Path \$PROFILE.CurrentUserAllHosts -Force | Out-Null
}
\$ProfileLine = '. "\$HOME\\.claude\\foundry.ps1"'
\$ProfileContent = Get-Content \$PROFILE.CurrentUserAllHosts -Raw
if (\$ProfileContent -notmatch [regex]::Escape(\$ProfileLine)) {
    [System.IO.File]::AppendAllText(
        \$PROFILE.CurrentUserAllHosts,
        [Environment]::NewLine + \$ProfileLine + [Environment]::NewLine
    )
}
. (Join-Path \$ClaudeDir 'foundry.ps1')
claude --version
Write-Host "Run 'claude' in a trusted repository, then use /status."
EOF

  archive="${OUTPUT_DIR%/}.tar.gz"
  tar -czf "$archive" -C "$(dirname "$OUTPUT_DIR")" "$(basename "$OUTPUT_DIR")"
  ok "Generated workstation package: ${archive}"
}

main() {
  local provider_state index
  parse_args "$@"
  require_tools
  select_subscription
  provider_state="$(provider_registration_state)"
  [[ "$provider_state" == Registered ]] ||
    warn "Microsoft.CognitiveServices is ${provider_state:-not registered}; deployment will register it after confirmation."
  discover_account
  verify_local_auth_compatibility
  load_live_catalog
  load_existing_deployments
  validate_selected_models
  check_quota
  check_marketplace_terms
  print_choices

  if [[ "$DRY_RUN" == true ]]; then
    ok "Dry run completed. No Azure resources or Marketplace agreements were changed."
    return
  fi

  confirm
  ensure_provider_registered
  ensure_foundry_account
  ensure_foundry_project
  ensure_current_user_access
  for index in "${!MODEL_IDS[@]}"; do
    deploy_model "$index"
  done
  generate_artifacts
  ok "Claude Code prerequisites are ready on Microsoft Foundry."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
