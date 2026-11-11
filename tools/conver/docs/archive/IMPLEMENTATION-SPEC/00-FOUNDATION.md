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
