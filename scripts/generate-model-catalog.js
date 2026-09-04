"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SCHEMA_VERSION = 1;
const REQUIRED_REGIONS = ["eastus2", "swedencentral"];
const SUPPORTED_FAMILIES = ["sonnet", "haiku", "opus"];

function modelKey(format, name, version) {
  return [format, name, version].map((value) => String(value).toLowerCase()).join("|");
}

function skuKey(name, usageName) {
  return [name, usageName].map((value) => String(value).toLowerCase()).join("|");
}

function unwrapPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.value)) return payload.value;
  if (Array.isArray(payload.models)) return payload.models;
  if (Array.isArray(payload.model)) return payload.model;
  if (payload.model && typeof payload.model === "object") return [payload];
  return [];
}

function mergedRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  if (!record.model || typeof record.model !== "object" || Array.isArray(record.model)) {
    return { ...record };
  }
  const { model, ...wrapper } = record;
  return { ...wrapper, ...model };
}

function stringValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function booleanValue(value) {
  if (typeof value === "boolean") return value;
  return stringValue(value).toLowerCase() === "true";
}

function normalizedLifecycle(value) {
  const lifecycle = stringValue(value).toLowerCase();
  if (lifecycle === "generallyavailable" || lifecycle === "ga") return "GA";
  if (lifecycle === "preview") return "Preview";
  return "";
}

function publisherName(record) {
  if (typeof record.publisher === "string") return stringValue(record.publisher);
  return stringValue(record.publisher?.name || record.publisherName || record.modelPublisher);
}

function claudeFamily(name) {
  const match = stringValue(name).toLowerCase().match(/^claude-(sonnet|haiku|opus)-/);
  return match && SUPPORTED_FAMILIES.includes(match[1]) ? match[1] : "";
}

function normalizeCapacity(capacity) {
  if (!capacity || typeof capacity !== "object" || Array.isArray(capacity)) return null;
  const normalized = {};
  for (const field of ["minimum", "maximum", "default", "step"]) {
    if (typeof capacity[field] === "number" && Number.isFinite(capacity[field])) {
      normalized[field] = capacity[field];
    }
  }
  if (Array.isArray(capacity.allowedValues)) {
    normalized.allowedValues = capacity.allowedValues.filter(
      (value) => typeof value === "number" && Number.isFinite(value)
    );
  }
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeSkus(skus) {
  const normalized = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    if (!sku || typeof sku !== "object") continue;
    const name = stringValue(sku.name);
    const usageName = stringValue(sku.usageName);
    if (name !== "GlobalStandard" || !usageName) continue;
    const entry = {
      name,
      usageName,
      capacity: normalizeCapacity(sku.capacity),
      deprecationDate: stringValue(sku.deprecationDate) || null,
    };
    const key = skuKey(name, usageName);
    const existing = normalized.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) {
      throw new Error(`Conflicting duplicate SKU metadata for ${key}.`);
    }
    normalized.set(key, entry);
  }
  return [...normalized.values()].sort((left, right) =>
    skuKey(left.name, left.usageName).localeCompare(skuKey(right.name, right.usageName))
  );
}

function normalizeRecord(record, region) {
  const model = mergedRecord(record);
  if (!model) return null;

  const format = stringValue(model.format);
  const name = stringValue(model.name);
  const version = stringValue(model.version);
  const publisher = publisherName(model);
  const lifecycle = normalizedLifecycle(model.lifecycleStatus);
  const family = claudeFamily(name);
  const chatCompletion = booleanValue(model.capabilities?.chatCompletion);
  const skus = normalizeSkus(model.skus);

  if (
    format.toLowerCase() !== "anthropic" ||
    publisher.toLowerCase() !== "anthropic" ||
    !name ||
    !version ||
    !family ||
    !chatCompletion ||
    !lifecycle ||
    skus.length === 0
  ) {
    return null;
  }

  return {
    key: modelKey(format, name, version),
    format,
    name,
    version,
    publisher,
    family,
    lifecycle,
    isDefaultVersion: booleanValue(model.isDefaultVersion),
    capabilities: {
      chatCompletion: true,
      hostedOn: stringValue(model.capabilities?.hostedOn).toLowerCase() || null,
    },
    deprecationDate:
      stringValue(model.deprecation?.inference || model.inferenceDeprecationDate) || null,
    region,
    skus,
  };
}

