---
type: "Section"
title: "11. Implementation Contract"
description: "`a2a = { package = \"a2a-lf\", version = \"=0.4.2\" }`; `a2a-server = { package = \"a2a-server-lf\", version = \"=0.4.3\" }`; `axum = { version = \"=0.8.9\", features = [\"http1\", \"tokio\", \"json\"] }`; `futures-u"
sources: 
  - resource: "sources/35-A2A.md"
    id: "35-a2a-11-implementation-contract"
    title: "11. Implementation Contract"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/35-A2A.md"
x-source-span: "193-221"
---
## 11. Implementation Contract

### 11.1 Cargo contract

`a2a = { package = "a2a-lf", version = "=0.4.2" }`; `a2a-server = { package = "a2a-server-lf", version = "=0.4.3" }`; `axum = { version = "=0.8.9", features = ["http1", "tokio", "json"] }`; `futures-util = { version = "=0.3.31" }`.

### 11.2 Required API sequence

Agent card -> SDK request handler -> shared executor -> dispatcher -> external TaskStore -> durable event log -> send/stream response -> cancellation/resubscribe.

### 11.3 Forbidden patterns

in-memory task store in production, sticky session, ad-hoc SSE, separate send/stream business paths, ownerless persistence call.

### 11.4 Template

`templates/a2a/`.

### 11.5 Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-25 | A2A send and stream methods MUST use one shared executor and SDK wire framing. | Shared path. | Executor internals. | V3 shared-path probe. |
| A2A-26 | Production A2A task state, execution claims, idempotency records, and event logs MUST survive instance replacement. | Durability. | Store backend. | V3 restart test. |
| A2A-27 | Every task, cancellation, and replay access MUST bind subject and tenant at the persistence boundary. | Owner binding. | Store API. | V3 owner isolation. |
| A2A-28 | A2A `message/send` and `message/stream` MUST share the same operation invocation and terminal semantics. | Dual mode. | Event payload. | V3 dual-mode test. |
| A2A-29 | A2A cancellation, disconnect, and resubscribe MUST be distinct and MUST use durable event cursors. | State separation. | Timing. | V3 cancel/resubscribe. |
| A2A-30 | A2A auth and agent card MUST declare and enforce the configured security scheme and audience. | Security. | Scheme set. | V3 auth/card test. |

