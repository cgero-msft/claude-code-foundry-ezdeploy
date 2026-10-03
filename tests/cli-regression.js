"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cliPath = path.resolve(
  process.argv[2] || path.resolve(__dirname, "..", "scripts", "ezdeploy.js")
);
const repositoryRoot = path.resolve(path.dirname(cliPath), "..");
const {
  azureCli,
  azureCliArguments,
  bicepParameterValues,
  deterministicResourceNames,
  deploymentOwnershipHash,
  sanitize,
} = require(cliPath);
const sourceManifest = path.join(
  repositoryRoot,
  "examples",
  "deployment-manifest-direct.v1.json"
);
const fixture = JSON.parse(fs.readFileSync(sourceManifest, "utf8"));
const apimFixture = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      "examples",
      "deployment-manifest-apim-governed.v1.json"
    ),
    "utf8"
  )
);
const fixtureNames = deterministicResourceNames(fixture);
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ezdeploy-cli-regression-"));
const binDir = path.join(testRoot, "bin");
const invocationLog = path.join(testRoot, "invocations.jsonl");
fs.mkdirSync(binDir);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}: ${error.stack || error.message}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function executable(name, source) {
  const extension = process.platform === "win32" ? ".cmd" : "";
  const target = path.join(binDir, `${name}${extension}`);
  if (process.platform === "win32") {
    fs.writeFileSync(
      target,
      `@echo off\r\n"${process.execPath}" "${source}" %*\r\n`,
      "utf8"
    );
  } else {
    fs.writeFileSync(target, `#!/bin/sh\nexec "${process.execPath}" "${source}" "$@"\n`, {
      encoding: "utf8",
      mode: 0o755,
    });
  }
  return target;
}

