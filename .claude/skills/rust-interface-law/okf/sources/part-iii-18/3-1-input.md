---
type: "Section"
title: "3.1 Input"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/3-1-input"
    title: "3.1 Input"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/3-1-input"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7579-7579"
---
### 3.1 Input

```rust
#[contract::input]
#[derive(serde::Deserialize, schemars::JsonSchema)]
pub struct CreateAccountRequest {
    #[rule(length(min = 3, max = 32, unit = "unicode_scalar"),
            pattern = "^[a-z][a-z0-9_]*$",
            code = "invalid_account_name")]
    pub name: String,
}
```

`#[contract::input]` is an attribute macro. `#[rule(...)]` and `#[rule(custom(...))]`
are consumed by it. The struct MUST derive `serde::Deserialize` and
`schemars::JsonSchema`; a missing derive is a compile error caused by the
generated `schemars::schema_for!` call.

### 3.2 Parse

