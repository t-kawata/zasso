---
type: Table
id: table/foundation-unify-seams-not-substance-3-closed-seams/1/cba04e8ba274
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: cba04e8ba2743408d07e6169af19b13d11c0258c21a1e5ba44cb6feb1eb4e6d2
source: docs/archive/IMPLEMENTATION-SPEC/00-FOUNDATION.md
---
| Seam | Why closed |
|---|---|
| `InvocationContext` and envelope shape | Every interface and operation must speak the same request/reply shape. |
| `VerifiedIdentity` and `SubjectId` | Operations must never see provider-specific identity. |
| Authorization location | An adapter-level check is a bypass for every other interface. |
| Token validation order and required claims | A weaker order is a security defect, not a design choice. |
| Audience separation | Cross-interface token reuse turns one leak into six. |
| Error categories and mapping table | Different mappings make the same failure mean different things per interface. |
| Dependency direction | A transport type in `*-core` destroys portability. |
| Conformance obligations | Without them, “unified” is a claim rather than a proof. |
