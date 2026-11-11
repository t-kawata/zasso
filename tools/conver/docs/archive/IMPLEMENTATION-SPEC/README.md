# Implementation Spec — Index

**Status:** Normative
**Version:** 0.3.2

This directory is the concrete layer beneath `docs/IMPLEMENTATION-RULES.md`.
The rules define obligations; this spec defines the exact seams, crate layouts,
public APIs, generated files, and conformance harness.

The design principle is in `00-FOUNDATION.md`:

> Unify the seams. Free the substance. Generate the mechanics. Prove the
> behavior.

---

## Document Map

| File | Content |
|---|---|
| `00-FOUNDATION.md` | Open/closed sets, rule classes, extension model, no-limitation guarantees. |
| `10-CONTRACTS.md` | Shared Rust types, traits, envelope, error categories, conformance harness. |
| `20-CORE.md` | `*-core` layout, ports, domain errors, state machines. |
| `21-OPERATION.md` | `*-operation` layout, dispatcher, pipeline, authorization, idempotency, transactions, events. |
| `22-IDENTITY.md` | Identity crates, token profile, login, refresh tokens, SSO. |
| `30-REST.md` | HTTP adapter, bearer auth, status/error mapping, OpenAPI. |
| `31-WEBSOCKET.md` | Upgrade ticket, envelope, connection state, ordering, backpressure. |
| `32-CLI.md` | Command generation, local/remote modes, output, exit codes, secrets. |
| `33-GRPC.md` | Proto generation, metadata auth, status mapping, streaming. |
| `34-MCP.md` | Tool mapping, authorization discovery/challenge, no token passthrough. |
| `35-A2A.md` | Agent card, task mapping, spec security, streaming. |
| `40-CONFORMANCE.md` | Operation × interface matrix, negative suite, parity, report. |
| `50-PROJECT-TEMPLATE.md` | Workspace layout, catalog schema, required files, naming, build. |
| `90-MIGRATION.md` | gaia/crystal/doors mapping and migration order. |
| `15-RULE-REGISTRY.md` | Canonical rule ID index, classes, sources, duplicate detection. |

---

## Reading Order

1. `00-FOUNDATION.md` — why the rules do not limit features.
2. `10-CONTRACTS.md` — the exact seams.
3. `20` and `21` — core and operation implementation.
4. `22` — identity and authentication.
5. `30`–`35` — interface adapters.
6. `40` — how compliance is proven.
7. `50` — the workspace every project starts from.
8. `90` — how existing projects reach the target.
9. `15` — the canonical rule registry and duplicate check.

---

## Rule Classes

| Class | Meaning |
|---|---|
| **C** | Closed contract: the seam is fixed. |
| **G** | Generated: the file is derived from the catalog. |
| **O** | Open extension: how to add something new. |
| **P** | Proof: how compliance is demonstrated. |

Every rule in `docs/IMPLEMENTATION-RULES.md` states its **Fixed** and **Open**
parts. A rule that enumerates a closed feature set is a defect.

---

## Applying the Spec

1. Add `RULES-PROFILE.toml` with `spec_version` and the implemented profiles.
2. Add the shared contract and identity crates at the pinned version.
3. Create `contract/operation-catalog.toml` and, for gRPC, the proto field ledger.
4. Generate the operation skeletons, interface bindings, and conformance matrix.
5. Implement the domain and operation bodies.
6. Make `*-conformance` pass every cell and every rule ID.
7. Adopt only the interface profiles the project needs; the recommended order is
   REST → WebSocket → CLI → gRPC → MCP → A2A.
8. Add SSO last, behind the fixed login contract.

A project is complete when the conformance report has no `Fail` and no missing
rule, not when it compiles.

---

## Current Status

This directory is a complete normative specification. The remaining work is
implementation, not specification:

- publish the shared contract crates and conformance kit;
- implement the generator from the operation catalog;
- build a golden reference that passes every interface;
- migrate doors first, then gaia, then crystal.

Until the shared crates and generator exist, “almost complete unification” is a
target, not a measured result. The conformance report is what turns it into a
measurement.
