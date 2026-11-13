---
type: Paragraph
id: paragraph/10-shared-contracts-8-wire-envelope-and-protocol-bindings-8-1-bindings/2/72fff5f96ef6
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 72fff5f96ef65c031b9f4c4d35c1ac50828000f7387f93565d3cfbf797beeeaa
source: sources/10-CONTRACTS.md
---
The protobuf schema may use typed messages. It MUST carry the semantic
`Context` fields and the `request_id` on the reply. The universal "JSON bytes in
protobuf" rule from the previous version is withdrawn.
