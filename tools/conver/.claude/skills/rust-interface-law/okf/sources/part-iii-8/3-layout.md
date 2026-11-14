---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-8/3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-8/3-layout"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4498-4498"
---
## 3. Layout

```text
*-cli/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # run(), ExitCode
    ├── commands/
    │   ├── mod.rs
    │   ├── generated.rs        # generated command tree from the catalog
    │   └── common.rs           # --json, --timeout-ms, --endpoint, ...
    ├── local/
    │   ├── mod.rs
    │   ├── principal.rs        # explicit local principal
    │   └── verifier.rs         # LocalCredentialVerifier
    ├── remote/
    │   ├── mod.rs
    │   ├── rest.rs             # remote REST client
    │   └── grpc.rs             # remote gRPC client
    ├── output/
    │   ├── mod.rs
    │   ├── json.rs
    │   └── human.rs
    ├── error/
    │   └── exit.rs             # error -> exit code
    └── tests/
```

---

## 4. Public API

