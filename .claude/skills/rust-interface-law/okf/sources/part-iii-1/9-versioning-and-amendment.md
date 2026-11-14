---
type: "Section"
title: "9. Versioning and Amendment"
description: "| ID | Rule |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-1/9-versioning-and-amendment"
    title: "9. Versioning and Amendment"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-1/9-versioning-and-amendment"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1373-1373"
---
## 9. Versioning and Amendment

| ID | Rule |
|---|---|
| VER-01 | The ruleset, shared contracts, generator, and conformance kit share one version. |
| VER-02 | A project pins the version in `RULES-PROFILE.toml`. |
| VER-03 | Removing or changing a closed seam requires a major version and a migration note. |
| VER-04 | Adding an open extension point is a minor version. |
| VER-05 | Adding a rule that would reject a previously valid project requires a major version. |
| VER-06 | A rule that blocks a legitimate feature is amended by extending the seam, not by granting an exception. |

---

## 10. Non-Goals

## Rules in this section

- [VER-01 — The ruleset, shared contracts, generator, and conformance kit share one version.](../../rules/g/ver-01.md)
- [VER-02 — A project pins the version in `RULES-PROFILE.toml`.](../../rules/g/ver-02.md)
- [VER-03 — Removing or changing a closed seam requires a major version and a migration n...](../../rules/g/ver-03.md)
- [VER-04 — Adding an open extension point is a minor version.](../../rules/g/ver-04.md)
- [VER-05 — Adding a rule that would reject a previously valid project requires a major v...](../../rules/g/ver-05.md)
- [VER-06 — A rule that blocks a legitimate feature is amended by extending the seam, not...](../../rules/g/ver-06.md)

