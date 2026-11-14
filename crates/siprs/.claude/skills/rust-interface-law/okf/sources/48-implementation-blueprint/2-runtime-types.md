---
type: "Section"
title: "2. Runtime Types"
description: "```rust"
sources: 
  - resource: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
    id: "48-implementation-blueprint-2-runtime-types"
    title: "2. Runtime Types"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
x-source-span: "65-150"
---
## 2. Runtime Types

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

Numeric rule parameters are stored as string literals in the descriptor so the
descriptor can be a `const`/`static` value. The runtime check uses the parsed
Rust literal directly.

---

