---
type: Paragraph
id: paragraph/30-rest-adapter-7-error-mapping/1/f69c6ce4adc2
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: f69c6ce4adc22b560bd17b46c17009452786f66ddfb8f7e517d5e2daeddacb7e
source: sources/30-REST.md
---
`RestError` implements `IntoResponse`. It is used for pre-dispatch adapter
failures (malformed body, context conflict, missing or malformed bearer
header). Operation failures are returned as
`SemanticReply { request_id, error }`; they are not converted to `RestError`.
