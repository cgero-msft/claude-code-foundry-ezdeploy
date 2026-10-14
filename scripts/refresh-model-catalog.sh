#!/usr/bin/env bash
set -Eeuo pipefail

readonly REGIONS=(eastus2 swedencentral)

SUBSCRIPTION=""

usage() {
  cat <<'EOF'
Usage: bash scripts/refresh-model-catalog.sh [--subscription ID_OR_NAME]

Query the live Microsoft Foundry model catalog for East US 2 and Sweden Central
with the signed-in Azure CLI account, then regenerate the wizard catalog at
wizard/catalog/catalog.generated.js. The Azure queries are read-only.

Requires Azure CLI and Node.js. Azure Cloud Shell has both.

Options:
  --subscription ID_OR_NAME  Query this subscription instead of the Azure CLI default.
  -h, --help                 Show this help.
EOF
}

log() { printf '[%s] %s\n' "$1" "$2"; }
info() { log INFO "$1"; }
ok() { log OK "$1"; }
die() { log ERROR "$1" >&2; exit 1; }

while (($#)); do
  case "$1" in
    --subscription)
      [[ $# -ge 2 && -n "$2" ]] || die "--subscription requires a value."
      SUBSCRIPTION="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "Unknown argument: $1"
      ;;
  esac
done

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
catalog="${repo_root}/wizard/catalog/catalog.generated.js"

command -v az >/dev/null 2>&1 ||
  die "Azure CLI (az) is required. Run this script in Azure Cloud Shell or install Azure CLI."
command -v node >/dev/null 2>&1 ||
  die "Node.js is required. Run this script in Azure Cloud Shell or install Node.js."

subscription_args=()
[[ -z "$SUBSCRIPTION" ]] || subscription_args=(--subscription "$SUBSCRIPTION")

subscription_name="$(az account show ${subscription_args[@]+"${subscription_args[@]}"} --query name --output tsv)" ||
  die "Azure CLI is not signed in to the requested subscription. Run az login, then retry."
info "Using subscription ${subscription_name}."

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ezdeploy-catalog.XXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT

for region in "${REGIONS[@]}"; do
  info "Querying the live ${region} model catalog..."
  az cognitiveservices model list \
    --location "$region" \
    ${subscription_args[@]+"${subscription_args[@]}"} \
    --output json >"${work_dir}/${region}.json" ||
    die "The ${region} catalog query failed. The existing wizard catalog was not changed."
done

previous="${work_dir}/catalog.previous.js"
[[ ! -f "$catalog" ]] || cp -- "$catalog" "$previous"

node "${repo_root}/scripts/generate-model-catalog.js" \
  --region "eastus2=${work_dir}/eastus2.json" \
  --region "swedencentral=${work_dir}/swedencentral.json" \
  --output "$catalog" ||
  die "Catalog generation failed. The existing wizard catalog was not changed."

node "${repo_root}/scripts/summarize-model-catalog.js" --plain "$previous" "$catalog"
ok "Refreshed ${catalog#"${repo_root}/"}. Open wizard/index.html to choose from current availability; the engine's live preflight still validates every selection."
