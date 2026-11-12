---
type: List
id: list/90-migration-4-step-1-shared-contract-crates/1/a9453bed80e9
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: a9453bed80e9017594d3ced8a809b5cf3815e1cbfdfeb53b6c4661de06c46441
source: docs/archive/IMPLEMENTATION-SPEC/90-MIGRATION.md
---
1. Add `operation-contract`, `interface-contract`, and `identity-core` as
   dependencies.
2. If the project has a local copy, replace it with the versioned dependency.
3. Do not wrap the shared types in project-specific aliases; the contracts are
   the seam.
