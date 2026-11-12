---
type: List
id: list/22-identity-crates-7-refresh-tokens-and-sessions-7-2-atomic-rotation/1/1ea1e5bcfb11
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 1ea1e5bcfb11b55ac02a7a95afb87fed39dbe2e8a742a0a8f0648792e1bad2e5
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
- The unique `(family_id, generation)` key prevents two next generations from
  being created for the same family.
- The loser of a concurrent refresh receives `invalid_grant` (recommended).
  If a project chooses idempotent grace instead, it MUST store the replacement
  token in an encrypted, short-lived cache; a hash alone cannot reproduce it.
  The project documents the threat model for that choice.
- A reuse after the grace window revokes the whole family.
- A token with `ver` below `users.token_version` is rejected even if the
  signature is valid.
- Family history rows are retained until the family expiry; revocation marks
  every non-consumed row in the family.
