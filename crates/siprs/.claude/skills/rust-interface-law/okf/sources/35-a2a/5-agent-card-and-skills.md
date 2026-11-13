---
type: "Section"
title: "5. Agent Card and Skills"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/35-A2A.md"
    id: "35-a2a-5-agent-card-and-skills"
    title: "5. Agent Card and Skills"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/35-A2A.md"
x-source-span: "111-124"
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

