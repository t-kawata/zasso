---
type: List
id: list/55-implementation-contracts-8-conformance-obligations/1/301a25d76e42
phase: adapter
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 301a25d76e42d2052b0e6fd7644ccf859b81c4edfe1010fbeeedfb5531fe336f
source: sources/55-IMPLEMENTATION-CONTRACTS.md
---
1. Every interface has one admitted crate, exact version, and feature set.
2. Every implementation rule has a detector or an attestation row.
3. Every project writes `effective-policy.json` and records its hash.
4. Every generated adapter carries RULE annotations and template provenance.
5. Every gate report distinguishes V1 process proof from V2/V3 implementation proof.
6. Every mismatch, missing report, missing test, or failed detector fails closed.
7. The conformance report names `IMP-01` through `IMP-12`.
