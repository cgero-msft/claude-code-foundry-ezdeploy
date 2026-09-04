#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_INPUT="${1:-${SCRIPT_DIR}/../scripts/ezdeploy-engine.sh}"
if [[ -f "$ENGINE_INPUT" ]]; then
  ENGINE="$ENGINE_INPUT"
else
  ENGINE="$(cygpath -u "$ENGINE_INPUT")"
fi
[[ -f "$ENGINE" ]] || { printf 'Engine not found: %s\n' "$ENGINE_INPUT" >&2; exit 2; }

for tool in jq tar; do
  command -v "$tool" >/dev/null 2>&1 || {
    printf '%s is required in Git Bash for the engine regression suite.\n' "$tool" >&2
    exit 2
  }
done

TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ezdeploy-regression.XXXXXX")"
FAKE_BIN="${TEST_ROOT}/fake-bin"
FAKE_CATALOG="${TEST_ROOT}/catalog.json"
FAKE_USAGE="${TEST_ROOT}/usage.json"
mkdir -p "$FAKE_BIN"

cat >"$FAKE_CATALOG" <<'JSON'
[
  {
    "model": {
      "name": "claude-sonnet-4-6",
      "version": "1",
      "format": "Anthropic",
      "isDefaultVersion": true,
      "publisher": {"name": "Anthropic", "id": "anthropic"},
      "hostingType": "Azure infrastructure",
      "marketplace": {"publisherId": "anthropic", "offerId": "claude-sonnet-4-6", "planId": "global"},
      "skus": [{"name": "GlobalStandard", "usageName": "AIServices.GlobalStandard.claude-sonnet-4-6"}]
    }
  },
  {
    "model": {
      "name": "claude-sonnet-5",
      "version": "2",
      "format": "Anthropic",
      "isDefaultVersion": true,
      "publisher": {"name": "Anthropic", "id": "anthropic"},
      "hostingType": "Azure infrastructure",
      "marketplace": {"publisherId": "anthropic", "offerId": "claude-sonnet-5", "planId": "global"},
      "skus": [{"name": "GlobalStandard", "usageName": "AIServices.GlobalStandard.claude-sonnet-5"}]
    }
  },
  {
    "model": {
      "name": "claude-sonnet-5",
      "version": "1",
      "format": "Anthropic",
      "publisher": {"name": "Anthropic", "id": "anthropic"},
      "hostingType": "Anthropic infrastructure",
      "marketplace": {"publisherId": "anthropic", "offerId": "claude-sonnet-5", "planId": "global"},
      "skus": [{"name": "GlobalStandard", "usageName": "AIServices.GlobalStandard.claude-sonnet-5"}]
    }
  },
  {
    "model": {
      "name": "claude-haiku-4-5",
      "version": "2",
      "format": "Anthropic",
      "isDefaultVersion": true,
      "publisher": {"name": "Anthropic", "id": "anthropic"},
      "hostingType": "Azure infrastructure",
      "marketplace": {"publisherId": "anthropic", "offerId": "claude-haiku-4-5", "planId": "global"},
      "skus": [{"name": "GlobalStandard", "usageName": "AIServices.GlobalStandard.claude-haiku-4-5.Azure"}]
    }
  },
  {
    "model": {
      "name": "claude-opus-4-6",
      "version": "1",
      "format": "Anthropic",
      "isDefaultVersion": true,
      "publisher": {"name": "Anthropic", "id": "anthropic"},
      "hostingType": "Azure infrastructure",
      "marketplace": {"publisherId": "anthropic", "offerId": "claude-opus-4-6", "planId": "global"},
      "skus": [{"name": "GlobalStandard", "usageName": "AIServices.GlobalStandard.claude-opus-4-6.Azure"}]
    }
  },
  {
    "model": {
      "name": "claude-opus-4-8",
      "version": "2",
      "format": "Anthropic",
      "isDefaultVersion": true,
      "publisher": {"name": "Anthropic", "id": "anthropic"},
      "hostingType": "Azure infrastructure",
      "marketplace": {"publisherId": "anthropic", "offerId": "claude-opus-4-8", "planId": "global"},
      "skus": [{"name": "GlobalStandard", "usageName": "AIServices.GlobalStandard.claude-opus-4-8.Azure"}]
    }
  }
]
JSON

