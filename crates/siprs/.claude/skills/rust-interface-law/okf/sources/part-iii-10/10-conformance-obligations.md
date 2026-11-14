---
type: "Section"
title: "10. Conformance Obligations"
description: "1. Every applicable operation has a tool; every tool maps to one operation."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-10/10-conformance-obligations"
    title: "10. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-10/10-conformance-obligations"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5117-5117"
---
## 10. Conformance Obligations

1. Every applicable operation has a tool; every tool maps to one operation.
2. Tool input/output schemas match the operation types.
3. Unauthenticated requests receive the spec-required challenge.
4. A token for another audience is rejected.
5. No token passthrough to a downstream API.
6. Every error category maps; no secrets in details.
7. No business state in MCP tables.
8. No direct handler call; dispatcher only.
9. `cargo test -p <project>-mcp` and `cargo clippy -p <project>-mcp -- -D
   warnings`.
10. The conformance report names `MCP-01` through `MCP-21`.

---

# PART III.11 — A2A Adapter

# 35 — A2A Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

