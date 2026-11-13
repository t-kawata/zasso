---
type: CodeBlock
id: codeblock/20-core-crate-8-state-machines/1/fa94a2cfa173
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: fa94a2cfa1732366593365f8ebdfba6a02acf6970d672f71a39f5d8822a5f837
source: sources/20-CORE.md
---
```rust
pub enum <Aggregate>State { /* variants */ }

pub enum <Aggregate>Event { /* triggers */ }

pub fn transition(
    state: &<Aggregate>State,
    event: &<Aggregate>Event,
) -> Result<<Aggregate>State, DomainError>;
```
