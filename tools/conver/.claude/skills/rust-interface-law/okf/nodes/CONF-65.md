---
type: Rule
id: CONF-65
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b2b8ab72b14c2b0d82368558f22a5f4012efdee4ac744738ab449ea5a4309a8a
source: sources/15-RULE-REGISTRY.md
---
| `CONF-65` | P | conformance | CONF | Part III.12 | Generated validation runs before the idempotency claim for both replay and new requests; replay calls `replay_authorize` and not `prepare`. | V3 test. | cargo test -p <project>-conformance |
