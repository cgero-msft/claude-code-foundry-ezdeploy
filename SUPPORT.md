# Support

This repository is an unofficial community sample and does not include Microsoft or Anthropic product support.

## Repository questions

Use GitHub issues for reproducible problems or documentation gaps in this repository. Include:

- Operating system and shell.
- Azure CLI version.
- The command or workflow stage that failed.
- Sanitized error output.
- The exact catalog model and version selected.

Remove subscription IDs, tenant IDs, organization details, access tokens, credentials, and other sensitive data before posting.

Use the private security-reporting process described in [SECURITY.md](SECURITY.md) for suspected vulnerabilities.

For inference 401 or 403 errors, verify the tenant and account scope and confirm the user has a runtime role recognized by the engine: Cognitive Services User, Cognitive Services OpenAI User, Cognitive Services OpenAI Contributor, Foundry User, Foundry Owner, Foundry Project Manager, Azure AI Project Manager, Azure AI User, Azure AI Owner, or Azure AI Developer. Owner, Contributor, Cognitive Services Contributor, Foundry Account Owner, and Azure AI Account Owner are management-plane roles and are not sufficient by themselves.

New accounts are Entra-only. Reused accounts preserve their existing local-authentication setting by default. If `--disable-local-auth-on-reuse` was selected, check whether an existing workload still depends on account keys; the engine requires explicit confirmation because disabling local authentication can break that workload.

## Product and service support

Use the appropriate official support channel for:

- Azure subscription, quota, billing, Marketplace, RBAC, networking, regional availability, or Microsoft Foundry service issues.
- Anthropic model behavior, commercial terms, or Claude Code product issues.
- Organization-specific security, compliance, procurement, or data-governance decisions.

Repository maintainers cannot grant Azure access, increase quota, accept commercial terms, diagnose private tenant configuration, or make support commitments on behalf of Microsoft or Anthropic.
