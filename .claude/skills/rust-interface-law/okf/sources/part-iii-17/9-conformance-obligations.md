---
type: "Section"
title: "9. Conformance Obligations"
description: "1. Every request type uses the shared input macro."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-17/9-conformance-obligations"
    title: "9. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-17/9-conformance-obligations"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7407-7407"
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

---

# PART III.18 — Implementation Blueprint

# 48 — Implementation Blueprint (Mandatory)

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2
**Validation:** Part III.17
**Documentation:** Part III.16

This document is the mandatory implementation method for validation and
documentation generation. A project MUST follow it, or declare a versioned
exception in `RULES-PROFILE.toml`. An implementer or AI agent must be able to
build the feature from this document without inventing the architecture.

---

## 1. Crates and Files

