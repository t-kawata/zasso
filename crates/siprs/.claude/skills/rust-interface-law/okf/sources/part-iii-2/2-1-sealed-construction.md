---
type: "Section"
title: "2.1 Sealed construction"
description: "`VerifiedIdentity` has private fields and no public constructor. The JWT"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/2-1-sealed-construction"
    title: "2.1 Sealed construction"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/2-1-sealed-construction"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1635-1635"
---
### 2.1 Sealed construction

`VerifiedIdentity` has private fields and no public constructor. The JWT
verifier and the session-ticket store live inside `identity-core` behind the
`jwt` and `ticket` features; `identity-jwt` is a facade. This makes ID-03 a
compile-time property.

A project that wants a verifier outside `identity-core` must use the declared
static-check alternative (V2: only the trusted verifier crate may call
`from_verified`) and record the exception in `RULES-PROFILE.toml`. The
specification does not treat an import scan as equivalent to compile-time
sealing.

### 2.2 Binding checks

