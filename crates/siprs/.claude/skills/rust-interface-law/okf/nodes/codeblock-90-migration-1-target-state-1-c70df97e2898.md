---
type: CodeBlock
id: codeblock/90-migration-1-target-state/1/c70df97e2898
phase: review
delivery: must
applies_to: all
requires: []
references: []
content_sha256: c70df97e28981f7aaf4e1552b82827a1668ca7814c87721181528abdfefdac8c
source: docs/archive/IMPLEMENTATION-SPEC/90-MIGRATION.md
---
```text
<project>/
├── RULES-PROFILE.toml
├── SYSTEM-DESIGN.md
├── contract/operation-catalog.toml
├── proto/<project>.v1.proto
└── crates/
    ├── operation-contract/      # shared
    ├── interface-contract/      # shared
    ├── identity-core/           # shared
    ├── identity-jwt/            # shared facade
    ├── identity-local/          # shared
    ├── identity-operation/      # shared
    ├── identity-sso/            # shared, optional
    ├── <project>-core/
    ├── <project>-operation/
    ├── <project>-conformance/
    ├── <project>-rest/
    ├── <project>-websocket/
    ├── <project>-cli/
    ├── <project>-grpc/
    ├── <project>-mcp/
    ├── <project>-a2a/
    └── <project>-assembly/
```
