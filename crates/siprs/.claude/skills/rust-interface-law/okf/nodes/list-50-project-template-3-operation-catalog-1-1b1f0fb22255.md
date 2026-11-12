---
type: List
id: list/50-project-template-3-operation-catalog/1/1b1f0fb22255
phase: scope
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 1b1f0fb2225584b3bc01079b055c01a1a523d8abda3d72a2d7f04233ca8c82c5
source: docs/archive/IMPLEMENTATION-SPEC/50-PROJECT-TEMPLATE.md
---
- a duplicate operation ID;
- a tool/skill/CLI name collision after `.` → `_` and kebab-case conversion;
- a binding for a profile that is `false`;
- a missing binding for a profile that is `true`;
- a missing conformance ID or handler;
- a `scope` on an anonymous operation;
- a `recovery` value not declared for an operation with external effects.
