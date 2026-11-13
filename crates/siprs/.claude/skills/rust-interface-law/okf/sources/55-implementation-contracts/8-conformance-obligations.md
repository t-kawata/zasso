---
type: "Section"
title: "8. Conformance Obligations"
description: "1. Every interface has one admitted crate, exact version, and feature set."
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "55-implementation-contracts-8-conformance-obligations"
    title: "8. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/55-IMPLEMENTATION-CONTRACTS.md"
x-source-span: "124-133"
---
## 8. Conformance Obligations

1. Every interface has one admitted crate, exact version, and feature set.
2. Every implementation rule has a detector or an attestation row.
3. Every project writes `effective-policy.json` and records its hash.
4. Every generated adapter carries RULE annotations and template provenance.
5. Every gate report distinguishes V1 process proof from V2/V3 implementation proof.
6. Every mismatch, missing report, missing test, or failed detector fails closed.
7. The conformance report names `IMP-01` through `IMP-12`.

