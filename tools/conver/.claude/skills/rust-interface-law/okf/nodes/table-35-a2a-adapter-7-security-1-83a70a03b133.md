---
type: Table
id: table/35-a2a-adapter-7-security/1/83a70a03b133
phase: adapter
delivery: reference
applies_to: a2a
requires: []
references: []
content_sha256: 83a70a03b133f0f0a53eadeeaf436d118113aead9d58385bca205daf6824e7e4
source: docs/archive/IMPLEMENTATION-SPEC/35-A2A.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-11 | The adopted A2A security scheme is implemented as declared in the agent card. | Scheme declaration and enforcement. | Scheme set. | V3 protocol test. |
| A2A-12 | Tokens are verified by the shared verifier with the A2A audience. | Verification path. | — | V3 test. |
| A2A-13 | A token for another interface is rejected. | Audience isolation. | — | V3 test. |
| A2A-14 | The adapter does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |
| A2A-15 | Secrets and tokens are not written to task state, logs, or errors. | Forbidden. | — | V2 scan; V3 test. |
