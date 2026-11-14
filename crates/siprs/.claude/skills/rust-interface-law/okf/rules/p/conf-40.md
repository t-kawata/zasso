---
type: "Rule"
title: "CONF-40 — Documentation, file existence, and fixture names are not proof."
description: "Documentation, file existence, and fixture names are not proof."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-40"
    title: "CONF-40"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "conformance"
x-enforcement: "cargo test -p <project>-conformance"
x-parent: "CONF"
x-phase: "conformance"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "P"
x-rule-id: "CONF-40"
x-source-part: "Part III.12"
x-source-span: "249-249"
x-verification: "V3 report inspection; V4 review."
---
# CONF-40

Documentation, file existence, and fixture names are not proof.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 report inspection; V4 review. |
| Enforcement | cargo test -p <project>-conformance |

[13. Dependency and Rule Coverage](../../sources/part-iii-12/13-dependency-and-rule-coverage.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CONF-37 — The crate graph passes the forbidden-edge checks.](conf-37.md)
- [CONF-38 — Every rule ID in the registry has a verdict.](conf-38.md)
- [CONF-39 — A missing verification is a failure, not a skip.](conf-39.md)
- [CONF-41 — The report names every failed row and every rule without evidence.](conf-41.md)

[^conf-40]: sources/EXPERT-REVIEW-PACKAGE.md

