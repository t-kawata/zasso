---
type: "Section"
title: "14. SSO Regression"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-14-sso-regression"
    title: "14. SSO Regression"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "254-263"
---
## 14. SSO Regression

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-42 | After SSO is added, existing operation signatures, subject IDs, and business data references are unchanged. | Invariant. | Provider set. | V3 regression test. |
| CONF-43 | An external ID token is rejected as an access token on every interface. | Rejection. | — | V3 test. |
| CONF-44 | An internal access token is rejected as an external ID token. | Rejection. | — | V3 test. |

---

