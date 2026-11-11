---
type: Paragraph
id: paragraph/21-operation-crate-4-dispatcher-and-contexts/3/285b999aa0c3
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 285b999aa0c365c599034fdcf10456530c1cdc6ebf055956b9d9db597b7a57df
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
`execute_verified` rejects a `VerifiedIdentity` whose binding does not match the
requested interface, audience, or expiry. A project cannot bypass this check by
constructing a context.
