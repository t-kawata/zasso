---
type: "Section"
title: "9. Conformance Obligations"
description: "1. Every request type uses the shared input macro."
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "47-validation-9-conformance-obligations"
    title: "9. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/47-VALIDATION.md"
x-source-span: "272-287"
---
## 9. Conformance Obligations

1. Every request type uses the shared input macro.
2. Every rule produces runtime validation, schema output, and a descriptor.
3. Standard rules match the conversion table; byte-length and non-ECMA regex
   rules are not mis-mapped.
4. Unknown or incompatible rules fail compilation.
5. Every custom rule has `id`, `check`, `fields`, `description`, and `code`.
6. The generated validator runs before business logic on every interface.
7. Validation parity holds across interfaces.
8. Every field rule appears in every applicable interface reference.
9. Documentation is English-only and secret-free.
10. Generation is deterministic.
11. The conformance report names `VAL-01` through `VAL-20` and `CONF-57`
    through `CONF-60`.

