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
