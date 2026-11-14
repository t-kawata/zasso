---
type: "Section"
title: "15. Documentation"
description: "Every implemented interface MUST have generated English usage documentation."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/15-documentation"
    title: "15. Documentation"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/15-documentation"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1088-1088"
---
## 15. Documentation

Every implemented interface MUST have generated English usage documentation.
Documentation is a build artifact, not a hand-maintained parallel text.

- Inputs: operation catalog, neutral schema registry, interface bindings, and
  shared contracts.
- The generator MUST NOT parse Rust source; it consumes the schema registry.
- `utoipa`/OpenAPI MAY supply schemas and the REST rendering, but MUST NOT be
  the only source for non-REST interfaces.
- Documentation generation MUST NOT require a running REST server or adapter.
- Completeness, English-only, secret-free, and determinism are build gates.
- Input constraints are declared once with the shared input macro; the same
  declaration generates the runtime validator, schema, and validation
  descriptor. Documentation consumes the descriptor, never a hand-written list.

The concrete rules are `DOC-01` through `DOC-17` in Part III.16 and
`VAL-01` through `VAL-20` in Part III.17. The mandatory implementation method is
`BP-01` through `BP-20` in Part III.18. A project MUST follow the blueprint or
declare a versioned exception.

---

# PART III — CONCRETE SPECIFICATION

The following documents define exact types, traits, layouts, public APIs,
generated files, interface rules, conformance obligations, the project template,
the migration plan, the canonical rule registry, the documentation pipeline,
the validation contract, and the mandatory implementation blueprint.


---

# PART III.1 — Foundation: Unify Seams, Not Substance

# Foundation: Unify Seams, Not Substance

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`

This document resolves the central design tension of the ruleset:

> Rules must never limit what a project can build, yet they must be concrete
> enough that <project-a>, <project-b>, <project-c>, and every future <platform> project produce
> almost completely unified implementations.

The resolution is a division of labor:

- **Unify the seams.** Contracts, wire formats, identity, authorization
  placement, error semantics, adapter mechanics, and conformance obligations are
  fixed.
- **Free the substance.** Operations, scopes, error codes, auth methods,
  interfaces, storage, algorithms, optimizations, and domain behavior are open.
- **Generate the mechanics.** Anything that is the same in every project is
  derived from the operation catalog, not hand-copied.
- **Prove the behavior.** Conformance tests demonstrate that hand-written
  variation still satisfies the same contract.

A rule may constrain a seam or a safety invariant. A rule must never enumerate
the set of permitted features.

---

## 1. The Four Rule Classes

