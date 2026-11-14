---
type: "Rule"
title: "VER-05 — Adding a rule that would reject a previously valid project requires a major version."
description: "Adding a rule that would reject a previously valid project requires a major version."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "ver-05"
    title: "VER-05"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "human review"
x-parent: "VER"
x-phase: "review"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "G"
x-rule-id: "VER-05"
x-source-part: "Part II"
x-source-span: "1381-1381"
x-verification: "V4 review."
---
# VER-05

Adding a rule that would reject a previously valid project requires a major version.

| Field | Value |
|---|---|
| Class | G |
| Applies to | all |
| Parent | VER |
| Source part | Part II |
| Verification | V4 review. |
| Enforcement | human review |

[9. Versioning and Amendment](../../sources/part-iii-1/9-versioning-and-amendment.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [VER-01 — The ruleset, shared contracts, generator, and conformance kit share one version.](ver-01.md)
- [VER-02 — A project pins the version in `RULES-PROFILE.toml`.](ver-02.md)
- [VER-03 — Removing or changing a closed seam requires a major version and a migration n...](ver-03.md)
- [VER-04 — Adding an open extension point is a minor version.](ver-04.md)
- [VER-06 — A rule that blocks a legitimate feature is amended by extending the seam, not...](ver-06.md)

[^ver-05]: sources/EXPERT-REVIEW-PACKAGE.md

