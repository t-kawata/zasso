---
type: CodeBlock
id: codeblock/22-identity-crates-4-token-profile-4-1-validation-order/1/070f3d83d776
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 070f3d83d776ac106c35b9da19732f17a55b2b9eca0a206c4e5b2428f44d9ff8
source: sources/22-IDENTITY.md
---
```text
alg allowlist
  → signature
  → iss
  → aud
  → exp / nbf
  → typ
  → sub
  → tenant / delegation
  → ver (token version)
  → jti revocation
```
