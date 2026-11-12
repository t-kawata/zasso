---
type: Table
id: table/35-a2a-adapter-5-agent-card-and-skills/1/57bea355b7a8
phase: adapter
delivery: reference
applies_to: a2a
requires: []
references: []
content_sha256: 57bea355b7a80b5189b9938f8f1c3e0440faf1f3e78c0f4dbd39681db564fe7e
source: docs/archive/IMPLEMENTATION-SPEC/35-A2A.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-01 | The agent card is generated from the catalog. | Generation. | Name, description, provider metadata. | V2 schema check. |
| A2A-02 | Every applicable operation has one skill. | Mapping rule. | Applicable subset. | V3 catalog test. |
| A2A-03 | A skill carries the operation ID and its input/output modes. | Fields. | Descriptions and examples. | V3 schema test. |
| A2A-04 | A skill marked not applicable states a reason in the catalog. | Reason required. | — | V3 test. |
