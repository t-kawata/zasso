---
type: "Section"
title: "1. Purpose"
description: "`*-core` owns the domain model, invariants, value objects, state machines, and"
sources: 
  - resource: "sources/20-CORE.md"
    id: "20-core-1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/20-CORE.md"
x-source-span: "10-17"
---
## 1. Purpose

`*-core` owns the domain model, invariants, value objects, state machines, and
the **ports** through which the domain reaches the outside world. It knows
nothing about HTTP, WebSocket, gRPC, MCP, A2A, CLI, JWT, SSO, or databases.

---

