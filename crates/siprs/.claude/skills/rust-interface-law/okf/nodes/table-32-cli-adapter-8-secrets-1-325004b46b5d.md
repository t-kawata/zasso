---
type: Table
id: table/32-cli-adapter-8-secrets/1/325004b46b5d
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: 325004b46b5d6f48d7fee83eb933a44ae0204c5e467cd9cf7a54d8f6c99a87de
source: docs/archive/IMPLEMENTATION-SPEC/32-CLI.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-09 | Secrets are read from a file, stdin, or TTY. | Sources. | Prompt text. | V2 argv scan; V3 test. |
| CLI-10 | A secret in argv is rejected before any operation. | Rejection. | — | V3 test. |
| CLI-11 | Secrets are never written to stdout, logs, or error messages. | Forbidden. | — | V2 scan; V3 redaction test. |
| CLI-12 | Token files are checked for restrictive permissions. | Permission check. | Threshold. | V3 test. |
