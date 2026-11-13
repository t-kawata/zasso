---
type: Table
id: table/55-implementation-contracts-3-dependency-policy/1/97666a9dc449
phase: adapter
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 97666a9dc4498a200cad3cc6c937fd7afd55a933c3cc897e7848a1394956f813
source: docs/archive/IMPLEMENTATION-SPEC/55-IMPLEMENTATION-CONTRACTS.md
---
| Rule | Requirement |
|---|---|
| Pin | Every admitted crate uses an exact version in the policy |
| Features | Only the listed features are admitted; default features are explicit |
| Kind | Normal, build, and dev dependencies are distinguished |
| Edge | Adapter edges reach the dispatcher and identity contracts only |
| Forbidden | Adapter-to-operation-implementation and core-to-protocol-SDK edges fail |
| Source | Registry, path, and git sources follow the project source policy |
| Failure | Missing package, unresolved feature, unknown source, or metadata failure fails closed |
