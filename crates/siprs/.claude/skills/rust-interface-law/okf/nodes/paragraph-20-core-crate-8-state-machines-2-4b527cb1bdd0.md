---
type: Paragraph
id: paragraph/20-core-crate-8-state-machines/2/4b527cb1bdd0
phase: core
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 4b527cb1bdd06566af7764b4cf898238add4b63a5a071612a75910572925c6e0
source: sources/20-CORE.md
---
A transition that is not listed in the table returns `DomainError` with the
project's `invalid_state` code. A missing transition is a defect, not a runtime
fallback.
