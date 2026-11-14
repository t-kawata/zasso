---
type: "Section"
title: "4. Public API"
description: "`src/api/mod.rs` re-exports only what other crates may use:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-3/4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-3/4-public-api"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2978-2978"
---
## 4. Public API

`src/api/mod.rs` re-exports only what other crates may use:

```rust
pub use crate::model::*;
pub use crate::state::*;
pub use crate::error::DomainError;
pub use crate::ports::*;
```

`model`, `state`, and `ports` modules SHOULD be `pub` only through `api`.
Internal helpers stay private.

---

## 5. Domain Model Rules

