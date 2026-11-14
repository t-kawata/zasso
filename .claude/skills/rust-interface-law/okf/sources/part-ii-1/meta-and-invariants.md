---
type: "Section"
title: "Meta and invariants"
description: "INV-01 one implementation per operation · INV-02 every interface calls the same"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/meta-and-invariants"
    title: "Meta and invariants"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/meta-and-invariants"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "972-972"
---
### Meta and invariants

INV-01 one implementation per operation · INV-02 every interface calls the same
operation · INV-03 authentication once, authorization inside the operation ·
INV-04 no transport/JWT/SSO types in core/operation · INV-05 SSO adds no
business changes · INV-06 conformance proves compliance · INV-07 no
cross-interface token reuse · INV-08 no side effect before authorization ·
FREE-01 no closed feature list · FREE-02 open additions · FREE-03 free
internals · FREE-04 any interface subset · FREE-05 project-local extension ·
FREE-06 extend, do not fork · FREE-07 amend a feature-blocking rule · FREE-08
versioned amendment · FREE-09 additional crate roles · FREE-10 lifecycle-only
state · FREE-11 open resource IDs · FREE-12 recommended interface order ·
FREE-13 hand-written internals free · VER-01 one spec version · VER-02 project
pinning · VER-03 major for closed-seam changes · VER-04 minor for new extension
points · VER-05 major for rejecting previously valid projects · VER-06 amend
by extending, not excepting

### Architecture