cat >"$FAKE_USAGE" <<'JSON'
[
  {"name": {"value": "AIServices.GlobalStandard.claude-sonnet-4-6"}, "currentValue": 0, "limit": 100},
  {"name": {"value": "AIServices.GlobalStandard.claude-sonnet-5"}, "currentValue": 10, "limit": 100},
  {"name": {"value": "AIServices.GlobalStandard.claude-haiku-4-5.Azure"}, "currentValue": 0, "limit": 100},
  {"name": {"value": "AIServices.GlobalStandard.claude-opus-4-6.Azure"}, "currentValue": 0, "limit": 100},
  {"name": {"value": "AIServices.GlobalStandard.claude-opus-4-8.Azure"}, "currentValue": 0, "limit": 100}
]
JSON

cat >"${FAKE_BIN}/az" <<'BASH'
#!/usr/bin/env bash
set -uo pipefail

printf '%s\n' "$*" >>"${FAKE_AZ_LOG:?}"

arg_after() {
  local wanted="$1"
  shift
  while (($#)); do
    if [[ "$1" == "$wanted" ]]; then
      printf '%s' "${2:-}"
      return
    fi
    shift
  done
}

query="$(arg_after --query "$@")"
scenario="${FAKE_AZ_SCENARIO:-new}"

if [[ "${1:-}" == version ]]; then
  printf '2.83.0\n'
elif [[ "${1:-}" == account && "${2:-}" == show ]]; then
  case "$query" in
    id) printf '00000000-0000-4000-8000-000000000001\n' ;;
    tenantId) printf '00000000-0000-4000-8000-000000000002\n' ;;
    name) printf 'Local Test Subscription\n' ;;
    *) printf '{"id":"00000000-0000-4000-8000-000000000001","tenantId":"00000000-0000-4000-8000-000000000002","name":"Local Test Subscription"}\n' ;;
  esac
elif [[ "${1:-}" == account && "${2:-}" == set ]]; then
  :
elif [[ "${1:-}" == provider && "${2:-}" == show ]]; then
  printf 'Registered\n'
elif [[ "${1:-}" == provider && "${2:-}" == register ]]; then
  :
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == model && "${3:-}" == list ]]; then
  cat "$FAKE_CATALOG"
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == usage && "${3:-}" == list ]]; then
  cat "$FAKE_USAGE"
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == account && "${3:-}" == deployment && "${4:-}" == list ]]; then
  case "$scenario" in
    rerun)
      cat <<'JSON'
[
  {"name":"sonnet-v2","sku":{"name":"GlobalStandard","capacity":4},"properties":{"model":{"name":"claude-sonnet-5","format":"Anthropic","version":"2"}}},
  {"name":"sonnet-v1","sku":{"name":"GlobalStandard","capacity":3},"properties":{"model":{"name":"claude-sonnet-5","format":"Anthropic","version":"1"}}}
]
JSON
      ;;
    collision-model)
      printf '[{"name":"collision","sku":{"name":"GlobalStandard","capacity":4},"properties":{"model":{"name":"claude-haiku-4-5","format":"Anthropic","version":"2"}}}]\n'
      ;;
    collision-version)
      printf '[{"name":"collision","sku":{"name":"GlobalStandard","capacity":4},"properties":{"model":{"name":"claude-sonnet-5","format":"Anthropic","version":"1"}}}]\n'
      ;;
    collision-sku)
      printf '[{"name":"collision","sku":{"name":"ProvisionedManaged","capacity":4},"properties":{"model":{"name":"claude-sonnet-5","format":"Anthropic","version":"2"}}}]\n'
      ;;
    collision-case)
      printf '[{"name":"Collision","sku":{"name":"GlobalStandard","capacity":4},"properties":{"model":{"name":"claude-haiku-4-5","format":"Anthropic","version":"2"}}}]\n'
      ;;
    reused-case)
      printf '[{"name":"Sonnet-Primary","sku":{"name":"GlobalStandard","capacity":4},"properties":{"model":{"name":"claude-sonnet-5","format":"Anthropic","version":"2"}}}]\n'
      ;;
    ambiguous-case)
      printf '[{"name":"Collision","sku":{"name":"GlobalStandard","capacity":4},"properties":{"model":{"name":"claude-sonnet-5","format":"Anthropic","version":"2"}}},{"name":"collision","sku":{"name":"GlobalStandard","capacity":4},"properties":{"model":{"name":"claude-sonnet-5","format":"Anthropic","version":"2"}}}]\n'
      ;;
    *) printf '[]\n' ;;
  esac
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == account &&
        ( "${3:-}" == create || "${3:-}" == update ) && "${4:-}" == --help ]]; then
  if [[ "$scenario" != local-auth-unsupported ]]; then
    printf '    --disable-local-auth true|false\n'
  fi
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == account && "${3:-}" == list ]]; then
  case "$scenario" in
    rerun|collision-model|collision-version|collision-sku|collision-case|reused-case|ambiguous-case|reused|reused-opt-in|management-role-only)
      printf '[{"name":"local-foundry-test","resourceGroup":"rg-local-test","kind":"AIServices","location":"eastus2","properties":{"customSubDomainName":"local-foundry-test"}}]\n'
      ;;
    *) printf '[]\n' ;;
  esac
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == account && "${3:-}" == project && "${4:-}" == show ]]; then
  if [[ "$query" == properties.provisioningState ]]; then
    printf 'Succeeded\n'
  else
    printf '{"name":"claude-code","location":"eastus2","identity":{"type":"SystemAssigned"},"properties":{"provisioningState":"Succeeded"}}\n'
  fi
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == account && "${3:-}" == project && "${4:-}" == create ]]; then
  :
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == account && "${3:-}" == deployment && "${4:-}" == show ]]; then
  deployment="$(arg_after --deployment-name "$@")"
  if [[ "$query" == properties.provisioningState ]]; then
    printf 'Succeeded\n'
  elif [[ -f "${FAKE_AZ_STATE}/${deployment}.json" ]]; then
    jq --arg name "$deployment" '. + {name:$name} | .properties.provisioningState = "Succeeded"' "${FAKE_AZ_STATE}/${deployment}.json"
  else
    printf '{"name":"%s","sku":{"name":"GlobalStandard","capacity":0},"properties":{"model":{},"provisioningState":"Succeeded"}}\n' "$deployment"
  fi
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == account && "${3:-}" == show ]]; then
  if [[ "$query" == properties.provisioningState ]]; then
    printf 'Succeeded\n'
  else
    disable_local_auth=false
    [[ -f "${FAKE_AZ_STATE}/account-local-auth" ]] && disable_local_auth=true
    printf '{"name":"local-foundry-test","kind":"AIServices","location":"eastus2","identity":{"type":"SystemAssigned"},"properties":{"customSubDomainName":"local-foundry-test","provisioningState":"Succeeded","disableLocalAuth":%s}}\n' "$disable_local_auth"
  fi
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == account && "${3:-}" == identity && "${4:-}" == assign ]]; then
  :
