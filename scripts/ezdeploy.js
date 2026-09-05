#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  DEFAULT_SCHEMA_PATH,
  approvedModelRouteString,
  readJson,
  validateManifest,
} = require("./validate-manifest.js");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const BICEP_PATH = path.join(REPOSITORY_ROOT, "infra", "main.bicep");
const ENGINE_PATH = path.join(__dirname, "ezdeploy-engine.sh");
const APIM_POLICY_PATH = path.join(
  REPOSITORY_ROOT,
  "policies",
  "apim-governed",
  "v1",
  "policy.xml"
);
const APIM_API_VERSION = "2024-05-01";
const APIM_BACKEND_ID = "foundry-anthropic";
const COMMANDS = new Set(["validate", "render", "plan", "deploy"]);
const SECRET_KEY_PATTERN =
  /(authorization|bearer|client.?secret|connection.?string|password|private.?key|secret.?value|access.?token|refresh.?token|api.?key)/i;

function usage() {
  return [
    "Usage: node scripts/ezdeploy.js <validate|render|plan|deploy> MANIFEST [--output-dir PATH]",
    "",
    "validate  Validate the manifest without Azure access.",
    "render    Print the sanitized Bicep and engine orchestration plan.",
    "plan      Run Bicep what-if and the engine with --dry-run.",
    "deploy    Run the Bicep deployment and the engine's interactive deployment flow.",
  ].join("\n");
}

function parseArguments(args) {
  const options = {};
  if (args.includes("-h") || args.includes("--help")) return { help: true };
  options.command = args.shift();
  if (!COMMANDS.has(options.command)) {
    throw new Error(`Unknown command ${JSON.stringify(options.command || "")}.`);
  }
  const manifest = args.shift();
  if (!manifest || manifest.startsWith("-")) {
    throw new Error(`${options.command} requires a manifest path.`);
  }
  options.manifestPath = path.resolve(manifest);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--output-dir") {
      const value = args[++index];
      if (!value) throw new Error("--output-dir requires a path.");
      options.outputDir = path.resolve(value);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  options.outputDir ||= path.join(os.homedir(), "claude-code-foundry");
  return options;
}

function loadValidatedManifest(manifestPath) {
  const manifest = readJson(manifestPath);
  const schema = readJson(DEFAULT_SCHEMA_PATH);
  const errors = validateManifest(manifest, schema);
  if (errors.length > 0) {
    throw new Error(
      `Manifest validation failed:\n${errors.map((error) => `  - ${error}`).join("\n")}`
    );
  }
  return manifest;
}

function digestManifest(manifest) {
  return crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function deploymentOwnershipHash(manifest) {
  const identity = {
    artifact: manifest.release.artifact,
    customer: manifest.customer.id,
    environment: manifest.environment.name,
    profile: manifest.architecture.profile,
    tenantId: manifest.azure.tenantId.toLowerCase(),
    subscriptionId: manifest.azure.subscriptionId.toLowerCase(),
    resourceGroup: manifest.azure.resourceGroup.toLowerCase(),
    foundryAccount: manifest.azure.foundry.accountName.toLowerCase(),
    apiManagement:
      manifest.architecture.profile === "apim-governed"
        ? manifest.azure.apim.serviceName.toLowerCase()
        : null,
  };
  return crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16);
}

function safeSegment(value, maximum) {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return (normalized || "deployment").slice(0, maximum).replace(/-+$/g, "");
}

function deploymentName(manifest, digest) {
  const customer = safeSegment(manifest.customer.id, 18);
  const environment = safeSegment(manifest.environment.name, 14);
  return `ezdeploy-${customer}-${environment}-${digest.slice(0, 12)}`.slice(0, 64);
}

function apimName(manifest) {
  return manifest.azure.apim?.serviceName;
}

function deterministicResourceNames(manifest) {
  const workload = safeSegment(manifest.release.artifact, 20);
  const environment = safeSegment(manifest.environment.name, 10);
  const suffix = deploymentOwnershipHash(manifest).slice(0, 13);
  const stem = safeSegment(`${workload}-${environment}`, 50);
  const compactStem = `${workload}${environment}`.replaceAll("-", "");
  return {
    resourceSuffix: suffix,
    keyVaultName: `${`kv${compactStem}`.slice(0, 11)}${suffix}`,
    logAnalyticsWorkspaceName: `log-${stem.slice(0, 45)}-${suffix}`,
    applicationInsightsName: `appi-${stem}-${suffix}`,
    deploymentIdentityName: `id-${stem}-${suffix}-deploy`,
    runtimeIdentityName: `id-${stem}-${suffix}-runtime`,
  };
}

