---
type: "Reference"
title: "EXEC_ASSETS/.gitignore"
description: "Ignore generated lab artifacts, private keys, and run outputs."
sources: 
  - resource: "EXEC_ASSETS/.gitignore"
    id: "exec-asset-gitignore"
    title: "EXEC_ASSETS/.gitignore"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/.gitignore"
x-asset-sha256: "afad7b57a0d686a610fee080e1b44fc31fcb6ec9a17480bea3a9307eee22a9e6"
x-content-sha256: "7bbb5eca728692cab74a6ae04944154fe8181dea7752608804a12f727fa0cb13"
x-requires: 
  - "pages/pre-okf-original/31-asset-map-and-edit-discipline"
x-source-span: "1-6"
x-topic: "exec-assets"
---
## EXEC_ASSETS/.gitignore

Ignore generated lab artifacts, private keys, and run outputs.

- role: Reference
- interface: none
- governing section: [31. Asset map and edit discipline](../pre-okf-original/31-asset-map-and-edit-discipline.md)
- asset hash: `afad7b57a0d686a610fee080e1b44fc31fcb6ec9a17480bea3a9307eee22a9e6`
- source span: lines 1-6

```text
private/
artifacts/
generated/
compose.json
inventory.json
__pycache__/
```

[^exec-asset-gitignore]

[^exec-asset-gitignore]: EXEC_ASSETS/.gitignore — lines 1-6.
