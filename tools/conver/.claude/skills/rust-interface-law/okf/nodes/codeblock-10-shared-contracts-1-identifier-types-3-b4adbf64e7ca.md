---
type: CodeBlock
id: codeblock/10-shared-contracts-1-identifier-types/3/b4adbf64e7ca
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b4adbf64e7ca069151465a39428f9f28ee11bdf88d1bbdf427bc74254c9e4a7c
source: sources/10-CONTRACTS.md
---
```rust
#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ResourceId(Box<str>);
impl ResourceId {
    pub fn new(value: impl Into<Box<str>>) -> Self;
    pub fn as_str(&self) -> &str;
}
```
