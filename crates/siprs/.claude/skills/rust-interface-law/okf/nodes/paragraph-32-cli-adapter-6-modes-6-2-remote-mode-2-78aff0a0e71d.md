---
type: Paragraph
id: paragraph/32-cli-adapter-6-modes-6-2-remote-mode/2/78aff0a0e71d
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: 78aff0a0e71dbfa873cca2d0257371f2dcab988ed3fc24ac4103d99a7d79e01f
source: docs/archive/IMPLEMENTATION-SPEC/32-CLI.md
---
The CLI MUST NOT pass both `--token-file` and a token in argv. A token in argv
is rejected before execution.
