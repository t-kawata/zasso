---
type: List
id: list/48-implementation-blueprint-mandatory-4-docgen-binary-4-3-render-steps/1/5ad195283011
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 5ad195283011ef248e3075a1cce6008247a57387b08b7cefa0fdf693a2ba3a6e
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
1. Read catalog and bindings.
2. Read both registry JSON files.
3. For each operation, resolve request/response schemas and validation
   descriptors.
4. For each implemented profile, render its reference and, for REST, the
   OpenAPI document.
5. Run `check all`.
6. Write outputs atomically: write to a temporary directory, then rename.
