---
type: "Rule"
title: "OP-AUTH-03 — Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`."
description: "Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "op-auth-03"
    title: "OP-AUTH-03"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OP-AUTH"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OP-AUTH-03"
x-source-part: "Part III.4"
x-source-span: "265-265"
x-verification: "V3 test."
---
# OP-AUTH-03

Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OP-AUTH |
| Source part | Part III.4 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[7. Authorization](../../sources/part-iii-4/7-authorization.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [OP-AUTH-01 — Scope is checked by the dispatcher; ownership/tenant by the authorizer.](op-auth-01.md)
- [OP-AUTH-02 — The authorizer uses the loaded resource, never request IDs alone.](op-auth-02.md)
- [OP-AUTH-04 — Replay is authorized through `replay_authorize` against the recorded target, ...](op-auth-04.md)
- [OP-AUTH-05 — The same identity and resource produce the same result through every interface.](op-auth-05.md)

[^op-auth-03]: sources/EXPERT-REVIEW-PACKAGE.md

