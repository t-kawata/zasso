---
type: "Rule"
title: "AUTH-21 — REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401."
description: "REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "auth-21"
    title: "AUTH-21"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "negative-auth suite"
x-parent: "AUTH"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "AUTH-21"
x-source-part: "Part II"
x-source-span: "79-79"
x-verification: "V3 test."
---
# AUTH-21

REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTH |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[5.3 Per-interface authentication](../../sources/part-ii-1/5-3-per-interface-authentication.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [AUTH-22 — WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. L...](auth-22.md)
- [AUTH-23 — gRPC MUST read credentials from metadata and map auth failures to `UNAUTHENTI...](auth-23.md)
- [AUTH-24 — CLI MUST store tokens in an OS-protected store or a `0600` file, never in arg...](auth-24.md)
- [AUTH-25 — CLI local execution MUST establish an explicit principal and MUST NOT grant i...](auth-25.md)
- [AUTH-26 — MCP MUST implement the authentication discovery/challenge required by the ado...](auth-26.md)
- [AUTH-27 — A2A MUST implement the security mechanism required by the adopted A2A specifi...](auth-27.md)
- [AUTH-28 — Authentication requirement (`Required`/`Anonymous`) MUST be separate from sco...](auth-28.md)
- [AUTH-29 — `VerifiedIdentity` MUST carry the credential binding: interface, audience, me...](auth-29.md)
- [AUTH-30 — A session ticket and a local identity issuer MUST create a new binding. A tok...](auth-30.md)
- [AUTH-31 — Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST re...](auth-31.md)

[^auth-21]: sources/EXPERT-REVIEW-PACKAGE.md

