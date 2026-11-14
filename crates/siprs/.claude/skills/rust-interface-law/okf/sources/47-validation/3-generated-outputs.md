---
type: "Section"
title: "3. Generated Outputs"
description: "The type examples below are conceptual. The exact implementation types —"
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "47-validation-3-generated-outputs"
    title: "3. Generated Outputs"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/47-VALIDATION.md"
x-source-span: "84-133"
---
## 3. Generated Outputs

The type examples below are conceptual. The exact implementation types —
including const-friendly rule parameters, static slices, and `inventory`
registrations — are fixed in Part III.18.

`#[contract::input]` generates:

```rust
pub trait ContractValidate {
    fn validate(&self) -> Result<(), ValidationErrors>;
}

pub struct ValidationDescriptor {
    pub type_name: &'static str,
    pub fields: std::collections::BTreeMap<&'static str, FieldRules>,
    pub custom_rules: Vec<CustomRuleDescriptor>,
}

pub struct FieldRules {
    pub rules: Vec<RuleDescriptor>,
    pub error_code: Option<ErrorCode>,
}

pub struct RuleDescriptor {
    pub kind: RuleKind,
    pub parameters: serde_json::Value,
    pub error_code: ErrorCode,
    pub description: Option<&'static str>,
}

pub struct CustomRuleDescriptor {
    pub id: &'static str,
    pub fields: Vec<&'static str>,
    pub description: &'static str,
    pub error_code: ErrorCode,
    pub when: Option<&'static str>,
}
```

The macro emits:

- `impl ContractValidate for CreateAccountRequest`;
- schema attributes for the configured schema backend;
- `const VALIDATION: ValidationDescriptor` (or an equivalent accessor);
- a registration entry in the generated validation registry consumed by the
  documentation generator.

---

