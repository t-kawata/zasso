---
type: "Section"
title: "12. Versioning"
description: "A single `spec_version` covers the rules, these contracts, the generator, and"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-12-versioning"
    title: "12. Versioning"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "1447-1465"
---
## 12. Versioning

A single `spec_version` covers the rules, these contracts, the generator, and
the conformance kit. Protocol SDK versions are recorded separately.

| Change | Version |
|---|---|
| New operation, scope, error code, auth method, interface constant | Minor |
| New default method on an extension trait | Minor |
| New required field in a context, case, or envelope | Major |
| Changed token validation order or required claims | Major |
| Changed error category table | Major |
| Removed or renamed a type, field, or trait method | Major |

A project pins `spec_version` in `RULES-PROFILE.toml`. The generator and the
conformance kit must report the same version; a mismatch fails startup.

---

