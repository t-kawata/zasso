---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/3-layout"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3548-3548"
---
## 3. Layout

```text
identity-core/src/
  identity/{subject,verified,scope,audience,binding}.rs
  auth/{verifier,issuer,credentials,key_store,error}.rs
  jwt/{mod,claims,verifier,issuer,keys}.rs        # feature = "jwt"
  ticket/{mod,store}.rs                           # feature = "ticket"

identity-local/src/{lib,password}.rs
identity-operation/src/{lib,login,token_issue,external_identity}.rs
identity-sso/src/{lib,oidc,state}.rs
```

---

## 4. Token Profile

