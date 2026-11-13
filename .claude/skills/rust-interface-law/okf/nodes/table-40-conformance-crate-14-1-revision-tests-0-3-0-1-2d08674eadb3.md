---
type: Table
id: table/40-conformance-crate-14-1-revision-tests-0-3-0/1/2d08674eadb3
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 2d08674eadb36cc8f697c67ffda5e36cf240f81ec20e55cc1c561de1e0e444ef
source: sources/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-45 | A stream started through an adapter reaches the Dispatcher stream API and delivers items, EOF, and cancel. | End-to-end stream path. | Transport encoding. | V3 test. |
| CONF-46 | An expired lease owner cannot complete or commit after a new owner acquires the claim. | Fencing. | Store implementation. | V3 test. |
| CONF-47 | A replay after a successful delete, create, or approve returns the stored result with current authorization, not a state-precondition error. | Replay path. | — | V3 test. |
| CONF-48 | Same-transaction completion, business mutation, and outbox intent are atomic; a crash after commit recovers both the result and the event. | Atomic boundary. | Backend. | V3 crash test. |
| CONF-49 | REST merges body context and header context, rejects conflicts, and returns `request_id` on success and on every failure path. | Context propagation. | — | V3 test. |
| CONF-50 | A long-lived WebSocket connection observes revocation within the configured maximum staleness. | Revocation. | Cache/push mechanism. | V3 test. |
| CONF-51 | Result lookup is authorized by the recorded subject, tenant, or an authorized operator; a bare request ID is insufficient. | Result authorization. | — | V3 test. |
| CONF-52 | Refresh consumes the current generation and creates the next generation in one transaction; family history and reuse behavior match the declared policy. | Rotation. | Store implementation. | V3 test. |
| CONF-53 | Every implemented interface has generated documentation and every applicable operation has a section. | Coverage. | Renderer. | V3 test. |
| CONF-54 | Documentation completeness, English-only, and secret-free gates pass. | Quality gates. | Renderer. | V3 test. |
| CONF-55 | Documentation generation is deterministic for the same inputs and version. | Determinism. | Renderer. | V3 digest test. |
| CONF-56 | A project without the REST profile still generates documentation for its implemented interfaces. | REST independence. | Build tooling. | V3 test. |
| CONF-57 | Every request uses the generated validator, and the same input produces the same validation result through every interface. | Validation parity. | — | V3 test. |
| CONF-58 | Standard constraints map to schema keywords; byte-length and non-ECMA regex rules are custom and not mis-mapped. | Conversion. | Schema backend. | V3 test. |
| CONF-59 | Every custom rule has `id`, `check`, `fields`, `description`, and `code`, and appears in every applicable interface reference. | Custom rules. | Presentation. | V3 test. |
| CONF-60 | Unknown or type-incompatible rules fail compilation; no rule is silently omitted. | Fail-closed. | Error text. | V3 compile-fail test. |
| CONF-61 | Every request uses the macro; the validator, descriptor, schema registration, and inventory entries are present. | Blueprint. | Macro internals. | V3 test. |
| CONF-62 | `*-docgen` implements the four subcommands and both registry dumps; the operation crate is linked. | Blueprint. | Internal modules. | V3 test. |
| CONF-63 | Completeness, English, secret, and determinism checks match the blueprint and exit codes. | Blueprint. | Check implementation. | V3 test. |
| CONF-64 | No alternate validation/documentation method is used without a versioned exception. | Governance. | Exception record. | V2 config check; V4 review. |
| CONF-65 | Generated validation runs before the idempotency claim for both replay and new requests; replay calls `replay_authorize` and not `prepare`. | Order. | — | V3 test. |
