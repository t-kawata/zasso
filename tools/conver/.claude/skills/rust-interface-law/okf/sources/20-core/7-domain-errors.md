---
type: "Section"
title: "7. Domain Errors"
description: "```rust"
sources: 
  - resource: "sources/20-CORE.md"
    id: "20-core-7-domain-errors"
    title: "7. Domain Errors"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/20-CORE.md"
x-source-span: "144-162"
---
## 7. Domain Errors

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

The operation layer maps `DomainError` to `OperationError`. The mapping table is
project-specific; the category mapping is fixed by `Part III.2` §5.8.

---

