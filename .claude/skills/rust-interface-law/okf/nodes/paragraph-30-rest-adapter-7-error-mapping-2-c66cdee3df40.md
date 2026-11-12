---
type: Paragraph
id: paragraph/30-rest-adapter-7-error-mapping/2/c66cdee3df40
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: c66cdee3df40827ed21287225a3044490a84973cce9f2b36468a3cccc3cfd79a
source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md
---
For adapter-level errors, `RestError` writes the same semantic error shape and
uses a generated request ID when the request did not carry one.