const fakeAzSource = path.join(testRoot, "fake-az.js");
fs.writeFileSync(
  fakeAzSource,
  `"use strict";
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_INVOCATION_LOG, JSON.stringify({tool:"az",args}) + "\\n");
if (args[0] === "account" && args[1] === "show") {
  process.stdout.write(JSON.stringify({
    id: process.env.FAKE_SUBSCRIPTION,
    tenantId: process.env.FAKE_TENANT,
    name: "Fake Subscription"
  }));
  process.exit(0);
}
if (args[0] === "group" && args[1] === "show") {
  if (process.env.FAKE_RG_EXISTS === "1" || process.env.FAKE_MANAGED_RESOURCES === "1") {
    const managed =
      process.env.FAKE_RG_MANAGED === "1" ||
      process.env.FAKE_MANAGED_RESOURCES === "1";
    process.stdout.write(JSON.stringify({
      id: "/subscriptions/fake/resourceGroups/" + args[args.indexOf("--name") + 1],
      location: process.env.FAKE_RG_LOCATION || "eastus2",
      tags: managed ? {
        managedBy: "bicep",
        deploymentProfile: process.env.FAKE_PROFILE,
        customer: process.env.FAKE_CUSTOMER,
        environment: process.env.FAKE_ENVIRONMENT,
        ownershipHash: process.env.FAKE_OWNERSHIP_HASH
      } : {owner:"unrelated"}
    }));
    process.exit(0);
  }
  process.stderr.write("ResourceGroupNotFound: Resource group was not found\\n");
  process.exit(3);
}
if (args[0] === "resource" && args[1] === "show") {
  const resourceId = args[args.indexOf("--ids") + 1];
  const isApim = resourceId.includes("/Microsoft.ApiManagement/service/");
  const isFoundryAccount =
    resourceId.includes("/Microsoft.CognitiveServices/accounts/") &&
    !resourceId.includes("/projects/");
  const exists =
    process.env.FAKE_MANAGED_RESOURCES === "1" ||
    (process.env.FAKE_UNRELATED_RESOURCE_FRAGMENT &&
      resourceId.includes(process.env.FAKE_UNRELATED_RESOURCE_FRAGMENT)) ||
    (isApim && process.env.FAKE_APIM_EXISTS === "1") ||
    (isFoundryAccount && process.env.FAKE_FOUNDRY_EXISTS === "1");
  if (exists) {
    const tags =
      process.env.FAKE_MANAGED_RESOURCES === "1"
        ? {
            managedBy: "bicep",
            deploymentProfile: isApim ? "apim-governed" : process.env.FAKE_PROFILE,
            customer: process.env.FAKE_CUSTOMER,
            environment: process.env.FAKE_ENVIRONMENT,
            ownershipHash: process.env.FAKE_OWNERSHIP_HASH
          }
        : {managedBy: "someone-else"};
    if (isFoundryAccount) {
      const document = JSON.parse(JSON.stringify({id: resourceId, tags}));
      document.kind = "AIServices";
      document.location = process.env.FAKE_RG_LOCATION || "eastus2";
      document.properties = {
        publicNetworkAccess: process.env.FAKE_FOUNDRY_PUBLIC_ACCESS || "Enabled",
        networkAcls: {
          defaultAction: process.env.FAKE_FOUNDRY_DEFAULT_ACTION || "Allow"
        }
      };
      process.stdout.write(JSON.stringify(document));
    } else {
      process.stdout.write(JSON.stringify({id: resourceId, tags}));
    }
    process.exit(0);
  }
  process.stderr.write("ResourceNotFound: Azure resource was not found\\n");
  process.exit(3);
}
if (args[0] === "rest") {
  const bodyArg = args[args.indexOf("--body") + 1];
  if (bodyArg && bodyArg.startsWith("@")) {
    const bodyPath = bodyArg.slice(1);
    fs.appendFileSync(process.env.FAKE_INVOCATION_LOG, JSON.stringify({
      tool:"arm-body",
      path:bodyPath,
      exists:true,
      contents:fs.readFileSync(bodyPath, "utf8")
    }) + "\\n");
  }
  if (
    process.env.FAKE_REST_FAIL === "1" &&
    args[args.indexOf("--url") + 1].includes("/policies/policy")
  ) {
    process.stderr.write("simulated APIM policy failure\\n");
    process.exit(31);
  }
  process.exit(0);
}
const operation = args.includes("what-if") ? "what-if" : "create";
const parameterArg = args[args.indexOf("--parameters") + 1];
if (parameterArg && parameterArg.startsWith("@")) {
  const parameterPath = parameterArg.slice(1);
  const contents = fs.readFileSync(parameterPath, "utf8");
  fs.appendFileSync(process.env.FAKE_INVOCATION_LOG, JSON.stringify({
    tool:"parameters",
    path:parameterPath,
    exists:true,
    contents
  }) + "\\n");
}
if (process.env.FAKE_BICEP_FAIL === "1") {
  process.stderr.write("simulated bicep failure\\n");
  process.exit(23);
}
if (operation === "what-if") {
  process.stdout.write(JSON.stringify({status:"Succeeded",changes:[{resource:"fake"}]}));
} else {
  process.stdout.write(JSON.stringify({properties:{outputs:{
    foundryAccountName:{type:"String",value:"contoso-claude-dev"},
    foundryAnthropicEndpoint:{type:"String",value:"https://contoso-claude-dev.services.ai.azure.com/anthropic"},
    apiManagementId:{type:"String",value:"/subscriptions/44444444-4444-4444-8444-444444444444/resourceGroups/rg-fabrikam-claude-prod/providers/Microsoft.ApiManagement/service/apim-fabrikam-claude-prod"},
    apiManagementGatewayUrl:{type:"String",value:"https://apim-fabrikam-claude-prod.azure-api.net"},
    applicationInsightsConnectionString:{type:"String",value:"SUPER_SECRET_VALUE"}
  }}}));
}
`,
  "utf8"
);

