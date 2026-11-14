---
type: "Section"
title: "1. Purpose"
description: "`*-core` owns the domain model, invariants, value objects, state machines, and"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-3/1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-3/1-purpose"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2911-2911"
---
## 1. Purpose

`*-core` owns the domain model, invariants, value objects, state machines, and
the **ports** through which the domain reaches the outside world. It knows
nothing about HTTP, WebSocket, gRPC, MCP, A2A, CLI, JWT, SSO, or databases.

---

## 2. Dependencies

