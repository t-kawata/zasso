---
type: CodeBlock
id: codeblock/50-project-template-4-schema-source/1/571d81a3959a
phase: scope
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 571d81a3959ac61781942dc09bdc63cf2f8971e5ed3167f31feafe1fe0309818
source: docs/archive/IMPLEMENTATION-SPEC/50-PROJECT-TEMPLATE.md
---
```rust
#[contract::input]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct AccountAddRequest {
    #[rule(length(min = 1, max = 100), code = "invalid_name")]
    pub name: String,

    #[rule(pattern = "^[^@]+@[^@]+$", code = "invalid_email")]
    pub email: String,
}
```
