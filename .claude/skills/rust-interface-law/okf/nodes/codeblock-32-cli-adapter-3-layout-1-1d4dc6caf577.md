---
type: CodeBlock
id: codeblock/32-cli-adapter-3-layout/1/1d4dc6caf577
phase: adapter
delivery: must
applies_to: cli
requires: []
references: []
content_sha256: 1d4dc6caf5772d688f70a7afb06df81a1446f3d1ecbea28cede46067353201e4
source: sources/32-CLI.md
---
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
