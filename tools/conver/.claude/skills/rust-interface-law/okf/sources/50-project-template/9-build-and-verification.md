---
type: "Section"
title: "9. Build and Verification"
description: "```bash"
sources: 
  - resource: "sources/50-PROJECT-TEMPLATE.md"
    id: "50-project-template-9-build-and-verification"
    title: "9. Build and Verification"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/50-PROJECT-TEMPLATE.md"
x-source-span: "348-370"
---
## 9. Build and Verification

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

The conformance crate is the authoritative gate. `cargo test --workspace` alone
does not prove cross-interface parity, rule coverage, documentation coverage, or
generation determinism. The docgen `--check all` gate covers completeness,
English-only, secret-free, and deterministic output.

---

