---
type: "Documentation"
title: "12. Deliverable"
description: "One Markdown report, structured as described in §9. Do not rewrite the"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/12-deliverable"
    title: "12. Deliverable"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/12-deliverable"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "381-381"
---
## 12. Deliverable

One Markdown report, structured as described in §9. Do not rewrite the
specification. Cite it precisely. Distinguish specification defects from
implementation risks. If you propose a rule change, state whether it preserves
the no-limitation guarantee.

---














# PART II — NORMATIVE RULES

---

# PART II.1 — IMPLEMENTATION RULES

# Implementation Rules for Multi-Interface Rust Systems

**Status:** Normative
**Version:** 0.3.2
**Applies to:** Rust projects that split a system into `*-core`, `*-operation`,
`*-conformance`, and interface crates (`*-rest`, `*-websocket`, `*-cli`,
`*-grpc`, `*-mcp`, `*-a2a`).
**Reference targets:** <project-a>, <project-b>, <project-c>.

This document defines the rules. It does not define any single project's
operations; those belong in the project's own `SYSTEM-DESIGN.md`.

---

## 0. How to Read This Document

