---
type: "Section"
title: "11. Adapter Support Composition"
description: "Adapters MAY share a project-owned adapter-support module that wraps the dispatcher, verifier, wire context, semantic reply, error mapping, and cancellation. The module is a composition seam, not a se"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-11-adapter-support-composition"
    title: "11. Adapter Support Composition"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "1478-1483"
---
## 11. Adapter Support Composition

Adapters MAY share a project-owned adapter-support module that wraps the dispatcher, verifier, wire context, semantic reply, error mapping, and cancellation. The module is a composition seam, not a second contract. It MUST forward to the dispatcher and MUST NOT implement business logic.

The adapter-support module is generated from the admitted template and carries `RULE: IMP-01` through `RULE: IMP-08` annotations where it implements those obligations.

