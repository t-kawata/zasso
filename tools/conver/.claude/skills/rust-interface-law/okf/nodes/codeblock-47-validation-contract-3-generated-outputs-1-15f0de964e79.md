---
type: CodeBlock
id: codeblock/47-validation-contract-3-generated-outputs/1/15f0de964e79
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 15f0de964e79d70f3fff0e2cf78f245f2355eb10e0cfd5413db98b49c3683362
source: sources/47-VALIDATION.md
---
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
