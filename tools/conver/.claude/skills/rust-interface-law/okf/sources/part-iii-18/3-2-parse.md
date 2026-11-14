---
type: "Section"
title: "3.2 Parse"
description: "1. Parse `syn::ItemStruct`."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/3-2-parse"
    title: "3.2 Parse"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/3-2-parse"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7597-7597"
---
### 3.2 Parse

1. Parse `syn::ItemStruct`.
2. For each field, read `#[rule(...)]`.
3. Reject a rule on an unsupported type.
4. For a custom rule, verify every name in `fields` exists on the struct.
5. Validate that `code` is a non-empty string literal.
6. Validate that `description` is non-empty and English-only for custom rules.

### 3.3 Supported Field Types

