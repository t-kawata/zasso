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