function validateDeterministicResourceNames(names) {
  if (!/^[a-z][a-z0-9]{2,23}$/.test(names.keyVaultName)) {
    throw new Error(
      `Generated Key Vault name ${JSON.stringify(
        names.keyVaultName
      )} must be 3-24 lowercase alphanumeric characters and end with the reserved suffix.`
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,61}[A-Za-z0-9]$/.test(names.logAnalyticsWorkspaceName)) {
    throw new Error(
      `Generated Log Analytics workspace name ${JSON.stringify(
        names.logAnalyticsWorkspaceName
      )} is invalid.`
    );
  }
  for (const key of [
    "applicationInsightsName",
    "deploymentIdentityName",
    "runtimeIdentityName",
  ]) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._()-]{1,126}[A-Za-z0-9)]$/.test(names[key])) {
      throw new Error(`Generated resource name ${JSON.stringify(names[key])} is invalid.`);
    }
  }
  return names;
}

function bicepParameterValues(manifest, deploymentContext = {}) {
  const privateNetworking = manifest.networking.mode === "private-endpoint";
  const names = validateDeterministicResourceNames(
    deterministicResourceNames(manifest)
  );
  const values = {
    profile: manifest.architecture.profile,
    resourceGroupName: manifest.azure.resourceGroup,
    resourceSuffix: names.resourceSuffix,
    manageResourceGroup: deploymentContext.manageResourceGroup ?? true,
    workloadName: safeSegment(manifest.release.artifact, 20),
    environmentName: safeSegment(manifest.environment.name, 10),
    location: manifest.azure.location,
    foundryAccountName: manifest.azure.foundry.accountName,
    foundryProjectName: manifest.azure.foundry.projectName,
    reuseExistingFoundry: manifest.azure.foundry.reuseExisting,
    entraOnlyAuthentication:
      !manifest.azure.foundry.reuseExisting ||
      manifest.governance.localAuthentication === "disabled",
    foundryPublicNetworkAccess: manifest.networking.publicNetworkAccess,
    keyVaultPublicNetworkAccess: privateNetworking ? "Disabled" : "Enabled",
    keyVaultNetworkDefaultAction: "Deny",
    keyVaultName: names.keyVaultName,
    logAnalyticsWorkspaceName: names.logAnalyticsWorkspaceName,
    applicationInsightsName: names.applicationInsightsName,
    deploymentIdentityName: names.deploymentIdentityName,
    runtimeIdentityName: names.runtimeIdentityName,
    logRetentionInDays: manifest.observability.logRetentionDays,
    enableDiagnosticSettings: manifest.observability.diagnosticSettings,
    tags: {
      application: manifest.release.artifact,
      customer: manifest.customer.id,
      environment: manifest.environment.name,
      profile: manifest.architecture.profile,
      release: manifest.release.version,
      ownershipHash: deploymentOwnershipHash(manifest),
    },
  };
  if (manifest.architecture.profile === "apim-governed") {
    values.apiManagementName = apimName(manifest);
    values.apiManagementPublisherName = manifest.azure.apim.publisherName;
    values.apiManagementPublisherEmail = manifest.azure.apim.publisherEmail;
    values.apiManagementSkuName = manifest.azure.apim.sku.name;
    values.apiManagementCapacity = manifest.azure.apim.sku.capacity;
    values.apiManagementPublicNetworkAccess = manifest.azure.apim.publicNetworkAccess;
  }
  return values;
}

function bicepParameterFile(manifest, deploymentContext = {}) {
  return {
    $schema:
      "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: Object.fromEntries(
      Object.entries(bicepParameterValues(manifest, deploymentContext)).map(([name, value]) => [
        name,
        { value },
      ])
    ),
  };
}

function engineArguments(
  manifest,
  outputDir,
  { dryRun = false, approved = false, foundryBaseUrl = null } = {}
) {
  const args = [
    ENGINE_PATH,
    "--subscription",
    manifest.azure.subscriptionId,
    "--tenant",
    manifest.azure.tenantId,
    "--resource-group",
    manifest.azure.resourceGroup,
    "--location",
    manifest.azure.location,
    "--account-name",
    manifest.azure.foundry.accountName,
    "--project-name",
    manifest.azure.foundry.projectName,
    "--organization-name",
    manifest.customer.legalOrganization,
    "--country-code",
    manifest.customer.countryCode,
    "--industry",
    manifest.customer.industry,
    "--sku",
    manifest.models[0].sku.name,
  ];
  for (const model of manifest.models) {
    args.push(
      "--model",
      [
        model.name,
        model.version,
        model.deployment.name,
        model.sku.capacity,
      ].join(":")
    );
  }
  for (const family of ["sonnet", "haiku", "opus"]) {
    if (manifest.familyDefaults[family]) {
      args.push(`--default-${family}-model`, manifest.familyDefaults[family]);
    }
  }
  if (
    manifest.azure.foundry.reuseExisting &&
    manifest.governance.localAuthentication === "disabled"
  ) {
    args.push("--disable-local-auth-on-reuse");
  }
  if (foundryBaseUrl) {
    args.push("--foundry-base-url", foundryBaseUrl);
  }
  args.push("--output-dir", outputDir);
  if (dryRun) args.push("--dry-run");
  if (approved) args.push("--yes");
  return args;
}

