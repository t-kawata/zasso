---
type: Table
id: table/32-cli-adapter-11-implementation-contract-11-5-rules/1/e0510cd0ff12
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: e0510cd0ff125b2c28205c5cb4b718ad7fd1c1ea834a8f73b988ebf12cec7bf5
source: sources/32-CLI.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-15 | clap parsing types MUST be generated inside the CLI adapter and MUST NOT annotate operation-domain types. | Separation. | Command names. | V2 AST; V3 command test. |
| CLI-16 | The CLI MUST reject argv credential contents and MUST read secrets only from approved file, stdin, or TTY sources. | Sources. | Prompt text. | V2 scan; V3 process test. |
| CLI-17 | The CLI MUST reserve stdout for results and MUST use the fixed exit-code table for every termination path. | Channels and exits. | Message text. | V3 subprocess test. |