function conflictWarning(key, field, values, regions) {
  return {
    key,
    field,
    values: [...new Set(values)].sort(),
    regions: [...new Set(regions)].sort(),
  };
}

function mergeRegionRecords(records, region, warnings) {
  const models = new Map();
  const normalizedRecords = records
    .map((record) => normalizeRecord(record, region))
    .filter(Boolean)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  for (const normalized of normalizedRecords) {
    const existing = models.get(normalized.key);
    if (!existing) {
      models.set(normalized.key, normalized);
      continue;
    }

    for (const field of ["publisher", "lifecycle"]) {
      if (existing[field] !== normalized[field]) {
        warnings.push(
          conflictWarning(
            normalized.key,
            field,
            [existing[field], normalized[field]],
            [region]
          )
        );
      }
    }
    if (existing.capabilities.hostedOn !== normalized.capabilities.hostedOn) {
      warnings.push(
        conflictWarning(
          normalized.key,
          "capabilities.hostedOn",
          [existing.capabilities.hostedOn || "unavailable", normalized.capabilities.hostedOn || "unavailable"],
          [region]
        )
      );
      existing.capabilities.hostedOn = null;
    }
    if (existing.lifecycle !== normalized.lifecycle) existing.lifecycle = "Preview";
    if (existing.isDefaultVersion !== normalized.isDefaultVersion) {
      warnings.push(
        conflictWarning(
          normalized.key,
          "isDefaultVersion",
          [existing.isDefaultVersion, normalized.isDefaultVersion],
          [region]
        )
      );
      existing.isDefaultVersion = false;
    }
    if (existing.deprecationDate !== normalized.deprecationDate) {
      warnings.push(
        conflictWarning(
          normalized.key,
          "deprecationDate",
          [existing.deprecationDate || "unavailable", normalized.deprecationDate || "unavailable"],
          [region]
        )
      );
      existing.deprecationDate = [existing.deprecationDate, normalized.deprecationDate]
        .filter(Boolean)
        .sort()[0] || null;
    }
    existing.skus = normalizeSkus([...existing.skus, ...normalized.skus]);
  }
  return models;
}

function buildSnapshot(regionPayloads, generatedAt = new Date().toISOString()) {
  const regionNames = Object.keys(regionPayloads).sort();
  if (
    regionNames.length !== REQUIRED_REGIONS.length ||
    REQUIRED_REGIONS.some((region) => !regionNames.includes(region))
  ) {
    throw new Error(`Catalog input must contain exactly: ${REQUIRED_REGIONS.join(", ")}.`);
  }
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("generatedAt must be an ISO-8601 timestamp.");
  }

  const warnings = [];
  const regional = new Map();
  for (const region of REQUIRED_REGIONS) {
    const records = unwrapPayload(regionPayloads[region]);
    if (records.length === 0) {
      throw new Error(`The ${region} catalog response is empty or malformed.`);
    }
    const models = mergeRegionRecords(records, region, warnings);
    if (models.size === 0) {
      throw new Error(`The ${region} catalog contains no eligible Claude GlobalStandard models.`);
    }
    regional.set(region, models);
  }

  const combined = new Map();
  for (const region of REQUIRED_REGIONS) {
    for (const regionalModel of regional.get(region).values()) {
      let model = combined.get(regionalModel.key);
      if (!model) {
        model = {
          key: regionalModel.key,
          format: regionalModel.format,
          name: regionalModel.name,
          version: regionalModel.version,
          publisher: regionalModel.publisher,
          family: regionalModel.family,
          capabilities: { chatCompletion: true },
          regions: {},
        };
        combined.set(model.key, model);
      } else {
        for (const field of ["publisher"]) {
          if (model[field] !== regionalModel[field]) {
            warnings.push(
              conflictWarning(
                model.key,
                field,
                [model[field], regionalModel[field]],
                [...Object.keys(model.regions), region]
              )
            );
          }
        }
      }
      model.regions[region] = {
        lifecycle: regionalModel.lifecycle,
        isDefaultVersion: regionalModel.isDefaultVersion,
        capabilities: { hostedOn: regionalModel.capabilities.hostedOn },
        deprecationDate: regionalModel.deprecationDate,
        skus: regionalModel.skus,
      };
    }
  }

  const models = [...combined.values()].sort((left, right) =>
    [left.family, left.name, left.version].join("|").localeCompare(
      [right.family, right.name, right.version].join("|"),
      undefined,
      { numeric: true }
    )
  );
  warnings.sort((left, right) =>
    [left.key, left.field, left.regions.join(","), left.values.join(",")].join("|").localeCompare(
      [right.key, right.field, right.regions.join(","), right.values.join(",")].join("|")
    )
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date(generatedAt).toISOString(),
    source: {
      type: "Azure Cognitive Services regional Models API",
      command: "az cognitiveservices model list",
      referenceSubscription: true,
    },
    regions: [...REQUIRED_REGIONS],
    warnings,
    models,
  };
}

function semanticSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const { generatedAt, ...semantic } = snapshot;
  return semantic;
}

function preserveGeneratedAt(snapshot, previous) {
  if (
    previous &&
    Number.isFinite(Date.parse(previous.generatedAt)) &&
    JSON.stringify(semanticSnapshot(previous)) === JSON.stringify(semanticSnapshot(snapshot))
  ) {
    return { ...snapshot, generatedAt: new Date(previous.generatedAt).toISOString() };
  }
  return snapshot;
}

function readSnapshot(filePath) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return context.window.EZDEPLOY_CATALOG_SNAPSHOT;
}

function serializeSnapshot(snapshot) {
  return `window.EZDEPLOY_CATALOG_SNAPSHOT = Object.freeze(${JSON.stringify(snapshot, null, 2)});\n`;
}

function writeSnapshotAtomic(outputPath, snapshot) {
  const directory = path.dirname(outputPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    fs.writeFileSync(temporaryPath, serializeSnapshot(snapshot), "utf8");
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function parseArguments(args) {
  const options = { regions: {} };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--region") {
      const value = args[++index] || "";
      const separator = value.indexOf("=");
      if (separator < 1 || separator === value.length - 1) {
        throw new Error("--region must use REGION=PATH.");
      }
      options.regions[value.slice(0, separator).toLowerCase()] = value.slice(separator + 1);
    } else if (argument === "--output") {
      options.output = args[++index];
    } else if (argument === "--generated-at") {
      options.generatedAt = args[++index];
    } else if (argument === "--previous") {
      options.previous = args[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.output) throw new Error("--output is required.");
  return options;
}

function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const payloads = {};
  for (const region of REQUIRED_REGIONS) {
    const inputPath = options.regions[region];
    if (!inputPath) throw new Error(`Missing --region ${region}=PATH.`);
    payloads[region] = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  }
  let snapshot = buildSnapshot(payloads, options.generatedAt);
  if (options.previous && fs.existsSync(options.previous)) {
    try {
      snapshot = preserveGeneratedAt(snapshot, readSnapshot(options.previous));
    } catch {
      // A valid refresh repairs a malformed previous snapshot with a new timestamp.
    }
  }
  writeSnapshotAtomic(options.output, snapshot);
  process.stdout.write(
    `Generated ${snapshot.models.length} normalized models for ${snapshot.regions.join(", ")}.\n`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Catalog generation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_REGIONS,
  buildSnapshot,
  modelKey,
  normalizeRecord,
  normalizeSkus,
  parseArguments,
  preserveGeneratedAt,
  readSnapshot,
  semanticSnapshot,
  serializeSnapshot,
  skuKey,
  unwrapPayload,
  writeSnapshotAtomic,
};
