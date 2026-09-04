"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const generatorPath = path.resolve(
  process.argv[2] || path.resolve(__dirname, "..", "scripts", "generate-model-catalog.js")
);
const repositoryRoot = path.resolve(path.dirname(generatorPath), "..");
const workflowPath = path.join(repositoryRoot, ".github", "workflows", "refresh-model-catalog.yml");
const {
  buildSnapshot,
  normalizeSkus,
  preserveGeneratedAt,
  writeSnapshotAtomic,
} = require(generatorPath);
const summaryPath = path.join(repositoryRoot, "scripts", "summarize-model-catalog.js");
const { summarize } = require(summaryPath);

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

function model(overrides = {}) {
  return {
    model: {
      name: "claude-sonnet-5",
      version: "2",
      format: "Anthropic",
      lifecycleStatus: "GenerallyAvailable",
      isDefaultVersion: true,
      publisher: { name: "Anthropic" },
      capabilities: { chatCompletion: "true", hostedOn: "azure" },
      skus: [
        {
          name: "GlobalStandard",
          usageName: "AIServices.GlobalStandard.claude-sonnet-5.Azure",
          capacity: { default: 10, maximum: 1000 },
        },
      ],
      ...overrides,
    },
  };
}

function payloads(east = [model()], sweden = [model()]) {
  return { eastus2: east, swedencentral: { value: sweden } };
}

test("deduplicates API records by format, name, and version", () => {
  const snapshot = buildSnapshot(payloads([model(), model()], [model(), model()]), "2026-09-03T12:00:00Z");
  assert.equal(snapshot.models.length, 1);
  assert.deepEqual(Object.keys(snapshot.models[0].regions), ["eastus2", "swedencentral"]);
});

test("deduplicates SKUs by name and usageName", () => {
  const sku = {
    name: "GlobalStandard",
    usageName: "AIServices.GlobalStandard.claude-sonnet-5.Azure",
  };
  assert.equal(normalizeSkus([sku, { ...sku }]).length, 1);
  assert.throws(
    () => normalizeSkus([
      { ...sku, capacity: { maximum: 100 } },
      { ...sku, capacity: { maximum: 200 } },
    ]),
    /Conflicting duplicate SKU metadata/
  );
});

test("retains only Anthropic Claude chat-completion GlobalStandard GA and Preview rows", () => {
  const eligiblePreview = model({
    name: "claude-opus-5",
    lifecycleStatus: "Preview",
  });
  const excluded = [
    model({ publisher: { name: "Other" } }),
    model({ name: "other-model" }),
    model({ capabilities: { chatCompletion: "false" } }),
    model({ lifecycleStatus: "Deprecated" }),
    model({ skus: [{ name: "ProvisionedManaged", usageName: "other" }] }),
  ];
  const snapshot = buildSnapshot(
    payloads([model(), eligiblePreview, ...excluded], [model(), eligiblePreview]),
    "2026-09-03T12:00:00Z"
  );
  assert.deepEqual(
    snapshot.models.map(
      (entry) => `${entry.name}@${entry.version}:${entry.regions.eastus2.lifecycle}`
    ),
    ["claude-opus-5@2:Preview", "claude-sonnet-5@2:GA"]
  );
});

test("records conflicting hosting metadata as a warning", () => {
  const snapshot = buildSnapshot(
    payloads(
      [model(), model({ capabilities: { chatCompletion: "true", hostedOn: "anthropic" } })],
      [model()]
    ),
    "2026-09-03T12:00:00Z"
  );
  assert.equal(snapshot.models[0].regions.eastus2.capabilities.hostedOn, null);
  assert.equal(snapshot.warnings[0].field, "capabilities.hostedOn");
});

