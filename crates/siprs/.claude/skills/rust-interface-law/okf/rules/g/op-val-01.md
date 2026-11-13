---
type: "Rule"
title: "OP-VAL-01 — Every request type implements the generated `ContractValidate` and is validated before the idempotency claim. Replay uses `replay_authorize` and does not call `prepare`."
description: "Every request type implements the generated `ContractValidate` and is validated before the idempotency claim. Replay uses `replay_authorize` and does not call `prepare`."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-val-01"
    title: "OP-VAL-01"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OP-VAL"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "G"
x-rule-id: "OP-VAL-01"
x-source-part: "Part III.4"
x-source-span: "186-186"
x-verification: "V3 test."
---
# OP-VAL-01

Every request type implements the generated `ContractValidate` and is validated before the idempotency claim. Replay uses `replay_authorize` and does not call `prepare`.

| Field | Value |
|---|---|
| Class | G |
| Applies to | all |
| Parent | OP-VAL |
| Source part | Part III.4 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Handler Protocol](../../sources/21-operation/5-handler-protocol.md)

[^op-val-01]: sources/21-OPERATION.md

