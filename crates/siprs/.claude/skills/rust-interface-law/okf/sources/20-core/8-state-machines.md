---
type: "Section"
title: "8. State Machines"
description: "Every aggregate with a lifecycle MUST define:"
sources: 
  - resource: "sources/20-CORE.md"
    id: "20-core-8-state-machines"
    title: "8. State Machines"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/20-CORE.md"
x-source-span: "163-183"
---
## 8. State Machines

Every aggregate with a lifecycle MUST define:

```rust
pub enum <Aggregate>State { /* variants */ }

pub enum <Aggregate>Event { /* triggers */ }

pub fn transition(
    state: &<Aggregate>State,
    event: &<Aggregate>Event,
) -> Result<<Aggregate>State, DomainError>;
```

A transition that is not listed in the table returns `DomainError` with the
project's `invalid_state` code. A missing transition is a defect, not a runtime
fallback.

---

