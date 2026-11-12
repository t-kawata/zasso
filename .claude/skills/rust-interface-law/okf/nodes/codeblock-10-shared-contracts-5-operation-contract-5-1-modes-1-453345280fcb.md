---
type: CodeBlock
id: codeblock/10-shared-contracts-5-operation-contract-5-1-modes/1/453345280fcb
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 453345280fcbb9e6cd9e8e00f6294c0d688673fefb3cb0c82af2f3428804a42a
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
```rust
pub enum OperationMode {
    Unary,
    ServerStream,
    ClientStream,
    Bidirectional,
}
```
