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
