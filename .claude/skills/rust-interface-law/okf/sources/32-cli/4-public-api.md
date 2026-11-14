---
type: "Section"
title: "4. Public API"
description: "```rust"
sources: 
  - resource: "sources/32-CLI.md"
    id: "32-cli-4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/32-CLI.md"
x-source-span: "71-81"
---
## 4. Public API

```rust
pub fn run(args: impl IntoIterator<Item = String>) -> ExitCode;
```

`run` is the only entry point. It parses arguments, selects local or remote
mode, invokes the operation, writes the result, and returns the exit code.

---

