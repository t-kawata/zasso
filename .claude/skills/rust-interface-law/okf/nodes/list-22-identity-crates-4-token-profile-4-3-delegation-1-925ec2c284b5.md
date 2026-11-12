---
type: List
id: list/22-identity-crates-4-token-profile-4-3-delegation/1/925ec2c284b5
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 925ec2c284b59e64cf869fc938f2872507a68810910b3aa79d98af15a23a821a
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
- the actor is authorized to act for the subject;
- delegated scopes are a subset of both the actor's and the subject's scopes;
- `on_behalf_of` is explicit and is not inferred from `sub`;
- the `VerifiedIdentity` preserves `actor` and `on_behalf_of` for audit.
