---
type: "Section"
title: "4.2 Registry JSON"
description: "`dump-schema` output:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/4-2-registry-json"
    title: "4.2 Registry JSON"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/4-2-registry-json"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7811-7811"
---
### 4.2 Registry JSON

`dump-schema` output:

```json
{
  "types": [
    {
      "type_name": "CreateAccountRequest",
      "schema": { "$schema": "https://json-schema.org/draft/2020-12/schema" }
    }
  ]
}
```

`dump-validation` output:

```json
{
  "types": [
    {
      "type_name": "CreateAccountRequest",
      "fields": [
        {
          "field": "name",
          "error_code": "invalid_account_name",
          "rules": [
            {
              "kind": "length",
              "params": { "min": 3, "max": 32, "unit": "unicode_scalar" },
              "error_code": "invalid_account_name",
              "description": "3 to 32 Unicode scalar values."
            }
          ]
        }
      ],
      "custom_rules": []
    }
  ]
}
```

Both dumps sort types and fields by name and use LF line endings.

### 4.3 Render Steps

