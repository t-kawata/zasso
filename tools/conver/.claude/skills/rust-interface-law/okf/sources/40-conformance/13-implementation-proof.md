---
type: "Section"
title: "13. Implementation Proof"
description: "Implementation proof is separate from behavior proof."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-13-implementation-proof"
    title: "13. Implementation Proof"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "355-367"
---
## 13. Implementation Proof

Implementation proof is separate from behavior proof.

| Level | Proof |
|---|---|
| V1 | Process scan: stubs, secrets, English, test weakening |
| V2 | Dependency, feature, edge, source identity, template equality, law identity |
| V3 | Project compile and interface contract tests |
| V4 | Human attestation for SDK binding, tenant boundary, TLS trust, retention |

A V1 pass is not rule-level proof. A missing implementation report, missing test, zero selected tests, or failed detector is a failure. The implementation report MUST name `IMP-01` through `IMP-12`.

