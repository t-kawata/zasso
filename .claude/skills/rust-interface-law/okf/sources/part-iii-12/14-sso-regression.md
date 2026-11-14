---
type: "Section"
title: "14. SSO Regression"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/14-sso-regression"
    title: "14. SSO Regression"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/14-sso-regression"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5584-5584"
---
## 14. SSO Regression

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-42 | After SSO is added, existing operation signatures, subject IDs, and business data references are unchanged. | Invariant. | Provider set. | V3 regression test. |
| CONF-43 | An external ID token is rejected as an access token on every interface. | Rejection. | — | V3 test. |
| CONF-44 | An internal access token is rejected as an external ID token. | Rejection. | — | V3 test. |

---

## 14.1 Revision Tests (0.3.0)

## Rules in this section

- [CONF-42 — After SSO is added, existing operation signatures, subject IDs, and business ...](../../rules/p/conf-42.md)
- [CONF-43 — An external ID token is rejected as an access token on every interface.](../../rules/p/conf-43.md)
- [CONF-44 — An internal access token is rejected as an external ID token.](../../rules/p/conf-44.md)

