"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const validatorPath = path.resolve(
  process.argv[2] || path.resolve(__dirname, "..", "scripts", "validate-manifest.js")
);
const repositoryRoot = path.resolve(path.dirname(validatorPath), "..");
const schemaPath = path.join(repositoryRoot, "schemas", "deployment-manifest-v1.schema.json");
const directPath = path.join(
  repositoryRoot,
  "examples",
  "deployment-manifest-direct.v1.json"
);
const apimPath = path.join(
  repositoryRoot,
  "examples",
  "deployment-manifest-apim-governed.v1.json"
);
const { approvedModelRouteString, validateManifest } = require(validatorPath);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const direct = JSON.parse(fs.readFileSync(directPath, "utf8"));
const apim = JSON.parse(fs.readFileSync(apimPath, "utf8"));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}: ${error.message}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function errorsFor(manifest) {
  return validateManifest(manifest, schema);
}

function assertValid(manifest) {
  assert.deepEqual(errorsFor(manifest), []);
}

function assertInvalid(manifest, pattern) {
  const errors = errorsFor(manifest);
  assert(errors.length > 0, "manifest unexpectedly passed validation");
  assert.match(errors.join("\n"), pattern);
}

test("accepts the sanitized direct manifest", () => {
  assertValid(direct);
});

test("accepts the sanitized APIM-governed manifest", () => {
  assertValid(apim);
});

test("accepts a compatible schema minor version", () => {
  const manifest = clone(direct);
  manifest.schemaVersion = "1.7";
  assertValid(manifest);
});

test("reports missing required fields with field paths", () => {
  const manifest = clone(direct);
  delete manifest.azure.foundry.projectName;
  assertInvalid(manifest, /\$\.azure\.foundry\.projectName: is required/);
});

test("reports invalid field values with field paths", () => {
  const manifest = clone(direct);
  manifest.models[0].sku.capacity = 0;
  assertInvalid(manifest, /\$\.models\[0\]\.sku\.capacity: must be at least 1/);
});

test("rejects embedded secret fields", () => {
  const manifest = clone(direct);
  manifest.packages.mcpServers[0].clientSecret = "do-not-store-this";
  assertInvalid(manifest, /\$\.packages\.mcpServers\[0\]\.clientSecret: secret values are forbidden/);
});

test("rejects secret material hidden in a reference", () => {
  const manifest = clone(apim);
  manifest.secretReferences.push({
    name: "invalid-reference",
    provider: "key-vault",
    reference: "https://kv.example.invalid/secrets/example?sig=embedded-secret",
    purpose: "Regression fixture"
  });
  assertInvalid(manifest, /\$\.secretReferences\[0\]\.reference: appears to contain a secret value/);
});

test("rejects unknown schema major versions", () => {
  const manifest = clone(direct);
  manifest.schemaVersion = "2.0";
  assertInvalid(manifest, /unsupported major version 2/);
});

test("rejects proposed future profiles as not deployable", () => {
  const manifest = clone(direct);
  manifest.architecture = {
    profile: "private-link-with-firewall",
    status: "proposed",
    deployable: false,
    proposal: {
      owner: "Contoso Architecture",
      trackingReference: "ARCH-1234"
    }
  };
  assertInvalid(manifest, /unsupported profile "private-link-with-firewall"/);
});

test("rejects duplicate deployment names case-insensitively", () => {
  const manifest = clone(direct);
  manifest.models[1].deployment.name = "CLAUDE-SONNET-5";
  assertInvalid(manifest, /duplicates \$\.models\[0\]\.deployment\.name/);
});

test("rejects missing family defaults", () => {
  const manifest = clone(direct);
  delete manifest.familyDefaults.haiku;
  assertInvalid(manifest, /\$\.familyDefaults\.haiku: is required/);
});

test("rejects family defaults that name another family", () => {
  const manifest = clone(direct);
  manifest.familyDefaults.sonnet = "claude-haiku-4-5";
  assertInvalid(manifest, /must reference a selected sonnet deployment/);
});

test("rejects defaults for undeployed families", () => {
  const manifest = clone(direct);
  manifest.familyDefaults.opus = "claude-opus-4-8";
  assertInvalid(manifest, /cannot be set without a selected opus model/);
});

test("rejects model and declared family mismatches", () => {
  const manifest = clone(direct);
  manifest.models[0].family = "haiku";
  assertInvalid(manifest, /must be "sonnet" for model "claude-sonnet-5"/);
});

