---
type: CodeBlock
id: codeblock/22-identity-crates-3-layout/1/2915d3456dcf
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2915d3456dcfc80ef7efe71b3c04d3be2ac1c4a688f8c9d18e27fde19c411f66
source: sources/22-IDENTITY.md
---
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
