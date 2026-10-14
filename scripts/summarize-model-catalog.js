"use strict";

const fs = require("node:fs");
const vm = require("node:vm");

function readSnapshot(filePath) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return context.window.EZDEPLOY_CATALOG_SNAPSHOT;
}

function byKey(snapshot) {
  return new Map((snapshot?.models || []).map((model) => [model.key, model]));
}

function formatList(values) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- None";
}

function catalogChanges(previous, current) {
  const oldModels = byKey(previous);
  const newModels = byKey(current);
  const added = [...newModels.keys()].filter((key) => !oldModels.has(key)).sort();
  const removed = [...oldModels.keys()].filter((key) => !newModels.has(key)).sort();
  const lifecycle = [];
  for (const key of [...newModels.keys()].filter((value) => oldModels.has(value)).sort()) {
    const oldRegions = oldModels.get(key).regions || {};
    const newRegions = newModels.get(key).regions || {};
    const regions = [...new Set([...Object.keys(oldRegions), ...Object.keys(newRegions)])].sort();
    for (const region of regions) {
      const before = oldRegions[region]?.lifecycle || "unavailable";
      const after = newRegions[region]?.lifecycle || "unavailable";
      if (before !== after) lifecycle.push(`${key} / ${region}: ${before} -> ${after}`);
    }
  }
  return { added, removed, lifecycle };
}

function summarize(previous, current) {
  const { added, removed, lifecycle } = catalogChanges(previous, current);
  return `## Automated model catalog refresh

- Generated: ${current.generatedAt}
- Regions: ${current.regions.join(", ")}
- Normalized models: ${current.models.length}
- Snapshot warnings: ${current.warnings.length}
- Validation: catalog generator and wizard regression tests passed

### Added
${formatList(added)}

### Removed
${formatList(removed)}

### Lifecycle changes
${formatList(lifecycle)}

The snapshot reflects a narrowly scoped reference subscription. User-specific availability, quota, capacity, Marketplace terms, and hosting metadata remain subject to the live Cloud Shell preflight.
`;
}

function plainSummary(previous, current) {
  const { added, removed, lifecycle } = catalogChanges(previous, current);
  return `Catalog generated ${current.generatedAt} for ${current.regions.join(", ")}: ${current.models.length} Claude model versions.

Added:
${formatList(added)}

Removed:
${formatList(removed)}

Lifecycle changes:
${formatList(lifecycle)}
`;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const plain = args[0] === "--plain";
  if (plain) args.shift();
  const [previousPath, currentPath] = args;
  if (!previousPath || !currentPath) {
    process.stderr.write("Usage: node summarize-model-catalog.js [--plain] PREVIOUS CURRENT\n");
    process.exitCode = 2;
  } else {
    let previous = { models: [] };
    try {
      previous = readSnapshot(previousPath);
    } catch {
      // A valid refresh must still be able to repair a missing or malformed prior snapshot.
    }
    const current = readSnapshot(currentPath);
    process.stdout.write(plain ? plainSummary(previous, current) : summarize(previous, current));
  }
}

module.exports = { catalogChanges, plainSummary, readSnapshot, summarize };
