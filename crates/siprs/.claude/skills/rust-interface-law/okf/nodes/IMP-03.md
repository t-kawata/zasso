---
type: Rule
id: IMP-03
phase: adapter
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 1f44b0b307824cd426ef0e7a2f64ee6f3a8be563f44e3c3ffa8a570409fbf55c
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `IMP-03` | C | all | IMP | Part III.17 | Adapter dependency edges MUST reach the dispatcher and identity contracts and MUST NOT reach operation implementations or business storage. | V2 graph check. | implementation-check |
