---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "22-identity-3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/22-IDENTITY.md"
x-source-span: "37-52"
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

