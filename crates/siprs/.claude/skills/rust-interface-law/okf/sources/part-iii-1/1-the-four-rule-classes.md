---
type: "Section"
title: "1. The Four Rule Classes"
description: "| Class | What it fixes | What it leaves open | Example |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-1/1-the-four-rule-classes"
    title: "1. The Four Rule Classes"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-1/1-the-four-rule-classes"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1152-1152"
---
## 1. The Four Rule Classes

| Class | What it fixes | What it leaves open | Example |
|---|---|---|---|
| **C — Closed contract** | Shared types, wire shapes, token validation order, error categories, dependency direction, authorization location. | How the domain is modeled, which operations exist, which storage is used. | `InvocationContext`, `AuthenticatedContext`, and `AnonymousContext` have exactly the fields defined in `Part III.2`. |
| **G — Generated** | Mechanical files and bindings derived from the operation catalog. | Hand-written handler bodies, policies, compensations. | REST routes, CLI commands, proto services, conformance matrix rows. |
| **O — Open extension** | The trait, registration point, and conformance obligation for adding something. | How many operations, scopes, auth methods, interfaces, or backends a project adds. | A new auth method implements `CredentialVerifier` and calls `TokenIssuer`. |
| **P — Proof** | Test harness shape, oracle obligations, negative cases. | The implementation under test. | Every interface passes the same operation × interface matrix. |

A rule with no **Open** statement is over-specified. A rule with no **Fixed**
statement is not a rule.

---

## 2. Open Sets

