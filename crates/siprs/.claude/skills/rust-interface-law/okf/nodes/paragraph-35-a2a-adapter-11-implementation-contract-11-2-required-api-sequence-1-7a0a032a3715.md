---
type: Paragraph
id: paragraph/35-a2a-adapter-11-implementation-contract-11-2-required-api-sequence/1/7a0a032a3715
phase: adapter
delivery: reference
applies_to: a2a
requires: []
references: []
content_sha256: 7a0a032a3715de37f08336c5c75dbce68001e2ad9c9eb0c6661d1a644bf52a2d
source: docs/archive/IMPLEMENTATION-SPEC/35-A2A.md
---
Agent card -> SDK request handler -> shared executor -> dispatcher -> external TaskStore -> durable event log -> send/stream response -> cancellation/resubscribe.
