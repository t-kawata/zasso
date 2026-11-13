---
type: List
id: list/21-operation-crate-8-idempotency/1/a952a4d496f1
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: a952a4d496f1c052bc6863c4aef6281604b640ed8a23fe3bb93ff2eec9f77d24
source: sources/21-OPERATION.md
---
- `none` — no idempotency;
- `same-transaction` — the idempotency record is part of the business unit of
  work;
- `external` — a leased external store with recovery.
