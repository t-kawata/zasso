---
type: "Section"
title: "10. Conformance Obligations"
description: "`*-core` must pass:"
sources: 
  - resource: "sources/20-CORE.md"
    id: "20-core-10-conformance-obligations"
    title: "10. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/20-CORE.md"
x-source-span: "197-210"
---
## 10. Conformance Obligations

`*-core` must pass:

1. Type-level tests for illegal-state rejection.
2. Transition tests for every listed transition and every rejected transition.
3. Port tests with deterministic fakes.
4. Import scan: no transport, JWT, SSO, HTTP, database driver, or file I/O.
5. `cargo test -p <project>-core` and `cargo clippy -p <project>-core -- -D warnings`.

The conformance report names `CORE-01` through `CORE-10`.

---

