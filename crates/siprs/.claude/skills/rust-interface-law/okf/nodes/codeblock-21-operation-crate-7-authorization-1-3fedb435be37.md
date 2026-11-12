---
type: CodeBlock
id: codeblock/21-operation-crate-7-authorization/1/3fedb435be37
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3fedb435be37989dafa2632562d9ab5d58ea5151001a9b315e7a7d19544fdeb6
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
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
