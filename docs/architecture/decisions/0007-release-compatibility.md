# ADR 0007: Release matched, versioned artifacts

- Status: Accepted
- Scope: Scaffold releases and compatibility

## Context

The wizard, manifest schema, administration tooling, Bicep modules, APIM policies, validation tests, client packages, MCP packages, skills, and plugins can evolve independently. Mixing untested versions can produce configuration drift or unsafe deployment behavior.

## Decision

Publish matched release sets with semantic versions and an explicit compatibility matrix. The manifest records both schema and scaffold release versions. Tools reject unknown schema major versions and profiles not implemented by the matched release.

## Compatibility policy

- Major release: incompatible contract or behavior change.
- Minor release: backward-compatible capability addition.
- Patch release: backward-compatible fix.
- Schema minor versions may be accepted by a compatible validator within the same major version.
- A supported release declares tested Azure CLI, Foundry API, client, model, profile, and package ranges.
- Release promotion requires upgrade, rollback, and expected-denial evidence.

## Consequences

- Floating artifact versions are not supported.
- Generated launchers and reports must identify their source release.
- A rollback can restore only artifacts and cloud resources that remain available.
- Deprecation notices must identify replacement, dates, and affected compatibility ranges.
