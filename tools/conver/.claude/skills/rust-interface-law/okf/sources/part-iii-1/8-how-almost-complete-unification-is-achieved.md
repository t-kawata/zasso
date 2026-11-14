---
type: "Section"
title: "8. How “Almost Complete Unification” Is Achieved"
description: "Rules alone cannot make two codebases almost identical. The ruleset therefore"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-1/8-how-almost-complete-unification-is-achieved"
    title: "8. How “Almost Complete Unification” Is Achieved"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-1/8-how-almost-complete-unification-is-achieved"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1351-1351"
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

## 9. Versioning and Amendment

