---
type: "Documentation"
title: "4.2 No limitation on what can be built"
description: "Judge whether any rule prevents a project from adding something legitimate,"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/4-2-no-limitation-on-what-can-be-built"
    title: "4.2 No limitation on what can be built"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/4-2-no-limitation-on-what-can-be-built"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "155-155"
---
### 4.2 No limitation on what can be built

Judge whether any rule prevents a project from adding something legitimate,
including:

- new operations, scopes, error codes, and domain types;
- new authentication methods and SSO providers;
- new interfaces or streaming modes;
- new storage backends, algorithms, or performance strategies;
- new project-specific crates, modules, tests, benchmarks, fixtures, and
  tooling;
- a different internal architecture behind a port;
- a subset of interfaces (with explicit absence).

A rule that enumerates a closed set of features is a defect. A rule that blocks
a feature to protect a seam must be examined: is the seam truly necessary, and
can it be extended instead of restricting the feature?

---

## 5. Non-Negotiable Constraints

