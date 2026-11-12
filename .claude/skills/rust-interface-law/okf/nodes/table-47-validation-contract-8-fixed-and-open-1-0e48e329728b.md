---
type: Table
id: table/47-validation-contract-8-fixed-and-open/1/0e48e329728b
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 0e48e329728b98c446ae8960397df8f50fb625b6fbbbdd6b5e94ccbf76ef9cb5
source: docs/archive/IMPLEMENTATION-SPEC/47-VALIDATION.md
---
| Fixed | Open |
|---|---|
| Single declaration; three outputs. | Macro implementation, crate name, and internal expansion. |
| Standard conversion table and no false mapping. | Schema backend selection (`utoipa` or `schemars`). |
| Required custom-rule fields. | Rule function body and condition expression. |
| Common runtime validator path. | Dispatch integration details. |
| Descriptor-driven documentation. | Renderer and presentation. |
| English-only and secret-free. | Message wording. |
| Fail-closed on unknown or incompatible rules. | Error text. |
