"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const schemaRoot = path.join(repositoryRoot, "packages", "schemas", "v1");
const exampleRoot = path.join(repositoryRoot, "packages", "examples", "v1");
const policyRoot = path.join(repositoryRoot, "policies", "apim-governed", "v1");

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolvePointer(document, pointer) {
  return pointer
    .replace(/^#\//, "")
    .split("/")
    .reduce(
      (value, segment) => value[segment.replaceAll("~1", "/").replaceAll("~0", "~")],
      document
    );
}

function resolveReference(reference, currentSchemaPath) {
  const [relativePath, pointer = ""] = reference.split("#");
  const targetPath = relativePath
    ? path.resolve(path.dirname(currentSchemaPath), relativePath)
    : currentSchemaPath;
  const document = readJson(targetPath);
  return {
    schema: pointer ? resolvePointer(document, `#/${pointer.replace(/^\//, "")}`) : document,
    schemaPath: targetPath,
  };
}

function matchesType(value, expectedType) {
  if (expectedType === "null") return value === null;
  if (expectedType === "array") return Array.isArray(value);
  if (expectedType === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === expectedType;
}

function validateFormat(value, format, location) {
  if (value === null) return;
  if (format === "date-time") {
    assert(!Number.isNaN(Date.parse(value)), `${location} must be an ISO date-time`);
  } else if (format === "email") {
    assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), `${location} must be an email`);
  } else if (format === "uri") {
    assert.doesNotThrow(() => new URL(value), `${location} must be a URI`);
  }
}