const fakeBashSource = path.join(testRoot, "fake-bash.js");
fs.writeFileSync(
  fakeBashSource,
  `"use strict";
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_INVOCATION_LOG, JSON.stringify({tool:"bash",args}) + "\\n");
if (
  process.env.FAKE_ENGINE_FAIL === "1" ||
  (process.env.FAKE_ENGINE_FAIL === "deploy" && !args.includes("--dry-run"))
) process.exit(29);
const outputIndex = args.indexOf("--output-dir");
if (outputIndex >= 0) {
  fs.mkdirSync(args[outputIndex + 1], {recursive:true});
  fs.writeFileSync(args[outputIndex + 1] + require("node:path").sep + "deployment-report.json", "{}\\n");
}
`,
  "utf8"
);

const fakeAzBatch = executable("az", fakeAzSource);
const fakeAz = process.execPath;
const fakeBash = executable("bash", fakeBashSource);

function writeManifest(name, mutate = () => {}) {
  const manifest = clone(fixture);
  mutate(manifest);
  const target = path.join(testRoot, `${name}.json`);
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, target };
}

function writeApimManifest(name, mutate = () => {}) {
  const manifest = clone(apimFixture);
  mutate(manifest);
  const target = path.join(testRoot, `${name}.json`);
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, target };
}

function resetLog() {
  fs.writeFileSync(invocationLog, "", "utf8");
}

function invocations() {
  const text = fs.readFileSync(invocationLog, "utf8").trim();
  return text ? text.split(/\r?\n/).map(JSON.parse) : [];
}

function runCli(command, manifestPath, overrides = {}) {
  resetLog();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const outputDir =
    overrides.outputDir ||
    path.join(testRoot, `output-${command}-${Date.now()}-${Math.random()}`);
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
    PATHEXT:
      process.platform === "win32"
        ? `.CMD;.EXE;.BAT;${process.env.PATHEXT || ""}`
        : process.env.PATHEXT,
    EZDEPLOY_BASH: fakeBash,
    EZDEPLOY_AZ: fakeAz,
    EZDEPLOY_AZ_ARGS_JSON: JSON.stringify([fakeAzSource]),
    FAKE_INVOCATION_LOG: invocationLog,
    FAKE_SUBSCRIPTION: fixture.azure.subscriptionId,
    FAKE_TENANT: fixture.azure.tenantId,
    FAKE_PROFILE: manifest.architecture.profile,
    FAKE_CUSTOMER: manifest.customer.id,
    FAKE_ENVIRONMENT: manifest.environment.name,
    FAKE_RG_LOCATION: manifest.azure.location,
    FAKE_OWNERSHIP_HASH: deploymentOwnershipHash(manifest),
    EZDEPLOY_ALLOW_NONINTERACTIVE_ACCEPT: "1",
    ...overrides,
  };
  const result = spawnSync(
    process.execPath,
    [cliPath, command, manifestPath, "--output-dir", outputDir],
    { encoding: "utf8", env, input: overrides.input ?? "ACCEPT\n" }
  );
  return { ...result, command, outputDir, calls: invocations() };
}

function reportFiles(run) {
  if (!fs.existsSync(run.outputDir)) return [];
  return fs
    .readdirSync(run.outputDir)
    .filter((name) => name.startsWith(`orchestration-${run.command}-`) && name.endsWith(".json"))
    .map((name) => path.join(run.outputDir, name));
}

function reportFor(run) {
  const files = reportFiles(run);
  assert.equal(files.length, 1, `expected one report, found ${files.length}`);
  return JSON.parse(fs.readFileSync(files[0], "utf8"));
}

test("validate accepts a valid manifest without invoking tools", () => {
  const { target } = writeManifest("validate");
  const result = runCli("validate", target);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^VALID:/);
  assert.deepEqual(result.calls, []);
});

test("resolves the native Azure CLI command", () => {
  const command = azureCli();
  if (process.platform === "win32") {
    assert.match(command, /\.(?:cmd|exe|bat)$/i);
    if (/python\.exe$/i.test(command)) {
      assert.deepEqual(azureCliArguments(["account"]).slice(0, 3), [
        "-IBm",
        "azure.cli",
        "account",
      ]);
    }
  } else {
    assert.equal(command, "az");
  }
});