function bicepArguments(command, manifest, name, parameterPath) {
  return [
    "deployment",
    "sub",
    command === "plan" ? "what-if" : "create",
    "--name",
    name,
    "--subscription",
    manifest.azure.subscriptionId,
    "--location",
    manifest.azure.location,
    "--template-file",
    BICEP_PATH,
    "--parameters",
    `@${parameterPath}`,
    "--output",
    "json",
  ];
}

function commandExists(command) {
  const result = spawnSync(
    process.platform === "win32" ? "where.exe" : "command",
    process.platform === "win32" ? [command] : ["-v", command],
    { encoding: "utf8", shell: process.platform !== "win32" }
  );
  return result.status === 0;
}

function findBash() {
  if (process.env.EZDEPLOY_BASH) return process.env.EZDEPLOY_BASH;
  if (process.platform !== "win32") {
    if (commandExists("bash")) return "bash";
    throw new Error("bash was not found on PATH.");
  }
  const candidates = [
    process.env.ProgramFiles &&
      path.join(process.env.ProgramFiles, "Git", "bin", "bash.exe"),
    process.env["ProgramFiles(x86)"] &&
      path.join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe"),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
  ].filter(Boolean);
  const installed = candidates.find((candidate) => fs.existsSync(candidate));
  if (installed) return installed;
  if (commandExists("bash")) return "bash";
  throw new Error("Git Bash was not found. Install Git for Windows or add bash to PATH.");
}

let resolvedAzureCli;
let resolvedAzureCliPrefix = [];

function azureCli() {
  if (process.env.EZDEPLOY_AZ) {
    if (process.platform === "win32" && /\.(cmd|bat)$/i.test(process.env.EZDEPLOY_AZ)) {
      throw new Error(
        "EZDEPLOY_AZ must point to an executable entry point, not a .cmd or .bat wrapper."
      );
    }
    let prefix = [];
    if (process.env.EZDEPLOY_AZ_ARGS_JSON) {
      try {
        prefix = JSON.parse(process.env.EZDEPLOY_AZ_ARGS_JSON);
      } catch (error) {
        throw new Error(`EZDEPLOY_AZ_ARGS_JSON is invalid JSON: ${error.message}`);
      }
      if (!Array.isArray(prefix) || prefix.some((value) => typeof value !== "string")) {
        throw new Error("EZDEPLOY_AZ_ARGS_JSON must be a JSON array of strings.");
      }
    }
    resolvedAzureCliPrefix = prefix;
    return process.env.EZDEPLOY_AZ;
  }
  if (resolvedAzureCli) return resolvedAzureCli;
  if (process.platform !== "win32") {
    resolvedAzureCli = "az";
    return resolvedAzureCli;
  }
  const result = spawnSync("where.exe", ["az"], { encoding: "utf8" });
  const candidates =
    result.status === 0
      ? result.stdout
          .split(/\r?\n/)
          .map((candidate) => candidate.trim())
          .filter(Boolean)
      : [];
  resolvedAzureCli =
    candidates.find((candidate) => /\.(cmd|exe|bat)$/i.test(candidate)) || "az.cmd";
  if (/\.cmd$/i.test(resolvedAzureCli)) {
    const python = path.resolve(path.dirname(resolvedAzureCli), "..", "python.exe");
    if (fs.existsSync(python)) {
      resolvedAzureCli = python;
      resolvedAzureCliPrefix = ["-IBm", "azure.cli"];
    } else {
      throw new Error(
        `Azure CLI resolved to ${resolvedAzureCli}, but no safe executable entry point was found.`
      );
    }
  }
  return resolvedAzureCli;
}

function azureCliArguments(args) {
  azureCli();
  return [...resolvedAzureCliPrefix, ...args];
}

