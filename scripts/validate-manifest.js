"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SUPPORTED_SCHEMA_MAJOR = 1;
const SUPPORTED_PROFILES = new Set(["direct", "apim-governed"]);
const FAMILIES = ["sonnet", "haiku", "opus"];
const DEFAULT_SCHEMA_PATH = path.resolve(
  __dirname,
  "..",
  "schemas",
  "deployment-manifest-v1.schema.json"
);

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function resolveReference(rootSchema, reference) {
  if (!reference.startsWith("#/")) {
    throw new Error(`Only local schema references are supported: ${reference}`);
  }
  return reference
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((current, part) => current?.[part], rootSchema);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isIsoCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateSchemaValue(value, schema, fieldPath, rootSchema, errors) {
  if (schema.$ref) {
    const resolved = resolveReference(rootSchema, schema.$ref);
    if (!resolved) {
      errors.push(`${fieldPath}: schema reference ${schema.$ref} could not be resolved`);
      return;
    }
    validateSchemaValue(value, resolved, fieldPath, rootSchema, errors);
    return;
  }

  if (Object.hasOwn(schema, "const") && !sameValue(value, schema.const)) {
    errors.push(`${fieldPath}: must equal ${JSON.stringify(schema.const)}`);
    return;
  }
  if (schema.enum && !schema.enum.some((candidate) => sameValue(value, candidate))) {
    errors.push(`${fieldPath}: must be one of ${schema.enum.map(JSON.stringify).join(", ")}`);
    return;
  }

  if (schema.type) {
    const actualType = valueType(value);
    const typeMatches =
      actualType === schema.type || (schema.type === "number" && actualType === "integer");
    if (!typeMatches) {
      errors.push(`${fieldPath}: must be ${schema.type}, got ${actualType}`);
      return;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${fieldPath}: must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${fieldPath}: must contain at most ${schema.maxLength} character(s)`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push(`${fieldPath}: must match ${schema.pattern}`);
    }
    if (schema.format === "date" && !isIsoCalendarDate(value)) {
      errors.push(`${fieldPath}: must be a valid ISO-8601 calendar date (YYYY-MM-DD)`);
    }
    if (schema.format === "date-time" && !Number.isFinite(Date.parse(value))) {
      errors.push(`${fieldPath}: must be an ISO-8601 date-time`);
    }
  }

  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${fieldPath}: must be at least ${schema.minimum}`);
  }
  if (typeof value === "number" && schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${fieldPath}: must be at most ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${fieldPath}: must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${fieldPath}: must contain at most ${schema.maxItems} item(s)`);
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      value.forEach((item, index) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push(`${fieldPath}[${index}]: duplicates an earlier item`);
        seen.add(key);
      });
    }
    if (schema.items) {
      value.forEach((item, index) =>
        validateSchemaValue(item, schema.items, `${fieldPath}[${index}]`, rootSchema, errors)
      );
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(`${fieldPath}.${required}: is required`);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) {
        validateSchemaValue(
          child,
          schema.properties[key],
          `${fieldPath}.${key}`,
          rootSchema,
          errors
        );
      } else if (schema.additionalProperties === false) {
        errors.push(`${fieldPath}.${key}: is not allowed`);
      }
    }
  }
}

function scanForEmbeddedSecrets(value, fieldPath, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForEmbeddedSecrets(item, `${fieldPath}[${index}]`, errors));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${fieldPath}.${key}`;
    const isReferenceCollection =
      key === "secretReferences" || key === "configurationSecretReferences";
    const forbiddenName =
      !isReferenceCollection &&
      /(password|passphrase|api.?key|access.?token|refresh.?token|client.?secret|connection.?string|private.?key|secret.?value)/i.test(
        key
      );
    if (forbiddenName) {
      errors.push(`${childPath}: secret values are forbidden; use secretReferences`);
    }
    if (
      typeof child === "string" &&
      (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(child) ||
        /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i.test(child) ||
        /(?:^|[?&])(sig|token|key|secret)=/i.test(child) ||
        /^[a-z][a-z0-9+.-]*:\/\/[^/\s:]+:[^@\s]+@/i.test(child))
    ) {
      errors.push(`${childPath}: appears to contain a secret value; use a non-secret reference`);
    }
    scanForEmbeddedSecrets(child, childPath, errors);
  }
}

function approvedModelRoutes(manifest) {
  const routes = new Map();
  const collisions = [];
  const modelsByName = new Map();
  function addRoute(alias, deployment, source) {
    const key = alias.toLowerCase();
    const existing = routes.get(key);
    if (
      existing &&
      existing.deployment.toLowerCase() !== deployment.toLowerCase()
    ) {
      collisions.push(
        `${JSON.stringify(alias)} maps to both ${JSON.stringify(
          existing.deployment
        )} (${existing.source}) and ${JSON.stringify(deployment)} (${source})`
      );
      return;
    }
    if (!existing) routes.set(key, { alias, deployment, source });
  }
  for (const model of manifest.models || []) {
    if (!model?.deployment?.name) continue;
    addRoute(
      model.deployment.name,
      model.deployment.name,
      `deployment ${model.deployment.name}`
    );
    const matches = modelsByName.get(model.name) || [];
    matches.push(model);
    modelsByName.set(model.name, matches);
  }
  for (const [modelName, models] of modelsByName) {
    const selected =
      models.find(
        (model) =>
          manifest.familyDefaults?.[model.family]?.toLowerCase() ===
          model.deployment.name.toLowerCase()
      ) || (models.length === 1 ? models[0] : null);
    if (selected) {
      addRoute(modelName, selected.deployment.name, `model ${modelName}`);
    }
  }
  for (const [family, deployment] of Object.entries(manifest.familyDefaults || {})) {
    addRoute(family, deployment, `family ${family}`);
  }
  return {
    collisions,
    entries: [...routes.values()],
  };
}

function approvedModelRouteString(manifest) {
  return approvedModelRoutes(manifest).entries
    .map(({ alias, deployment }) => `${alias}=${deployment}`)
    .join(";");
}

function validateSecretReferences(manifest, errors) {
  for (const [index, reference] of (manifest.secretReferences || []).entries()) {
    const value = reference?.reference || "";
    const fieldPath = `$.secretReferences[${index}].reference`;
    if (
      reference?.provider === "key-vault" &&
      !/^https:\/\/[a-z0-9-]+\.vault\.azure\.net\/(?:secrets|keys|certificates)\/[A-Za-z0-9-]+(?:\/[A-Za-z0-9]+)?$/i.test(
        value
      )
    ) {
      errors.push(`${fieldPath}: must be a versioned or unversioned Azure Key Vault object URI`);
    }
    if (
      reference?.provider === "environment" &&
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
    ) {
      errors.push(`${fieldPath}: must be an environment variable name`);
    }
    if (
      reference?.provider === "managed-identity" &&
      !/^\/subscriptions\/[0-9a-fA-F-]{36}\/resourceGroups\/[^/]+\/providers\/Microsoft\.ManagedIdentity\/userAssignedIdentities\/[^/]+$/.test(
        value
      )
    ) {
      errors.push(`${fieldPath}: must be a user-assigned managed identity resource ID`);
    }
  }
}

function addSemanticErrors(manifest, errors) {
  const versionMatch = /^(\d+)\.(\d+)$/.exec(manifest.schemaVersion || "");
  if (versionMatch && Number(versionMatch[1]) !== SUPPORTED_SCHEMA_MAJOR) {
    errors.push(
      `$.schemaVersion: unsupported major version ${versionMatch[1]}; supported major is ${SUPPORTED_SCHEMA_MAJOR}`
    );
  }

  const architecture = manifest.architecture || {};
  if (!SUPPORTED_PROFILES.has(architecture.profile)) {
    errors.push(
      `$.architecture.profile: unsupported profile ${JSON.stringify(
        architecture.profile
      )}; proposed profiles are not deployable`
    );
  }
  if (SUPPORTED_PROFILES.has(architecture.profile)) {
    if (architecture.status !== "deployable") {
      errors.push("$.architecture.status: supported profiles must have status \"deployable\"");
    }
    if (architecture.deployable !== true) {
      errors.push("$.architecture.deployable: supported profiles must be deployable");
    }
    if (architecture.proposal !== undefined) {
      errors.push("$.architecture.proposal: is only valid for a proposed future profile");
    }
  } else {
    if (architecture.status !== "proposed") {
      errors.push("$.architecture.status: unsupported profiles must have status \"proposed\"");
    }
    if (architecture.deployable !== false) {
      errors.push("$.architecture.deployable: unsupported profiles must set deployable to false");
    }
    if (!architecture.proposal) {
      errors.push("$.architecture.proposal: is required for a proposed future profile");
    }
  }

  const deployments = new Map();
  const families = new Map(FAMILIES.map((family) => [family, []]));
  for (const [index, model] of (manifest.models || []).entries()) {
    const deploymentName = model?.deployment?.name;
    if (typeof deploymentName === "string") {
      const normalized = deploymentName.toLowerCase();
      if (deployments.has(normalized)) {
        errors.push(
          `$.models[${index}].deployment.name: duplicates $.models[${deployments.get(
            normalized
          )}].deployment.name`
        );
      } else {
        deployments.set(normalized, index);
      }
    }
    const expectedFamily = /^claude-(sonnet|haiku|opus)-/.exec(model?.name || "")?.[1];
    if (expectedFamily && model.family !== expectedFamily) {
      errors.push(
        `$.models[${index}].family: must be ${JSON.stringify(
          expectedFamily
        )} for model ${JSON.stringify(model.name)}`
      );
    }
    if (families.has(model?.family) && typeof deploymentName === "string") {
      families.get(model.family).push(deploymentName);
    }
  }

  for (const family of FAMILIES) {
    const selected = families.get(family);
    const defaultDeployment = manifest.familyDefaults?.[family];
    if (selected.length > 0 && defaultDeployment === undefined) {
      errors.push(`$.familyDefaults.${family}: is required when a ${family} model is selected`);
    } else if (selected.length === 0 && defaultDeployment !== undefined) {
      errors.push(`$.familyDefaults.${family}: cannot be set without a selected ${family} model`);
    } else if (
      defaultDeployment !== undefined &&
      !selected.some((name) => name.toLowerCase() === defaultDeployment.toLowerCase())
    ) {
      errors.push(
        `$.familyDefaults.${family}: must reference a selected ${family} deployment`
      );
    }
  }

  const identityNames = new Set();
  const entraPrincipalIds = new Set();
  for (const [index, identity] of (manifest.identities || []).entries()) {
    if (identityNames.has(identity?.name)) {
      errors.push(`$.identities[${index}].name: duplicates an earlier identity`);
    }
    identityNames.add(identity?.name);
    if (identity?.type === "user-assigned" && !identity.resourceId) {
      errors.push(`$.identities[${index}].resourceId: is required for a user-assigned identity`);
    }
    if (identity?.type === "system-assigned" && identity.resourceId !== undefined) {
      errors.push(`$.identities[${index}].resourceId: is not valid for a system-assigned identity`);
    }
    if (identity?.type === "entra-principal") {
      if (!identity.objectId) {
        errors.push(`$.identities[${index}].objectId: is required for an Entra principal`);
      } else {
        entraPrincipalIds.add(identity.objectId.toLowerCase());
      }
      if (identity.resourceId !== undefined) {
        errors.push(`$.identities[${index}].resourceId: is not valid for an Entra principal`);
      }
    } else if (identity?.objectId !== undefined) {
      errors.push(`$.identities[${index}].objectId: is only valid for an Entra principal`);
    }
  }
  for (const [index, persona] of (manifest.personas || []).entries()) {
    if (persona?.identity && !identityNames.has(persona.identity)) {
      errors.push(`$.personas[${index}].identity: must reference a declared identity`);
    }
  }

  const secretReferenceNames = new Set();
  for (const [index, reference] of (manifest.secretReferences || []).entries()) {
    if (secretReferenceNames.has(reference?.name)) {
      errors.push(`$.secretReferences[${index}].name: duplicates an earlier secret reference`);
    }
    secretReferenceNames.add(reference?.name);
  }
  for (const category of ["mcpServers", "skills", "plugins"]) {
    for (const [index, packageReference] of (manifest.packages?.[category] || []).entries()) {
      for (const [referenceIndex, referenceName] of (
        packageReference.configurationSecretReferences || []
      ).entries()) {
        if (!secretReferenceNames.has(referenceName)) {
          errors.push(
            `$.packages.${category}[${index}].configurationSecretReferences[${referenceIndex}]: must reference a declared secret reference`
          );
        }
      }
    }
  }

  const networking = manifest.networking || {};
  if (networking.mode === "public") {
    if (networking.publicNetworkAccess !== "Enabled") {
      errors.push("$.networking.publicNetworkAccess: public mode requires \"Enabled\"");
    }
    if (networking.privateEndpoint !== undefined) {
      errors.push("$.networking.privateEndpoint: is incompatible with public mode");
    }
  }
  if (networking.mode === "private-endpoint") {
    if (networking.publicNetworkAccess !== "Disabled") {
      errors.push("$.networking.publicNetworkAccess: private-endpoint mode requires \"Disabled\"");
    }
    if (!networking.privateEndpoint) {
      errors.push("$.networking.privateEndpoint: is required for private-endpoint mode");
    }
    if (networking.allowedCidrs !== undefined) {
      errors.push("$.networking.allowedCidrs: is not valid when public network access is disabled");
    }
  }
  if (architecture.profile === "direct" && manifest.azure?.apim !== undefined) {
    errors.push("$.azure.apim: is not valid for the direct profile");
  }
  if (architecture.profile === "apim-governed") {
    if (!manifest.azure?.apim) {
      errors.push("$.azure.apim: is required for the apim-governed profile");
    }
    if (networking.mode !== "public") {
      errors.push(
        "$.networking.mode: apim-governed version 1 requires public mode; private connectivity is not implemented"
      );
    }
    if (manifest.governance?.policyMode !== "enforce") {
      errors.push("$.governance.policyMode: apim-governed requires \"enforce\"");
    }
    const routeString = approvedModelRouteString(manifest);
    for (const collision of approvedModelRoutes(manifest).collisions) {
      errors.push(`$.models: APIM alias namespace collision: ${collision}`);
    }
    if (routeString.length > 4096) {
      errors.push(
        `$.models: APIM approved route map is ${routeString.length} characters; maximum is 4096`
      );
    }
    for (const [index, principalId] of (
      manifest.azure?.apim?.api?.allowedPrincipalIds || []
    ).entries()) {
      if (!entraPrincipalIds.has(principalId.toLowerCase())) {
        errors.push(
          `$.azure.apim.api.allowedPrincipalIds[${index}]: must reference an entra-principal identity objectId`
        );
      }
    }
  }
  if (architecture.profile === "direct" && manifest.governance?.policyMode !== "audit") {
    errors.push("$.governance.policyMode: direct requires \"audit\"");
  }
  if ((networking.allowedCidrs || []).length > 0) {
    errors.push("$.networking.allowedCidrs: CIDR firewall configuration is not implemented");
  }
  if (networking.mode === "private-endpoint" && SUPPORTED_PROFILES.has(architecture.profile)) {
    errors.push(
      "$.networking.mode: private-endpoint is reserved for a future profile and is not deployable in version 1"
    );
  }

  if (
    manifest.azure?.location &&
    Array.isArray(manifest.governance?.allowedRegions) &&
    !manifest.governance.allowedRegions.includes(manifest.azure.location)
  ) {
    errors.push("$.governance.allowedRegions: must include $.azure.location");
  }
  if (
    manifest.release?.version &&
    manifest.lifecycle?.createdByRelease &&
    manifest.release.version !== manifest.lifecycle.createdByRelease
  ) {
    errors.push("$.lifecycle.createdByRelease: must equal $.release.version");
  }
  if (
    manifest.azure?.foundry?.reuseExisting === false &&
    manifest.governance?.localAuthentication !== "disabled"
  ) {
    errors.push(
      "$.governance.localAuthentication: new Foundry accounts must set local authentication to \"disabled\""
    );
  }

  validateSecretReferences(manifest, errors);
  scanForEmbeddedSecrets(manifest, "$", errors);
}

function validateManifest(manifest, schema) {
  const errors = [];
  validateSchemaValue(manifest, schema, "$", schema, errors);
  if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) {
    addSemanticErrors(manifest, errors);
  }
  return [...new Set(errors)];
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${filePath}: ${error.message}`);
  }
}

function parseArguments(args) {
  const options = { schemaPath: DEFAULT_SCHEMA_PATH, manifestPaths: [] };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--schema") {
      const schemaPath = args[++index];
      if (!schemaPath) throw new Error("--schema requires a path");
      options.schemaPath = path.resolve(schemaPath);
    } else if (args[index] === "-h" || args[index] === "--help") {
      options.help = true;
    } else if (args[index].startsWith("-")) {
      throw new Error(`Unknown option: ${args[index]}`);
    } else {
      options.manifestPaths.push(path.resolve(args[index]));
    }
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/validate-manifest.js [--schema PATH] MANIFEST [MANIFEST ...]",
    "",
    "Validates deployment manifests without third-party dependencies.",
  ].join("\n");
}

function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (options.manifestPaths.length === 0) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }

  const schema = readJson(options.schemaPath);
  let invalid = 0;
  for (const manifestPath of options.manifestPaths) {
    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch (error) {
      invalid += 1;
      process.stderr.write(`INVALID: ${error.message}\n`);
      continue;
    }
    const errors = validateManifest(manifest, schema);
    if (errors.length === 0) {
      process.stdout.write(`VALID: ${manifestPath}\n`);
      continue;
    }
    invalid += 1;
    process.stderr.write(`INVALID: ${manifestPath}\n`);
    errors.forEach((error) => process.stderr.write(`  - ${error}\n`));
  }
  return invalid === 0 ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`Manifest validation failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = {
  DEFAULT_SCHEMA_PATH,
  SUPPORTED_PROFILES,
  SUPPORTED_SCHEMA_MAJOR,
  addSemanticErrors,
  approvedModelRoutes,
  approvedModelRouteString,
  main,
  isIsoCalendarDate,
  parseArguments,
  readJson,
  validateManifest,
  validateSchemaValue,
};
