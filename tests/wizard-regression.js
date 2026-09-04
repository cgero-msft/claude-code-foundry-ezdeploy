"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const wizardPath = process.argv[2] || path.resolve(__dirname, "..", "wizard", "index.html");
const wizardRoot = path.dirname(wizardPath);

const html = fs.readFileSync(wizardPath, "utf8");
const fallbackScript = fs.readFileSync(path.join(wizardRoot, "catalog", "catalog.fallback.js"), "utf8");
const overlayScript = fs.readFileSync(path.join(wizardRoot, "catalog", "catalog.overlay.js"), "utf8");
const generatedScript = fs.readFileSync(path.join(wizardRoot, "catalog", "catalog.generated.js"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
if (scripts.length < 2) {
  throw new Error("The wizard application script was not found.");
}

const appScript = scripts.at(-1)[1];
const initializationOffset = appScript.lastIndexOf("initialize();");
if (initializationOffset < 0) {
  throw new Error("The wizard initialization boundary was not found.");
}

const state = {
  fields: {},
  selectedKeys: [],
  defaults: {},
};

function field(id) {
  if (!state.fields[id]) {
    const classes = new Set(["hidden"]);
    state.fields[id] = {
      value: "",
      checked: false,
      disabled: false,
      style: {},
      href: "",
      textContent: "",
      innerHTML: "",
      addEventListener() {},
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        toggle(name, force) {
          if (force === undefined ? !classes.has(name) : force) classes.add(name);
          else classes.delete(name);
        },
        contains(name) { return classes.has(name); },
      },
    };
  }
  return state.fields[id];
}

const document = {
  getElementById: field,
  querySelectorAll(selector) {
    if (selector === ".model-check:checked") {
      return state.selectedKeys.map((key) => ({ dataset: { key }, checked: true }));
    }
    return [];
  },
  querySelector(selector) {
    const match = selector.match(/^input\[name="default-(sonnet|haiku|opus)"\]:checked:not\(:disabled\)$/);
    if (!match) return null;
    const key = state.defaults[match[1]];
    return key ? { value: key, disabled: false, checked: true } : null;
  },
  createElement() {
    let textContent = "";
    return {
      innerHTML: "",
      get textContent() { return textContent; },
      set textContent(value) {
        textContent = String(value);
        this.innerHTML = textContent
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      },
    };
  },
};

const context = {
  document,
  window: { scrollTo() {} },
  navigator: {},
  URL,
  URLSearchParams,
  Blob,
  setTimeout,
  alert() {},
  console,
};
vm.createContext(context);
vm.runInContext(fallbackScript, context, { filename: "catalog.fallback.js" });
vm.runInContext(overlayScript, context, { filename: "catalog.overlay.js" });
vm.runInContext(generatedScript, context, { filename: "catalog.generated.js" });
vm.runInContext(
  `${appScript.slice(0, initializationOffset)}
globalThis.__wizard = {
  modelMetadata,
  catalogState,
  catalogModelsForRegion,
  loadCatalog,
  staleIssueUrl,
  selectedModels,
  defaultModels,
  data,
  validate,
  validateThrough,
  ensureComplete,
  command,
  launcher,
  renderModelCards
};`,
  context,
  { filename: wizardPath }
);

const wizard = context.__wizard;
let passed = 0;
let failed = 0;

function pass(name) {
  passed += 1;
  console.log(`PASS: ${name}`);
}

function fail(name, detail) {
  failed += 1;
  console.error(`FAIL: ${name}: ${detail}`);
}

function test(name, fn) {
  try {
    fn();
    pass(name);
  } catch (error) {
    fail(name, error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}; expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function resetValidState() {
  state.fields = {};
  state.selectedKeys = ["sonnet-5-v2", "haiku-4-5-v2", "opus-4-8-v2"];
  state.defaults = {
    sonnet: "sonnet-5-v2",
    haiku: "haiku-4-5-v2",
    opus: "opus-4-8-v2",
  };

  Object.assign(field("subscription"), { value: "sub-local-test" });
  Object.assign(field("resourceGroup"), { value: "rg-local-test" });
  Object.assign(field("region"), { value: "eastus2" });
  Object.assign(field("accountName"), { value: "local-foundry-test" });
  Object.assign(field("projectName"), { value: "claude-code" });
  Object.assign(field("assignCurrentUser"), { checked: false });
  Object.assign(field("organization"), { value: "Contoso Test" });
  Object.assign(field("country"), { value: "us" });
  Object.assign(field("industry"), { value: "technology" });
  Object.assign(field("acceptTerms"), { checked: true });
  Object.assign(field("acceptHosting"), { checked: true });

  for (const [key, metadata] of Object.entries(wizard.modelMetadata)) {
    Object.assign(field(`capacity-${key}`), { value: "10" });
    Object.assign(field(`deployment-${key}`), { value: metadata.deployment });
  }
}

function inputTag(id) {
  const match = html.match(new RegExp(`<input\\s+[^>]*id="${id}"[^>]*>`, "i"));
  if (!match) throw new Error(`Input ${id} was not found.`);
  return match[0];
}

test("wizard application JavaScript compiles", () => {
  new vm.Script(appScript, { filename: wizardPath });
});

test("Azure target inputs do not contain inherited target defaults", () => {
  for (const id of ["subscription", "resourceGroup", "accountName"]) {
    assert(!/\svalue\s*=/.test(inputTag(id)), `${id} unexpectedly has a value attribute`);
  }
  assert(/\svalue="claude-code"/.test(inputTag("projectName")), "projectName should retain the deterministic package default");
});

test("Azure target selection appears before model selection", () => {
  assert(
    html.indexOf('data-step="0"><div class="panel"><h2>Select the Azure target') <
      html.indexOf('data-step="1"><div class="panel"><h2>Select exact model versions'),
    "Azure target must precede regional model selection"
  );
});

test("industry options match the engine allowlist", () => {
  const select = html.match(/<select id="industry">([\s\S]*?)<\/select>/i);
  assert(select, "industry select was not found");
  const values = [...select[1].matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assertEqual(
    values.join(","),
    "technology,finance,healthcare,education,retail,manufacturing,government,media,other",
    "industry allowlist mismatch"
  );
});

test("selected-model validation rejects an empty selection", () => {
  resetValidState();
  state.selectedKeys = [];
  assertEqual(wizard.validate(1), "Select at least one exact model version.", "empty selection validation");
});

test("billable model deployments require an explicit user selection", () => {
  state.fields = {};
  state.selectedKeys = [];
  state.defaults = {};
  wizard.renderModelCards();
  const modelCards = field("modelList").innerHTML;

  assert(!/\bselected\s*:\s*true\b/.test(appScript), "model metadata still contains a preselected deployment");
  assert(!/class="model-check"[^>]*\schecked(?:\s|>)/.test(modelCards), "a model checkbox is preselected");
  assert(!/class="default-model"[^>]*\schecked(?:\s|>)/.test(modelCards), "a default mapping is preselected");
  assertEqual((modelCards.match(/EZDeploy Recommended/g) || []).length, 3, "recommended badges");
  assertEqual((modelCards.match(/EZDeploy Tested/g) || []).length, 3, "tested badges");
  assert((modelCards.match(/Azure Default/g) || []).length > 3, "Azure default badges are not independent");
});

test("selected-model validation rejects invalid capacity and duplicate deployment names", () => {
  resetValidState();
  field("capacity-sonnet-5-v2").value = "0";
  assert(/positive whole-number capacity/.test(wizard.validate(1)), "zero capacity was accepted");

  resetValidState();
  field("deployment-haiku-4-5-v2").value = field("deployment-sonnet-5-v2").value;
  assert(/unique deployment name/.test(wizard.validate(1)), "duplicate deployment names were accepted");
});

test("multiple versions from one family remain independently selectable", () => {
  resetValidState();
  state.selectedKeys = ["sonnet-5-v2", "sonnet-5-v1"];
  state.defaults = { sonnet: "sonnet-5-v1" };
  const selected = wizard.selectedModels();
  assertEqual(selected.length, 2, "selected model count");
  assertEqual(selected[0].family, "sonnet", "first family");
  assertEqual(selected[1].family, "sonnet", "second family");
  assertEqual(wizard.validate(1), "", "same-family exact versions should be valid with unique deployments");
  assertEqual(wizard.validate(3), "", "same-family default should validate");
});

test("cumulative validation returns the earliest incomplete step", () => {
  resetValidState();
  field("subscription").value = "";
  let failure = wizard.validateThrough(3);
  assertEqual(failure.index, 0, "missing target should return step 0");

  resetValidState();
  state.selectedKeys = [];
  failure = wizard.validateThrough(3);
  assertEqual(failure.index, 1, "missing models should return step 1");

  resetValidState();
  field("organization").value = "";
  failure = wizard.validateThrough(3);
  assertEqual(failure.index, 2, "missing provider details should return step 2");

  resetValidState();
  state.defaults.sonnet = null;
  failure = wizard.validateThrough(3);
  assertEqual(failure.index, 3, "missing family default should return step 3");
});

test("navigation and review actions enforce cumulative validation", () => {
  assert(/validateThrough\(target-1\)/.test(appScript), "side navigation does not validate prior steps");
  assert(/function ensureComplete\(\)\s*\{\s*const failure=validateThrough\(3\)/.test(appScript), "review actions do not validate all prior steps");
  for (const action of ["dry", "deploy", "copy"]) {
    assert(
      new RegExp(`\\$\\("${action}"\\)\\.onclick=[\\s\\S]{0,100}ensureComplete\\(\\)`).test(appScript),
      `${action} action does not call ensureComplete`
    );
  }
});

test("generated command includes project, exact models, explicit defaults, and optional RBAC", () => {
  resetValidState();
  state.selectedKeys = ["sonnet-5-v2", "sonnet-5-v1", "haiku-4-5-v2"];
  state.defaults = { sonnet: "sonnet-5-v1", haiku: "haiku-4-5-v2" };
  field("assignCurrentUser").checked = true;
  const command = wizard.command(false);
  const flatCommand = command.replace(/ \\\n  /g, " ");

  assert(flatCommand.startsWith("bash './ezdeploy-engine.sh'"), "same-folder Cloud Shell engine path is missing");
  assert(flatCommand.includes("--project-name 'claude-code'"), "project name argument is missing");
  assert(flatCommand.includes("--assign-current-user"), "optional RBAC argument is missing");
  assert(flatCommand.includes("--model 'claude-sonnet-5:2:claude-sonnet-5:10'"), "Sonnet v2 exact selection is missing");
  assert(flatCommand.includes("--model 'claude-sonnet-5:1:claude-sonnet-5-v1:10'"), "Sonnet v1 exact selection is missing");
  assert(flatCommand.includes("--default-sonnet-model 'claude-sonnet-5-v1'"), "explicit Sonnet default is missing");
  assert(flatCommand.includes("--default-haiku-model 'claude-haiku-4-5'"), "explicit Haiku default is missing");
  assert(!flatCommand.includes("--yes"), "wizard must not generate non-interactive approval");
  assert(flatCommand.includes('--output-dir "${HOME}/claude-code-foundry"'), "HOME output path is not expandable");
});

test("generated launcher output remains exact", () => {
  resetValidState();
  state.selectedKeys = ["sonnet-5-v2", "haiku-4-5-v2"];
  state.defaults = { sonnet: "sonnet-5-v2", haiku: "haiku-4-5-v2" };
  const expected = `#!/usr/bin/env bash
set -Eeuo pipefail
here="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
engine="\${here}/scripts/ezdeploy-engine.sh"
[[ -f "\${engine}" ]] || engine="\${here}/ezdeploy-engine.sh"

bash \\
  "\${engine}" \\
  --subscription \\
  'sub-local-test' \\
  --resource-group \\
  'rg-local-test' \\
  --location \\
  'eastus2' \\
  --account-name \\
  'local-foundry-test' \\
  --project-name \\
  'claude-code' \\
  --organization-name \\
  'Contoso Test' \\
  --country-code \\
  'US' \\
  --industry \\
  'technology' \\
  --sku \\
  'GlobalStandard' \\
  --model \\
  'claude-sonnet-5:2:claude-sonnet-5:10' \\
  --model \\
  'claude-haiku-4-5:2:claude-haiku-4-5:10' \\
  --default-sonnet-model \\
  'claude-sonnet-5' \\
  --default-haiku-model \\
  'claude-haiku-4-5' \\
  --output-dir \\
  "\${HOME}/claude-code-foundry" \\
  --dry-run
`;
  assertEqual(wizard.launcher(true), expected, "dry-run launcher contract changed");
});

test("generated snapshot loads and malformed or missing snapshots use the curated fallback", () => {
  assertEqual(wizard.catalogState.fallbackUsed, false, "checked-in snapshot should load");
  assertEqual(wizard.loadCatalog(null).fallbackUsed, true, "missing snapshot should use fallback");
  assertEqual(
    wizard.loadCatalog({ schemaVersion: 1, regions: [], models: [] }).fallbackUsed,
    true,
    "malformed snapshot should use fallback"
  );
  const partiallyMalformed = structuredClone(context.window.EZDEPLOY_CATALOG_SNAPSHOT);
  partiallyMalformed.models.push(null);
  assertEqual(
    wizard.loadCatalog(partiallyMalformed).fallbackUsed,
    true,
    "partially malformed snapshot should use fallback"
  );
  const duplicateKey = structuredClone(context.window.EZDEPLOY_CATALOG_SNAPSHOT);
  duplicateKey.models.push(structuredClone(duplicateKey.models[0]));
  assertEqual(
    wizard.loadCatalog(duplicateKey).fallbackUsed,
    true,
    "duplicate catalog keys should use fallback"
  );
  assert(/catalogState\.fallbackUsed[\s\S]*curated fallback/i.test(appScript), "fallback warning is not prominent in application logic");
});

test("Preview models stay hidden until explicit opt-in", () => {
  const stateWithPreview = {
    models: [
      {
        key: "ga",
        model: "claude-sonnet-5",
        version: "2",
        deployment: "ga",
        regions: ["eastus2"],
        regionMetadata: {
          eastus2: {
            lifecycle: "GA",
            isDefaultVersion: true,
            capabilities: { hostedOn: "azure" },
          },
        },
      },
      {
        key: "preview",
        model: "claude-sonnet-6",
        version: "1",
        deployment: "preview",
        regions: ["eastus2"],
        regionMetadata: {
          eastus2: {
            lifecycle: "Preview",
            isDefaultVersion: false,
            capabilities: { hostedOn: "anthropic" },
          },
        },
      },
    ],
  };
  assertEqual(
    wizard.catalogModelsForRegion(stateWithPreview, "eastus2", false).map((model) => model.key).join(","),
    "ga",
    "Preview model was visible without opt-in"
  );
  assertEqual(
    wizard.catalogModelsForRegion(stateWithPreview, "eastus2", true).map((model) => model.key).join(","),
    "ga,preview",
    "Preview model was not visible after opt-in"
  );
  const preview = wizard.catalogModelsForRegion(stateWithPreview, "eastus2", true)[1];
  assertEqual(preview.azureDefault, false, "regional Azure Default value was flattened");
  assertEqual(preview.hosting, "Anthropic infrastructure", "regional hosting value was flattened");
});

test("catalog region filtering follows the Azure target", () => {
  const regionalState = {
    models: [
      {
        key: "east",
        model: "claude-sonnet-5",
        version: "2",
        deployment: "east",
        regions: ["eastus2"],
        regionMetadata: {
          eastus2: {
            lifecycle: "GA",
            isDefaultVersion: true,
            capabilities: { hostedOn: "azure" },
          },
        },
      },
      {
        key: "sweden",
        model: "claude-sonnet-5",
        version: "2",
        deployment: "sweden",
        regions: ["swedencentral"],
        regionMetadata: {
          swedencentral: {
            lifecycle: "GA",
            isDefaultVersion: true,
            capabilities: { hostedOn: "azure" },
          },
        },
      },
    ],
  };
  assertEqual(wizard.catalogModelsForRegion(regionalState, "eastus2").map((model) => model.key).join(","), "east", "eastus2 catalog");
  assertEqual(wizard.catalogModelsForRegion(regionalState, "swedencentral").map((model) => model.key).join(","), "sweden", "swedencentral catalog");
});

test("snapshot age over seven days warns but does not invalidate the catalog", () => {
  const generated = context.window.EZDEPLOY_CATALOG_SNAPSHOT;
  const generatedTime = Date.parse(generated.generatedAt);
  const current = wizard.loadCatalog(generated, context.window.EZDEPLOY_CATALOG_FALLBACK, context.window.EZDEPLOY_CATALOG_OVERLAY, generatedTime + 7 * 86400000);
  const stale = wizard.loadCatalog(generated, context.window.EZDEPLOY_CATALOG_FALLBACK, context.window.EZDEPLOY_CATALOG_OVERLAY, generatedTime + 7 * 86400000 + 1);
  assertEqual(current.stale, false, "exactly seven-day-old snapshot should remain current");
  assertEqual(stale.stale, true, "snapshot older than seven days should be stale");
  assert(stale.models.length > 0, "stale snapshot should remain usable");
  assert(/catalogState\.stale[\s\S]*older than seven days/i.test(appScript), "stale warning is not rendered");
});

test("missing hosting metadata is not guessed", () => {
  state.fields = {};
  state.selectedKeys = [];
  state.defaults = {};
  wizard.renderModelCards();
  assert(
    field("modelList").innerHTML.includes("hosting unavailable—verify during live preflight"),
    "missing hosting metadata warning is absent"
  );
});

test("stale catalog reporting is an anonymous prefilled issue link", () => {
  resetValidState();
  const issueUrl = new URL(wizard.staleIssueUrl());
  assertEqual(issueUrl.origin, "https://github.com", "issue link origin");
  assert(issueUrl.pathname.endsWith("/issues/new"), "issue link path");
  assert(issueUrl.searchParams.get("title").includes("eastus2"), "issue title lacks selected region");
  assert(!/workflow_dispatch|actions\/workflows/i.test(issueUrl.href), "wizard exposes a workflow trigger");
  assert(!/msal|azure\/login/i.test(html), "wizard contains browser Azure authentication");
});

test("wizard never generates noninteractive approval", () => {
  resetValidState();
  assert(!wizard.command(false).includes("--yes"), "deployment command contains --yes");
  assert(!wizard.command(true).includes("--yes"), "dry-run command contains --yes");
  assert(!wizard.launcher(false).includes("--yes"), "deployment launcher contains --yes");
  assert(!wizard.launcher(true).includes("--yes"), "dry-run launcher contains --yes");
});

test("optional RBAC is omitted when not selected", () => {
  resetValidState();
  const command = wizard.command(false);
  assert(!command.includes("--assign-current-user"), "RBAC argument should be optional");
});

test("dry-run launcher is valid Bash with dry-run and correct shebang ordering", () => {
  resetValidState();
  const launcher = wizard.launcher(true);
  assert(launcher.startsWith("#!/usr/bin/env bash\nset -Eeuo pipefail\n"), "launcher shebang or strict mode ordering is invalid");
  assert(launcher.includes('engine="${here}/scripts/ezdeploy-engine.sh"'), "launcher does not target the repository engine path");
  assert(launcher.includes('engine="${here}/ezdeploy-engine.sh"'), "launcher does not support a same-folder uploaded engine");
  assert(/bash \\\n  "\$\{engine\}"/.test(launcher), "launcher does not execute the resolved engine");
  assert(launcher.includes("--dry-run"), "dry-run launcher is missing --dry-run");
  assert(!launcher.includes("--yes"), "dry-run launcher unexpectedly contains --yes");
});

test("mobile layout wraps action controls and long values", () => {
  assert(/\.actions\{[^}]*flex-wrap:wrap/.test(html), "actions do not wrap");
  assert(/\.right\{[^}]*flex-wrap:wrap/.test(html), "right action group does not wrap");
  assert(/@media\(max-width:800px\)[\s\S]*\.right\{width:100%\}[\s\S]*\.right \.btn\{flex:1 1 180px\}/.test(html), "mobile buttons do not wrap to available width");
  assert(/overflow-wrap:anywhere/.test(html), "long target or deployment values are not wrap-safe");
});

test("wizard discloses unofficial status, trademarks, and live Azure facts", () => {
  assert(/unofficial project/i.test(html), "unofficial-project disclaimer is missing");
  assert(/not endorsed by or affiliated with Microsoft or Anthropic/i.test(html), "Microsoft-Anthropic affiliation disclaimer is missing");
  assert(/trademarks of their respective owners/i.test(html), "trademark disclaimer is missing");
  for (const fact of ["availability", "pricing", "quota", "hosting boundaries", "terms"]) {
    assert(new RegExp(`\\b${fact}\\b`, "i").test(html), `live Azure ${fact} warning is missing`);
  }
  assert(/live Azure facts that you must review before deployment/i.test(html), "live Azure review warning is missing");
});

test("wizard source contains no obvious credentials or inherited GUIDs", () => {
  assert(!/(api[_-]?key|client[_-]?secret|BEGIN (RSA|OPENSSH|PRIVATE) KEY)/i.test(html), "credential-like content found");
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(html), "GUID-like inherited target found");
});

console.log(`Wizard tests: ${passed} passed, ${failed} failed.`);
process.exitCode = failed === 0 ? 0 : 1;
