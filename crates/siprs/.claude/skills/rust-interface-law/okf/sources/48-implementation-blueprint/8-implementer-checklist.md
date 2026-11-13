---
type: "Section"
title: "8. Implementer Checklist"
description: "1. Add `contract-macros` and `validation-contract`."
sources: 
  - resource: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
    id: "48-implementation-blueprint-8-implementer-checklist"
    title: "8. Implementer Checklist"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
x-source-span: "516-531"
---
## 8. Implementer Checklist

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

A project that skips a step is non-compliant, even if its documentation looks
complete.

