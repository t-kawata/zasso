---
type: "Section"
title: "3. Coverage"
description: "The registry extraction covers normative rule tables. A prose paragraph that"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-15/3-coverage"
    title: "3. Coverage"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-15/3-coverage"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6866-6866"
---
## 3. Coverage

The registry extraction covers normative rule tables. A prose paragraph that
uses MUST/MUST NOT without a rule ID is a coverage defect. The project rule
extractor MUST scan prose MUST/MUST NOT and fail when it finds an unlabeled
obligation. A conformance report marks `NotApplicable` only when the rule's
applicability profile is absent from `RULES-PROFILE.toml`.

## 4. Rule ID Grammar

