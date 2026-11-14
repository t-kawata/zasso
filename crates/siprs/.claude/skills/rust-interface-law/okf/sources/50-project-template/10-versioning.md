---
type: "Section"
title: "10. Versioning"
description: "`spec_version` covers the rules, contracts, generator, and conformance kit."
sources: 
  - resource: "sources/50-PROJECT-TEMPLATE.md"
    id: "50-project-template-10-versioning"
    title: "10. Versioning"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/50-PROJECT-TEMPLATE.md"
x-source-span: "371-387"
---
## 10. Versioning

`spec_version` covers the rules, contracts, generator, and conformance kit.
Protocol SDK versions are recorded separately in `Cargo.toml` and the protocol
config.

| Artifact | Version source |
|---|---|
| Rules + contracts + generator + conformance kit | `spec_version` |
| Protocol SDKs | `Cargo.toml` + `Cargo.lock` |
| MCP/A2A specification | `McpConfig`/`A2aConfig` and `SYSTEM-DESIGN.md` |

A project upgrade changes `spec_version`, regenerates, and reruns conformance.
It is never implicit drift.

---

