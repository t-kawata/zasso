---
type: Paragraph
id: paragraph/15-rule-registry-4-rule-id-grammar/1/f599973fc294
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: f599973fc2946dbd6cebbbb8e839f254b7327fc907f3803756e49a3000a91ec4
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
IDs are permanent. A removed rule keeps its ID and is marked `REMOVED`; IDs
are never reused. Detailed rules may reference a parent rule, but they must
not reuse the parent ID for a different obligation.
