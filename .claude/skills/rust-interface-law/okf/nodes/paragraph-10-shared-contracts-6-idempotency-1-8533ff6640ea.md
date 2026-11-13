---
type: Paragraph
id: paragraph/10-shared-contracts-6-idempotency/1/8533ff6640ea
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 8533ff6640ea37928f0d2b07cea0d3c3698451cb61074283ec2830089af7d281
source: sources/10-CONTRACTS.md
---
Idempotency is namespaced by authenticated subject, tenant, and operation. A key
alone is not a global namespace. Every claim carries an ownership handle and a
fencing generation so that an expired worker cannot commit after a new owner has
acquired the work.
