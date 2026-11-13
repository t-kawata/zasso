---
type: "Section"
title: "7. Output and Exit Codes"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/32-CLI.md"
    id: "32-cli-7-output-and-exit-codes"
    title: "7. Output and Exit Codes"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/32-CLI.md"
x-source-span: "189-215"
---
## 7. Output and Exit Codes

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-05 | Data goes to stdout; progress and diagnostics go to stderr. | Channels. | Format. | V3 test. |
| CLI-06 | `--json` emits one JSON value; `--jsonl` emits one JSON object per line. | Modes. | Field set. | V3 test. |
| CLI-07 | Human output is not parsed by scripts; JSON is the machine contract. | Contract. | Human formatting. | V4 review. |
| CLI-08 | Exit codes follow the fixed table. | Table. | Message text. | V3 test. |
| CLI-13 | JSON/JSONL output includes the operation's `request_id`. | Field. | Placement. | V3 test. |
| CLI-14 | The remote client is a protocol client, not an interface-adapter dependency. | Boundary. | Client implementation. | V2 dependency check. |

Exit code table:

| Code | Meaning |
|---|---|
| 0 | Success or normal EOF |
| 2 | Argument or configuration error |
| 3 | Authentication or authorization failure |
| 4 | Target, state, or conflict error |
| 5 | Network or external failure |
| 6 | Timeout or cancellation |
| 7 | Internal error |
| 8 | Capacity or unsupported |
| 130 | SIGINT |

---

