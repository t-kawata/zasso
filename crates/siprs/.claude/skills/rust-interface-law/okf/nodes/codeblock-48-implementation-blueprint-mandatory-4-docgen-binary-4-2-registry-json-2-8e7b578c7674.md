---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-4-docgen-binary-4-2-registry-json/2/8e7b578c7674
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 8e7b578c76747f566df57a720cfb8471c682a03761a4474d3352fe25d0a0e9bb
source: sources/48-IMPLEMENTATION-BLUEPRINT.md
---
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
