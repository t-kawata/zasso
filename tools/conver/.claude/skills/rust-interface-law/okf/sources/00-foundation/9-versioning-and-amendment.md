---
type: "Section"
title: "9. Versioning and Amendment"
description: "| ID | Rule |"
sources: 
  - resource: "sources/00-FOUNDATION.md"
    id: "00-foundation-9-versioning-and-amendment"
    title: "9. Versioning and Amendment"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/00-FOUNDATION.md"
x-source-span: "251-263"
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

