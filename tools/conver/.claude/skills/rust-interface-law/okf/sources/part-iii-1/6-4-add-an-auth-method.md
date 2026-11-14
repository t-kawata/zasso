---
type: "Section"
title: "6.4 Add an auth method"
description: "1. Implement `CredentialVerifier`."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-1/6-4-add-an-auth-method"
    title: "6.4 Add an auth method"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-1/6-4-add-an-auth-method"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1281-1281"
---
### 6.4 Add an auth method

1. Implement `CredentialVerifier`.
2. Resolve the internal `SubjectId`.
3. Call the existing `TokenIssuer`.
4. Add conformance cases for success, failure, and audience.

No change to operations or `VerifiedIdentity`.

### 6.5 Add an SSO provider

