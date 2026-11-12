---
type: Table
id: table/40-conformance-crate-9-security-proofs/1/214361630e50
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 214361630e507a8065a4a72ea0815fd4c7f1b661b3317b708cacb9a25e1249d4
source: docs/archive/IMPLEMENTATION-SPEC/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-19 | No interface can bypass operation authorization. | Bypass test. | Technique. | V3 test. |
| CONF-20 | An adapter cannot construct `VerifiedIdentity`. | Compile-fail test. | — | V1; V3. |
| CONF-21 | The trusted constructor is not reachable from adapter crates; allowed call sites are audited. | Public API audit. | — | V2 scan; V4 review. |
| CONF-22 | A compile-fail test is not treated as a general proof of non-bypass. | Explicit limitation. | — | V4 review. |
| CONF-23 | Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are authorized by the adapter; business resources are not. | Boundary. | — | V3 test. |
