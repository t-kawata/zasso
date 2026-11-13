---
type: "Section"
title: "4. Source Policy"
description: "| Rule | Requirement |"
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "55-implementation-contracts-4-source-policy"
    title: "4. Source Policy"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/55-IMPLEMENTATION-CONTRACTS.md"
x-source-span: "66-78"
---
## 4. Source Policy

| Rule | Requirement |
|---|---|
| Resolved identity | Required calls are resolved to crate and item identity, not string matches |
| Adapter entry | Adapter calls the dispatcher or adapter bridge only |
| No business logic | Adapter contains no domain decision, storage query, or transaction |
| No manual framing | JSON-RPC, SSE, and protocol envelopes use the admitted SDK |
| No hidden state | Authoritative session and task state live in the external store |
| Failure | Unresolved analysis, macro expansion, or generated code fails closed |

---

