---
type: Table
id: table/foundation-unify-seams-not-substance-1-the-four-rule-classes/1/660f25115a8c
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 660f25115a8cacc71dfd3cd7bb51131054991dae4ff0d62518b39435bef02f01
source: docs/archive/IMPLEMENTATION-SPEC/00-FOUNDATION.md
---
| Class | What it fixes | What it leaves open | Example |
|---|---|---|---|
| **C — Closed contract** | Shared types, wire shapes, token validation order, error categories, dependency direction, authorization location. | How the domain is modeled, which operations exist, which storage is used. | `InvocationContext`, `AuthenticatedContext`, and `AnonymousContext` have exactly the fields defined in `Part III.2`. |
| **G — Generated** | Mechanical files and bindings derived from the operation catalog. | Hand-written handler bodies, policies, compensations. | REST routes, CLI commands, proto services, conformance matrix rows. |
| **O — Open extension** | The trait, registration point, and conformance obligation for adding something. | How many operations, scopes, auth methods, interfaces, or backends a project adds. | A new auth method implements `CredentialVerifier` and calls `TokenIssuer`. |
| **P — Proof** | Test harness shape, oracle obligations, negative cases. | The implementation under test. | Every interface passes the same operation × interface matrix. |
