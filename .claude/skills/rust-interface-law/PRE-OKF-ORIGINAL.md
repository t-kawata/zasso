# EXPERT REVIEW PACKAGE

## Implementation Rules for Unified Multi-Interface Rust Systems

**Version:** 0.3.2  
**Prepared:** 2026-11-11  
**Reviewer:** External expert in Rust architecture, API design, security, protocol adapters, and specification governance  
**Package type:** Single-file review bundle — request, normative rules, concrete specification, document map and self-containment statement

---

## Table of Contents

| Part | Content |
|---|---|
| **I** | Expert review request: role, background, success conditions, constraints, review dimensions, findings format, verdict |
| **II** | Normative rules |
| **III.1–III.14** | Concrete specification: foundation, contracts, core, operation, identity, REST, WebSocket, CLI, gRPC, MCP, A2A, conformance, project template, migration |
| **III.15** | Canonical rule registry and duplicate-obligation check |
| **III.16** | Documentation generation for every implemented interface |
| **III.17** | Validation declaration, runtime validation, schema, and descriptor |
| **III.18** | Mandatory implementation blueprint for validation and documentation |
| **IV** | Document map and self-containment statement |

> The package is self-contained. Read Part I first. Use Parts II and III as the
> specification under review. Use Part IV for the document map and
> self-containment statement.

---

# PART I — EXPERT REVIEW REQUEST

## 1. Your Role

REMOVED.

---

## 2. Background

### 2.1 Legacy context

An earlier system (`mycute`) implemented a REST API with Axum and `utoipa` in a
single module tree (`src/mode/rt`). That implementation is **not** the target
architecture. It is mentioned only to explain why the new rules exist: the old
design coupled HTTP handling, business logic, persistence, authentication, and
OpenAPI generation in one place. The new architecture separates them.

### 2.2 Target architecture

New development is organized as Rust Cargo workspaces with crate-level roles:

```text
<project>-core          domain model, invariants, ports
<project>-operation     operation handlers, authorization, transactions,
                        compensation, idempotency, events
<project>-conformance   operation oracles, cross-interface tests, rule gates
<project>-rest          HTTP adapter
<project>-websocket     WebSocket adapter
<project>-cli           CLI adapter
<project>-grpc          gRPC adapter
<project>-mcp           MCP adapter
<project>-a2a           A2A adapter
```

Shared foundation crates carry identity, contracts, and the conformance harness:

```text
identity-core / identity-jwt / identity-local / identity-operation / identity-sso
operation-contract / interface-contract
```

All interfaces call the same operation implementation. Interfaces are thin
adapters: they extract credentials, convert input, call the shared verifier,
invoke the operation dispatcher, convert output, and map errors.

### 2.3 Authentication goal

JWT authentication must be common across every interface, and SSO must be
addable later without changing business operations, `VerifiedIdentity`, or
business tables. Tokens are audience-bound per interface. Authorization happens
inside the operation, not only in an adapter. External ID tokens are verified
inside the SSO crate and never accepted as internal access tokens.

### 2.4 Current projects

- **gaia**: core, foundation, ports, operation, conformance, REST, WebSocket,
  CLI. No gRPC, MCP, or A2A yet. No root `Cargo.toml` in the current scaffold.
- **crystal**: core, operation, conformance, testkit, bootstrap, protocol
  crates, adapters, transports. No interface crates yet.
- **doors**: core, operation, conformance, REST, WebSocket, CLI, gRPC. A
  `SYSTEM-DESIGN.md` with roughly 105 operations. No MCP or A2A yet.
- **Future `conver` projects**: expected to follow the same roles, with a
  different operation catalog and domain.

The projects are not yet frozen. This specification is intended to fix their
shared shape before they diverge further.

---

## 3. What You Are Reviewing

This package contains:

- **Part II**: the normative rules.
- **Part III**: the concrete specification,
  including exact Rust types and traits, crate layouts, public APIs, generated
  files, interface rules, conformance obligations, project template, and
  migration plan.
- **Part III.15**: the canonical rule registry.
- **Part III.16**: the documentation generation rules.
- **Part III.17**: the validation declaration rules.
- **Part III.18**: the mandatory implementation blueprint.
- **Part IV**: a document map and self-containment statement.

The rules use four classes:

| Class | Meaning |
|---|---|
| **C — Closed contract** | A seam that must not vary. |
| **G — Generated** | Mechanical output derived from the operation catalog. |
| **O — Open extension** | How a project adds something new without changing the seam. |
| **P — Proof** | How compliance is demonstrated. |

Every rule states **Fixed** (what is frozen) and **Open** (what is left free).
A rule that cannot name its Open part is over-specified. A rule that cannot name
its Fixed part is not a rule.

---

## 4. The Two Success Conditions in Detail

### 4.1 Near-complete unification

Judge whether two independent teams, given the same operation catalog and this
package, would converge on:

- the same shared types and traits;
- the same wire envelope and field numbers;
- the same token validation order, claims, audience behavior, and key handling;
- the same authorization placement and bypass resistance;
- the same error category mapping;
- the same adapter responsibilities and generated binding shapes;
- the same conformance matrix and negative authentication suite;
- the same naming, module layout, generated-file boundaries, and version pins.

Identify every place where they could diverge despite following the package.
Distinguish **seam divergence** (a specification defect) from **substance
divergence** (legitimate domain or implementation difference).

“Almost complete” does not mean identical business logic. It means the shared
seams, mechanical adapters, authentication, error semantics, and conformance
behavior are effectively identical.

### 4.2 No limitation on what can be built

Judge whether any rule prevents a project from adding something legitimate,
including:

- new operations, scopes, error codes, and domain types;
- new authentication methods and SSO providers;
- new interfaces or streaming modes;
- new storage backends, algorithms, or performance strategies;
- new project-specific crates, modules, tests, benchmarks, fixtures, and
  tooling;
- a different internal architecture behind a port;
- a subset of interfaces (with explicit absence).

A rule that enumerates a closed set of features is a defect. A rule that blocks
a feature to protect a seam must be examined: is the seam truly necessary, and
can it be extended instead of restricting the feature?

---

## 5. Non-Negotiable Constraints

The following are given; do not propose weakening them without a security
argument:

- Rust and Cargo workspaces.
- `VerifiedIdentity` is unforgeable by adapters.
- Token validation order and required claims are fixed.
- Audience separation between interfaces is mandatory.
- Authorization must run inside the operation.
- Secrets, tokens, passwords, and authorization codes never appear in logs,
  errors, or metrics.
- The shared contracts are versioned and not forked per project.
- A project may implement only a subset of interfaces; absence must be declared.

---

## 6. Review Dimensions

Assess each dimension and cite exact documents, sections, or rule IDs.

### A. Unification sufficiency

- Are the closed seams sufficient for independent teams to converge?
- Which decisions remain ambiguous and would cause divergence?
- Is the generated set complete? What is missing?
- Is the shared-contract crate boundary correct?
- Does the sealed `VerifiedIdentity` packaging rule create unnecessary coupling?
- Are the operation catalog, generated bindings, and conformance matrix
  sufficient to keep interfaces aligned?

### B. Non-limitation

- Are the open sets truly open? Is any “open” set secretly closed?
- Does any rule block a project-specific crate, module, test, benchmark,
  fixture, or domain implementation?
- Does the migration plan force a particular internal design?
- Are extension points sufficient for new auth methods, SSO providers,
  streaming modes, and interfaces?
- Does the specification confuse “unify the seam” with “unify the
  implementation”?

### C. Internal consistency

- Are types, trait names, field names, versions, and rule IDs consistent across
  documents?
- Are there contradictions between the rules and the concrete specification?
- Are rule IDs covered by the conformance specification?
- Are duplicated definitions (for example harness types) consistent?

### D. Testability and verification

- Does every MUST rule have a V1/V2/V3 verification?
- Is the conformance matrix sufficient to prove cross-interface parity?
- Is the negative authentication suite complete?
- Can a missing rule verdict be detected?
- Are the “no bypass” and “unforgeable identity” proofs realistic?

### E. Security

- JWT profile, algorithm allowlist, key handling, rotation, refresh tokens.
- Audience isolation and token-type separation.
- SSO extension and external identity handling.
- Authorization placement and race handling.
- Secret redaction and error leakage.
- Does unification create a single point of failure or over-coupling?

### F. Interface adapters

- Are REST, WebSocket, CLI, gRPC, MCP, and A2A adapters thin and equivalent?
- Are protocol-specific authentication surfaces handled without leaking into
  operations?
- Are streaming, cancellation, deadline, and backpressure semantics coherent?
- Are MCP and A2A specification constraints represented accurately enough to
  implement?

### G. Migration feasibility

- Is the order feasible for gaia, crystal, and doors?
- Are there missing steps or unrealistic assumptions?
- Does the plan preserve existing behavior until conformance passes?
- Does it avoid forcing a big-bang rewrite?

### H. Governance

- Is versioning workable for rules, contracts, generator, and conformance kit?
- Is the amendment process sufficient when a rule blocks a legitimate feature?
- Are exceptions auditable and time-bounded?
- Is there a risk of the specification becoming stale relative to code?

### I. Over-specification and under-specification

For each finding, classify it as one of:

- **Over-constraint** — limits a legitimate feature or internal design.
- **Under-specification** — leaves room for divergent implementations.
- **Contradiction** — two documents or rules disagree.
- **Gap** — a required behavior or proof is missing.
- **Security defect** — weakens an invariant.
- **Migration defect** — makes adoption unrealistic.

---

## 7. Specific Questions You Must Answer

1. Can two independent teams implement from this package and produce nearly
   identical seams? Where exactly would they diverge?
2. Which rules are over-specified (limit legitimate features) and which are
   under-specified (allow drift)?
3. Are the Fixed/Open classifications correct for every rule class?
4. Is the sealed `VerifiedIdentity` packaging rule a necessary security seam or
   an unnecessary implementation constraint?
5. Does the operation pipeline remain transport-independent across all six
   interfaces? Identify any leak.
6. Is the conformance matrix sufficient to prove unification? What is missing?
7. Does any rule hinder a project from adding its own crate, module, test,
   benchmark, fixture, or domain-specific implementation? Cite the rule.
8. Are project-specific interfaces, operations, scopes, error codes, auth
   methods, SSO providers, and storage backends genuinely addable without
   forking the contracts?
9. Are there contradictions between the rules, contracts, layer specs,
   conformance spec, template, and migration plan?
10. What must be fixed before adoption, and what can be deferred?

---

## 8. Required Findings Format

Use this exact shape for every finding:

```text
ID: R-001
Severity: Blocker | Major | Minor | Nit
Document: <file> § <section> / Rule ID
Type: Over-constraint | Under-specification | Contradiction | Gap | Security defect | Migration defect
Claim: <one sentence>
Evidence: <exact quote or precise reference>
Why it matters: <consequence for unification, feature freedom, security, or adoption>
Recommended fix: <specific change>
Affects unification: Yes | No | Conditional
Limits a legitimate feature: Yes | No | Conditional
```

A finding without a precise reference is not acceptable. Generic advice
(“improve clarity”, “add more tests”) is not a finding.

---

## 9. Required Verdict

At the top of your report, provide:

```text
Overall verdict: PASS | PASS WITH CONDITIONS | FAIL

Unification:      PASS | CONDITIONAL | FAIL
Non-limitation:   PASS | CONDITIONAL | FAIL
Security:         PASS | CONDITIONAL | FAIL
Consistency:      PASS | CONDITIONAL | FAIL
Testability:      PASS | CONDITIONAL | FAIL
Migration:        PASS | CONDITIONAL | FAIL
```

Then provide:

1. **Executive summary** — at most one page.
2. **Findings table** — sorted by severity.
3. **Must-fix before adoption** — numbered list.
4. **Can-defer list** — numbered list.
5. **Answers to the ten specific questions** in §7.
6. **A short statement** on whether the package achieves both success
   conditions simultaneously.

Severity definitions:

| Severity | Meaning |
|---|---|
| Blocker | Prevents adoption or violates a security/unification invariant. |
| Major | Causes significant divergence or blocks a legitimate feature. |
| Minor | Ambiguity, inconsistency, or documentation defect. |
| Nit | Style or wording. |

---

## 10. Out of Scope

- Implementing the specification.
- Reviewing the legacy `mycute` implementation.
- Choosing protocol SDK versions or vendors.
- Judging business-domain correctness.
- Performance benchmarking, unless a rule makes a legitimate performance
  strategy impossible.

---

## 11. Assumptions

- The package is self-contained; you do not need external project access.
- The specification is version 0.3.2 and is expected to change.
- The target projects are Rust Cargo workspaces.
- The projects may implement only a subset of interfaces.
- The reviewer should be adversarial but constructive: the goal is to improve the
  specification, not to defend it.

---

## 12. Deliverable

One Markdown report, structured as described in §9. Do not rewrite the
specification. Cite it precisely. Distinguish specification defects from
implementation risks. If you propose a rule change, state whether it preserves
the no-limitation guarantee.

---














# PART II — NORMATIVE RULES

---

# PART II.1 — IMPLEMENTATION RULES

# Implementation Rules for Multi-Interface Rust Systems

**Status:** Normative
**Version:** 0.3.2
**Applies to:** Rust projects that split a system into `*-core`, `*-operation`,
`*-conformance`, and interface crates (`*-rest`, `*-websocket`, `*-cli`,
`*-grpc`, `*-mcp`, `*-a2a`).
**Reference targets:** gaia, crystal, doors.

This document defines the rules. It does not define any single project's
operations; those belong in the project's own `SYSTEM-DESIGN.md`.

---

## 0. How to Read This Document

### 0.1 Keywords

| Keyword | Meaning |
|---|---|
| MUST / MUST NOT | Mandatory. A violation is a defect. |
| SHOULD / SHOULD NOT | Expected. A deviation requires a declared exception. |
| MAY | Optional. |

### 0.2 Rule format

Every rule has four parts:

1. **Fixed** — the seam or invariant the rule freezes. This is what makes
   implementations comparable across projects.
2. **Open** — what the rule deliberately leaves free. This is what prevents the
   rule from limiting what a project can build.
3. **Verification** — how compliance is proven. A rule without verification is
   not yet a rule.
4. **Exceptions** — none unless stated. An exception must be declared in the
   project's `RULES-PROFILE.toml` with a reason and an expiry.

A rule that cannot name its **Open** part is over-specified and must be
rewritten, unless it is a safety invariant with no permissible variation (for
example, "secrets MUST NOT appear in logs"). A rule that cannot name its
**Fixed** part is not a rule.

### 0.3 Precedence

When rules conflict, the higher row wins:

| Priority | Domain |
|---|---|
| 1 | Security and secret handling |
| 2 | Identity, authentication, authorization |
| 3 | Crate boundaries and dependency direction |
| 4 | Operation contract |
| 5 | Interface adapter behavior |
| 6 | Naming, layout, style |

A lower-priority rule never weakens a higher-priority rule.

### 0.4 Stable identifiers

Rule IDs are permanent. A removed rule keeps its ID and is marked `REMOVED`;
IDs are never reused. New rules receive new IDs.

### 0.5 Profiles

A project declares which profiles it implements:

```toml
# RULES-PROFILE.toml
[project]
name = "doors"
spec_version = "0.3.2"

[profiles]
rust = true
rest = true
websocket = true
cli = true
grpc = true
mcp = false
a2a = false

[auth]
jwt = true
sso = "disabled"   # disabled | planned | enabled
local_only = false
```

Profiles are booleans in `[profiles]`. An unimplemented interface is `false`,
not omitted. `sso = "planned"` is allowed only with a target in the project's
`SYSTEM-DESIGN.md`; it is not an implementation.

| Profile | Required |
|---|---|
| `rust` | Yes for every target of this document |
| `rest`, `websocket`, `cli`, `grpc`, `mcp`, `a2a` | Only when implemented |
| `auth-jwt` | Yes |
| `auth-sso` | When SSO is implemented |
| `local-only` | Only for single-process local tools; see AUTH-20 |

An unimplemented interface profile MUST be declared as absent. Silence is not
an absence.

### 0.6 Verification levels

| Level | Meaning |
|---|---|
| V1 | Compile-time or type-level proof |
| V2 | Static check (dependency graph, import scan, schema) |
| V3 | Automated test (unit, integration, conformance) |
| V4 | Review checklist |

A MUST rule requires V1, V2, or V3. V4 alone is not sufficient for a MUST rule.

### 0.7 Rule classes

Every rule belongs to exactly one class. The class states what the rule is
allowed to constrain.

| Class | Purpose | May constrain | Must not constrain |
|---|---|---|---|
| **C — Closed contract** | Freeze a seam that every project and interface must share. | Type shape, wire format, token validation order, error categories, dependency direction, authorization location. | The set of operations, scopes, error codes, features, algorithms, storage, or domain model. |
| **G — Generated** | Define mechanical output derived from the operation catalog. | File layout, adapter skeletons, route/CLI/proto bindings, conformance matrix rows. | Hand-written domain logic or extension behavior. |
| **O — Open extension** | Define how a project adds something new without changing the seams. | The extension trait, registration point, and conformance obligation. | Which operations, scopes, auth methods, interfaces, or storage a project may add. |
| **P — Proof** | Define how compliance is demonstrated. | Test harness shape, oracle obligations, negative cases. | Implementation strategy. |

A rule MUST NOT enumerate a closed set of features. It may only define the seam
through which features are added. For example:

- Correct: “Every operation implements `Operation` and appears in the catalog.”
  (open set of operations)
- Incorrect: “Only the following operations may exist.” (would limit what can be
  built)

The concrete contracts referenced by class C rules live in Part III. That part
fixes exact Rust types and traits; this document fixes the obligations.

### 0.8 Canonical rule registry

Part III.15 is the canonical registry. It records, for every rule ID:

- class (C/G/O/P);
- profile applicability;
- the normative statement;
- parent rule, when the rule details a higher-level rule;
- verification level and command.

Part II tables may omit the class column because the registry is authoritative.
A rule ID that appears in two documents with different obligations is a defect.
Detailed interface and conformance rules use the canonical IDs defined in
Part III.6–III.12; Part II does not duplicate them.

---

## 1. Definitions

| Term | Definition |
|---|---|
| **Operation** | A named business capability with a typed request and response. Example: `account.add`. |
| **OperationId** | A stable dotted identifier for an operation. |
| **Interface** | A transport boundary: REST, WebSocket, CLI, gRPC, MCP, A2A. |
| **Adapter** | The crate that implements one interface and calls operations. |
| **Assembly** | The binary or crate that wires configuration, adapters, operations, and authentication. |
| **SubjectId** | The internal, immutable identifier of an authenticated actor. |
| **VerifiedIdentity** | The only identity value an operation may receive. |
| **Scope** | A named permission. Necessary but never sufficient for authorization. |
| **Audience** | The interface or resource a token is issued for (`aud`). |
| **Conformance** | Executable proof that every interface produces the same operation behavior and authorization result. |
| **Operation catalog** | The project's list of operations, each with its contract and interface bindings. |

---

## 2. Invariants

These invariants hold for every project that adopts this document.

| ID | Invariant |
|---|---|
| INV-01 | One business implementation exists per operation. Interfaces do not reimplement it. |
| INV-02 | Every interface calls the same operation implementation. |
| INV-03 | Authentication happens once per request; authorization happens inside the operation. |
| INV-04 | `*-core` and `*-operation` contain no transport, JWT-library, or SSO-provider types. |
| INV-05 | SSO is added without changing business operations, `VerifiedIdentity`, or business tables. |
| INV-06 | Conformance tests, not documentation, prove compliance. |
| INV-07 | A token issued for one interface is not accepted by another. |
| INV-08 | No side effect occurs before authorization succeeds. |

---

## 3. Crate Architecture

### 3.1 Required crate roles

| Crate pattern | Role |
|---|---|
| `*-core` | Domain model, invariants, value objects, and ports (traits). |
| `*-operation` | Operation handlers, authorization, transactions, compensation, idempotency, event publication. |
| `*-conformance` | Operation oracles, cross-interface tests, negative tests, rule gates. |
| `*-rest` | HTTP input/output, credential extraction, operation invocation, HTTP error mapping. |
| `*-websocket` | WebSocket upgrade, connection auth state, message envelope, backpressure. |
| `*-cli` | Argument parsing, credential acquisition, operation invocation, output formatting. |
| `*-grpc` | Protobuf generation, metadata auth, operation invocation, gRPC status mapping. |
| `*-mcp` | MCP protocol handling, tool/resource mapping, operation invocation. |
| `*-a2a` | A2A protocol handling, task/message mapping, operation invocation. |
| `identity-core` | Subject identity, `VerifiedIdentity`, scopes, authentication and authorization contracts. |
| `identity-jwt` | JWT issuance and verification, key resolution. |
| `identity-local` | Initial login method (for example password credentials). |
| `identity-operation` | Login orchestration: credential result → subject resolution → token issuance. |
| `identity-sso` | Optional OIDC/SSO adapter. |
| `*-assembly` or the binary | Configuration, dependency injection, router/service composition. |
| `*-adapter-*` | External-system adapters (payment, identity proofing, transport). |

The table is a minimum role set, not a closed list. A project MAY add
`tooling`, `test-support`, `build-support`, or `utility` crates. It declares
their dependency edges in `RULES-PROFILE.toml`; the forbidden edges in ARC-02
through ARC-08 still apply. A test or benchmark crate is never a reason to
violate a runtime dependency rule.

### 3.2 Rules

| ID | Rule | Verification |
|---|---|---|
| ARC-01 | Each crate MUST have one primary runtime role from §3.1. Additional roles (`tooling`, `test-support`, `build-support`, `utility`) are allowed when declared in `RULES-PROFILE.toml` with their allowed dependency edges. A crate MUST NOT mix incompatible runtime roles. | V4 review; crate manifest and module layout. |
| ARC-02 | Dependencies MUST follow `interface-* → *-operation → *-core` and `interface-* → identity-core`. | V2 `cargo metadata` edge check. |
| ARC-03 | `*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*`, `clap`, or any protocol SDK. | V2 dependency and import scan. |
| ARC-04 | An interface crate MUST NOT depend on another interface crate. | V2 `cargo metadata` edge check. |
| ARC-05 | `*-conformance` MAY depend on every public boundary; no runtime crate may depend on `*-conformance`. | V2 `cargo metadata` edge check. |
| ARC-06 | Only the assembly/binary MAY depend on concrete authentication implementations (`identity-jwt`, `identity-local`, `identity-sso`) and wire them together. | V2 dependency check. |
| ARC-07 | `*-core` MUST define ports (traits) for external effects; it MUST NOT call infrastructure directly. | V1/V3; review of public traits and tests with fakes. |
| ARC-08 | `*-operation` MUST depend on `identity-core` traits, never on `identity-jwt` or `identity-sso`. | V2 dependency check. |
| ARC-09 | Crate names MUST use the project prefix and the role suffix (`doors-core`, `doors-operation`, `doors-rest`, and so on). | V4 review; manifest check. |
| ARC-10 | Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`. | V4 review. |

**Rationale for ARC-02 and ARC-03.** The dependency direction is the
architecture. If an operation can see an HTTP request or a JWT, the same
operation cannot be called from CLI, gRPC, MCP, or A2A without leaking that
transport into the other interfaces. The boundary is therefore enforced at the
crate graph level, not by review alone.

---

## 4. Operation Contract

### 4.1 Operation catalog

Every project MUST maintain an operation catalog. Each entry MUST contain:

| Field | Content |
|---|---|
| `operation_id` | Stable dotted ID, for example `account.add`. |
| `types` | Typed `Request` and `Response`. |
| `scope` | `read`, `control`, `admin`, or a project-defined scope. Anonymous operations declare authentication separately. |
| `mode` | `U` unary, `S` server stream, `C` client stream, `B` bidirectional. |
| `preconditions` | Required state and authority. |
| `procedure` | Ordered steps, including authorization and reservation. |
| `failure` | Failure handling and compensation. |
| `postconditions` | Observable result and invariants. |
| `interfaces` | REST, WS, CLI, gRPC, MCP, A2A bindings. |
| `conformance` | Conformance test identifier. |

### 4.2 Envelope

| ID | Rule | Verification |
|---|---|---|
| OPS-01 | Every operation MUST have a stable `operation_id` and a typed request/response pair. | V1 types; V3 catalog test. |
| OPS-02 | The wire envelope MUST be `{context, request}` and the reply `{request_id, result}` or `{request_id, error}`. | V3 schema test. |
| OPS-03 | `context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace_id`. It MUST NOT contain identity, tenant, role, scope, or lease. | V1 type; V3 rejection test. |
| OPS-04 | `request_id` MUST be generated when absent and MUST be stable across retries of the same logical request. | V3 test. |
| OPS-05 | The execution pipeline MUST follow this order: decode/size → authenticate or establish anonymity → authentication requirement → scope → deadline/admission → generated input validation → idempotency claim → replay branch (`replay_authorize` then stored result) or acquire branch (`prepare` then execute) → commit/outbox → result/reply. | V3 instrumented pipeline test. |
| OPS-06 | No side effect MAY occur before authorization succeeds. | V3 failure-injection test. |
| OPS-07 | Authorization MUST run inside the operation, not only in the adapter. | V3 bypass test. |
| OPS-08 | Tenant and ownership MUST be derived from `VerifiedIdentity` and the target resource, never from request-supplied IDs alone. | V3 cross-tenant test. |
| OPS-09 | Mutating operations MUST define idempotency semantics: same key + same canonical request reuses the result; same key + different request returns a conflict. | V3 test. |
| OPS-10 | Mutations that touch multiple resources MUST use a transaction or a compensating action. | V3 failure-injection test. |
| OPS-11 | Streaming operations MUST declare their mode and MUST define EOF, error, cancellation, and backpressure semantics. | V3 streaming test. |
| OPS-12 | One operation MUST have one handler. Adapter-specific branching inside the handler is forbidden. | V2 import/scan; V4 review. |
| OPS-13 | Operation inputs and outputs MUST be protocol-independent. Protobuf-generated types, HTTP types, and CLI types MUST NOT appear in `*-operation`. | V2 import scan. |
| OPS-14 | An operation MUST declare `AuthenticationRequirement::Required` or `AuthenticationRequirement::Anonymous`. Anonymous is not a scope, and `Option<Identity>` or an implicit anonymous path is forbidden. | V1 type; V3 test. |
| OPS-15 | Every operation MUST publish domain events only after commit. | V3 test. |
| OPS-16 | Every operation MUST have a conformance identifier and at least one oracle for normal and failure behavior. | V3 rule coverage. |
| OPS-17 | `ErasedPrepared` MUST be opaque: it preserves the authentication kind and operation mode, and is consumed only by the erased operation that produced it. | V1/V2 visibility; V3 test. |
| OPS-18 | The generated `ContractValidate::validate()` MUST run in the common dispatch path for every interface, before idempotency claim and business logic. | V3 test. |

**Rationale for OPS-05 and OPS-07.** Interfaces are replaceable; authorization
is not. If authorization lives only in the REST middleware, the CLI and MCP
paths become authorization bypasses. The operation is the only place every
interface must pass through.

---

## 5. Identity and Authentication

### 5.1 Identity model

| ID | Rule | Verification |
|---|---|---|
| ID-01 | `SubjectId` MUST be an internal, immutable identifier. Email addresses and external provider IDs MUST NOT be used as `sub`. | V1 newtype; V3 token test. |
| ID-02 | Operations MUST receive exactly one identity type: `VerifiedIdentity`. A duplicate `Principal` type is forbidden. | V2 type scan; V4 review. |
| ID-03 | `VerifiedIdentity` MUST be constructible only by the verifier. Fields MUST be private; the constructor MUST be `pub(crate)` or equivalent. | V1 visibility; V3 compile-fail test. |
| ID-04 | `VerifiedIdentity` MUST NOT implement `Deserialize` or any public constructor. | V1; V3 compile-fail test. |
| ID-05 | Delegated execution MUST distinguish the actor from the subject: `actor` and `on_behalf_of` MUST be separate fields. | V1 type; V3 test. |
| ID-06 | Operations MUST NOT receive a raw JWT, `iss`, external account ID, or provider name. | V2 import/type scan. |

### 5.2 Authentication contracts

| ID | Rule | Verification |
|---|---|---|
| AUTH-01 | Token verification MUST be expressed as a protocol-independent `AccessTokenVerifier` trait in `identity-core`. | V1 trait; V2 import scan. |
| AUTH-02 | Token issuance MUST be expressed as a `TokenIssuer` trait; every login method MUST use this single issuance path. | V1 trait; V3 test. |
| AUTH-03 | Access tokens MUST be JWS. JWE is not used. | V3 token test. |
| AUTH-04 | The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile. | V2 config check; V3 negative test. |
| AUTH-05 | The verifier MUST enforce an explicit algorithm allowlist and MUST reject `none`, unknown algorithms, and algorithm/operation mismatches. | V3 negative tests N-1, N-2, N-3. |
| AUTH-06 | Tokens MUST contain `iss`, `sub`, `aud`, `exp`, `iat`, and `jti`. `nbf` and `scope` MAY be present. | V3 token test. |
| AUTH-07 | `sub` MUST be the internal `SubjectId`. | V3 token test. |
| AUTH-08 | `aud` MUST identify one interface or resource. Wildcard audiences are forbidden. A token for one interface MUST be rejected by another. | V3 audience-isolation test. |
| AUTH-09 | Access-token lifetime MUST be short and configurable (recommended 5–15 minutes). | V2 config check. |
| AUTH-10 | Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multiple active public keys MUST be supported for rotation. | V1 trait; V3 rotation test. |
| AUTH-11 | Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the token. JWKS URLs MUST be fixed by configuration. | V3 negative test N-11. |
| AUTH-12 | Validation order MUST be: algorithm allowlist → signature → `iss` → `aud` → `exp`/`nbf` → `typ` → `sub` → tenant/delegation → `ver` → `jti`. | V3 instrumented test. |
| AUTH-13 | Access tokens, ID tokens, and other token types MUST be mutually exclusive by `typ`, required claims, key, and audience. An external ID token MUST NOT be accepted as an access token. | V3 negative test N-9. |
| AUTH-14 | Revocation MUST be checked after signature validation, using `jti` and/or a user-level token version. Revocation checks MUST NOT replace cryptographic validation. | V3 test. |
| AUTH-15 | Refresh tokens MUST be opaque random values, stored only as hashes, rotated on every use, and revoked as a session family on reuse detection. | V3 test. |
| AUTH-16 | Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reasons MUST be logged, never returned. | V3 response test. |
| AUTH-17 | Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appear in logs, `Debug`, error bodies, or metrics. | V2 log scan; V3 redaction test. |
| AUTH-18 | Login MUST be an operation (`auth.token.issue` or equivalent). It MUST NOT be a transport-specific router contract in `identity-core`. | V1 type; V2 import scan. |
| AUTH-19 | Each interface MAY implement its own credential acquisition flow, but all flows MUST end at the same `TokenIssuer`. | V3 test. |
| AUTH-20 | HS256 is permitted only when all of the following hold: single process, no cross-interface token use, explicit `local-only` profile, key length ≥ 32 bytes. | V2 profile check; V3 negative test. |

**Rationale for AUTH-04.** Asymmetric signatures let the API verify with public
keys only. Moving issuance to another process or an external identity provider
then changes configuration, not the verifier's secret material. HS256 couples
issuer and verifier through a shared secret and does not survive that move.

**Rationale for AUTH-08.** A token leaked from the CLI must not become a REST,
gRPC, or MCP credential. Audience separation is the boundary that makes a leak
local to one interface.

### 5.3 Per-interface authentication

| ID | Rule | Verification |
|---|---|---|
| AUTH-21 | REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401. | V3 test. |
| AUTH-22 | WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. Long-lived JWT query parameters are forbidden. | V3 test. |
| AUTH-23 | gRPC MUST read credentials from metadata and map auth failures to `UNAUTHENTICATED` or `PERMISSION_DENIED`. | V3 test. |
| AUTH-24 | CLI MUST store tokens in an OS-protected store or a `0600` file, never in argv or shell history. | V2 argv scan; V3 test. |
| AUTH-25 | CLI local execution MUST establish an explicit principal and MUST NOT grant implicit administrator rights. | V3 test. |
| AUTH-26 | MCP MUST implement the authentication discovery/challenge required by the adopted MCP specification, and MUST NOT pass a received token through to a downstream API. | V3 protocol test. |
| AUTH-27 | A2A MUST implement the security mechanism required by the adopted A2A specification. | V3 protocol test. |
| AUTH-28 | Authentication requirement (`Required`/`Anonymous`) MUST be separate from scope. Anonymous operations use `AnonymousOperation` and never receive a `VerifiedIdentity`. | V1 type; V3 test. |
| AUTH-29 | `VerifiedIdentity` MUST carry the credential binding: interface, audience, method, authentication time, expiry, token ID, and token version. The dispatcher MUST reject a binding mismatch. | V1 type; V3 test. |
| AUTH-30 | A session ticket and a local identity issuer MUST create a new binding. A token or identity verified for one interface/audience MUST NOT be reused for another. | V3 test. |
| AUTH-31 | Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST reject an unauthorized actor or an excessive scope set. | V3 test. |

---

## 6. SSO Extension

SSO is optional. When planned, the following contracts are fixed now.

| ID | Rule | Verification |
|---|---|---|
| SSO-01 | SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or `*-core`. | V2 dependency check. |
| SSO-02 | OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC are forbidden. | V3 protocol test. |
| SSO-03 | `state` MUST be generated per request and bound to the browser session; OIDC `nonce` MUST be used. Both MUST be single-use. | V3 test. |
| SSO-04 | Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden. | V2 config check; V3 test. |
| SSO-05 | The external issuer (`iss`) MUST be validated per provider to prevent mix-up attacks. | V3 test. |
| SSO-06 | The external ID token MUST be verified inside `identity-sso` and discarded. It MUST NOT be forwarded to the API or operation layer. | V2 import scan; V3 test. |
| SSO-07 | SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer` to issue an internal access token. | V1 type; V3 test. |
| SSO-08 | External accounts MUST be stored in `external_identities` with `UNIQUE(issuer, subject)`. Business tables MUST NOT store external provider IDs. | V2 schema check; V3 test. |
| SSO-09 | Accounts MUST NOT be linked automatically by email address. Linking requires an explicit, auditable action. | V3 test. |
| SSO-10 | Provider client IDs and secrets MUST come from configuration or environment variables, never source code. | V2 secret scan. |
| SSO-11 | Adding SSO MUST change only: the `identity-sso` crate, authentication adapters, assembly wiring, configuration, and `external_identities`. Business operations, `VerifiedIdentity`, and business tables MUST remain unchanged. | V3 regression test; V4 review. |
| SSO-12 | External ID tokens and internal access tokens MUST be mutually rejected by their verification rules. | V3 negative test N-9. |

**Fixed SSO contract:**

```text
external login verified
        ↓
internal SubjectId resolved
        ↓
allowed scopes and audience decided
        ↓
internal access token issued
```

**Rationale for SSO-09.** Email addresses are not a stable cross-provider
identity. Automatic linking by email enables account takeover when a provider
recycles or reassigns an address.

---

## 7. Authorization

| ID | Rule | Verification |
|---|---|---|
| AUTHZ-01 | Authorization MUST be expressed as `Authorizer::require(identity, action, resource)`. | V1 trait; V4 review. |
| AUTHZ-02 | Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked. | V3 test. |
| AUTHZ-03 | Tenant and owner checks MUST use the identity and the loaded resource, not request-supplied IDs. | V3 cross-tenant test. |
| AUTHZ-04 | Anonymous operations MUST be explicitly declared. `Option<Identity>` must not be used to express "maybe anonymous". | V1 type; V3 test. |
| AUTHZ-05 | A target in another tenant MUST return not-found. A target in the caller's tenant with insufficient rights MUST return permission-denied. | V3 test. |
| AUTHZ-06 | Scope strings MUST NOT be compared in handlers or adapters; policy belongs in one authorizer implementation. | V2 string scan; V4 review. |
| AUTHZ-07 | Authorization and mutation races MUST be handled with a transaction or a conditional update. | V3 race test. |
| AUTHZ-08 | An interface-level pre-check MAY exist, but it MUST NOT replace the operation-level authorization. | V3 bypass test. |
| AUTHZ-09 | The same identity, action, and resource MUST produce the same authorization result through every interface. | V3 conformance test. |

---

## 8. Interface Adapters

### 8.1 Common rules

| ID | Rule | Verification |
|---|---|---|
| IF-01 | An adapter MUST only: extract credentials, convert input, call the verifier, call the operation, convert output, and map errors. | V4 review; V2 business-logic scan. |
| IF-02 | An adapter MUST NOT implement business rules, authorization policy, or persistence. | V2 import scan; V4 review. |
| IF-03 | Credential extraction MUST be adapter-specific; verification MUST call the shared `AccessTokenVerifier`. | V2 import scan; V3 test. |
| IF-04 | Protocol errors MUST be mapped from the protocol-independent error vocabulary. Adapters MUST NOT invent operation errors. | V3 mapping test. |
| IF-05 | Every implemented interface MUST expose every operation unless the operation is explicitly declared not applicable, with a reason. | V3 matrix test. |
| IF-06 | No interface may call another interface to reach an operation. | V2 dependency check. |
| IF-07 | Protocol state (connection, subscription, task, stream) MUST remain in the adapter or in `*-operation` state, never duplicated in both. | V4 review; V3 state test. |
| IF-08 | Every response MUST carry the operation's `request_id`; streaming messages MUST carry a correlation identifier. | V3 test. |

### 8.2 Interface-specific rules

The canonical interface rules are defined in Part III:

- Part III.6 — REST: `REST-01` through `REST-18`.
- Part III.7 — WebSocket: `WS-01` through `WS-35`.
- Part III.8 — CLI: `CLI-01` through `CLI-14`.
- Part III.9 — gRPC: `GRPC-01` through `GRPC-19`.
- Part III.10 — MCP: `MCP-01` through `MCP-21`.
- Part III.11 — A2A: `A2A-01` through `A2A-24`.

Part II §8.1 remains the common adapter rule. The interface specifications are
normative and use unique IDs recorded in Part III.15. Part II does not restate
them.

---

## 9. Errors, Observability, and Security

### 9.1 Error model

| ID | Rule | Verification |
|---|---|---|
| ERR-01 | Operations MUST return a protocol-independent error value with `code`, `domain`, `retryable`, and optional structured details. | V1 type. |
| ERR-02 | Error codes MUST be stable identifiers; adapters MUST map them to protocol statuses. | V3 mapping test. |
| ERR-03 | Error values MUST NOT contain secrets, tokens, passwords, or raw provider responses. | V2 scan; V3 redaction test. |
| ERR-04 | Retryability MUST be explicit. Validation and authentication errors are not retryable. | V3 test. |
| ERR-05 | Each interface MUST have one error-mapping table and one test per code. | V3 coverage test. |

### 9.2 Observability

| ID | Rule | Verification |
|---|---|---|
| OBS-01 | Logs MUST be structured and include `request_id`, `operation_id`, `subject`, result, and duration. | V3 log test. |
| OBS-02 | Logs MUST NOT include tokens, secrets, authorization codes, or passwords. | V2 scan; V3 test. |
| OBS-03 | Metrics MUST cover operation latency, error rate, authentication failures, and audience rejections. | V2 metric inventory. |
| OBS-04 | Metrics and logs MUST distinguish interface, operation, and error code. | V3 test. |
| OBS-05 | Health endpoints MUST be minimal in public mode; detailed readiness is privileged. | V3 test. |

### 9.3 Security

