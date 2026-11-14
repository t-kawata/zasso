---
type: "Rule"
title: "CONF-51 — Result lookup is authorized by the recorded subject, tenant, or an authorized operator; a bare request ID is insufficient."
description: "Result lookup is authorized by the recorded subject, tenant, or an authorized operator; a bare request ID is insufficient."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-51"
    title: "CONF-51"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "conformance"
x-enforcement: "cargo test -p <project>-conformance"
x-parent: "CONF"
x-phase: "conformance"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "P"
x-rule-id: "CONF-51"
x-source-part: "Part III.12"
x-source-span: "276-276"
x-verification: "V3 test."
---
# CONF-51

Result lookup is authorized by the recorded subject, tenant, or an authorized operator; a bare request ID is insufficient.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/part-iii-12/14-1-revision-tests-0-3-0.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CONF-45 — A stream started through an adapter reaches the Dispatcher stream API and del...](conf-45.md)
- [CONF-46 — An expired lease owner cannot complete or commit after a new owner acquires t...](conf-46.md)
- [CONF-47 — A replay after a successful delete, create, or approve returns the stored res...](conf-47.md)
- [CONF-48 — Same-transaction completion, business mutation, and outbox intent are atomic;...](conf-48.md)
- [CONF-49 — REST merges body context and header context, rejects conflicts, and returns `...](conf-49.md)
- [CONF-50 — A long-lived WebSocket connection observes revocation within the configured m...](conf-50.md)
- [CONF-52 — Refresh consumes the current generation and creates the next generation in on...](conf-52.md)
- [CONF-53 — Every implemented interface has generated documentation and every applicable ...](conf-53.md)
- [CONF-54 — Documentation completeness, English-only, and secret-free gates pass.](conf-54.md)
- [CONF-55 — Documentation generation is deterministic for the same inputs and version.](conf-55.md)
- [CONF-56 — A project without the REST profile still generates documentation for its impl...](conf-56.md)
- [CONF-57 — Every request uses the generated validator, and the same input produces the s...](conf-57.md)
- [CONF-58 — Standard constraints map to schema keywords; byte-length and non-ECMA regex r...](conf-58.md)
- [CONF-59 — Every custom rule has `id`, `check`, `fields`, `description`, and `code`, and...](conf-59.md)
- [CONF-60 — Unknown or type-incompatible rules fail compilation; no rule is silently omit...](conf-60.md)
- [CONF-61 — Every request uses the macro; the validator, descriptor, schema registration,...](conf-61.md)
- [CONF-62 — `*-docgen` implements the four subcommands and both registry dumps; the opera...](conf-62.md)
- [CONF-63 — Completeness, English, secret, and determinism checks match the blueprint and...](conf-63.md)
- [CONF-64 — No alternate validation/documentation method is used without a versioned exce...](conf-64.md)
- [CONF-65 — Generated validation runs before the idempotency claim for both replay and ne...](conf-65.md)

[^conf-51]: sources/EXPERT-REVIEW-PACKAGE.md

