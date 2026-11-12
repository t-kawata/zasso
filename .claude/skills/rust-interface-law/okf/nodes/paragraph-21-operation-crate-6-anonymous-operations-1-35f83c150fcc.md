---
type: Paragraph
id: paragraph/21-operation-crate-6-anonymous-operations/1/35f83c150fcc
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 35f83c150fcce99b530ac93bd6774777e65af9cb8ae1890422806df7ae3d1e9e
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
`auth.token.issue` is an `AnonymousOperation`. It has no `VerifiedIdentity` and
no implicit anonymous principal. It receives an `AnonymousContext` with a
request ID, interface, audience, and peer info.
