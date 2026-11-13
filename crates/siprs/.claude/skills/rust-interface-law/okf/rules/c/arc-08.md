---
type: "Rule"
title: "ARC-08 — `*-operation` MUST depend on `identity-core` traits, never on `identity-jwt` or `identity-sso`."
description: "`*-operation` MUST depend on `identity-core` traits, never on `identity-jwt` or `identity-sso`."
sources: 
  - resource: "sources/50-PROJECT-TEMPLATE.md"
    id: "arc-08"
    title: "ARC-08"
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
x-rule-id: "ARC-08"
x-source-part: "Part II"
x-source-span: "86-86"
x-verification: "V2 dependency check."
---
# ARC-08

`*-operation` MUST depend on `identity-core` traits, never on `identity-jwt` or `identity-sso`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V2 dependency check. |
| Enforcement | cargo metadata / check-deps |

[2. `RULES-PROFILE.toml`](../../sources/50-project-template/2-rules-profile-toml.md)

[^arc-08]: sources/50-PROJECT-TEMPLATE.md

