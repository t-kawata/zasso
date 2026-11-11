---
type: Paragraph
id: paragraph/15-rule-registry-3-coverage/1/0a592c5716f6
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 0a592c5716f6001bfdba39d96b235647bb736f766f6c9bfabd51e376cfae24b7
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
The registry extraction covers normative rule tables. A prose paragraph that
uses MUST/MUST NOT without a rule ID is a coverage defect. The project rule
extractor MUST scan prose MUST/MUST NOT and fail when it finds an unlabeled
obligation. A conformance report marks `NotApplicable` only when the rule's
applicability profile is absent from `RULES-PROFILE.toml`.
