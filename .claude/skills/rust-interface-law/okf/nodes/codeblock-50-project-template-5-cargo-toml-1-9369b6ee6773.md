---
type: CodeBlock
id: codeblock/50-project-template-5-cargo-toml/1/9369b6ee6773
phase: scope
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 9369b6ee67735065f8ff9d105bd370463139ab194487f1455438e1d0d9800de7
source: sources/50-PROJECT-TEMPLATE.md
---
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