test("rejects Windows Azure CLI batch overrides instead of using shell concatenation", () => {
  if (process.platform !== "win32") return;
  const { target } = writeManifest("unsafe-az-wrapper");
  const result = runCli("plan", target, {
    EZDEPLOY_AZ: fakeAzBatch,
    EZDEPLOY_AZ_ARGS_JSON: "",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must point to an executable entry point/);
  assert.deepEqual(result.calls, []);
});

test("sanitizes Azure connection strings by value", () => {
  assert.equal(
    sanitize(
      "DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=TOPSECRET;EndpointSuffix=core.windows.net"
    ),
    "[REDACTED]"
  );
});

test("validate rejects proposed unsupported profiles clearly", () => {
  const { target } = writeManifest("unsupported", (manifest) => {
    manifest.architecture = {
      profile: "private-link-with-firewall",
      status: "proposed",
      deployable: false,
      proposal: {
        owner: "Architecture",
        trackingReference: "ARCH-1234",
      },
    };
  });
  const result = runCli("validate", target);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported profile "private-link-with-firewall"/);
  assert.deepEqual(result.calls, []);
});

test("render emits a sanitized non-mutating exact plan", () => {
  const { target } = writeManifest("render");
  const result = runCli("render", target);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.authenticatedAzureContextRequired, false);
  assert.equal(plan.engine.dryRun, true);
  assert.equal(plan.engine.implicitYes, false);
  assert.match(plan.engine.command, /--dry-run/);
  assert.match(plan.engine.command, /claude-sonnet-5:2:claude-sonnet-5:10/);
  assert.match(plan.engine.command, /--default-sonnet-model claude-sonnet-5/);
  assert.doesNotMatch(plan.engine.command, /--yes/);
  assert.deepEqual(result.calls, []);
  assert.deepEqual(reportFiles(result), []);
});

test("generated Key Vault name preserves a deterministic suffix and Azure naming rules", () => {
  const names = deterministicResourceNames(fixture);
  const parameters = bicepParameterValues(fixture);
  assert.match(names.keyVaultName, /^[a-z][a-z0-9]{2,23}$/);
  assert(names.keyVaultName.endsWith(names.resourceSuffix));
  assert.equal(parameters.keyVaultName, names.keyVaultName);
  assert.equal(parameters.resourceSuffix, names.resourceSuffix);
});

test("plan runs authenticated Bicep what-if then engine dry-run", () => {
  const { target } = writeManifest("plan");
  const result = runCli("plan", target);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.calls
      .filter(
        (call) =>
          call.tool !== "parameters" &&
          !(call.tool === "az" && call.args[0] === "group") &&
          !(call.tool === "az" && call.args[0] === "resource")
      )
      .map((call) => call.tool),
    ["az", "az", "bash"]
  );
  const bicep = result.calls.find((call) => call.tool === "az" && call.args.includes("what-if"));
  const bash = result.calls.find((call) => call.tool === "bash");
  assert(bicep);
  assert.deepEqual(bicep.args.slice(0, 3), ["deployment", "sub", "what-if"]);
  assert(bash.args.includes("--dry-run"));
  assert(!bash.args.includes("--yes"));
});

