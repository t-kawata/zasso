---
type: "Rule"
title: "ARC-02 — Dependencies MUST follow `interface-* → *-operation → *-core` and `interface-* → identity-core`."
description: "Dependencies MUST follow `interface-* → *-operation → *-core` and `interface-* → identity-core`."
sources: 
  - resource: "sources/50-PROJECT-TEMPLATE.md"
    id: "arc-02"
    title: "ARC-02"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo metadata / check-deps"
x-parent: "ARC"
x-phase: "core"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "ARC-02"
x-source-part: "Part II"
x-source-span: "86-86"
x-verification: "V2 `cargo metadata` edge check."
---
# ARC-02

Dependencies MUST follow `interface-* → *-operation → *-core` and `interface-* → identity-core`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V2 `cargo metadata` edge check. |
| Enforcement | cargo metadata / check-deps |

[2. `RULES-PROFILE.toml`](../../sources/50-project-template/2-rules-profile-toml.md)

[^arc-02]: sources/50-PROJECT-TEMPLATE.md

