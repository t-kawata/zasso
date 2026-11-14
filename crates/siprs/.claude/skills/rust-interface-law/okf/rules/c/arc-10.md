---
type: "Rule"
title: "ARC-10 — Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`."
description: "Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "arc-10"
    title: "ARC-10"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo metadata / check-deps"
x-parent: "ARC"
x-phase: "core"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "ARC-10"
x-source-part: "Part II"
x-source-span: "58-58"
x-verification: "V4 review."
---
# ARC-10

Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ARC |
| Source part | Part II |
| Verification | V4 review. |
| Enforcement | cargo metadata / check-deps |

[3.2 Rules](../../sources/part-ii-1/3-2-rules.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [ARC-02 — Dependencies MUST follow `interface-* → *-operation → *-core` and `interface-...](arc-02.md)
- [ARC-03 — `*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*...](arc-03.md)
- [ARC-04 — An interface crate MUST NOT depend on another interface crate.](arc-04.md)
- [ARC-05 — `*-conformance` MAY depend on every public boundary; no runtime crate may dep...](arc-05.md)
- [ARC-06 — Only the assembly/binary MAY depend on concrete authentication implementation...](arc-06.md)
- [ARC-07 — `*-core` MUST define ports (traits) for external effects; it MUST NOT call in...](arc-07.md)
- [ARC-08 — `*-operation` MUST depend on `identity-core` traits, never on `identity-jwt` ...](arc-08.md)
- [ARC-09 — Crate names MUST use the project prefix and the role suffix (`<project-c>-cor...](arc-09.md)

[^arc-10]: sources/EXPERT-REVIEW-PACKAGE.md

