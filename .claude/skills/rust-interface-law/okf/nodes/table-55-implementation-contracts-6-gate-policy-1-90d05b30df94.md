---
type: Table
id: table/55-implementation-contracts-6-gate-policy/1/90d05b30df94
phase: adapter
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 90d05b30df940198b9614228ff429b414dc44e8e52ef849a550557f4bc18c4ee
source: docs/archive/IMPLEMENTATION-SPEC/55-IMPLEMENTATION-CONTRACTS.md
---
| Rule | Requirement |
|---|---|
| Report | `implementation-check` writes a JSON report with one status per rule |
| Merge | `gate --implementation` merges report statuses into the manifest closure |
| Missing | A missing report is `not_run`, never a pass |
| Tests | A missing test, zero selected tests, or failed detector is `failed` |
| Identity | A spec_version, dist hash, or policy hash mismatch fails unless a scoped exception exists |
| Honesty | V1 process proof is not rule-level proof |