test("rejects APIM-governed private networking until connectivity is implemented", () => {
  const manifest = clone(apim);
  manifest.networking = {
    mode: "private-endpoint",
    publicNetworkAccess: "Disabled",
    privateEndpoint: {
      subnetResourceId: "/subscriptions/44444444-4444-4444-8444-444444444444/resourceGroups/rg-fabrikam-network/providers/Microsoft.Network/virtualNetworks/vnet-fabrikam/subnets/private-endpoints",
      privateDnsZoneResourceId: "/subscriptions/44444444-4444-4444-8444-444444444444/resourceGroups/rg-fabrikam-network/providers/Microsoft.Network/privateDnsZones/privatelink.cognitiveservices.azure.com"
    }
  };
  assertInvalid(manifest, /apim-governed version 1 requires public mode/);
});

test("rejects APIM-governed manifests without an APIM target", () => {
  const manifest = clone(apim);
  delete manifest.azure.apim;
  assertInvalid(manifest, /\$\.azure\.apim: is required for the apim-governed profile/);
});

test("rejects APIM reuse and missing deployable API settings", () => {
  const manifest = clone(apim);
  manifest.azure.apim.reuseExisting = true;
  delete manifest.azure.apim.api.callerAudience;
  assertInvalid(manifest, /\$\.azure\.apim\.reuseExisting: must equal false/);
  assertInvalid(manifest, /\$\.azure\.apim\.api\.callerAudience: is required/);
});

test("APIM API identity is stable", () => {
  const manifest = clone(apim);
  manifest.azure.apim.api.name = "renamed-public-api";
  assertInvalid(manifest, /api\.name: must equal "claude-foundry"/);
});

test("rejects APIM alias collisions across deployment, model, and family namespaces", () => {
  const familyCollision = clone(apim);
  familyCollision.models[1].deployment.name = "sonnet";
  familyCollision.familyDefaults.haiku = "sonnet";
  assertInvalid(familyCollision, /APIM alias namespace collision: "sonnet" maps to both/);

  const modelCollision = clone(apim);
  modelCollision.models[0].deployment.name = "claude-haiku-4-5";
  modelCollision.familyDefaults.sonnet = "claude-haiku-4-5";
  modelCollision.models[1].deployment.name = "haiku-deployment";
  modelCollision.familyDefaults.haiku = "haiku-deployment";
  assertInvalid(
    modelCollision,
    /APIM alias namespace collision: "claude-haiku-4-5" maps to both/
  );
});

test("preserves model aliases when family defaults differ only by case", () => {
  const manifest = clone(apim);
  manifest.models.push({
    ...clone(manifest.models[0]),
    version: "1",
    deployment: {
      ...clone(manifest.models[0].deployment),
      name: "sonnet-secondary",
    },
  });
  manifest.familyDefaults.sonnet = manifest.models[0].deployment.name.toUpperCase();
  assertValid(manifest);
  assert.match(
    approvedModelRouteString(manifest),
    new RegExp(`claude-sonnet-5=${manifest.models[0].deployment.name}(?:;|$)`)
  );
});

test("requires the Claude Code token audience and an explicit principal allowlist", () => {
  const manifest = clone(apim);
  manifest.azure.apim.api.callerAudience = "https://management.azure.com";
  delete manifest.azure.apim.api.allowedPrincipalIds;
  assertInvalid(manifest, /callerAudience: must equal "https:\/\/cognitiveservices\.azure\.com"/);
  assertInvalid(manifest, /\$\.azure\.apim\.api\.allowedPrincipalIds: is required/);
});

test("APIM allowed principals must be declared Entra identities", () => {
  const manifest = clone(apim);
  manifest.azure.apim.api.allowedPrincipalIds = [
    "77777777-7777-4777-8777-777777777777"
  ];
  assertInvalid(manifest, /must reference an entra-principal identity objectId/);
});

test("new Foundry accounts must disable local authentication", () => {
  const manifest = clone(direct);
  manifest.governance.localAuthentication = "preserve-on-reuse";
  assertInvalid(manifest, /new Foundry accounts must set local authentication to "disabled"/);
});

test("secret references use provider-specific non-secret syntax", () => {
  const manifest = clone(direct);
  manifest.secretReferences.push({
    name: "invalid-environment-reference",
    provider: "environment",
    reference:
      "DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=TOPSECRET;EndpointSuffix=core.windows.net",
    purpose: "Regression fixture"
  });
  assertInvalid(manifest, /must be an environment variable name/);
});

test("rejects APIM route maps above the named-value limit", () => {
  const manifest = clone(apim);
  for (let index = 0; index < 40; index += 1) {
    const suffix = `${String(index).padStart(2, "0")}-${"x".repeat(36)}`;
    manifest.models.push({
      family: "sonnet",
      publisher: "Anthropic",
      format: "Anthropic",
      name: `claude-sonnet-${suffix}`,
      version: "1",
      sku: {
        name: "GlobalStandard",
        capacity: 1
      },
      deployment: {
        name: `sonnet-${suffix}`,
        versionUpgradeOption: "NoAutoUpgrade"
      }
    });
  }
  assertInvalid(manifest, /APIM approved route map is \d+ characters; maximum is 4096/);
});

