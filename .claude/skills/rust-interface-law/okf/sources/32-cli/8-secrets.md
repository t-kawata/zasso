---
type: "Section"
title: "8. Secrets"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/32-CLI.md"
    id: "32-cli-8-secrets"
    title: "8. Secrets"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/32-CLI.md"
x-source-span: "216-226"
---
## 8. Secrets

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-09 | Secrets are read from a file, stdin, or TTY. | Sources. | Prompt text. | V2 argv scan; V3 test. |
| CLI-10 | A secret in argv is rejected before any operation. | Rejection. | — | V3 test. |
| CLI-11 | Secrets are never written to stdout, logs, or error messages. | Forbidden. | — | V2 scan; V3 redaction test. |
| CLI-12 | Token files are checked for restrictive permissions. | Permission check. | Threshold. | V3 test. |

---

