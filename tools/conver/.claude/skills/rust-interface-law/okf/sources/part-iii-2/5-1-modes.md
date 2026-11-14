---
type: "Section"
title: "5.1 Modes"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/5-1-modes"
    title: "5.1 Modes"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/5-1-modes"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1855-1855"
---
### 5.1 Modes

```rust
pub enum OperationMode {
    Unary,
    ServerStream,
    ClientStream,
    Bidirectional,
}
```

### 5.2 Authenticated operation