test("rejects unsupported cost alerts and CIDR configuration", () => {
  const manifest = clone(direct);
  manifest.observability.costAlerts = true;
  manifest.networking.allowedCidrs = ["203.0.113.0/24"];
  assertInvalid(manifest, /\$\.observability\.costAlerts: must equal false/);
  assertInvalid(manifest, /\$\.networking\.allowedCidrs: CIDR firewall configuration is not implemented/);
});

test("aligns log retention with the Bicep 30-730 day contract", () => {
  const below = clone(direct);
  below.observability.logRetentionDays = 29;
  assertInvalid(below, /logRetentionDays: must be at least 30/);

  const above = clone(direct);
  above.observability.logRetentionDays = 731;
  assertInvalid(above, /logRetentionDays: must be at most 730/);
});

test("bounds APIM rate-limit renewal and backend timeout values", () => {
  const renewal = clone(apim);
  renewal.azure.apim.api.rateLimitRenewalSeconds = 301;
  assertInvalid(renewal, /rateLimitRenewalSeconds: must be at most 300/);

  const timeout = clone(apim);
  timeout.azure.apim.api.backendTimeoutSeconds = 241;
  assertInvalid(timeout, /backendTimeoutSeconds: must be at most 240/);
});

test("enforces Azure resource-group naming constraints", () => {
  const invalidCharacter = clone(direct);
  invalidCharacter.azure.resourceGroup = "rg/invalid";
  assertInvalid(invalidCharacter, /resourceGroup: must match/);

  const trailingPeriod = clone(direct);
  trailingPeriod.azure.resourceGroup = "rg-invalid.";
  assertInvalid(trailingPeriod, /resourceGroup: must match/);

  const tooLong = clone(direct);
  tooLong.azure.resourceGroup = `rg-${"a".repeat(88)}`;
  assertInvalid(tooLong, /resourceGroup: must contain at most 90 character/);
});

test("rejects impossible calendar dates and accepts leap day", () => {
  const invalidReview = clone(direct);
  invalidReview.lifecycle.reviewAfter = "2026-02-30";
  assertInvalid(invalidReview, /must be a valid ISO-8601 calendar date/);

  const invalidExpiry = clone(apim);
  invalidExpiry.lifecycle.expiresOn = "2027-13-01";
  assertInvalid(invalidExpiry, /must be a valid ISO-8601 calendar date/);

  const leapDay = clone(direct);
  leapDay.lifecycle.reviewAfter = "2028-02-29";
  assertValid(leapDay);
});

test("rejects APIM configuration on the direct profile", () => {
  const manifest = clone(direct);
  manifest.azure.apim = clone(apim.azure.apim);
  assertInvalid(manifest, /\$\.azure\.apim: is not valid for the direct profile/);
});

test("rejects inconsistent private endpoint settings", () => {
  const manifest = clone(direct);
  manifest.networking = {
    mode: "private-endpoint",
    publicNetworkAccess: "Enabled"
  };
  assertInvalid(manifest, /private-endpoint mode requires "Disabled"/);
  assertInvalid(manifest, /privateEndpoint: is required/);
});

test("rejects an Azure location outside governance allowed regions", () => {
  const manifest = clone(direct);
  manifest.governance.allowedRegions = ["swedencentral"];
  assertInvalid(manifest, /must include \$\.azure\.location/);
});

test("rejects package references to undeclared secrets", () => {
  const manifest = clone(direct);
  manifest.packages.mcpServers[0].configurationSecretReferences = ["missing-reference"];
  assertInvalid(manifest, /must reference a declared secret reference/);
});

test("rejects personas that reference undeclared identities", () => {
  const manifest = clone(direct);
  manifest.personas[0].identity = "missing-identity";
  assertInvalid(manifest, /must reference a declared identity/);
});

test("CLI accepts multiple valid manifests", () => {
  const result = spawnSync(process.execPath, [validatorPath, directPath, apimPath], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /VALID: .*deployment-manifest-direct\.v1\.json/);
  assert.match(result.stdout, /VALID: .*deployment-manifest-apim-governed\.v1\.json/);
});

test("CLI returns a failure and useful paths for an invalid manifest", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ezdeploy-manifest-"));
  const manifestPath = path.join(directory, "invalid.json");
  const manifest = clone(direct);
  delete manifest.ownership.costCenter;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const result = spawnSync(process.execPath, [validatorPath, manifestPath], {
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\$\.ownership\.costCenter: is required/);
});

console.log(`Manifest regression tests: ${passed} passed, ${failed} failed.`);
process.exitCode = failed === 0 ? 0 : 1;
