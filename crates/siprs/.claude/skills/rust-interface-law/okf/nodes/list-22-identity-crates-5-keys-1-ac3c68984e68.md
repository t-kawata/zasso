---
type: List
id: list/22-identity-crates-5-keys/1/ac3c68984e68
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: ac3c68984e685050ad952dbe65f9e955b771b6d0c485fc780d7a6184536c49f0
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
- Multiple active public keys are required for rotation.
- Private keys never leave `identity-core`.
- Key material is validated at startup; invalid keys fail startup.
- JWKS refresh uses a fixed URL and a fixed policy.
- Fail-closed on unknown `kid`, unsupported algorithm, or key parse failure.
