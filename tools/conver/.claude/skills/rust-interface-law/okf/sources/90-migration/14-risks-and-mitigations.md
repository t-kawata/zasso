---
type: "Section"
title: "14. Risks and Mitigations"
description: "| Risk | Mitigation |"
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-14-risks-and-mitigations"
    title: "14. Risks and Mitigations"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "276-290"
---
## 14. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Existing operations have no stable IDs. | Assign IDs from the catalog and keep a mapping table during migration. |
| Existing auth is entangled with handlers. | Extract to `AccessTokenVerifier` first; keep the old path behind a feature until conformance passes. |
| Crate names and roles conflict. | Rename or split before adding shared crates; record the mapping. |
| Missing `Cargo.toml` in design scaffolds. | Add the workspace manifest as part of Step 1; the generator does not invent packages. |
| Generated code is hand-edited. | Mark generated files and fail the build if a generated header is removed. |
| Interface behavior drifts during migration. | Add the matrix before adding interfaces; a new interface must pass the same cells. |
| SSO is added too early. | Keep `sso = "planned"` until all existing operations pass JWT conformance. |
| Performance regressions. | Keep algorithms behind ports; conformance is behavioral, not performance-based; add benchmarks separately. |

---