test("deploy runs preflight, exact ACCEPT, Bicep create, then approved engine deployment", () => {
  const { target } = writeManifest("deploy");
  const result = runCli("deploy", target);
  assert.equal(result.status, 0, result.stderr);
  const bashCalls = result.calls.filter((call) => call.tool === "bash");
  const bicep = result.calls.find((call) => call.tool === "az" && call.args.includes("create"));
  assert(bicep);
  assert.equal(bashCalls.length, 2);
  assert(bashCalls[0].args.includes("--dry-run"));
  assert(!bashCalls[0].args.includes("--yes"));
  assert(!bashCalls[1].args.includes("--dry-run"));
  assert(bashCalls[1].args.includes("--yes"));
  const orderedTools = result.calls
    .filter(
      (call) =>
        call.tool !== "parameters" &&
        !(call.tool === "az" && call.args[0] === "group") &&
        !(call.tool === "az" && call.args[0] === "resource")
    )
    .map((call) => `${call.tool}:${call.args.includes("what-if") ? "what-if" : call.args.includes("create") ? "create" : call.args.includes("--dry-run") ? "dry-run" : "other"}`);
  assert.deepEqual(orderedTools, [
    "az:other",
    "bash:dry-run",
    "az:create",
    "bash:other",
  ]);
});

test("deploy rejects anything other than exact ACCEPT before mutation", () => {
  const { target } = writeManifest("deploy-rejected");
  const result = runCli("deploy", target, { input: "yes\n" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Deployment canceled/);
  assert.equal(
    result.calls.filter((call) => call.tool === "az" && call.args.includes("create")).length,
    0
  );
});

test("translates exact models, defaults, tenant, and reuse authentication", () => {
  const { target } = writeManifest("translation", (manifest) => {
    manifest.azure.foundry.reuseExisting = true;
  });
  const result = runCli("plan", target, { FAKE_FOUNDRY_EXISTS: "1" });
  assert.equal(result.status, 0, result.stderr);
  const args = result.calls.find(
    (call) => call.tool === "bash" && call.args.includes("--dry-run")
  ).args;
  assert.deepEqual(
    args.filter((argument, index) => args[index - 1] === "--model"),
    [
      "claude-sonnet-5:2:claude-sonnet-5:10",
      "claude-haiku-4-5:2:claude-haiku-4-5:10",
    ]
  );
  assert(args.includes("--disable-local-auth-on-reuse"));
  assert.equal(args[args.indexOf("--tenant") + 1], fixture.azure.tenantId);
  assert.equal(args[args.indexOf("--sku") + 1], "GlobalStandard");
});

test("rejects private-only reused Foundry accounts before mutation", () => {
  const { target } = writeManifest("private-reused-foundry", (manifest) => {
    manifest.azure.foundry.reuseExisting = true;
  });
  for (const overrides of [
    {
      FAKE_FOUNDRY_EXISTS: "1",
      FAKE_FOUNDRY_PUBLIC_ACCESS: "Disabled",
    },
    {
      FAKE_FOUNDRY_EXISTS: "1",
      FAKE_FOUNDRY_DEFAULT_ACTION: "Deny",
    },
  ]) {
    const result = runCli("plan", target, overrides);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not compatible with the version 1 public endpoint profile/);
    assert.equal(result.calls.filter((call) => call.tool === "bash").length, 0);
  }
});

