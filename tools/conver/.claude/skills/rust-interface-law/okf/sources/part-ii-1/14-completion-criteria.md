---
type: "Section"
title: "14. Completion Criteria"
description: "A project is compliant when all of the following hold."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/14-completion-criteria"
    title: "14. Completion Criteria"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/14-completion-criteria"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1061-1061"
---
## 14. Completion Criteria

A project is compliant when all of the following hold.

1. The crate graph passes ARC-02 through ARC-08.
2. Every operation has a complete §11 specification and a conformance ID.
3. Every implemented interface passes the operation × interface matrix.
4. The negative authentication suite passes for every interface.
5. Audience isolation passes between every pair of interfaces.
6. No adapter can construct a `VerifiedIdentity`.
7. Operation-level authorization cannot be bypassed from any interface.
8. SSO can be added without changing business operations, `VerifiedIdentity`,
   or business tables.
9. Every MUST rule has a named verification and a passing result.
10. Undeclared exceptions do not exist.
11. Every implemented interface has generated English documentation, and the
    `docgen --check all` gate passes.
12. Every request uses the shared input macro; validation parity and
    descriptor coverage pass.
13. The implementation blueprint in Part III.18 is followed; an alternate
    method has a versioned exception.

A project that cannot prove one of these is not compliant, regardless of
whether its code compiles or its documentation says otherwise.

---

## 15. Documentation

