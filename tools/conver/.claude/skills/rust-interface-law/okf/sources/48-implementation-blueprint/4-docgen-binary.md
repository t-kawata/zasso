---
type: "Section"
title: "4. Docgen Binary"
description: "```text"
sources: 
  - resource: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
    id: "48-implementation-blueprint-4-docgen-binary"
    title: "4. Docgen Binary"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
x-source-span: "374-461"
---
## 4. Docgen Binary

### 4.1 Subcommands

```text
<project>-docgen dump-schema      --out target/schema/registry.json
<project>-docgen dump-validation  --out target/validation/registry.json
<project>-docgen render           --catalog contract/operation-catalog.toml --out docs/generated
<project>-docgen check all
```

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

1. Read catalog and bindings.
2. Read both registry JSON files.
3. For each operation, resolve request/response schemas and validation
   descriptors.
4. For each implemented profile, render its reference and, for REST, the
   OpenAPI document.
5. Run `check all`.
6. Write outputs atomically: write to a temporary directory, then rename.

### 4.4 Check Implementations

| Check | Implementation |
|---|---|
| Completeness | Every catalog operation has request/response schema; every field has a schema property; every validation rule has a description; every implemented interface has a binding and a rendered section. |
| English | Scan prose fields (summaries, descriptions, rule descriptions, error messages, examples) for CJK Unified Ideographs, Hiragana, Katakana, and Hangul; reject. Code fences marked `non-english-example` are exempt. |
| Secrets | Reject `-----BEGIN`, `Bearer ` followed by 20+ characters, `sk-`, `AKIA`, `password=`, `secret=`, and configured secret patterns. |
| Determinism | Run render twice into two temporary directories; compare byte-for-byte. Sort maps; no timestamps, random values, absolute paths, or unordered iteration. |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Missing or incomplete artifact |
| 2 | Invalid input/catalog/schema |
| 3 | English-only violation |
| 4 | Secret violation |
| 5 | Non-deterministic output |

---

