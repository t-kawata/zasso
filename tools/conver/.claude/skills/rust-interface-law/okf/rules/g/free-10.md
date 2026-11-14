---
type: "Rule"
title: "FREE-10 — A state-machine requirement applies only to aggregates with a lifecycle. Value objects and stateless aggregates are not forced into a state enum."
description: "A state-machine requirement applies only to aggregates with a lifecycle. Value objects and stateless aggregates are not forced into a state enum."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "free-10"
    title: "FREE-10"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "human review"
x-parent: "FREE"
x-phase: "scope"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "G"
x-rule-id: "FREE-10"
x-source-part: "Part II"
x-source-span: "1344-1344"
x-verification: "V4 review."
---
# FREE-10

A state-machine requirement applies only to aggregates with a lifecycle. Value objects and stateless aggregates are not forced into a state enum.

| Field | Value |
|---|---|
| Class | G |
| Applies to | all |
| Parent | FREE |
| Source part | Part II |
| Verification | V4 review. |
| Enforcement | human review |

[7. No-Limitation Guarantees](../../sources/part-iii-1/7-no-limitation-guarantees.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [FREE-01 — A rule MUST NOT enumerate a closed set of operations, scopes, error codes, fe...](free-01.md)
- [FREE-02 — A project MAY add operations, scopes, error codes, auth methods, interfaces, ...](free-02.md)
- [FREE-03 — A project MAY use any algorithm, data structure, crate, or optimization behin...](free-03.md)
- [FREE-04 — A project MAY implement a subset of interface profiles; absence must be decla...](free-04.md)
- [FREE-05 — A project MAY add a project-local extension crate implementing the declared e...](free-05.md)
- [FREE-06 — If a shared contract blocks a legitimate feature, the contract is extended wi...](free-06.md)
- [FREE-07 — A rule that limits a feature without protecting a seam or invariant is a defe...](free-07.md)
- [FREE-08 — Rule amendments follow the versioning policy in §9; existing projects are nev...](free-08.md)
- [FREE-09 — A project MAY add crate roles for tooling, tests, benchmarks, build support, ...](free-09.md)
- [FREE-11 — Resource identifiers are open. UUID, content hash, and composite keys are all...](free-11.md)
- [FREE-12 — Interface adoption order is a recommendation, not a precondition. A project M...](free-12.md)
- [FREE-13 — Only public module boundaries, generated files, and forbidden edges are fixed...](free-13.md)

[^free-10]: sources/EXPERT-REVIEW-PACKAGE.md