test("resolves duplicate default and deprecation conflicts conservatively and deterministically", () => {
  const first = model({
    isDefaultVersion: true,
    deprecation: { inference: "2027-01-01T00:00:00Z" },
  });

  test("preserves the previous timestamp when normalized catalog contents do not change", () => {
    const previous = buildSnapshot(payloads(), "2026-09-01T12:00:00Z");
    const refreshed = buildSnapshot(payloads(), "2026-09-03T12:00:00Z");
    assert.equal(preserveGeneratedAt(refreshed, previous).generatedAt, previous.generatedAt);
    const changed = buildSnapshot(
      payloads([model({ lifecycleStatus: "Preview" })], [model()]),
      "2026-09-03T12:00:00Z"
    );
    assert.equal(preserveGeneratedAt(changed, previous).generatedAt, changed.generatedAt);
  });

  test("catalog summary reports lifecycle changes by region", () => {
    const previous = buildSnapshot(payloads(), "2026-09-01T12:00:00Z");
    const current = buildSnapshot(
      payloads([model({ lifecycleStatus: "Preview" })], [model()]),
      "2026-09-03T12:00:00Z"
    );
    assert.match(
      summarize(previous, current),
      /anthropic\|claude-sonnet-5\|2 \/ eastus2: GA -> Preview/
    );
  });
  const second = model({
    isDefaultVersion: false,
    deprecation: { inference: "2026-12-01T00:00:00Z" },
  });
  const forward = buildSnapshot(payloads([first, second], [first]), "2026-09-03T12:00:00Z");
  const reverse = buildSnapshot(payloads([second, first], [first]), "2026-09-03T12:00:00Z");
  assert.equal(forward.models[0].regions.eastus2.isDefaultVersion, false);
  assert.equal(forward.models[0].regions.eastus2.deprecationDate, "2026-12-01T00:00:00Z");
  assert.deepEqual(forward.models, reverse.models);
  assert(forward.warnings.some((warning) => warning.field === "isDefaultVersion"));
  assert(forward.warnings.some((warning) => warning.field === "deprecationDate"));
});

test("preserves lifecycle, Azure default, and hosting metadata per region", () => {
  const snapshot = buildSnapshot(
    payloads(
      [model({ isDefaultVersion: false })],
      [
        model({
          lifecycleStatus: "Preview",
          capabilities: { chatCompletion: "true", hostedOn: "anthropic" },
        }),
      ]
    ),
    "2026-09-03T12:00:00Z"
  );
  const entry = snapshot.models[0];
  assert.equal(entry.regions.eastus2.lifecycle, "GA");
  assert.equal(entry.regions.eastus2.isDefaultVersion, false);
  assert.equal(entry.regions.eastus2.capabilities.hostedOn, "azure");
  assert.equal(entry.regions.swedencentral.lifecycle, "Preview");
  assert.equal(entry.regions.swedencentral.isDefaultVersion, true);
  assert.equal(entry.regions.swedencentral.capabilities.hostedOn, "anthropic");
});

test("rejects missing, empty, malformed, and ineligible required region data", () => {
  assert.throws(() => buildSnapshot({ eastus2: [model()] }), /exactly/);
  assert.throws(() => buildSnapshot(payloads([], [model()])), /eastus2.*empty or malformed/);
  assert.throws(() => buildSnapshot(payloads({}, [model()])), /eastus2.*empty or malformed/);
  assert.throws(
    () => buildSnapshot(payloads([model({ lifecycleStatus: "Deprecated" })], [model()])),
    /eastus2.*no eligible/
  );
});

test("failed generation cannot overwrite the last-known-good snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ezdeploy-catalog-"));
  const output = path.join(directory, "catalog.generated.js");
  fs.writeFileSync(output, "last-known-good\n", "utf8");
  assert.throws(() => {
    const snapshot = buildSnapshot(payloads([], [model()]));
    writeSnapshotAtomic(output, snapshot);
  });
  assert.equal(fs.readFileSync(output, "utf8"), "last-known-good\n");
});

test("refresh workflow uses OIDC, exact regions, failure issues, and a pull-request branch", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron:\s*"23 8 \* \* \*"/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /uses:\s*azure\/login@v2/);
  assert.match(workflow, /for region in eastus2 swedencentral/);
  assert.match(workflow, /automation\/model-catalog-refresh/);
  assert.match(workflow, /gh pr (create|edit)/);
  assert.match(workflow, /gh pr close/);
  assert.match(workflow, /gh issue (create|edit)/);
  assert.doesNotMatch(workflow, /git push[^\n]*refs\/heads\/main/);
});

console.log(`Catalog generator tests: ${passed} passed, ${failed} failed.`);
process.exitCode = failed === 0 ? 0 : 1;
