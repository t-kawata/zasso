---
type: "Section"
title: "5. CI Gates"
description: "```bash"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/5-ci-gates"
    title: "5. CI Gates"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/5-ci-gates"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7888-7888"
---
## 5. CI Gates

```bash
cargo run -p <project>-docgen -- dump-schema --out target/schema/registry.json
cargo run -p <project>-docgen -- dump-validation --out target/validation/registry.json
cargo run -p <project>-docgen -- render --catalog contract/operation-catalog.toml --out docs/generated
cargo run -p <project>-docgen -- check all
cargo test -p <project>-conformance
```

A missing `docs/generated/` directory or a non-zero exit fails the build.

---

## 6. Mandatory Rules

