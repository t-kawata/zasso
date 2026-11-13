---
type: Table
id: table/90-migration-14-risks-and-mitigations/1/21636b308319
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 21636b30831968222326c0993304092aff625c1daf339828069213e1e7d64f0f
source: sources/90-MIGRATION.md
---
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
