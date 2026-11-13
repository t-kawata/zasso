---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-4-docgen-binary-4-1-subcommands/1/566f9132e410
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 566f9132e4104ec854fba4f9d5dd78a141cfab6126ce16ef9965a7847c951c58
source: sources/48-IMPLEMENTATION-BLUEPRINT.md
---
```text
<project>-docgen dump-schema      --out target/schema/registry.json
<project>-docgen dump-validation  --out target/validation/registry.json
<project>-docgen render           --catalog contract/operation-catalog.toml --out docs/generated
<project>-docgen check all
```
