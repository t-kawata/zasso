---
type: List
id: list/22-identity-crates-9-negative-authentication-tests/1/d772cf100824
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: d772cf100824c24cb0727e2a9114eea4ed3982f2c05c79b5f5ff575e3f2e56ff
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
- missing required claim (`jti`, `ver`, `iat`);
- future `nbf`;
- wrong claim type (for example `sub` as a number);
- `ver` below the user's token version;
- revoked `jti`;
- concurrent refresh with one winner;
- refresh reuse inside and outside the grace window;
- family revocation after reuse;
- delegation with an unauthorized actor;
- delegation with scopes exceeding the actor or subject;
- `on_behalf_of` inconsistent with `act`.