test("rejects tenant and subscription mismatches before Bicep", () => {
  const { target } = writeManifest("mismatch");
  const tenant = runCli("plan", target, {
    FAKE_TENANT: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.notEqual(tenant.status, 0);
  assert.match(tenant.stderr, /Azure tenant mismatch/);
  assert.equal(tenant.calls.filter((call) => call.tool === "az").length, 1);

  const subscription = runCli("plan", target, {
    FAKE_SUBSCRIPTION: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  assert.notEqual(subscription.status, 0);
  assert.match(subscription.stderr, /Azure subscription mismatch/);
  assert.equal(subscription.calls.filter((call) => call.tool === "az").length, 1);
});

test("surfaces Bicep failure and does not invoke the engine", () => {
  const { target } = writeManifest("bicep-failure");
  const result = runCli("deploy", target, { FAKE_BICEP_FAIL: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Bicep deployment failed/);
  assert.equal(result.calls.filter((call) => call.tool === "bash").length, 1);
  assert(result.calls.find((call) => call.tool === "bash").args.includes("--dry-run"));
  assert.equal(reportFor(result).bicep.status, "failed");
});

test("surfaces engine failure in the orchestration report", () => {
  const { target } = writeManifest("engine-failure");
  const result = runCli("deploy", target, { FAKE_ENGINE_FAIL: "deploy" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Deployment engine failed/);
  const report = reportFor(result);
  assert.equal(report.bicep.status, "succeeded");
  assert.equal(report.engine.status, "failed");
  assert.equal(report.engine.exitCode, 29);
});

test("cleans temporary parameter files after success and failure", () => {
  const { target } = writeManifest("cleanup");
  for (const overrides of [{}, { FAKE_BICEP_FAIL: "1" }]) {
    const result = runCli("plan", target, overrides);
    const parameterCall = result.calls.find((call) => call.tool === "parameters");
    assert(parameterCall);
    assert.equal(fs.existsSync(parameterCall.path), false);
  }
});

test("preserves an unrelated existing resource group in the requested location", () => {
  const { target } = writeManifest("existing-rg");
  const result = runCli("plan", target, {
    FAKE_RG_EXISTS: "1",
    FAKE_RG_LOCATION: fixture.azure.location,
  });
  assert.equal(result.status, 0, result.stderr);
  const parameters = JSON.parse(
    result.calls.find((call) => call.tool === "parameters").contents
  );
  assert.equal(parameters.parameters.manageResourceGroup.value, false);
});

test("continues managing an ownership-tagged existing resource group", () => {
  const { target } = writeManifest("managed-rg");
  const result = runCli("plan", target, {
    FAKE_RG_EXISTS: "1",
    FAKE_RG_MANAGED: "1",
  });
  assert.equal(result.status, 0, result.stderr);
  const parameters = JSON.parse(
    result.calls.find((call) => call.tool === "parameters").contents
  );
  assert.equal(parameters.parameters.manageResourceGroup.value, true);
});

test("rejects an existing resource group in a different location", () => {
  const { target } = writeManifest("wrong-location-rg");
  const result = runCli("plan", target, {
    FAKE_RG_EXISTS: "1",
    FAKE_RG_LOCATION: "westus3",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Resource group .* is in westus3, expected eastus2/);
  assert.equal(
    result.calls.filter((call) => call.tool === "bash" || call.args?.includes("what-if"))
      .length,
    0
  );
});

test("ownership preflight probes every deterministic Bicep resource", () => {
  const { target } = writeApimManifest("ownership-probes");
  const result = runCli("plan", target, {
    FAKE_SUBSCRIPTION: apimFixture.azure.subscriptionId,
    FAKE_TENANT: apimFixture.azure.tenantId,
  });
  assert.equal(result.status, 0, result.stderr);
  const names = deterministicResourceNames(apimFixture);
  const probedIds = result.calls
    .filter((call) => call.tool === "az" && call.args[0] === "resource")
    .map((call) => call.args[call.args.indexOf("--ids") + 1]);
  for (const expected of [
    names.keyVaultName,
    names.logAnalyticsWorkspaceName,
    names.applicationInsightsName,
    names.deploymentIdentityName,
    names.runtimeIdentityName,
    apimFixture.azure.foundry.accountName,
    apimFixture.azure.foundry.projectName,
    apimFixture.azure.apim.serviceName,
  ]) {
    assert(
      probedIds.some((resourceId) => resourceId.includes(expected)),
      `missing ownership probe for ${expected}`
    );
  }
  const lastOwnershipProbe = Math.max(
    ...result.calls
      .map((call, index) =>
        call.tool === "az" && ["group", "resource"].includes(call.args[0])
          ? index
          : -1
      )
  );
  const firstEngineCall = result.calls.findIndex((call) => call.tool === "bash");
  assert(lastOwnershipProbe < firstEngineCall);
});

for (const [label, fragment] of [
  ["Key Vault", `/Microsoft.KeyVault/vaults/${fixtureNames.keyVaultName}`],
  [
    "Log Analytics workspace",
    `/Microsoft.OperationalInsights/workspaces/${fixtureNames.logAnalyticsWorkspaceName}`,
  ],
  [
    "Application Insights component",
    `/Microsoft.Insights/components/${fixtureNames.applicationInsightsName}`,
  ],
  [
    "Deployment identity",
    `/Microsoft.ManagedIdentity/userAssignedIdentities/${fixtureNames.deploymentIdentityName}`,
  ],
  [
    "Runtime identity",
    `/Microsoft.ManagedIdentity/userAssignedIdentities/${fixtureNames.runtimeIdentityName}`,
  ],
  [
    "Foundry account",
    `/Microsoft.CognitiveServices/accounts/${fixture.azure.foundry.accountName}`,
  ],
  [
    "Foundry project",
    `/Microsoft.CognitiveServices/accounts/${fixture.azure.foundry.accountName}/projects/${fixture.azure.foundry.projectName}`,
  ],
]) {
  test(`rejects unrelated existing ${label}`, () => {
    const { target } = writeManifest(`unrelated-${label.replaceAll(" ", "-")}`);
    const result = runCli("plan", target, {
      FAKE_UNRELATED_RESOURCE_FRAGMENT: fragment,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`${label} .* is not owned by this manifest`));
    assert.equal(result.calls.filter((call) => call.tool === "bash").length, 0);
  });
}

test("writes the standardized report without secret values", () => {
  const { target } = writeManifest("report", (manifest) => {
    manifest.secretReferences = [
      {
        name: "example-reference",
        provider: "key-vault",
        reference: "https://example.vault.azure.net/secrets/example",
        purpose: "Regression reference",
      },
    ];
  });
  const result = runCli("deploy", target);
  assert.equal(result.status, 0, result.stderr);
  const reportText = fs.readFileSync(reportFiles(result)[0], "utf8");
  const report = JSON.parse(reportText);
  const reportFile = reportFiles(result)[0];
  assert.equal(report.reportVersion, "1.0");
  assert.match(
    reportFile,
    /orchestration-deploy-[0-9T]+Z-[a-f0-9]{12}-[a-f0-9]{8}\.json$/
  );
  assert.equal(report.path, reportFile);
  assert.match(report.manifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.manifest.schemaVersion, fixture.schemaVersion);
  assert.equal(report.manifest.releaseVersion, fixture.release.version);
  assert.equal(report.manifest.profile, "direct");
  assert.match(report.bicep.deploymentName, /^ezdeploy-/);
  assert.equal(
    report.bicep.outputs.applicationInsightsConnectionString,
    "[REDACTED]"
  );
  assert.equal(report.engine.status, "succeeded");
  assert.equal(report.engine.preflightStatus, "succeeded");
  assert(report.startedAt);
  assert(report.completedAt);
  assert.equal(
    report.references.secretReferences[0].reference,
    "https://example.vault.azure.net/secrets/example"
  );
  assert.doesNotMatch(reportText, /SUPER_SECRET_VALUE/);

  const parameterCall = result.calls.find((call) => call.tool === "parameters");
  assert.doesNotMatch(parameterCall.contents, /example\.vault\.azure\.net|SUPER_SECRET_VALUE/);
});

test("APIM-governed deploy installs a backend, API, operation, named values, and policy", () => {
  const { target } = writeApimManifest("apim-deploy");
  const result = runCli("deploy", target, {
    FAKE_SUBSCRIPTION: apimFixture.azure.subscriptionId,
    FAKE_TENANT: apimFixture.azure.tenantId,
  });
  assert.equal(result.status, 0, result.stderr);
  const restCalls = result.calls.filter(
    (call) => call.tool === "az" && call.args[0] === "rest"
  );
  assert(restCalls.some((call) => call.args.join(" ").includes("/backends/foundry-anthropic")));
  assert(restCalls.some((call) => call.args.join(" ").includes("/apis/claude-foundry")));
  assert(restCalls.some((call) => call.args.join(" ").includes("/operations/anthropic-post")));
  assert(restCalls.some((call) => call.args.join(" ").includes("/policies/policy")));
  assert(
    restCalls.some((call) =>
      call.args.join(" ").includes("/namedValues/approved-model-deployment-routes")
    )
  );
  const policyCall = restCalls.find((call) => call.args.join(" ").includes("/policies/policy"));
  const policyPath = policyCall.args[policyCall.args.indexOf("--body") + 1].slice(1);
  const policyBody = result.calls.find(
    (call) => call.tool === "arm-body" && call.path === policyPath
  ).contents;
  assert.match(policyBody, /authentication-managed-identity/);
  assert.doesNotMatch(policyBody, /client-id=/);
  assert.doesNotMatch(policyBody, /SUPER_SECRET_VALUE/);

  const engineCalls = result.calls.filter((call) => call.tool === "bash");
  assert(
    engineCalls.every((call) =>
      call.args.includes("https://apim-fabrikam-claude-prod.azure-api.net/anthropic")
    )
  );
  const report = reportFor(result);
  assert.equal(report.apim.status, "succeeded");
  assert.equal(
    report.apim.baseUrl,
    "https://apim-fabrikam-claude-prod.azure-api.net/anthropic"
  );
  for (const bodyCall of result.calls.filter((call) => call.tool === "arm-body")) {
    assert.equal(fs.existsSync(bodyCall.path), false);
  }
});

test("APIM-governed deploy rejects an existing service before mutation", () => {
  const { target } = writeApimManifest("apim-existing");
  const result = runCli("deploy", target, {
    FAKE_SUBSCRIPTION: apimFixture.azure.subscriptionId,
    FAKE_TENANT: apimFixture.azure.tenantId,
    FAKE_APIM_EXISTS: "1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists and is not owned by this manifest/);
  assert.equal(result.calls.filter((call) => call.tool === "bash").length, 0);
});

test("APIM configuration failure is reported and temporary ARM bodies are removed", () => {
  const { target } = writeApimManifest("apim-policy-failure");
  const result = runCli("deploy", target, {
    FAKE_SUBSCRIPTION: apimFixture.azure.subscriptionId,
    FAKE_TENANT: apimFixture.azure.tenantId,
    FAKE_REST_FAIL: "1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /APIM governed policy installation failed/);
  assert.equal(reportFor(result).apim.status, "failed");
  for (const bodyCall of result.calls.filter((call) => call.tool === "arm-body")) {
    assert.equal(fs.existsSync(bodyCall.path), false);
  }
});

test("managed resources can be planned and redeployed after a partial run", () => {
  const { target } = writeApimManifest("apim-rerun", (manifest) => {
    manifest.models[0].sku.capacity += 1;
  });
  const result = runCli("deploy", target, {
    FAKE_SUBSCRIPTION: apimFixture.azure.subscriptionId,
    FAKE_TENANT: apimFixture.azure.tenantId,
    FAKE_MANAGED_RESOURCES: "1",
  });
  assert.equal(result.status, 0, result.stderr);
  assert(result.calls.some((call) => call.tool === "bash" && call.args.includes("--yes")));
  assert(
    result.calls.some(
      (call) => call.tool === "az" && call.args[0] === "rest"
    )
  );
});

test("plan reports are atomic and never overwrite prior evidence", () => {
  const { target } = writeManifest("report-history");
  const outputDir = path.join(testRoot, "shared-report-history");
  const first = runCli("plan", target, { outputDir });
  const second = runCli("plan", target, { outputDir });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const reports = reportFiles(second);
  assert.equal(reports.length, 2);
  assert(
    reports.every((file) =>
      /orchestration-plan-[0-9T]+Z-[a-f0-9]{12}-[a-f0-9]{8}\.json$/.test(file)
    )
  );
  assert.equal(
    fs.readdirSync(outputDir).filter((name) => name.endsWith(".tmp")).length,
    0
  );
});

console.log(`CLI regression tests: ${passed} passed, ${failed} failed.`);
process.exitCode = failed === 0 ? 0 : 1;
