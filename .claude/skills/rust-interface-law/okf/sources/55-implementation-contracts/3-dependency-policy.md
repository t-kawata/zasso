---
type: "Section"
title: "3. Dependency Policy"
description: "| Rule | Requirement |"
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "55-implementation-contracts-3-dependency-policy"
    title: "3. Dependency Policy"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/55-IMPLEMENTATION-CONTRACTS.md"
x-source-span: "52-65"
---
## 3. Dependency Policy

| Rule | Requirement |
|---|---|
| Pin | Every admitted crate uses an exact version in the policy |
| Features | Only the listed features are admitted; default features are explicit |
| Kind | Normal, build, and dev dependencies are distinguished |
| Edge | Adapter edges reach the dispatcher and identity contracts only |
| Forbidden | Adapter-to-operation-implementation and core-to-protocol-SDK edges fail |
| Source | Registry, path, and git sources follow the project source policy |
| Failure | Missing package, unresolved feature, unknown source, or metadata failure fails closed |

---