| ID | Rule | Verification |
|---|---|---|
| SEC-01 | Transport MUST use TLS outside loopback-only local mode. | V2 config check. |
| SEC-02 | Authentication endpoints and mutating operations MUST be rate-limited. | V3 load test. |
| SEC-03 | Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them. | V2 secret scan. |
| SEC-04 | Dependencies MUST be audited for known vulnerabilities before release. | V2 audit command. |
| SEC-05 | Debug output MUST NOT leak request bodies or credentials. | V2 scan; V3 test. |

---

## 10. Conformance

Conformance is the executable form of this document. The canonical conformance
rules are `CONF-01` through `CONF-44` in Part III.12. Part II does not duplicate
that table. The minimum obligations are:

- every operation appears in the operation × interface matrix;
- every implemented interface passes the negative authentication suite;
- the same identity, input, and resource produce the same result, error code,
  state, and authorization outcome through every interface;
- no interface bypasses operation authorization;
- every rule ID has a verdict in the canonical registry.

---

## 11. Per-Operation Specification Template

Every operation in a project's `SYSTEM-DESIGN.md` MUST use this template.

```text
OP-xxx <operation_id>
  Types:          <Request> → <Response>
  Authentication: required | anonymous
  Scope:          read | control | admin (required operations only)
  Mode:           U | S | C | B
  Preconditions:  ...
  Procedure:      ... (prepare: validation/load/authorize; execute: reserve/mutate/commit/outbox)
  Failure:        ... (compensation, forward recovery, isolation, retryability)
  Postconditions: ...
  Interfaces:
    REST:         <METHOD> <path>
    WebSocket:    operation_id = "<operation_id>"
    CLI:          <command>
    gRPC:         <service>/<method>
    MCP:          <tool name>
    A2A:          <skill/task mapping>
  Conformance:    CF_<operation_id>
  Rules:          <rule IDs that need special attention>
```

A missing interface binding MUST be declared as `not applicable` with a reason.
An operation without a conformance identifier is not complete.

---

## 12. Application to Projects

### 12.1 Project profile

Each project MUST declare its profiles in `RULES-PROFILE.toml` (see §0.5).
Projects that are not Rust do not adopt this document.

### 12.2 Crate mapping

Each project MUST record how its existing crates map to the roles in §3.1.
Unmapped crates are a finding, not an exception.

Example:

| Role | gaia | crystal | doors |
|---|---|---|---|
| core | `gaia-core`, `gaia-foundation`, `gaia-ports` | `crystal-core`, `crystal-protocol-types` | `doors-core` |
| operation | `gaia-operation` | `crystal-operation`, `crystal-protocol-*` | `doors-operation` |
| conformance | `gaia-conformance` | `crystal-conformance`, `crystal-testkit` | `doors-conformance` |
| rest | `gaia-rest` | to be created | `doors-rest` |
| websocket | `gaia-websocket` | to be created | `doors-websocket` |
| cli | `gaia-cli` | to be created | `doors-cli` |
| grpc | to be created | to be created | `doors-grpc` |
| mcp / a2a | to be created | to be created | to be created |

### 12.3 Application rules

| ID | Rule | Verification |
|---|---|---|
| APP-01 | A project MUST declare its profiles and MUST list every unimplemented interface as absent. | V2 profile check. |
| APP-02 | A project MUST maintain an operation catalog using the §11 template. | V3 catalog test. |
| APP-03 | A project MUST map its crates to §3.1 roles and record the mapping. | V4 review; V2 manifest check. |
| APP-04 | Exceptions MUST be declared with a reason, scope, owner, and expiry. Undeclared exceptions are defects. | V2 exception check. |
| APP-05 | This document is versioned. A project pins the version it applies. | V2 lock/check. |
| APP-06 | Adoption order SHOULD, within the interface profiles a project selects, be: identity-core and identity-jwt → operation authorization and conformance → REST → WebSocket → CLI → gRPC → MCP → A2A. A project MAY select any subset. | V4 review; project plan. |
| APP-07 | Each adopted rule MUST first have a failing conformance test, then an implementation, then a refactor. | V3 test history; V4 review. |

---

## 13. Rule Index

The following index is the normative checklist. A project's conformance report
MUST name every rule and its verdict. Detailed IDs, classes, and verification
are in Part III.15; this index is a navigation aid, not a second registry.

### Meta and invariants

INV-01 one implementation per operation · INV-02 every interface calls the same
operation · INV-03 authentication once, authorization inside the operation ·
INV-04 no transport/JWT/SSO types in core/operation · INV-05 SSO adds no
business changes · INV-06 conformance proves compliance · INV-07 no
cross-interface token reuse · INV-08 no side effect before authorization ·
FREE-01 no closed feature list · FREE-02 open additions · FREE-03 free
internals · FREE-04 any interface subset · FREE-05 project-local extension ·
FREE-06 extend, do not fork · FREE-07 amend a feature-blocking rule · FREE-08
versioned amendment · FREE-09 additional crate roles · FREE-10 lifecycle-only
state · FREE-11 open resource IDs · FREE-12 recommended interface order ·
FREE-13 hand-written internals free · VER-01 one spec version · VER-02 project
pinning · VER-03 major for closed-seam changes · VER-04 minor for new extension
points · VER-05 major for rejecting previously valid projects · VER-06 amend
by extending, not excepting

### Architecture

ARC-01 roles · ARC-02 dependency direction · ARC-03 no transport in
core/operation · ARC-04 no adapter-to-adapter · ARC-05 conformance direction ·
ARC-06 assembly-only wiring · ARC-07 ports in core · ARC-08 operation depends on
identity-core only · ARC-09 naming · ARC-10 module layout

### Operation

OPS-01 operation ID · OPS-02 envelope · OPS-03 context contents · OPS-04
request ID · OPS-05 pipeline · OPS-06 no pre-auth side effects · OPS-07
authorization inside operation · OPS-08 tenant/owner derivation · OPS-09
idempotency · OPS-10 transaction/compensation · OPS-11 streaming semantics ·
OPS-12 one handler per operation · OPS-13 no protocol types · OPS-14 public
operations explicit · OPS-15 publish after commit · OPS-16 conformance ID ·
OPS-17 opaque prepared state · OPS-18 generated validation

### Identity and authentication

ID-01 SubjectId · ID-02 single identity type · ID-03 unconstructible · ID-04 no
Deserialize · ID-05 actor/delegation · ID-06 no raw token in operations ·
AUTH-01 verifier trait · AUTH-02 issuer trait · AUTH-03 JWS · AUTH-04
asymmetric default · AUTH-05 algorithm allowlist · AUTH-06 required claims ·
AUTH-07 internal subject · AUTH-08 per-interface audience · AUTH-09 short TTL ·
AUTH-10 key store · AUTH-11 no token-supplied key URLs · AUTH-12 validation
order · AUTH-13 token-type separation · AUTH-14 revocation · AUTH-15 refresh
tokens · AUTH-16 collapsed auth errors · AUTH-17 no secrets in logs · AUTH-18
login is an operation · AUTH-19 single issuance path · AUTH-20 local-only
HS256 · AUTH-21 REST bearer · AUTH-22 WebSocket ticket · AUTH-23 gRPC metadata ·
AUTH-24 CLI storage · AUTH-25 CLI local principal · AUTH-26 MCP auth · AUTH-27
A2A auth · AUTH-28 authentication requirement · AUTH-29 credential binding ·
AUTH-30 ticket/local binding · AUTH-31 delegation

### SSO

SSO-01 crate isolation · SSO-02 code+PKCE · SSO-03 state/nonce · SSO-04 exact
redirect · SSO-05 issuer validation · SSO-06 discard external token · SSO-07
AuthenticatedUser output · SSO-08 external identities · SSO-09 no email
linking · SSO-10 provider secrets · SSO-11 change scope · SSO-12 token-type
separation

### Authorization

AUTHZ-01 authorizer · AUTHZ-02 scope necessary not sufficient · AUTHZ-03
identity+resource · AUTHZ-04 explicit anonymous · AUTHZ-05 not-found vs
permission · AUTHZ-06 centralized policy · AUTHZ-07 race handling · AUTHZ-08 no
adapter substitution · AUTHZ-09 cross-interface parity

### Interfaces

Interface-specific rules are defined in Part III.6–III.11. Their canonical IDs
and classes are in Part III.15. Part II §8.1 defines the common adapter rules
`IF-01` through `IF-08`.

### Errors, observability, security

ERR-01 protocol-independent error · ERR-02 stable codes · ERR-03 secret-free ·
ERR-04 retryability · ERR-05 mapping tables · OBS-01 structured logs · OBS-02
no secrets in logs · OBS-03 metrics · OBS-04 dimensions · OBS-05 health ·
SEC-01 TLS · SEC-02 rate limiting · SEC-03 configuration secrets · SEC-04
dependency audit · SEC-05 debug output

### Conformance and application

Conformance rules are `CONF-01` through `CONF-64` in Part III.12. Application
rules are `APP-01` through `APP-07` in Part II §12. Documentation rules are
`DOC-01` through `DOC-17` in Part III.16. Validation rules are `VAL-01` through
`VAL-20` in Part III.17. Implementation blueprint rules are `BP-01` through
`BP-20` in Part III.18. Their classes and verification are in Part III.15.

---

## 14. Completion Criteria

A project is compliant when all of the following hold.

1. The crate graph passes ARC-02 through ARC-08.
2. Every operation has a complete §11 specification and a conformance ID.
3. Every implemented interface passes the operation × interface matrix.
4. The negative authentication suite passes for every interface.
5. Audience isolation passes between every pair of interfaces.
6. No adapter can construct a `VerifiedIdentity`.
7. Operation-level authorization cannot be bypassed from any interface.
8. SSO can be added without changing business operations, `VerifiedIdentity`,
   or business tables.
9. Every MUST rule has a named verification and a passing result.
10. Undeclared exceptions do not exist.
11. Every implemented interface has generated English documentation, and the
    `docgen --check all` gate passes.
12. Every request uses the shared input macro; validation parity and
    descriptor coverage pass.
13. The implementation blueprint in Part III.18 is followed; an alternate
    method has a versioned exception.

A project that cannot prove one of these is not compliant, regardless of
whether its code compiles or its documentation says otherwise.

---

## 15. Documentation

Every implemented interface MUST have generated English usage documentation.
Documentation is a build artifact, not a hand-maintained parallel text.

- Inputs: operation catalog, neutral schema registry, interface bindings, and
  shared contracts.
- The generator MUST NOT parse Rust source; it consumes the schema registry.
- `utoipa`/OpenAPI MAY supply schemas and the REST rendering, but MUST NOT be
  the only source for non-REST interfaces.
- Documentation generation MUST NOT require a running REST server or adapter.
- Completeness, English-only, secret-free, and determinism are build gates.
- Input constraints are declared once with the shared input macro; the same
  declaration generates the runtime validator, schema, and validation
  descriptor. Documentation consumes the descriptor, never a hand-written list.

The concrete rules are `DOC-01` through `DOC-17` in Part III.16 and
`VAL-01` through `VAL-20` in Part III.17. The mandatory implementation method is
`BP-01` through `BP-20` in Part III.18. A project MUST follow the blueprint or
declare a versioned exception.

---

# PART III — CONCRETE SPECIFICATION

The following documents define exact types, traits, layouts, public APIs,
generated files, interface rules, conformance obligations, the project template,
the migration plan, the canonical rule registry, the documentation pipeline,
the validation contract, and the mandatory implementation blueprint.


---

# PART III.1 — Foundation: Unify Seams, Not Substance

# Foundation: Unify Seams, Not Substance

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`

This document resolves the central design tension of the ruleset:

> Rules must never limit what a project can build, yet they must be concrete
> enough that gaia, crystal, doors, and every future conver project produce
> almost completely unified implementations.

The resolution is a division of labor:

- **Unify the seams.** Contracts, wire formats, identity, authorization
  placement, error semantics, adapter mechanics, and conformance obligations are
  fixed.
- **Free the substance.** Operations, scopes, error codes, auth methods,
  interfaces, storage, algorithms, optimizations, and domain behavior are open.
- **Generate the mechanics.** Anything that is the same in every project is
  derived from the operation catalog, not hand-copied.
- **Prove the behavior.** Conformance tests demonstrate that hand-written
  variation still satisfies the same contract.

A rule may constrain a seam or a safety invariant. A rule must never enumerate
the set of permitted features.

---

## 1. The Four Rule Classes

| Class | What it fixes | What it leaves open | Example |
|---|---|---|---|
| **C — Closed contract** | Shared types, wire shapes, token validation order, error categories, dependency direction, authorization location. | How the domain is modeled, which operations exist, which storage is used. | `InvocationContext`, `AuthenticatedContext`, and `AnonymousContext` have exactly the fields defined in `Part III.2`. |
| **G — Generated** | Mechanical files and bindings derived from the operation catalog. | Hand-written handler bodies, policies, compensations. | REST routes, CLI commands, proto services, conformance matrix rows. |
| **O — Open extension** | The trait, registration point, and conformance obligation for adding something. | How many operations, scopes, auth methods, interfaces, or backends a project adds. | A new auth method implements `CredentialVerifier` and calls `TokenIssuer`. |
| **P — Proof** | Test harness shape, oracle obligations, negative cases. | The implementation under test. | Every interface passes the same operation × interface matrix. |

A rule with no **Open** statement is over-specified. A rule with no **Fixed**
statement is not a rule.

---

## 2. Open Sets

These sets are extensible by any project. The rules define only how to add to
them, never how large they may be or what they may contain.

| Open set | How it is extended | What must not change |
|---|---|---|
| Operations | Add an entry to the operation catalog; implement `Operation`; bind interfaces; add conformance. | Envelope, context, authorization placement, error categories. |
| Scopes | Declare a new `Scope` value; add it to the authorization policy. | Scope is still necessary but not sufficient; operation-layer authorization. |
| Error codes | Add a new `ErrorCode`; map it to an existing protocol category. | The protocol category table and the `OperationError` shape. |
| Auth methods | Implement `CredentialVerifier`; call the existing `TokenIssuer`. | Token validation, audience rules, identity type. |
| SSO providers | Implement the `SsoProvider` trait in `identity-sso`. | Login flow contract, external identity storage, internal token issuance. |
| Interfaces | Implement `InterfaceDriver`; add a profile; extend the conformance matrix. | Adapter responsibilities, operation invocation, no cross-interface calls. |
| Streaming modes | Declare `U`/`S`/`C`/`B` per operation; implement the matching driver. | Envelope, cancellation, EOF, error semantics. |
| Storage backends | Implement the core ports (`Repository`, `UnitOfWork`, `Outbox`, `EventRelay`). | Core and operation contracts. |
| Domain models | Add types inside `*-core`. | Ports and invariants. |
| Performance strategies | Change internals behind ports. | Observable behavior and conformance results. |
| Crate roles | Declare an additional role (`tooling`, `test-support`, `build-support`, `utility`) in `RULES-PROFILE.toml` with its allowed dependency edges. | Dependency direction and forbidden edges. |
| Resource identifiers | Use any stable encoding (UUID, content hash, composite key) behind `ResourceId`. | Uniqueness and authorization semantics. |
| Aggregate state | Use a state enum only for aggregates with a lifecycle. | Invariant enforcement. |
| Internal layout | Choose hand-written module internals freely. | Public module layout and generated-file boundaries. |

---

## 3. Closed Seams

These are fixed because variation would break interoperability, security, or
conformance.

| Seam | Why closed |
|---|---|
| `InvocationContext` and envelope shape | Every interface and operation must speak the same request/reply shape. |
| `VerifiedIdentity` and `SubjectId` | Operations must never see provider-specific identity. |
| Authorization location | An adapter-level check is a bypass for every other interface. |
| Token validation order and required claims | A weaker order is a security defect, not a design choice. |
| Audience separation | Cross-interface token reuse turns one leak into six. |
| Error categories and mapping table | Different mappings make the same failure mean different things per interface. |
| Dependency direction | A transport type in `*-core` destroys portability. |
| Conformance obligations | Without them, “unified” is a claim rather than a proof. |

Closed seams are small and stable. They are the only place where a rule may say
“exactly this and nothing else.”

---

## 4. Generated Mechanics

The generator consumes the operation catalog and emits the parts that are
identical or mechanically derivable in every project.

| Input | Generated output |
|---|---|
| Operation catalog entry | `Operation` trait implementation skeleton in `*-operation`. |
| Request/response types | Serde attributes, JSON schema, protobuf messages, CLI flags, MCP tool schema. |
| REST binding | Router registration, path/method, extractor wiring, OpenAPI entry. |
| WebSocket binding | Operation dispatch entry, envelope conversion, correlation. |
| CLI binding | Subcommand, flag parsing, output formatter. |
| gRPC binding | Proto service method, metadata extraction, status mapping. |
| MCP binding | Tool registration, input/output schema, error mapping. |
| A2A binding | Skill/task mapping, event conversion. |
| Catalog entry | Conformance matrix row and test skeleton. |
| Rule ID | Gate command mapping and coverage row. |

Generated files are marked as generated. They are not hand-edited. A project
changes behavior by changing the catalog, the hand-written handler body, or an
extension trait, not by editing generated code.

---

## 5. Hand-Written Layer

These are the only places where projects are expected to differ.

| Layer | Content |
|---|---|
| `*-core` | Domain types, invariants, value objects, ports. |
| `*-operation` | Operation logic, authorization policy, transactions, compensation, idempotency, event publication. |
| `*-assembly` | Configuration, dependency injection, concrete wiring. |
| `identity-*` | Credential verification, token policy, SSO provider implementation. |
| Extensions | New operations, scopes, error codes, auth methods, interfaces, storage. |

The hand-written layer is where features live. The rules constrain its
boundaries, not its size or content.

---

## 6. Extension Model

### 6.1 Add an operation

1. Add the operation to the catalog with the §11 template.
2. Generate the handler skeleton and interface bindings.
3. Implement `Operation::execute` in `*-operation`.
4. Add authorization inside the handler.
5. Add conformance cases (normal, failure, authorization).
6. Regenerate the interface bindings and matrix.

No shared contract changes.

### 6.2 Add a scope

1. Declare the `Scope` constant.
2. Add it to the authorization policy.
3. Add a conformance case for allowed and denied access.

No adapter changes.

### 6.3 Add an error code

1. Add the `ErrorCode` constant.
2. Map it to an existing protocol category.
3. Add mapping tests for every implemented interface.

No change to `OperationError` or the category table.

### 6.4 Add an auth method

1. Implement `CredentialVerifier`.
2. Resolve the internal `SubjectId`.
3. Call the existing `TokenIssuer`.
4. Add conformance cases for success, failure, and audience.

No change to operations or `VerifiedIdentity`.

### 6.5 Add an SSO provider

1. Implement `SsoProvider` in `identity-sso`.
2. Verify the external token inside the provider.
3. Resolve `(issuer, subject)` through `ExternalIdentityRepository`.
4. Call `TokenIssuer` with the internal subject.
5. Add regression tests proving existing operations are unchanged.

No change to business tables or operations.

### 6.6 Add an interface

1. Implement `InterfaceDriver` for the new protocol.
2. Add an `InterfaceId` constant and an audience value.
3. Bind every applicable operation through generated entries.
4. Extend the conformance matrix.
5. Declare the profile in `RULES-PROFILE.toml`.

No change to operations.

### 6.7 Add a streaming mode

1. Declare the mode in the operation catalog.
2. Implement the corresponding stream driver.
3. Define EOF, error, cancellation, and backpressure.
4. Add cross-interface streaming conformance.

Existing operations are unaffected.

### 6.8 Add storage

1. Implement the core ports.
2. Keep the domain and operation contracts unchanged.
3. Add persistence conformance tests.

No contract change.

---

## 7. No-Limitation Guarantees

These guarantees are part of the ruleset.

| ID | Guarantee |
|---|---|
| FREE-01 | A rule MUST NOT enumerate a closed set of operations, scopes, error codes, features, or domain types. |
| FREE-02 | A project MAY add operations, scopes, error codes, auth methods, interfaces, streaming modes, and storage without changing this ruleset. |
| FREE-03 | A project MAY use any algorithm, data structure, crate, or optimization behind a port, provided conformance passes. |
| FREE-04 | A project MAY implement a subset of interface profiles; absence must be declared, not inferred. |
| FREE-05 | A project MAY add a project-local extension crate implementing the declared extension traits. The extension MUST pass conformance. |
| FREE-06 | If a shared contract blocks a legitimate feature, the contract is extended with a new default method, trait, feature flag, or version. The project MUST NOT fork the contract. |
| FREE-07 | A rule that limits a feature without protecting a seam or invariant is a defect in the ruleset and MUST be amended. |
| FREE-08 | Rule amendments follow the versioning policy in §9; existing projects are never broken silently. |
| FREE-09 | A project MAY add crate roles for tooling, tests, benchmarks, build support, or utility code. The role and its allowed dependency edges are declared; forbidden edges still apply. |
| FREE-10 | A state-machine requirement applies only to aggregates with a lifecycle. Value objects and stateless aggregates are not forced into a state enum. |
| FREE-11 | Resource identifiers are open. UUID, content hash, and composite keys are all valid behind `ResourceId`. |
| FREE-12 | Interface adoption order is a recommendation, not a precondition. A project MAY implement any subset, including MCP or A2A alone. |
| FREE-13 | Only public module boundaries, generated files, and forbidden edges are fixed. Hand-written internal layout may differ. |

---

## 8. How “Almost Complete Unification” Is Achieved

Rules alone cannot make two codebases almost identical. The ruleset therefore
requires four mechanisms working together.

| Mechanism | What it unifies |
|---|---|
| Shared contract crate | Types, traits, envelope, identity, errors, conformance harness. |
| Generator | Adapter skeletons, bindings, mappings, matrix rows. |
| Conformance kit | Observable behavior, authorization outcomes, negative cases. |
| Golden reference | File layout, naming, module structure, review patterns. |

A project that passes conformance but uses a different file layout is still
unified at the seam but not at the code level. To reach code-level unity, the
shared contract crate and generator are mandatory; conformance is the proof, not
the substitute.

The generator and shared crate are versioned together. A project pins the
version. Upgrading is a deliberate act, never an implicit drift.

---

## 9. Versioning and Amendment

| ID | Rule |
|---|---|
| VER-01 | The ruleset, shared contracts, generator, and conformance kit share one version. |
| VER-02 | A project pins the version in `RULES-PROFILE.toml`. |
| VER-03 | Removing or changing a closed seam requires a major version and a migration note. |
| VER-04 | Adding an open extension point is a minor version. |
| VER-05 | Adding a rule that would reject a previously valid project requires a major version. |
| VER-06 | A rule that blocks a legitimate feature is amended by extending the seam, not by granting an exception. |

---

## 10. Non-Goals

This ruleset does not:

- prescribe domain models, operation sets, or business rules;
- prescribe storage engines, algorithms, data structures, or performance
  strategies;
- require every project to implement every interface;
- require every project to use the same UI, deployment model, or configuration
  format beyond the shared seams;
- forbid additional interfaces, auth methods, or providers;
- treat file existence, documentation, or fixture names as proof of compliance.

---

## 11. Review Checklist

Before accepting a new rule or a project exception, answer all of these.

1. What seam or invariant does the rule fix?
2. What does the rule explicitly leave open?
3. Does the rule enumerate a closed set of features? If yes, rewrite it.
4. Is the rule verifiable by V1, V2, or V3?
5. Can a project add a new operation, scope, error code, auth method, or
   interface without changing the rule?
6. If the rule blocks a legitimate feature, is the correct action an extension
   of the seam rather than an exception?
7. Is the rule class (C/G/O/P) stated?

A rule that fails any of these is not ready.

---

# PART III.2 — Shared Contracts

# 10 — Shared Contracts

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Rule registry:** Part III.15

These contracts are the **closed seams**. Their shape is fixed so that every
project and every interface can be compared, generated, and conformance-tested.
Their **contents** remain open: operations, scopes, error codes, auth methods,
interfaces, and domain types may grow without changing these shapes.

This revision addresses the review findings R-001 through R-016. The changes
are normative and supersede the previous version.

---

## 1. Identifier Types

All identifiers are newtypes. Open identifiers provide explicit constructors so
that other crates do not need private-field access.

```rust
pub type BoxFuture<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SubjectId(uuid::Uuid);

