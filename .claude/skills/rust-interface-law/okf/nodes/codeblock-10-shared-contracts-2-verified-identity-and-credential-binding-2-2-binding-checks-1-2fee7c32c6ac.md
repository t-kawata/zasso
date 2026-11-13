---
type: CodeBlock
id: codeblock/10-shared-contracts-2-verified-identity-and-credential-binding-2-2-binding-checks/1/2fee7c32c6ac
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2fee7c32c6ac021b00de335562603fbb8b13c44dfecaad8c5817c4ee1cef565a
source: sources/10-CONTRACTS.md
---
```rust
binding.interface() == invocation.interface
binding.audience() == invocation.audience
binding.is_valid_at(now)
```