function requiresCommandShell(command) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
  });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`${label} failed with exit code ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout;
}

function verifyAzureAccount(manifest) {
  const output = run(
    azureCli(),
    azureCliArguments(["account", "show", "--output", "json"]),
    "Azure authentication"
  );
  let account;
  try {
    account = JSON.parse(output);
  } catch (error) {
    throw new Error(`Azure authentication returned invalid JSON: ${error.message}`);
  }
  if (String(account.tenantId).toLowerCase() !== manifest.azure.tenantId.toLowerCase()) {
    throw new Error(
      `Azure tenant mismatch: authenticated ${account.tenantId}, expected ${manifest.azure.tenantId}.`
    );
  }
  if (String(account.id).toLowerCase() !== manifest.azure.subscriptionId.toLowerCase()) {
    throw new Error(
      `Azure subscription mismatch: authenticated ${account.id}, expected ${manifest.azure.subscriptionId}.`
    );
  }
  return { id: account.id, tenantId: account.tenantId, name: account.name || null };
}

function sanitize(value, key = "") {
  if (SECRET_KEY_PATTERN.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        sanitize(child, childKey),
      ])
    );
  }
  if (typeof value !== "string") return value;
  if (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value) ||
    /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i.test(value) ||
    /(?:[?&])(sig|token|key|secret)=/i.test(value) ||
    /(?:^|;)(?:AccountKey|SharedAccessKey|SharedAccessSignature|Password|Secret|ClientSecret)=/i.test(
      value
    )
  ) {
    return "[REDACTED]";
  }
  return value;
}

function parseJsonOutput(output) {
  if (!output.trim()) return {};
  try {
    return JSON.parse(output);
  } catch {
    return { summary: output.trim() };
  }
}

function bicepOutputValue(outputs, name) {
  const output = outputs?.[name];
  return output && typeof output === "object" && Object.hasOwn(output, "value")
    ? output.value
    : output;
}

function expectedApimBaseUrl(manifest) {
  if (manifest.architecture.profile !== "apim-governed") return null;
  return `https://${manifest.azure.apim.serviceName}.azure-api.net/${manifest.azure.apim.api.path}`;
}

function apimNamedValues(manifest) {
  return {
    "entra-tenant-id": manifest.azure.tenantId,
    "entra-audience": manifest.azure.apim.api.callerAudience,
    "allowed-principal-ids": manifest.azure.apim.api.allowedPrincipalIds.join(";"),
    "rate-limit-calls": String(manifest.azure.apim.api.rateLimitCalls),
    "rate-limit-renewal-seconds": String(
      manifest.azure.apim.api.rateLimitRenewalSeconds
    ),
    "approved-model-deployment-routes": approvedModelRouteString(manifest),
    "foundry-backend-id": APIM_BACKEND_ID,
    "foundry-managed-identity-resource": "https://cognitiveservices.azure.com",
    "backend-timeout-seconds": String(manifest.azure.apim.api.backendTimeoutSeconds),
  };
}

function managementUrl(resourceId) {
  return `https://management.azure.com${resourceId}?api-version=${APIM_API_VERSION}`;
}

function putArmResource(resourceId, properties, label) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ezdeploy-arm-body-"));
  const bodyPath = path.join(temporaryDirectory, "body.json");
  try {
    fs.writeFileSync(bodyPath, `${JSON.stringify({ properties })}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    run(
      azureCli(),
      azureCliArguments([
        "rest",
        "--method",
        "put",
        "--url",
        managementUrl(resourceId),
        "--body",
        `@${bodyPath}`,
        "--output",
        "none",
      ]),
      label
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function probeResource(resourceId) {
  const args = azureCliArguments([
    "resource",
    "show",
    "--ids",
    resourceId,
    "--output",
    "json",
  ]);
  const result = spawnSync(azureCli(), args, {
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    throw new Error(`Azure resource check could not start: ${result.error.message}`);
  }
  if (result.status === 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Azure resource check returned invalid JSON: ${error.message}`);
    }
  }
  const detail = `${result.stderr || ""}\n${result.stdout || ""}`;
  if (/ResourceNotFound|not found|could not be found|was not found/i.test(detail)) {
    return null;
  }
  throw new Error(`Azure resource check failed: ${detail.trim() || `exit code ${result.status}`}`);
}

