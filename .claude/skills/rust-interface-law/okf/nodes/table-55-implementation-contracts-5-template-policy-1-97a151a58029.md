---
type: Table
id: table/55-implementation-contracts-5-template-policy/1/97a151a58029
phase: adapter
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 97a151a58029b327fd1d5744d17cb28d7b5a789758b1794de4d25ee5295f7873
source: sources/55-IMPLEMENTATION-CONTRACTS.md
---
| Rule | Requirement |
|---|---|
| Catalog | Each interface has a template manifest and test/implementation templates |
| Placeholder | Every placeholder resolves from discovery and effective policy; unresolved placeholder rejects the plan |
| Rules | Every generated file carries `RULE: <id>` |
| Modes | `create`, `append`, `merge-required`; no overwrite |
| Equality | Generated output equals regeneration from the admitted template and inputs |
| Delivery | Template bodies are not delivered by `context`; only the reference is delivered |