elif [[ "${1:-}" == cognitiveservices && "${2:-}" == account && ( "${3:-}" == create || "${3:-}" == update ) ]]; then
  [[ "$*" == *"--disable-local-auth true"* ]] && touch "${FAKE_AZ_STATE}/account-local-auth"
  :
elif [[ "${1:-}" == group && "${2:-}" == create ]]; then
  :
elif [[ "${1:-}" == ad && "${2:-}" == signed-in-user && "${3:-}" == show ]]; then
  printf '00000000-0000-4000-8000-000000000003\n'
elif [[ "${1:-}" == role && "${2:-}" == assignment && "${3:-}" == list ]]; then
  if [[ "$scenario" == management-role-only ]]; then
    printf '[{"roleDefinitionName":"Owner"},{"roleDefinitionName":"Contributor"},{"roleDefinitionName":"Cognitive Services Contributor"},{"roleDefinitionName":"Foundry Account Owner"},{"roleDefinitionName":"Azure AI Account Owner"}]\n'
  else
    printf '[]\n'
  fi
elif [[ "${1:-}" == role && "${2:-}" == assignment && "${3:-}" == create ]]; then
  :
elif [[ "${1:-}" == rest ]]; then
  method="$(arg_after --method "$@")"
  url="$(arg_after --url "$@")"
  body="$(arg_after --body "$@")"
  if [[ "$method" == post && "$url" == *checkDomainAvailability* ]]; then
    printf '{"isSubdomainAvailable":true}\n'
  elif [[ "$method" == get && "$url" == *Microsoft.MarketplaceOrdering* ]]; then
    printf '{"properties":{"accepted":true}}\n'
  elif [[ "$method" == put && "$url" == *'/deployments/'* ]]; then
    deployment="${url##*/deployments/}"
    deployment="${deployment%%\?*}"
    printf '%s\n' "$body" >"${FAKE_AZ_STATE}/${deployment}.json"
  else
    printf 'Unsupported fake az rest call: %s\n' "$*" >&2
    exit 2
  fi
else
  printf 'Unsupported fake az call: %s\n' "$*" >&2
  exit 2
fi
BASH
chmod +x "${FAKE_BIN}/az"

PASSED=0
FAILED=0
CASE_NUMBER=0
LAST_STATUS=0
LAST_OUTPUT=""
LAST_LOG=""
LAST_STATE=""

pass() {
  PASSED=$((PASSED + 1))
  printf 'PASS: %s\n' "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  printf 'FAIL: %s: %s\n' "$1" "$2" >&2
}

