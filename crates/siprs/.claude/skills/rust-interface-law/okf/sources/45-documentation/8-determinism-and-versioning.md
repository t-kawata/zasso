---
type: "Section"
title: "8. Determinism and Versioning"
description: "- Same `spec_version` + profile + operation catalog + schema registry +"
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "45-documentation-8-determinism-and-versioning"
    title: "8. Determinism and Versioning"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/45-DOCUMENTATION.md"
x-source-span: "157-169"
---
## 8. Determinism and Versioning

- Same `spec_version` + profile + operation catalog + schema registry +
  interface bindings + generator version → byte-identical output.
- Generated documentation records the `spec_version` and the input digest.
- The documentation version matches `spec_version`.
- Generated files carry `// @generated` or the Markdown equivalent.
- Hand edits to generated documentation are overwritten.
- Documentation is published as a build artifact or checked in; a missing
  artifact fails the build.

---