function probeResourceGroup(manifest) {
  const args = azureCliArguments([
    "group",
    "show",
    "--name",
    manifest.azure.resourceGroup,
    "--subscription",
    manifest.azure.subscriptionId,
    "--output",
    "json",
  ]);
  const result = spawnSync(azureCli(), args, {
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    throw new Error(`Azure resource-group check could not start: ${result.error.message}`);
  }
  if (result.status === 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Azure resource-group check returned invalid JSON: ${error.message}`);
    }
  }
  const detail = `${result.stderr || ""}\n${result.stdout || ""}`;
  if (/ResourceGroupNotFound|not found|could not be found|was not found/i.test(detail)) {
    return null;
  }
  throw new Error(
    `Azure resource-group check failed: ${detail.trim() || `exit code ${result.status}`}`
  );
}

function matchesManagedTags(resource, manifest) {
  const tags = resource?.tags || {};
  return (
    tags.managedBy === "bicep" &&
    tags.deploymentProfile === manifest.architecture.profile &&
    tags.customer === manifest.customer.id &&
    tags.environment === manifest.environment.name &&
    tags.ownershipHash === deploymentOwnershipHash(manifest)
  );
}

function resourceId(manifest, resourceType, ...names) {
  return `/subscriptions/${manifest.azure.subscriptionId}/resourceGroups/${
    manifest.azure.resourceGroup
  }/providers/${resourceType}/${names.join("/")}`;
}

function requireManifestOwnedResource(manifest, resource, label) {
  if (resource && !matchesManagedTags(resource, manifest)) {
    throw new Error(`${label} already exists and is not owned by this manifest.`);
  }
}

function verifyResourceOwnership(manifest) {
  const names = validateDeterministicResourceNames(
    deterministicResourceNames(manifest)
  );
  const resourceGroup = probeResourceGroup(manifest);
  if (
    resourceGroup?.location &&
    resourceGroup.location.toLowerCase() !== manifest.azure.location.toLowerCase()
  ) {
    throw new Error(
      `Resource group ${manifest.azure.resourceGroup} is in ${resourceGroup.location}, expected ${manifest.azure.location}.`
    );
  }

  const managedResources = [
    {
      label: `Key Vault ${names.keyVaultName}`,
      id: resourceId(manifest, "Microsoft.KeyVault/vaults", names.keyVaultName),
    },
    {
      label: `Log Analytics workspace ${names.logAnalyticsWorkspaceName}`,
      id: resourceId(
        manifest,
        "Microsoft.OperationalInsights/workspaces",
        names.logAnalyticsWorkspaceName
      ),
    },
    {
      label: `Application Insights component ${names.applicationInsightsName}`,
      id: resourceId(
        manifest,
        "Microsoft.Insights/components",
        names.applicationInsightsName
      ),
    },
    {
      label: `Deployment identity ${names.deploymentIdentityName}`,
      id: resourceId(
        manifest,
        "Microsoft.ManagedIdentity/userAssignedIdentities",
        names.deploymentIdentityName
      ),
    },
    {
      label: `Runtime identity ${names.runtimeIdentityName}`,
      id: resourceId(
        manifest,
        "Microsoft.ManagedIdentity/userAssignedIdentities",
        names.runtimeIdentityName
      ),
    },
  ];

  for (const definition of managedResources) {
    requireManifestOwnedResource(
      manifest,
      probeResource(definition.id),
      definition.label
    );
  }

  const foundryId = resourceId(
    manifest,
    "Microsoft.CognitiveServices/accounts",
    manifest.azure.foundry.accountName
  );
  const foundry = probeResource(foundryId);
  if (manifest.azure.foundry.reuseExisting && !foundry) {
    throw new Error(
      `Foundry account ${manifest.azure.foundry.accountName} must already exist because reuseExisting is true.`
    );
  }
  if (manifest.azure.foundry.reuseExisting) {
    const publicNetworkAccess = String(
      foundry.properties?.publicNetworkAccess || "Enabled"
    ).toLowerCase();
    const networkDefaultAction = String(
      foundry.properties?.networkAcls?.defaultAction || "Allow"
    ).toLowerCase();
    if (publicNetworkAccess !== "enabled" || networkDefaultAction !== "allow") {
      throw new Error(
        `Foundry account ${manifest.azure.foundry.accountName} is not compatible with the version 1 public endpoint profile: publicNetworkAccess=${foundry.properties?.publicNetworkAccess || "unspecified"}, networkAcls.defaultAction=${foundry.properties?.networkAcls?.defaultAction || "unspecified"}.`
      );
    }
  }
  if (
    !manifest.azure.foundry.reuseExisting &&
    foundry
  ) {
    requireManifestOwnedResource(
      manifest,
      foundry,
      `Foundry account ${manifest.azure.foundry.accountName}`
    );
  }

  if (!manifest.azure.foundry.reuseExisting) {
    const projectId = resourceId(
      manifest,
      "Microsoft.CognitiveServices/accounts",
      manifest.azure.foundry.accountName,
      "projects",
      manifest.azure.foundry.projectName
    );
    requireManifestOwnedResource(
      manifest,
      probeResource(projectId),
      `Foundry project ${manifest.azure.foundry.projectName}`
    );
  }

  if (manifest.architecture.profile === "apim-governed") {
    const apimId = resourceId(
      manifest,
      "Microsoft.ApiManagement/service",
      manifest.azure.apim.serviceName
    );
    requireManifestOwnedResource(
      manifest,
      probeResource(apimId),
      `API Management service ${manifest.azure.apim.serviceName}`
    );
  }

  return {
    manageResourceGroup:
      !resourceGroup || matchesManagedTags(resourceGroup, manifest),
    resourceGroupExists: Boolean(resourceGroup),
    names,
  };
}

function confirmDeployment(manifest) {
  if (!process.stdin.isTTY && process.env.EZDEPLOY_ALLOW_NONINTERACTIVE_ACCEPT !== "1") {
    throw new Error(
      "deploy requires an interactive terminal. Review the plan and rerun interactively."
    );
  }
  process.stdout.write(
    [
      "",
      "Deployment approval",
      `  Profile: ${manifest.architecture.profile}`,
      `  Subscription: ${manifest.azure.subscriptionId}`,
      `  Resource group: ${manifest.azure.resourceGroup}`,
      `  Models: ${manifest.models
        .map((model) => `${model.deployment.name} (${model.name}@${model.version})`)
        .join(", ")}`,
      "",
      "Type ACCEPT to deploy the Bicep infrastructure and exact model selections: ",
    ].join("\n")
  );
  const buffer = Buffer.alloc(256);
  const bytesRead = fs.readSync(process.stdin.fd, buffer, 0, buffer.length, null);
  const answer = buffer.subarray(0, bytesRead).toString("utf8").trim();
  if (answer !== "ACCEPT") throw new Error("Deployment canceled.");
}

function runEngine(bash, args, label) {
  const result = spawnSync(bash, args, {
    encoding: "utf8",
    stdio: "inherit",
    shell: requiresCommandShell(bash),
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const error = new Error(`${label} failed with exit code ${result.status}.`);
    error.exitCode = result.status;
    throw error;
  }
  return result;
}

function configureApim(manifest, outputs) {
  const serviceId =
    bicepOutputValue(outputs, "apiManagementId") ||
    `/subscriptions/${manifest.azure.subscriptionId}/resourceGroups/${manifest.azure.resourceGroup}/providers/Microsoft.ApiManagement/service/${manifest.azure.apim.serviceName}`;
  const foundryEndpoint =
    bicepOutputValue(outputs, "foundryAnthropicEndpoint") ||
    `https://${manifest.azure.foundry.accountName}.services.ai.azure.com/anthropic`;
  const gatewayUrl =
    bicepOutputValue(outputs, "apiManagementGatewayUrl") ||
    `https://${manifest.azure.apim.serviceName}.azure-api.net`;
  const apiId = `${serviceId}/apis/${manifest.azure.apim.api.name}`;
  const operationId = `${apiId}/operations/anthropic-post`;

  putArmResource(
    `${serviceId}/backends/${APIM_BACKEND_ID}`,
    {
      protocol: "http",
      url: foundryEndpoint,
      title: "Microsoft Foundry Anthropic backend",
      description: "Manifest-managed Microsoft Foundry Anthropic endpoint.",
      tls: {
        validateCertificateChain: true,
        validateCertificateName: true,
      },
    },
    "APIM backend configuration"
  );

  for (const [name, value] of Object.entries(apimNamedValues(manifest))) {
    putArmResource(
      `${serviceId}/namedValues/${name}`,
      {
        displayName: name,
        secret: false,
        tags: ["ezdeploy", "apim-governed"],
        value,
      },
      `APIM named value ${name}`
    );
  }

  putArmResource(
    apiId,
    {
      apiRevision: "1",
      apiType: "http",
      description: "Governed Claude model inference through Microsoft Foundry.",
      displayName: "Claude on Microsoft Foundry",
      path: manifest.azure.apim.api.path,
      protocols: ["https"],
      subscriptionRequired: false,
      type: "http",
    },
    "APIM API configuration"
  );

  putArmResource(
    operationId,
    {
      description: "Routes approved POST requests to the Foundry Anthropic API.",
      displayName: "Anthropic POST wildcard",
      method: "POST",
      responses: [],
      templateParameters: [],
      urlTemplate: "/*",
    },
    "APIM operation configuration"
  );

  putArmResource(
    `${apiId}/policies/policy`,
    {
      format: "rawxml",
      value: fs.readFileSync(APIM_POLICY_PATH, "utf8"),
    },
    "APIM governed policy installation"
  );

  return {
    status: "succeeded",
    serviceId,
    serviceName: manifest.azure.apim.serviceName,
    gatewayUrl,
    baseUrl: `${String(gatewayUrl).replace(/\/$/, "")}/${manifest.azure.apim.api.path}`,
    backendId: APIM_BACKEND_ID,
    backendUrl: foundryEndpoint,
    apiName: manifest.azure.apim.api.name,
    operationName: "anthropic-post",
    policyVersion: "1.0.0",
    namedValues: Object.keys(apimNamedValues(manifest)),
  };
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@=\\-]+$/.test(text)
    ? text
    : `'${text.replaceAll("'", "'\\''")}'`;
}

function renderedCommand(command, args, temporaryParameterPath = null) {
  return [command, ...args]
    .map((part) =>
      temporaryParameterPath && part === `@${temporaryParameterPath}`
        ? "@<temporary-bicep-parameters.json>"
        : shellQuote(part)
    )
    .join(" ");
}

function reportPath(outputDir, operation, digest, startedAt) {
  const timestamp = startedAt.replace(/[-:.]/g, "");
  const nonce = crypto.randomBytes(4).toString("hex");
  return path.join(
    outputDir,
    `orchestration-${operation}-${timestamp}-${digest.slice(0, 12)}-${nonce}.json`
  );
}

function writeReport(targetPath, report) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.tmp`
  );
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitize(report), null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

function buildBaseReport(options, manifest, digest, name, startedAt, targetPath) {
  return {
    reportVersion: "1.0",
    operation: options.command,
    startedAt,
    completedAt: null,
    path: targetPath,
    manifest: {
      path: options.manifestPath,
      sha256: digest,
      schemaVersion: manifest.schemaVersion,
      releaseVersion: manifest.release.version,
      releaseArtifact: manifest.release.artifact,
      sourceRevision: manifest.release.sourceRevision || null,
      profile: manifest.architecture.profile,
    },
    azure: {
      tenantId: manifest.azure.tenantId,
      subscriptionId: manifest.azure.subscriptionId,
      resourceGroup: manifest.azure.resourceGroup,
      location: manifest.azure.location,
    },
    bicep: {
      deploymentName: name,
      template: BICEP_PATH,
      status: "not-started",
      outputs: {},
    },
    engine: {
      script: ENGINE_PATH,
      status: "not-started",
      preflightStatus: "not-started",
      exitCode: null,
      outputDirectory: options.outputDir,
    },
    apim:
      manifest.architecture.profile === "apim-governed"
        ? {
            status: "not-started",
            serviceName: manifest.azure.apim.serviceName,
            apiName: manifest.azure.apim.api.name,
            baseUrl: expectedApimBaseUrl(manifest),
          }
        : {
            status: "not-applicable",
          },
    references: {
      manifest: options.manifestPath,
      engineDeploymentReport: path.join(options.outputDir, "deployment-report.json"),
      secretReferences: manifest.secretReferences,
    },
  };
}

function renderPlan(options, manifest, digest, name, bash) {
  const placeholder = path.join(os.tmpdir(), "temporary-bicep-parameters.json");
  const bicepArgs = bicepArguments("plan", manifest, name, placeholder);
  const engineArgs = engineArguments(manifest, options.outputDir, {
    dryRun: true,
    foundryBaseUrl: expectedApimBaseUrl(manifest),
  });
  return sanitize({
    operation: "render",
    manifest: {
      path: options.manifestPath,
      sha256: digest,
      schemaVersion: manifest.schemaVersion,
      releaseVersion: manifest.release.version,
      profile: manifest.architecture.profile,
    },
    authenticatedAzureContextRequired: false,
    bicep: {
      deploymentName: name,
      parameters: bicepParameterValues(manifest),
      command: renderedCommand("az", bicepArgs, placeholder),
      expectedOutputs: [
        "Foundry account and project",
        "deployment and runtime identities",
        "Key Vault",
        "Log Analytics and Application Insights",
        ...(manifest.architecture.profile === "apim-governed"
          ? [
              "API Management service",
              "post-deployment Foundry backend, API, operation, named values, and governed policy",
            ]
          : []),
      ],
    },
    engine: {
      command: renderedCommand(bash, engineArgs),
      dryRun: true,
      interactiveApprovalPreserved: true,
      implicitYes: false,
      exactModels: manifest.models.map((model) => ({
        model: model.name,
        version: model.version,
        deployment: model.deployment.name,
        capacity: model.sku.capacity,
      })),
      familyDefaults: manifest.familyDefaults,
      outputDirectory: options.outputDir,
    },
    apim:
      manifest.architecture.profile === "apim-governed"
        ? {
            serviceName: manifest.azure.apim.serviceName,
            apiName: manifest.azure.apim.api.name,
            baseUrl: expectedApimBaseUrl(manifest),
            backendId: APIM_BACKEND_ID,
            policy: APIM_POLICY_PATH,
            namedValues: apimNamedValues(manifest),
          }
        : null,
    report: null,
  });
}

function execute(options) {
  const startedAt = new Date().toISOString();
  const manifest = loadValidatedManifest(options.manifestPath);
  const digest = digestManifest(manifest);
  const name = deploymentName(manifest, digest);
  if (options.command === "validate") {
    process.stdout.write(`VALID: ${options.manifestPath}\n`);
    return 0;
  }

  const bash = findBash();
  if (options.command === "render") {
    const plan = renderPlan(options, manifest, digest, name, bash);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  }

  verifyAzureAccount(manifest);
  const deploymentContext = verifyResourceOwnership(manifest);
  const targetReportPath = reportPath(
    options.outputDir,
    options.command,
    digest,
    startedAt
  );
  const report = buildBaseReport(
    options,
    manifest,
    digest,
    name,
    startedAt,
    targetReportPath
  );
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ezdeploy-cli-"));
  const parametersPath = path.join(temporaryDirectory, "parameters.json");
  try {
    fs.writeFileSync(
      parametersPath,
      `${JSON.stringify(bicepParameterFile(manifest, deploymentContext), null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );

    if (options.command === "deploy") {
      report.engine.preflightStatus = "running";
      runEngine(
        bash,
        engineArguments(manifest, options.outputDir, {
          dryRun: true,
          foundryBaseUrl: expectedApimBaseUrl(manifest),
        }),
        "Deployment engine preflight"
      );
      report.engine.preflightStatus = "succeeded";
      confirmDeployment(manifest);
    }

    report.bicep.status = "running";
    const bicepOutput = run(
      azureCli(),
      azureCliArguments(
        bicepArguments(options.command, manifest, name, parametersPath)
      ),
      options.command === "plan" ? "Bicep what-if" : "Bicep deployment"
    );
    const parsedBicep = parseJsonOutput(bicepOutput);
    report.bicep.status = "succeeded";
    report.bicep.outputs =
      options.command === "deploy"
        ? parsedBicep.properties?.outputs || parsedBicep.outputs || {}
        : parsedBicep;

    report.engine.status = "running";
    const engineResult = runEngine(
      bash,
      engineArguments(manifest, options.outputDir, {
        dryRun: options.command === "plan",
        approved: options.command === "deploy",
        foundryBaseUrl:
          options.command === "deploy"
            ? bicepOutputValue(report.bicep.outputs, "apiManagementGatewayUrl")
              ? `${String(
                  bicepOutputValue(report.bicep.outputs, "apiManagementGatewayUrl")
                ).replace(/\/$/, "")}/${manifest.azure.apim?.api.path || ""}`.replace(
                  /\/$/,
                  ""
                )
              : expectedApimBaseUrl(manifest)
            : expectedApimBaseUrl(manifest),
      }),
      options.command === "plan" ? "Deployment engine dry run" : "Deployment engine"
    );
    report.engine.exitCode = engineResult.status;
    report.engine.status = "succeeded";

    if (options.command === "deploy" && manifest.architecture.profile === "apim-governed") {
      report.apim.status = "running";
      report.apim = configureApim(manifest, report.bicep.outputs);
    }

    report.completedAt = new Date().toISOString();
    writeReport(targetReportPath, report);
    process.stdout.write(`Orchestration report: ${targetReportPath}\n`);
    return 0;
  } catch (error) {
    if (report.bicep.status === "running") report.bicep.status = "failed";
    if (report.engine.status === "running") report.engine.status = "failed";
    if (report.engine.preflightStatus === "running") {
      report.engine.preflightStatus = "failed";
    }
    if (report.apim.status === "running") report.apim.status = "failed";
    if (Number.isInteger(error.exitCode)) report.engine.exitCode = error.exitCode;
    report.completedAt = new Date().toISOString();
    report.error = error.message;
    writeReport(targetReportPath, report);
    throw error;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function main(args = process.argv.slice(2)) {
  try {
    const options = parseArguments([...args]);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    return execute(options);
  } catch (error) {
    process.stderr.write(`ezdeploy: ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  azureCli,
  azureCliArguments,
  bicepParameterFile,
  bicepParameterValues,
  deterministicResourceNames,
  deploymentOwnershipHash,
  deploymentName,
  engineArguments,
  main,
  parseArguments,
  sanitize,
};
