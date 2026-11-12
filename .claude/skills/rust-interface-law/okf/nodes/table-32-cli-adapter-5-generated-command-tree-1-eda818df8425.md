---
type: Table
id: table/32-cli-adapter-5-generated-command-tree/1/eda818df8425
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: eda818df84253cd6b6af3dbba82bcbd783ec06e2bd026af1045e1f8b6fc4b90e
source: docs/archive/IMPLEMENTATION-SPEC/32-CLI.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-01 | Argument types are generated separately from operation types. Clap attributes never appear on operation structs. | Separation. | Argument names. | V1; V2 derive scan. |
| CLI-02 | Every catalog operation has one subcommand. | One-to-one. | Command name. | V3 catalog test. |
| CLI-03 | A composition command is allowed only when documented and mapped to a sequence of operations. | Documentation. | Composition set. | V3 test. |
| CLI-04 | The command converts arguments into the operation request and calls the dispatcher. | Conversion path. | Argument mapping. | V3 test. |
