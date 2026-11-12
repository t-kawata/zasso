---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-5-ci-gates/1/3436139a4fec
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3436139a4fec57a8fc5d6952595053e17672ee877f4934caec9bface2c524daf
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
```bash
cargo run -p <project>-docgen -- dump-schema --out target/schema/registry.json
cargo run -p <project>-docgen -- dump-validation --out target/validation/registry.json
cargo run -p <project>-docgen -- render --catalog contract/operation-catalog.toml --out docs/generated
cargo run -p <project>-docgen -- check all
cargo test -p <project>-conformance
```
