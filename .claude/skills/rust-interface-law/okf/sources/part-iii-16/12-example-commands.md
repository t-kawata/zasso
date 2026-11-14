---
type: "Section"
title: "12. Example Commands"
description: "```bash"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-16/12-example-commands"
    title: "12. Example Commands"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-16/12-example-commands"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7116-7116"
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

---

# PART III.17 — Validation Contract

# 47 — Validation Contract

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2
**Documentation:** Part III.16

---

## 1. Purpose

