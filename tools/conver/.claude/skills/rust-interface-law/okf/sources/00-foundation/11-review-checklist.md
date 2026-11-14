---
type: "Section"
title: "11. Review Checklist"
description: "Before accepting a new rule or a project exception, answer all of these."
sources: 
  - resource: "sources/00-FOUNDATION.md"
    id: "00-foundation-11-review-checklist"
    title: "11. Review Checklist"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/00-FOUNDATION.md"
x-source-span: "279-294"
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

