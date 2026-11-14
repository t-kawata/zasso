---
type: "Section"
title: "11. Conformance Obligations"
description: "1. Negative authentication suite, including the expanded cases in §9."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/11-conformance-obligations"
    title: "11. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/11-conformance-obligations"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3854-3854"
---
## 11. Conformance Obligations

1. Negative authentication suite, including the expanded cases in §9.
2. Audience isolation between every pair of interfaces.
3. Binding mismatch rejection (interface, audience, expiry).
4. Local identity establishment without a token and without implicit admin.
5. Atomic refresh rotation, concurrent winner, reuse detection, family revoke.
6. Token version rejection.
7. Delegation validation.
8. SSO regression: existing operations, `VerifiedIdentity`, and business tables
   unchanged.
9. Redaction: no token, password, code, or verifier in logs or errors.
10. `cargo test -p identity-*` and `cargo clippy -p identity-* -- -D warnings`.
11. The conformance report names `IDN-07` through `IDN-24` and the negative
    cases.

---

# PART III.6 — REST Adapter

# 30 — REST Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

