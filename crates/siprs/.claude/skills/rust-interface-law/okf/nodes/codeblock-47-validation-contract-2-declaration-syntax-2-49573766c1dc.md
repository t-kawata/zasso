---
type: CodeBlock
id: codeblock/47-validation-contract-2-declaration-syntax/2/49573766c1dc
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 49573766c1dc875b641de4454a3a87099f67275ee7173c896d548ea8371028af
source: docs/archive/IMPLEMENTATION-SPEC/47-VALIDATION.md
---
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
