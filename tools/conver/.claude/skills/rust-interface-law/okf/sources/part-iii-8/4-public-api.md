---
type: "Section"
title: "4. Public API"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-8/4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-8/4-public-api"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4530-4530"
---
## 4. Public API

```rust
pub fn run(args: impl IntoIterator<Item = String>) -> ExitCode;
```

`run` is the only entry point. It parses arguments, selects local or remote
mode, invokes the operation, writes the result, and returns the exit code.

---

## 5. Generated Command Tree

