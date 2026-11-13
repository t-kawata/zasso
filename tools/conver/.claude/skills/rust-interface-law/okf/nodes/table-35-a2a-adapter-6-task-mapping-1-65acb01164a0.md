---
type: Table
id: table/35-a2a-adapter-6-task-mapping/1/65acb01164a0
phase: adapter
delivery: reference
applies_to: a2a
requires: []
references: []
content_sha256: 65acb01164a0edc0037e661dcda9f6b47f44c8a64f9d99d6eca95e27ab5dd86e
source: sources/35-A2A.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-05 | An A2A task maps to one operation invocation. | Mapping. | Task grouping. | V3 test. |
| A2A-06 | A2A task state is stored only in `TaskStore`, never in business tables. | Boundary. | Task store implementation. | V2 schema review; V3 test. |
| A2A-07 | Business state is read and written only through operations. | Boundary. | — | V2 scan; V3 test. |
| A2A-08 | The adapter converts A2A messages to operation requests and back. | Conversion path. | Message details. | V3 test. |
| A2A-09 | The adapter contains no business logic. | Forbidden. | — | V2 scan; V4 review. |
| A2A-10 | Task cancellation maps to operation cancellation only when the operation supports it; otherwise it returns the operation's conflict/state result. | Cancellation mapping. | Per-operation support. | V3 test. |
| A2A-20 | Every task is bound to a `TaskOwner` (subject and tenant); load/save require the owner. | Owner binding. | Store implementation. | V3 test. |
| A2A-21 | The adapter authorizes protocol-owned task get/cancel/subscribe against the owner; business authorization stays in the operation. | Boundary. | Policy. | V3 bypass test. |
| A2A-22 | Protocol errors and business execution errors are mapped separately. | Separation. | Detail. | V3 test. |
| A2A-23 | `A2aConfig` records the adopted protocol version, transport profile, and capabilities. | Recorded. | Values. | V2 config check. |
| A2A-24 | Every task artifact carries the operation's `request_id` in a machine-readable field. | Field. | Placement. | V3 test. |
