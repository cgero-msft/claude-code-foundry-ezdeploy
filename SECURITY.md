# Security policy

## Supported versions

Security fixes are applied to the current default branch. This community sample does not maintain supported release branches or provide a service-level agreement.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use the repository's private GitHub security-advisory reporting flow when available. Include:

- The affected file and behavior.
- Reproduction steps.
- The potential impact.
- Any suggested mitigation.

Do not include credentials, tokens, tenant data, customer data, or other secrets in the report.

Vulnerabilities in Azure, Microsoft Foundry, Anthropic models, Claude Code, Azure CLI, or another dependency should also be reported through that vendor's official security process.

## Security boundaries and limitations

This repository is a deployment sample, not a security boundary. Operators remain responsible for reviewing and configuring:

- Azure RBAC and least-privilege access.
- Conditional Access and tenant restrictions.
- Public network access, private endpoints, firewall rules, and data perimeters.
- Data residency, model hosting boundaries, logging, retention, and compliance requirements.
- Regional model availability, quota, Marketplace terms, and cost controls.
- Dependency and installer provenance before running downloaded code.

New accounts are configured with local authentication disabled and use Microsoft Entra ID for inference. Reused accounts preserve their existing local-authentication setting by default to avoid breaking key-authenticated workloads. The engine does not create, retrieve, or store API keys. Generated launchers and workstation files can still contain tenant IDs, subscription IDs, resource names, endpoints, deployment names, model versions, and organization metadata. Treat these as environment information and keep generated files out of source control.

The optional `--disable-local-auth-on-reuse` flag hardens an existing account by disabling local authentication. This can break workloads that still use account keys, so the engine surfaces the change and requires explicit `ACCEPT` or `--yes` confirmation.

Owner, Contributor, Cognitive Services Contributor, Foundry Account Owner, and Azure AI Account Owner are management-plane roles and do not provide Entra inference access. The engine recognizes these runtime roles: Cognitive Services User, Cognitive Services OpenAI User, Cognitive Services OpenAI Contributor, Foundry User, Foundry Owner, Foundry Project Manager, Azure AI Project Manager, Azure AI User, Azure AI Owner, and Azure AI Developer.

The sample does not configure private networking. A created or reused Foundry account can have a public service endpoint unless the operator applies additional Azure network controls.

The generated workstation installers can download and execute Anthropic's published Claude Code installer. Review the generated scripts and applicable organizational policy before running them.

## Operational guidance

Run the generated dry-run launcher before deployment. Review the live model catalog, exact version, SKU, quota pool, requested capacity, Marketplace information, hosting boundary, and target subscription before confirming billable changes.

After deployment, monitor Azure activity logs, role assignments, resource configuration, model usage, and cost. Remove unused deployments and resources explicitly; the engine does not perform automatic cleanup.
