---
type: "Rule"
title: "DOC-09 — OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references."
description: "OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-09"
    title: "DOC-09"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "docs"
x-enforcement: "cargo run -p <project>-docgen -- --check all"
x-parent: "DOC"
x-phase: "docs"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "G"
x-rule-id: "DOC-09"
x-source-part: "Part III.16"
x-source-span: "182-182"
x-verification: "V3 diff test."
---
# DOC-09

OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references.

| Field | Value |
|---|---|
| Class | G |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 diff test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[1. Registry](../../sources/part-iii-15/1-registry.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [BP-01 — This blueprint is the mandatory implementation method for validation and docu...](../c/bp-01.md)
- [BP-02 — Every request type uses `#[contract::input]` and implements `ContractValidate`.](../c/bp-02.md)
- [BP-03 — The macro emits the validator, descriptor, schema registration, and inventory...](../c/bp-03.md)
- [BP-04 — `Operation::Request` has a `ContractValidate` bound. `validate_json` runs bef...](../c/bp-04.md)
- [BP-05 — `validation-contract` owns the runtime types and `inventory` registrations in...](../c/bp-05.md)
- [BP-06 — Rule parameters are const-friendly and serialized to the exact JSON format in...](../c/bp-06.md)
- [BP-07 — `*-docgen` provides the four subcommands in §4.1 and depends on the operation...](../c/bp-07.md)
- [BP-08 — The schema registry is authoritative for all interfaces; `utoipa` output is c...](../c/bp-08.md)
- [BP-09 — Completeness, English, secrets, and determinism checks follow §4.4 and the ex...](../c/bp-09.md)
- [BP-10 — Generated documentation is written atomically and sorted deterministically.](bp-10.md)
- [BP-11 — A missing operation/interface/field/rule/description fails the build.](../c/bp-11.md)
- [BP-12 — Custom rules require `id`, `check`, `fields`, `description`, and `code`; cond...](../c/bp-12.md)
- [BP-13 — Unknown or type-incompatible rules fail compilation with a span.](../c/bp-13.md)
- [BP-14 — No adapter implements interface-specific input validation.](../c/bp-14.md)
- [BP-15 — Documentation is English-only; non-English prose fails the English check.](../c/bp-15.md)
- [BP-16 — Documentation and examples contain no secrets.](../c/bp-16.md)
- [BP-17 — Documentation records `spec_version` and input digests.](../c/bp-17.md)
- [BP-18 — REST is not required for schema dump or docgen; a non-REST project uses the s...](../c/bp-18.md)
- [BP-19 — Generated files carry the generated marker and are never hand-edited.](bp-19.md)
- [BP-20 — A feature that cannot follow the blueprint requires an amendment to this docu...](../c/bp-20.md)
- [DOC-01 — Every implemented interface MUST have generated usage documentation.](doc-01.md)
- [DOC-02 — The operation catalog is the authoritative operation list and binding map.](../c/doc-02.md)
- [DOC-03 — The generator MUST consume a neutral schema registry, not parse Rust source.](../c/doc-03.md)
- [DOC-04 — `utoipa`/OpenAPI MAY be used as a schema source and REST output, but MUST NOT...](../c/doc-04.md)
- [DOC-05 — Interface-specific documentation MUST come from interface bindings, not be in...](../c/doc-05.md)
- [DOC-06 — Documentation generation MUST NOT require a running REST server or REST adapter.](doc-06.md)
- [DOC-07 — Every operation section MUST include schema, examples, auth, errors, idempote...](../c/doc-07.md)
- [DOC-08 — Every implemented interface MUST have a reference section for every applicabl...](../c/doc-08.md)
- [DOC-10 — A missing operation, interface, field, error category, auth statement, or exa...](../c/doc-10.md)
- [DOC-11 — Generated documentation MUST be English-only; a non-English string fails the ...](doc-11.md)
- [DOC-12 — Generation MUST be deterministic for the same inputs and version.](doc-12.md)
- [DOC-13 — Documentation and examples MUST NOT contain secrets, tokens, or passwords.](../c/doc-13.md)
- [DOC-14 — Documentation MUST record `spec_version` and the input digest.](../c/doc-14.md)
- [DOC-15 — Documentation generation MUST be part of CI/conformance; a missing artifact f...](doc-15.md)
- [DOC-16 — Input constraints MUST be documented from the `ValidationDescriptor`, not fro...](../c/doc-16.md)
- [DOC-17 — Custom validation rules MUST appear as readable English text in every applica...](../c/doc-17.md)
- [VAL-01 — Every request input constraint is declared once in `#[rule(...)]`.](../c/val-01.md)
- [VAL-02 — The macro generates the runtime validator, schema, and descriptor from the sa...](../c/val-02.md)
- [VAL-03 — Standard rules follow the conversion table in §4.](../c/val-03.md)
- [VAL-04 — A rule whose unit or regex dialect does not match the schema keyword MUST be ...](../c/val-04.md)
- [VAL-05 — Unknown rules and rules applied to an incompatible type MUST be compile-time ...](../c/val-05.md)
- [VAL-06 — Every standard and custom rule carries an `error_code`.](../c/val-06.md)
- [VAL-07 — Custom rules require `id`, `check`, `fields`, `description`, and `code`.](../c/val-07.md)
- [VAL-08 — Conditional rules require `when` and an English condition description.](../c/val-08.md)
- [VAL-09 — A custom rule without a description fails compilation.](../c/val-09.md)
- [VAL-10 — The runtime and the descriptor use the same `check` function and `code`.](../c/val-10.md)
- [VAL-11 — Adapters do not implement interface-specific input validation.](../c/val-11.md)
- [VAL-12 — The generated validator runs after typed conversion and before the idempotenc...](val-12.md)
- [VAL-13 — Validation failures map to `invalid_input` with field, code, and English mess...](../c/val-13.md)
- [VAL-14 — The same input produces the same validation result through every interface.](../c/val-14.md)
- [VAL-15 — Every field rule appears in every applicable interface's documentation.](../c/val-15.md)
- [VAL-16 — Hand-written constraint lists are forbidden; documentation is generated from ...](val-16.md)
- [VAL-17 — Custom rules appear as readable English text in every interface reference, no...](../c/val-17.md)
- [VAL-18 — Validation descriptions, messages, and examples are English-only.](../c/val-18.md)
- [VAL-19 — Validation descriptors and generated documentation contain no secrets or sens...](val-19.md)
- [VAL-20 — Generation is deterministic for the same descriptor set and version.](val-20.md)

[^doc-09]: sources/EXPERT-REVIEW-PACKAGE.md

