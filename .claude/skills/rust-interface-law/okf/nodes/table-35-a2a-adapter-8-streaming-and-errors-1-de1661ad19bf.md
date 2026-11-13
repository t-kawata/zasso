---
type: Table
id: table/35-a2a-adapter-8-streaming-and-errors/1/de1661ad19bf
phase: adapter
delivery: reference
applies_to: a2a
requires: []
references: []
content_sha256: de1661ad19bf14972b8cf1361fa78f5098a0eb5c7bc2294333f9977783cc90f3
source: sources/35-A2A.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-16 | Task updates use the A2A-defined event model, not an ad-hoc envelope. | Event model. | Payload. | V3 test. |
| A2A-17 | Streaming termination distinguishes success, failure, and cancellation. | Distinction. | Detail. | V3 test. |
| A2A-18 | Every operation category has an A2A error mapping. | Coverage. | Detail text. | V3 mapping test. |
| A2A-19 | Error details never contain tokens, secrets, or raw provider responses. | Forbidden. | — | V2 scan; V3 test. |
