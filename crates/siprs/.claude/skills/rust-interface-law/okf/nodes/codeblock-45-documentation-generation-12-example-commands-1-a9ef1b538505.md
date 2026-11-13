---
type: CodeBlock
id: codeblock/45-documentation-generation-12-example-commands/1/a9ef1b538505
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: a9ef1b53850542f100b35aa5186c8787cc6d12b672d9003b784fa339720a8502
source: sources/45-DOCUMENTATION.md
---
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