assert_contains() {
  local name="$1" file="$2" expected="$3"
  if grep -Fq -- "$expected" "$file"; then
    pass "$name"
  else
    fail "$name" "missing text: $expected"
  fi
}

assert_not_contains() {
  local name="$1" file="$2" unexpected="$3"
  if grep -Fq -- "$unexpected" "$file"; then
    fail "$name" "unexpected text: $unexpected"
  else
    pass "$name"
  fi
}

assert_before() {
  local name="$1" file="$2" first="$3" second="$4" first_line second_line
  first_line="$(grep -Fn -- "$first" "$file" | head -n1 | cut -d: -f1)"
  second_line="$(grep -Fn -- "$second" "$file" | head -n1 | cut -d: -f1)"
  if [[ -n "$first_line" && -n "$second_line" ]] && ((first_line < second_line)); then
    pass "$name"
  else
    fail "$name" "expected '$first' before '$second'"
  fi
}

run_engine() {
  local scenario="$1"
  shift
  CASE_NUMBER=$((CASE_NUMBER + 1))
  LAST_OUTPUT="${TEST_ROOT}/case-${CASE_NUMBER}.out"
  LAST_LOG="${TEST_ROOT}/case-${CASE_NUMBER}.az.log"
  LAST_STATE="${TEST_ROOT}/case-${CASE_NUMBER}.state"
  mkdir -p "$LAST_STATE"
  : >"$LAST_LOG"
  set +e
  FAKE_AZ_SCENARIO="$scenario" \
  FAKE_AZ_LOG="$LAST_LOG" \
  FAKE_AZ_STATE="$LAST_STATE" \
  FAKE_CATALOG="$FAKE_CATALOG" \
  FAKE_USAGE="$FAKE_USAGE" \
  PATH="${FAKE_BIN}:$PATH" \
    bash "$ENGINE" \
      --subscription local-test \
      --resource-group rg-local-test \
      --location eastus2 \
      --account-name local-foundry-test \
      --project-name claude-code \
      --organization-name "Contoso Test" \
      --country-code US \
      --industry technology \
      "$@" >"$LAST_OUTPUT" 2>&1
  LAST_STATUS=$?
  set -e
}

expect_success() {
  local name="$1"
  if ((LAST_STATUS == 0)); then
    pass "$name"
  else
    fail "$name" "exit ${LAST_STATUS}; $(tail -n 3 "$LAST_OUTPUT" | tr '\n' ' ')"
  fi
}

expect_failure() {
  local name="$1" text="$2"
  if ((LAST_STATUS != 0)) && grep -Fq -- "$text" "$LAST_OUTPUT"; then
    pass "$name"
  else
    fail "$name" "expected failure containing '$text'; exit ${LAST_STATUS}"
  fi
}

BASE_EXACT=(
  --model claude-sonnet-5:2:sonnet-v2:7
  --model claude-sonnet-5@1=11
  --deployment-name claude-sonnet-5@1=sonnet-v1
  --dry-run
)

run_engine new --dry-run
expect_success "legacy direct-engine default profile succeeds"
assert_contains "legacy direct-engine default profile is lean" "$LAST_OUTPUT" "claude-sonnet-4-6"
assert_contains "lean default includes Haiku" "$LAST_OUTPUT" "claude-haiku-4-5"
assert_not_contains "lean default excludes costly Opus" "$LAST_OUTPUT" "claude-opus-4-6"

run_engine new --profile full --dry-run
expect_success "explicit full compatibility profile succeeds"
assert_contains "explicit full profile retains Opus" "$LAST_OUTPUT" "claude-opus-4-6"

run_engine new --help
expect_success "engine help succeeds"
assert_contains "help documents reused-account local-auth opt-in" "$LAST_OUTPUT" "--disable-local-auth-on-reuse"

run_engine local-auth-unsupported --model claude-sonnet-5:2:sonnet-v2:5 --yes
expect_failure "unsupported local-auth CLI is rejected before mutation" "does not support --disable-local-auth"
assert_not_contains "unsupported local-auth CLI does not mutate Azure" "$LAST_LOG" "group create"

run_engine new "${BASE_EXACT[@]}"
expect_success "exact and alias model syntax succeeds"
assert_contains "four-field exact version is selected" "$LAST_OUTPUT" "sonnet-v2: claude-sonnet-5 version 2"
assert_contains "alias exact version is selected" "$LAST_OUTPUT" "sonnet-v1: claude-sonnet-5 version 1"
assert_contains "first same-family selection is deterministic default" "$LAST_OUTPUT" "sonnet-v2: claude-sonnet-5 version 2, capacity 7 [family default]"
assert_contains "same quota pool is aggregated" "$LAST_OUTPUT" "AIServices.GlobalStandard.claude-sonnet-5: 90 available; 18 additional capacity required."

