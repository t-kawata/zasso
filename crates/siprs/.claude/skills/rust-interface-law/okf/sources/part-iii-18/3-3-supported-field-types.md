---
type: "Section"
title: "3.3 Supported Field Types"
description: "| Rust type | Allowed rules |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/3-3-supported-field-types"
    title: "3.3 Supported Field Types"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/3-3-supported-field-types"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7606-7606"
---
### 3.3 Supported Field Types

| Rust type | Allowed rules |
|---|---|
| `String`, `&str`, `Cow<'_, str>` | `length`, `pattern`, `enum`, `required` |
| `u8`..`u64`, `i8`..`i64`, `f32`, `f64` | `range`, `enum`, `required` |
| `Vec<T>` | `items`, `required` |
| `Option<T>` | inner rules with `inner(...)`; `required` applies to the option itself |
| other types | only `custom`, or an explicit `unsupported_type` compile error |

A standard rule on any other type is a compile error with the field span.

### 3.4 Emitted Code