impl SubjectId {
    pub const fn from_uuid(value: uuid::Uuid) -> Self { Self(value) }
    pub const fn as_uuid(&self) -> uuid::Uuid { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TenantId(uuid::Uuid);
impl TenantId {
    pub const fn from_uuid(value: uuid::Uuid) -> Self { Self(value) }
    pub const fn as_uuid(&self) -> uuid::Uuid { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SessionId(uuid::Uuid);
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ActorId(uuid::Uuid);
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct RequestId(uuid::Uuid);
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TraceId(uuid::Uuid);

#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct IdempotencyKey(Box<str>);
impl IdempotencyKey {
    pub fn parse(value: impl Into<Box<str>>) -> Result<Self, ContractError>;
    pub fn as_str(&self) -> &str;
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct OperationId(&'static str);
impl OperationId {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Scope(&'static str);
impl Scope {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Audience(&'static str);
impl Audience {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct InterfaceId(&'static str);
impl InterfaceId {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ErrorCode(&'static str);
impl ErrorCode {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ErrorDomain(&'static str);
impl ErrorDomain {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Action(&'static str);
impl Action {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AuthMethod(&'static str);
impl AuthMethod {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TokenId(Box<str>);
impl TokenId {
    pub fn parse(value: impl Into<Box<str>>) -> Result<Self, ContractError>;
    pub fn as_str(&self) -> &str;
}
```

`ScopeSet` is a public, constructible value:

```rust
#[derive(Clone, Default, PartialEq, Eq)]
pub struct ScopeSet(Vec<Scope>);

impl ScopeSet {
    pub fn new() -> Self;
    pub fn from_scopes(scopes: impl IntoIterator<Item = Scope>) -> Self;
    pub fn insert(&mut self, scope: Scope) -> bool;
    pub fn contains(&self, scope: Scope) -> bool;
    pub fn iter(&self) -> impl Iterator<Item = Scope> + '_;
    pub fn is_subset_of(&self, parent: &ScopeSet) -> bool;
}
```

`ResourceId` is intentionally open. A project may use a UUID, a content hash, a
composite key, or a string:

```rust
#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ResourceId(Box<str>);
impl ResourceId {
    pub fn new(value: impl Into<Box<str>>) -> Self;
    pub fn as_str(&self) -> &str;
}
```

---

## 2. Verified Identity and Credential Binding

The verifier returns an opaque identity that carries **what was verified, where,
and until when**. The identity alone is not enough to authorize use through a
different interface or audience.

```rust
#[derive(Clone)]
pub struct VerifiedIdentity {
    subject: SubjectId,
    tenant: Option<TenantId>,
    scopes: ScopeSet,
    session_id: Option<SessionId>,
    actor: Option<ActorId>,
    on_behalf_of: Option<SubjectId>,
    binding: CredentialBinding,
}

#[derive(Clone)]
pub struct CredentialBinding {
    interface: InterfaceId,
    audience: Audience,
    method: AuthMethod,
    authenticated_at: std::time::SystemTime,
    expires_at: std::time::SystemTime,
    token_id: Option<TokenId>,
    token_version: u64,
}

impl VerifiedIdentity {
    pub fn subject(&self) -> SubjectId;
    pub fn tenant(&self) -> Option<TenantId>;
    pub fn scopes(&self) -> &ScopeSet;
    pub fn session_id(&self) -> Option<SessionId>;
    pub fn actor(&self) -> Option<ActorId>;
    pub fn on_behalf_of(&self) -> Option<SubjectId>;
    pub fn binding(&self) -> &CredentialBinding;

    // Only identity-core may construct this value.
    pub(crate) fn from_verified(parts: VerifiedParts) -> Self;
}

impl CredentialBinding {
    pub fn interface(&self) -> InterfaceId;
    pub fn audience(&self) -> Audience;
    pub fn method(&self) -> AuthMethod;
    pub fn expires_at(&self) -> std::time::SystemTime;
    pub fn token_id(&self) -> Option<&TokenId>;
    pub fn token_version(&self) -> u64;
    pub fn is_valid_at(&self, now: std::time::SystemTime) -> bool;
}

pub(crate) struct VerifiedParts {
    pub subject: SubjectId,
    pub tenant: Option<TenantId>,
    pub scopes: ScopeSet,
    pub session_id: Option<SessionId>,
    pub actor: Option<ActorId>,
    pub on_behalf_of: Option<SubjectId>,
    pub binding: CredentialBinding,
}
```

### 2.1 Sealed construction

`VerifiedIdentity` has private fields and no public constructor. The JWT
verifier and the session-ticket store live inside `identity-core` behind the
`jwt` and `ticket` features; `identity-jwt` is a facade. This makes ID-03 a
compile-time property.

A project that wants a verifier outside `identity-core` must use the declared
static-check alternative (V2: only the trusted verifier crate may call
`from_verified`) and record the exception in `RULES-PROFILE.toml`. The
specification does not treat an import scan as equivalent to compile-time
sealing.

### 2.2 Binding checks

The dispatcher MUST reject an identity whose binding does not match the
invocation:

```rust
binding.interface() == invocation.interface
binding.audience() == invocation.audience
binding.is_valid_at(now)
```

A verified REST identity cannot be reused with a WebSocket audience. A session
ticket redeemed for WebSocket creates a **new binding** with the WebSocket
interface and the WebSocket audience; the ticket's redemption deadline and the
connection's authentication expiry are separate values.

### 2.3 Delegation

`sub` is the subject. `act` is the actor. `on_behalf_of` is the delegated
subject. The verifier MUST validate that:

- the actor is authorized to act for the subject;
- the delegated scopes are a subset of both the actor's and the subject's
  scopes;
- `on_behalf_of` is explicit and is never inferred from `sub`.

---

## 3. Authentication Contracts

```rust
pub trait AccessTokenVerifier: Send + Sync {
    fn verify(
        &self,
        token: &str,
        audience: &Audience,
    ) -> Result<std::sync::Arc<VerifiedIdentity>, AuthenticationError>;
}

pub trait TokenIssuer: Send + Sync {
    fn issue(
        &self,
        user: &AuthenticatedUser,
        scopes: &ScopeSet,
        audience: &Audience,
    ) -> Result<TokenPair, AuthenticationError>;
}

pub trait LocalIdentityIssuer: Send + Sync {
    fn establish(
        &self,
        user: &AuthenticatedUser,
        audience: Audience,
        ttl: std::time::Duration,
    ) -> Result<std::sync::Arc<VerifiedIdentity>, AuthenticationError>;
}

pub trait KeyStore: Send + Sync {
    fn public_key(&self, kid: &str, alg: Algorithm) -> Result<PublicKey, AuthenticationError>;
    fn active_kids(&self) -> Vec<String>;
}

pub struct TokenPair {
    pub access_token: secrecy::SecretString,
    pub refresh_token: Option<secrecy::SecretString>,
    pub expires_in: std::time::Duration,
}

pub enum AuthenticationError {
    Missing,
    Malformed,
    UnsupportedAlgorithm,
    InvalidSignature,
    Expired,
    NotYetValid,
    WrongIssuer,
    WrongAudience,
    WrongTokenType,
    UnknownKey,
    Revoked,
    VersionMismatch,
    DelegationInvalid,
    Provider(String),
}
```

`CredentialVerifier` has a typed API and an erased API for `dyn` use:

```rust
pub trait CredentialVerifier: Send + Sync {
    type Credential: Send;
    fn verify(&self, credential: Self::Credential)
        -> Result<AuthenticatedUser, AuthenticationError>;
}

pub trait ErasedCredentialVerifier: Send + Sync {
    fn verify_json(
        &self,
        credential: serde_json::Value,
    ) -> Result<AuthenticatedUser, AuthenticationError>;
}
```

`SsoProvider` is the open extension point:

```rust
pub trait SsoProvider: Send + Sync {
    type Callback: Send;
    fn authorization_url(&self, state: &str, nonce: &str) -> String;
    fn exchange(&self, callback: Self::Callback)
        -> Result<ExternalIdentity, AuthenticationError>;
}

pub struct ExternalIdentity {
    pub issuer: String,
    pub subject: String,
    pub claims: serde_json::Value,
}

pub trait ExternalIdentityRepository: Send + Sync {
    fn find(
        &self,
        issuer: &str,
        subject: &str,
    ) -> Result<Option<SubjectId>, AuthenticationError>;

    fn link(
        &self,
        subject: SubjectId,
        issuer: &str,
        external_subject: &str,
    ) -> Result<(), AuthenticationError>;
}
```

---

## 4. Invocation Contexts

Authentication requirement is separate from scope. An operation is either
authenticated or anonymous; `public` is not a scope and does not mean
"unauthenticated".

```rust
pub enum AuthenticationRequirement {
    Required,
    Anonymous,
}

pub struct InvocationContext {
    request_id: RequestId,
    interface: InterfaceId,
    audience: Audience,
    deadline: Option<std::time::Instant>,
    idempotency_key: Option<IdempotencyKey>,
    trace_id: Option<TraceId>,
}

pub struct AuthenticatedContext {
    invocation: InvocationContext,
    identity: std::sync::Arc<VerifiedIdentity>,
    execution: ExecutionScope,
}

pub struct AnonymousContext {
    invocation: InvocationContext,
    peer: PeerInfo,
}

pub struct PeerInfo {
    pub remote_addr: Option<String>,
    pub user_agent: Option<String>,
}

impl InvocationContext {
    pub fn request_id(&self) -> RequestId;
    pub fn interface(&self) -> InterfaceId;
    pub fn audience(&self) -> Audience;
    pub fn deadline(&self) -> Option<std::time::Instant>;
    pub fn idempotency_key(&self) -> Option<IdempotencyKey>;
    pub fn trace_id(&self) -> Option<TraceId>;
}

impl AuthenticatedContext {
    pub fn invocation(&self) -> &InvocationContext;
    pub fn identity(&self) -> &VerifiedIdentity;
    pub fn tenant(&self) -> Option<TenantId>;
    pub fn execution(&self) -> &ExecutionScope;
}

impl AnonymousContext {
    pub fn invocation(&self) -> &InvocationContext;
    pub fn peer(&self) -> &PeerInfo;
}
```

The dispatcher constructs these contexts. Adapters cannot construct an
`AuthenticatedContext` with an arbitrary identity, and they cannot turn an
authenticated identity into an anonymous one.

`interface` is available for logging and metrics. Business behavior MUST NOT
branch on `interface`; a conformance check rejects such branching.

---

## 5. Operation Contract

### 5.1 Modes

```rust
pub enum OperationMode {
    Unary,
    ServerStream,
    ClientStream,
    Bidirectional,
}
```

### 5.2 Authenticated operation

```rust
pub trait Operation: Send + Sync + 'static {
    type Request: serde::de::DeserializeOwned
        + validation_contract::ContractValidate
        + Send
        + 'static;
    type Response: serde::Serialize + Send + 'static;
    type Prepared: Send + 'static;

    const ID: OperationId;
    const SCOPE: Scope;
    const AUTH: AuthenticationRequirement = AuthenticationRequirement::Required;
    const MODE: OperationMode = OperationMode::Unary;

    /// Validate and authorize. No side effect is allowed here.
    fn prepare<'a>(
        &'a self,
        ctx: &'a AuthenticatedContext,
        request: Self::Request,
    ) -> BoxFuture<'a, Result<Self::Prepared, OperationError>>;

    /// Replay authorization is deliberately separate from prepare.
    /// It checks current access against the recorded target; it does not
    /// re-run creation preconditions, duplicate checks, or state transitions.
    fn replay_authorize<'a>(
        &'a self,
        ctx: &'a AuthenticatedContext,
        replay: &'a ReplayRecord,
    ) -> BoxFuture<'a, Result<(), OperationError>>;

    fn execute(
        &self,
        ctx: AuthenticatedContext,
        prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>>;

    fn execute_server_stream(
        &self,
        _ctx: AuthenticatedContext,
        _prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<ResponseStream<Self::Response>, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not a server stream")) })
    }

    fn execute_client_stream(
        &self,
        _ctx: AuthenticatedContext,
        _prepared: Self::Prepared,
        _input: RequestStream<Self::Request>,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not a client stream")) })
    }

    fn execute_bidi(
        &self,
        _ctx: AuthenticatedContext,
        _prepared: Self::Prepared,
        _input: RequestStream<Self::Request>,
    ) -> BoxFuture<'_, Result<ResponseStream<Self::Response>, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not bidirectional")) })
    }
}
```

### 5.3 Anonymous operation

```rust
pub trait AnonymousOperation: Send + Sync + 'static {
    type Request: serde::de::DeserializeOwned
        + validation_contract::ContractValidate
        + Send
        + 'static;
    type Response: serde::Serialize + Send + 'static;
    type Prepared: Send + 'static;

    const ID: OperationId;
    const MODE: OperationMode = OperationMode::Unary;

    fn prepare(
        &self,
        ctx: &AnonymousContext,
        request: Self::Request,
    ) -> BoxFuture<'_, Result<Self::Prepared, OperationError>>;

    fn execute(
        &self,
        ctx: AnonymousContext,
        prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>>;

    fn execute_server_stream(
        &self,
        _ctx: AnonymousContext,
        _prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<ResponseStream<Self::Response>, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not a server stream")) })
    }

    fn execute_client_stream(
        &self,
        _ctx: AnonymousContext,
        _prepared: Self::Prepared,
        _input: RequestStream<Self::Request>,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not a client stream")) })
    }

    fn execute_bidi(
        &self,
        _ctx: AnonymousContext,
        _prepared: Self::Prepared,
        _input: RequestStream<Self::Request>,
    ) -> BoxFuture<'_, Result<ResponseStream<Self::Response>, OperationError>> {
        Box::pin(async { Err(OperationError::unsupported("operation is not bidirectional")) })
    }
}
```

### 5.4 Streams

```rust
pub struct RequestStream<T> {
    // The receiving side of an adapter-fed stream.
}

pub struct RequestStreamSender<T> {
    // The adapter's sending side.
}

impl<T> RequestStream<T> {
    pub fn channel(capacity: usize) -> (RequestStreamSender<T>, Self);
    pub fn next(&mut self) -> BoxFuture<'_, Option<Result<T, OperationError>>>;
    pub fn cancel(&mut self) -> BoxFuture<'_, ()>;
    pub fn is_cancelled(&self) -> bool;
}

impl<T> RequestStreamSender<T> {
    pub fn push(&mut self, item: T) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn close(&mut self) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn cancel(&mut self) -> BoxFuture<'_, ()>;
}

pub struct ResponseStream<T> {
    // The receiving side consumed by the adapter.
}

pub struct ResponseStreamSender<T> {
    // The operation's sending side.
}

impl<T> ResponseStream<T> {
    pub fn channel(capacity: usize) -> (ResponseStreamSender<T>, Self);
    pub fn next(&mut self) -> BoxFuture<'_, Option<Result<T, OperationError>>>;
    pub fn cancel(&mut self) -> BoxFuture<'_, ()>;
    pub fn backpressure(&self) -> std::time::Duration;
}

impl<T> ResponseStreamSender<T> {
    pub fn push(&mut self, item: T) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn close(&mut self) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn fail(&mut self, error: OperationError) -> BoxFuture<'_, Result<(), OperationError>>;
}
```

Stream semantics are fixed:

- `None` from `next` means normal EOF.
- `Some(Err(_))` means abnormal termination.
- `cancel` is idempotent and must release resources.
- Backpressure is explicit; the producer must not buffer unboundedly.
- The dispatcher owns cancellation propagation from the interface to the
  operation.

### 5.5 Erased registry

```rust
pub enum ErasedOperation {
    Authenticated(std::sync::Arc<dyn ErasedAuthenticatedOperation>),
    Anonymous(std::sync::Arc<dyn ErasedAnonymousOperation>),
}

pub trait ErasedAuthenticatedOperation: Send + Sync {
    fn id(&self) -> OperationId;
    fn mode(&self) -> OperationMode;

    /// Deserialize and run the generated input validator. This is stateless
    /// validation and runs before the idempotency claim. It MUST NOT run
    /// business `prepare` or state-dependent preconditions.
    fn validate_json(
        &self,
        request: &serde_json::Value,
    ) -> Result<ErasedValidated, OperationError>;

    /// State-dependent preparation and business authorization. Called only on
    /// the newly-acquired branch, never on replay.
    fn prepare_validated(
        &self,
        ctx: &AuthenticatedContext,
        validated: ErasedValidated,
    ) -> BoxFuture<'_, Result<ErasedPrepared, OperationError>>;

    fn execute_json(
        &self,
        ctx: AuthenticatedContext,
        prepared: ErasedPrepared,
    ) -> BoxFuture<'_, Result<OperationResultBody, OperationError>>;

    fn execute_stream_json(
        &self,
        ctx: AuthenticatedContext,
        prepared: ErasedPrepared,
        input: Option<RequestStream<serde_json::Value>>,
    ) -> BoxFuture<'_, Result<ResponseStream<serde_json::Value>, OperationError>>;
}

pub trait ErasedAnonymousOperation: Send + Sync {
    fn id(&self) -> OperationId;
    fn mode(&self) -> OperationMode;

    fn validate_json(
        &self,
        request: &serde_json::Value,
    ) -> Result<ErasedValidated, OperationError>;

    fn prepare_validated(
        &self,
        ctx: &AnonymousContext,
        validated: ErasedValidated,
    ) -> BoxFuture<'_, Result<ErasedPrepared, OperationError>>;

    fn execute_json(
        &self,
        ctx: AnonymousContext,
        prepared: ErasedPrepared,
    ) -> BoxFuture<'_, Result<OperationResultBody, OperationError>>;

    fn execute_stream_json(
        &self,
        ctx: AnonymousContext,
        prepared: ErasedPrepared,
        input: Option<RequestStream<serde_json::Value>>,
    ) -> BoxFuture<'_, Result<ResponseStream<serde_json::Value>, OperationError>>;
}

/// Opaque prepared state. Produced by `prepare_validated` and consumed by the same
/// erased operation's `execute_json` / `execute_stream_json`.
///
/// It preserves the authentication kind (authenticated or anonymous) and the
/// operation mode (unary, server stream, client stream, bidirectional). The
/// internal representation is owned by the shared crate and is not a public
/// contract; projects must not name or construct it.
pub struct ErasedValidated { /* opaque */ }

pub struct ErasedPrepared { /* opaque */ }

pub struct OperationRegistry {
    operations: std::collections::BTreeMap<OperationId, ErasedOperation>,
}

impl OperationRegistry {
    pub fn register<O: Operation>(&mut self, operation: O);
    pub fn register_anonymous<O: AnonymousOperation>(&mut self, operation: O);
    pub fn get(&self, id: OperationId) -> Option<&ErasedOperation>;
    pub fn ids(&self) -> impl Iterator<Item = OperationId> + '_;
}
```

`ErasedValidated` and `ErasedPrepared` are opaque values owned by the shared
crate. The erased operation that produced a value is its only consumer. It MUST
reject a value whose authentication kind or operation mode does not match the
requested execution. The dispatcher does not inspect or reconstruct either
value.

`validate_json` runs before the idempotency claim. `prepare_validated` runs only
on the newly-acquired branch. Replay calls `replay_authorize` and never calls
`prepare_validated`.

The registry rejects duplicate IDs. A catalog entry with no registration fails
startup.

### 5.6 Dispatcher

The dispatcher belongs to `operation-contract`, not to a project crate. This is
what lets it construct contexts and enforce the binding checks.

```rust
pub struct Dispatcher {
    registry: std::sync::Arc<OperationRegistry>,
    verifier: std::sync::Arc<dyn AccessTokenVerifier>,
    idempotency: std::sync::Arc<dyn IdempotencyStore>,
    results: std::sync::Arc<dyn ResultStore>,
    revocation: std::sync::Arc<dyn RevocationChecker>,
    clock: ClockFn,
    limits: DispatchLimits,
}

pub struct ServerStreamHandle {
    pub request_id: RequestId,
    pub output: ResponseStream<serde_json::Value>,
}

pub struct ClientStreamHandle {
    pub request_id: RequestId,
    pub input: RequestStreamSender<serde_json::Value>,
    pub completion: BoxFuture<'static, Result<OperationResultBody, OperationError>>,
}

pub struct BidiStreamHandle {
    pub request_id: RequestId,
    pub input: RequestStreamSender<serde_json::Value>,
    pub output: ResponseStream<serde_json::Value>,
}

impl Dispatcher {
    pub fn new(
        registry: std::sync::Arc<OperationRegistry>,
        verifier: std::sync::Arc<dyn AccessTokenVerifier>,
        idempotency: std::sync::Arc<dyn IdempotencyStore>,
        results: std::sync::Arc<dyn ResultStore>,
        revocation: std::sync::Arc<dyn RevocationChecker>,
        clock: ClockFn,
        limits: DispatchLimits,
    ) -> Self;

    /// Always returns a body containing request_id and either result or error.
    pub fn execute_with_credential(
        &self,
        interface: InterfaceId,
        audience: Audience,
        credential: &str,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, OperationResultBody>;

    /// Always returns a body containing request_id and either result or error.
    pub fn execute_verified(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, OperationResultBody>;

    /// Always returns a body containing request_id and either result or error.
    pub fn execute_anonymous(
        &self,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
        peer: PeerInfo,
    ) -> BoxFuture<'_, OperationResultBody>;

    pub fn execute_server_stream_verified(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, Result<ServerStreamHandle, OperationResultBody>>;

    pub fn execute_server_stream_anonymous(
        &self,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
        peer: PeerInfo,
    ) -> BoxFuture<'_, Result<ServerStreamHandle, OperationResultBody>>;

    pub fn execute_client_stream_verified(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, Result<ClientStreamHandle, OperationResultBody>>;

    pub fn execute_client_stream_anonymous(
        &self,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
        peer: PeerInfo,
    ) -> BoxFuture<'_, Result<ClientStreamHandle, OperationResultBody>>;

    pub fn execute_bidi_verified(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
    ) -> BoxFuture<'_, Result<BidiStreamHandle, OperationResultBody>>;

    pub fn execute_bidi_anonymous(
        &self,
        interface: InterfaceId,
        audience: Audience,
        operation: OperationId,
        wire: WireContext,
        request: serde_json::Value,
        peer: PeerInfo,
    ) -> BoxFuture<'_, Result<BidiStreamHandle, OperationResultBody>>;

    /// Authorized result lookup. The caller must be the recorded subject or an
    /// authorized operator in the recorded tenant.
    pub fn get_result(
        &self,
        identity: std::sync::Arc<VerifiedIdentity>,
        request_id: RequestId,
    ) -> BoxFuture<'_, Result<Option<OperationResultBody>, OperationError>>;
}
```

`execute_verified` MUST reject an identity whose binding does not match
`interface`, `audience`, or `expires_at`, and MUST consult the configured
`RevocationChecker` (Part III.2 §3.4). `execute_anonymous` MUST reject an
operation whose `AUTH` is `Required`.

The stream methods are the only public route from an adapter to an operation
stream. The typed operation's stream is converted to the erased
`serde_json::Value` handle by `operation-contract`; the adapter never calls a
handler directly.

### 5.7 Pipeline

The dispatcher and the operation share this fixed partial order:

```text
1. decode and size check                     dispatcher
2. authenticate (or establish anonymity)     dispatcher
3. authentication requirement check          dispatcher
4. scope check                               dispatcher
5. deadline and admission                    dispatcher
6. generated input validation                 dispatcher/operation
7. idempotency claim                          dispatcher
8a. replay branch: replay_authorize the
    recorded target; return stored result     operation
8b. acquired branch: prepare (schema/domain
    validation, resource load, tenant/
    ownership authorization)                  operation
9. execute: reservation, mutation,
   commit, outbox enqueue                     operation
10. result store / reply                      dispatcher
```

No business side effect may occur before authorization succeeds.

- **Validation (6):** runs for both replay and new requests, before the claim.
  It is stateless input validation; state-dependent preconditions, resource
  loading, and ownership authorization stay in `prepare`.
- **Replay branch (8a):** the dispatcher returns the stored result after
  `replay_authorize` confirms the current caller may access the recorded
  target. `prepare` is not run; delete, create, and approve operations must not
  fail their own retry because their first success changed the state.
- **Acquired branch (8b):** `prepare` validates and authorizes before
  `execute`. No side effect occurs before it succeeds.

For create operations with no existing resource, `prepare` authorizes against
the tenant or a declared global target:

```rust
pub enum AuthorizationTarget {
    Resource(std::sync::Arc<dyn ResourceRef>),
    Tenant(TenantId),
    Global,
}

#[derive(Clone)]
pub struct AuthorizationTargetSnapshot {
    pub action: Action,
    pub resource_id: Option<ResourceId>,
    pub tenant: Option<TenantId>,
    pub owner: Option<SubjectId>,
}

#[derive(Clone)]
pub struct ReplayRecord {
    pub request_id: RequestId,
    pub operation: OperationId,
    pub request_hash: [u8; 32],
    pub target: AuthorizationTargetSnapshot,
    pub result: OperationResultBody,
}
```

### 5.8 Errors

```rust
pub struct OperationError {
    pub code: ErrorCode,
    pub domain: ErrorDomain,
    pub retryable: bool,
    pub details: Option<serde_json::Value>,
    pub source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

#[derive(Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OperationErrorBody {
    pub code: ErrorCode,
    pub domain: ErrorDomain,
    pub retryable: bool,
    pub details: Option<serde_json::Value>,
}

impl OperationError {
    pub fn unsupported(message: &'static str) -> Self;
    pub fn category(&self) -> ErrorCategory;
    pub fn to_body(&self) -> OperationErrorBody;
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum ErrorCategory {
    InvalidInput,
    InvalidConfig,
    Unauthenticated,
    PermissionDenied,
    NotFound,
    AlreadyExists,
    InvalidState,
    Conflict,
    ResourceExhausted,
    Unsupported,
    Timeout,
    Cancelled,
    Unavailable,
    Internal,
}

pub struct ContractError(pub &'static str);

pub struct PublishError {
    pub retryable: bool,
    pub message: String,
}

pub type ClockFn = std::sync::Arc<dyn Fn() -> std::time::SystemTime + Send + Sync>;

#[derive(Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OperationResultBody {
    pub request_id: RequestId,
    pub result: Option<serde_json::Value>,
    pub error: Option<OperationErrorBody>,
}

impl OperationResultBody {
    pub fn success(request_id: RequestId, result: serde_json::Value) -> Self;
    pub fn failure(request_id: RequestId, error: OperationErrorBody) -> Self;
}

pub struct OperationResultRecord {
    pub result: OperationResultBody,
    pub subject: Option<SubjectId>,
    pub tenant: Option<TenantId>,
    pub operation: OperationId,
}

pub trait ResultStore: Send + Sync {
    fn get(&self, request_id: RequestId)
        -> Result<Option<OperationResultRecord>, OperationError>;
    fn put(&self, record: OperationResultRecord) -> Result<(), OperationError>;
}

pub enum RevocationFailMode {
    FailClosed,
    AllowWithinStaleness,
}

pub struct RevocationPolicy {
    pub max_staleness: std::time::Duration,
    pub on_unavailable: RevocationFailMode,
}

pub trait RevocationChecker: Send + Sync {
    fn check(&self, identity: &VerifiedIdentity) -> Result<(), AuthenticationError>;
}
```

The protocol category table is fixed; adapters use `OperationErrorBody`, never
the internal `source`.

---

## 6. Idempotency

Idempotency is namespaced by authenticated subject, tenant, and operation. A key
alone is not a global namespace. Every claim carries an ownership handle and a
fencing generation so that an expired worker cannot commit after a new owner has
acquired the work.

```rust
pub struct IdempotencyNamespace {
    pub subject: Option<SubjectId>,
    pub tenant: Option<TenantId>,
    pub operation: OperationId,
}

pub enum IdempotencyMode {
    None,
    SameTransaction,
    External,
}

pub enum IdempotencyState {
    InFlight,
    Completed,
    Failed,
}

pub struct IdempotencyRecord {
    pub namespace: IdempotencyNamespace,
    pub key: IdempotencyKey,
    pub request_hash: [u8; 32],
    pub state: IdempotencyState,
    pub result: Option<OperationResultBody>,
    pub target: AuthorizationTargetSnapshot,
    pub owner: Option<SubjectId>,
    pub generation: u64,
    pub fencing_token: u64,
    pub lease_until: std::time::SystemTime,
}

#[derive(Clone)]
pub struct ClaimToken {
    pub namespace: IdempotencyNamespace,
    pub key: IdempotencyKey,
    pub generation: u64,
    pub fencing_token: u64,
}

pub enum ClaimOutcome {
    Acquired(ClaimToken),
    InFlight,
    Replay(ReplayRecord),
    Conflict,
}

pub trait IdempotencyStore: Send + Sync {
    fn claim(
        &self,
        namespace: &IdempotencyNamespace,
        key: &IdempotencyKey,
        request_hash: [u8; 32],
        target: AuthorizationTargetSnapshot,
        lease: std::time::Duration,
    ) -> BoxFuture<'_, Result<ClaimOutcome, OperationError>>;

    fn renew(
        &self,
        token: &ClaimToken,
        lease: std::time::Duration,
    ) -> BoxFuture<'_, Result<(), OperationError>>;

    fn complete(
        &self,
        token: &ClaimToken,
        result: &OperationResultBody,
    ) -> BoxFuture<'_, Result<(), OperationError>>;

    fn fail(
        &self,
        token: &ClaimToken,
        error: &OperationErrorBody,
    ) -> BoxFuture<'_, Result<(), OperationError>>;

    fn recover_expired(
        &self,
        now: std::time::SystemTime,
    ) -> BoxFuture<'_, Result<usize, OperationError>>;
}

pub struct ExecutionScope {
    claim: Option<ClaimToken>,
    store: Option<std::sync::Arc<dyn IdempotencyStore>>,
    completed: std::sync::atomic::AtomicBool,
}

impl ExecutionScope {
    pub fn complete(&self, result: &OperationResultBody) -> Result<(), OperationError>;
    pub fn complete_response<T: serde::Serialize>(
        &self,
        request_id: RequestId,
        response: &T,
    ) -> Result<(), OperationError>;
    pub fn fail(&self, error: &OperationErrorBody) -> Result<(), OperationError>;
    pub fn is_completed(&self) -> bool;
}
```

Rules:

- `claim` is atomic. Concurrent claims for the same namespace and key produce
  exactly one `Acquired`; the others receive `InFlight`, `Replay`, or
  `Conflict`.
- `ClaimToken` is the ownership proof. `complete`, `fail`, and `renew` MUST
  reject a stale generation or fencing token. An expired worker that resumes
  after a new owner acquired the work MUST NOT commit a side effect or a
  result.
- `SameTransaction` mode: the dispatcher gives the handler an
  `ExecutionScope` backed by the transaction-bound store. The handler MUST call
  `scope.complete` or `scope.fail` before `uow.commit`. The dispatcher verifies
  `scope.is_completed()`; a handler that commits without completing is a
  protocol violation.
- `External` mode: the dispatcher completes after `execute` and renews the
  lease while the operation is running. A crash after business commit but
  before result storage is recovered by `recover_expired` and the operation's
  declared recovery policy.
- Replay MUST call `Operation::replay_authorize` against the recorded
  `AuthorizationTargetSnapshot`. It MUST NOT re-run `prepare`; delete,
  create, and approve operations would otherwise reject a legitimate retry
  after their own first success.
- External side effects MUST carry the fencing token or provide an equivalent
  deduplication/reconciliation mechanism.
- The request hash uses canonical JSON (RFC 8785 JCS or a declared
  project-equivalent canonicalizer).

---

## 7. Transaction, Outbox, and Events

```rust
pub struct DomainEvent {
    pub event_id: uuid::Uuid,
    pub request_id: RequestId,
    pub occurred_at: chrono::DateTime<chrono::Utc>,
    pub aggregate_id: ResourceId,
    pub revision: u64,
    pub payload: serde_json::Value,
}

pub trait Outbox: Send + Sync {
    fn enqueue(&self, event: DomainEvent) -> Result<(), DomainError>;
}

pub trait UnitOfWork: Send + Sync {
    fn outbox(&self) -> &dyn Outbox;
    fn idempotency(&self) -> Option<&dyn IdempotencyStore>;
    fn commit(self: Box<Self>) -> BoxFuture<'static, Result<(), DomainError>>;
    fn rollback(self: Box<Self>) -> BoxFuture<'static, Result<(), DomainError>>;
}

pub trait UnitOfWorkFactory: Send + Sync {
    fn begin(&self) -> BoxFuture<'_, Result<Box<dyn UnitOfWork>, DomainError>>;
}

pub trait EventRelay: Send + Sync {
    fn publish(&self, event: &DomainEvent) -> BoxFuture<'_, Result<(), PublishError>>;
}

pub enum ExternalEffectRecovery {
    Compensate,
    ForwardRecover,
    IsolateAndRepair,
}
```

Rules:

- Repositories MUST be obtained from the `UnitOfWork`, so they share the same
  transaction. The project defines its concrete repository surface; the shared
  contract fixes that the unit of work owns repositories, outbox, and optional
  idempotency.
- Outbox intent is written in the same transaction as the business mutation.
- Publication happens after commit. The relay retries, deduplicates by
  `event_id`, and records terminal failures.
- Irreversible external effects use `ForwardRecover` or `IsolateAndRepair`;
  forced compensation is not required for effects that cannot be undone.
- A crash after commit but before publication leaves the outbox record for the
  relay; no event is lost.

---

## 8. Wire Envelope and Protocol Bindings

The **semantic envelope** is shared. Its protocol representation is binding-
specific; it is not required to be JSON bytes on every wire.

```rust
pub struct WireContext {
    pub request_id: Option<RequestId>,
    pub deadline_unix_ns: Option<i64>,
    pub idempotency_key: Option<IdempotencyKey>,
    pub trace_id: Option<TraceId>,
}

impl WireContext {
    /// Merge body context and header context. A field present in both with
    /// different values is a conflict, not an override.
    pub fn merge(self, other: WireContext) -> Result<Self, ContractError>;
}

pub struct SemanticRequest {
    pub context: WireContext,
    pub request: serde_json::Value,
}

pub struct SemanticReply {
    pub request_id: RequestId,
    pub outcome: SemanticOutcome,
}

pub enum SemanticOutcome {
    Result(serde_json::Value),
    Error(OperationErrorBody),
}

impl SemanticReply {
    pub fn from_result(result: OperationResultBody) -> Self;
}
```

### 8.1 Protobuf context

The gRPC binding uses typed messages, but the semantic context fields and their
field numbers are fixed:

```proto
message Context {
  optional string request_id = 1;
  optional int64 deadline_unix_ns = 2;
  optional string idempotency_key = 3;
  optional string trace_id = 4;
}
```

### 8.1 Bindings

| Interface | Request binding | Reply binding |
|---|---|---|
| REST | JSON `{context?, request}` | JSON `{request_id, result}` or `{request_id, error}` |
| WebSocket | `{type:"request", request_id, operation_id, payload, context?}` | `{type:"response", request_id, result|error}` |
| CLI | typed arguments converted to the operation request | JSON/JSONL with `request_id` |
| gRPC | typed message with `Context` and typed request fields | typed message with `request_id` and `oneof result/error` |
| MCP | tool input plus context | tool result plus `request_id` |
| A2A | task/message mapped to the operation request | task artifact plus `request_id` |

Every binding returns the `request_id` in a place the client can read. REST
aliases use the same semantic envelope; an alias is path/method sugar, not a
different wire shape.

The protobuf schema may use typed messages. It MUST carry the semantic
`Context` fields and the `request_id` on the reply. The universal "JSON bytes in
protobuf" rule from the previous version is withdrawn.

---

## 9. Interface Contract

```rust
pub const INTERFACE_REST: InterfaceId = InterfaceId::new("rest");
pub const INTERFACE_WEBSOCKET: InterfaceId = InterfaceId::new("websocket");
pub const INTERFACE_CLI: InterfaceId = InterfaceId::new("cli");
pub const INTERFACE_GRPC: InterfaceId = InterfaceId::new("grpc");
pub const INTERFACE_MCP: InterfaceId = InterfaceId::new("mcp");
pub const INTERFACE_A2A: InterfaceId = InterfaceId::new("a2a");

pub trait InterfaceDriver: Send + Sync {
    fn id(&self) -> InterfaceId;
    fn audience(&self) -> Audience;
}

pub enum ProtocolError {
    Unauthenticated,
    Forbidden,
    Malformed(String),
    Transport(String),
    Protocol(String),
    Internal(String),
}
```

Adapters authorize **protocol-owned resources** (WebSocket subscriptions, A2A
tasks, MCP sessions) and MUST NOT authorize business resources; business
authorization belongs to the operation. This distinction is explicit.

---

## 10. Conformance Harness

```rust
pub struct Case {
    pub name: &'static str,
    pub operation: OperationId,
    pub authentication: AuthCase,
    pub principal: Option<TestPrincipal>,
    pub wire: WireContext,
    pub request: serde_json::Value,
    pub stream: Option<StreamScript>,
    pub fixture: FixtureId,
    pub expected: Expected,
    pub expected_state: Option<StateExpectation>,
    pub expected_error_code: Option<ErrorCode>,
}

pub enum AuthCase {
    Valid,
    Missing,
    Malformed,
    WrongAudience,
    Expired,
    Revoked,
    WrongTokenType,
    NoScope,
}

pub struct TestPrincipal {
    pub subject: SubjectId,
    pub tenant: Option<TenantId>,
    pub scopes: ScopeSet,
    pub audience: Audience,
    pub actor: Option<ActorId>,
    pub on_behalf_of: Option<SubjectId>,
}

pub enum Expected {
    Success(ValueMatcher),
    Error { category: ErrorCategory, retryable: bool },
}

pub enum ValueMatcher {
    Exact(serde_json::Value),
    Subset(serde_json::Value),
    Any,
    Regex(String),
}

pub enum StreamScript {
    Server { items: Vec<serde_json::Value>, cancel_after: Option<usize> },
    Client { items: Vec<serde_json::Value>, eof: bool, cancel_after: Option<usize> },
    Bidi { items: Vec<serde_json::Value>, cancel_after: Option<usize> },
}

pub struct InvocationOutcome {
    pub result: Option<serde_json::Value>,
    pub error: Option<OperationErrorBody>,
    pub state: Option<serde_json::Value>,
    pub events: Vec<DomainEvent>,
    pub stream: Vec<StreamEvent>,
}

pub trait ConformanceDriver: Send + Sync {
    fn id(&self) -> InterfaceId;
    fn invoke(&self, case: &Case) -> Result<InvocationOutcome, ProtocolError>;
}

pub fn run_matrix(
    drivers: &[Box<dyn ConformanceDriver>],
    cases: &[Case],
) -> ConformanceReport;
```

`FixtureId` identifies a deterministic fixture with setup and reset. `Case`
includes state expectations, authentication-material expectations, and stream
scripts. The harness compares `OperationErrorBody.code` as well as category and
retryability.

The harness has an **independent oracle**: expected results are derived from the
operation specification, not from one interface's output. A cross-interface
match alone is insufficient.

Out-of-process drivers are required for TLS termination, real WebSocket
upgrade, CLI process/signal/file-permission boundaries, and any protocol
behavior that cannot be exercised in-process.

The compile-fail test is supplemented by a public-API audit: the trusted
constructor is not reachable from adapter crates, and the allowed call sites are
listed.

---

## 11. Rule Registry

Every rule ID is defined exactly once in Part III.15. Part II contains the
top-level rules and the common interface rules; Part III.6–III.12 contain the
detailed interface and conformance rules with their canonical IDs. Duplicate ID
assignments are forbidden.

The registry records, for each rule:

- ID, class (C/G/O/P), profile, statement, parent rule, and verification.

Part II's rule tables may omit the class column because the registry is the
authoritative source.

---

## 12. Versioning

A single `spec_version` covers the rules, these contracts, the generator, and
the conformance kit. Protocol SDK versions are recorded separately.

| Change | Version |
|---|---|
| New operation, scope, error code, auth method, interface constant | Minor |
| New default method on an extension trait | Minor |
| New required field in a context, case, or envelope | Major |
| Changed token validation order or required claims | Major |
| Changed error category table | Major |
| Removed or renamed a type, field, or trait method | Major |

A project pins `spec_version` in `RULES-PROFILE.toml`. The generator and the
conformance kit must report the same version; a mismatch fails startup.

---

## 13. What This Document Deliberately Does Not Define

- The set of operations, scopes, error codes, or domains.
- The storage engine, schema, or query strategy.
- The domain model or business invariants.
- The choice of cryptography library, HTTP server, or protocol SDK.
- The deployment topology.
- The UI.

Projects fill these in. The contracts above are the seams through which they
plug in.

---

# PART III.3 — Core Crate

# 20 — Core Crate

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`

---

## 1. Purpose

`*-core` owns the domain model, invariants, value objects, state machines, and
the **ports** through which the domain reaches the outside world. It knows
nothing about HTTP, WebSocket, gRPC, MCP, A2A, CLI, JWT, SSO, or databases.

---

## 2. Dependencies

```toml
[dependencies]
serde = { workspace = true, features = ["derive"] }
thiserror = { workspace = true }
uuid = { workspace = true, features = ["v7", "serde"] }
chrono = { workspace = true }
secrecy = { workspace = true }
# no axum, tonic, rmcp, a2a-*, clap, jsonwebtoken, oauth2
```

`*-core` MAY depend on pure utility crates (time, UUID, decimal). It MUST NOT
depend on a transport SDK, an authentication implementation, or a persistence
driver. Persistence ports are traits; the driver lives in an adapter crate.

---

## 3. Layout

```text
*-core/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   ├── mod.rs          # public re-exports
    │   └── errors.rs       # public error surface
    ├── model/
    │   ├── mod.rs
    │   ├── <aggregate>.rs  # domain entities and value objects
    │   └── ids.rs          # typed IDs
    ├── state/
    │   ├── mod.rs
    │   └── <aggregate>_state.rs
    ├── ports/
    │   ├── mod.rs
    │   ├── clock.rs
    │   ├── id_generator.rs
    │   ├── repository.rs
    │   ├── unit_of_work.rs
    │   ├── event_publisher.rs
    │   └── secret_store.rs
    ├── error/
    │   ├── mod.rs
    │   └── domain_error.rs
    ├── config/
    │   └── mod.rs          # domain configuration values
    └── tests/
        └── mod.rs          # test material only; no production behavior
```

The public module layout is fixed. Hand-written files inside `model/`,
`state/`, and `ports/` may be organized differently as long as the public
re-exports and generated boundaries are preserved. The project chooses its own
resource identifier encoding; UUID is not mandatory.

---

## 4. Public API

`src/api/mod.rs` re-exports only what other crates may use:

```rust
pub use crate::model::*;
pub use crate::state::*;
pub use crate::error::DomainError;
pub use crate::ports::*;
```

`model`, `state`, and `ports` modules SHOULD be `pub` only through `api`.
Internal helpers stay private.

---

## 5. Domain Model Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CORE-01 | Every aggregate with a lifecycle has one root type and one state enum. Value objects and stateless aggregates are exempt. | Root and state are explicit when a lifecycle exists. | Fields, variants, and behavior. | V1 types; V4 review. |
| CORE-02 | Illegal states are unrepresentable. A state transition returns `Result<NextState, DomainError>`. | Transition returns a result. | Transition table. | V1; V3 transition tests. |
| CORE-03 | Value objects validate on construction. | Constructors return `Result`. | Validation rules. | V3 test. |
| CORE-04 | IDs are typed newtypes; a raw `u64` or `Uuid` is not used as an entity ID across boundaries. | Newtype per aggregate. | Underlying representation. | V1. |
| CORE-05 | Time is injected through `Clock`; `Utc::now()` is forbidden in core. | Port use. | Clock implementation. | V2 scan; V3 test. |
| CORE-06 | Randomness and ID allocation go through `IdGenerator`. | Port use. | Generator implementation. | V2 scan; V3 test. |
| CORE-07 | Domain errors are typed and carry a stable code. | `DomainError` shape. | Code set. | V1; V3 test. |
| CORE-08 | Core does not perform I/O. | No I/O imports. | — | V2 import scan. |
| CORE-09 | Core does not serialize wire envelopes or know protocol status codes. | No transport types. | Serde derives on domain values are allowed. | V2 scan. |
| CORE-10 | Domain events are values; publication happens outside core. | Event type shape. | Event set. | V1; V3 test. |

---

## 6. Ports

Ports are the only way core reaches infrastructure.

```rust
pub trait Clock: Send + Sync {
    fn now(&self) -> chrono::DateTime<chrono::Utc>;
}

pub trait IdGenerator<I>: Send + Sync {
    fn next_id(&self) -> I;
}

pub trait Repository<T, Id>: Send + Sync {
    fn find(&self, id: Id) -> impl std::future::Future<Output = Result<Option<T>, DomainError>> + Send;
    fn save(&self, value: &T) -> impl std::future::Future<Output = Result<(), DomainError>> + Send;
    fn delete(&self, id: Id) -> impl std::future::Future<Output = Result<(), DomainError>> + Send;
}

// Transaction, outbox, and event delivery types are defined once in Part III.2 §7.
// Core owns repository ports and domain event payloads. It does not define a
// second UnitOfWork, EventPublisher, or wire event shape.

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<secrecy::SecretString, DomainError>;
}
```

A port trait is an **open extension point**: a project may add a port, but it
must not add an infrastructure dependency to core. Infrastructure implements the
port in an adapter crate.

---

## 7. Domain Errors

```rust
#[derive(Debug, thiserror::Error)]
pub struct DomainError {
    pub code: DomainErrorCode,
    pub message: String,
    pub source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct DomainErrorCode(&'static str);
```

The operation layer maps `DomainError` to `OperationError`. The mapping table is
project-specific; the category mapping is fixed by `Part III.2` §5.8.

---

## 8. State Machines

Every aggregate with a lifecycle MUST define:

```rust
pub enum <Aggregate>State { /* variants */ }

pub enum <Aggregate>Event { /* triggers */ }

pub fn transition(
    state: &<Aggregate>State,
    event: &<Aggregate>Event,
) -> Result<<Aggregate>State, DomainError>;
```

A transition that is not listed in the table returns `DomainError` with the
project's `invalid_state` code. A missing transition is a defect, not a runtime
fallback.

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Directory layout in §3. | Domain aggregates, fields, and methods. |
| Port trait names and shapes. | Port implementations and additional ports. |
| `DomainError` shape and code newtype. | Domain error codes. |
| State transition returns `Result`. | State and event sets. |
| No I/O, no transport, no auth implementation. | Pure utility crates and algorithms. |
| `Clock` and `IdGenerator` injection. | Clock and ID strategies. |

---

## 10. Conformance Obligations

`*-core` must pass:

1. Type-level tests for illegal-state rejection.
2. Transition tests for every listed transition and every rejected transition.
3. Port tests with deterministic fakes.
4. Import scan: no transport, JWT, SSO, HTTP, database driver, or file I/O.
5. `cargo test -p <project>-core` and `cargo clippy -p <project>-core -- -D warnings`.

The conformance report names `CORE-01` through `CORE-10`.

---

## 11. Generated and Hand-Written

| Generated | Hand-written |
|---|---|
| `lib.rs` module declarations from the catalog (optional). | Model types, invariants, transitions, ports. |
| None of the domain behavior. | All of the domain behavior. |

The core crate is almost entirely hand-written. The generator only ensures the
module skeleton exists and that the catalog references resolve.

---

# PART III.4 — Operation Crate

# 21 — Operation Crate

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

---

## 1. Purpose

`*-operation` is the only place where business operations are implemented. It
registers authenticated and anonymous operations, implements authorization and
transaction boundaries, and enqueues outbox events. The dispatcher itself is a
shared contract implementation, not a project crate, so that it can construct
authenticated contexts and enforce credential binding.

---

## 2. Dependencies

```toml
[dependencies]
<project>-core = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
thiserror = { workspace = true }
# no axum, tonic, rmcp, a2a-*, clap, jsonwebtoken, oauth2
```

---

## 3. Layout

```text
*-operation/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # public registry, authorizer, unit-of-work
    ├── registry/
    │   ├── mod.rs
    │   └── register_all.rs     # generated
    ├── authz/
    │   ├── mod.rs
    │   ├── authorizer.rs       # project policy
    │   └── actions.rs          # open Action set
    ├── handlers/
    │   ├── mod.rs
    │   └── <domain>/
    │       ├── mod.rs
    │       └── <operation>.rs  # create-once skeleton + hand-written body
    ├── anonymous/
    │   ├── mod.rs
    │   └── auth_token_issue.rs # auth.token.issue
    ├── error/
    │   ├── mod.rs
    │   └── mapping.rs          # DomainError -> OperationError
    ├── uow/
    │   ├── mod.rs
    │   └── factory.rs          # UnitOfWorkFactory
    └── tests/
```

---

## 4. Dispatcher and Contexts

The dispatcher is provided by `operation-contract`. The project constructs it
with:

- `OperationRegistry` (authenticated and anonymous entries)
- `AccessTokenVerifier`
- `IdempotencyStore`
- `ResultStore`
- `RevocationChecker`
- `ClockFn`
- `DispatchLimits`

The dispatcher, not the project, constructs `AuthenticatedContext` and
`AnonymousContext`. It checks the credential binding, authentication
requirement, scope, deadline, revocation, generated input validation, and
idempotency. It also exposes the unary and streaming entry points; adapters
never call a handler directly.

```rust
let dispatcher = Dispatcher::new(
    Arc::new(registry),
    Arc::new(jwt_verifier),
    Arc::new(idempotency_store),
    Arc::new(result_store),
    Arc::new(revocation_checker),
    clock_fn,
    DispatchLimits { /* ... */ },
);
```

`execute_verified` rejects a `VerifiedIdentity` whose binding does not match the
requested interface, audience, or expiry. A project cannot bypass this check by
constructing a context.

---

## 5. Handler Protocol

Every authenticated handler implements `Operation` with `prepare` and
`execute`. The split is fixed:

```rust
pub struct AddAccount;

impl Operation for AddAccount {
    type Request = AddAccountRequest;
    type Response = AddAccountResponse;
    type Prepared = PreparedAddAccount;

    const ID: OperationId = OperationId::new("account.add");
    const SCOPE: Scope = Scope::new("control");
    const MODE: OperationMode = OperationMode::Unary;

    fn prepare(
        &self,
        ctx: &AuthenticatedContext,
        request: Self::Request,
    ) -> BoxFuture<'_, Result<Self::Prepared, OperationError>> {
        Box::pin(async move {
            // schema/domain validation, tenant resolution, authorization
            self.authorizer.require(
                ctx.identity(),
                Action::new("account.add"),
                &AuthorizationTarget::Tenant(ctx.tenant().ok_or_else(|| {
                    OperationError::invalid_input("tenant is required")
                })?),
            )?;
            Ok(PreparedAddAccount { request })
        })
    }

    fn execute(
        &self,
        ctx: AuthenticatedContext,
        prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>> {
        Box::pin(async move {
            let mut uow = self.uow.begin().await?;
            // mutation through repositories obtained from uow
            let response = AddAccountResponse { /* ... */ };

            // SameTransaction idempotency: the response is serialized and
            // completed inside the business transaction.
            ctx.execution().complete_response(
                ctx.invocation().request_id(),
                &response,
            )?;

            uow.outbox().enqueue(event)?;
            uow.commit().await?;
            Ok(response)
        })
    }
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-01 | Exactly one handler per operation ID. | One registration. | Handler body. | V3 registry test. |
| OP-02 | `prepare` performs validation and authorization; it has no business side effect. | Split. | Validation and policy. | V3 failure-injection test. |
| OP-03 | `execute` performs reservation, mutation, commit, and outbox enqueue. | Order. | Transaction strategy. | V3 event-order test. |
| OP-04 | Repositories are obtained from the unit of work. | UoW ownership. | Concrete repository surface. | V2 scan; V3 test. |
| OP-05 | The handler never constructs `AuthenticatedContext` or `VerifiedIdentity`. | Opaque types. | — | V1; V3 compile-fail. |
| OP-06 | The handler does not branch on `InterfaceId`. | Forbidden. | — | V2 scan; V4 review. |
| OP-07 | A handler that cannot complete uses the declared recovery policy. | Recovery declared. | Compensate / forward / isolate. | V3 failure-injection test. |
| OP-08 | Generated skeletons carry a create-once marker and are not overwritten. | Marker. | Handler body. | V2 check. |

---

### 5.1 Input Validation

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-VAL-01 | Every request type implements the generated `ContractValidate` and is validated before the idempotency claim. Replay uses `replay_authorize` and does not call `prepare`. | Order. | Macro expansion. | V3 test. |
| OP-VAL-02 | Handlers MUST NOT duplicate standard input validation that the macro already generates. | Single source. | Custom rule functions. | V2 scan; V4 review. |
| OP-VAL-03 | Validation failures map to `invalid_input` with field, code, and English message. | Mapping. | Message text. | V3 test. |

---

## 6. Anonymous Operations

`auth.token.issue` is an `AnonymousOperation`. It has no `VerifiedIdentity` and
no implicit anonymous principal. It receives an `AnonymousContext` with a
request ID, interface, audience, and peer info.

```rust
pub struct TokenIssue;

impl AnonymousOperation for TokenIssue {
    type Request = TokenIssueRequest;
    type Response = TokenIssueResponse;
    type Prepared = PreparedTokenIssue;
    const ID: OperationId = OperationId::new("auth.token.issue");

    fn prepare(
        &self,
        _ctx: &AnonymousContext,
        request: Self::Request,
    ) -> BoxFuture<'_, Result<Self::Prepared, OperationError>> {
        Box::pin(async move {
            validate_token_issue(&request)?;
            Ok(PreparedTokenIssue { request })
        })
    }

    fn execute(
        &self,
        _ctx: AnonymousContext,
        prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>> {
        Box::pin(async move {
            self.login_service
                .login(prepared.request)
                .await
                .map_err(OperationError::from)
        })
    }
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-09 | Anonymous operations are registered separately. | Registry variant. | Operation set. | V3 test. |
| OP-10 | No anonymous operation receives a `VerifiedIdentity`. | Type. | — | V1. |
| OP-11 | Anonymous operations do not bypass rate limits or validation. | Both required. | Limits and rules. | V3 test. |
| OP-12 | Idempotency for anonymous operations is opt-in and keyed by peer plus operation. | Namespace rule. | Policy. | V3 test. |

---

## 7. Authorization

```rust
pub trait Authorizer: Send + Sync {
    fn require(
        &self,
        identity: &VerifiedIdentity,
        action: Action,
        target: &AuthorizationTarget,
    ) -> Result<(), AuthorizationError>;
}
```

`AuthorizationTarget` is `Resource`, `Tenant`, or `Global`. `prepare` loads the
resource and passes it to the authorizer. For create operations, the target is
the tenant or global; there is no fabricated resource.

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-AUTH-01 | Scope is checked by the dispatcher; ownership/tenant by the authorizer. | Both. | Policy. | V3 test. |
| OP-AUTH-02 | The authorizer uses the loaded resource, never request IDs alone. | Resource target. | Policy. | V3 cross-tenant test. |
| OP-AUTH-03 | Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`. | Categories. | Detail. | V3 test. |
| OP-AUTH-04 | Replay is authorized through `replay_authorize` against the recorded target, not through full `prepare`. | Replay path. | — | V3 test. |
| OP-AUTH-05 | The same identity and resource produce the same result through every interface. | Invariant. | — | V3 conformance. |

---

## 8. Idempotency

The catalog declares one of:

- `none` — no idempotency;
- `same-transaction` — the idempotency record is part of the business unit of
  work;
- `external` — a leased external store with recovery.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-IDEM-01 | The namespace includes subject, tenant, and operation. | Namespace. | — | V3 test. |
| OP-IDEM-02 | `claim` is atomic; concurrent claims produce one `Acquired`. | Atomicity. | Store implementation. | V3 concurrency test. |
| OP-IDEM-03 | `same-transaction` stores the result in the business commit. | Transaction membership. | — | V3 crash test. |
| OP-IDEM-04 | `external` uses a lease and `recover_expired`. | Lease and recovery. | Lease duration. | V3 crash test. |
| OP-IDEM-05 | A replay calls `replay_authorize` against the recorded target and never re-runs `prepare`. | Replay path. | — | V3 test. |
| OP-IDEM-06 | Same key + different canonical request returns `conflict`. | Conflict rule. | Canonicalizer. | V3 test. |
| OP-IDEM-07 | Failed results are stored and replayed according to policy. | Policy declared. | Retry policy. | V3 test. |
| OP-IDEM-08 | A claim carries a generation and fencing token; `complete`, `fail`, and `renew` reject a stale owner. | Ownership proof. | Store implementation. | V3 test. |
| OP-IDEM-09 | `same-transaction` requires `ExecutionScope::complete` before `uow.commit`; the dispatcher verifies completion. | Atomic boundary. | — | V3 crash test. |
| OP-IDEM-10 | External side effects carry the fencing token or an equivalent deduplication/reconciliation key. | Dedup/reconcile. | Mechanism. | V3 test. |

---

## 9. Transactions, Outbox, and Recovery

```rust
pub trait ProjectUnitOfWork: UnitOfWork {
    fn accounts(&self) -> &dyn AccountRepository;
    fn calls(&self) -> &dyn CallRepository;
    // project-specific repository accessors
}

pub trait UnitOfWorkFactory: Send + Sync {
    fn begin(&self) -> BoxFuture<'_, Result<Box<dyn ProjectUnitOfWork>, DomainError>>;
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-TX-01 | Repositories come from the unit of work. | Ownership. | Concrete surface. | V2 scan; V3 test. |
| OP-TX-02 | Outbox intent is written in the same commit as the business mutation. | Atomic boundary. | Outbox implementation. | V3 crash test. |
| OP-TX-03 | Publication happens after commit by a relay. | Order. | Relay implementation. | V3 test. |
| OP-TX-04 | The relay retries and deduplicates by `event_id`. | Retry and dedup. | Backoff. | V3 test. |
| OP-TX-05 | Irreversible effects use forward recovery or isolation, not forced compensation. | Recovery declared. | Per-operation choice. | V3 failure-injection test. |
| OP-TX-06 | No unrelated external API wait occurs inside a database transaction. Database communication required by the transaction is allowed. External effects run outside the transaction or through outbox/forward recovery. | External-wait ban. | Transaction time budget. | V2 architecture scan; V3 test. |

The catalog records `recovery = compensate | forward | isolate` for every
operation that has external effects.

---

## 10. Events

`DomainEvent` carries `event_id`, `request_id`, `aggregate_id`, `revision`,
`occurred_at`, and payload. The handler enqueues it through the unit of work;
the relay publishes it after commit. A publication failure is retried; it never
rolls back a committed business change.

---

## 11. Errors

`error/mapping.rs` maps `DomainError` to `OperationError`. Every
`DomainErrorCode` has a mapping; an unknown code is a defect and fails the
build. Adapters receive `OperationErrorBody`; the internal `source` is never
serialized.

---

## 12. Registry

`register_all.rs` is generated from the catalog. It registers authenticated and
anonymous operations. Duplicate IDs are rejected at startup. A catalog entry
with no registration fails startup.

---

## 13. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, handler split, dispatcher ownership, pipeline order. | Operations, policies, transaction strategy. |
| Anonymous operation type and login operation ID. | Credential methods. |
| Idempotency namespace and claim semantics. | Idempotency store implementation. |
| UoW ownership of repositories and outbox. | Concrete repositories and outbox backend. |
| Recovery policy declaration. | Compensation / forward / repair implementation. |
| Error mapping coverage. | Error codes and messages. |
| Registry equality with the catalog. | Catalog contents. |

---

## 14. Conformance Obligations

1. Every catalog operation is registered exactly once.
2. Every authenticated operation has `prepare` that authorizes before mutation.
3. Every anonymous operation executes without a `VerifiedIdentity`.
4. Replay re-authorizes.
5. Concurrent idempotent claims produce one execution.
6. A crash after commit is recovered by the outbox/idempotency policy.
7. Irreversible effects follow the declared recovery policy.
8. No `InterfaceId` branching in operation code.
9. `cargo test -p <project>-operation` and `cargo clippy -p
   <project>-operation -- -D warnings`.
10. The conformance report names `OP-01` through `OP-12`, `OP-AUTH-01` through
    `OP-AUTH-05`, `OP-IDEM-01` through `OP-IDEM-10`, and `OP-TX-01` through
    `OP-TX-06`.

---

# PART III.5 — Identity Crates

# 22 — Identity Crates

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

---

## 1. Purpose

The identity crates own authentication. They answer: who is the subject, what
was verified, where, and until when? They do not own business authorization and
do not own interface credential extraction.

---

## 2. Crates

| Crate | Role | May depend on |
|---|---|---|
| `identity-core` | Identity types, `VerifiedIdentity`, `CredentialBinding`, auth traits, JWT and ticket implementations behind features. | Pure utility crates only. |
| `identity-jwt` | Facade re-exporting `identity_core::jwt`. | `identity-core`. |
| `identity-local` | Password and local credential verification. | `identity-core`. |
| `identity-operation` | Login orchestration, token issue operation, external identity resolution. | `identity-core`. |
| `identity-sso` | OIDC/SSO provider implementation. | `identity-core`. |

`identity-operation` MUST NOT depend on `identity-jwt`, `identity-local`, or
`identity-sso`. The assembly wires them.

The JWT verifier and session-ticket store live inside `identity-core` behind the
`jwt` and `ticket` features. `identity-jwt` is a facade. This makes
`VerifiedIdentity` constructible only inside `identity-core`.

---

## 3. Layout

```text
identity-core/src/
  identity/{subject,verified,scope,audience,binding}.rs
  auth/{verifier,issuer,credentials,key_store,error}.rs
  jwt/{mod,claims,verifier,issuer,keys}.rs        # feature = "jwt"
  ticket/{mod,store}.rs                           # feature = "ticket"

identity-local/src/{lib,password}.rs
identity-operation/src/{lib,login,token_issue,external_identity}.rs
identity-sso/src/{lib,oidc,state}.rs
```

---

## 4. Token Profile

| Item | Value |
|---|---|
| Format | JWS compact. JWE is not used. |
| `typ` | `at+jwt` for access tokens; `id+jwt` for internal ID tokens. |
| `alg` | `EdDSA` default; `ES256` allowed. `none` and HS* rejected except `local-only`. |
| `kid` | Required. |
| Required claims | `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, `ver`. |
| Optional claims | `scope`, `nbf`, `tenant`, `act`, `on_behalf_of`. |
| `sub` | Internal `SubjectId`. Never an email or provider ID. |
| `aud` | One interface or resource. |
| `ver` | User token version; compared after signature validation. |
| Access TTL | 900 seconds (configurable 300–3600). |
| Leeway | 30 seconds (configurable 0–60). |
| Key URLs | `jku`/`x5u` never followed. JWKS URL fixed by configuration. |

### 4.1 Validation order

```text
alg allowlist
  → signature
  → iss
  → aud
  → exp / nbf
  → typ
  → sub
  → tenant / delegation
  → ver (token version)
  → jti revocation
```

A failure at any stage returns `AuthenticationError`. The interface maps it to
401; details are logged, never returned.

### 4.2 Claims

```rust
pub struct AccessClaims {
    pub iss: String,
    pub sub: SubjectId,
    pub aud: Audience,
    pub exp: i64,
    pub iat: i64,
    pub nbf: Option<i64>,
    pub jti: String,
    pub ver: u64,
    pub tenant: Option<TenantId>,
    pub scope: Vec<Scope>,
    pub act: Option<SubjectId>,
    pub on_behalf_of: Option<SubjectId>,
}
```

`AccessClaims` is not part of the public deserialization surface; only the
verifier constructs it.

### 4.3 Delegation

`sub` is the delegated subject, `act` is the actor. Validation MUST ensure:

- the actor is authorized to act for the subject;
- delegated scopes are a subset of both the actor's and the subject's scopes;
- `on_behalf_of` is explicit and is not inferred from `sub`;
- the `VerifiedIdentity` preserves `actor` and `on_behalf_of` for audit.

---

## 5. Keys

```rust
pub trait KeyStore: Send + Sync {
    fn public_key(&self, kid: &str, alg: Algorithm) -> Result<PublicKey, AuthenticationError>;
    fn active_kids(&self) -> Vec<String>;
}

pub trait SigningKeyStore: Send + Sync {
    fn signing_key(&self, kid: &str) -> Result<SigningKey, AuthenticationError>;
}
```

- Multiple active public keys are required for rotation.
- Private keys never leave `identity-core`.
- Key material is validated at startup; invalid keys fail startup.
- JWKS refresh uses a fixed URL and a fixed policy.
- Fail-closed on unknown `kid`, unsupported algorithm, or key parse failure.

---

## 6. Login and Local Identity

```rust
pub struct LoginService {
    verifiers: std::collections::BTreeMap<AuthMethod, std::sync::Arc<dyn ErasedCredentialVerifier>>,
    issuer: std::sync::Arc<dyn TokenIssuer>,
}

impl LoginService {
    pub async fn login(
        &self,
        method: AuthMethod,
        credential: serde_json::Value,
        audience: Audience,
    ) -> Result<TokenIssueResponse, AuthenticationError>;
}
```

`auth.token.issue` is an `AnonymousOperation` in `identity-operation`. It is
registered by the project operation crate.

For local CLI execution, the identity is established without an HTTP token:

```rust
pub trait LocalIdentityIssuer: Send + Sync {
    fn establish(
        &self,
        user: &AuthenticatedUser,
        audience: Audience,
        ttl: std::time::Duration,
    ) -> Result<std::sync::Arc<VerifiedIdentity>, AuthenticationError>;
}
```

The `LocalCredentialVerifier` returns `AuthenticatedUser`; the
`LocalIdentityIssuer` converts it into a `VerifiedIdentity` with a CLI binding.
There is no implicit administrator principal.

---

## 7. Refresh Tokens and Sessions

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| IDN-07 | Refresh tokens are opaque random values, not JWTs. | Format. | Length and source. | V3 test. |
| IDN-08 | Only a hash is stored. | Hash storage. | Hash algorithm. | V3 DB test. |
| IDN-09 | Every use consumes and rotates the token atomically. | Atomic consume. | SQL/store. | V3 concurrency test. |
| IDN-10 | Reuse of a consumed token revokes the session family. | Family revocation. | Detection window. | V3 test. |
| IDN-11 | Sessions are independent of the login method. | `sessions` table. | Extra columns. | V2 schema check. |
| IDN-12 | `users.token_version` is included in claims as `ver` and checked. | Claim and check. | Storage. | V3 test. |
| IDN-13 | Consume and next-generation insert happen in one transaction; `(family_id, generation)` is unique. | Atomic boundary. | SQL/store. | V3 concurrency test. |
| IDN-14 | The loser of concurrent refresh receives `invalid_grant`; idempotent grace requires an encrypted replacement cache, not a hash-only record. | Loser policy. | Grace mechanism. | V3 test. |

### 7.1 Schema

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  tenant_id     UUID,
  status        TEXT NOT NULL,
  token_version BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL
);

CREATE TABLE credentials (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  password_hash TEXT NOT NULL,
  updated_at    TIMESTAMP NOT NULL
);

CREATE TABLE external_identities (
  user_id       UUID NOT NULL REFERENCES users(id),
  issuer        TEXT NOT NULL,
  subject       TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE TABLE sessions (
  id                   UUID PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES users(id),
  family_id            UUID NOT NULL,
  generation           BIGINT NOT NULL,
  refresh_token_hash   TEXT NOT NULL,
  replaced_by_session  UUID,
  consumed_at          TIMESTAMP,
  grace_until          TIMESTAMP,
  revoked_at           TIMESTAMP,
  expires_at           TIMESTAMP NOT NULL,
  created_at           TIMESTAMP NOT NULL,
  UNIQUE (family_id, generation)
);

CREATE TABLE revoked_tokens (
  jti        TEXT PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL
);
```

### 7.2 Atomic rotation

Consumption and next-generation creation are one transaction.

```sql
BEGIN;

UPDATE sessions
SET consumed_at = now(),
    grace_until = now() + :grace
WHERE id = :session_id
  AND refresh_token_hash = :presented_hash
  AND consumed_at IS NULL
  AND revoked_at IS NULL
  AND expires_at > now()
RETURNING id, user_id, family_id, generation;

-- Exactly one row is returned. If zero rows, roll back and follow the
-- reuse-or-invalid-grant path below.

INSERT INTO sessions (
  id, user_id, family_id, generation, refresh_token_hash, expires_at, created_at
) VALUES (
  :new_id, :user_id, :family_id, :generation + 1, :new_hash, :new_expiry, now()
);

UPDATE sessions
SET replaced_by_session = :new_id
WHERE id = :session_id;

COMMIT;
```

- The unique `(family_id, generation)` key prevents two next generations from
  being created for the same family.
- The loser of a concurrent refresh receives `invalid_grant` (recommended).
  If a project chooses idempotent grace instead, it MUST store the replacement
  token in an encrypted, short-lived cache; a hash alone cannot reproduce it.
  The project documents the threat model for that choice.
- A reuse after the grace window revokes the whole family.
- A token with `ver` below `users.token_version` is rejected even if the
  signature is valid.
- Family history rows are retained until the family expiry; revocation marks
  every non-consumed row in the family.

---

## 8. SSO

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| IDN-15 | SSO lives in `identity-sso`. | Crate boundary. | Provider set. | V2 dependency check. |
| IDN-16 | OIDC uses Authorization Code + PKCE S256. | Flow. | Provider config. | V3 test. |
| IDN-17 | `state` and `nonce` are per-request, session-bound, single-use. | Lifecycle. | Storage. | V3 test. |
| IDN-18 | Redirect URIs match exactly. | Validation. | Registered list. | V3 test. |
| IDN-19 | External `iss` is validated per provider. | Validation. | Provider map. | V3 test. |
| IDN-20 | External ID tokens are discarded after verification. | Forbidden forwarding. | — | V2 scan; V3 test. |
| IDN-21 | SSO output is `AuthenticatedUser`; `TokenIssuer` issues the internal token. | Flow. | Provider details. | V3 test. |
| IDN-22 | External accounts use `(issuer, subject)`. | Unique tuple. | — | V3 test. |
| IDN-23 | No automatic email-based linking. | Forbidden. | — | V3 test. |
| IDN-24 | Provider secrets come from configuration. | Config source. | — | V2 secret scan. |

---

## 9. Negative Authentication Tests

In addition to `alg=none`, disallowed algorithm, tampered signature, expired,
wrong `iss`, wrong `aud`, missing `sub`, wrong `typ`, unknown `kid`,
`jku`/`x5u`, missing header, and token in query, the suite MUST include:

- missing required claim (`jti`, `ver`, `iat`);
- future `nbf`;
- wrong claim type (for example `sub` as a number);
- `ver` below the user's token version;
- revoked `jti`;
- concurrent refresh with one winner;
- refresh reuse inside and outside the grace window;
- family revocation after reuse;
- delegation with an unauthorized actor;
- delegation with scopes exceeding the actor or subject;
- `on_behalf_of` inconsistent with `act`.

The negative suite is not a claim of complete authentication correctness; it is
the minimum rejection set.

---

## 10. Fixed and Open

| Fixed | Open |
|---|---|
| Crate boundaries and sealing. | Additional auth methods and SSO providers. |
| Binding fields: interface, audience, method, expiry, token version. | Claims beyond the required set. |
| Token format, validation order, TTL and leeway ranges. | Algorithm within the allowlist; key backend. |
| Audience separation and binding checks. | Audience values. |
| Login operation and single issuance path. | Credential methods. |
| Refresh atomic rotation and family revocation. | Grace window and store implementation. |
| Delegation validation. | Delegation policy details. |
| No secrets in logs, metrics, or errors. | Redaction implementation. |

---

## 11. Conformance Obligations

1. Negative authentication suite, including the expanded cases in §9.
2. Audience isolation between every pair of interfaces.
3. Binding mismatch rejection (interface, audience, expiry).
4. Local identity establishment without a token and without implicit admin.
5. Atomic refresh rotation, concurrent winner, reuse detection, family revoke.
6. Token version rejection.
7. Delegation validation.
8. SSO regression: existing operations, `VerifiedIdentity`, and business tables
   unchanged.
9. Redaction: no token, password, code, or verifier in logs or errors.
10. `cargo test -p identity-*` and `cargo clippy -p identity-* -- -D warnings`.
11. The conformance report names `IDN-07` through `IDN-24` and the negative
    cases.

---

# PART III.6 — REST Adapter

# 30 — REST Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-rest` is a thin HTTP adapter. It extracts the bearer token, verifies it,
converts the HTTP body to the operation request, calls the dispatcher, converts
the result, and maps errors to HTTP. It contains no business logic.

---

## 2. Dependencies

```toml
[dependencies]
axum = { workspace = true, features = ["json"] }
tower = { workspace = true }
tower-http = { workspace = true, features = ["cors", "trace"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
utoipa = { workspace = true }
utoipa-swagger-ui = { workspace = true, features = ["axum"] }
```

`*-rest` MUST NOT depend on `*-core`, `*-operation` internals, or another
interface crate. It depends on the contract crates and the dispatcher.

---

## 3. Layout

```text
*-rest/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # router, state, public re-exports
    ├── state.rs                # RestState, RestConfig
    ├── auth/
    │   ├── mod.rs
    │   └── bearer.rs           # Bearer extraction and middleware
    ├── routes/
    │   ├── mod.rs
    │   ├── public.rs           # /health, /auth/*
    │   └── protected.rs        # generated route registration
    ├── handlers/
    │   └── generated.rs        # generated per-operation handlers
    ├── schema/
    │   ├── mod.rs
    │   └── generated.rs        # generated REST request/response schemas
    ├── response/
    │   ├── mod.rs
    │   └── error.rs            # OperationError -> HTTP
    ├── openapi/
    │   └── generated.rs        # generated OpenApi document
    └── tests/
```

---

## 4. Public API

```rust
pub struct RestState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: RestConfig,
}

pub struct RestConfig {
    pub audience: identity_core::Audience,
    pub public_paths: Vec<&'static str>,
    pub cors_origins: Vec<String>,
    pub max_body_bytes: usize,
}

pub fn router(state: RestState) -> axum::Router;
```

`router` builds two routers and merges them:

- **Public router**: `/health` and operations whose catalog authentication is
  `anonymous` (`auth.token.issue`, `auth.refresh`). They still go through
  `Dispatcher::execute_anonymous`; a public route is not a dispatcher bypass.
- **Protected router**: every operation whose catalog authentication is
  `required`, wrapped with the bearer middleware. The middleware verifies the
  token and its binding, then the operation authorizes the target.

Every endpoint uses the semantic envelope `{context?, request}` and returns
`{request_id, result}` or `{request_id, error}`. Aliases are path/method sugar
over the same envelope; they do not use a different wire shape.

---

## 5. Generated Bindings

The generator emits one handler per operation. A generated handler has this
fixed shape:

```rust
async fn account_add(
    State(state): State<RestState>,
    Extension(identity): Extension<Arc<VerifiedIdentity>>,
    headers: axum::http::HeaderMap,
    Json(envelope): Json<SemanticRequest>,
) -> Result<Json<SemanticReply>, RestError> {
    let header_wire = WireContext::from_headers(&headers);
    let body_request_id = envelope.context.request_id;
    let wire = header_wire
        .merge(envelope.context)
        .map_err(|error| RestError::from_contract(error, body_request_id))?;
    let result = state
        .dispatcher
        .execute_verified(
            identity,
            INTERFACE_REST,
            state.config.audience,
            OperationId::new("account.add"),
            wire,
            envelope.request,
        )
        .await;
    Ok(Json(SemanticReply::from_result(result)))
}
```

The generator also emits:

- route registration in `routes/protected.rs`;
- `schema::<Operation>Request` / `Response` with `utoipa::ToSchema`;
- the OpenAPI path entry;
- a conformance matrix row.

Generated files carry `// @generated` and are not edited by hand.

---

## 6. HTTP Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| REST-01 | Credentials come only from `Authorization: Bearer`. | Header and scheme. | Token contents. | V3 test. |
| REST-02 | Tokens MUST NOT appear in query strings or paths. | Forbidden. | — | V3 test. |
| REST-03 | Public and protected routers are separate; protected routes use `route_layer`. | Structure. | Middleware implementation. | V3 test. |
| REST-04 | The audience is configured per router and passed to the verifier. | Audience parameter. | Value. | V3 audience test. |
| REST-05 | All REST success replies use 200 with the semantic envelope. 201, 202, and 204 are not used; aliases use 200. | Status rule. | — | V3 contract test. |
| REST-06 | Error mapping uses the fixed category table from `Part III.2` §5.8. | Category table. | Error codes. | V3 mapping test. |
| REST-07 | 401 responses include `WWW-Authenticate: Bearer`. | Header. | — | V3 test. |
| REST-08 | Mutating requests accept `Idempotency-Key` and pass it in `WireContext`. | Header name. | — | V3 test. |
| REST-09 | List endpoints define `limit`, `offset`, and optional `cursor`. | Parameter names. | Ranges and defaults. | V3 schema test. |
| REST-10 | Request bodies are bounded by `max_body_bytes`. | Rejection. | Limit value. | V3 test. |
| REST-11 | CORS and Origin allowlists are configured; unspecified origins are denied. | Deny-by-default. | Allowed list. | V3 test. |
| REST-12 | The OpenAPI document lists exactly the routes the router serves. | Equality. | Descriptions and examples. | V2 diff; V3 test. |
| REST-13 | Aliases call the same operation; they do not contain logic. | Delegation. | Alias set. | V3 catalog test. |
| REST-14 | Binary and multipart endpoints declare their media types and size limits. | Declaration. | Media types. | V3 test. |
| REST-15 | Every endpoint uses the semantic envelope for requests and replies. | Envelope. | Payload schema. | V3 contract test. |
| REST-16 | Aliases use the same envelope; they do not introduce a second wire shape. | Equality. | Alias paths. | V3 contract test. |
| REST-17 | Anonymous operations use the public router and `execute_anonymous`; they are not a dispatcher bypass. | Path. | Anonymous operation set. | V3 bypass test. |
| REST-18 | The reply `request_id` is the operation's `request_id`, including on errors. | Field. | — | V3 test. |

---

## 7. Error Mapping

```rust
pub struct RestError {
    pub request_id: RequestId,
    pub error: OperationErrorBody,
}

impl RestError {
    /// Adapter-level failure before dispatch. Uses the supplied request ID,
    /// or generates one when the request did not carry one.
    pub fn from_contract(error: ContractError, request_id: Option<RequestId>) -> Self;
}
```

`RestError` implements `IntoResponse`. It is used for pre-dispatch adapter
failures (malformed body, context conflict, missing or malformed bearer
header). Operation failures are returned as
`SemanticReply { request_id, error }`; they are not converted to `RestError`.

For adapter-level errors, `RestError` writes the same semantic error shape and
uses a generated request ID when the request did not carry one.

```json
{
  "request_id": "0190f3c2-...",
  "error": {
    "code": "invalid_input",
    "domain": "account",
    "retryable": false,
    "details": {}
  }
}
```

The body never contains a token, a password, a provider response, or a stack
trace.

---

## 8. OpenAPI

- `openapi/generated.rs` derives `utoipa::OpenApi`.
- Every operation path and schema is generated from the catalog.
- Security scheme: `Bearer` (`bearerFormat = "JWT"`).
- Swagger UI is mounted at `/swagger-ui`; the JSON is at
  `/api-docs/openapi.json`.
- The document is part of the conformance check: a route that is not documented,
  or a documented route that is not served, is a failure.

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, state, router split, middleware placement. | Middleware internals, extractor helpers. |
| Bearer-only authentication. | Token acquisition flow. |
| Status and error category tables. | Error codes within categories. |
| Idempotency header name and wire context. | Idempotency store implementation. |
| Pagination parameter names. | Page size limits and filters. |
| OpenAPI generation obligation. | Descriptions, examples, tags. |
| Aliases delegate to operations. | Alias paths. |

---

## 10. Conformance Obligations

1. Every documented route is served, and every served operation is documented.
2. Bearer-only enforcement; query/path tokens rejected.
3. Audience isolation: a token for another interface is rejected.
4. Error mapping matches the category table for every code.
5. Idempotency key is propagated.
6. CORS/Origin denial for unlisted origins.
7. No business logic: import scan and review.
8. `cargo test -p <project>-rest` and `cargo clippy -p <project>-rest -- -D
   warnings`.
9. The conformance report names `REST-01` through `REST-18`.

---

# PART III.7 — WebSocket Adapter

# 31 — WebSocket Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-websocket` is a thin, long-lived adapter. It authenticates the upgrade with a
one-time session ticket, converts messages to operation invocations, correlates
responses, forwards events and streams, and manages connection state,
backpressure, expiry, and cleanup.

---

## 2. Dependencies

```toml
[dependencies]
axum = { workspace = true, features = ["ws"] }
futures-util = { workspace = true }
tokio = { workspace = true, features = ["sync", "time"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```

`*-websocket` MUST NOT depend on `*-rest`, `*-grpc`, `*-mcp`, or `*-a2a`.

---

## 3. Layout

```text
*-websocket/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # router, state, public re-exports
    ├── state.rs                # WebsocketState, WebsocketConfig
    ├── upgrade/
    │   ├── mod.rs
    │   ├── ticket.rs           # one-time ticket extraction and redemption
    │   └── gate.rs             # origin, size, admission
    ├── envelope/
    │   ├── mod.rs
    │   ├── client.rs           # ClientMessage
    │   └── server.rs           # ServerMessage
    ├── dispatch/
    │   ├── mod.rs              # per-connection dispatcher
    │   ├── correlation.rs      # request_id -> response
    │   └── ordering.rs         # per-resource FIFO
    ├── state/
    │   ├── mod.rs
    │   └── connection.rs       # connection state machine
    ├── limits.rs
    ├── close.rs                # close code policy
    └── tests/
```

---

## 4. Public API

```rust
pub struct WebsocketState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub ticket_store: std::sync::Arc<dyn identity_core::SessionTicketStore>,
    pub config: WebsocketConfig,
}

pub struct WebsocketConfig {
    pub audience: identity_core::Audience,
    pub path: &'static str,             // default "/ws"
    pub max_message_bytes: usize,       // default 1 MiB
    pub max_queue_items: usize,         // default 512
    pub ping_interval: std::time::Duration,
    pub pong_timeout: std::time::Duration,
    pub allowed_origins: Vec<String>,
}

pub fn router(state: WebsocketState) -> axum::Router;
```

The upgrade path is `GET {path}`. The ticket is sent in `X-Session-Ticket`.
A ticket in the query string is forbidden.

---

## 5. One-Time Ticket

The ticket service is a shared operation, `auth.session_ticket.issue`, exposed by
at least one authenticated interface of the project (for example REST, gRPC, or
CLI). A WebSocket-only deployment may expose it through a minimal authenticated
entry point; it is not required to implement REST or gRPC. The WebSocket crate
does not issue tickets itself; it redeems them through `SessionTicketStore`.

```rust
pub struct Ticket {
    pub value: secrecy::SecretString,
    pub redeem_before: std::time::SystemTime,
}

pub trait SessionTicketStore: Send + Sync {
    fn issue(
        &self,
        identity: &VerifiedIdentity,
        audience: Audience,
        ttl: std::time::Duration,
    ) -> Result<Ticket, AuthenticationError>;

    /// Returns a new identity whose binding has the WebSocket interface,
    /// the WebSocket audience, and a fresh connection deadline.
    fn redeem(&self, ticket: &str) -> Result<Arc<VerifiedIdentity>, AuthenticationError>;
}
```

The ticket store implementation lives in `identity-core` behind a `ticket`
feature, for the same sealed-construction reason as the JWT verifier: only code
inside `identity-core` may construct `VerifiedIdentity`.

The ticket's `redeem_before` is the **redemption deadline**. The redeemed
identity's `binding.expires_at` is the **connection authentication deadline**.
They are distinct values and must not be conflated.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-01 | The ticket is random, hashed at rest, single-use, and short-lived (30 seconds). | Properties. | Length and storage. | V3 test. |
| WS-02 | The ticket is bound to the subject, audience, and scopes it was issued for. | Binding. | Extra claims. | V3 test. |
| WS-03 | A redeemed ticket cannot be redeemed again. | Single use. | — | V3 test. |
| WS-04 | The upgrade is rejected before the socket is accepted if redemption fails. | Rejection point. | Error detail. | V3 test. |
| WS-05 | The ticket is sent in a header, never in a query parameter. | Transport. | Header name. | V3 test. |

---

## 6. Envelope

```rust
#[derive(serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Request {
        request_id: RequestId,
        operation_id: OperationId,
        payload: serde_json::Value,
        context: Option<WireContext>,
    },
    StreamOpen {
        request_id: RequestId,
        stream_id: String,
        operation_id: OperationId,
        payload: serde_json::Value,
        context: Option<WireContext>,
    },
    StreamItem {
        stream_id: String,
        item: serde_json::Value,
    },
    StreamClose {
        stream_id: String,
    },
    StreamCancel {
        stream_id: String,
    },
    Ping,
    Close,
}

#[derive(serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Response {
        request_id: RequestId,
        result: serde_json::Value,
    },
    Error {
        request_id: RequestId,
        error: OperationErrorBody,
    },
    Event {
        subscription_id: String,
        item: serde_json::Value,
    },
    StreamItem {
        stream_id: String,
        item: serde_json::Value,
    },
    StreamEnd {
        stream_id: String,
        outcome: StreamOutcome,
    },
    Pong,
}

pub enum StreamOutcome {
    Eof,
    Cancelled,
    Error(OperationErrorBody),
}
```

The envelope is fixed. The payload is the operation's typed request/response.

---

## 7. Connection State

```rust
pub enum ConnectionState {
    Connecting,
    Authenticated { identity: Arc<VerifiedIdentity>, expires_at: Instant },
    Expired,
    Closing { code: u16, reason: &'static str },
    Closed,
}
```

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-06 | A successful upgrade is not permanent authentication. | Expiry check. | Re-auth policy. | V3 expiry test. |
| WS-07 | On expiry, the server either rejects new requests and requests re-auth, or closes with a policy code. | Behavior is explicit. | Choice per config. | V3 test. |
| WS-08 | Expired connections MUST NOT execute new operations. | Rejection. | — | V3 test. |
| WS-09 | Connection state transitions are explicit; illegal transitions are rejected. | State machine. | Transition table. | V3 test. |

---

## 8. Dispatch and Ordering

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-10 | Each request carries a `request_id`; the response carries the same ID. | Correlation. | ID generation. | V3 test. |
| WS-11 | Concurrent requests may interleave. | Allowed. | Concurrency limit. | V3 test. |
| WS-12 | Mutations to the same resource preserve a defined order. | Per-resource FIFO. | Queue implementation. | V3 ordering test. |
| WS-13 | No global ordering is promised. | Non-guarantee documented. | — | V4 review. |
| WS-14 | The adapter calls `Dispatcher::execute_verified`; it does not call handlers directly. | Call path. | — | V3 bypass test. |

---

### 8.1 Streaming

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-23 | `StreamOpen` creates a stream; the server sends `StreamItem` messages followed by exactly one `StreamEnd`. | Lifecycle. | Item encoding. | V3 test. |
| WS-24 | A client stream sends `StreamItem` messages and then `StreamClose`; the server replies with `Response` or `Error`. | Lifecycle. | Item encoding. | V3 test. |
| WS-25 | `StreamCancel` is idempotent, propagates to the operation, and ends with `StreamEnd::Cancelled`. | Cancellation. | Timing. | V3 test. |
| WS-26 | A bidi stream has independent half-close for input and output. | Half-close. | Encoding. | V3 test. |
| WS-27 | Backpressure applies to stream items; an overflow closes with 1013. | Bound. | Threshold. | V3 load test. |
| WS-28 | `stream_id` is unique per connection and is released on `StreamEnd`. | Uniqueness. | Format. | V3 test. |
| WS-29 | The adapter calls the dispatcher's stream methods; it does not implement business streaming. | Call path. | — | V3 bypass test. |

### 8.2 Protocol-owned resources

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-30 | The adapter authorizes protocol-owned subscriptions and streams against the connection identity. | Adapter auth. | Policy. | V3 test. |
| WS-31 | The adapter MUST NOT authorize business resources; that belongs to the operation. | Boundary. | — | V3 bypass test. |
| WS-32 | A subscription or stream is bound to the connection; disconnect cancels it. | Binding. | Cleanup timing. | V3 test. |

---

## 9. Backpressure and Limits

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-15 | Message size, frame size, queue length, and connection count are bounded. | Bounds exist. | Values. | V3 load test. |
| WS-16 | Control queue overflow and audio queue overflow have distinct policies. | Distinct behavior. | Thresholds. | V3 test. |
| WS-17 | A slow reader MUST NOT block the runtime; the connection is closed with 1013. | Close behavior. | Threshold. | V3 test. |
| WS-18 | Ping/pong intervals and timeouts are configured. | Presence. | Values. | V3 test. |

---

## 10. Close Codes and Cleanup

| Code | Meaning |
|---|---|
| 1000 | Normal closure |
| 1008 | Policy violation (authentication, authorization, origin) |
| 1009 | Message too large |
| 1011 | Internal error |
| 1013 | Try again later (backpressure) |

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-19 | Close codes use the table above. | Table. | Reason text. | V3 test. |
| WS-20 | Disconnect cleans up connection-owned subscriptions, streams, and temporary resources. | Cleanup required. | Implementation. | V3 leak test. |
| WS-21 | In-flight operations may complete after disconnect; their results are discarded unless the operation is explicitly cancel-on-disconnect. | Policy explicit. | Per-operation policy. | V3 test. |
| WS-22 | Origin allowlisting is applied before authentication. | Order. | Allowed list. | V3 test. |

---

## 11. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, router, upgrade path, ticket header. | Ticket storage and crypto. |
| Ticket properties and single-use semantics. | Ticket length and TTL within the range. |
| Envelope shape and correlation. | Payload schemas (from the catalog). |
| Connection state machine and expiry behavior. | Re-auth vs close policy. |
| Per-resource FIFO; no global order. | Queue implementation. |
| Close code table and cleanup obligation. | Reason text and resource policy. |
| No handler calls; dispatcher only. | Middleware and instrumentation. |

---

## 12. Conformance Obligations

1. Ticket redemption, single use, expiry, and audience binding.
2. Ticket in query is rejected.
3. Request/response correlation under concurrency.
4. Per-resource FIFO mutation order.
5. Expiry rejects new operations.
6. Backpressure closes with 1013; size violation with 1009.
7. Disconnect cleanup leaves no connection-owned resources.
8. No direct handler call; dispatcher bypass test.
9. Audience isolation: a REST token cannot upgrade.
10. `cargo test -p <project>-websocket` and `cargo clippy -p
    <project>-websocket -- -D warnings`.
11. The conformance report names `WS-01` through `WS-35`.

---

# PART III.8 — CLI Adapter

# 32 — CLI Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-cli` is a thin command-line adapter. It parses arguments, obtains a
credential, invokes the same operations as every other interface, and formats
the result. Local execution is an explicit mode with an explicit principal; it
is not an implicit administrator backdoor.

---

## 2. Dependencies

```toml
[dependencies]
clap = { workspace = true, features = ["derive"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
tokio = { workspace = true, features = ["rt-multi-thread", "macros"] }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
reqwest = { workspace = true, features = ["json"] }   # remote REST mode
tonic = { workspace = true }                           # remote gRPC mode
```

`*-cli` MUST NOT depend on `*-rest`, `*-grpc`, `*-websocket`, `*-mcp`, or
`*-a2a`. It may speak the protocol directly or use a generated client module.

---

## 3. Layout

```text
*-cli/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # run(), ExitCode
    ├── commands/
    │   ├── mod.rs
    │   ├── generated.rs        # generated command tree from the catalog
    │   └── common.rs           # --json, --timeout-ms, --endpoint, ...
    ├── local/
    │   ├── mod.rs
    │   ├── principal.rs        # explicit local principal
    │   └── verifier.rs         # LocalCredentialVerifier
    ├── remote/
    │   ├── mod.rs
    │   ├── rest.rs             # remote REST client
    │   └── grpc.rs             # remote gRPC client
    ├── output/
    │   ├── mod.rs
    │   ├── json.rs
    │   └── human.rs
    ├── error/
    │   └── exit.rs             # error -> exit code
    └── tests/
```

---

## 4. Public API

```rust
pub fn run(args: impl IntoIterator<Item = String>) -> ExitCode;
```

`run` is the only entry point. It parses arguments, selects local or remote
mode, invokes the operation, writes the result, and returns the exit code.

---

## 5. Generated Command Tree

The generator emits one subcommand per operation, derived from the catalog:

```rust
#[derive(clap::Parser)]
pub struct Cli {
    #[command(flatten)]
    pub common: CommonFlags,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(clap::Subcommand)]
pub enum Command {
    AccountAdd(AccountAddArgs),
    AccountGet(AccountGetArgs),
    // one variant per catalog operation
}

#[derive(clap::Args)]
pub struct AccountAddArgs {
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub email: String,
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-01 | Argument types are generated separately from operation types. Clap attributes never appear on operation structs. | Separation. | Argument names. | V1; V2 derive scan. |
| CLI-02 | Every catalog operation has one subcommand. | One-to-one. | Command name. | V3 catalog test. |
| CLI-03 | A composition command is allowed only when documented and mapped to a sequence of operations. | Documentation. | Composition set. | V3 test. |
| CLI-04 | The command converts arguments into the operation request and calls the dispatcher. | Conversion path. | Argument mapping. | V3 test. |

---

## 6. Modes

### 6.1 Local mode

```rust
pub trait LocalCredentialVerifier: Send + Sync {
    fn verify(
        &self,
        principal: identity_core::SubjectId,
        credential: &str,
    ) -> Result<identity_core::AuthenticatedUser, identity_core::AuthenticationError>;
}

pub trait LocalIdentityIssuer: Send + Sync {
    fn establish(
        &self,
        user: &identity_core::AuthenticatedUser,
        audience: identity_core::Audience,
        ttl: std::time::Duration,
    ) -> Result<std::sync::Arc<identity_core::VerifiedIdentity>, identity_core::AuthenticationError>;
}
```

```text
--local
--principal <uuid>
--credential-file <path>     # local credential, 0600
--audience <interface>       # defaults to "cli"
```

Local mode:

1. reads the local credential from a file, stdin, or TTY;
2. verifies it through `LocalCredentialVerifier`;
3. establishes a `VerifiedIdentity` through `LocalIdentityIssuer`
   (the CLI binding, not a REST or WebSocket binding);
4. calls `Dispatcher::execute_verified`.

There is no implicit administrator. The local credential must be provisioned
explicitly. A missing or invalid credential is exit code 3.

### 6.2 Remote mode

```text
--endpoint <url|host:port>
--protocol rest|grpc
--token-file <path> | --token-stdin | --token-tty
--refresh-file <path>
```

Remote mode:

1. obtains a token through `auth.token.issue` or a stored token;
2. sends the operation request over the selected protocol;
3. maps the protocol error to the operation error category;
4. writes the result.

The CLI MUST NOT pass both `--token-file` and a token in argv. A token in argv
is rejected before execution.

The CLI remote client is a **protocol client**, not an interface adapter. It may
speak REST or gRPC over the network. IF-06 forbids one adapter crate from
depending on another adapter crate; it does not forbid a client from calling a
server.

---

## 7. Output and Exit Codes

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-05 | Data goes to stdout; progress and diagnostics go to stderr. | Channels. | Format. | V3 test. |
| CLI-06 | `--json` emits one JSON value; `--jsonl` emits one JSON object per line. | Modes. | Field set. | V3 test. |
| CLI-07 | Human output is not parsed by scripts; JSON is the machine contract. | Contract. | Human formatting. | V4 review. |
| CLI-08 | Exit codes follow the fixed table. | Table. | Message text. | V3 test. |
| CLI-13 | JSON/JSONL output includes the operation's `request_id`. | Field. | Placement. | V3 test. |
| CLI-14 | The remote client is a protocol client, not an interface-adapter dependency. | Boundary. | Client implementation. | V2 dependency check. |

Exit code table:

| Code | Meaning |
|---|---|
| 0 | Success or normal EOF |
| 2 | Argument or configuration error |
| 3 | Authentication or authorization failure |
| 4 | Target, state, or conflict error |
| 5 | Network or external failure |
| 6 | Timeout or cancellation |
| 7 | Internal error |
| 8 | Capacity or unsupported |
| 130 | SIGINT |

---

## 8. Secrets

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-09 | Secrets are read from a file, stdin, or TTY. | Sources. | Prompt text. | V2 argv scan; V3 test. |
| CLI-10 | A secret in argv is rejected before any operation. | Rejection. | — | V3 test. |
| CLI-11 | Secrets are never written to stdout, logs, or error messages. | Forbidden. | — | V2 scan; V3 redaction test. |
| CLI-12 | Token files are checked for restrictive permissions. | Permission check. | Threshold. | V3 test. |

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, `run` entry point, mode selection. | Argument names, help text, output formatting. |
| Generated one-to-one command mapping. | Composition commands with documentation. |
| Local/remote distinction and explicit principal. | Local credential backend. |
| Exit code table and output channels. | Human-readable presentation. |
| Secret sources and argv rejection. | Token cache and refresh strategy. |
| No cross-interface crate dependency. | Direct protocol client implementation. |

---

## 10. Conformance Obligations

1. Every catalog operation has a subcommand.
2. Local mode rejects a missing or invalid principal.
3. Remote mode rejects a token in argv.
4. Exit codes match the table for every error category.
5. stdout contains no diagnostics; stderr contains no data.
6. JSON/JSONL output matches the operation response schema.
7. No secret appears in output, logs, or errors.
8. No cross-interface crate dependency.
9. `cargo test -p <project>-cli` and `cargo clippy -p <project>-cli -- -D
   warnings`.
10. The conformance report names `CLI-01` through `CLI-14`.

---

# PART III.9 — gRPC Adapter

# 33 — gRPC Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-grpc` is a thin gRPC adapter. It generates the protobuf service from the
operation catalog, extracts metadata credentials, verifies them, converts
protobuf messages to operation requests, calls the dispatcher, and maps the
result and errors to gRPC statuses. Generated protobuf types never leave this
crate.

---

## 2. Dependencies

```toml
[dependencies]
tonic = { workspace = true, features = ["transport", "codegen"] }
prost = { workspace = true }
tonic-prost = { workspace = true }
tokio = { workspace = true, features = ["sync", "time"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }

[build-dependencies]
tonic-prost-build = { workspace = true }
```

---

## 3. Layout

```text
*-grpc/
├── Cargo.toml
├── build.rs                     # tonic-prost-build
├── proto/
│   └── <project>.v1.proto       # generated from the catalog, checked in
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs               # service(), GrpcState, GrpcConfig
    ├── generated/
    │   └── mod.rs               # include_proto!
    ├── service/
    │   ├── mod.rs
    │   ├── unary.rs             # generated per-operation methods
    │   └── stream.rs            # S/C/B methods
    ├── auth/
    │   ├── mod.rs
    │   └── metadata.rs          # Bearer extraction and verification layer
    ├── conversion/
    │   ├── mod.rs
    │   └── generated.rs         # proto <-> operation request/response
    ├── error/
    │   └── status.rs            # OperationError -> Status
    └── tests/
```

Generated files carry `// @generated`. `proto/<project>.v1.proto` is generated
and checked in so that field numbers are reviewed; it is not edited by hand.

---

## 4. Public API

```rust
pub struct GrpcState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: GrpcConfig,
}

pub struct GrpcConfig {
    pub audience: identity_core::Audience,
    pub max_message_bytes: usize,       // default 1 MiB
    pub keepalive_interval: std::time::Duration,
    pub keepalive_timeout: std::time::Duration,
}

pub fn service(state: GrpcState) -> tonic::transport::server::Router;
```

The service is generated from the catalog. Every operation has one RPC. The
mode (`U`, `S`, `C`, `B`) is declared in the catalog and reflected in the proto.

---

## 5. Generated Proto

```proto
syntax = "proto3";
package <project>.v1;

service <Project>Service {
  rpc AccountAdd(AccountAddRequest) returns (AccountAddResponse);
  rpc AccountWatch(AccountWatchRequest) returns (stream AccountEvent);
  // one RPC per catalog operation
}

message Context {
  optional string request_id = 1;
  optional int64 deadline_unix_ns = 2;
  optional string idempotency_key = 3;
  optional string trace_id = 4;
}

message AccountAddRequest {
  Context context = 1;
  optional string name = 2;
  optional string email = 3;
}

message AccountAddResponse {
  string request_id = 1;
  string id = 2;
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-01 | The proto is generated from the catalog and checked in. | Generation and check-in. | Message fields. | V2 diff. |
| GRPC-02 | Field numbers are never reused. Removed numbers are `reserved`. | Reserved rule. | — | V2 schema check. |
| GRPC-03 | Scalars that need presence are declared `optional`. | Presence rule. | Field set. | V2 schema check. |
| GRPC-04 | `Context` uses the fixed field numbers from Part III.2 §8.1. | Field numbers. | — | V2 schema check. |
| GRPC-05 | Generated protobuf types do not appear in `*-core` or `*-operation`. | Import ban. | — | V2 scan. |
| GRPC-17 | Every reply message carries the operation's `request_id`. | Field. | — | V3 test. |
| GRPC-18 | Typed protobuf messages are the gRPC binding; the universal JSON-bytes envelope is not required. | Binding. | Message shape. | V3 contract test. |
| GRPC-19 | A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient. | Result authorization. | Store backend. | V3 test. |

---

## 6. Authentication

The adapter uses a tower layer or per-request extraction with this fixed order:

```text
read `authorization` metadata
  → require Bearer
  → verifier.verify(token, audience)
  → insert Arc<VerifiedIdentity> into request extensions
  → dispatch
```

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-06 | Credentials come from gRPC metadata, not from the message body. | Source. | Metadata key. | V3 test. |
| GRPC-07 | Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`. | Mapping. | Detail text. | V3 test. |
| GRPC-08 | The adapter does not construct `VerifiedIdentity`. | Opaque type. | — | V1; V3 compile-fail. |
| GRPC-09 | The interceptor does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |

---

## 7. Error Mapping

| Operation category | gRPC status |
|---|---|
| `invalid_input`, `invalid_config` | `INVALID_ARGUMENT` |
| `unauthenticated` | `UNAUTHENTICATED` |
| `permission_denied` | `PERMISSION_DENIED` |
| `not_found` | `NOT_FOUND` |
| `already_exists` | `ALREADY_EXISTS` |
| `invalid_state` | `FAILED_PRECONDITION` |
| `conflict` | `ABORTED` |
| `resource_exhausted` | `RESOURCE_EXHAUSTED` |
| `unsupported` | `UNIMPLEMENTED` |
| `timeout` | `DEADLINE_EXCEEDED` |
| `cancelled` | `CANCELLED` |
| `unavailable` | `UNAVAILABLE` |
| `internal` | `INTERNAL` |

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-10 | Every category maps to the status above. | Table. | Detail payload. | V3 mapping test. |
| GRPC-11 | Rich details are encoded as `google.rpc.Status` details or the JSON detail field; they never contain secrets. | Detail channel. | Encoding. | V3 redaction test. |

---

## 8. Deadlines, Streaming, and Limits

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-12 | The request deadline is propagated into `WireContext`. | Propagation. | — | V3 test. |
| GRPC-13 | `U` maps to unary; `S`, `C`, `B` map to the corresponding stream. | Mode mapping. | Stream internals. | V3 test. |
| GRPC-14 | Client cancellation cancels the operation when the operation supports it; otherwise the result is queryable by request ID. | Cancellation policy. | Per-operation support. | V3 test. |
| GRPC-15 | Message size and keepalive limits are configured. | Presence. | Values. | V3 load test. |
| GRPC-16 | Transport uses TLS outside loopback-only local mode. | TLS rule. | Certificate source. | V2 config check. |

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, build script, service generation. | Message fields beyond the fixed envelope. |
| Proto field-number rules and `Context` numbers. | RPC names derived from operation IDs. |
| Metadata Bearer extraction and verification. | Interceptor implementation. |
| Status mapping table. | Error detail payload. |
| Mode mapping and deadline propagation. | Streaming buffer strategy. |
| Generated types do not leak. | Internal conversion helpers. |

---

## 10. Conformance Obligations

1. Every catalog operation has one RPC.
2. Proto field numbers are stable; removed numbers are reserved.
3. Missing/wrong-audience token returns `UNAUTHENTICATED`.
4. Every error category maps to the fixed status.
5. Deadline propagation.
6. Streaming modes match the catalog.
7. Generated types do not appear in core/operation.
8. No direct handler call; dispatcher only.
9. Audience isolation: a REST token is rejected.
10. `cargo test -p <project>-grpc` and `cargo clippy -p <project>-grpc -- -D
    warnings`.
11. The conformance report names `GRPC-01` through `GRPC-19`.

---

# PART III.10 — MCP Adapter

# 34 — MCP Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-mcp` exposes operations as MCP tools. It owns the MCP protocol surface,
including the authorization discovery and challenge required by the adopted MCP
specification. It does not implement business logic and does not forward a
received token to another API.

---

## 2. Dependencies

```toml
[dependencies]
rmcp = { workspace = true }
tokio = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```

`*-mcp` MUST NOT depend on `*-rest`, `*-grpc`, or another interface crate.

---

## 3. Layout

```text
*-mcp/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # server(), McpState, McpConfig
    ├── tools/
    │   ├── mod.rs
    │   └── generated.rs        # one tool per applicable operation
    ├── auth/
    │   ├── mod.rs
    │   ├── discovery.rs        # authorization server metadata
    │   └── challenge.rs        # WWW-Authenticate / resource metadata
    ├── schema/
    │   └── generated.rs        # tool input/output schemas
    ├── error/
    │   └── mapping.rs          # OperationError -> MCP error
    └── tests/
```

---

## 4. Public API

```rust
pub struct McpState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: McpConfig,
}

pub struct McpConfig {
    pub audience: identity_core::Audience,
    pub resource_metadata_url: String,
    pub authorization_server: String,
    pub tool_prefix: Option<&'static str>,
    pub protocol_version: &'static str,
    pub transport_profile: &'static str,
    pub capabilities: Vec<&'static str>,
}

pub fn server(state: McpState) -> rmcp::Server;
```

---

## 5. Tool Mapping

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-01 | Every applicable catalog operation has one MCP tool. | Mapping rule. | Applicable subset. | V3 catalog test. |
| MCP-02 | The tool name is `operation_id` with `.` replaced by `_`, optionally prefixed. | Name algorithm. | Prefix. | V3 test. |
| MCP-03 | The tool input schema is generated from the operation request. | Schema generation. | Descriptions. | V3 schema test. |
| MCP-04 | The tool output schema is generated from the operation response. | Schema generation. | Descriptions. | V3 schema test. |
| MCP-05 | The tool handler converts input, calls the dispatcher, and maps the result. | Call path. | Conversion details. | V3 test. |
| MCP-06 | The tool handler contains no business logic. | Forbidden. | — | V2 scan; V4 review. |

A tool is applicable when the catalog marks it `mcp: true`. An operation marked
`mcp: false` must state a reason in the catalog.

---

## 6. Authorization

The adapter implements the authorization surface required by the adopted MCP
specification:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-07 | Authorization server metadata is exposed at the configured discovery endpoint. | Endpoint exists. | Metadata content. | V3 protocol test. |
| MCP-08 | Protected resource metadata identifies this MCP server as the audience. | Audience binding. | Metadata fields. | V3 test. |
| MCP-09 | Unauthenticated requests receive the spec-required challenge. | Challenge. | Realm text. | V3 test. |
| MCP-10 | Tokens are verified by the shared `AccessTokenVerifier` with the MCP audience. | Verification path. | — | V3 test. |
| MCP-11 | A received token MUST NOT be passed through to a downstream API. | Forbidden. | — | V2 scan; V3 test. |
| MCP-12 | The adapter does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |

---

## 7. Errors

| Operation category | MCP mapping |
|---|---|
| `invalid_input`, `invalid_config` | `InvalidParams` |
| `unauthenticated` | `Unauthorized` / spec challenge |
| `permission_denied` | `Forbidden` |
| `not_found` | `NotFound` |
| `already_exists`, `conflict`, `invalid_state` | `InvalidRequest` / conflict detail |
| `resource_exhausted` | `RateLimited` / capacity detail |
| `unsupported` | `MethodNotFound` / unsupported detail |
| `timeout`, `cancelled` | `Cancelled` / timeout detail |
| `unavailable` | `ServiceUnavailable` |
| `internal` | `InternalError` |

The exact JSON-RPC error code or MCP error variant is fixed by the adopted MCP
specification version. The adapter records that version in `McpConfig`.

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-13 | Every operation category has an MCP mapping. | Coverage. | Detail text. | V3 mapping test. |
| MCP-14 | Error details never contain tokens, secrets, or raw provider responses. | Forbidden. | — | V2 scan; V3 test. |

---

## 8. Session and State

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-15 | MCP session state lives in the adapter, not in business tables. | Boundary. | Session store. | V2 schema review. |
| MCP-16 | Business state is read and written only through operations. | Boundary. | — | V2 scan; V3 test. |
| MCP-17 | Resource and prompt surfaces that expose business data MUST read through a query operation; adapter-owned protocol metadata is the only exception. | Delegation. | Resource set. | V3 test. |
| MCP-18 | Protocol errors and business execution errors are mapped separately; a protocol failure is not reported as an operation error and vice versa. | Separation. | Detail. | V3 test. |
| MCP-19 | `McpConfig` records the adopted protocol version, transport profile, and capabilities. | Recorded. | Values. | V2 config check. |
| MCP-20 | The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions) but never business resources. | Boundary. | Policy. | V3 bypass test. |
| MCP-21 | Every tool result carries the operation's `request_id` in a machine-readable field. | Field. | Placement. | V3 test. |

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, server entry point, tool mapping rule. | Applicable operation subset and tool descriptions. |
| Authorization discovery/challenge obligations. | Metadata fields and provider configuration. |
| Token audience and no-passthrough rule. | Token acquisition flow. |
| Error category coverage. | Detail payload. |
| Session/business state boundary. | Session storage. |
| No business logic. | Tool handler conversion details. |

---

## 10. Conformance Obligations

1. Every applicable operation has a tool; every tool maps to one operation.
2. Tool input/output schemas match the operation types.
3. Unauthenticated requests receive the spec-required challenge.
4. A token for another audience is rejected.
5. No token passthrough to a downstream API.
6. Every error category maps; no secrets in details.
7. No business state in MCP tables.
8. No direct handler call; dispatcher only.
9. `cargo test -p <project>-mcp` and `cargo clippy -p <project>-mcp -- -D
   warnings`.
10. The conformance report names `MCP-01` through `MCP-21`.

---

# PART III.11 — A2A Adapter

# 35 — A2A Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-a2a` exposes operations as A2A skills and tasks. It owns the A2A protocol
surface, including the security scheme required by the adopted A2A
specification. A2A task state is protocol state; it is not the authoritative
business state.

---

## 2. Dependencies

```toml
[dependencies]
a2a = { workspace = true }          # package a2a-lf
a2a-server = { workspace = true }   # package a2a-server-lf
tokio = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```

The dependency names and package names are recorded in the workspace manifest.
A similar-named non-official crate must not be substituted.

---

## 3. Layout

```text
*-a2a/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # server(), A2aState, A2aConfig
    ├── agent/
    │   ├── mod.rs
    │   └── card.rs             # generated AgentCard and skills
    ├── task/
    │   ├── mod.rs
    │   ├── mapping.rs          # task/message <-> operation
    │   └── store.rs            # task store (protocol state)
    ├── auth/
    │   ├── mod.rs
    │   └── security.rs         # spec-required security scheme
    ├── stream/
    │   └── mod.rs              # task updates and SSE/stream events
    ├── error/
    │   └── mapping.rs          # OperationError -> A2A error
    └── tests/
```

---

## 4. Public API

```rust
pub struct A2aState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: A2aConfig,
}

pub struct A2aConfig {
    pub audience: identity_core::Audience,
    pub agent_name: &'static str,
    pub agent_description: &'static str,
    pub task_store: std::sync::Arc<dyn TaskStore>,
    pub security_schemes: Vec<SecurityScheme>,
    pub protocol_version: &'static str,
    pub transport_profile: &'static str,
    pub capabilities: Vec<&'static str>,
}

pub fn server(state: A2aState) -> a2a_server::A2aServer;

pub struct TaskOwner {
    pub subject: identity_core::SubjectId,
    pub tenant: Option<identity_core::TenantId>,
}

pub trait TaskStore: Send + Sync {
    fn load(
        &self,
        owner: &TaskOwner,
        task_id: &str,
    ) -> operation_contract::BoxFuture<'_, Option<serde_json::Value>>;

    fn save(
        &self,
        owner: &TaskOwner,
        task_id: &str,
        state: serde_json::Value,
    ) -> operation_contract::BoxFuture<'_, Result<(), String>>;
}
```

---

## 5. Agent Card and Skills

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-01 | The agent card is generated from the catalog. | Generation. | Name, description, provider metadata. | V2 schema check. |
| A2A-02 | Every applicable operation has one skill. | Mapping rule. | Applicable subset. | V3 catalog test. |
| A2A-03 | A skill carries the operation ID and its input/output modes. | Fields. | Descriptions and examples. | V3 schema test. |
| A2A-04 | A skill marked not applicable states a reason in the catalog. | Reason required. | — | V3 test. |

The skill identifier is the operation ID with `.` replaced by `_`, optionally
prefixed, matching the MCP convention.

---

## 6. Task Mapping

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

---

## 7. Security

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-11 | The adopted A2A security scheme is implemented as declared in the agent card. | Scheme declaration and enforcement. | Scheme set. | V3 protocol test. |
| A2A-12 | Tokens are verified by the shared verifier with the A2A audience. | Verification path. | — | V3 test. |
| A2A-13 | A token for another interface is rejected. | Audience isolation. | — | V3 test. |
| A2A-14 | The adapter does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |
| A2A-15 | Secrets and tokens are not written to task state, logs, or errors. | Forbidden. | — | V2 scan; V3 test. |

---

## 8. Streaming and Errors

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-16 | Task updates use the A2A-defined event model, not an ad-hoc envelope. | Event model. | Payload. | V3 test. |
| A2A-17 | Streaming termination distinguishes success, failure, and cancellation. | Distinction. | Detail. | V3 test. |
| A2A-18 | Every operation category has an A2A error mapping. | Coverage. | Detail text. | V3 mapping test. |
| A2A-19 | Error details never contain tokens, secrets, or raw provider responses. | Forbidden. | — | V2 scan; V3 test. |

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, server entry point, agent card generation. | Agent metadata and descriptions. |
| Skill mapping rule. | Applicable operation subset. |
| Task-to-operation mapping and state boundary. | Task store implementation. |
| Spec-required security scheme and audience. | Scheme configuration. |
| Event model and termination distinction. | Event payload details. |
| No business logic. | Conversion helpers. |

---

## 10. Conformance Obligations

1. Every applicable operation has a skill; every skill maps to one operation.
2. The agent card declares the implemented security scheme.
3. A token for another audience is rejected.
4. Task state never enters business tables.
5. No business logic in the adapter.
6. Cancellation semantics match the operation.
7. Streaming termination distinguishes success, failure, and cancellation.
8. Every error category maps; no secrets in details.
9. `cargo test -p <project>-a2a` and `cargo clippy -p <project>-a2a -- -D
   warnings`.
10. The conformance report names `A2A-01` through `A2A-24`.

---

# PART III.12 — Conformance Crate

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

---

# PART III.13 — Project Template

# 50 — Project Template

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

This document defines the workspace every project starts from. It is
profile-driven: a project includes only the crates, files, and generated
outputs for the interfaces it actually implements.

---

## 1. Workspace Layout

```text
<project>/
├── Cargo.toml
├── RULES-PROFILE.toml
├── SYSTEM-DESIGN.md
├── contract/
│   ├── operation-catalog.toml
│   ├── proto-field-ledger.toml
│   └── audience.toml
├── proto/
│   └── <project>.v1.proto          # generated, checked in, grpc profile only
└── crates/
    ├── operation-contract/          # shared
    ├── interface-contract/          # shared
    ├── contract-macros/             # shared input/rule macros
    ├── validation-contract/         # shared runtime validator and registry
    ├── identity-core/               # shared
    ├── identity-jwt/                # shared facade
    ├── identity-local/              # shared
    ├── identity-operation/          # shared
    ├── identity-sso/                # shared, optional
    ├── <project>-core/
    ├── <project>-operation/
    ├── <project>-conformance/
    ├── <project>-rest/              # only if rest profile
    ├── <project>-websocket/         # only if websocket profile
    ├── <project>-cli/               # only if cli profile
    ├── <project>-grpc/              # only if grpc profile
    ├── <project>-mcp/               # only if mcp profile
    ├── <project>-a2a/               # only if a2a profile
    └── <project>-assembly/
```

The shared crates are consumed from a versioned contract repository or vendored
for bootstrapping. They are never forked. A local modification is proposed
upstream and versioned.

A project MAY add `tooling`, `test-support`, `build-support`, or `utility`
crates. Their dependency edges are declared in `RULES-PROFILE.toml`; forbidden
runtime edges still apply.

---

## 2. `RULES-PROFILE.toml`

```toml
[project]
name = "doors"
spec_version = "0.3.2"

[profiles]
rust = true
rest = true
websocket = true
cli = true
grpc = true
mcp = true
a2a = true

[auth]
jwt = true
sso = "disabled"   # disabled | planned | enabled
local_only = false

[docs]
generate = true    # MUST be true for every project
english = true     # MUST be true
out_dir = "docs/generated"

[roles]
# Additional, non-runtime roles. Dependency edges still obey ARC-02..ARC-08.
tooling = []
test-support = ["<project>-core", "<project>-operation"]
build-support = []
```

Profiles are booleans. An unimplemented interface is `false`, not omitted.
`sso = "planned"` is allowed only with a target in `SYSTEM-DESIGN.md`; it is not
an implementation.

---

## 3. Operation Catalog

The catalog is the single source of truth for operations. The generator
consumes it; the conformance matrix is derived from it.

```toml
[project]
name = "doors"
spec_version = "0.3.2"

[[operation]]
id = "account.add"
authentication = "required"          # required | anonymous
scope = "control"                    # required operations only
mode = "unary"                       # unary | server_stream | client_stream | bidi
request = "AccountAddRequest"
response = "AccountAddResponse"
prepared = "PreparedAccountAdd"
handler = "crates/doors-operation/src/handlers/account/add.rs"
conformance = "CF_account_add"

# Documentation inputs (English only)
docs = { summary = "Create an account", description = "Creates an account in the caller's tenant.", examples = ["account.add --name 'Example' --email user@example.com"] }

# Idempotency
idempotency = "same-transaction"     # none | same-transaction | external

# External effects
recovery = "compensate"              # compensate | forward | isolate

# Interface bindings
rest = { method = "POST", path = "/accounts", success = 200 }
websocket = { operation_id = "account.add" }
cli = { command = "account add" }
grpc = { service = "DoorsService", method = "AccountAdd", request = "AccountAddRequest", response = "AccountAddResponse" }
mcp = { tool = "account_add", applicable = true }
a2a = { skill = "account_add", applicable = true }

# Result store / cancellation
result_store = "on-cancel"           # none | on-cancel | always
```

Required fields:

| Field | Rule |
|---|---|
| `id` | Dotted, stable, unique. Grammar: `^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$`. |
| `authentication` | `required` or `anonymous`. |
| `scope` | Required when `authentication = "required"`; MUST be omitted for anonymous. |
| `mode` | `unary`, `server_stream`, `client_stream`, or `bidi`. |
| `request` / `response` / `prepared` | Rust type names. |
| `handler` | Path to the create-once hand-written handler. |
| `conformance` | `CF_<id with dots replaced by underscores>`. |
| `idempotency` | `none`, `same-transaction`, or `external`. |
| `recovery` | Required when the operation has external effects. |
| Interface bindings | Required for every profile in `RULES-PROFILE.toml`; absent profiles are omitted. |
| `mcp` / `a2a` | `applicable = false` requires a reason. |

The generator rejects:

- a duplicate operation ID;
- a tool/skill/CLI name collision after `.` → `_` and kebab-case conversion;
- a binding for a profile that is `false`;
- a missing binding for a profile that is `true`;
- a missing conformance ID or handler;
- a `scope` on an anonymous operation;
- a `recovery` value not declared for an operation with external effects.

---

## 4. Schema Source

Request and response types declare input constraints once with the shared
input macro. The macro generates the runtime validator, the schema, and the
validation descriptor:

```rust
#[contract::input]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct AccountAddRequest {
    #[rule(length(min = 1, max = 100), code = "invalid_name")]
    pub name: String,

    #[rule(pattern = "^[^@]+@[^@]+$", code = "invalid_email")]
    pub email: String,
}
```

The generator consumes the neutral schema registry and the validation
descriptor registry. It emits REST schemas, MCP tool schemas, A2A skill
schemas, CLI flags, OpenAPI entries, and validation constraint tables.
Protocol-specific annotations (for example `utoipa`) belong to the adapter, not
to the operation DTO. Do not hand-write a second constraint list in the
documentation.

The proto field ledger is separate and authoritative:

```toml
# contract/proto-field-ledger.toml
[[message]]
name = "AccountAddRequest"
[[message.field]]
name = "context"
tag = 1
type = "Context"
[[message.field]]
name = "name"
tag = 2
type = "string"
optional = true

[[message.reserved]]
name = "AccountAddRequest"
tags = [7, 8]
names = ["legacy_email"]
```

The generator reads the ledger for tag assignment and rejects tag reuse,
renumbering, or a field without a ledger entry.

---

## 5. Cargo.toml

```toml
[workspace]
resolver = "2"
members = [
  "crates/operation-contract",
  "crates/interface-contract",
  "crates/contract-macros",
  "crates/validation-contract",
  "crates/identity-core",
  "crates/identity-jwt",
  "crates/identity-local",
  "crates/identity-operation",
  "crates/<project>-core",
  "crates/<project>-operation",
  "crates/<project>-conformance",
  "crates/<project>-docgen",
  "crates/<project>-assembly",
  # add the interface members that are true in RULES-PROFILE.toml
]

[workspace.package]
edition = "2021"
rust-version = "1.95"

[workspace.dependencies]
operation-contract = { path = "crates/operation-contract" }
interface-contract = { path = "crates/interface-contract" }
contract-macros = { path = "crates/contract-macros" }
validation-contract = { path = "crates/validation-contract" }
identity-core = { path = "crates/identity-core" }
identity-jwt = { path = "crates/identity-jwt" }
identity-local = { path = "crates/identity-local" }
identity-operation = { path = "crates/identity-operation" }
# interface SDKs are pinned here and included per profile
```

The workspace verifies that every member required by a true profile is present
and every member for a false profile is absent.

---

## 6. Required Files by Profile

| File | Required when |
|---|---|
| `RULES-PROFILE.toml` | Always. |
| `SYSTEM-DESIGN.md` | Always. |
| `contract/operation-catalog.toml` | Always. |
| `contract/proto-field-ledger.toml` | `grpc = true`. |
| `proto/<project>.v1.proto` | `grpc = true`. |
| `crates/<project>-docgen/` | Always. |
| `docs/generated/INDEX.md` | Always. |
| `docs/generated/rest/` | `rest = true`. |
| `docs/generated/websocket/` | `websocket = true`. |
| `docs/generated/cli/` | `cli = true`. |
| `docs/generated/grpc/` | `grpc = true`. |
| `docs/generated/mcp/` | `mcp = true`. |
| `docs/generated/a2a/` | `a2a = true`. |
| `<project>-conformance/src/matrix/generated.rs` | Always. |
| `<project>-conformance/src/cases/generated.rs` | Always. |

A profile that is `false` must not require its files. A project that implements
only MCP must not be required to add REST, WebSocket, CLI, or gRPC.

---

## 7. Generated Files and Create-Once Files

Generated files carry:

```rust
// @generated by conver. Do not edit.
```

The generated set is profile-conditional:

- operation registry (`register_all.rs`);
- REST route registration, schemas, OpenAPI;
- WebSocket envelope/dispatch bindings;
- CLI command tree;
- gRPC proto, service, conversions;
- MCP tools and schemas;
- A2A agent card and task mapping;
- conformance matrix and cases.

Hand-written handler skeletons are **create-once**, not overwritten:

```rust
// @generated:create-once <operation_id>. Replace this body with the implementation.
// [::STUB::] <ticket>: implement <operation_id>
```

Subsequent generation leaves an existing create-once file untouched and reports
a conflict if the file is missing or malformed.

A generation gate proves determinism:

- same `spec_version` + profile + operation catalog + proto field ledger +
  request/response `JsonSchema` output + generator version → byte-identical
  generated output;
- a hand edit to a generated file is overwritten;
- a hand edit to a create-once file is preserved;
- the generated output hash is recorded and checked in CI.

---

## 8. Naming

| Item | Rule |
|---|---|
| Crates | `<project>-<role>`; shared crates have no project prefix. |
| Modules | `snake_case`; public module layout follows the role spec. |
| Types | `PascalCase`; request/response end with `Request`/`Response`. |
| Operation IDs | `^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$`. |
| Handler file | `<project>-operation/src/handlers/<domain>/<action>.rs`. |
| REST path | `<domain>/<action>` with path parameters for targets. |
| CLI command | `<domain> <action>` with kebab-case flags. |
| gRPC method | PascalCase of the operation ID. |
| MCP/A2A tool/skill | operation ID with `.` replaced by `_`. |
| Audience | one per interface (`rest`, `websocket`, `cli`, `grpc`, `mcp`, `a2a`). |
| Conformance ID | `CF_<operation_id with dots replaced by underscores>`. |

The generator rejects collisions after applying these transformations.

---

## 9. Build and Verification

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test -p <project>-conformance
cargo test --workspace
cargo metadata --format-version 1 > /dev/null
cargo run -p <project>-docgen -- dump-schema --out target/schema/registry.json
cargo run -p <project>-docgen -- dump-validation --out target/validation/registry.json
cargo run -p <project>-docgen -- render --catalog contract/operation-catalog.toml --out docs/generated
cargo run -p <project>-docgen -- check all
node scripts/rules/check-registry.mjs
node scripts/generate/check-determinism.mjs
```

The conformance crate is the authoritative gate. `cargo test --workspace` alone
does not prove cross-interface parity, rule coverage, documentation coverage, or
generation determinism. The docgen `--check all` gate covers completeness,
English-only, secret-free, and deterministic output.

---

## 10. Versioning

`spec_version` covers the rules, contracts, generator, and conformance kit.
Protocol SDK versions are recorded separately in `Cargo.toml` and the protocol
config.

| Artifact | Version source |
|---|---|
| Rules + contracts + generator + conformance kit | `spec_version` |
| Protocol SDKs | `Cargo.toml` + `Cargo.lock` |
| MCP/A2A specification | `McpConfig`/`A2aConfig` and `SYSTEM-DESIGN.md` |

A project upgrade changes `spec_version`, regenerates, and reruns conformance.
It is never implicit drift.

---

## 11. Fixed and Open

| Fixed | Open |
|---|---|
| Workspace layout, role names, profile schema, catalog schema. | Domain modules and operation contents. |
| Required files per profile. | Additional project crates and tooling. |
| Generated-file boundary and create-once rule. | Generator implementation details, provided determinism holds. |
| Naming grammar and collision checks. | Human-readable descriptions. |
| Verification commands. | CI provider and scheduling. |
| Version pinning. | Release cadence. |

---

# PART III.14 — Migration

# 90 — Migration

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`

This document maps gaia, crystal, and doors onto the target architecture and
defines the order in which they converge. The projects are not yet fixed; this
is the plan that fixes them.

---

## 1. Target State

Every project has the same shape:

```text
<project>/
├── RULES-PROFILE.toml
├── SYSTEM-DESIGN.md
├── contract/operation-catalog.toml
├── proto/<project>.v1.proto
└── crates/
    ├── operation-contract/      # shared
    ├── interface-contract/      # shared
    ├── identity-core/           # shared
    ├── identity-jwt/            # shared facade
    ├── identity-local/          # shared
    ├── identity-operation/      # shared
    ├── identity-sso/            # shared, optional
    ├── <project>-core/
    ├── <project>-operation/
    ├── <project>-conformance/
    ├── <project>-rest/
    ├── <project>-websocket/
    ├── <project>-cli/
    ├── <project>-grpc/
    ├── <project>-mcp/
    ├── <project>-a2a/
    └── <project>-assembly/
```

The shared crates are consumed by version. They are not forked per project.

---

## 2. Migration Order

```text
0. Pin spec_version and record baseline behavior tests
1. Add shared contract crates
2. Add identity crates
3. Create the operation catalog
4. Map existing crates to roles
5. Introduce the dispatcher and operation authorization
6. Add the conformance crate and a minimal matrix
7. Adopt only the interface profiles the project needs
   (recommended order within the selected set:
    REST → WebSocket → CLI → gRPC → MCP → A2A)
8. Remove duplicate implementations and forbidden edges
9. Add further interfaces when needed
10. Verify, then retire the old paths
```

A project is not required to adopt every interface. The order is a
recommendation for the profiles the project selects; any subset is valid. Each
step ends with a conformance result. A step that cannot show a verdict is not
complete.

---

## 3. Step 0 — Pin the Rules and Record the Baseline

For each project:

1. Add `RULES-PROFILE.toml` with `spec_version`.
2. Declare implemented interfaces; mark the rest `false`.
3. Record baseline behavior tests for every operation that will be migrated.
   The baseline covers success, failure, authorization, and state change.
4. Record the current state as the migration baseline.
5. Do not change behavior in this step.

Identity replacement (Step 2) must not begin until the baseline tests run and
pass against the current implementation.

---

## 4. Step 1 — Shared Contract Crates

1. Add `operation-contract`, `interface-contract`, and `identity-core` as
   dependencies.
2. If the project has a local copy, replace it with the versioned dependency.
3. Do not wrap the shared types in project-specific aliases; the contracts are
   the seam.

Verification: `cargo metadata` shows the shared crates and no duplicate copies.

---

## 5. Step 2 — Identity Crates

1. Add `identity-jwt`, `identity-local`, and `identity-operation`.
2. Replace the existing JWT verifier with `AccessTokenVerifier`.
3. Replace the existing login endpoint with the `auth.token.issue` operation.
4. Replace ad-hoc principal types with `VerifiedIdentity`.
5. Add the negative JWT suite.
6. If SSO is planned, add the `identity-sso` placeholder crate but do not
   implement a provider yet.

Verification: negative suite passes; no `Authorization` parsing outside the
adapters; no raw JWT in operation code.

---

## 6. Step 3 — Operation Catalog

1. Extract every operation from `SYSTEM-DESIGN.md`, RFCs, and handlers.
2. Add each entry to `contract/operation-catalog.toml` using the §11 template.
3. Assign scope, mode, interfaces, MCP/A2A applicability, and conformance ID.
4. Mark missing interface bindings as `not applicable` with a reason.
5. Generate skeletons and the matrix.

Verification: every existing handler maps to exactly one catalog entry; every
catalog entry has a handler and a conformance ID.

---

## 7. Step 4 — Crate Mapping

### 7.1 doors

| Target role | Existing crate | Action |
|---|---|---|
| core | `doors-core` | Keep; remove transport/auth imports. |
| operation | `doors-operation` | Keep; introduce dispatcher and authorizer. |
| conformance | `doors-conformance` | Keep; add matrix, drivers, negative suite. |
| rest | `doors-rest` | Keep; replace hand routes with generated bindings. |
| websocket | `doors-websocket` | Keep; introduce ticket store and envelope. |
| cli | `doors-cli` | Keep; generate commands from the catalog. |
| grpc | `doors-grpc` | Keep; generate proto from the catalog. |
| mcp | to be created | Add after REST/WS/CLI/gRPC pass. |
| a2a | to be created | Add after MCP. |
| assembly | to be created | Add the wiring crate. |
| build support | `pjsip-prebuilt` | Keep outside the runtime roles; declare as `build-support`. |

doors is the pilot because its operation catalog is the most complete.

### 7.2 gaia

| Target role | Existing crate | Action |
|---|---|---|
| core | `gaia-core`, `gaia-foundation`, `gaia-ports` | Split: `gaia-core` = domain; `gaia-ports` = ports; `gaia-foundation` = pure utilities. Declare `foundation` as a utility, not a domain crate. |
| operation | `gaia-operation` | Keep; add dispatcher and authorizer. |
| conformance | `gaia-conformance` | Keep; add matrix and drivers. |
| rest | `gaia-rest` | Keep; generate routes. |
| websocket | `gaia-websocket` | Keep; add ticket store. |
| cli | `gaia-cli` | Keep; generate commands. |
| grpc | to be created | Add after the existing interfaces pass. |
| mcp / a2a | to be created | Add last. |
| adapters | `gaia-*-adapter` | Keep as adapters; no domain logic. |
| assembly | to be created | Add the wiring crate. |

`gaia-foundation` must not hold domain rules or transport types. If it does,
move those pieces to `gaia-core` or an adapter.

### 7.3 crystal

| Target role | Existing crate | Action |
|---|---|---|
| core | `crystal-core`, `crystal-protocol-types` | Keep; move invariants into core. |
| operation | `crystal-operation`, `crystal-protocol-*` | Keep; consolidate operation execution. |
| conformance | `crystal-conformance`, `crystal-testkit` | Keep; `testkit` supports the harness. |
| assembly | `crystal-bootstrap` | Keep; it is the wiring crate. |
| adapters | `crystal-adapter-*` | Keep as adapters. |
| transports | `transports/*` | Map to interface crates or external adapters. |
| rest / websocket / cli / grpc / mcp / a2a | to be created | Add the profiles the project selects; recommended order within that set: REST → WebSocket → CLI → gRPC → MCP → A2A. |

Crystal currently has no interface crates. The first interface should be REST,
because it establishes the catalog and conformance matrix. Do not create six
interfaces at once.

---

## 8. Step 5 — Dispatcher and Authorization

1. Add `Dispatcher` and `OperationRegistry` to `<project>-operation`.
2. Route every handler through the dispatcher.
3. Replace handler-level role checks with `Authorizer::require`.
4. Keep adapters as thin as possible; remove business checks from them.
5. Add the bypass test: an adapter cannot invoke a handler directly.

Verification: no handler is reachable without the dispatcher; authorization
tests pass for every operation.

---

## 9. Step 6 — Conformance

1. Add `*-conformance` with the matrix and drivers.
2. Implement in-process drivers for the existing interfaces.
3. Add normal, failure, authorization, and idempotency cases.
4. Add the negative authentication suite.
5. Add the audience isolation pairs.
6. Add the dependency-edge check.
7. Make the report fail on a missing cell or rule.

Verification: the report names every rule ID and every cell.

---

## 10. Step 7 — Interfaces

Adopt only the profiles the project needs. The recommended order within the
selected set is REST → WebSocket → CLI → gRPC → MCP → A2A, but the set is the
project's choice.

For each selected interface:

1. Generate bindings from the catalog.
2. Implement the driver contract.
3. Set the profile to `true` in `RULES-PROFILE.toml`.
4. Add the conformance matrix column.
5. Pass the negative suite, audience isolation, and binding checks.
6. Remove the old hand-written path only after the new path passes.

A project that needs only MCP or A2A may implement it first. It must still pass
the same operation, authorization, and conformance obligations.

---

## 11. Step 8 — Remove Divergence

Remove:

- duplicated operation implementations in interfaces;
- raw `Authorization` parsing outside adapters;
- JWT-library imports in core/operation;
- transport types in core/operation;
- ad-hoc error enums in adapters;
- duplicate `VerifiedIdentity`/principal types;
- direct database access from adapters.

Each removal is preceded by a conformance test that proves the remaining path.

---

## 12. Step 9 — Additional Interfaces (MCP, A2A)

Add MCP or A2A when the project needs them. They are not gated on REST,
WebSocket, CLI, or gRPC. They are gated on:

1. the operation catalog entries they expose;
2. the authorization and audience binding being proven for those operations;
3. the adopted protocol specification version being recorded;
4. the conformance matrix including the new interface.

MCP and A2A add protocol-specific auth surfaces. They do not change operations,
`VerifiedIdentity`, or business tables.

---

## 13. Per-Project Completion Criteria

| Project | Completion |
|---|---|
| doors | All seven existing roles mapped; identity crates added; catalog complete; conformance matrix covers REST/WS/CLI/gRPC; MCP/A2A declared absent. |
| gaia | Core split resolved; identity crates added; REST/WS/CLI pass conformance; gRPC/MCP/A2A declared absent. |
| crystal | Identity crates added; REST created; catalog and conformance pass; remaining interfaces declared absent. |

A project is not complete because it compiles. It is complete when the
conformance report has no `Fail` and no missing rule.

---

## 14. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Existing operations have no stable IDs. | Assign IDs from the catalog and keep a mapping table during migration. |
| Existing auth is entangled with handlers. | Extract to `AccessTokenVerifier` first; keep the old path behind a feature until conformance passes. |
| Crate names and roles conflict. | Rename or split before adding shared crates; record the mapping. |
| Missing `Cargo.toml` in design scaffolds. | Add the workspace manifest as part of Step 1; the generator does not invent packages. |
| Generated code is hand-edited. | Mark generated files and fail the build if a generated header is removed. |
| Interface behavior drifts during migration. | Add the matrix before adding interfaces; a new interface must pass the same cells. |
| SSO is added too early. | Keep `sso = "planned"` until all existing operations pass JWT conformance. |
| Performance regressions. | Keep algorithms behind ports; conformance is behavioral, not performance-based; add benchmarks separately. |

---

## 15. Rollback

- Every step is additive until the old path is retired.
- Baseline tests from Step 0 are the rollback oracle.
- The old path stays behind a feature flag or a separate router until the new
  path passes conformance.
- A profile change alone is not a rollback: it does not undo router wiring,
  DB migrations, generated files, or data changes. The rollback procedure must
  include:
  1. the feature flag that selects the old path;
  2. the DB compatibility window (forward and backward);
  3. the generated artifacts to restore;
  4. the data migration reverse or compensation;
  5. the conformance baseline result to compare against.
- Removing the old path is a separate, conformance-backed change.

---

## 16. Fixed and Open

| Fixed | Open |
|---|---|
| Target workspace and crate roles. | Project-specific domain modules. |
| Migration order and completion criteria. | Scheduling and ownership. |
| Shared crates are versioned, not forked. | Contract repository location. |
| Conformance is the gate. | CI provider and runtime. |
| SSO is last. | Provider selection. |
| Rollback keeps the old path until proof. | Feature-flag mechanism. |

---

# PART III.15 — Rule Registry

# 15 — Rule Registry

**Status:** Normative  
**Version:** 0.3.2  
**Parent:** Part II

This is the canonical index of rule IDs. Every ID appears once. A rule ID
with two different obligations is a defect.

The registry records applicability, parent group, source part, statement,
verification, and the concrete gate family. The source part is authoritative
for the full statement and exception.

## 1. Registry

| ID | Class | Applicability | Parent | Source | Short statement | Verification | Gate |
|---|---|---|---|---|---|---|---|
| `A2A-01` | G | a2a | A2A | Part III.11 | The agent card is generated from the catalog. | V2 schema check. | conformance driver |
| `A2A-02` | C | a2a | A2A | Part III.11 | Every applicable operation has one skill. | V3 catalog test. | conformance driver |
| `A2A-03` | C | a2a | A2A | Part III.11 | A skill carries the operation ID and its input/output modes. | V3 schema test. | conformance driver |
| `A2A-04` | C | a2a | A2A | Part III.11 | A skill marked not applicable states a reason in the catalog. | V3 test. | conformance driver |
| `A2A-05` | C | a2a | A2A | Part III.11 | An A2A task maps to one operation invocation. | V3 test. | conformance driver |
| `A2A-06` | C | a2a | A2A | Part III.11 | A2A task state is stored only in `TaskStore`, never in business tables. | V2 schema review; V3 test. | conformance driver |
| `A2A-07` | C | a2a | A2A | Part III.11 | Business state is read and written only through operations. | V2 scan; V3 test. | conformance driver |
| `A2A-08` | C | a2a | A2A | Part III.11 | The adapter converts A2A messages to operation requests and back. | V3 test. | conformance driver |
| `A2A-09` | C | a2a | A2A | Part III.11 | The adapter contains no business logic. | V2 scan; V4 review. | conformance driver |
| `A2A-10` | C | a2a | A2A | Part III.11 | Task cancellation maps to operation cancellation only when the operation supports it; otherwise it returns the operation's conflict/state result. | V3 test. | conformance driver |
| `A2A-11` | C | a2a | A2A | Part III.11 | The adopted A2A security scheme is implemented as declared in the agent card. | V3 protocol test. | conformance driver |
| `A2A-12` | C | a2a | A2A | Part III.11 | Tokens are verified by the shared verifier with the A2A audience. | V3 test. | conformance driver |
| `A2A-13` | C | a2a | A2A | Part III.11 | A token for another interface is rejected. | V3 test. | conformance driver |
| `A2A-14` | C | a2a | A2A | Part III.11 | The adapter does not authorize the target; the operation does. | V3 bypass test. | conformance driver |
| `A2A-15` | C | a2a | A2A | Part III.11 | Secrets and tokens are not written to task state, logs, or errors. | V2 scan; V3 test. | conformance driver |
| `A2A-16` | C | a2a | A2A | Part III.11 | Task updates use the A2A-defined event model, not an ad-hoc envelope. | V3 test. | conformance driver |
| `A2A-17` | C | a2a | A2A | Part III.11 | Streaming termination distinguishes success, failure, and cancellation. | V3 test. | conformance driver |
| `A2A-18` | C | a2a | A2A | Part III.11 | Every operation category has an A2A error mapping. | V3 mapping test. | conformance driver |
| `A2A-19` | C | a2a | A2A | Part III.11 | Error details never contain tokens, secrets, or raw provider responses. | V2 scan; V3 test. | conformance driver |
| `A2A-20` | C | a2a | A2A | Part III.11 | Every task is bound to a `TaskOwner` (subject and tenant); load/save require the owner. | V3 test. | conformance driver |
| `A2A-21` | C | a2a | A2A | Part III.11 | The adapter authorizes protocol-owned task get/cancel/subscribe against the owner; business authorization stays in the operation. | V3 bypass test. | conformance driver |
| `A2A-22` | C | a2a | A2A | Part III.11 | Protocol errors and business execution errors are mapped separately. | V3 test. | conformance driver |
| `A2A-23` | C | a2a | A2A | Part III.11 | `A2aConfig` records the adopted protocol version, transport profile, and capabilities. | V2 config check. | conformance driver |
| `A2A-24` | C | a2a | A2A | Part III.11 | Every task artifact carries the operation's `request_id` in a machine-readable field. | V3 test. | conformance driver |
| `APP-01` | O | all | APP | Part II | A project MUST declare its profiles and MUST list every unimplemented interface as absent. | V2 profile check. | rules coverage check |
| `APP-02` | O | all | APP | Part II | A project MUST maintain an operation catalog using the §11 template. | V3 catalog test. | rules coverage check |
| `APP-03` | O | all | APP | Part II | A project MUST map its crates to §3.1 roles and record the mapping. | V4 review; V2 manifest check. | rules coverage check |
| `APP-04` | O | all | APP | Part II | Exceptions MUST be declared with a reason, scope, owner, and expiry. Undeclared exceptions are defects. | V2 exception check. | rules coverage check |
| `APP-05` | O | all | APP | Part II | This document is versioned. A project pins the version it applies. | V2 lock/check. | rules coverage check |
| `APP-06` | O | all | APP | Part II | Adoption order SHOULD, within the interface profiles a project selects, be: identity-core and identity-jwt → operation authorization and conformance → REST → WebSocket → CLI → gRPC → MCP → A2A. A project MAY select any subset. | V4 review; project plan. | rules coverage check |
| `APP-07` | O | all | APP | Part II | Each adopted rule MUST first have a failing conformance test, then an implementation, then a refactor. | V3 test history; V4 review. | rules coverage check |
| `ARC-01` | C | all | ARC | Part II | Each crate MUST have one primary runtime role from §3.1. Additional roles (`tooling`, `test-support`, `build-support`, `utility`) are allowed when declared in `RULES-PROFILE.toml` with their allowed dependency edges. A crate MUST NOT mix incompatible runtime roles. | V4 review; crate manifest and module layout. | cargo metadata / check-deps |
| `ARC-02` | C | all | ARC | Part II | Dependencies MUST follow `interface-* → *-operation → *-core` and `interface-* → identity-core`. | V2 `cargo metadata` edge check. | cargo metadata / check-deps |
| `ARC-03` | C | all | ARC | Part II | `*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*`, `clap`, or any protocol SDK. | V2 dependency and import scan. | cargo metadata / check-deps |
| `ARC-04` | C | all | ARC | Part II | An interface crate MUST NOT depend on another interface crate. | V2 `cargo metadata` edge check. | cargo metadata / check-deps |
| `ARC-05` | C | all | ARC | Part II | `*-conformance` MAY depend on every public boundary; no runtime crate may depend on `*-conformance`. | V2 `cargo metadata` edge check. | cargo metadata / check-deps |
| `ARC-06` | C | all | ARC | Part II | Only the assembly/binary MAY depend on concrete authentication implementations (`identity-jwt`, `identity-local`, `identity-sso`) and wire them together. | V2 dependency check. | cargo metadata / check-deps |
| `ARC-07` | C | all | ARC | Part II | `*-core` MUST define ports (traits) for external effects; it MUST NOT call infrastructure directly. | V1/V3; review of public traits and tests with fakes. | cargo metadata / check-deps |
| `ARC-08` | C | all | ARC | Part II | `*-operation` MUST depend on `identity-core` traits, never on `identity-jwt` or `identity-sso`. | V2 dependency check. | cargo metadata / check-deps |
| `ARC-09` | C | all | ARC | Part II | Crate names MUST use the project prefix and the role suffix (`doors-core`, `doors-operation`, `doors-rest`, and so on). | V4 review; manifest check. | cargo metadata / check-deps |
| `ARC-10` | C | all | ARC | Part II | Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`. | V4 review. | cargo metadata / check-deps |
| `AUTH-01` | C | all | AUTH | Part II | Token verification MUST be expressed as a protocol-independent `AccessTokenVerifier` trait in `identity-core`. | V1 trait; V2 import scan. | negative-auth suite |
| `AUTH-02` | C | all | AUTH | Part II | Token issuance MUST be expressed as a `TokenIssuer` trait; every login method MUST use this single issuance path. | V1 trait; V3 test. | negative-auth suite |
| `AUTH-03` | C | all | AUTH | Part II | Access tokens MUST be JWS. JWE is not used. | V3 token test. | negative-auth suite |
| `AUTH-04` | C | all | AUTH | Part II | The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile. | V2 config check; V3 negative test. | negative-auth suite |
| `AUTH-05` | C | all | AUTH | Part II | The verifier MUST enforce an explicit algorithm allowlist and MUST reject `none`, unknown algorithms, and algorithm/operation mismatches. | V3 negative tests N-1, N-2, N-3. | negative-auth suite |
| `AUTH-06` | C | all | AUTH | Part II | Tokens MUST contain `iss`, `sub`, `aud`, `exp`, `iat`, and `jti`. `nbf` and `scope` MAY be present. | V3 token test. | negative-auth suite |
| `AUTH-07` | C | all | AUTH | Part II | `sub` MUST be the internal `SubjectId`. | V3 token test. | negative-auth suite |
| `AUTH-08` | C | all | AUTH | Part II | `aud` MUST identify one interface or resource. Wildcard audiences are forbidden. A token for one interface MUST be rejected by another. | V3 audience-isolation test. | negative-auth suite |
| `AUTH-09` | C | all | AUTH | Part II | Access-token lifetime MUST be short and configurable (recommended 5–15 minutes). | V2 config check. | negative-auth suite |
| `AUTH-10` | C | all | AUTH | Part II | Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multiple active public keys MUST be supported for rotation. | V1 trait; V3 rotation test. | negative-auth suite |
| `AUTH-11` | C | all | AUTH | Part II | Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the token. JWKS URLs MUST be fixed by configuration. | V3 negative test N-11. | negative-auth suite |
| `AUTH-12` | C | all | AUTH | Part II | Validation order MUST be: algorithm allowlist → signature → `iss` → `aud` → `exp`/`nbf` → `typ` → `sub` → tenant/delegation → `ver` → `jti`. | V3 instrumented test. | negative-auth suite |
| `AUTH-13` | C | all | AUTH | Part II | Access tokens, ID tokens, and other token types MUST be mutually exclusive by `typ`, required claims, key, and audience. An external ID token MUST NOT be accepted as an access token. | V3 negative test N-9. | negative-auth suite |
| `AUTH-14` | C | all | AUTH | Part II | Revocation MUST be checked after signature validation, using `jti` and/or a user-level token version. Revocation checks MUST NOT replace cryptographic validation. | V3 test. | negative-auth suite |
| `AUTH-15` | C | all | AUTH | Part II | Refresh tokens MUST be opaque random values, stored only as hashes, rotated on every use, and revoked as a session family on reuse detection. | V3 test. | negative-auth suite |
| `AUTH-16` | C | all | AUTH | Part II | Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reasons MUST be logged, never returned. | V3 response test. | negative-auth suite |
| `AUTH-17` | C | all | AUTH | Part II | Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appear in logs, `Debug`, error bodies, or metrics. | V2 log scan; V3 redaction test. | negative-auth suite |
| `AUTH-18` | C | all | AUTH | Part II | Login MUST be an operation (`auth.token.issue` or equivalent). It MUST NOT be a transport-specific router contract in `identity-core`. | V1 type; V2 import scan. | negative-auth suite |
| `AUTH-19` | C | all | AUTH | Part II | Each interface MAY implement its own credential acquisition flow, but all flows MUST end at the same `TokenIssuer`. | V3 test. | negative-auth suite |
| `AUTH-20` | C | all | AUTH | Part II | HS256 is permitted only when all of the following hold: single process, no cross-interface token use, explicit `local-only` profile, key length ≥ 32 bytes. | V2 profile check; V3 negative test. | negative-auth suite |
| `AUTH-21` | C | all | AUTH | Part II | REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401. | V3 test. | negative-auth suite |
| `AUTH-22` | C | all | AUTH | Part II | WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. Long-lived JWT query parameters are forbidden. | V3 test. | negative-auth suite |
| `AUTH-23` | C | all | AUTH | Part II | gRPC MUST read credentials from metadata and map auth failures to `UNAUTHENTICATED` or `PERMISSION_DENIED`. | V3 test. | negative-auth suite |
| `AUTH-24` | C | all | AUTH | Part II | CLI MUST store tokens in an OS-protected store or a `0600` file, never in argv or shell history. | V2 argv scan; V3 test. | negative-auth suite |
| `AUTH-25` | C | all | AUTH | Part II | CLI local execution MUST establish an explicit principal and MUST NOT grant implicit administrator rights. | V3 test. | negative-auth suite |
| `AUTH-26` | C | all | AUTH | Part II | MCP MUST implement the authentication discovery/challenge required by the adopted MCP specification, and MUST NOT pass a received token through to a downstream API. | V3 protocol test. | negative-auth suite |
| `AUTH-27` | C | all | AUTH | Part II | A2A MUST implement the security mechanism required by the adopted A2A specification. | V3 protocol test. | negative-auth suite |
| `AUTH-28` | C | all | AUTH | Part II | Authentication requirement (`Required`/`Anonymous`) MUST be separate from scope. Anonymous operations use `AnonymousOperation` and never receive a `VerifiedIdentity`. | V1 type; V3 test. | negative-auth suite |
| `AUTH-29` | C | all | AUTH | Part II | `VerifiedIdentity` MUST carry the credential binding: interface, audience, method, authentication time, expiry, token ID, and token version. The dispatcher MUST reject a binding mismatch. | V1 type; V3 test. | negative-auth suite |
| `AUTH-30` | C | all | AUTH | Part II | A session ticket and a local identity issuer MUST create a new binding. A token or identity verified for one interface/audience MUST NOT be reused for another. | V3 test. | negative-auth suite |
| `AUTH-31` | C | all | AUTH | Part II | Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST reject an unauthorized actor or an excessive scope set. | V3 test. | negative-auth suite |
| `AUTHZ-01` | C | all | AUTHZ | Part II | Authorization MUST be expressed as `Authorizer::require(identity, action, resource)`. | V1 trait; V4 review. | negative-auth suite |
| `AUTHZ-02` | C | all | AUTHZ | Part II | Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked. | V3 test. | negative-auth suite |
| `AUTHZ-03` | C | all | AUTHZ | Part II | Tenant and owner checks MUST use the identity and the loaded resource, not request-supplied IDs. | V3 cross-tenant test. | negative-auth suite |
| `AUTHZ-04` | C | all | AUTHZ | Part II | Anonymous operations MUST be explicitly declared. `Option<Identity>` must not be used to express "maybe anonymous". | V1 type; V3 test. | negative-auth suite |
| `AUTHZ-05` | C | all | AUTHZ | Part II | A target in another tenant MUST return not-found. A target in the caller's tenant with insufficient rights MUST return permission-denied. | V3 test. | negative-auth suite |
| `AUTHZ-06` | C | all | AUTHZ | Part II | Scope strings MUST NOT be compared in handlers or adapters; policy belongs in one authorizer implementation. | V2 string scan; V4 review. | negative-auth suite |
| `AUTHZ-07` | C | all | AUTHZ | Part II | Authorization and mutation races MUST be handled with a transaction or a conditional update. | V3 race test. | negative-auth suite |
| `AUTHZ-08` | C | all | AUTHZ | Part II | An interface-level pre-check MAY exist, but it MUST NOT replace the operation-level authorization. | V3 bypass test. | negative-auth suite |
| `AUTHZ-09` | C | all | AUTHZ | Part II | The same identity, action, and resource MUST produce the same authorization result through every interface. | V3 conformance test. | negative-auth suite |
| `BP-01` | C | all | BP | Part III.18 | This blueprint is the mandatory implementation method for validation and documentation. An alternate method requires a versioned exception. | V4 review; V2 config check. | blueprint review + docgen --check all |
| `BP-02` | C | all | BP | Part III.18 | Every request type uses `#[contract::input]` and implements `ContractValidate`. | V1 bound; V3 test. | blueprint review + docgen --check all |
| `BP-03` | C | all | BP | Part III.18 | The macro emits the validator, descriptor, schema registration, and inventory entries described in §3. | V3 test. | blueprint review + docgen --check all |
| `BP-04` | C | all | BP | Part III.18 | `Operation::Request` has a `ContractValidate` bound. `validate_json` runs before the idempotency claim; `prepare_validated` runs only on the acquired branch; replay calls `replay_authorize` only. | V1/V3. | blueprint review + docgen --check all |
| `BP-05` | C | all | BP | Part III.18 | `validation-contract` owns the runtime types and `inventory` registrations in §2. | V2 check. | blueprint review + docgen --check all |
| `BP-06` | C | all | BP | Part III.18 | Rule parameters are const-friendly and serialized to the exact JSON format in §4.2. | V3 schema test. | blueprint review + docgen --check all |
| `BP-07` | C | all | BP | Part III.18 | `*-docgen` provides the four subcommands in §4.1 and depends on the operation crate to link registrations. | V3 test. | blueprint review + docgen --check all |
| `BP-08` | C | all | BP | Part III.18 | The schema registry is authoritative for all interfaces; `utoipa` output is compared, not used as the only source. | V3 diff test. | blueprint review + docgen --check all |
| `BP-09` | C | all | BP | Part III.18 | Completeness, English, secrets, and determinism checks follow §4.4 and the exit codes. | V3 test. | blueprint review + docgen --check all |
| `BP-10` | G | all | BP | Part III.18 | Generated documentation is written atomically and sorted deterministically. | V3 test. | blueprint review + docgen --check all |
| `BP-11` | C | all | BP | Part III.18 | A missing operation/interface/field/rule/description fails the build. | V3 test. | blueprint review + docgen --check all |
| `BP-12` | C | all | BP | Part III.18 | Custom rules require `id`, `check`, `fields`, `description`, and `code`; conditional rules require `when`. | V1/V3. | blueprint review + docgen --check all |
| `BP-13` | C | all | BP | Part III.18 | Unknown or type-incompatible rules fail compilation with a span. | V3 compile-fail test. | blueprint review + docgen --check all |
| `BP-14` | C | all | BP | Part III.18 | No adapter implements interface-specific input validation. | V2 scan; V3 test. | blueprint review + docgen --check all |
| `BP-15` | C | all | BP | Part III.18 | Documentation is English-only; non-English prose fails the English check. | V3 test. | blueprint review + docgen --check all |
| `BP-16` | C | all | BP | Part III.18 | Documentation and examples contain no secrets. | V3 test. | blueprint review + docgen --check all |
| `BP-17` | C | all | BP | Part III.18 | Documentation records `spec_version` and input digests. | V3 test. | blueprint review + docgen --check all |
| `BP-18` | C | all | BP | Part III.18 | REST is not required for schema dump or docgen; a non-REST project uses the same subcommands. | V3 test. | blueprint review + docgen --check all |
| `BP-19` | G | all | BP | Part III.18 | Generated files carry the generated marker and are never hand-edited. | V2 scan. | blueprint review + docgen --check all |
| `BP-20` | C | all | BP | Part III.18 | A feature that cannot follow the blueprint requires an amendment to this document, not a project fork. | V4 review. | blueprint review + docgen --check all |
| `CLI-01` | G | cli | CLI | Part III.8 | Argument types are generated separately from operation types. Clap attributes never appear on operation structs. | V1; V2 derive scan. | conformance driver |
| `CLI-02` | C | cli | CLI | Part III.8 | Every catalog operation has one subcommand. | V3 catalog test. | conformance driver |
| `CLI-03` | C | cli | CLI | Part III.8 | A composition command is allowed only when documented and mapped to a sequence of operations. | V3 test. | conformance driver |
| `CLI-04` | C | cli | CLI | Part III.8 | The command converts arguments into the operation request and calls the dispatcher. | V3 test. | conformance driver |
| `CLI-05` | C | cli | CLI | Part III.8 | Data goes to stdout; progress and diagnostics go to stderr. | V3 test. | conformance driver |
| `CLI-06` | C | cli | CLI | Part III.8 | `--json` emits one JSON value; `--jsonl` emits one JSON object per line. | V3 test. | conformance driver |
| `CLI-07` | C | cli | CLI | Part III.8 | Human output is not parsed by scripts; JSON is the machine contract. | V4 review. | conformance driver |
| `CLI-08` | C | cli | CLI | Part III.8 | Exit codes follow the fixed table. | V3 test. | conformance driver |
| `CLI-09` | C | cli | CLI | Part III.8 | Secrets are read from a file, stdin, or TTY. | V2 argv scan; V3 test. | conformance driver |
| `CLI-10` | C | cli | CLI | Part III.8 | A secret in argv is rejected before any operation. | V3 test. | conformance driver |
| `CLI-11` | C | cli | CLI | Part III.8 | Secrets are never written to stdout, logs, or error messages. | V2 scan; V3 redaction test. | conformance driver |
| `CLI-12` | C | cli | CLI | Part III.8 | Token files are checked for restrictive permissions. | V3 test. | conformance driver |
| `CLI-13` | C | cli | CLI | Part III.8 | JSON/JSONL output includes the operation's `request_id`. | V3 test. | conformance driver |
| `CLI-14` | C | cli | CLI | Part III.8 | The remote client is a protocol client, not an interface-adapter dependency. | V2 dependency check. | conformance driver |
| `CONF-01` | P | conformance | CONF | Part III.12 | Every catalog operation appears in the matrix. | V3 matrix test. | cargo test -p <project>-conformance |
| `CONF-02` | P | conformance | CONF | Part III.12 | Every implemented interface has a driver. | V3 test. | cargo test -p <project>-conformance |
| `CONF-03` | P | conformance | CONF | Part III.12 | Every cell is required or not applicable with a reason. | V3 test. | cargo test -p <project>-conformance |
| `CONF-04` | P | conformance | CONF | Part III.12 | A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell. | V3 test. | cargo test -p <project>-conformance |
| `CONF-05` | P | conformance | CONF | Part III.12 | Every case names a fixture with setup and reset. | V3 test. | cargo test -p <project>-conformance |
| `CONF-06` | P | conformance | CONF | Part III.12 | IDs and time are deterministic in fixtures. | V3 test. | cargo test -p <project>-conformance |
| `CONF-07` | P | conformance | CONF | Part III.12 | Generated IDs and timestamps use semantic matchers, not exact equality. | V3 test. | cargo test -p <project>-conformance |
| `CONF-08` | P | conformance | CONF | Part III.12 | A case must not depend on the order of another case. | V3 test. | cargo test -p <project>-conformance |
| `CONF-09` | P | conformance | CONF | Part III.12 | A mutation case must assert the resulting state, not only the response. | V3 test. | cargo test -p <project>-conformance |
| `CONF-10` | P | conformance | CONF | Part III.12 | Expected results are derived from the operation specification, not from one interface. | V3 review of oracle source. | cargo test -p <project>-conformance |
| `CONF-11` | P | conformance | CONF | Part III.12 | All interfaces answering the same wrong result is a failure. | V3 test. | cargo test -p <project>-conformance |
| `CONF-12` | P | conformance | CONF | Part III.12 | The oracle covers normal, failure, state, authorization, idempotency, and streaming. | V3 test. | cargo test -p <project>-conformance |
| `CONF-13` | P | conformance | CONF | Part III.12 | Every required interface rejects a token for another audience. | V3 test. | cargo test -p <project>-conformance |
| `CONF-14` | P | conformance | CONF | Part III.12 | An identity with a mismatched interface or audience binding is rejected. | V3 test. | cargo test -p <project>-conformance |
| `CONF-15` | P | conformance | CONF | Part III.12 | An expired binding is rejected even when the signature is valid. | V3 test. | cargo test -p <project>-conformance |
| `CONF-16` | P | conformance | CONF | Part III.12 | A session ticket creates a new binding; the ticket redemption deadline and connection expiry are distinct. | V3 test. | cargo test -p <project>-conformance |
| `CONF-17` | P | conformance | CONF | Part III.12 | Delegation preserves `actor` and `on_behalf_of` and rejects unauthorized delegation. | V3 test. | cargo test -p <project>-conformance |
| `CONF-18` | P | conformance | CONF | Part III.12 | Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation. | V3 test. | cargo test -p <project>-conformance |
| `CONF-19` | P | conformance | CONF | Part III.12 | No interface can bypass operation authorization. | V3 test. | cargo test -p <project>-conformance |
| `CONF-20` | P | conformance | CONF | Part III.12 | An adapter cannot construct `VerifiedIdentity`. | V1; V3. | cargo test -p <project>-conformance |
| `CONF-21` | P | conformance | CONF | Part III.12 | The trusted constructor is not reachable from adapter crates; allowed call sites are audited. | V2 scan; V4 review. | cargo test -p <project>-conformance |
| `CONF-22` | P | conformance | CONF | Part III.12 | A compile-fail test is not treated as a general proof of non-bypass. | V4 review. | cargo test -p <project>-conformance |
| `CONF-23` | P | conformance | CONF | Part III.12 | Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are authorized by the adapter; business resources are not. | V3 test. | cargo test -p <project>-conformance |
| `CONF-24` | P | conformance | CONF | Part III.12 | Concurrent claims for the same namespace and key produce one execution. | V3 concurrency test. | cargo test -p <project>-conformance |
| `CONF-25` | P | conformance | CONF | Part III.12 | A replay re-authorizes before returning the stored result. | V3 test. | cargo test -p <project>-conformance |
| `CONF-26` | P | conformance | CONF | Part III.12 | Same key with a different canonical request returns conflict. | V3 test. | cargo test -p <project>-conformance |
| `CONF-27` | P | conformance | CONF | Part III.12 | A crash after business commit but before publication is recovered; the event is not lost. | V3 crash test. | cargo test -p <project>-conformance |
| `CONF-28` | P | conformance | CONF | Part III.12 | Irreversible effects follow the declared recovery policy. | V3 test. | cargo test -p <project>-conformance |
| `CONF-29` | P | conformance | CONF | Part III.12 | No unrelated external API wait occurs inside a database transaction; transaction-required DB communication is allowed. | V2 architecture scan; V3 test. | cargo test -p <project>-conformance |
| `CONF-30` | P | conformance | CONF | Part III.12 | Server stream items, EOF, error, and cancel match the operation contract. | V3 test. | cargo test -p <project>-conformance |
| `CONF-31` | P | conformance | CONF | Part III.12 | Client stream input, EOF, and cancel match the contract. | V3 test. | cargo test -p <project>-conformance |
| `CONF-32` | P | conformance | CONF | Part III.12 | Bidi streams preserve independent half-close and cancellation. | V3 test. | cargo test -p <project>-conformance |
| `CONF-33` | P | conformance | CONF | Part III.12 | Backpressure is observable and bounded. | V3 load test. | cargo test -p <project>-conformance |
| `CONF-34` | P | conformance | CONF | Part III.12 | A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient. | V3 test. | cargo test -p <project>-conformance |
| `CONF-35` | P | conformance | CONF | Part III.12 | TLS, real upgrade, and CLI process boundaries are covered out-of-process. | V3 test. | cargo test -p <project>-conformance |
| `CONF-36` | P | conformance | CONF | Part III.12 | A driver that cannot exercise a required boundary reports `Fail`, not `NotApplicable`. | V3 test. | cargo test -p <project>-conformance |
| `CONF-37` | P | conformance | CONF | Part III.12 | The crate graph passes the forbidden-edge checks. | V2 `cargo metadata`. | cargo test -p <project>-conformance |
| `CONF-38` | P | conformance | CONF | Part III.12 | Every rule ID in the registry has a verdict. | V3 rule-coverage test. | cargo test -p <project>-conformance |
| `CONF-39` | P | conformance | CONF | Part III.12 | A missing verification is a failure, not a skip. | V3 test. | cargo test -p <project>-conformance |
| `CONF-40` | P | conformance | CONF | Part III.12 | Documentation, file existence, and fixture names are not proof. | V3 report inspection; V4 review. | cargo test -p <project>-conformance |
| `CONF-41` | P | conformance | CONF | Part III.12 | The report names every failed row and every rule without evidence. | V3 test. | cargo test -p <project>-conformance |
| `CONF-42` | P | conformance | CONF | Part III.12 | After SSO is added, existing operation signatures, subject IDs, and business data references are unchanged. | V3 regression test. | cargo test -p <project>-conformance |
| `CONF-43` | P | conformance | CONF | Part III.12 | An external ID token is rejected as an access token on every interface. | V3 test. | cargo test -p <project>-conformance |
| `CONF-44` | P | conformance | CONF | Part III.12 | An internal access token is rejected as an external ID token. | V3 test. | cargo test -p <project>-conformance |
| `CONF-45` | P | conformance | CONF | Part III.12 | A stream started through an adapter reaches the Dispatcher stream API and delivers items, EOF, and cancel. | V3 test. | cargo test -p <project>-conformance |
| `CONF-46` | P | conformance | CONF | Part III.12 | An expired lease owner cannot complete or commit after a new owner acquires the claim. | V3 test. | cargo test -p <project>-conformance |
| `CONF-47` | P | conformance | CONF | Part III.12 | A replay after a successful delete, create, or approve returns the stored result with current authorization, not a state-precondition error. | V3 test. | cargo test -p <project>-conformance |
| `CONF-48` | P | conformance | CONF | Part III.12 | Same-transaction completion, business mutation, and outbox intent are atomic; a crash after commit recovers both the result and the event. | V3 crash test. | cargo test -p <project>-conformance |
| `CONF-49` | P | conformance | CONF | Part III.12 | REST merges body context and header context, rejects conflicts, and returns `request_id` on success and on every failure path. | V3 test. | cargo test -p <project>-conformance |
| `CONF-50` | P | conformance | CONF | Part III.12 | A long-lived WebSocket connection observes revocation within the configured maximum staleness. | V3 test. | cargo test -p <project>-conformance |
| `CONF-51` | P | conformance | CONF | Part III.12 | Result lookup is authorized by the recorded subject, tenant, or an authorized operator; a bare request ID is insufficient. | V3 test. | cargo test -p <project>-conformance |
| `CONF-52` | P | conformance | CONF | Part III.12 | Refresh consumes the current generation and creates the next generation in one transaction; family history and reuse behavior match the declared policy. | V3 test. | cargo test -p <project>-conformance |
| `CONF-53` | P | conformance | CONF | Part III.12 | Every implemented interface has generated documentation and every applicable operation has a section. | V3 test. | cargo test -p <project>-conformance |
| `CONF-54` | P | conformance | CONF | Part III.12 | Documentation completeness, English-only, and secret-free gates pass. | V3 test. | cargo test -p <project>-conformance |
| `CONF-55` | P | conformance | CONF | Part III.12 | Documentation generation is deterministic for the same inputs and version. | V3 digest test. | cargo test -p <project>-conformance |
| `CONF-56` | P | conformance | CONF | Part III.12 | A project without the REST profile still generates documentation for its implemented interfaces. | V3 test. | cargo test -p <project>-conformance |
| `CONF-57` | P | conformance | CONF | Part III.12 | Every request uses the generated validator, and the same input produces the same validation result through every interface. | V3 test. | cargo test -p <project>-conformance |
| `CONF-58` | P | conformance | CONF | Part III.12 | Standard constraints map to schema keywords; byte-length and non-ECMA regex rules are custom and not mis-mapped. | V3 test. | cargo test -p <project>-conformance |
| `CONF-59` | P | conformance | CONF | Part III.12 | Every custom rule has `id`, `check`, `fields`, `description`, and `code`, and appears in every applicable interface reference. | V3 test. | cargo test -p <project>-conformance |
| `CONF-60` | P | conformance | CONF | Part III.12 | Unknown or type-incompatible rules fail compilation; no rule is silently omitted. | V3 compile-fail test. | cargo test -p <project>-conformance |
| `CONF-61` | P | conformance | CONF | Part III.12 | Every request uses the macro; the validator, descriptor, schema registration, and inventory entries are present. | V3 test. | cargo test -p <project>-conformance |
| `CONF-62` | P | conformance | CONF | Part III.12 | `*-docgen` implements the four subcommands and both registry dumps; the operation crate is linked. | V3 test. | cargo test -p <project>-conformance |
| `CONF-63` | P | conformance | CONF | Part III.12 | Completeness, English, secret, and determinism checks match the blueprint and exit codes. | V3 test. | cargo test -p <project>-conformance |
| `CONF-64` | P | conformance | CONF | Part III.12 | No alternate validation/documentation method is used without a versioned exception. | V2 config check; V4 review. | cargo test -p <project>-conformance |
| `CONF-65` | P | conformance | CONF | Part III.12 | Generated validation runs before the idempotency claim for both replay and new requests; replay calls `replay_authorize` and not `prepare`. | V3 test. | cargo test -p <project>-conformance |
| `CORE-01` | C | all | CORE | Part III.3 | Every aggregate with a lifecycle has one root type and one state enum. Value objects and stateless aggregates are exempt. | V1 types; V4 review. | cargo test -p <project>-operation/core |
| `CORE-02` | C | all | CORE | Part III.3 | Illegal states are unrepresentable. A state transition returns `Result<NextState, DomainError>`. | V1; V3 transition tests. | cargo test -p <project>-operation/core |
| `CORE-03` | C | all | CORE | Part III.3 | Value objects validate on construction. | V3 test. | cargo test -p <project>-operation/core |
| `CORE-04` | C | all | CORE | Part III.3 | IDs are typed newtypes; a raw `u64` or `Uuid` is not used as an entity ID across boundaries. | V1. | cargo test -p <project>-operation/core |
| `CORE-05` | C | all | CORE | Part III.3 | Time is injected through `Clock`; `Utc::now()` is forbidden in core. | V2 scan; V3 test. | cargo test -p <project>-operation/core |
| `CORE-06` | C | all | CORE | Part III.3 | Randomness and ID allocation go through `IdGenerator`. | V2 scan; V3 test. | cargo test -p <project>-operation/core |
| `CORE-07` | C | all | CORE | Part III.3 | Domain errors are typed and carry a stable code. | V1; V3 test. | cargo test -p <project>-operation/core |
| `CORE-08` | C | all | CORE | Part III.3 | Core does not perform I/O. | V2 import scan. | cargo test -p <project>-operation/core |
| `CORE-09` | C | all | CORE | Part III.3 | Core does not serialize wire envelopes or know protocol status codes. | V2 scan. | cargo test -p <project>-operation/core |
| `CORE-10` | C | all | CORE | Part III.3 | Domain events are values; publication happens outside core. | V1; V3 test. | cargo test -p <project>-operation/core |
| `DOC-01` | G | docs | DOC | Part III.16 | Every implemented interface MUST have generated usage documentation. | V2 artifact check; V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-02` | C | docs | DOC | Part III.16 | The operation catalog is the authoritative operation list and binding map. | V3 catalog test. | cargo run -p <project>-docgen -- --check all |
| `DOC-03` | C | docs | DOC | Part III.16 | The generator MUST consume a neutral schema registry, not parse Rust source. | V2 scan; V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-04` | C | docs | DOC | Part III.16 | `utoipa`/OpenAPI MAY be used as a schema source and REST output, but MUST NOT be the only source for non-REST interfaces. | V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-05` | C | docs | DOC | Part III.16 | Interface-specific documentation MUST come from interface bindings, not be inferred from REST. | V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-06` | G | docs | DOC | Part III.16 | Documentation generation MUST NOT require a running REST server or REST adapter. | V2/V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-07` | C | docs | DOC | Part III.16 | Every operation section MUST include schema, examples, auth, errors, idempotency, streaming, authorization, and conformance ID. | V3 completeness test. | cargo run -p <project>-docgen -- --check all |
| `DOC-08` | C | docs | DOC | Part III.16 | Every implemented interface MUST have a reference section for every applicable operation. | V3 matrix test. | cargo run -p <project>-docgen -- --check all |
| `DOC-09` | G | docs | DOC | Part III.16 | OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references. | V3 diff test. | cargo run -p <project>-docgen -- --check all |
| `DOC-10` | C | docs | DOC | Part III.16 | A missing operation, interface, field, error category, auth statement, or example MUST fail the build. | V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-11` | G | docs | DOC | Part III.16 | Generated documentation MUST be English-only; a non-English string fails the build. | V2 scan; V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-12` | G | docs | DOC | Part III.16 | Generation MUST be deterministic for the same inputs and version. | V3 digest test. | cargo run -p <project>-docgen -- --check all |
| `DOC-13` | C | docs | DOC | Part III.16 | Documentation and examples MUST NOT contain secrets, tokens, or passwords. | V2 scan; V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-14` | C | docs | DOC | Part III.16 | Documentation MUST record `spec_version` and the input digest. | V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-15` | G | docs | DOC | Part III.16 | Documentation generation MUST be part of CI/conformance; a missing artifact fails the gate. | V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-16` | C | docs | DOC | Part III.16 | Input constraints MUST be documented from the `ValidationDescriptor`, not from a hand-written list or inferred code. | V2 scan; V3 test. | cargo run -p <project>-docgen -- --check all |
| `DOC-17` | C | docs | DOC | Part III.16 | Custom validation rules MUST appear as readable English text in every applicable interface reference. | V3 test. | cargo run -p <project>-docgen -- --check all |
| `ERR-01` | C | all | ERR | Part II | Operations MUST return a protocol-independent error value with `code`, `domain`, `retryable`, and optional structured details. | V1 type. | mapping / redaction / audit tests |
| `ERR-02` | C | all | ERR | Part II | Error codes MUST be stable identifiers; adapters MUST map them to protocol statuses. | V3 mapping test. | mapping / redaction / audit tests |
| `ERR-03` | C | all | ERR | Part II | Error values MUST NOT contain secrets, tokens, passwords, or raw provider responses. | V2 scan; V3 redaction test. | mapping / redaction / audit tests |
| `ERR-04` | C | all | ERR | Part II | Retryability MUST be explicit. Validation and authentication errors are not retryable. | V3 test. | mapping / redaction / audit tests |
| `ERR-05` | C | all | ERR | Part II | Each interface MUST have one error-mapping table and one test per code. | V3 coverage test. | mapping / redaction / audit tests |
| `GRPC-01` | G | grpc | GRPC | Part III.9 | The proto is generated from the catalog and checked in. | V2 diff. | conformance driver |
| `GRPC-02` | C | grpc | GRPC | Part III.9 | Field numbers are never reused. Removed numbers are `reserved`. | V2 schema check. | conformance driver |
| `GRPC-03` | C | grpc | GRPC | Part III.9 | Scalars that need presence are declared `optional`. | V2 schema check. | conformance driver |
| `GRPC-04` | C | grpc | GRPC | Part III.9 | `Context` uses the fixed field numbers from Part III.2 §8.1. | V2 schema check. | conformance driver |
| `GRPC-05` | G | grpc | GRPC | Part III.9 | Generated protobuf types do not appear in `*-core` or `*-operation`. | V2 scan. | conformance driver |
| `GRPC-06` | C | grpc | GRPC | Part III.9 | Credentials come from gRPC metadata, not from the message body. | V3 test. | conformance driver |
| `GRPC-07` | C | grpc | GRPC | Part III.9 | Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`. | V3 test. | conformance driver |
| `GRPC-08` | C | grpc | GRPC | Part III.9 | The adapter does not construct `VerifiedIdentity`. | V1; V3 compile-fail. | conformance driver |
| `GRPC-09` | C | grpc | GRPC | Part III.9 | The interceptor does not authorize the target; the operation does. | V3 bypass test. | conformance driver |
| `GRPC-10` | C | grpc | GRPC | Part III.9 | Every category maps to the status above. | V3 mapping test. | conformance driver |
| `GRPC-11` | C | grpc | GRPC | Part III.9 | Rich details are encoded as `google.rpc.Status` details or the JSON detail field; they never contain secrets. | V3 redaction test. | conformance driver |
| `GRPC-12` | C | grpc | GRPC | Part III.9 | The request deadline is propagated into `WireContext`. | V3 test. | conformance driver |
| `GRPC-13` | C | grpc | GRPC | Part III.9 | `U` maps to unary; `S`, `C`, `B` map to the corresponding stream. | V3 test. | conformance driver |
| `GRPC-14` | C | grpc | GRPC | Part III.9 | Client cancellation cancels the operation when the operation supports it; otherwise the result is queryable by request ID. | V3 test. | conformance driver |
| `GRPC-15` | C | grpc | GRPC | Part III.9 | Message size and keepalive limits are configured. | V3 load test. | conformance driver |
| `GRPC-16` | C | grpc | GRPC | Part III.9 | Transport uses TLS outside loopback-only local mode. | V2 config check. | conformance driver |
| `GRPC-17` | C | grpc | GRPC | Part III.9 | Every reply message carries the operation's `request_id`. | V3 test. | conformance driver |
| `GRPC-18` | C | grpc | GRPC | Part III.9 | Typed protobuf messages are the gRPC binding; the universal JSON-bytes envelope is not required. | V3 contract test. | conformance driver |
| `GRPC-19` | C | grpc | GRPC | Part III.9 | A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient. | V3 test. | conformance driver |
| `ID-01` | C | all | ID | Part II | `SubjectId` MUST be an internal, immutable identifier. Email addresses and external provider IDs MUST NOT be used as `sub`. | V1 newtype; V3 token test. | rules coverage check |
| `ID-02` | C | all | ID | Part II | Operations MUST receive exactly one identity type: `VerifiedIdentity`. A duplicate `Principal` type is forbidden. | V2 type scan; V4 review. | rules coverage check |
| `ID-03` | C | all | ID | Part II | `VerifiedIdentity` MUST be constructible only by the verifier. Fields MUST be private; the constructor MUST be `pub(crate)` or equivalent. | V1 visibility; V3 compile-fail test. | rules coverage check |
| `ID-04` | C | all | ID | Part II | `VerifiedIdentity` MUST NOT implement `Deserialize` or any public constructor. | V1; V3 compile-fail test. | rules coverage check |
| `ID-05` | C | all | ID | Part II | Delegated execution MUST distinguish the actor from the subject: `actor` and `on_behalf_of` MUST be separate fields. | V1 type; V3 test. | rules coverage check |
| `ID-06` | C | all | ID | Part II | Operations MUST NOT receive a raw JWT, `iss`, external account ID, or provider name. | V2 import/type scan. | rules coverage check |
| `IDN-07` | O/C | auth-jwt | IDN | Part III.5 | Refresh tokens are opaque random values, not JWTs. | V3 test. | negative-auth suite |
| `IDN-08` | O/C | auth-jwt | IDN | Part III.5 | Only a hash is stored. | V3 DB test. | negative-auth suite |
| `IDN-09` | O/C | auth-jwt | IDN | Part III.5 | Every use consumes and rotates the token atomically. | V3 concurrency test. | negative-auth suite |
| `IDN-10` | O/C | auth-jwt | IDN | Part III.5 | Reuse of a consumed token revokes the session family. | V3 test. | negative-auth suite |
| `IDN-11` | O/C | auth-jwt | IDN | Part III.5 | Sessions are independent of the login method. | V2 schema check. | negative-auth suite |
| `IDN-12` | O/C | auth-jwt | IDN | Part III.5 | `users.token_version` is included in claims as `ver` and checked. | V3 test. | negative-auth suite |
| `IDN-13` | O/C | auth-jwt | IDN | Part III.5 | Consume and next-generation insert happen in one transaction; `(family_id, generation)` is unique. | V3 concurrency test. | negative-auth suite |
| `IDN-14` | O/C | auth-jwt | IDN | Part III.5 | The loser of concurrent refresh receives `invalid_grant`; idempotent grace requires an encrypted replacement cache, not a hash-only record. | V3 test. | negative-auth suite |
| `IDN-15` | O/C | auth-jwt | IDN | Part III.5 | SSO lives in `identity-sso`. | V2 dependency check. | negative-auth suite |
| `IDN-16` | O/C | auth-jwt | IDN | Part III.5 | OIDC uses Authorization Code + PKCE S256. | V3 test. | negative-auth suite |
| `IDN-17` | O/C | auth-jwt | IDN | Part III.5 | `state` and `nonce` are per-request, session-bound, single-use. | V3 test. | negative-auth suite |
| `IDN-18` | O/C | auth-jwt | IDN | Part III.5 | Redirect URIs match exactly. | V3 test. | negative-auth suite |
| `IDN-19` | O/C | auth-jwt | IDN | Part III.5 | External `iss` is validated per provider. | V3 test. | negative-auth suite |
| `IDN-20` | O/C | auth-jwt | IDN | Part III.5 | External ID tokens are discarded after verification. | V2 scan; V3 test. | negative-auth suite |
| `IDN-21` | O/C | auth-jwt | IDN | Part III.5 | SSO output is `AuthenticatedUser`; `TokenIssuer` issues the internal token. | V3 test. | negative-auth suite |
| `IDN-22` | O/C | auth-jwt | IDN | Part III.5 | External accounts use `(issuer, subject)`. | V3 test. | negative-auth suite |
| `IDN-23` | O/C | auth-jwt | IDN | Part III.5 | No automatic email-based linking. | V3 test. | negative-auth suite |
| `IDN-24` | O/C | auth-jwt | IDN | Part III.5 | Provider secrets come from configuration. | V2 secret scan. | negative-auth suite |
| `IF-01` | C | all | IF | Part II | An adapter MUST only: extract credentials, convert input, call the verifier, call the operation, convert output, and map errors. | V4 review; V2 business-logic scan. | rules coverage check |
| `IF-02` | C | all | IF | Part II | An adapter MUST NOT implement business rules, authorization policy, or persistence. | V2 import scan; V4 review. | rules coverage check |
| `IF-03` | C | all | IF | Part II | Credential extraction MUST be adapter-specific; verification MUST call the shared `AccessTokenVerifier`. | V2 import scan; V3 test. | rules coverage check |
| `IF-04` | C | all | IF | Part II | Protocol errors MUST be mapped from the protocol-independent error vocabulary. Adapters MUST NOT invent operation errors. | V3 mapping test. | rules coverage check |
| `IF-05` | C | all | IF | Part II | Every implemented interface MUST expose every operation unless the operation is explicitly declared not applicable, with a reason. | V3 matrix test. | rules coverage check |
| `IF-06` | C | all | IF | Part II | No interface may call another interface to reach an operation. | V2 dependency check. | rules coverage check |
| `IF-07` | C | all | IF | Part II | Protocol state (connection, subscription, task, stream) MUST remain in the adapter or in `*-operation` state, never duplicated in both. | V4 review; V3 state test. | rules coverage check |
| `IF-08` | C | all | IF | Part II | Every response MUST carry the operation's `request_id`; streaming messages MUST carry a correlation identifier. | V3 test. | rules coverage check |
| `MCP-01` | C | mcp | MCP | Part III.10 | Every applicable catalog operation has one MCP tool. | V3 catalog test. | conformance driver |
| `MCP-02` | C | mcp | MCP | Part III.10 | The tool name is `operation_id` with `.` replaced by `_`, optionally prefixed. | V3 test. | conformance driver |
| `MCP-03` | G | mcp | MCP | Part III.10 | The tool input schema is generated from the operation request. | V3 schema test. | conformance driver |
| `MCP-04` | G | mcp | MCP | Part III.10 | The tool output schema is generated from the operation response. | V3 schema test. | conformance driver |
| `MCP-05` | C | mcp | MCP | Part III.10 | The tool handler converts input, calls the dispatcher, and maps the result. | V3 test. | conformance driver |
| `MCP-06` | C | mcp | MCP | Part III.10 | The tool handler contains no business logic. | V2 scan; V4 review. | conformance driver |
| `MCP-07` | C | mcp | MCP | Part III.10 | Authorization server metadata is exposed at the configured discovery endpoint. | V3 protocol test. | conformance driver |
| `MCP-08` | C | mcp | MCP | Part III.10 | Protected resource metadata identifies this MCP server as the audience. | V3 test. | conformance driver |
| `MCP-09` | C | mcp | MCP | Part III.10 | Unauthenticated requests receive the spec-required challenge. | V3 test. | conformance driver |
| `MCP-10` | C | mcp | MCP | Part III.10 | Tokens are verified by the shared `AccessTokenVerifier` with the MCP audience. | V3 test. | conformance driver |
| `MCP-11` | C | mcp | MCP | Part III.10 | A received token MUST NOT be passed through to a downstream API. | V2 scan; V3 test. | conformance driver |
| `MCP-12` | C | mcp | MCP | Part III.10 | The adapter does not authorize the target; the operation does. | V3 bypass test. | conformance driver |
| `MCP-13` | C | mcp | MCP | Part III.10 | Every operation category has an MCP mapping. | V3 mapping test. | conformance driver |
| `MCP-14` | C | mcp | MCP | Part III.10 | Error details never contain tokens, secrets, or raw provider responses. | V2 scan; V3 test. | conformance driver |
| `MCP-15` | C | mcp | MCP | Part III.10 | MCP session state lives in the adapter, not in business tables. | V2 schema review. | conformance driver |
| `MCP-16` | C | mcp | MCP | Part III.10 | Business state is read and written only through operations. | V2 scan; V3 test. | conformance driver |
| `MCP-17` | C | mcp | MCP | Part III.10 | Resource and prompt surfaces that expose business data MUST read through a query operation; adapter-owned protocol metadata is the only exception. | V3 test. | conformance driver |
| `MCP-18` | C | mcp | MCP | Part III.10 | Protocol errors and business execution errors are mapped separately; a protocol failure is not reported as an operation error and vice versa. | V3 test. | conformance driver |
| `MCP-19` | C | mcp | MCP | Part III.10 | `McpConfig` records the adopted protocol version, transport profile, and capabilities. | V2 config check. | conformance driver |
| `MCP-20` | C | mcp | MCP | Part III.10 | The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions) but never business resources. | V3 bypass test. | conformance driver |
| `MCP-21` | C | mcp | MCP | Part III.10 | Every tool result carries the operation's `request_id` in a machine-readable field. | V3 test. | conformance driver |
| `OBS-01` | C | all | OBS | Part II | Logs MUST be structured and include `request_id`, `operation_id`, `subject`, result, and duration. | V3 log test. | mapping / redaction / audit tests |
| `OBS-02` | C | all | OBS | Part II | Logs MUST NOT include tokens, secrets, authorization codes, or passwords. | V2 scan; V3 test. | mapping / redaction / audit tests |
| `OBS-03` | C | all | OBS | Part II | Metrics MUST cover operation latency, error rate, authentication failures, and audience rejections. | V2 metric inventory. | mapping / redaction / audit tests |
| `OBS-04` | C | all | OBS | Part II | Metrics and logs MUST distinguish interface, operation, and error code. | V3 test. | mapping / redaction / audit tests |
| `OBS-05` | C | all | OBS | Part II | Health endpoints MUST be minimal in public mode; detailed readiness is privileged. | V3 test. | mapping / redaction / audit tests |
| `OP-01` | C | all | OP | Part III.4 | Exactly one handler per operation ID. | V3 registry test. | cargo test -p <project>-operation/core |
| `OP-02` | C | all | OP | Part III.4 | `prepare` performs validation and authorization; it has no business side effect. | V3 failure-injection test. | cargo test -p <project>-operation/core |
| `OP-03` | C | all | OP | Part III.4 | `execute` performs reservation, mutation, commit, and outbox enqueue. | V3 event-order test. | cargo test -p <project>-operation/core |
| `OP-04` | C | all | OP | Part III.4 | Repositories are obtained from the unit of work. | V2 scan; V3 test. | cargo test -p <project>-operation/core |
| `OP-05` | C | all | OP | Part III.4 | The handler never constructs `AuthenticatedContext` or `VerifiedIdentity`. | V1; V3 compile-fail. | cargo test -p <project>-operation/core |
| `OP-06` | C | all | OP | Part III.4 | The handler does not branch on `InterfaceId`. | V2 scan; V4 review. | cargo test -p <project>-operation/core |
| `OP-07` | C | all | OP | Part III.4 | A handler that cannot complete uses the declared recovery policy. | V3 failure-injection test. | cargo test -p <project>-operation/core |
| `OP-08` | G | all | OP | Part III.4 | Generated skeletons carry a create-once marker and are not overwritten. | V2 check. | cargo test -p <project>-operation/core |
| `OP-09` | C | all | OP | Part III.4 | Anonymous operations are registered separately. | V3 test. | cargo test -p <project>-operation/core |
| `OP-10` | C | all | OP | Part III.4 | No anonymous operation receives a `VerifiedIdentity`. | V1. | cargo test -p <project>-operation/core |
| `OP-11` | C | all | OP | Part III.4 | Anonymous operations do not bypass rate limits or validation. | V3 test. | cargo test -p <project>-operation/core |
| `OP-12` | C | all | OP | Part III.4 | Idempotency for anonymous operations is opt-in and keyed by peer plus operation. | V3 test. | cargo test -p <project>-operation/core |
| `OP-AUTH-01` | C | all | OP-AUTH | Part III.4 | Scope is checked by the dispatcher; ownership/tenant by the authorizer. | V3 test. | cargo test -p <project>-operation/core |
| `OP-AUTH-02` | C | all | OP-AUTH | Part III.4 | The authorizer uses the loaded resource, never request IDs alone. | V3 cross-tenant test. | cargo test -p <project>-operation/core |
| `OP-AUTH-03` | C | all | OP-AUTH | Part III.4 | Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`. | V3 test. | cargo test -p <project>-operation/core |
| `OP-AUTH-04` | C | all | OP-AUTH | Part III.4 | Replay is authorized through `replay_authorize` against the recorded target, not through full `prepare`. | V3 test. | cargo test -p <project>-operation/core |
| `OP-AUTH-05` | C | all | OP-AUTH | Part III.4 | The same identity and resource produce the same result through every interface. | V3 conformance. | cargo test -p <project>-operation/core |
| `OP-IDEM-01` | C | all | OP-IDEM | Part III.4 | The namespace includes subject, tenant, and operation. | V3 test. | cargo test -p <project>-operation/core |
| `OP-IDEM-02` | C | all | OP-IDEM | Part III.4 | `claim` is atomic; concurrent claims produce one `Acquired`. | V3 concurrency test. | cargo test -p <project>-operation/core |
| `OP-IDEM-03` | C | all | OP-IDEM | Part III.4 | `same-transaction` stores the result in the business commit. | V3 crash test. | cargo test -p <project>-operation/core |
| `OP-IDEM-04` | C | all | OP-IDEM | Part III.4 | `external` uses a lease and `recover_expired`. | V3 crash test. | cargo test -p <project>-operation/core |
| `OP-IDEM-05` | C | all | OP-IDEM | Part III.4 | A replay calls `replay_authorize` against the recorded target and never re-runs `prepare`. | V3 test. | cargo test -p <project>-operation/core |
| `OP-IDEM-06` | C | all | OP-IDEM | Part III.4 | Same key + different canonical request returns `conflict`. | V3 test. | cargo test -p <project>-operation/core |
| `OP-IDEM-07` | C | all | OP-IDEM | Part III.4 | Failed results are stored and replayed according to policy. | V3 test. | cargo test -p <project>-operation/core |
| `OP-IDEM-08` | G | all | OP-IDEM | Part III.4 | A claim carries a generation and fencing token; `complete`, `fail`, and `renew` reject a stale owner. | V3 test. | cargo test -p <project>-operation/core |
| `OP-IDEM-09` | C | all | OP-IDEM | Part III.4 | `same-transaction` requires `ExecutionScope::complete` before `uow.commit`; the dispatcher verifies completion. | V3 crash test. | cargo test -p <project>-operation/core |
| `OP-IDEM-10` | C | all | OP-IDEM | Part III.4 | External side effects carry the fencing token or an equivalent deduplication/reconciliation key. | V3 test. | cargo test -p <project>-operation/core |
| `OP-TX-01` | C | all | OP-TX | Part III.4 | Repositories come from the unit of work. | V2 scan; V3 test. | cargo test -p <project>-operation/core |
| `OP-TX-02` | C | all | OP-TX | Part III.4 | Outbox intent is written in the same commit as the business mutation. | V3 crash test. | cargo test -p <project>-operation/core |
| `OP-TX-03` | C | all | OP-TX | Part III.4 | Publication happens after commit by a relay. | V3 test. | cargo test -p <project>-operation/core |
| `OP-TX-04` | C | all | OP-TX | Part III.4 | The relay retries and deduplicates by `event_id`. | V3 test. | cargo test -p <project>-operation/core |
| `OP-TX-05` | C | all | OP-TX | Part III.4 | Irreversible effects use forward recovery or isolation, not forced compensation. | V3 failure-injection test. | cargo test -p <project>-operation/core |
| `OP-TX-06` | C | all | OP-TX | Part III.4 | No unrelated external API wait occurs inside a database transaction. Database communication required by the transaction is allowed. External effects run outside the transaction or through outbox/forward recovery. | V2 architecture scan; V3 test. | cargo test -p <project>-operation/core |
| `OP-VAL-01` | G | all | OP-VAL | Part III.4 | Every request type implements the generated `ContractValidate` and is validated before the idempotency claim. Replay uses `replay_authorize` and does not call `prepare`. | V3 test. | cargo test -p <project>-operation/core |
| `OP-VAL-02` | C | all | OP-VAL | Part III.4 | Handlers MUST NOT duplicate standard input validation that the macro already generates. | V2 scan; V4 review. | cargo test -p <project>-operation/core |
| `OP-VAL-03` | C | all | OP-VAL | Part III.4 | Validation failures map to `invalid_input` with field, code, and English message. | V3 test. | cargo test -p <project>-operation/core |
| `OPS-01` | C | all | OPS | Part II | Every operation MUST have a stable `operation_id` and a typed request/response pair. | V1 types; V3 catalog test. | cargo test -p <project>-operation/core |
| `OPS-02` | C | all | OPS | Part II | The wire envelope MUST be `{context, request}` and the reply `{request_id, result}` or `{request_id, error}`. | V3 schema test. | cargo test -p <project>-operation/core |
| `OPS-03` | C | all | OPS | Part II | `context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace_id`. It MUST NOT contain identity, tenant, role, scope, or lease. | V1 type; V3 rejection test. | cargo test -p <project>-operation/core |
| `OPS-04` | G | all | OPS | Part II | `request_id` MUST be generated when absent and MUST be stable across retries of the same logical request. | V3 test. | cargo test -p <project>-operation/core |
| `OPS-05` | G | all | OPS | Part II | The execution pipeline MUST follow this order: decode/size → authenticate or establish anonymity → authentication requirement → scope → deadline/admission → generated input validation → idempotency claim → replay branch (`replay_authorize` then stored result) or acquire branch (`prepare` then execute) → commit/outbox → result/reply. | V3 instrumented pipeline test. | cargo test -p <project>-operation/core |
| `OPS-06` | C | all | OPS | Part II | No side effect MAY occur before authorization succeeds. | V3 failure-injection test. | cargo test -p <project>-operation/core |
| `OPS-07` | C | all | OPS | Part II | Authorization MUST run inside the operation, not only in the adapter. | V3 bypass test. | cargo test -p <project>-operation/core |
| `OPS-08` | C | all | OPS | Part II | Tenant and ownership MUST be derived from `VerifiedIdentity` and the target resource, never from request-supplied IDs alone. | V3 cross-tenant test. | cargo test -p <project>-operation/core |
| `OPS-09` | C | all | OPS | Part II | Mutating operations MUST define idempotency semantics: same key + same canonical request reuses the result; same key + different request returns a conflict. | V3 test. | cargo test -p <project>-operation/core |
| `OPS-10` | C | all | OPS | Part II | Mutations that touch multiple resources MUST use a transaction or a compensating action. | V3 failure-injection test. | cargo test -p <project>-operation/core |
| `OPS-11` | C | all | OPS | Part II | Streaming operations MUST declare their mode and MUST define EOF, error, cancellation, and backpressure semantics. | V3 streaming test. | cargo test -p <project>-operation/core |
| `OPS-12` | C | all | OPS | Part II | One operation MUST have one handler. Adapter-specific branching inside the handler is forbidden. | V2 import/scan; V4 review. | cargo test -p <project>-operation/core |
| `OPS-13` | G | all | OPS | Part II | Operation inputs and outputs MUST be protocol-independent. Protobuf-generated types, HTTP types, and CLI types MUST NOT appear in `*-operation`. | V2 import scan. | cargo test -p <project>-operation/core |
| `OPS-14` | C | all | OPS | Part II | An operation MUST declare `AuthenticationRequirement::Required` or `AuthenticationRequirement::Anonymous`. Anonymous is not a scope, and `Option<Identity>` or an implicit anonymous path is forbidden. | V1 type; V3 test. | cargo test -p <project>-operation/core |
| `OPS-15` | C | all | OPS | Part II | Every operation MUST publish domain events only after commit. | V3 test. | cargo test -p <project>-operation/core |
| `OPS-16` | C | all | OPS | Part II | Every operation MUST have a conformance identifier and at least one oracle for normal and failure behavior. | V3 rule coverage. | cargo test -p <project>-operation/core |
| `OPS-17` | C | all | OPS | Part II | `ErasedPrepared` MUST be opaque: it preserves the authentication kind and operation mode, and is consumed only by the erased operation that produced it. | V1/V2 visibility; V3 test. | cargo test -p <project>-operation/core |
| `OPS-18` | G | all | OPS | Part II | The generated `ContractValidate::validate()` MUST run in the common dispatch path for every interface, before idempotency claim and business logic. | V3 test. | cargo test -p <project>-operation/core |
| `REST-01` | C | rest | REST | Part III.6 | Credentials come only from `Authorization: Bearer`. | V3 test. | conformance driver |
| `REST-02` | C | rest | REST | Part III.6 | Tokens MUST NOT appear in query strings or paths. | V3 test. | conformance driver |
| `REST-03` | C | rest | REST | Part III.6 | Public and protected routers are separate; protected routes use `route_layer`. | V3 test. | conformance driver |
| `REST-04` | C | rest | REST | Part III.6 | The audience is configured per router and passed to the verifier. | V3 audience test. | conformance driver |
| `REST-05` | C | rest | REST | Part III.6 | All REST success replies use 200 with the semantic envelope. 201, 202, and 204 are not used; aliases use 200. | V3 contract test. | conformance driver |
| `REST-06` | C | rest | REST | Part III.6 | Error mapping uses the fixed category table from `Part III.2` §5.8. | V3 mapping test. | conformance driver |
| `REST-07` | C | rest | REST | Part III.6 | 401 responses include `WWW-Authenticate: Bearer`. | V3 test. | conformance driver |
| `REST-08` | C | rest | REST | Part III.6 | Mutating requests accept `Idempotency-Key` and pass it in `WireContext`. | V3 test. | conformance driver |
| `REST-09` | C | rest | REST | Part III.6 | List endpoints define `limit`, `offset`, and optional `cursor`. | V3 schema test. | conformance driver |
| `REST-10` | C | rest | REST | Part III.6 | Request bodies are bounded by `max_body_bytes`. | V3 test. | conformance driver |
| `REST-11` | C | rest | REST | Part III.6 | CORS and Origin allowlists are configured; unspecified origins are denied. | V3 test. | conformance driver |
| `REST-12` | C | rest | REST | Part III.6 | The OpenAPI document lists exactly the routes the router serves. | V2 diff; V3 test. | conformance driver |
| `REST-13` | C | rest | REST | Part III.6 | Aliases call the same operation; they do not contain logic. | V3 catalog test. | conformance driver |
| `REST-14` | C | rest | REST | Part III.6 | Binary and multipart endpoints declare their media types and size limits. | V3 test. | conformance driver |
| `REST-15` | C | rest | REST | Part III.6 | Every endpoint uses the semantic envelope for requests and replies. | V3 contract test. | conformance driver |
| `REST-16` | C | rest | REST | Part III.6 | Aliases use the same envelope; they do not introduce a second wire shape. | V3 contract test. | conformance driver |
| `REST-17` | C | rest | REST | Part III.6 | Anonymous operations use the public router and `execute_anonymous`; they are not a dispatcher bypass. | V3 bypass test. | conformance driver |
| `REST-18` | C | rest | REST | Part III.6 | The reply `request_id` is the operation's `request_id`, including on errors. | V3 test. | conformance driver |
| `SEC-01` | C | all | SEC | Part II | Transport MUST use TLS outside loopback-only local mode. | V2 config check. | mapping / redaction / audit tests |
| `SEC-02` | C | all | SEC | Part II | Authentication endpoints and mutating operations MUST be rate-limited. | V3 load test. | mapping / redaction / audit tests |
| `SEC-03` | C | all | SEC | Part II | Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them. | V2 secret scan. | mapping / redaction / audit tests |
| `SEC-04` | C | all | SEC | Part II | Dependencies MUST be audited for known vulnerabilities before release. | V2 audit command. | mapping / redaction / audit tests |
| `SEC-05` | C | all | SEC | Part II | Debug output MUST NOT leak request bodies or credentials. | V2 scan; V3 test. | mapping / redaction / audit tests |
| `SSO-01` | O/C | auth-sso | SSO | Part II | SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or `*-core`. | V2 dependency check. | negative-auth suite |
| `SSO-02` | O/C | auth-sso | SSO | Part II | OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC are forbidden. | V3 protocol test. | negative-auth suite |
| `SSO-03` | O/C | auth-sso | SSO | Part II | `state` MUST be generated per request and bound to the browser session; OIDC `nonce` MUST be used. Both MUST be single-use. | V3 test. | negative-auth suite |
| `SSO-04` | O/C | auth-sso | SSO | Part II | Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden. | V2 config check; V3 test. | negative-auth suite |
| `SSO-05` | O/C | auth-sso | SSO | Part II | The external issuer (`iss`) MUST be validated per provider to prevent mix-up attacks. | V3 test. | negative-auth suite |
| `SSO-06` | O/C | auth-sso | SSO | Part II | The external ID token MUST be verified inside `identity-sso` and discarded. It MUST NOT be forwarded to the API or operation layer. | V2 import scan; V3 test. | negative-auth suite |
| `SSO-07` | O/C | auth-sso | SSO | Part II | SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer` to issue an internal access token. | V1 type; V3 test. | negative-auth suite |
| `SSO-08` | O/C | auth-sso | SSO | Part II | External accounts MUST be stored in `external_identities` with `UNIQUE(issuer, subject)`. Business tables MUST NOT store external provider IDs. | V2 schema check; V3 test. | negative-auth suite |
| `SSO-09` | O/C | auth-sso | SSO | Part II | Accounts MUST NOT be linked automatically by email address. Linking requires an explicit, auditable action. | V3 test. | negative-auth suite |
| `SSO-10` | O/C | auth-sso | SSO | Part II | Provider client IDs and secrets MUST come from configuration or environment variables, never source code. | V2 secret scan. | negative-auth suite |
| `SSO-11` | O/C | auth-sso | SSO | Part II | Adding SSO MUST change only: the `identity-sso` crate, authentication adapters, assembly wiring, configuration, and `external_identities`. Business operations, `VerifiedIdentity`, and business tables MUST remain unchanged. | V3 regression test; V4 review. | negative-auth suite |
| `SSO-12` | O/C | auth-sso | SSO | Part II | External ID tokens and internal access tokens MUST be mutually rejected by their verification rules. | V3 negative test N-9. | negative-auth suite |
| `VAL-01` | C | all | VAL | Part III.17 | Every request input constraint is declared once in `#[rule(...)]`. | V2 scan; V3 test. | cargo test + docgen --check validation |
| `VAL-02` | C | all | VAL | Part III.17 | The macro generates the runtime validator, schema, and descriptor from the same declaration. | V3 test. | cargo test + docgen --check validation |
| `VAL-03` | C | all | VAL | Part III.17 | Standard rules follow the conversion table in §4. | V2 schema diff; V3 test. | cargo test + docgen --check validation |
| `VAL-04` | C | all | VAL | Part III.17 | A rule whose unit or regex dialect does not match the schema keyword MUST be emitted as a custom constraint with an explicit description, not silently converted. | V3 test. | cargo test + docgen --check validation |
| `VAL-05` | C | all | VAL | Part III.17 | Unknown rules and rules applied to an incompatible type MUST be compile-time errors. | V3 compile-fail test. | cargo test + docgen --check validation |
| `VAL-06` | C | all | VAL | Part III.17 | Every standard and custom rule carries an `error_code`. | V1/V3. | cargo test + docgen --check validation |
| `VAL-07` | C | all | VAL | Part III.17 | Custom rules require `id`, `check`, `fields`, `description`, and `code`. | V1 macro check; V3 test. | cargo test + docgen --check validation |
| `VAL-08` | C | all | VAL | Part III.17 | Conditional rules require `when` and an English condition description. | V1/V3. | cargo test + docgen --check validation |
| `VAL-09` | C | all | VAL | Part III.17 | A custom rule without a description fails compilation. | V3 compile-fail test. | cargo test + docgen --check validation |
| `VAL-10` | C | all | VAL | Part III.17 | The runtime and the descriptor use the same `check` function and `code`. | V3 test. | cargo test + docgen --check validation |
| `VAL-11` | C | all | VAL | Part III.17 | Adapters do not implement interface-specific input validation. | V2 scan; V3 test. | cargo test + docgen --check validation |
| `VAL-12` | G | all | VAL | Part III.17 | The generated validator runs after typed conversion and before the idempotency claim; prepare runs only on the acquired branch. | V3 test. | cargo test + docgen --check validation |
| `VAL-13` | C | all | VAL | Part III.17 | Validation failures map to `invalid_input` with field, code, and English message. | V3 test. | cargo test + docgen --check validation |
| `VAL-14` | C | all | VAL | Part III.17 | The same input produces the same validation result through every interface. | V3 conformance. | cargo test + docgen --check validation |
| `VAL-15` | C | all | VAL | Part III.17 | Every field rule appears in every applicable interface's documentation. | V3 completeness test. | cargo test + docgen --check validation |
| `VAL-16` | G | all | VAL | Part III.17 | Hand-written constraint lists are forbidden; documentation is generated from descriptors. | V2 scan; V3 test. | cargo test + docgen --check validation |
| `VAL-17` | C | all | VAL | Part III.17 | Custom rules appear as readable English text in every interface reference, not only in an extension field. | V3 test. | cargo test + docgen --check validation |
| `VAL-18` | C | all | VAL | Part III.17 | Validation descriptions, messages, and examples are English-only. | V2 scan; V3 test. | cargo test + docgen --check validation |
| `VAL-19` | G | all | VAL | Part III.17 | Validation descriptors and generated documentation contain no secrets or sensitive examples. | V2 scan; V3 test. | cargo test + docgen --check validation |
| `VAL-20` | G | all | VAL | Part III.17 | Generation is deterministic for the same descriptor set and version. | V3 digest test. | cargo test + docgen --check validation |
| `WS-01` | C | ws | WS | Part III.7 | The ticket is random, hashed at rest, single-use, and short-lived (30 seconds). | V3 test. | conformance driver |
| `WS-02` | C | ws | WS | Part III.7 | The ticket is bound to the subject, audience, and scopes it was issued for. | V3 test. | conformance driver |
| `WS-03` | C | ws | WS | Part III.7 | A redeemed ticket cannot be redeemed again. | V3 test. | conformance driver |
| `WS-04` | C | ws | WS | Part III.7 | The upgrade is rejected before the socket is accepted if redemption fails. | V3 test. | conformance driver |
| `WS-05` | C | ws | WS | Part III.7 | The ticket is sent in a header, never in a query parameter. | V3 test. | conformance driver |
| `WS-06` | C | ws | WS | Part III.7 | A successful upgrade is not permanent authentication. | V3 expiry test. | conformance driver |
| `WS-07` | C | ws | WS | Part III.7 | On expiry, the server either rejects new requests and requests re-auth, or closes with a policy code. | V3 test. | conformance driver |
| `WS-08` | C | ws | WS | Part III.7 | Expired connections MUST NOT execute new operations. | V3 test. | conformance driver |
| `WS-09` | C | ws | WS | Part III.7 | Connection state transitions are explicit; illegal transitions are rejected. | V3 test. | conformance driver |
| `WS-10` | C | ws | WS | Part III.7 | Each request carries a `request_id`; the response carries the same ID. | V3 test. | conformance driver |
| `WS-11` | C | ws | WS | Part III.7 | Concurrent requests may interleave. | V3 test. | conformance driver |
| `WS-12` | C | ws | WS | Part III.7 | Mutations to the same resource preserve a defined order. | V3 ordering test. | conformance driver |
| `WS-13` | C | ws | WS | Part III.7 | No global ordering is promised. | V4 review. | conformance driver |
| `WS-14` | C | ws | WS | Part III.7 | The adapter calls `Dispatcher::execute_verified`; it does not call handlers directly. | V3 bypass test. | conformance driver |
| `WS-15` | C | ws | WS | Part III.7 | Message size, frame size, queue length, and connection count are bounded. | V3 load test. | conformance driver |
| `WS-16` | C | ws | WS | Part III.7 | Control queue overflow and audio queue overflow have distinct policies. | V3 test. | conformance driver |
| `WS-17` | C | ws | WS | Part III.7 | A slow reader MUST NOT block the runtime; the connection is closed with 1013. | V3 test. | conformance driver |
| `WS-18` | C | ws | WS | Part III.7 | Ping/pong intervals and timeouts are configured. | V3 test. | conformance driver |
| `WS-19` | C | ws | WS | Part III.7 | Close codes use the table above. | V3 test. | conformance driver |
| `WS-20` | C | ws | WS | Part III.7 | Disconnect cleans up connection-owned subscriptions, streams, and temporary resources. | V3 leak test. | conformance driver |
| `WS-21` | C | ws | WS | Part III.7 | In-flight operations may complete after disconnect; their results are discarded unless the operation is explicitly cancel-on-disconnect. | V3 test. | conformance driver |
| `WS-22` | C | ws | WS | Part III.7 | Origin allowlisting is applied before authentication. | V3 test. | conformance driver |
| `WS-23` | C | ws | WS | Part III.7 | `StreamOpen` creates a stream; the server sends `StreamItem` messages followed by exactly one `StreamEnd`. | V3 test. | conformance driver |
| `WS-24` | C | ws | WS | Part III.7 | A client stream sends `StreamItem` messages and then `StreamClose`; the server replies with `Response` or `Error`. | V3 test. | conformance driver |
| `WS-25` | C | ws | WS | Part III.7 | `StreamCancel` is idempotent, propagates to the operation, and ends with `StreamEnd::Cancelled`. | V3 test. | conformance driver |
| `WS-26` | C | ws | WS | Part III.7 | A bidi stream has independent half-close for input and output. | V3 test. | conformance driver |
| `WS-27` | C | ws | WS | Part III.7 | Backpressure applies to stream items; an overflow closes with 1013. | V3 load test. | conformance driver |
| `WS-28` | C | ws | WS | Part III.7 | `stream_id` is unique per connection and is released on `StreamEnd`. | V3 test. | conformance driver |
| `WS-29` | C | ws | WS | Part III.7 | The adapter calls the dispatcher's stream methods; it does not implement business streaming. | V3 bypass test. | conformance driver |
| `WS-30` | C | ws | WS | Part III.7 | The adapter authorizes protocol-owned subscriptions and streams against the connection identity. | V3 test. | conformance driver |
| `WS-31` | C | ws | WS | Part III.7 | The adapter MUST NOT authorize business resources; that belongs to the operation. | V3 bypass test. | conformance driver |
| `WS-32` | C | ws | WS | Part III.7 | A subscription or stream is bound to the connection; disconnect cancels it. | V3 test. | conformance driver |

## 2. Duplicate Detection

No duplicate obligations detected by the registry extraction.

## 3. Coverage

The registry extraction covers normative rule tables. A prose paragraph that
uses MUST/MUST NOT without a rule ID is a coverage defect. The project rule
extractor MUST scan prose MUST/MUST NOT and fail when it finds an unlabeled
obligation. A conformance report marks `NotApplicable` only when the rule's
applicability profile is absent from `RULES-PROFILE.toml`.

## 4. Rule ID Grammar

```text
^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-[0-9]{1,3}$
```

IDs are permanent. A removed rule keeps its ID and is marked `REMOVED`; IDs
are never reused. Detailed rules may reference a parent rule, but they must
not reuse the parent ID for a different obligation.

## 5. Generation

The registry is extracted from the normative tables by the project rule
extractor. The report and the conformance coverage check consume the same
extraction. A rule that is absent from the registry is not covered.

---

# PART III.16 — Documentation Generation

# 45 — Documentation Generation

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

---

## 1. Purpose

Every implemented interface MUST have generated, English usage documentation.
Documentation is a build artifact, not a hand-maintained parallel text.

The generator does not parse Rust source code. It consumes a neutral schema
registry, the operation catalog, the interface bindings, the validation
descriptor registry, and the shared contracts. `utoipa`/OpenAPI is one schema
source and one REST output; it is not the only input and it is not required for
non-REST interfaces.

The mandatory implementation method — crates, macro expansion, inventory
registries, docgen subcommands, and gates — is Part III.18.

---

## 2. Inputs

| Input | Authority |
|---|---|
| Operation catalog | The authoritative operation list, authentication, scope, mode, idempotency, recovery, bindings, and conformance ID. |
| Neutral schema registry | Request/response types, fields, required/optional, enums, descriptions, examples. |
| Validation descriptor registry | Runtime validation rules, standard schema keywords, custom rules, error codes, and English descriptions. |
| Interface bindings | REST method/path/status/headers; WebSocket envelope/stream lifecycle; CLI command/flags/exit codes; gRPC service/method/proto fields/stream mode/metadata; MCP tool/auth/result representation; A2A skill/task/artifact/auth. |
| Shared contracts | Envelope, identity/binding, error categories, streaming, idempotency, authorization, revocation. |
| Operation documentation fields | Summary, description, examples, errors, preconditions, postconditions, failure/compensation, authorization notes. |
| `ApiDoc::openapi()` | Optional additional REST schema input when REST is implemented. |

The neutral schema registry is produced by `schemars::JsonSchema` (recommended)
or `utoipa::ToSchema` (allowed). The generator reads the resulting JSON Schema,
not the Rust source.

---

## 3. Outputs

```text
docs/generated/
├── INDEX.md
├── rest/
│   ├── openapi.json
│   ├── REFERENCE.md
│   └── swagger/              # optional static Swagger UI
├── websocket/REFERENCE.md
├── cli/REFERENCE.md
├── grpc/REFERENCE.md
├── mcp/REFERENCE.md
└── a2a/REFERENCE.md
```

Only the profiles present in `RULES-PROFILE.toml` are generated. A missing
reference for an implemented profile is a build failure.

---

## 4. Pipeline

```text
1. Build the neutral schema registry from operation DTOs.
   (No REST server is started; no adapter is required.)
2. Load the operation catalog and interface bindings.
3. Merge shared authentication, error, envelope, streaming, and idempotency
   semantics.
4. Render the REST OpenAPI/Swagger output and the per-interface references.
5. Validate completeness, English-only, determinism, and secret-free output.
6. Publish or check in the generated artifacts.
```

The same generator and the same inputs produce all interface references. The
REST OpenAPI document is a rendering of the shared schema for REST, not the
source from which other interfaces are inferred.

---

## 5. Completeness

Every implemented interface × operation MUST have a section containing:

- operation ID, summary, and description;
- authentication requirement (`required`/`anonymous`) and required scopes;
- request and response schema, required/optional fields, enums, and examples;
- error categories and stable error codes;
- idempotency mode and replay semantics;
- streaming mode and lifecycle (items, EOF, cancel, backpressure), when applicable;
- authorization target, preconditions, postconditions, and failure/compensation;
- interface-specific invocation:
  - REST: method, path, status, headers;
  - WebSocket: envelope, operation ID, stream messages;
  - CLI: command, flags, stdin/stdout, exit codes;
  - gRPC: service, method, protobuf fields, stream mode, metadata;
  - MCP: tool name, applicability, auth/result representation;
  - A2A: skill, task, artifact, task operations, auth;
- conformance ID.

A missing operation, interface, field, error category, auth statement, or
example is a build failure.

---

## 5.1 Validation Constraints

Every input constraint is documented from the `ValidationDescriptor` produced by
the shared input macro (Part III.17). The generator does not infer constraints
from implementation code and does not accept a hand-written constraint list.

Each constraint entry includes:

- field name;
- rule kind and parameters (minimum, maximum, length, items, pattern, enum, or
  custom rule ID);
- unit and regex engine when they affect interpretation;
- error code;
- English description;
- applicability condition for conditional custom rules.

Custom rules are rendered as readable English text in every applicable
interface reference, not only in a vendor extension.

---

## 6. English-Only

| Context | Language |
|---|---|
| Generated documentation | English |
| Schema descriptions, examples, summaries | English |
| Rust doc comments used as documentation input | English |
| Operation catalog documentation fields | English |
| Runtime logs | English |
| UI labels and i18n resources | Per-product, not documentation |

A non-English string in generated documentation is a build failure. UI
localization is a separate artifact and is not generated by this pipeline.

---

## 7. No REST Dependency

Schema generation MUST NOT require a running REST server, a REST router, or the
REST adapter. `utoipa::ToSchema` or `schemars::JsonSchema` produces schema
information without serving HTTP.

A project that implements only MCP, A2A, CLI, WebSocket, or gRPC MUST still
generate its interface documentation. REST profiles are optional.

---

## 8. Determinism and Versioning

- Same `spec_version` + profile + operation catalog + schema registry +
  interface bindings + generator version → byte-identical output.
- Generated documentation records the `spec_version` and the input digest.
- The documentation version matches `spec_version`.
- Generated files carry `// @generated` or the Markdown equivalent.
- Hand edits to generated documentation are overwritten.
- Documentation is published as a build artifact or checked in; a missing
  artifact fails the build.

---

## 9. Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| DOC-01 | Every implemented interface MUST have generated usage documentation. | Coverage. | Renderer and template. | V2 artifact check; V3 test. |
| DOC-02 | The operation catalog is the authoritative operation list and binding map. | Authority. | Catalog fields beyond the required set. | V3 catalog test. |
| DOC-03 | The generator MUST consume a neutral schema registry, not parse Rust source. | Input boundary. | Schema source implementation. | V2 scan; V3 test. |
| DOC-04 | `utoipa`/OpenAPI MAY be used as a schema source and REST output, but MUST NOT be the only source for non-REST interfaces. | Source independence. | REST rendering. | V3 test. |
| DOC-05 | Interface-specific documentation MUST come from interface bindings, not be inferred from REST. | Source of truth. | Binding fields. | V3 test. |
| DOC-06 | Documentation generation MUST NOT require a running REST server or REST adapter. | Independence. | Build tooling. | V2/V3 test. |
| DOC-07 | Every operation section MUST include schema, examples, auth, errors, idempotency, streaming, authorization, and conformance ID. | Completeness. | Presentation. | V3 completeness test. |
| DOC-08 | Every implemented interface MUST have a reference section for every applicable operation. | Coverage. | Non-applicability reason. | V3 matrix test. |
| DOC-09 | OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references. | Shared source. | UI packaging. | V3 diff test. |
| DOC-10 | A missing operation, interface, field, error category, auth statement, or example MUST fail the build. | Fail-closed. | Error message. | V3 test. |
| DOC-11 | Generated documentation MUST be English-only; a non-English string fails the build. | Language. | — | V2 scan; V3 test. |
| DOC-12 | Generation MUST be deterministic for the same inputs and version. | Determinism. | Renderer. | V3 digest test. |
| DOC-13 | Documentation and examples MUST NOT contain secrets, tokens, or passwords. | Secret-free. | — | V2 scan; V3 test. |
| DOC-14 | Documentation MUST record `spec_version` and the input digest. | Versioning. | Metadata format. | V3 test. |
| DOC-15 | Documentation generation MUST be part of CI/conformance; a missing artifact fails the gate. | CI gate. | CI provider. | V3 test. |
| DOC-16 | Input constraints MUST be documented from the `ValidationDescriptor`, not from a hand-written list or inferred code. | Single source. | Presentation. | V2 scan; V3 test. |
| DOC-17 | Custom validation rules MUST appear as readable English text in every applicable interface reference. | Readability. | Formatting. | V3 test. |

---

## 10. Fixed and Open

| Fixed | Open |
|---|---|
| Inputs, outputs, completeness, English-only, determinism, secret-free. | Renderer, template, static-site generator. |
| Operation catalog as the operation list. | Catalog documentation fields beyond the required set. |
| Schema registry as the neutral source. | `schemars` or `utoipa` selection. |
| Per-interface references and OpenAPI/Swagger. | Visual presentation and navigation. |
| No REST dependency. | Build orchestration. |
| Version and digest metadata. | Artifact storage. |

---

## 11. Conformance Obligations

1. Every implemented profile has a generated reference directory.
2. Every applicable operation appears in each interface reference.
3. Every operation section has the required fields.
4. OpenAPI and the other references agree on schemas and errors.
5. A non-English string fails the English-only gate.
6. A secret in documentation fails the secret-free gate.
7. Two runs with the same inputs produce identical output.
8. A missing artifact fails CI.
9. A REST-free project generates documentation successfully.
10. The conformance report names `DOC-01` through `DOC-17` and `CONF-53` through
    `CONF-60`.

---

## 12. Example Commands

```bash
# Neutral schema + catalog + bindings -> all interface references
cargo run -p <project>-docgen -- \
  --catalog contract/operation-catalog.toml \
  --schema target/schema/registry.json \
  --out docs/generated

# REST-only OpenAPI check (when the REST profile is enabled)
cargo run -p <project>-docgen -- --check openapi docs/generated/rest/openapi.json

# Completeness, English-only, determinism, and secret gates
cargo run -p <project>-docgen -- --check all
```

---

# PART III.17 — Validation Contract

# 47 — Validation Contract

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2
**Documentation:** Part III.16

---

## 1. Purpose

Validation is declared once on the request type. The same declaration generates:

1. the runtime validator;
2. the schema used by `utoipa`/`schemars` and the neutral schema registry;
3. the machine-readable `ValidationDescriptor` consumed by documentation.

Validation and `#[schema(...)]` are not written twice. Documentation does not
infer constraints from implementation code.

The mandatory implementation method — macro expansion, runtime types,
`inventory` registration, docgen dumps, and gates — is Part III.18.

---

## 2. Declaration Syntax

```rust
#[contract::input]
#[derive(serde::Deserialize)]
pub struct CreateAccountRequest {
    #[rule(
        length(min = 3, max = 32, unit = "unicode_scalar"),
        pattern = "^[a-z][a-z0-9_]*$",
        code = "invalid_account_name"
    )]
    pub name: String,

    #[rule(
        range(min = 1, max = 100),
        code = "invalid_member_limit"
    )]
    pub member_limit: u32,

    #[rule(
        items(min = 1, max = 10),
        code = "invalid_tags"
    )]
    pub tags: Vec<String>,
}
```

`#[contract::input]` and `#[rule(...)]` are shared contract macros, not
`utoipa` APIs. The macro is owned by the shared `contract-macros` crate.

Custom, cross-field rules are attached to the type:

```rust
#[contract::input]
#[rule(custom(
    id = "date_range_order",
    check = validate_date_range,
    fields = ["start_at", "end_at"],
    description = "start_at must not be later than end_at.",
    code = "invalid_date_range"
))]
pub struct ExportRequest {
    pub start_at: i64,
    pub end_at: i64,
}

fn validate_date_range(value: &ExportRequest) -> Result<(), RuleViolation> {
    if value.start_at <= value.end_at {
        Ok(())
    } else {
        Err(RuleViolation::new())
    }
}
```

---

## 3. Generated Outputs

The type examples below are conceptual. The exact implementation types —
including const-friendly rule parameters, static slices, and `inventory`
registrations — are fixed in Part III.18.

`#[contract::input]` generates:

```rust
pub trait ContractValidate {
    fn validate(&self) -> Result<(), ValidationErrors>;
}

pub struct ValidationDescriptor {
    pub type_name: &'static str,
    pub fields: std::collections::BTreeMap<&'static str, FieldRules>,
    pub custom_rules: Vec<CustomRuleDescriptor>,
}

pub struct FieldRules {
    pub rules: Vec<RuleDescriptor>,
    pub error_code: Option<ErrorCode>,
}

pub struct RuleDescriptor {
    pub kind: RuleKind,
    pub parameters: serde_json::Value,
    pub error_code: ErrorCode,
    pub description: Option<&'static str>,
}

pub struct CustomRuleDescriptor {
    pub id: &'static str,
    pub fields: Vec<&'static str>,
    pub description: &'static str,
    pub error_code: ErrorCode,
    pub when: Option<&'static str>,
}
```

The macro emits:

- `impl ContractValidate for CreateAccountRequest`;
- schema attributes for the configured schema backend;
- `const VALIDATION: ValidationDescriptor` (or an equivalent accessor);
- a registration entry in the generated validation registry consumed by the
  documentation generator.

---

## 4. Standard Rule Conversion

The neutral registry uses `schemars` as fixed in Part III.18. `utoipa` may be
used for REST rendering and is compared against the neutral schema; it is not
the authoritative source for other interfaces.

| Rule | Runtime check | Schema output |
|---|---|---|
| `range(min, max)` | inclusive numeric comparison | `minimum` / `maximum` |
| `range(gt, lt)` | exclusive numeric comparison | `exclusiveMinimum` / `exclusiveMaximum` |
| `length(min, max, unit="unicode_scalar")` | Unicode scalar count | `minLength` / `maxLength` |
| `length(..., unit="bytes")` | byte count | custom constraint plus description; never `minLength`/`maxLength` |
| `pattern` | regex according to the declared engine | `pattern` only when the expression is valid in the schema dialect |
| `items(min, max)` | element count | `minItems` / `maxItems` |
| `enum` | allowed variants | schema `enum` |

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-01 | Every request input constraint is declared once in `#[rule(...)]`. | Single declaration. | Rule set. | V2 scan; V3 test. |
| VAL-02 | The macro generates the runtime validator, schema, and descriptor from the same declaration. | Three outputs. | Macro implementation. | V3 test. |
| VAL-03 | Standard rules follow the conversion table in §4. | Table. | Schema backend. | V2 schema diff; V3 test. |
| VAL-04 | A rule whose unit or regex dialect does not match the schema keyword MUST be emitted as a custom constraint with an explicit description, not silently converted. | No false mapping. | Description text. | V3 test. |
| VAL-05 | Unknown rules and rules applied to an incompatible type MUST be compile-time errors. | Fail-closed. | Error text. | V3 compile-fail test. |
| VAL-06 | Every standard and custom rule carries an `error_code`. | Required field. | Code set. | V1/V3. |

Regex rules:

- `pattern` is emitted as the schema `pattern` only when the expression is
  valid in the schema dialect (ECMA-262 for OpenAPI) and the runtime engine
  accepts the same expression.
- Otherwise the descriptor records `engine`, `expression`, and a human-readable
  description. The documentation shows the expression and the engine.
- A regex that is invalid or unsupported is a compile-time error.

---

## 5. Custom Rules

Custom rules MUST carry:

| Field | Meaning |
|---|---|
| `id` | Stable rule identifier. |
| `check` | Rust validation function. |
| `fields` | Fields the rule observes. |
| `description` | English explanation used in documentation. |
| `code` | Stable error code. |
| `when` | Optional applicability condition, with an English description. |

A custom rule without a description is a definition error. The generator does
not invent a description from the function name or body.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-07 | Custom rules require `id`, `check`, `fields`, `description`, and `code`. | Required set. | Function body. | V1 macro check; V3 test. |
| VAL-08 | Conditional rules require `when` and an English condition description. | Required set. | Condition expression. | V1/V3. |
| VAL-09 | A custom rule without a description fails compilation. | Fail-closed. | — | V3 compile-fail test. |
| VAL-10 | The runtime and the descriptor use the same `check` function and `code`. | Single source. | — | V3 test. |

---

## 6. Runtime Execution

All interfaces use the same validator:

```text
REST / WS / CLI / gRPC / MCP / A2A
        ↓
typed request conversion (adapter)
        ↓
ContractValidate::validate() (generated, common operation path)
        ↓
idempotency claim
        ├─ replay → replay_authorize → stored result
        └─ acquired → prepare → execute
```

Generated validation is stateless input validation. State-dependent
preconditions, resource loading, and ownership authorization belong in
`prepare`, which is not called on replay.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-11 | Adapters do not implement interface-specific input validation. | Forbidden. | Conversion details. | V2 scan; V3 test. |
| VAL-12 | The generated validator runs after typed conversion and before the idempotency claim; prepare runs only on the acquired branch. | Order. | Dispatch placement. | V3 test. |
| VAL-13 | Validation failures map to `invalid_input` with field, code, and English message. | Mapping. | Message text. | V3 test. |
| VAL-14 | The same input produces the same validation result through every interface. | Parity. | — | V3 conformance. |

---

## 7. Documentation

The documentation generator collects every `ValidationDescriptor` and combines
it with the operation catalog and interface bindings.

Outputs:

- REST: OpenAPI standard keywords and a rendered constraint table. Custom rules
  appear in the schema `description`; they are not hidden in a vendor extension.
- WebSocket: payload field constraints per operation.
- CLI: argument and flag constraints.
- gRPC: request message field constraints.
- MCP: tool input constraints.
- A2A: operation input constraints.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-15 | Every field rule appears in every applicable interface's documentation. | Coverage. | Presentation. | V3 completeness test. |
| VAL-16 | Hand-written constraint lists are forbidden; documentation is generated from descriptors. | Source of truth. | — | V2 scan; V3 test. |
| VAL-17 | Custom rules appear as readable English text in every interface reference, not only in an extension field. | Readability. | Formatting. | V3 test. |
| VAL-18 | Validation descriptions, messages, and examples are English-only. | Language. | — | V2 scan; V3 test. |
| VAL-19 | Validation descriptors and generated documentation contain no secrets or sensitive examples. | Secret-free. | — | V2 scan; V3 test. |
| VAL-20 | Generation is deterministic for the same descriptor set and version. | Determinism. | Renderer. | V3 digest test. |

---

## 8. Fixed and Open

| Fixed | Open |
|---|---|
| Single declaration; three outputs. | Macro implementation, crate name, and internal expansion. |
| Standard conversion table and no false mapping. | Schema backend selection (`utoipa` or `schemars`). |
| Required custom-rule fields. | Rule function body and condition expression. |
| Common runtime validator path. | Dispatch integration details. |
| Descriptor-driven documentation. | Renderer and presentation. |
| English-only and secret-free. | Message wording. |
| Fail-closed on unknown or incompatible rules. | Error text. |

---

## 9. Conformance Obligations

1. Every request type uses the shared input macro.
2. Every rule produces runtime validation, schema output, and a descriptor.
3. Standard rules match the conversion table; byte-length and non-ECMA regex
   rules are not mis-mapped.
4. Unknown or incompatible rules fail compilation.
5. Every custom rule has `id`, `check`, `fields`, `description`, and `code`.
6. The generated validator runs before business logic on every interface.
7. Validation parity holds across interfaces.
8. Every field rule appears in every applicable interface reference.
9. Documentation is English-only and secret-free.
10. Generation is deterministic.
11. The conformance report names `VAL-01` through `VAL-20` and `CONF-57`
    through `CONF-60`.

---

# PART III.18 — Implementation Blueprint

# 48 — Implementation Blueprint (Mandatory)

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2
**Validation:** Part III.17
**Documentation:** Part III.16

This document is the mandatory implementation method for validation and
documentation generation. A project MUST follow it, or declare a versioned
exception in `RULES-PROFILE.toml`. An implementer or AI agent must be able to
build the feature from this document without inventing the architecture.

---

## 1. Crates and Files

```text
crates/
├── contract-macros/                 # proc-macro crate
│   ├── Cargo.toml                   # syn 2, quote, proc-macro2
│   └── src/
│       ├── lib.rs                   # #[contract::input], #[rule]
│       ├── parse.rs                 # struct/field/rule parsing
│       ├── expand.rs                # ContractValidate + descriptor + schema
│       └── error.rs                 # syn::Error with spans
├── validation-contract/             # runtime crate
│   ├── Cargo.toml                   # inventory, schemars, serde
│   └── src/
│       ├── lib.rs
│       ├── validate.rs              # ContractValidate, ValidationErrors
│       ├── descriptor.rs            # ValidationDescriptor, RuleParams
│       ├── rules.rs                 # length/range/items/pattern/enum helpers
│       └── registry.rs              # inventory registrations
├── <project>-operation/
│   └── src/validation.rs            # ValidationErrors -> OperationError
└── <project>-docgen/
    ├── Cargo.toml                   # depends on <project>-operation
    └── src/
        ├── main.rs                  # subcommands
        ├── catalog.rs               # operation catalog loader
        ├── schema.rs                # schema registry loader
        ├── validation.rs            # validation registry loader
        ├── bindings.rs              # interface bindings
        ├── render/
        │   ├── rest.rs
        │   ├── websocket.rs
        │   ├── cli.rs
        │   ├── grpc.rs
        │   ├── mcp.rs
        │   └── a2a.rs
        └── check/
            ├── completeness.rs
            ├── english.rs
            ├── secrets.rs
            └── determinism.rs
```

`*-docgen` depends on `<project>-operation` so that `inventory` registrations
are linked into the binary. It does not start any server.

---

## 2. Runtime Types

```rust
// validation-contract
pub trait ContractValidate {
    fn validate(&self) -> Result<(), ValidationErrors>;
}

pub struct ValidationErrors {
    pub errors: Vec<ValidationError>,
}

pub struct ValidationError {
    pub field: &'static str,
    pub code: ErrorCode,
    pub message: String,
}

pub enum LengthUnit {
    UnicodeScalar,
    Bytes,
    Graphemes,
}

pub enum RegexEngine {
    Ecma262,
    RustRegex,
}

pub enum RuleParams {
    Length { min: u64, max: u64, unit: LengthUnit },
    Range { min: Option<&'static str>, max: Option<&'static str>, exclusive: bool },
    Items { min: u64, max: u64 },
    Pattern { expression: &'static str, engine: RegexEngine },
    Enum { variants: &'static [&'static str] },
    Custom { id: &'static str },
}

pub struct RuleDescriptor {
    pub kind: &'static str,
    pub params: RuleParams,
    pub error_code: ErrorCode,
    pub description: Option<&'static str>,
}

pub struct FieldDescriptor {
    pub field: &'static str,
    pub rules: &'static [RuleDescriptor],
    pub error_code: Option<ErrorCode>,
}

pub struct CustomRuleDescriptor {
    pub id: &'static str,
    pub fields: &'static [&'static str],
    pub description: &'static str,
    pub error_code: ErrorCode,
    pub when: Option<&'static str>,
}

pub struct ValidationDescriptor {
    pub type_name: &'static str,
    pub fields: &'static [FieldDescriptor],
    pub custom_rules: &'static [CustomRuleDescriptor],
}

pub struct ValidationRegistration {
    pub descriptor: &'static ValidationDescriptor,
}

pub struct SchemaRegistration {
    pub type_name: &'static str,
    pub schema: fn() -> schemars::Schema,
}

inventory::collect!(ValidationRegistration);
inventory::collect!(SchemaRegistration);

pub use inventory;
```

Numeric rule parameters are stored as string literals in the descriptor so the
descriptor can be a `const`/`static` value. The runtime check uses the parsed
Rust literal directly.

---

## 3. Macro Contract

### 3.1 Input

```rust
#[contract::input]
#[derive(serde::Deserialize, schemars::JsonSchema)]
pub struct CreateAccountRequest {
    #[rule(length(min = 3, max = 32, unit = "unicode_scalar"),
            pattern = "^[a-z][a-z0-9_]*$",
            code = "invalid_account_name")]
    pub name: String,
}
```

`#[contract::input]` is an attribute macro. `#[rule(...)]` and `#[rule(custom(...))]`
are consumed by it. The struct MUST derive `serde::Deserialize` and
`schemars::JsonSchema`; a missing derive is a compile error caused by the
generated `schemars::schema_for!` call.

### 3.2 Parse

1. Parse `syn::ItemStruct`.
2. For each field, read `#[rule(...)]`.
3. Reject a rule on an unsupported type.
4. For a custom rule, verify every name in `fields` exists on the struct.
5. Validate that `code` is a non-empty string literal.
6. Validate that `description` is non-empty and English-only for custom rules.

### 3.3 Supported Field Types

| Rust type | Allowed rules |
|---|---|
| `String`, `&str`, `Cow<'_, str>` | `length`, `pattern`, `enum`, `required` |
| `u8`..`u64`, `i8`..`i64`, `f32`, `f64` | `range`, `enum`, `required` |
| `Vec<T>` | `items`, `required` |
| `Option<T>` | inner rules with `inner(...)`; `required` applies to the option itself |
| other types | only `custom`, or an explicit `unsupported_type` compile error |

A standard rule on any other type is a compile error with the field span.

### 3.4 Emitted Code

For a struct `CreateAccountRequest`, the macro emits:

```rust
impl validation_contract::ContractValidate for CreateAccountRequest {
    fn validate(&self) -> Result<(), validation_contract::ValidationErrors> {
        let mut errors = Vec::new();

        if let Err(e) = validation_contract::rules::length(
            &self.name,
            3,
            32,
            validation_contract::LengthUnit::UnicodeScalar,
        ) {
            errors.push(validation_contract::ValidationError {
                field: "name",
                code: validation_contract::ErrorCode::new("invalid_account_name"),
                message: e.to_string(),
            });
        }

        if let Err(e) = validation_contract::rules::pattern(
            &self.name,
            "^[a-z][a-z0-9_]*$",
            validation_contract::RegexEngine::Ecma262,
        ) {
            errors.push(/* ... */);
        }

        // custom rules
        if let Err(_) = validate_date_range(self) {
            errors.push(/* id, fields, code, description */);
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(validation_contract::ValidationErrors { errors })
        }
    }
}

const VALIDATION: validation_contract::ValidationDescriptor =
    validation_contract::ValidationDescriptor {
        type_name: "CreateAccountRequest",
        fields: &[
            validation_contract::FieldDescriptor {
                field: "name",
                rules: &[
                    validation_contract::RuleDescriptor {
                        kind: "length",
                        params: validation_contract::RuleParams::Length {
                            min: 3,
                            max: 32,
                            unit: validation_contract::LengthUnit::UnicodeScalar,
                        },
                        error_code: validation_contract::ErrorCode::new("invalid_account_name"),
                        description: Some("3 to 32 Unicode scalar values."),
                    },
                ],
                error_code: Some(validation_contract::ErrorCode::new("invalid_account_name")),
            },
        ],
        custom_rules: &[],
    };

validation_contract::inventory::submit! {
    validation_contract::ValidationRegistration {
        descriptor: &VALIDATION,
    }
}

validation_contract::inventory::submit! {
    validation_contract::SchemaRegistration {
        type_name: "CreateAccountRequest",
        schema: || schemars::schema_for!(CreateAccountRequest),
    }
}
```

### 3.5 Compile-Time Errors

The macro returns `syn::Error::new_spanned` for:

- unknown rule name;
- rule applied to an incompatible field type;
- missing or empty `code`;
- custom rule without `id`, `check`, `fields`, `description`, or `code`;
- custom rule naming a field that does not exist;
- conditional rule without `when` and an English description;
- non-English `description`;
- malformed literal (non-numeric range, invalid regex);
- duplicate rule kind on the same field.

No rule is silently ignored.

### 3.6 Schema Registration

The macro emits `schemars::schema_for!(Type)` through the inventory
registration. The docgen dump calls the function pointer; the schema is a
normal `schemars::Schema`.

If the project uses `utoipa` for REST, it MAY also derive `utoipa::ToSchema`.
The neutral `schemars` registry remains authoritative for all interfaces, and a
gate compares the OpenAPI schema against the neutral schema for the same type.

### 3.7 Runtime Validation Path

`operation-contract` has a blanket erased wrapper. Validation is separate from
business preparation:

```rust
impl<O: Operation> ErasedAuthenticatedOperation for O
where
    O::Request: validation_contract::ContractValidate,
{
    fn validate_json(
        &self,
        request: &serde_json::Value,
    ) -> Result<ErasedValidated, OperationError> {
        let request: O::Request = serde_json::from_value(request.clone())
            .map_err(OperationError::invalid_input_json)?;
        request.validate().map_err(validation_to_operation)?;
        Ok(ErasedValidated::new(request))
    }

    fn prepare_validated(
        &self,
        ctx: &AuthenticatedContext,
        validated: ErasedValidated,
    ) -> BoxFuture<'_, Result<ErasedPrepared, OperationError>> {
        Box::pin(async move {
            let request = validated.into_typed::<O::Request>()?;
            let prepared = self.prepare(ctx, request).await?;
            Ok(ErasedPrepared::new(prepared))
        })
    }
}
```

The dispatcher calls `validate_json` before the idempotency claim, for both the
replay and new branches:

```text
authenticate / scope / deadline
        ↓
validate_json (deserialize + generated input validation)
        ↓
idempotency claim
        ├─ replay → replay_authorize → stored result
        └─ acquired → prepare_validated → execute → commit/outbox → result
```

`prepare_validated` is called only on the acquired branch. A replay never calls
`prepare` or `prepare_validated`. State-dependent business preconditions,
resource loading, and ownership authorization belong in `prepare`, not in the
generated input validator; generated validation is stateless input validation.

`ErasedValidated::new` and `into_typed` are internal helpers of the shared
crate; they are not public contract methods.

`Operation::Request` MUST implement `ContractValidate`. The project operation
crate defines:

```rust
fn validation_to_operation(errors: ValidationErrors) -> OperationError {
    OperationError::invalid_input_many(
        errors.errors.into_iter().map(|e| FieldError {
            field: e.field.to_string(),
            code: e.code,
            message: e.message,
        }).collect(),
    )
}
```

No adapter calls `prepare`, `validate_json`, or `prepare_validated` directly;
all adapters go through the dispatcher.

---

## 4. Docgen Binary

### 4.1 Subcommands

```text
<project>-docgen dump-schema      --out target/schema/registry.json
<project>-docgen dump-validation  --out target/validation/registry.json
<project>-docgen render           --catalog contract/operation-catalog.toml --out docs/generated
<project>-docgen check all
```

### 4.2 Registry JSON

`dump-schema` output:

```json
{
  "types": [
    {
      "type_name": "CreateAccountRequest",
      "schema": { "$schema": "https://json-schema.org/draft/2020-12/schema" }
    }
  ]
}
```

`dump-validation` output:

```json
{
  "types": [
    {
      "type_name": "CreateAccountRequest",
      "fields": [
        {
          "field": "name",
          "error_code": "invalid_account_name",
          "rules": [
            {
              "kind": "length",
              "params": { "min": 3, "max": 32, "unit": "unicode_scalar" },
              "error_code": "invalid_account_name",
              "description": "3 to 32 Unicode scalar values."
            }
          ]
        }
      ],
      "custom_rules": []
    }
  ]
}
```

Both dumps sort types and fields by name and use LF line endings.

### 4.3 Render Steps

1. Read catalog and bindings.
2. Read both registry JSON files.
3. For each operation, resolve request/response schemas and validation
   descriptors.
4. For each implemented profile, render its reference and, for REST, the
   OpenAPI document.
5. Run `check all`.
6. Write outputs atomically: write to a temporary directory, then rename.

### 4.4 Check Implementations

| Check | Implementation |
|---|---|
| Completeness | Every catalog operation has request/response schema; every field has a schema property; every validation rule has a description; every implemented interface has a binding and a rendered section. |
| English | Scan prose fields (summaries, descriptions, rule descriptions, error messages, examples) for CJK Unified Ideographs, Hiragana, Katakana, and Hangul; reject. Code fences marked `non-english-example` are exempt. |
| Secrets | Reject `-----BEGIN`, `Bearer ` followed by 20+ characters, `sk-`, `AKIA`, `password=`, `secret=`, and configured secret patterns. |
| Determinism | Run render twice into two temporary directories; compare byte-for-byte. Sort maps; no timestamps, random values, absolute paths, or unordered iteration. |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Missing or incomplete artifact |
| 2 | Invalid input/catalog/schema |
| 3 | English-only violation |
| 4 | Secret violation |
| 5 | Non-deterministic output |

---

## 5. CI Gates

```bash
cargo run -p <project>-docgen -- dump-schema --out target/schema/registry.json
cargo run -p <project>-docgen -- dump-validation --out target/validation/registry.json
cargo run -p <project>-docgen -- render --catalog contract/operation-catalog.toml --out docs/generated
cargo run -p <project>-docgen -- check all
cargo test -p <project>-conformance
```

A missing `docs/generated/` directory or a non-zero exit fails the build.

---

## 6. Mandatory Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| BP-01 | This blueprint is the mandatory implementation method for validation and documentation. An alternate method requires a versioned exception. | Method. | Tooling internals. | V4 review; V2 config check. |
| BP-02 | Every request type uses `#[contract::input]` and implements `ContractValidate`. | Requirement. | Field rules. | V1 bound; V3 test. |
| BP-03 | The macro emits the validator, descriptor, schema registration, and inventory entries described in §3. | Outputs. | Internal expansion. | V3 test. |
| BP-04 | `Operation::Request` has a `ContractValidate` bound. `validate_json` runs before the idempotency claim; `prepare_validated` runs only on the acquired branch; replay calls `replay_authorize` only. | Order. | Error text. | V1/V3. |
| BP-05 | `validation-contract` owns the runtime types and `inventory` registrations in §2. | Types. | Internal layout. | V2 check. |
| BP-06 | Rule parameters are const-friendly and serialized to the exact JSON format in §4.2. | Format. | Extra fields. | V3 schema test. |
| BP-07 | `*-docgen` provides the four subcommands in §4.1 and depends on the operation crate to link registrations. | CLI. | Internal modules. | V3 test. |
| BP-08 | The schema registry is authoritative for all interfaces; `utoipa` output is compared, not used as the only source. | Source. | REST rendering. | V3 diff test. |
| BP-09 | Completeness, English, secrets, and determinism checks follow §4.4 and the exit codes. | Checks. | Implementation. | V3 test. |
| BP-10 | Generated documentation is written atomically and sorted deterministically. | Determinism. | Temp strategy. | V3 test. |
| BP-11 | A missing operation/interface/field/rule/description fails the build. | Fail-closed. | Message. | V3 test. |
| BP-12 | Custom rules require `id`, `check`, `fields`, `description`, and `code`; conditional rules require `when`. | Required set. | Function body. | V1/V3. |
| BP-13 | Unknown or type-incompatible rules fail compilation with a span. | Fail-closed. | Error text. | V3 compile-fail test. |
| BP-14 | No adapter implements interface-specific input validation. | Forbidden. | Conversion. | V2 scan; V3 test. |
| BP-15 | Documentation is English-only; non-English prose fails the English check. | Language. | Exempt code examples. | V3 test. |
| BP-16 | Documentation and examples contain no secrets. | Secret-free. | Patterns. | V3 test. |
| BP-17 | Documentation records `spec_version` and input digests. | Metadata. | Format. | V3 test. |
| BP-18 | REST is not required for schema dump or docgen; a non-REST project uses the same subcommands. | Independence. | Build tooling. | V3 test. |
| BP-19 | Generated files carry the generated marker and are never hand-edited. | Boundary. | Marker syntax. | V2 scan. |
| BP-20 | A feature that cannot follow the blueprint requires an amendment to this document, not a project fork. | Governance. | Version. | V4 review. |

---

## 7. Fixed and Open

| Fixed | Open |
|---|---|
| Crate/file layout, macro contract, runtime types, registry format. | Internal macro implementation and helper naming. |
| `inventory` registration and dump subcommands. | Renderer templates and Markdown styling. |
| Validation path and error mapping. | Error message wording. |
| Completeness/English/secret/determinism checks and exit codes. | Check implementation details. |
| CI commands. | CI provider and scheduling. |
| No REST dependency. | Schema backend selection within the neutral registry. |

---

## 8. Implementer Checklist

1. Add `contract-macros` and `validation-contract`.
2. Add `#[contract::input]` to every request type; derive `schemars::JsonSchema`.
3. Add `ContractValidate` to the `Operation::Request` bound. Implement
   `validate_json` before the idempotency claim and `prepare_validated` only on
   the acquired branch; replay uses `replay_authorize` only.
4. Add `*-docgen` with the four subcommands and both inventory dumps.
5. Add the completeness, English, secret, and determinism checks.
6. Add the CI commands.
7. Run `--check all` and make it pass.
8. Do not hand-write constraint tables or infer rules from code.

A project that skips a step is non-compliant, even if its documentation looks
complete.

---

# PART IV — DOCUMENT MAP AND SELF-CONTAINMENT

This package is self-contained. It requires no external document, file, or
repository. Every cross-reference in this document points to a part of this
same file. The expert reviewer does not need access to the source repository,
the project workspaces, or any separate specification.

| Part | Document |
|---|---|
| I | Expert Review Request |
| II | Normative Rules |
| III.1 | Foundation: Unify Seams, Not Substance |
| III.2 | Shared Contracts |
| III.3 | Core Crate |
| III.4 | Operation Crate |
| III.5 | Identity Crates |
| III.6 | REST Adapter |
| III.7 | WebSocket Adapter |
| III.8 | CLI Adapter |
| III.9 | gRPC Adapter |
| III.10 | MCP Adapter |
| III.11 | A2A Adapter |
| III.12 | Conformance Crate |
| III.13 | Project Template |
| III.14 | Migration |
| III.15 | Rule Registry |
| III.16 | Documentation Generation |
| III.17 | Validation Contract |
| III.18 | Implementation Blueprint |
| IV | Document Map and Self-Containment |

**End of package.**
