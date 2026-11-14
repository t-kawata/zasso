---
type: "Section"
title: "6. Gate Policy"
description: "| Rule | Requirement |"
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "55-implementation-contracts-6-gate-policy"
    title: "6. Gate Policy"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/55-IMPLEMENTATION-CONTRACTS.md"
x-source-span: "92-104"
---
## 6. Gate Policy

| Rule | Requirement |
|---|---|
| Report | `implementation-check` writes a JSON report with one status per rule |
| Merge | `gate --implementation` merges report statuses into the manifest closure |
| Missing | A missing report is `not_run`, never a pass |
| Tests | A missing test, zero selected tests, or failed detector is `failed` |
| Identity | A spec_version, dist hash, or policy hash mismatch fails unless a scoped exception exists |
| Honesty | V1 process proof is not rule-level proof |

---

