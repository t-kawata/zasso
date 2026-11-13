---
type: CodeBlock
id: codeblock/20-core-crate-7-domain-errors/1/55dab3301cc7
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 55dab3301cc72d9933e54e8a01a0143f24792a58ea708fd0d3d252f8b90a5558
source: sources/20-CORE.md
---
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
