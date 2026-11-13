---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-3-macro-contract-3-1-input/1/017ccd826564
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 017ccd8265644161aa60fb274ae7c05384b8f35391583a7d10cd925f0435456b
source: sources/48-IMPLEMENTATION-BLUEPRINT.md
---
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
