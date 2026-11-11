---
type: Paragraph
id: paragraph/21-operation-crate-11-errors/1/2b6f6e51b945
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 2b6f6e51b9453a79a2628942f128dae649dc3e670ec5f5c3972f458a61af59d4
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
`error/mapping.rs` maps `DomainError` to `OperationError`. Every
`DomainErrorCode` has a mapping; an unknown code is a defect and fails the
build. Adapters receive `OperationErrorBody`; the internal `source` is never
serialized.
