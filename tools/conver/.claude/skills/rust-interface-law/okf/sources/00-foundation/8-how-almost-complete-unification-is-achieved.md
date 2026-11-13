---
type: "Section"
title: "8. How “Almost Complete Unification” Is Achieved"
description: "Rules alone cannot make two codebases almost identical. The ruleset therefore"
sources: 
  - resource: "sources/00-FOUNDATION.md"
    id: "00-foundation-8-how-almost-complete-unification-is-achieved"
    title: "8. How “Almost Complete Unification” Is Achieved"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/00-FOUNDATION.md"
x-source-span: "229-250"
---
## 8. How “Almost Complete Unification” Is Achieved

Rules alone cannot make two codebases almost identical. The ruleset therefore
requires four mechanisms working together.

| Mechanism | What it unifies |
|---|---|
| Shared contract crate | Types, traits, envelope, identity, errors, conformance harness. |
| Generator | Adapter skeletons, bindings, mappings, matrix rows. |
| Conformance kit | Observable behavior, authorization outcomes, negative cases. |
| Golden reference | File layout, naming, module structure, review patterns. |

A project that passes conformance but uses a different file layout is still
unified at the seam but not at the code level. To reach code-level unity, the
shared contract crate and generator are mandatory; conformance is the proof, not
the substitute.

The generator and shared crate are versioned together. A project pins the
version. Upgrading is a deliberate act, never an implicit drift.

---

