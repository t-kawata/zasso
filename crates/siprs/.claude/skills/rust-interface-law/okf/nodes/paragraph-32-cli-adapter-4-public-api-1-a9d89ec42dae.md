---
type: Paragraph
id: paragraph/32-cli-adapter-4-public-api/1/a9d89ec42dae
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: a9d89ec42daea9bf394a50081ba31b3e4fd88edfba4b3907e6043b596987b026
source: docs/archive/IMPLEMENTATION-SPEC/32-CLI.md
---
`run` is the only entry point. It parses arguments, selects local or remote
mode, invokes the operation, writes the result, and returns the exit code.
