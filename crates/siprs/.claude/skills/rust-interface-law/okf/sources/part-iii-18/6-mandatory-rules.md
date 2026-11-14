---
type: "Section"
title: "6. Mandatory Rules"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/6-mandatory-rules"
    title: "6. Mandatory Rules"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/6-mandatory-rules"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7902-7902"
---
## 6. Mandatory Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| BP-01 | This blueprint is the mandatory implementation method for validation and documentation. An alternate method requires a versioned exception. | Method. | Tooling internals. | V4 review; V2 config check. |
| BP-02 | Every request type uses `#[contract::input]` and implements `ContractValidate`. | Requirement. | Field rules. | V1 bound; V3 test. |
| BP-03 | The macro emits the validator, descriptor, schema registration, and inventory entries described in §3. | Outputs. | Internal expansion. | V3 test. |
| BP-04 | `Operation::Request` has a `ContractValidate` bound. `validate_json` runs before the idempotency claim; `prepare_validated` runs only on the acquired branch; replay calls `replay_authorize` only. | Order. | Error text. | V1/V3. |
| BP-05 | `validation-contract` owns the runtime types and `inventory` registrations in §2. | Types. | Internal layout. | V2 check. |
| BP-06 | Rule parameters are const-friendly and serialized to the exact JSON format in §4.2. | Format. | Extra fields. | V3 schema test. |
| BP-07 | `*-docgen` provides the four subcommands in §4.1 and depends on the operation crate to link registrations. | CLI. | Internal modules. | V3 test. |
| BP-08 | The schema registry is authoritative for all interfaces; `utoipa` output is compared, not used as the only source. | Source. | REST rendering. | V3 diff test. |
| BP-09 | Completeness, English, secrets, and determinism checks follow §4.4 and the exit codes. | Checks. | Implementation. | V3 test. |
| BP-10 | Generated documentation is written atomically and sorted deterministically. | Determinism. | Temp strategy. | V3 test. |
| BP-11 | A missing operation/interface/field/rule/description fails the build. | Fail-closed. | Message. | V3 test. |
| BP-12 | Custom rules require `id`, `check`, `fields`, `description`, and `code`; conditional rules require `when`. | Required set. | Function body. | V1/V3. |
| BP-13 | Unknown or type-incompatible rules fail compilation with a span. | Fail-closed. | Error text. | V3 compile-fail test. |
| BP-14 | No adapter implements interface-specific input validation. | Forbidden. | Conversion. | V2 scan; V3 test. |
| BP-15 | Documentation is English-only; non-English prose fails the English check. | Language. | Exempt code examples. | V3 test. |
| BP-16 | Documentation and examples contain no secrets. | Secret-free. | Patterns. | V3 test. |
| BP-17 | Documentation records `spec_version` and input digests. | Metadata. | Format. | V3 test. |
| BP-18 | REST is not required for schema dump or docgen; a non-REST project uses the same subcommands. | Independence. | Build tooling. | V3 test. |
| BP-19 | Generated files carry the generated marker and are never hand-edited. | Boundary. | Marker syntax. | V2 scan. |
| BP-20 | A feature that cannot follow the blueprint requires an amendment to this document, not a project fork. | Governance. | Version. | V4 review. |

---

## 7. Fixed and Open

