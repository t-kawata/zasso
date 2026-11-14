---
type: "Section"
title: "12. Drivers"
description: "In-process drivers are preferred:"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-12-drivers"
    title: "12. Drivers"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "215-241"
---
## 12. Drivers

In-process drivers are preferred:

| Interface | Driver |
|---|---|
| REST | `tower::ServiceExt::oneshot` against the router. |
| WebSocket | `tokio::io::duplex` plus the upgrade and ticket flow. |
| CLI | `run(args)` with captured stdout/stderr and a test clock. |
| gRPC | In-process tonic service. |
| MCP | In-process MCP transport. |
| A2A | In-process A2A transport. |

Out-of-process drivers are required for:

- TLS termination and certificate validation;
- a real WebSocket upgrade with Origin and ticket headers;
- CLI process, signal, file-permission, and token-store behavior;
- protocol behavior that the in-process transport does not exercise.

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-35 | TLS, real upgrade, and CLI process boundaries are covered out-of-process. | Coverage. | Tooling. | V3 test. |
| CONF-36 | A driver that cannot exercise a required boundary reports `Fail`, not `NotApplicable`. | Fail-closed. | — | V3 test. |

---

