---
type: "Section"
title: "12. Example Commands"
description: "```bash"
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "45-documentation-12-example-commands"
    title: "12. Example Commands"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/45-DOCUMENTATION.md"
x-source-span: "223-238"
---
## 12. Example Commands

```bash
# Neutral schema + catalog + bindings -> all interface references
cargo run -p <project>-docgen -- \
  --catalog contract/operation-catalog.toml \
  --schema target/schema/registry.json \
  --out docs/generated

# REST-only OpenAPI check (when the REST profile is enabled)
cargo run -p <project>-docgen -- --check openapi docs/generated/rest/openapi.json

# Completeness, English-only, determinism, and secret gates
cargo run -p <project>-docgen -- --check all
```

