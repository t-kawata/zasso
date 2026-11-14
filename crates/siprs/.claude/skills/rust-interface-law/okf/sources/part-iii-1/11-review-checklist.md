---
type: "Section"
title: "11. Review Checklist"
description: "Before accepting a new rule or a project exception, answer all of these."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-1/11-review-checklist"
    title: "11. Review Checklist"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-1/11-review-checklist"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1401-1401"
---
## 11. Review Checklist

Before accepting a new rule or a project exception, answer all of these.

1. What seam or invariant does the rule fix?
2. What does the rule explicitly leave open?
3. Does the rule enumerate a closed set of features? If yes, rewrite it.
4. Is the rule verifiable by V1, V2, or V3?
5. Can a project add a new operation, scope, error code, auth method, or
   interface without changing the rule?
6. If the rule blocks a legitimate feature, is the correct action an extension
   of the seam rather than an exception?
7. Is the rule class (C/G/O/P) stated?

A rule that fails any of these is not ready.

---

# PART III.2 — Shared Contracts

# 10 — Shared Contracts

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Rule registry:** Part III.15

These contracts are the **closed seams**. Their shape is fixed so that every
project and every interface can be compared, generated, and conformance-tested.
Their **contents** remain open: operations, scopes, error codes, auth methods,
interfaces, and domain types may grow without changing these shapes.

This revision addresses the review findings R-001 through R-016. The changes
are normative and supersede the previous version.

---

## 1. Identifier Types

