---
type: List
id: list/10-shared-contracts-2-verified-identity-and-credential-binding-2-3-delegation/1/43f0309e606c
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 43f0309e606cc1a078d114d713dfb201afa754d52051cd359e161afa404a4f73
source: sources/10-CONTRACTS.md
---
- the actor is authorized to act for the subject;
- the delegated scopes are a subset of both the actor's and the subject's
  scopes;
- `on_behalf_of` is explicit and is never inferred from `sub`.
