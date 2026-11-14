---
type: "Section"
title: "3.2 Rules"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/3-2-rules"
    title: "3.2 Rules"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/3-2-rules"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "626-626"
---
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
| ARC-09 | Crate names MUST use the project prefix and the role suffix (`<project-c>-core`, `<project-c>-operation`, `<project-c>-rest`, and so on). | V4 review; manifest check. |
| ARC-10 | Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`. | V4 review. |

**Rationale for ARC-02 and ARC-03.** The dependency direction is the
architecture. If an operation can see an HTTP request or a JWT, the same
operation cannot be called from CLI, gRPC, MCP, or A2A without leaking that
transport into the other interfaces. The boundary is therefore enforced at the
crate graph level, not by review alone.

---

## 4. Operation Contract

## Rules in this section

- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../../rules/c/arc-01.md)
- [ARC-02 — Dependencies MUST follow `interface-* → *-operation → *-core` and `interface-...](../../rules/c/arc-02.md)
- [ARC-03 — `*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*...](../../rules/c/arc-03.md)
- [ARC-04 — An interface crate MUST NOT depend on another interface crate.](../../rules/c/arc-04.md)
- [ARC-05 — `*-conformance` MAY depend on every public boundary; no runtime crate may dep...](../../rules/c/arc-05.md)
- [ARC-06 — Only the assembly/binary MAY depend on concrete authentication implementation...](../../rules/c/arc-06.md)
- [ARC-07 — `*-core` MUST define ports (traits) for external effects; it MUST NOT call in...](../../rules/c/arc-07.md)
- [ARC-08 — `*-operation` MUST depend on `identity-core` traits, never on `identity-jwt` ...](../../rules/c/arc-08.md)
- [ARC-09 — Crate names MUST use the project prefix and the role suffix (`<project-c>-cor...](../../rules/c/arc-09.md)
- [ARC-10 — Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `...](../../rules/c/arc-10.md)

