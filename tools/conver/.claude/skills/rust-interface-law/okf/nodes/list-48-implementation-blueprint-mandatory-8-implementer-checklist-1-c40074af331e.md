---
type: List
id: list/48-implementation-blueprint-mandatory-8-implementer-checklist/1/c40074af331e
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: c40074af331ea5cc479cd51d15fff376fa03dbcd80ff275d4fc466b38d3a5e22
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
1. Add `contract-macros` and `validation-contract`.
2. Add `#[contract::input]` to every request type; derive `schemars::JsonSchema`.
3. Add `ContractValidate` to the `Operation::Request` bound. Implement
   `validate_json` before the idempotency claim and `prepare_validated` only on
   the acquired branch; replay uses `replay_authorize` only.
4. Add `*-docgen` with the four subcommands and both inventory dumps.
5. Add the completeness, English, secret, and determinism checks.
6. Add the CI commands.
7. Run `--check all` and make it pass.
8. Do not hand-write constraint tables or infer rules from code.
