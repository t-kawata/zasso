---
type: "Section"
title: "5. Cargo.toml"
description: "```toml"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-13/5-cargo-toml"
    title: "5. Cargo.toml"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-13/5-cargo-toml"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5908-5908"
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

