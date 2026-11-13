---
type: List
id: list/47-validation-contract-9-conformance-obligations/1/f1c7aadca856
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: f1c7aadca8568c055f9993ea291828f0eef18802ca311a1d4b1d2ba2786d6e30
source: sources/47-VALIDATION.md
---
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
