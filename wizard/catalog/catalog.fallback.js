(() => {
  const regions = ["eastus2", "swedencentral"];
  const rows = [
    ["haiku", "claude-haiku-4-5", "2", true, "azure", "AIServices.GlobalStandard.claude-haiku-4-5.Azure"],
    ["haiku", "claude-haiku-4-5", "20251001", false, "anthropic", "AIServices.GlobalStandard.claude-haiku-4-5"],
    ["opus", "claude-opus-4-5", "20251101", true, null, "AIServices.GlobalStandard.claude-opus-4-5"],
    ["opus", "claude-opus-4-6", "1", true, null, "AIServices.GlobalStandard.claude-opus-4-6"],
    ["opus", "claude-opus-4-7", "1", true, null, "AIServices.GlobalStandard.claude-opus-4-7"],
    ["opus", "claude-opus-4-8", "1", false, "anthropic", "AIServices.GlobalStandard.claude-opus-4-8"],
    ["opus", "claude-opus-4-8", "2", true, "azure", "AIServices.GlobalStandard.claude-opus-4-8.Azure"],
    ["opus", "claude-opus-5", "1", false, "anthropic", "AIServices.GlobalStandard.claude-opus-5"],
    ["opus", "claude-opus-5", "2", true, "azure", "AIServices.GlobalStandard.claude-opus-5.Azure"],
    ["sonnet", "claude-sonnet-4-5", "20250929", true, null, "AIServices.GlobalStandard.claude-sonnet-4-5"],
    ["sonnet", "claude-sonnet-4-6", "1", true, null, "AIServices.GlobalStandard.claude-sonnet-4-6"],
    ["sonnet", "claude-sonnet-5", "1", false, "anthropic", "AIServices.GlobalStandard.claude-sonnet-5"],
    ["sonnet", "claude-sonnet-5", "2", true, "azure", "AIServices.GlobalStandard.claude-sonnet-5.Azure"],
  ];
  const models = rows.map(([family, name, version, isDefaultVersion, hostedOn, usageName]) => ({
    key: `anthropic|${name}|${version}`,
    format: "Anthropic",
    name,
    version,
    publisher: "Anthropic",
    family,
    capabilities: { chatCompletion: true },
    regions: Object.fromEntries(
      regions.map((region) => [
        region,
        {
          lifecycle: "GA",
          isDefaultVersion,
          capabilities: { hostedOn },
          deprecationDate: null,
          skus: [{ name: "GlobalStandard", usageName, capacity: null, deprecationDate: null }],
        },
      ])
    ),
  }));

  window.EZDEPLOY_CATALOG_FALLBACK = Object.freeze({
    schemaVersion: 1,
    generatedAt: null,
    source: {
      type: "Human-curated emergency fallback",
      referenceSubscription: false,
    },
    regions,
    warnings: [],
    models,
  });
})();
