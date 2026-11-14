---
type: "Rule"
title: "IMP-12 — Pipeline checkpoints MUST invoke template, implementation-check, gate, and attest through a bounded wrapper."
description: "Pipeline checkpoints MUST invoke template, implementation-check, gate, and attest through a bounded wrapper."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "imp-12"
    title: "IMP-12"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "implementation-check"
x-parent: "IMP"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "IMP-12"
x-source-part: "Part III.17"
x-source-span: "366-366"
x-verification: "V2 command inspection."
---
# IMP-12

Pipeline checkpoints MUST invoke template, implementation-check, gate, and attest through a bounded wrapper.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | IMP |
| Source part | Part III.17 |
| Verification | V2 command inspection. |
| Enforcement | implementation-check |

[13. Implementation Proof](../../sources/40-conformance/13-implementation-proof.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)

[^imp-12]: sources/40-CONFORMANCE.md

