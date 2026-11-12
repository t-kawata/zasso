---
type: List
id: list/90-migration-10-step-7-interfaces/1/01cf36ccb45d
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 01cf36ccb45da822b6031cfc99294e54c4a698e4863d56f7a1a22be3e0a0bca0
source: docs/archive/IMPLEMENTATION-SPEC/90-MIGRATION.md
---
1. Generate bindings from the catalog.
2. Implement the driver contract.
3. Set the profile to `true` in `RULES-PROFILE.toml`.
4. Add the conformance matrix column.
5. Pass the negative suite, audience isolation, and binding checks.
6. Remove the old hand-written path only after the new path passes.
