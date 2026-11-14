---
type: "Section"
title: "11. Implementation Contract"
description: "`clap = { version = \"=4.5.50\", features = [\"derive\"] }`; `reqwest = { version = \"=0.12.24\", features = [\"json\", \"rustls-tls\", \"stream\"] }`; `tonic = { version = \"=0.14.2\", features = [\"transport\", \"co"
sources: 
  - resource: "sources/32-CLI.md"
    id: "32-cli-11-implementation-contract"
    title: "11. Implementation Contract"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/32-CLI.md"
x-source-span: "254-279"
---
## 11. Implementation Contract

### 11.1 Cargo contract

`clap = { version = "=4.5.50", features = ["derive"] }`; `reqwest = { version = "=0.12.24", features = ["json", "rustls-tls", "stream"] }`; `tonic = { version = "=0.14.2", features = ["transport", "codegen"] }`; `rpassword = "=7.4.0"`; `zeroize = "=1.8.2"`.

### 11.2 Required API sequence

Fallible parse -> validation -> explicit local/REST/gRPC mode -> credential source -> verifier or client -> dispatcher -> output renderer -> exit category.

### 11.3 Forbidden patterns

clap attributes on operation types, argv credential contents, stdout progress, implicit mode fallback, exit code 1 as a generic default.

### 11.4 Template

`templates/cli/`.

### 11.5 Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-15 | clap parsing types MUST be generated inside the CLI adapter and MUST NOT annotate operation-domain types. | Separation. | Command names. | V2 AST; V3 command test. |
| CLI-16 | The CLI MUST reject argv credential contents and MUST read secrets only from approved file, stdin, or TTY sources. | Sources. | Prompt text. | V2 scan; V3 process test. |
| CLI-17 | The CLI MUST reserve stdout for results and MUST use the fixed exit-code table for every termination path. | Channels and exits. | Message text. | V3 subprocess test. |

## Rules in this section

- [CLI-15 — clap parsing types MUST be generated inside the CLI adapter and MUST NOT anno...](../../rules/c/cli-15.md)
- [CLI-16 — The CLI MUST reject argv credential contents and MUST read secrets only from ...](../../rules/c/cli-16.md)
- [CLI-17 — The CLI MUST reserve stdout for results and MUST use the fixed exit-code tabl...](../../rules/c/cli-17.md)

