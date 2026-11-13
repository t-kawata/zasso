---
type: "Section"
title: "1. Workspace Layout"
description: "```text"
sources: 
  - resource: "sources/50-PROJECT-TEMPLATE.md"
    id: "50-project-template-1-workspace-layout"
    title: "1. Workspace Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/50-PROJECT-TEMPLATE.md"
x-source-span: "14-58"
---
## 1. Workspace Layout

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

The shared crates are consumed from a versioned contract repository or vendored
for bootstrapping. They are never forked. A local modification is proposed
upstream and versioned.

A project MAY add `tooling`, `test-support`, `build-support`, or `utility`
crates. Their dependency edges are declared in `RULES-PROFILE.toml`; forbidden
runtime edges still apply.

---