function validateValue(value, schema, schemaPath, location = "$") {
  if (schema.$ref) {
    const resolved = resolveReference(schema.$ref, schemaPath);
    validateValue(value, resolved.schema, resolved.schemaPath, location);
    return;
  }

  if (schema.const !== undefined) {
    assert.deepEqual(value, schema.const, `${location} must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum) {
    assert(schema.enum.includes(value), `${location} must be one of ${schema.enum.join(", ")}`);
  }
  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert(
      expectedTypes.some((expectedType) => matchesType(value, expectedType)),
      `${location} must have type ${expectedTypes.join(" or ")}`
    );
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined) {
      assert(value.length >= schema.minLength, `${location} is shorter than ${schema.minLength}`);
    }
    if (schema.pattern) {
      assert(new RegExp(schema.pattern).test(value), `${location} does not match ${schema.pattern}`);
    }
    if (schema.format) validateFormat(value, schema.format, location);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) {
      assert(value.length >= schema.minItems, `${location} has too few items`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      assert.equal(new Set(serialized).size, serialized.length, `${location} has duplicate items`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateValue(item, schema.items, schemaPath, `${location}[${index}]`));
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const requiredProperty of schema.required || []) {
      assert(Object.hasOwn(value, requiredProperty), `${location}.${requiredProperty} is required`);
    }
    const properties = schema.properties || {};
    for (const [propertyName, propertyValue] of Object.entries(value)) {
      if (properties[propertyName]) {
        validateValue(
          propertyValue,
          properties[propertyName],
          schemaPath,
          `${location}.${propertyName}`
        );
      } else if (schema.additionalProperties === false) {
        assert.fail(`${location}.${propertyName} is not allowed`);
      }
    }
  }
}

const packageContracts = [
  ["mcp-server", "mcp-server.schema.json", "mcp-server.package.json"],
  ["skill", "skill.schema.json", "skill.package.json"],
  ["plugin", "plugin.schema.json", "plugin.package.json"],
];

for (const [packageType, schemaName, exampleName] of packageContracts) {
  test(`${packageType} example satisfies its versioned schema`, () => {
    const schemaPath = path.join(schemaRoot, schemaName);
    const schema = readJson(schemaPath);
    const example = readJson(path.join(exampleRoot, exampleName));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(schema.$id, /\/v1\//);
    validateValue(example, schema, schemaPath);
  });

  test(`${packageType} schema rejects a missing ownership contract`, () => {
    const schemaPath = path.join(schemaRoot, schemaName);
    const schema = readJson(schemaPath);
    const example = readJson(path.join(exampleRoot, exampleName));
    delete example.ownership;
    assert.throws(() => validateValue(example, schema, schemaPath), /ownership is required/);
  });
}

test("package examples are sanitized and contain governance metadata", () => {
  for (const [, , exampleName] of packageContracts) {
    const exampleText = fs.readFileSync(path.join(exampleRoot, exampleName), "utf8");
    const example = JSON.parse(exampleText);
    assert.doesNotMatch(exampleText, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
    assert.doesNotMatch(exampleText, /client[_-]?secret|private[_-]?key|password|bearer\s+[A-Za-z0-9._~-]+/i);
    assert.equal(example.integrity.digest.algorithm, "sha256");
    assert.equal(example.integrity.signing.required, true);
    assert(Object.hasOwn(example, "tenantEligibility"));
    assert(Object.hasOwn(example, "deprecation"));
  }
});

test("APIM policy contract is deployable and secretless", () => {
  const contract = readJson(path.join(policyRoot, "policy-contract.json"));
  assert.equal(contract.profile, "apim-governed");
  assert.equal(contract.activationState, "deployed-by-cli");
  assert.equal(contract.activeByDefault, true);
  assert.equal(contract.securityProperties.embeddedTenantData, false);
  assert.equal(contract.securityProperties.embeddedSecrets, false);
  assert(contract.configuration.namedValues.every((namedValue) => namedValue.secret === false));
});

test("APIM policy placeholders match the parameter contract and sanitized example", () => {
  const policy = fs.readFileSync(path.join(policyRoot, "policy.xml"), "utf8");
  const contract = readJson(path.join(policyRoot, "policy-contract.json"));
  const parameters = readJson(path.join(policyRoot, "policy-parameters.example.json"));
  const policyNames = new Set(
    [...policy.matchAll(/\{\{([a-z0-9-]+)\}\}/g)].map((match) => match[1])
  );
  const contractNames = new Set(
    contract.configuration.namedValues.map((namedValue) => namedValue.name)
  );
  const parameterNames = new Set(Object.keys(parameters));
  assert.deepEqual([...policyNames].sort(), [...contractNames].sort());
  assert.deepEqual([...policyNames].sort(), [...parameterNames].sort());
});

test("APIM policy implements the required governance controls", () => {
  const policy = fs.readFileSync(path.join(policyRoot, "policy.xml"), "utf8");
  assert.doesNotThrow(() => {
    const startTags = [...policy.matchAll(/<([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*?)?>/g)];
    assert(startTags.length > 0, "policy must contain XML elements");
    assert.equal((policy.match(/<policies>/g) || []).length, 1);
    assert.equal((policy.match(/<\/policies>/g) || []).length, 1);
  });
  assert.match(policy, /<validate-jwt[\s\S]*header-name="Authorization"/);
  assert.match(policy, /login\.microsoftonline\.com\/\{\{entra-tenant-id\}\}/);
  assert.match(policy, /sts\.windows\.net\/\{\{entra-tenant-id\}\}\//);
  assert.match(policy, /<audience>\{\{entra-audience\}\}<\/audience>/);
  assert.match(policy, /<claim name="tid"[\s\S]*\{\{entra-tenant-id\}\}/);
  assert.match(policy, /allowed-principal-ids/);
  assert.match(policy, /principal_not_authorized/);
  assert.match(policy, /x-correlation-id/);
  assert.match(policy, /context\.RequestId/);
  assert.match(policy, /rate-limit-by-key[\s\S]*\{\{rate-limit-calls\}\}/);
  assert.match(policy, /counter-key="@\(\(string\)context\.Variables\[&quot;principalId&quot;\]\)"/);
  assert.match(policy, /approved-model-deployment-routes/);
  assert.match(policy, /body\["model"\] = \(string\)context\.Variables\["approvedDeployment"\]/);
  assert.match(policy, /<set-backend-service backend-id="\{\{foundry-backend-id\}\}" \/>/);
  assert.match(
    policy,
    /<forward-request timeout="\{\{backend-timeout-seconds\}\}" buffer-response="false" \/>/
  );
  assert.match(policy, /<authentication-managed-identity[\s\S]*ignore-error="false"/);
  assert.match(policy, /resource="\{\{foundry-managed-identity-resource\}\}"/);
  assert.doesNotMatch(policy, /client-id=/);
  assert.match(policy, /<trace source="apim-governed" severity="information">/);
  assert.match(policy, /x-governance-policy-version/);

  for (const header of [
    "Authorization",
    "Ocp-Apim-Subscription-Key",
    "api-key",
    "x-api-key",
    "Cookie",
    "Set-Cookie",
    "x-ms-client-principal",
    "x-ms-token-aad-id-token",
    "x-forwarded-client-cert",
  ]) {
    assert.match(
      policy,
      new RegExp(`<set-header name="${header}" exists-action="delete"`),
      `${header} must be removed at the applicable boundary`
    );
  }
});

test("APIM policy prohibits embedded secrets, tenant IDs, and unsafe rate-limit fallbacks", () => {
  const policy = fs.readFileSync(path.join(policyRoot, "policy.xml"), "utf8");
  assert.doesNotMatch(policy, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
  assert.doesNotMatch(policy, /client[_-]?secret|private[_-]?key|password\s*=|Bearer\s+[A-Za-z0-9._~-]{20,}/i);
  assert.doesNotMatch(policy, /context\.Request\.IpAddress|context\.Subscription|anonymous/i);
  assert.doesNotMatch(policy, /authentication-managed-identity[\s\S]*ignore-error="true"/);
  assert.doesNotMatch(policy, /<set-header name="(?:api-key|x-api-key|Ocp-Apim-Subscription-Key)" exists-action="(?:append|override)"/i);
});

test("policy parameter example remains sanitized", () => {
  const parametersText = fs.readFileSync(
    path.join(policyRoot, "policy-parameters.example.json"),
    "utf8"
  );
  const parameters = JSON.parse(parametersText);
  assert.match(parameters["entra-tenant-id"], /^<configure-/);
  assert.match(parameters["allowed-principal-ids"], /^<configure-/);
  assert.doesNotMatch(parametersText, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
  assert.doesNotMatch(parametersText, /client[_-]?secret|private[_-]?key|password/i);
});

console.log(`Governance regression tests: ${passed} passed, ${failed} failed.`);
process.exitCode = failed === 0 ? 0 : 1;
