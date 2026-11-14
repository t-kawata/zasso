---
type: "Section"
title: "1. Purpose"
description: "Every implemented interface MUST have generated, English usage documentation."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "45-documentation-1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/45-DOCUMENTATION.md"
x-source-span: "10-25"
---
## 1. Purpose

Every implemented interface MUST have generated, English usage documentation.
Documentation is a build artifact, not a hand-maintained parallel text.

The generator does not parse Rust source code. It consumes a neutral schema
registry, the operation catalog, the interface bindings, the validation
descriptor registry, and the shared contracts. `utoipa`/OpenAPI is one schema
source and one REST output; it is not the only input and it is not required for
non-REST interfaces.

The mandatory implementation method — crates, macro expansion, inventory
registries, docgen subcommands, and gates — is Part III.18.

---

