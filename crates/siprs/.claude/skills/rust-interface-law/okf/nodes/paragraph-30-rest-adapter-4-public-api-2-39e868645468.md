---
type: Paragraph
id: paragraph/30-rest-adapter-4-public-api/2/39e868645468
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: 39e8686454687a70013013e102158fe72ff9059008fc86f660b87eb313779557
source: sources/30-REST.md
---
Every endpoint uses the semantic envelope `{context?, request}` and returns
`{request_id, result}` or `{request_id, error}`. Aliases are path/method sugar
over the same envelope; they do not use a different wire shape.
