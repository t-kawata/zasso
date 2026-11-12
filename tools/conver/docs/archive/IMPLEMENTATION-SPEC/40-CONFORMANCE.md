# 40 — Conformance Crate

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

---

## 1. Purpose

`*-conformance` is the executable form of the ruleset. It proves that every
operation behaves the same through every implemented interface, that
authorization and audience binding cannot be bypassed, and that state,
idempotency, crash recovery, and streaming semantics hold.

The harness types are defined once in Part III.2 §10. This document defines the
obligations, the matrix, and the drivers. It does not redefine the types.

---

## 2. Dependencies

```toml
[dependencies]
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }

[dev-dependencies]
<project>-core = { workspace = true }
<project>-operation = { workspace = true }
<project>-rest = { workspace = true }        # only if profile rest
<project>-websocket = { workspace = true }   # only if profile websocket
<project>-cli = { workspace = true }         # only if profile cli
<project>-grpc = { workspace = true }        # only if profile grpc
<project>-mcp = { workspace = true }         # only if profile mcp
<project>-a2a = { workspace = true }         # only if profile a2a
```

Dependencies are profile-conditional. A project that implements only MCP does
not depend on REST, WebSocket, CLI, or gRPC.

---

## 3. Layout

```text
*-conformance/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # run_matrix, run_rules, Report
    ├── matrix/
    │   ├── mod.rs
    │   └── generated.rs        # operation x interface rows
    ├── fixtures/
    │   ├── mod.rs
    │   └── generated.rs        # deterministic setup/reset
    ├── cases/
    │   ├── mod.rs
    │   ├── generated.rs        # normal, failure, state, idempotency
    │   └── negative_auth.rs
    ├── drivers/
    │   ├── mod.rs
    │   ├── rest.rs
    │   ├── websocket.rs
    │   ├── cli.rs
    │   ├── grpc.rs
    │   ├── mcp.rs
    │   └── a2a.rs
    ├── oracles/
    │   ├── mod.rs
    │   ├── result.rs           # semantic comparison
    │   ├── error.rs            # code, category, retryability
    │   ├── state.rs            # state and side-effect oracle
    │   ├── events.rs           # outbox and event order
    │   └── stream.rs           # EOF, error, cancel, backpressure
    ├── security/
    │   ├── binding.rs          # interface/audience/expiry
    │   ├── bypass.rs           # operation authorization bypass
    │   ├── identity.rs         # compile-fail and public API audit
    │   └── delegation.rs
    ├── report/
    │   ├── mod.rs
    │   └── markdown.rs
    └── tests/
```

---

## 4. Matrix

| Operation | REST | WS | CLI | gRPC | MCP | A2A |
|---|---|---|---|---|---|---|
| `account.add` | required | required | required | required | required | required |
| `account.get` | required | required | required | required | required | required |
| `account.export` | required | not applicable | required | required | required | required |

A cell is `required` or `not applicable` with a catalog reason. A missing cell is
a failure. An interface that is not in the profile has no column, not a
non-applicable cell.

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-01 | Every catalog operation appears in the matrix. | Coverage. | Operation set. | V3 matrix test. |
| CONF-02 | Every implemented interface has a driver. | Coverage. | Driver. | V3 test. |
| CONF-03 | Every cell is required or not applicable with a reason. | Cell rule. | Reason. | V3 test. |
| CONF-04 | A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell. | Distinction. | — | V3 test. |

---

## 5. Cases

`Case` includes:

- authentication material (`AuthCase`);
- tenant and delegation (`TestPrincipal`);
- wire context (`request_id`, deadline, idempotency key, trace);
- request payload;
- optional stream script;
- fixture ID;
- expected result or error;
- expected state;
- expected error code.

A case that only compares JSON is insufficient. The required dimensions are:

