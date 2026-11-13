---
type: Table
id: table/32-cli-adapter-7-output-and-exit-codes/1/7b29182c792c
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: 7b29182c792ce280baff79d5db48a1aa897868dcaae44f1902371075d56713f8
source: sources/32-CLI.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-05 | Data goes to stdout; progress and diagnostics go to stderr. | Channels. | Format. | V3 test. |
| CLI-06 | `--json` emits one JSON value; `--jsonl` emits one JSON object per line. | Modes. | Field set. | V3 test. |
| CLI-07 | Human output is not parsed by scripts; JSON is the machine contract. | Contract. | Human formatting. | V4 review. |
| CLI-08 | Exit codes follow the fixed table. | Table. | Message text. | V3 test. |
| CLI-13 | JSON/JSONL output includes the operation's `request_id`. | Field. | Placement. | V3 test. |
| CLI-14 | The remote client is a protocol client, not an interface-adapter dependency. | Boundary. | Client implementation. | V2 dependency check. |
