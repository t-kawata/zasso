---
type: "Rule"
title: "REST-07 — 401 responses include `WWW-Authenticate: Bearer`."
description: "401 responses include `WWW-Authenticate: Bearer`."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-07"
    title: "REST-07"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "rest"
x-enforcement: "conformance driver"
x-parent: "REST"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "REST-07"
x-source-part: "Part III.6"
x-source-span: "158-158"
x-verification: "V3 test."
---
# REST-07

401 responses include `WWW-Authenticate: Bearer`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[6. HTTP Rules](../../sources/part-iii-6/6-http-rules.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [REST-01 — Credentials come only from `Authorization: Bearer`.](rest-01.md)
- [REST-02 — Tokens MUST NOT appear in query strings or paths.](rest-02.md)
- [REST-03 — Public and protected routers are separate; protected routes use `route_layer`.](rest-03.md)
- [REST-04 — The audience is configured per router and passed to the verifier.](rest-04.md)
- [REST-05 — All REST success replies use 200 with the semantic envelope. 201, 202, and 20...](rest-05.md)
- [REST-06 — Error mapping uses the fixed category table from `Part III.2` §5.8.](rest-06.md)
- [REST-08 — Mutating requests accept `Idempotency-Key` and pass it in `WireContext`.](rest-08.md)
- [REST-09 — List endpoints define `limit`, `offset`, and optional `cursor`.](rest-09.md)
- [REST-10 — Request bodies are bounded by `max_body_bytes`.](rest-10.md)
- [REST-11 — CORS and Origin allowlists are configured; unspecified origins are denied.](rest-11.md)
- [REST-12 — The OpenAPI document lists exactly the routes the router serves.](rest-12.md)
- [REST-13 — Aliases call the same operation; they do not contain logic.](rest-13.md)
- [REST-14 — Binary and multipart endpoints declare their media types and size limits.](rest-14.md)
- [REST-15 — Every endpoint uses the semantic envelope for requests and replies.](rest-15.md)
- [REST-16 — Aliases use the same envelope; they do not introduce a second wire shape.](rest-16.md)
- [REST-17 — Anonymous operations use the public router and `execute_anonymous`; they are ...](rest-17.md)
- [REST-18 — The reply `request_id` is the operation's `request_id`, including on errors.](rest-18.md)

[^rest-07]: sources/EXPERT-REVIEW-PACKAGE.md