if grep -Ev -- '--help' "$LAST_LOG" |
    grep -Eq '^(provider register|group create|cognitiveservices account (create|update)|cognitiveservices account project create|role assignment create|rest --method put)'; then
  fail "dry run is non-mutating" "a mutating fake az command was invoked"
else
  pass "dry run is non-mutating"
fi

run_engine new \
  --model claude-sonnet-5:2:sonnet-v2:7 \
  --model claude-sonnet-5@1=11 \
  --deployment-name claude-sonnet-5@1=sonnet-v1 \
  --default-sonnet-model sonnet-v1 \
  --dry-run
expect_success "explicit family default succeeds"
assert_contains "explicit family default replaces first-selection default" "$LAST_OUTPUT" "sonnet-v1: claude-sonnet-5 version 1, capacity 11 [family default]"

run_engine new --model broken-spec --dry-run
expect_failure "invalid model specification is rejected" "--model must use MODEL:VERSION:DEPLOYMENT:CAPACITY or MODEL@VERSION=CAPACITY."

run_engine new --model claude-sonnet-5::missing-version:5 --dry-run
expect_failure "model specification without a version is rejected" "--model must use MODEL:VERSION:DEPLOYMENT:CAPACITY or MODEL@VERSION=CAPACITY."

run_engine new \
  --model claude-sonnet-5:2:duplicate:5 \
  --model claude-sonnet-5:1:duplicate:5 \
  --dry-run
expect_failure "duplicate deployment specification is rejected" "Deployment duplicate was selected more than once."

run_engine new \
  --model claude-sonnet-5:2:Duplicate:5 \
  --model claude-sonnet-5:1:duplicate:5 \
  --dry-run
expect_failure "case-only duplicate deployment specification is rejected" "Deployment duplicate was selected more than once."

run_engine new \
  --model claude-sonnet-5@2=5 \
  --deployment-name claude-sonnet-5@2=one \
  --deployment-name claude-sonnet-5@2=two \
  --dry-run
expect_failure "duplicate deployment override is rejected" "Deployment override for claude-sonnet-5@2 was provided more than once."

run_engine new \
  --model claude-sonnet-5:2:sonnet-v2:5 \
  --default-sonnet-model not-selected \
  --dry-run
expect_failure "unselected explicit default is rejected" "Default sonnet selector not-selected is not a selected sonnet deployment or MODEL@VERSION."

run_engine new \
  --model claude-sonnet-5:2:Sonnet-Primary:5 \
  --default-sonnet-model sonnet-primary \
  --dry-run
expect_success "family default deployment selector is case-insensitive"
assert_contains "deployment display casing is preserved" "$LAST_OUTPUT" "Sonnet-Primary: claude-sonnet-5 version 2, capacity 5 [family default]"
assert_not_contains "deployment display casing is not normalized" "$LAST_OUTPUT" "sonnet-primary: claude-sonnet-5 version 2"

run_engine new \
  --model claude-sonnet-5:2:Sonnet-Primary:5 \
  --default-sonnet-model claude-sonnet-5@02 \
  --dry-run
expect_failure "exact MODEL@VERSION default selector remains exact" "Default sonnet selector claude-sonnet-5@02 is not a selected sonnet deployment or MODEL@VERSION."

for wrapper in \
  '[{"model":{"name":"wrapped","version":"1"}}]' \
  '{"value":[{"model":{"name":"wrapped","version":"1"}}]}' \
  '{"models":[{"model":{"name":"wrapped","version":"1"}}]}' \
  '{"model":{"name":"wrapped","version":"1"}}'; do
  normalized="$(
    ENGINE_PATH="$ENGINE" bash -c 'source "$ENGINE_PATH"; normalize_catalog' <<<"$wrapper"
  )"
  if jq -e 'length == 1 and .[0].name == "wrapped" and .[0].version == "1" and (.[] | has("model") | not)' <<<"$normalized" >/dev/null; then
    pass "catalog wrapper normalization shape ${wrapper:0:12}"
  else
    fail "catalog wrapper normalization shape ${wrapper:0:12}" "$normalized"
  fi
done

run_engine new \
  --model claude-haiku-4-5:2:haiku-v2:5 \
  --dry-run
expect_success "exact version-specific SKU metadata succeeds"
assert_contains "version-specific usageName is used" "$LAST_OUTPUT" "quota AIServices.GlobalStandard.claude-haiku-4-5.Azure"

