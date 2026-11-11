---
type: List
id: list/45-documentation-generation-11-conformance-obligations/1/9b4bda27e954
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 9b4bda27e954e2285879853e08e214cfdd76453057d1f13f94867e0b5b847f55
source: docs/archive/IMPLEMENTATION-SPEC/45-DOCUMENTATION.md
---
1. Every implemented profile has a generated reference directory.
2. Every applicable operation appears in each interface reference.
3. Every operation section has the required fields.
4. OpenAPI and the other references agree on schemas and errors.
5. A non-English string fails the English-only gate.
6. A secret in documentation fails the secret-free gate.
7. Two runs with the same inputs produce identical output.
8. A missing artifact fails CI.
9. A REST-free project generates documentation successfully.
10. The conformance report names `DOC-01` through `DOC-17` and `CONF-53` through
    `CONF-60`.
