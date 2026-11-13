---
type: "Section"
title: "3. Coverage"
description: "The registry extraction covers normative rule tables. A prose paragraph that"
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "15-rule-registry-3-coverage"
    title: "3. Coverage"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/15-RULE-REGISTRY.md"
x-source-span: "489-496"
---
## 3. Coverage

The registry extraction covers normative rule tables. A prose paragraph that
uses MUST/MUST NOT without a rule ID is a coverage defect. The project rule
extractor MUST scan prose MUST/MUST NOT and fail when it finds an unlabeled
obligation. A conformance report marks `NotApplicable` only when the rule's
applicability profile is absent from `RULES-PROFILE.toml`.

