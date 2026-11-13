---
type: "Section"
title: "Foundation: Unify Seams, Not Substance"
description: "**Status:** Normative"
sources: 
  - resource: "sources/00-FOUNDATION.md"
    id: "00-foundation-foundation-unify-seams-not-substance"
    title: "Foundation: Unify Seams, Not Substance"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/00-FOUNDATION.md"
x-source-span: "1-29"
---
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

