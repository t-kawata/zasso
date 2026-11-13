---
type: List
id: list/90-migration-8-step-5-dispatcher-and-authorization/1/c082d701c722
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: c082d701c722c1114c47d7854ac9057cf7ca0c454d3ec7ec7b353586bb0b2f0f
source: sources/90-MIGRATION.md
---
1. Add `Dispatcher` and `OperationRegistry` to `<project>-operation`.
2. Route every handler through the dispatcher.
3. Replace handler-level role checks with `Authorizer::require`.
4. Keep adapters as thin as possible; remove business checks from them.
5. Add the bypass test: an adapter cannot invoke a handler directly.
