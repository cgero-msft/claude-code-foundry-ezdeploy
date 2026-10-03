# ADR 0003: Place APIM in the customer governance boundary

- Status: Accepted
- Scope: APIM-governed profile

## Context

APIM can be shared centrally, dedicated per customer, or integrated with an existing customer gateway. Placement determines identity, network, policy ownership, telemetry, cost, and incident boundaries.

## Decision

The version 1 APIM-governed profile creates a dedicated APIM service in the manifest resource group. It uses public APIM ingress and a public Foundry backend protected by Microsoft Entra authentication, APIM policy, managed identity, and Foundry RBAC. Ownership-tagged reruns are allowed; adoption of an unrelated existing APIM service and private connectivity require a later contract and validation design.

## Rationale

Customer placement keeps policy, logs, identities, and cost within the customer's control and avoids creating a cross-customer gateway service as the initial reference architecture.

## Consequences

- Shared service efficiency is deferred.
- The public network posture is explicit and remains an operator approval item.
- Unrelated existing APIM services are rejected to prevent unreviewed policy or capacity changes.
- Customer-gateway integration remains a separate future profile.
