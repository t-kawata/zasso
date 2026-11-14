---
type: "Section"
title: "0.7 Rule classes"
description: "Every rule belongs to exactly one class. The class states what the rule is"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/0-7-rule-classes"
    title: "0.7 Rule classes"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/0-7-rule-classes"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "522-522"
---
### 0.7 Rule classes

Every rule belongs to exactly one class. The class states what the rule is
allowed to constrain.

| Class | Purpose | May constrain | Must not constrain |
|---|---|---|---|
| **C — Closed contract** | Freeze a seam that every project and interface must share. | Type shape, wire format, token validation order, error categories, dependency direction, authorization location. | The set of operations, scopes, error codes, features, algorithms, storage, or domain model. |
| **G — Generated** | Define mechanical output derived from the operation catalog. | File layout, adapter skeletons, route/CLI/proto bindings, conformance matrix rows. | Hand-written domain logic or extension behavior. |
| **O — Open extension** | Define how a project adds something new without changing the seams. | The extension trait, registration point, and conformance obligation. | Which operations, scopes, auth methods, interfaces, or storage a project may add. |
| **P — Proof** | Define how compliance is demonstrated. | Test harness shape, oracle obligations, negative cases. | Implementation strategy. |

A rule MUST NOT enumerate a closed set of features. It may only define the seam
through which features are added. For example:

- Correct: “Every operation implements `Operation` and appears in the catalog.”
  (open set of operations)
- Incorrect: “Only the following operations may exist.” (would limit what can be
  built)

The concrete contracts referenced by class C rules live in Part III. That part
fixes exact Rust types and traits; this document fixes the obligations.

### 0.8 Canonical rule registry

