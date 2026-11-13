---
type: "Section"
title: "7. No-Limitation Guarantees"
description: "These guarantees are part of the ruleset."
sources: 
  - resource: "sources/00-FOUNDATION.md"
    id: "00-foundation-7-no-limitation-guarantees"
    title: "7. No-Limitation Guarantees"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/00-FOUNDATION.md"
x-source-span: "207-228"
---
## 7. No-Limitation Guarantees

These guarantees are part of the ruleset.

| ID | Guarantee |
|---|---|
| FREE-01 | A rule MUST NOT enumerate a closed set of operations, scopes, error codes, features, or domain types. |
| FREE-02 | A project MAY add operations, scopes, error codes, auth methods, interfaces, streaming modes, and storage without changing this ruleset. |
| FREE-03 | A project MAY use any algorithm, data structure, crate, or optimization behind a port, provided conformance passes. |
| FREE-04 | A project MAY implement a subset of interface profiles; absence must be declared, not inferred. |
| FREE-05 | A project MAY add a project-local extension crate implementing the declared extension traits. The extension MUST pass conformance. |
| FREE-06 | If a shared contract blocks a legitimate feature, the contract is extended with a new default method, trait, feature flag, or version. The project MUST NOT fork the contract. |
| FREE-07 | A rule that limits a feature without protecting a seam or invariant is a defect in the ruleset and MUST be amended. |
| FREE-08 | Rule amendments follow the versioning policy in §9; existing projects are never broken silently. |
| FREE-09 | A project MAY add crate roles for tooling, tests, benchmarks, build support, or utility code. The role and its allowed dependency edges are declared; forbidden edges still apply. |
| FREE-10 | A state-machine requirement applies only to aggregates with a lifecycle. Value objects and stateless aggregates are not forced into a state enum. |
| FREE-11 | Resource identifiers are open. UUID, content hash, and composite keys are all valid behind `ResourceId`. |
| FREE-12 | Interface adoption order is a recommendation, not a precondition. A project MAY implement any subset, including MCP or A2A alone. |
| FREE-13 | Only public module boundaries, generated files, and forbidden edges are fixed. Hand-written internal layout may differ. |

---

