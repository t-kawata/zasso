---
type: "Section"
title: "7. Authorization"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/7-authorization"
    title: "7. Authorization"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/7-authorization"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "800-800"
---
## 7. Authorization

| ID | Rule | Verification |
|---|---|---|
| AUTHZ-01 | Authorization MUST be expressed as `Authorizer::require(identity, action, resource)`. | V1 trait; V4 review. |
| AUTHZ-02 | Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked. | V3 test. |
| AUTHZ-03 | Tenant and owner checks MUST use the identity and the loaded resource, not request-supplied IDs. | V3 cross-tenant test. |
| AUTHZ-04 | Anonymous operations MUST be explicitly declared. `Option<Identity>` must not be used to express "maybe anonymous". | V1 type; V3 test. |
| AUTHZ-05 | A target in another tenant MUST return not-found. A target in the caller's tenant with insufficient rights MUST return permission-denied. | V3 test. |
| AUTHZ-06 | Scope strings MUST NOT be compared in handlers or adapters; policy belongs in one authorizer implementation. | V2 string scan; V4 review. |
| AUTHZ-07 | Authorization and mutation races MUST be handled with a transaction or a conditional update. | V3 race test. |
| AUTHZ-08 | An interface-level pre-check MAY exist, but it MUST NOT replace the operation-level authorization. | V3 bypass test. |
| AUTHZ-09 | The same identity, action, and resource MUST produce the same authorization result through every interface. | V3 conformance test. |

---

## 8. Interface Adapters

## Rules in this section

- [AUTHZ-01 — Authorization MUST be expressed as `Authorizer::require(identity, action, res...](../../rules/c/authz-01.md)
- [AUTHZ-02 — Scope is necessary but never sufficient. Ownership, tenant, and resource stat...](../../rules/c/authz-02.md)
- [AUTHZ-03 — Tenant and owner checks MUST use the identity and the loaded resource, not re...](../../rules/c/authz-03.md)
- [AUTHZ-04 — Anonymous operations MUST be explicitly declared. `Option<Identity>` must not...](../../rules/c/authz-04.md)
- [AUTHZ-05 — A target in another tenant MUST return not-found. A target in the caller's te...](../../rules/c/authz-05.md)
- [AUTHZ-06 — Scope strings MUST NOT be compared in handlers or adapters; policy belongs in...](../../rules/c/authz-06.md)
- [AUTHZ-07 — Authorization and mutation races MUST be handled with a transaction or a cond...](../../rules/c/authz-07.md)
- [AUTHZ-08 — An interface-level pre-check MAY exist, but it MUST NOT replace the operation...](../../rules/c/authz-08.md)
- [AUTHZ-09 — The same identity, action, and resource MUST produce the same authorization r...](../../rules/c/authz-09.md)

