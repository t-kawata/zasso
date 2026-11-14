---
type: "Section"
title: "7. Domain Errors"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-3/7-domain-errors"
    title: "7. Domain Errors"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-3/7-domain-errors"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3045-3045"
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

## 8. State Machines

