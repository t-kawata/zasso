---
type: "Section"
title: "6.5 Add an SSO provider"
description: "1. Implement `SsoProvider` in `identity-sso`."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-1/6-5-add-an-sso-provider"
    title: "6.5 Add an SSO provider"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-1/6-5-add-an-sso-provider"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1290-1290"
---
### 6.5 Add an SSO provider

1. Implement `SsoProvider` in `identity-sso`.
2. Verify the external token inside the provider.
3. Resolve `(issuer, subject)` through `ExternalIdentityRepository`.
4. Call `TokenIssuer` with the internal subject.
5. Add regression tests proving existing operations are unchanged.

No change to business tables or operations.

### 6.6 Add an interface

