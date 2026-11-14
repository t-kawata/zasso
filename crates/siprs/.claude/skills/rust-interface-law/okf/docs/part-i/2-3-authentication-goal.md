---
type: "Documentation"
title: "2.3 Authentication goal"
description: "JWT authentication must be common across every interface, and SSO must be"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/2-3-authentication-goal"
    title: "2.3 Authentication goal"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/2-3-authentication-goal"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "77-77"
---
### 2.3 Authentication goal

JWT authentication must be common across every interface, and SSO must be
addable later without changing business operations, `VerifiedIdentity`, or
business tables. Tokens are audience-bound per interface. Authorization happens
inside the operation, not only in an adapter. External ID tokens are verified
inside the SSO crate and never accepted as internal access tokens.

### 2.4 Current projects

