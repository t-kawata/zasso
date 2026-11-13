---
type: CodeBlock
id: codeblock/50-project-template-9-build-and-verification/1/60b1ed849f65
phase: scope
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 60b1ed849f650f83f48852640bf1261218bb146974aaefd6ea329573501d709f
source: sources/50-PROJECT-TEMPLATE.md
---
```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test -p <project>-conformance
cargo test --workspace
cargo metadata --format-version 1 > /dev/null
cargo run -p <project>-docgen -- dump-schema --out target/schema/registry.json
cargo run -p <project>-docgen -- dump-validation --out target/validation/registry.json
cargo run -p <project>-docgen -- render --catalog contract/operation-catalog.toml --out docs/generated
cargo run -p <project>-docgen -- check all
node scripts/rules/check-registry.mjs
node scripts/generate/check-determinism.mjs
```
