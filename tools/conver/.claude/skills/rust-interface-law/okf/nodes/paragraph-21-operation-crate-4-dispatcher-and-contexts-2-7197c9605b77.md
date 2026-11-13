---
type: Paragraph
id: paragraph/21-operation-crate-4-dispatcher-and-contexts/2/7197c9605b77
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 7197c9605b77cc3a18281ace1d34fab1d1b89dacffb01a7f9984dde74a2b1a49
source: sources/21-OPERATION.md
---
The dispatcher, not the project, constructs `AuthenticatedContext` and
`AnonymousContext`. It checks the credential binding, authentication
requirement, scope, deadline, revocation, generated input validation, and
idempotency. It also exposes the unary and streaming entry points; adapters
never call a handler directly.
