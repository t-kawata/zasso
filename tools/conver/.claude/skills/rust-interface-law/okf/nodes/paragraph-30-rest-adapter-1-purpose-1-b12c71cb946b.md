---
type: Paragraph
id: paragraph/30-rest-adapter-1-purpose/1/b12c71cb946b
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: b12c71cb946bb5b7860421f2be38f6e4c71b550f284ccfde2ebba643c4023b54
source: sources/30-REST.md
---
`*-rest` is a thin HTTP adapter. It extracts the bearer token, verifies it,
converts the HTTP body to the operation request, calls the dispatcher, converts
the result, and maps errors to HTTP. It contains no business logic.
