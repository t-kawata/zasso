---
type: List
id: list/30-rest-adapter-4-public-api/1/15b4283131de
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: 15b4283131de54e2fc653f98568a623ca00fc8141ef21dcb027001925f2a7a19
source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md
---
- **Public router**: `/health` and operations whose catalog authentication is
  `anonymous` (`auth.token.issue`, `auth.refresh`). They still go through
  `Dispatcher::execute_anonymous`; a public route is not a dispatcher bypass.
- **Protected router**: every operation whose catalog authentication is
  `required`, wrapped with the bearer middleware. The middleware verifies the
  token and its binding, then the operation authorizes the target.
