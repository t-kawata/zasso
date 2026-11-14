---
type: "Section"
title: "5. Agent Card and Skills"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-11/5-agent-card-and-skills"
    title: "5. Agent Card and Skills"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-11/5-agent-card-and-skills"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5245-5245"
---
## 5. Agent Card and Skills

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-01 | The agent card is generated from the catalog. | Generation. | Name, description, provider metadata. | V2 schema check. |
| A2A-02 | Every applicable operation has one skill. | Mapping rule. | Applicable subset. | V3 catalog test. |
| A2A-03 | A skill carries the operation ID and its input/output modes. | Fields. | Descriptions and examples. | V3 schema test. |
| A2A-04 | A skill marked not applicable states a reason in the catalog. | Reason required. | — | V3 test. |

The skill identifier is the operation ID with `.` replaced by `_`, optionally
prefixed, matching the MCP convention.

---

## 6. Task Mapping

## Rules in this section

- [A2A-01 — The agent card is generated from the catalog.](../../rules/g/a2a-01.md)
- [A2A-02 — Every applicable operation has one skill.](../../rules/c/a2a-02.md)
- [A2A-03 — A skill carries the operation ID and its input/output modes.](../../rules/c/a2a-03.md)
- [A2A-04 — A skill marked not applicable states a reason in the catalog.](../../rules/c/a2a-04.md)

