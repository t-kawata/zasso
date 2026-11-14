---
type: "Section"
title: "2. Declaration Syntax"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-17/2-declaration-syntax"
    title: "2. Declaration Syntax"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-17/2-declaration-syntax"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7162-7162"
---
## 2. Declaration Syntax

```rust
#[contract::input]
#[derive(serde::Deserialize)]
pub struct CreateAccountRequest {
    #[rule(
        length(min = 3, max = 32, unit = "unicode_scalar"),
        pattern = "^[a-z][a-z0-9_]*$",
        code = "invalid_account_name"
    )]
    pub name: String,

    #[rule(
        range(min = 1, max = 100),
        code = "invalid_member_limit"
    )]
    pub member_limit: u32,

    #[rule(
        items(min = 1, max = 10),
        code = "invalid_tags"
    )]
    pub tags: Vec<String>,
}
```

`#[contract::input]` and `#[rule(...)]` are shared contract macros, not
`utoipa` APIs. The macro is owned by the shared `contract-macros` crate.

Custom, cross-field rules are attached to the type:

```rust
#[contract::input]
#[rule(custom(
    id = "date_range_order",
    check = validate_date_range,
    fields = ["start_at", "end_at"],
    description = "start_at must not be later than end_at.",
    code = "invalid_date_range"
))]
pub struct ExportRequest {
    pub start_at: i64,
    pub end_at: i64,
}

fn validate_date_range(value: &ExportRequest) -> Result<(), RuleViolation> {
    if value.start_at <= value.end_at {
        Ok(())
    } else {
        Err(RuleViolation::new())
    }
}
```

---

## 3. Generated Outputs

