---
type: List
id: list/foundation-unify-seams-not-substance-6-extension-model-6-5-add-an-sso-provider/1/073d8c4181cc
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 073d8c4181cc3e260808607e4abb274ce8197e957c5bc932f28ef0ee6c49b547
source: sources/00-FOUNDATION.md
---
1. Implement `SsoProvider` in `identity-sso`.
2. Verify the external token inside the provider.
3. Resolve `(issuer, subject)` through `ExternalIdentityRepository`.
4. Call `TokenIssuer` with the internal subject.
5. Add regression tests proving existing operations are unchanged.