run_engine new \
  --sku UnsupportedSku \
  --model claude-sonnet-5:2:sonnet-v2:5 \
  --dry-run
expect_failure "unsupported exact-version SKU is rejected" "does not support UnsupportedSku in eastus2."

run_engine rerun \
  --model claude-sonnet-5:2:sonnet-v2:10 \
  --model claude-sonnet-5:1:sonnet-v1:8 \
  --dry-run
expect_success "rerun with compatible deployments succeeds"
assert_contains "rerun quota uses aggregate capacity delta" "$LAST_OUTPUT" "AIServices.GlobalStandard.claude-sonnet-5: 90 available; 11 additional capacity required."

run_engine rerun \
  --model claude-sonnet-5:2:sonnet-v2:3 \
  --model claude-sonnet-5:1:sonnet-v1:3 \
  --dry-run
expect_success "rerun at or below existing capacities succeeds"
assert_contains "rerun never requests negative capacity" "$LAST_OUTPUT" "AIServices.GlobalStandard.claude-sonnet-5: 90 available; 0 additional capacity required."

run_engine collision-model \
  --model claude-sonnet-5:2:collision:5 \
  --dry-run
expect_failure "deployment model collision is rejected" "Deployment-name collision: collision currently targets claude-haiku-4-5, not claude-sonnet-5."

run_engine collision-version \
  --model claude-sonnet-5:2:collision:5 \
  --dry-run
expect_failure "deployment version collision is rejected" "refusing to replace it with version 2."

run_engine collision-sku \
  --model claude-sonnet-5:2:collision:5 \
  --dry-run
expect_failure "deployment SKU collision is rejected" "uses SKU ProvisionedManaged; refusing to replace it with GlobalStandard."

run_engine collision-case \
  --model claude-sonnet-5:2:collision:5 \
  --dry-run
expect_failure "existing case-only deployment collision is rejected" "Deployment-name collision: Collision currently targets claude-haiku-4-5, not claude-sonnet-5."

run_engine ambiguous-case \
  --model claude-sonnet-5:2:collision:5 \
  --dry-run
expect_failure "ambiguous existing case-only deployments are rejected" "Multiple existing deployments differ only by case for requested name collision"

ARTIFACT_DIR="${TEST_ROOT}/generated-package"
run_engine new \
  --model claude-sonnet-5:2:sonnet-primary:9 \
  --model claude-haiku-4-5:2:haiku-primary:6 \
  --default-sonnet-model sonnet-primary \
  --default-haiku-model haiku-primary \
  --assign-current-user \
  --output-dir "$ARTIFACT_DIR" \
  --yes
expect_success "fake-Azure deployment path succeeds"
assert_contains "new account disables local authentication" "$LAST_LOG" "cognitiveservices account create"
assert_contains "new account passes local-auth disable flag" "$LAST_LOG" "--disable-local-auth true"
assert_before "new account compatibility is checked before mutation" "$LAST_LOG" "cognitiveservices account create --help" "group create"
NEW_ACCOUNT_LOG="$LAST_LOG"
NEW_ACCOUNT_STATE="$LAST_STATE"

REUSED_ARTIFACT_DIR="${TEST_ROOT}/reused-package"
run_engine reused \
  --model claude-sonnet-5:2:sonnet-primary:9 \
  --assign-current-user \
  --output-dir "$REUSED_ARTIFACT_DIR" \
  --yes
expect_success "reused account deployment path succeeds"
assert_contains "reused account is still updated for project management" "$LAST_LOG" "cognitiveservices account update"
assert_not_contains "reused account preserves local authentication by default" "$LAST_LOG" "--disable-local-auth true"
assert_not_contains "reused account does not require local-auth update compatibility by default" "$LAST_LOG" "cognitiveservices account update --help"
assert_contains "reused account confirmation shows preservation behavior" "$LAST_OUTPUT" "Local authentication: preserve existing account setting"

REUSED_CASE_ARTIFACT_DIR="${TEST_ROOT}/reused-case-package"
run_engine reused-case \
  --model claude-sonnet-5:2:sonnet-primary:9 \
  --assign-current-user \
  --output-dir "$REUSED_CASE_ARTIFACT_DIR" \
  --yes
expect_success "case-insensitive existing deployment reuse succeeds"
assert_contains "case-insensitive reuse adopts Azure deployment casing" "$LAST_LOG" "/deployments/Sonnet-Primary?api-version="
assert_not_contains "case-insensitive reuse avoids user-cased deployment path" "$LAST_LOG" "/deployments/sonnet-primary?api-version="
assert_contains "case-insensitive reuse calculates only incremental quota" "$LAST_OUTPUT" "AIServices.GlobalStandard.claude-sonnet-5: 90 available; 5 additional capacity required."
if jq -e '
  ([."claudeCode.environmentVariables"[] | select(.name == "ANTHROPIC_DEFAULT_SONNET_MODEL" and .value == "Sonnet-Primary")] | length) == 1
