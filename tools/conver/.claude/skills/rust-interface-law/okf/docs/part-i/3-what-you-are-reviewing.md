---
type: "Documentation"
title: "3. What You Are Reviewing"
description: "This package contains:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/3-what-you-are-reviewing"
    title: "3. What You Are Reviewing"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/3-what-you-are-reviewing"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "101-101"
---
## 3. What You Are Reviewing

This package contains:

- **Part II**: the normative rules.
- **Part III**: the concrete specification,
  including exact Rust types and traits, crate layouts, public APIs, generated
  files, interface rules, conformance obligations, project template, and
  migration plan.
- **Part III.15**: the canonical rule registry.
- **Part III.16**: the documentation generation rules.
- **Part III.17**: the validation declaration rules.
- **Part III.18**: the mandatory implementation blueprint.
- **Part IV**: a document map and self-containment statement.

The rules use four classes:

| Class | Meaning |
|---|---|
| **C — Closed contract** | A seam that must not vary. |
| **G — Generated** | Mechanical output derived from the operation catalog. |
| **O — Open extension** | How a project adds something new without changing the seam. |
| **P — Proof** | How compliance is demonstrated. |

Every rule states **Fixed** (what is frozen) and **Open** (what is left free).
A rule that cannot name its Open part is over-specified. A rule that cannot name
its Fixed part is not a rule.

---

## 4. The Two Success Conditions in Detail

