---
type: CodeBlock
id: codeblock/50-project-template-1-workspace-layout/1/72bb0073c56b
phase: scope
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 72bb0073c56b466299416522726f4203de6a325447d5fb1c8a8958f36e843d17
source: sources/50-PROJECT-TEMPLATE.md
---
```text
<project>/
├── Cargo.toml
├── RULES-PROFILE.toml
├── SYSTEM-DESIGN.md
├── contract/
│   ├── operation-catalog.toml
│   ├── proto-field-ledger.toml
│   └── audience.toml
├── proto/
│   └── <project>.v1.proto          # generated, checked in, grpc profile only
└── crates/
    ├── operation-contract/          # shared
    ├── interface-contract/          # shared
    ├── contract-macros/             # shared input/rule macros
    ├── validation-contract/         # shared runtime validator and registry
    ├── identity-core/               # shared
    ├── identity-jwt/                # shared facade
    ├── identity-local/              # shared
    ├── identity-operation/          # shared
    ├── identity-sso/                # shared, optional
    ├── <project>-core/
    ├── <project>-operation/
    ├── <project>-conformance/
    ├── <project>-rest/              # only if rest profile
    ├── <project>-websocket/         # only if websocket profile
    ├── <project>-cli/               # only if cli profile
    ├── <project>-grpc/              # only if grpc profile
    ├── <project>-mcp/               # only if mcp profile
    ├── <project>-a2a/               # only if a2a profile
    └── <project>-assembly/
```
