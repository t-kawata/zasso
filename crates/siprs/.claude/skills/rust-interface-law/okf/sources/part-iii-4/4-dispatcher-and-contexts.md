---
type: "Section"
title: "4. Dispatcher and Contexts"
description: "The dispatcher is provided by `operation-contract`. The project constructs it"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/4-dispatcher-and-contexts"
    title: "4. Dispatcher and Contexts"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/4-dispatcher-and-contexts"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3195-3195"
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

