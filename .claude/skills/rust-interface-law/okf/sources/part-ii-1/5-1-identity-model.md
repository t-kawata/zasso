---
type: "Section"
title: "5.1 Identity model"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/5-1-identity-model"
    title: "5.1 Identity model"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/5-1-identity-model"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "700-700"
---
### 5.1 Identity model

| ID | Rule | Verification |
|---|---|---|
| ID-01 | `SubjectId` MUST be an internal, immutable identifier. Email addresses and external provider IDs MUST NOT be used as `sub`. | V1 newtype; V3 token test. |
| ID-02 | Operations MUST receive exactly one identity type: `VerifiedIdentity`. A duplicate `Principal` type is forbidden. | V2 type scan; V4 review. |
| ID-03 | `VerifiedIdentity` MUST be constructible only by the verifier. Fields MUST be private; the constructor MUST be `pub(crate)` or equivalent. | V1 visibility; V3 compile-fail test. |
| ID-04 | `VerifiedIdentity` MUST NOT implement `Deserialize` or any public constructor. | V1; V3 compile-fail test. |
| ID-05 | Delegated execution MUST distinguish the actor from the subject: `actor` and `on_behalf_of` MUST be separate fields. | V1 type; V3 test. |
| ID-06 | Operations MUST NOT receive a raw JWT, `iss`, external account ID, or provider name. | V2 import/type scan. |

### 5.2 Authentication contracts

## Rules in this section

- [ID-01 — `SubjectId` MUST be an internal, immutable identifier. Email addresses and ex...](../../rules/c/id-01.md)
- [ID-02 — Operations MUST receive exactly one identity type: `VerifiedIdentity`. A dupl...](../../rules/c/id-02.md)
- [ID-03 — `VerifiedIdentity` MUST be constructible only by the verifier. Fields MUST be...](../../rules/c/id-03.md)
- [ID-04 — `VerifiedIdentity` MUST NOT implement `Deserialize` or any public constructor.](../../rules/c/id-04.md)
- [ID-05 — Delegated execution MUST distinguish the actor from the subject: `actor` and ...](../../rules/c/id-05.md)
- [ID-06 — Operations MUST NOT receive a raw JWT, `iss`, external account ID, or provide...](../../rules/c/id-06.md)

