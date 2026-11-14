---
type: "Section"
title: "1. Crates and Files"
description: "```text"
sources: 
  - resource: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
    id: "48-implementation-blueprint-1-crates-and-files"
    title: "1. Crates and Files"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
x-source-span: "17-64"
---
## 1. Crates and Files

```text
crates/
├── contract-macros/                 # proc-macro crate
│   ├── Cargo.toml                   # syn 2, quote, proc-macro2
│   └── src/
│       ├── lib.rs                   # #[contract::input], #[rule]
│       ├── parse.rs                 # struct/field/rule parsing
│       ├── expand.rs                # ContractValidate + descriptor + schema
│       └── error.rs                 # syn::Error with spans
├── validation-contract/             # runtime crate
│   ├── Cargo.toml                   # inventory, schemars, serde
│   └── src/
│       ├── lib.rs
│       ├── validate.rs              # ContractValidate, ValidationErrors
│       ├── descriptor.rs            # ValidationDescriptor, RuleParams
│       ├── rules.rs                 # length/range/items/pattern/enum helpers
│       └── registry.rs              # inventory registrations
├── <project>-operation/
│   └── src/validation.rs            # ValidationErrors -> OperationError
└── <project>-docgen/
    ├── Cargo.toml                   # depends on <project>-operation
    └── src/
        ├── main.rs                  # subcommands
        ├── catalog.rs               # operation catalog loader
        ├── schema.rs                # schema registry loader
        ├── validation.rs            # validation registry loader
        ├── bindings.rs              # interface bindings
        ├── render/
        │   ├── rest.rs
        │   ├── websocket.rs
        │   ├── cli.rs
        │   ├── grpc.rs
        │   ├── mcp.rs
        │   └── a2a.rs
        └── check/
            ├── completeness.rs
            ├── english.rs
            ├── secrets.rs
            └── determinism.rs
```

`*-docgen` depends on `<project>-operation` so that `inventory` registrations
are linked into the binary. It does not start any server.

---

