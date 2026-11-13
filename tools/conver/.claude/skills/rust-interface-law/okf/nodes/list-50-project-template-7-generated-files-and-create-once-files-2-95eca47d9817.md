---
type: List
id: list/50-project-template-7-generated-files-and-create-once-files/2/95eca47d9817
phase: scope
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 95eca47d9817899f27331284cbbe45b9af3839745e8c55620f003bba4bb114bf
source: sources/50-PROJECT-TEMPLATE.md
---
- same `spec_version` + profile + operation catalog + proto field ledger +
  request/response `JsonSchema` output + generator version → byte-identical
  generated output;
- a hand edit to a generated file is overwritten;
- a hand edit to a create-once file is preserved;
- the generated output hash is recorded and checked in CI.
