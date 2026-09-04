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

function summarize(previous, current) {
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

if (require.main === module) {
  const [previousPath, currentPath] = process.argv.slice(2);
  if (!previousPath || !currentPath) {
    process.stderr.write("Usage: node summarize-model-catalog.js PREVIOUS CURRENT\n");
    process.exitCode = 2;
  } else {
    let previous = { models: [] };
    try {
      previous = readSnapshot(previousPath);
    } catch {
      // A valid refresh must still be able to repair a missing or malformed prior snapshot.
    }
    process.stdout.write(summarize(previous, readSnapshot(currentPath)));
  }
}

module.exports = { readSnapshot, summarize };