| Dimension | Obligation |
|---|---|
| Result | Semantic match, not raw JSON equality. |
| Error | Code, category, and retryability. |
| State | Before/after state and side effects. |
| Events | Outbox intent and publication order. |
| Stream | Item order, EOF, error, cancel, backpressure. |
| Authentication | Binding, audience, expiry, revocation, delegation. |
| Idempotency | First execution, replay, conflict, crash recovery. |
| Concurrency | Concurrent claims, concurrent refresh, concurrent mutation. |

---

## 6. Fixtures and Determinism

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-05 | Every case names a fixture with setup and reset. | Fixture boundary. | Fixture content. | V3 test. |
| CONF-06 | IDs and time are deterministic in fixtures. | Determinism. | Clock/id strategy. | V3 test. |
| CONF-07 | Generated IDs and timestamps use semantic matchers, not exact equality. | Matcher rule. | Matcher choice. | V3 test. |
| CONF-08 | A case must not depend on the order of another case. | Isolation. | — | V3 test. |
| CONF-09 | A mutation case must assert the resulting state, not only the response. | State oracle. | State shape. | V3 test. |

---

## 7. Independent Oracle

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-10 | Expected results are derived from the operation specification, not from one interface. | Independent oracle. | Oracle implementation. | V3 review of oracle source. |
| CONF-11 | All interfaces answering the same wrong result is a failure. | Independent expectation. | — | V3 test. |
| CONF-12 | The oracle covers normal, failure, state, authorization, idempotency, and streaming. | Coverage. | Case content. | V3 test. |

---

## 8. Authentication and Binding

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-13 | Every required interface rejects a token for another audience. | Pairwise test. | — | V3 test. |
| CONF-14 | An identity with a mismatched interface or audience binding is rejected. | Binding check. | — | V3 test. |
| CONF-15 | An expired binding is rejected even when the signature is valid. | Expiry check. | — | V3 test. |
| CONF-16 | A session ticket creates a new binding; the ticket redemption deadline and connection expiry are distinct. | Two deadlines. | — | V3 test. |
| CONF-17 | Delegation preserves `actor` and `on_behalf_of` and rejects unauthorized delegation. | Invariant. | Policy. | V3 test. |
| CONF-18 | Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation. | Coverage. | Extra cases. | V3 test. |

---

## 9. Security Proofs

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-19 | No interface can bypass operation authorization. | Bypass test. | Technique. | V3 test. |
| CONF-20 | An adapter cannot construct `VerifiedIdentity`. | Compile-fail test. | — | V1; V3. |
| CONF-21 | The trusted constructor is not reachable from adapter crates; allowed call sites are audited. | Public API audit. | — | V2 scan; V4 review. |
| CONF-22 | A compile-fail test is not treated as a general proof of non-bypass. | Explicit limitation. | — | V4 review. |
| CONF-23 | Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are authorized by the adapter; business resources are not. | Boundary. | — | V3 test. |

---

## 10. Idempotency, Transactions, and Recovery

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-24 | Concurrent claims for the same namespace and key produce one execution. | Atomicity. | Store. | V3 concurrency test. |
| CONF-25 | A replay re-authorizes before returning the stored result. | Order. | — | V3 test. |
| CONF-26 | Same key with a different canonical request returns conflict. | Conflict. | Canonicalizer. | V3 test. |
| CONF-27 | A crash after business commit but before publication is recovered; the event is not lost. | Outbox recovery. | Backend. | V3 crash test. |
| CONF-28 | Irreversible effects follow the declared recovery policy. | Recovery declaration. | Policy. | V3 test. |
| CONF-29 | No unrelated external API wait occurs inside a database transaction; transaction-required DB communication is allowed. | External-wait ban. | Transaction budget. | V2 architecture scan; V3 test. |

---

