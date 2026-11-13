---
type: Paragraph
id: paragraph/48-implementation-blueprint-mandatory-3-macro-contract-3-7-runtime-validation-path/3/4521bb0db7da
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 4521bb0db7daba381bf64da873b66596778f2022dfea1c2f087157661c7c87e3
source: sources/48-IMPLEMENTATION-BLUEPRINT.md
---
`prepare_validated` is called only on the acquired branch. A replay never calls
`prepare` or `prepare_validated`. State-dependent business preconditions,
resource loading, and ownership authorization belong in `prepare`, not in the
generated input validator; generated validation is stateless input validation.