' "${REUSED_CASE_ARTIFACT_DIR}/vscode-settings.snippet.json" >/dev/null &&
   jq -e '
  (.models | length) == 1 and
  .models[0].deploymentName == "Sonnet-Primary" and
  .models[0].familyDefault == true
' "${REUSED_CASE_ARTIFACT_DIR}/deployment-report.json" >/dev/null; then
  pass "case-insensitive reuse preserves canonical casing in generated artifacts"
else
  fail "case-insensitive reuse preserves canonical casing in generated artifacts" "canonical deployment casing or family default was lost"
fi

REUSED_OPT_IN_ARTIFACT_DIR="${TEST_ROOT}/reused-opt-in-package"
run_engine reused-opt-in \
  --model claude-sonnet-5:2:sonnet-primary:9 \
  --disable-local-auth-on-reuse \
  --assign-current-user \
  --output-dir "$REUSED_OPT_IN_ARTIFACT_DIR" \
  --yes
expect_success "reused account local-auth opt-in succeeds"
assert_contains "reused account opt-in passes local-auth disable flag" "$LAST_LOG" "--disable-local-auth true"
assert_before "reused account opt-in compatibility is checked before mutation" "$LAST_LOG" "cognitiveservices account update --help" "group create"
assert_contains "reused account opt-in is shown in confirmation" "$LAST_OUTPUT" "Local authentication: disable on existing account (explicit opt-in)"
assert_contains "reused account opt-in is explicitly confirmed" "$LAST_OUTPUT" "--yes also confirms disabling local authentication"

run_engine reused-opt-in \
  --model claude-sonnet-5:2:sonnet-primary:9 \
  --disable-local-auth-on-reuse \
  --dry-run
expect_success "reused account local-auth opt-in dry run succeeds"
assert_not_contains "reused account local-auth opt-in dry run does not update account" "$LAST_LOG" "cognitiveservices account update -g"

MANAGEMENT_ROLE_ARTIFACT_DIR="${TEST_ROOT}/management-role-package"
run_engine management-role-only \
  --model claude-sonnet-5:2:sonnet-primary:9 \
  --assign-current-user \
  --output-dir "$MANAGEMENT_ROLE_ARTIFACT_DIR" \
  --yes
expect_success "management-plane-only role deployment succeeds"
assert_contains "management-plane-only roles cause runtime role assignment" "$LAST_LOG" "role assignment create"

if [[ -f "${NEW_ACCOUNT_STATE}/sonnet-primary.json" && -f "${NEW_ACCOUNT_STATE}/haiku-primary.json" ]] &&
   jq -e '.properties.versionUpgradeOption == "NoAutoUpgrade" and .properties.raiPolicyName == "Microsoft.DefaultV2" and .sku.name == "GlobalStandard"' "${NEW_ACCOUNT_STATE}/sonnet-primary.json" >/dev/null &&
   jq -e '.properties.versionUpgradeOption == "NoAutoUpgrade" and .properties.raiPolicyName == "Microsoft.DefaultV2" and .sku.name == "GlobalStandard"' "${NEW_ACCOUNT_STATE}/haiku-primary.json" >/dev/null; then
  pass "deployment payload pins versions and uses Microsoft.DefaultV2"
else
  fail "deployment payload pins versions and uses Microsoft.DefaultV2" "payload contract mismatch"
fi

assert_contains "optional RBAC invokes assignment when needed" "$NEW_ACCOUNT_LOG" "role assignment create"

if bash -n "${ARTIFACT_DIR}/install-claude-code-local.sh"; then
  pass "generated Bash installer parses"
else
  fail "generated Bash installer parses" "bash -n failed"
fi
assert_contains "Bash installer downloads to a temporary file" "${ARTIFACT_DIR}/install-claude-code-local.sh" 'mktemp "${TMPDIR:-/tmp}/claude-install.'
assert_contains "Bash installer reports the official HTTPS download" "${ARTIFACT_DIR}/install-claude-code-local.sh" "Downloading the official Anthropic installer from https://claude.ai/install.sh"
assert_contains "Bash installer executes the saved installer" "${ARTIFACT_DIR}/install-claude-code-local.sh" 'bash "$installer"'
assert_contains "Bash installer cleans up its temporary file" "${ARTIFACT_DIR}/install-claude-code-local.sh" 'rm -f -- "$installer"'
assert_not_contains "Bash installer does not pipe remote code to shell" "${ARTIFACT_DIR}/install-claude-code-local.sh" "curl -fsSL https://claude.ai/install.sh | bash"

