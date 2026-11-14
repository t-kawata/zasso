---
type: "Section"
title: "4. Public API"
description: "`src/api/mod.rs` re-exports only what other crates may use:"
sources: 
  - resource: "sources/20-CORE.md"
    id: "20-core-4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/20-CORE.md"
x-source-span: "77-92"
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

