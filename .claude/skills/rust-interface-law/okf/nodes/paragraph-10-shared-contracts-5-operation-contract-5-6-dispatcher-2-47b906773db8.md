---
type: Paragraph
id: paragraph/10-shared-contracts-5-operation-contract-5-6-dispatcher/2/47b906773db8
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 47b906773db82090cf298f66fd987a0129bb62ad230db16c5417ba1545979a92
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
`execute_verified` MUST reject an identity whose binding does not match
`interface`, `audience`, or `expires_at`, and MUST consult the configured
`RevocationChecker` (Part III.2 §3.4). `execute_anonymous` MUST reject an
operation whose `AUTH` is `Required`.