PS_FILE_WINDOWS="$(cygpath -w "${ARTIFACT_DIR}/install-claude-code-windows.ps1")"
if pwsh.exe -NoProfile -Command "[void][scriptblock]::Create((Get-Content -Raw -LiteralPath '$PS_FILE_WINDOWS'))" >/dev/null 2>&1; then
  pass "generated PowerShell installer parses"
else
  fail "generated PowerShell installer parses" "PowerShell parser failed"
fi
assert_contains "PowerShell installer downloads to a temporary file" "${ARTIFACT_DIR}/install-claude-code-windows.ps1" '[System.IO.Path]::GetTempPath()'
assert_contains "PowerShell installer reports the official HTTPS download" "${ARTIFACT_DIR}/install-claude-code-windows.ps1" "Downloading the official Anthropic installer from https://claude.ai/install.ps1"
assert_contains "PowerShell installer executes the saved installer" "${ARTIFACT_DIR}/install-claude-code-windows.ps1" '& $Installer'
assert_contains "PowerShell installer cleans up its temporary file" "${ARTIFACT_DIR}/install-claude-code-windows.ps1" 'Remove-Item -LiteralPath $Installer'
assert_not_contains "PowerShell installer does not use Invoke-Expression" "${ARTIFACT_DIR}/install-claude-code-windows.ps1" "Invoke-Expression"

if jq -e '
  ."claudeCode.disableLoginPrompt" == true and
  ([."claudeCode.environmentVariables"[] | select(.name == "ANTHROPIC_DEFAULT_SONNET_MODEL" and .value == "sonnet-primary")] | length) == 1 and
  ([."claudeCode.environmentVariables"[] | select(.name == "ANTHROPIC_DEFAULT_HAIKU_MODEL" and .value == "haiku-primary")] | length) == 1
' "${ARTIFACT_DIR}/vscode-settings.snippet.json" >/dev/null; then
  pass "generated VS Code JSON is valid and includes explicit defaults"
else
  fail "generated VS Code JSON is valid and includes explicit defaults" "JSON contract mismatch"
fi

if jq -e '
  .projectName == "claude-code" and
  .authentication == "Microsoft Entra ID" and
  .secretsStored == false and
  (.models | length) == 2 and
  all(.models[];
    .versionUpgradeOption == "NoAutoUpgrade" and
    .raiPolicyName == "Microsoft.DefaultV2" and
    .sku == "GlobalStandard" and
    .provisioningState == "Succeeded")
' "${ARTIFACT_DIR}/deployment-report.json" >/dev/null; then
  pass "generated deployment report is valid and complete"
else
  fail "generated deployment report is valid and complete" "report contract mismatch"
fi

if grep -Fq 'export PATH="$HOME/.local/bin:$PATH"' "${ARTIFACT_DIR}/claude-foundry.env" &&
   grep -Fq '$env:PATH = "$HOME\.local\bin;$env:PATH"' "${ARTIFACT_DIR}/claude-foundry.ps1"; then
  pass "generated activators use expandable HOME paths"
else
  fail "generated activators use expandable HOME paths" "HOME path is not expandable"
fi

for artifact in \
  claude-foundry.env \
  claude-foundry.ps1 \
  vscode-settings.snippet.json \
  deployment-report.json \
  install-claude-code-local.sh \
  install-claude-code-windows.ps1; do
  assert_contains "${artifact} warns against committing local identifiers" \
    "${ARTIFACT_DIR}/${artifact}" \
    "Subscription and tenant identifiers are local deployment outputs and must not be committed."
done

if grep -ERni '(api[_-]?key|client[_-]?secret|BEGIN (RSA|OPENSSH|PRIVATE) KEY|eyJ[A-Za-z0-9_-]{20,}\.)' "$ARTIFACT_DIR" >/dev/null 2>&1; then
  fail "generated package contains no secrets" "credential-like text was found"
else
  pass "generated package contains no secrets"
fi

if [[ -f "${ARTIFACT_DIR}.tar.gz" ]] && tar -tzf "${ARTIFACT_DIR}.tar.gz" >/dev/null; then
  pass "generated archive is readable"
else
  fail "generated archive is readable" "archive is missing or invalid"
fi

printf 'Engine tests: %d passed, %d failed.\n' "$PASSED" "$FAILED"
printf 'Test work retained at: %s\n' "$TEST_ROOT"
((FAILED == 0))