## 11. Streaming

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-30 | Server stream items, EOF, error, and cancel match the operation contract. | Semantics. | Encoding. | V3 test. |
| CONF-31 | Client stream input, EOF, and cancel match the contract. | Semantics. | Encoding. | V3 test. |
| CONF-32 | Bidi streams preserve independent half-close and cancellation. | Semantics. | Encoding. | V3 test. |
| CONF-33 | Backpressure is observable and bounded. | Bound. | Threshold. | V3 load test. |
| CONF-34 | A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient. | Result authorization. | Store backend. | V3 test. |

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

## 13. Dependency and Rule Coverage

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-37 | The crate graph passes the forbidden-edge checks. | Edge rules. | — | V2 `cargo metadata`. |
| CONF-38 | Every rule ID in the registry has a verdict. | Coverage. | — | V3 rule-coverage test. |
| CONF-39 | A missing verification is a failure, not a skip. | Fail-closed. | — | V3 test. |
| CONF-40 | Documentation, file existence, and fixture names are not proof. | Forbidden. | — | V3 report inspection; V4 review. |
| CONF-41 | The report names every failed row and every rule without evidence. | Report shape. | Presentation. | V3 test. |

---

## 14. SSO Regression

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-42 | After SSO is added, existing operation signatures, subject IDs, and business data references are unchanged. | Invariant. | Provider set. | V3 regression test. |
| CONF-43 | An external ID token is rejected as an access token on every interface. | Rejection. | — | V3 test. |
| CONF-44 | An internal access token is rejected as an external ID token. | Rejection. | — | V3 test. |

---

## 14.1 Revision Tests (0.3.0)

These cases close the V2 findings. They are part of the required matrix.

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

---

## 15. Report

```rust
pub struct ConformanceReport {
    pub rows: Vec<Row>,
    pub rules: Vec<RuleVerdict>,
}

pub struct Row {
    pub operation: OperationId,
    pub interface: InterfaceId,
    pub case: &'static str,
    pub outcome: InvocationOutcome,
    pub verdict: Verdict,
}

pub struct RuleVerdict {
    pub rule_id: &'static str,
    pub verdict: Verdict,
    pub evidence: Vec<String>,
}

pub enum Verdict {
    Pass,
    Fail { reason: String },
    NotApplicable { reason: String },
}
```

A report that omits a rule or a matrix cell is itself a failure.

---

## 16. Fixed and Open

| Fixed | Open |
|---|---|
| Harness types, matrix coverage, independent oracle, report shape. | Driver implementation and fixture content. |
| Authentication, binding, delegation, idempotency, transaction, stream obligations. | Test data and scenario selection. |
| Out-of-process boundary coverage. | Tooling and environment. |
| Fail-closed semantics. | Report presentation. |
| No runtime dependency on conformance. | CI integration. |

---

## 17. Conformance Obligations

1. All matrix cells covered or declared not applicable with a reason.
2. All negative authentication cases pass on every required interface.
3. Binding, expiry, audience, and delegation checks pass.
4. Cross-interface result, error code, state, event, and streaming parity pass.
5. No bypass test fails; public API audit passes.
6. Concurrent idempotency and crash recovery pass.
7. Outbox events are not lost and are not duplicated.
8. TLS, real WebSocket upgrade, and CLI process boundaries pass.
9. Every registry rule has a verdict.
10. SSO regression passes when SSO is implemented.
11. `cargo test -p <project>-conformance` and `cargo clippy -p
    <project>-conformance -- -D warnings`.
12. The report names `CONF-01` through `CONF-65`.

## 13. Implementation Proof

Implementation proof is separate from behavior proof.

| Level | Proof |
|---|---|
| V1 | Process scan: stubs, secrets, English, test weakening |
| V2 | Dependency, feature, edge, source identity, template equality, law identity |
| V3 | Project compile and interface contract tests |
| V4 | Human attestation for SDK binding, tenant boundary, TLS trust, retention |

A V1 pass is not rule-level proof. A missing implementation report, missing test, zero selected tests, or failed detector is a failure. The implementation report MUST name `IMP-01` through `IMP-12`.
