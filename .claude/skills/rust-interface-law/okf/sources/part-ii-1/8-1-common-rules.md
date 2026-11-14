---
type: "Section"
title: "8.1 Common rules"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/8-1-common-rules"
    title: "8.1 Common rules"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/8-1-common-rules"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "818-818"
---
### 8.1 Common rules

| ID | Rule | Verification |
|---|---|---|
| IF-01 | An adapter MUST only: extract credentials, convert input, call the verifier, call the operation, convert output, and map errors. | V4 review; V2 business-logic scan. |
| IF-02 | An adapter MUST NOT implement business rules, authorization policy, or persistence. | V2 import scan; V4 review. |
| IF-03 | Credential extraction MUST be adapter-specific; verification MUST call the shared `AccessTokenVerifier`. | V2 import scan; V3 test. |
| IF-04 | Protocol errors MUST be mapped from the protocol-independent error vocabulary. Adapters MUST NOT invent operation errors. | V3 mapping test. |
| IF-05 | Every implemented interface MUST expose every operation unless the operation is explicitly declared not applicable, with a reason. | V3 matrix test. |
| IF-06 | No interface may call another interface to reach an operation. | V2 dependency check. |
| IF-07 | Protocol state (connection, subscription, task, stream) MUST remain in the adapter or in `*-operation` state, never duplicated in both. | V4 review; V3 state test. |
| IF-08 | Every response MUST carry the operation's `request_id`; streaming messages MUST carry a correlation identifier. | V3 test. |

### 8.2 Interface-specific rules

## Rules in this section

- [IF-01 — An adapter MUST only: extract credentials, convert input, call the verifier, ...](../../rules/c/if-01.md)
- [IF-02 — An adapter MUST NOT implement business rules, authorization policy, or persis...](../../rules/c/if-02.md)
- [IF-03 — Credential extraction MUST be adapter-specific; verification MUST call the sh...](../../rules/c/if-03.md)
- [IF-04 — Protocol errors MUST be mapped from the protocol-independent error vocabulary...](../../rules/c/if-04.md)
- [IF-05 — Every implemented interface MUST expose every operation unless the operation ...](../../rules/c/if-05.md)
- [IF-06 — No interface may call another interface to reach an operation.](../../rules/c/if-06.md)
- [IF-07 — Protocol state (connection, subscription, task, stream) MUST remain in the ad...](../../rules/c/if-07.md)
- [IF-08 — Every response MUST carry the operation's `request_id`; streaming messages MU...](../../rules/c/if-08.md)

