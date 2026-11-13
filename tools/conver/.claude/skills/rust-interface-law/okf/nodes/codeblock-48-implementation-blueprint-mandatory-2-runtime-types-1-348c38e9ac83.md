---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-2-runtime-types/1/348c38e9ac83
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 348c38e9ac833629b6954412d2e426f467bb6155d27c29a4eda5ef555a61898b
source: sources/48-IMPLEMENTATION-BLUEPRINT.md
---
```rust
// validation-contract
pub trait ContractValidate {
    fn validate(&self) -> Result<(), ValidationErrors>;
}

pub struct ValidationErrors {
    pub errors: Vec<ValidationError>,
}

pub struct ValidationError {
    pub field: &'static str,
    pub code: ErrorCode,
    pub message: String,
}

pub enum LengthUnit {
    UnicodeScalar,
    Bytes,
    Graphemes,
}

pub enum RegexEngine {
    Ecma262,
    RustRegex,
}

pub enum RuleParams {
    Length { min: u64, max: u64, unit: LengthUnit },
    Range { min: Option<&'static str>, max: Option<&'static str>, exclusive: bool },
    Items { min: u64, max: u64 },
    Pattern { expression: &'static str, engine: RegexEngine },
    Enum { variants: &'static [&'static str] },
    Custom { id: &'static str },
}

pub struct RuleDescriptor {
    pub kind: &'static str,
    pub params: RuleParams,
    pub error_code: ErrorCode,
    pub description: Option<&'static str>,
}

pub struct FieldDescriptor {
    pub field: &'static str,
    pub rules: &'static [RuleDescriptor],
    pub error_code: Option<ErrorCode>,
}

pub struct CustomRuleDescriptor {
    pub id: &'static str,
    pub fields: &'static [&'static str],
    pub description: &'static str,
    pub error_code: ErrorCode,
    pub when: Option<&'static str>,
}

pub struct ValidationDescriptor {
    pub type_name: &'static str,
    pub fields: &'static [FieldDescriptor],
    pub custom_rules: &'static [CustomRuleDescriptor],
}

pub struct ValidationRegistration {
    pub descriptor: &'static ValidationDescriptor,
}

pub struct SchemaRegistration {
    pub type_name: &'static str,
    pub schema: fn() -> schemars::Schema,
}

inventory::collect!(ValidationRegistration);
inventory::collect!(SchemaRegistration);

pub use inventory;
```
