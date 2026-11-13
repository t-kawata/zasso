---
type: "Section"
title: "9. Rules"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "45-documentation-9-rules"
    title: "9. Rules"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/45-DOCUMENTATION.md"
x-source-span: "170-193"
---
## 9. Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| DOC-01 | Every implemented interface MUST have generated usage documentation. | Coverage. | Renderer and template. | V2 artifact check; V3 test. |
| DOC-02 | The operation catalog is the authoritative operation list and binding map. | Authority. | Catalog fields beyond the required set. | V3 catalog test. |
| DOC-03 | The generator MUST consume a neutral schema registry, not parse Rust source. | Input boundary. | Schema source implementation. | V2 scan; V3 test. |
| DOC-04 | `utoipa`/OpenAPI MAY be used as a schema source and REST output, but MUST NOT be the only source for non-REST interfaces. | Source independence. | REST rendering. | V3 test. |
| DOC-05 | Interface-specific documentation MUST come from interface bindings, not be inferred from REST. | Source of truth. | Binding fields. | V3 test. |
| DOC-06 | Documentation generation MUST NOT require a running REST server or REST adapter. | Independence. | Build tooling. | V2/V3 test. |
| DOC-07 | Every operation section MUST include schema, examples, auth, errors, idempotency, streaming, authorization, and conformance ID. | Completeness. | Presentation. | V3 completeness test. |
| DOC-08 | Every implemented interface MUST have a reference section for every applicable operation. | Coverage. | Non-applicability reason. | V3 matrix test. |
| DOC-09 | OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references. | Shared source. | UI packaging. | V3 diff test. |
| DOC-10 | A missing operation, interface, field, error category, auth statement, or example MUST fail the build. | Fail-closed. | Error message. | V3 test. |
| DOC-11 | Generated documentation MUST be English-only; a non-English string fails the build. | Language. | — | V2 scan; V3 test. |
| DOC-12 | Generation MUST be deterministic for the same inputs and version. | Determinism. | Renderer. | V3 digest test. |
| DOC-13 | Documentation and examples MUST NOT contain secrets, tokens, or passwords. | Secret-free. | — | V2 scan; V3 test. |
| DOC-14 | Documentation MUST record `spec_version` and the input digest. | Versioning. | Metadata format. | V3 test. |
| DOC-15 | Documentation generation MUST be part of CI/conformance; a missing artifact fails the gate. | CI gate. | CI provider. | V3 test. |
| DOC-16 | Input constraints MUST be documented from the `ValidationDescriptor`, not from a hand-written list or inferred code. | Single source. | Presentation. | V2 scan; V3 test. |
| DOC-17 | Custom validation rules MUST appear as readable English text in every applicable interface reference. | Readability. | Formatting. | V3 test. |

---

