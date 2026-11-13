---
type: CodeBlock
id: codeblock/47-validation-contract-2-declaration-syntax/1/18ae485e59b1
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 18ae485e59b10994d5c82ed42aa216951704f37b588bd023f26a5dc8d72e9379
source: sources/47-VALIDATION.md
---
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
