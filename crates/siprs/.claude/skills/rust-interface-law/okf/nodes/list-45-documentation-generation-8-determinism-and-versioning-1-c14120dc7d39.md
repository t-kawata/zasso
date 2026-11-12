---
type: List
id: list/45-documentation-generation-8-determinism-and-versioning/1/c14120dc7d39
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: c14120dc7d39993f1442ddafd0e9face8ee21f767483cd13a75a1f7c73312bf4
source: docs/archive/IMPLEMENTATION-SPEC/45-DOCUMENTATION.md
---
- Same `spec_version` + profile + operation catalog + schema registry +
  interface bindings + generator version → byte-identical output.
- Generated documentation records the `spec_version` and the input digest.
- The documentation version matches `spec_version`.
- Generated files carry `// @generated` or the Markdown equivalent.
- Hand edits to generated documentation are overwritten.
- Documentation is published as a build artifact or checked in; a missing
  artifact fails the build.
