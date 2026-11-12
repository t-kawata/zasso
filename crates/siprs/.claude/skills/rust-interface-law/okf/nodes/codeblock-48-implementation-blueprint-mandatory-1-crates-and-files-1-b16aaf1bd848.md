---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-1-crates-and-files/1/b16aaf1bd848
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b16aaf1bd848506f69188c3e73af80374682f216d9cad4f27717cc48e4cd6ad6
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
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
