---
type: "Section"
title: "6. HTTP Rules"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-6/6-http-rules"
    title: "6. HTTP Rules"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-6/6-http-rules"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4021-4021"
---
## 6. HTTP Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| REST-01 | Credentials come only from `Authorization: Bearer`. | Header and scheme. | Token contents. | V3 test. |
| REST-02 | Tokens MUST NOT appear in query strings or paths. | Forbidden. | — | V3 test. |
| REST-03 | Public and protected routers are separate; protected routes use `route_layer`. | Structure. | Middleware implementation. | V3 test. |
| REST-04 | The audience is configured per router and passed to the verifier. | Audience parameter. | Value. | V3 audience test. |
| REST-05 | All REST success replies use 200 with the semantic envelope. 201, 202, and 204 are not used; aliases use 200. | Status rule. | — | V3 contract test. |
| REST-06 | Error mapping uses the fixed category table from `Part III.2` §5.8. | Category table. | Error codes. | V3 mapping test. |
| REST-07 | 401 responses include `WWW-Authenticate: Bearer`. | Header. | — | V3 test. |
| REST-08 | Mutating requests accept `Idempotency-Key` and pass it in `WireContext`. | Header name. | — | V3 test. |
| REST-09 | List endpoints define `limit`, `offset`, and optional `cursor`. | Parameter names. | Ranges and defaults. | V3 schema test. |
| REST-10 | Request bodies are bounded by `max_body_bytes`. | Rejection. | Limit value. | V3 test. |
| REST-11 | CORS and Origin allowlists are configured; unspecified origins are denied. | Deny-by-default. | Allowed list. | V3 test. |
| REST-12 | The OpenAPI document lists exactly the routes the router serves. | Equality. | Descriptions and examples. | V2 diff; V3 test. |
| REST-13 | Aliases call the same operation; they do not contain logic. | Delegation. | Alias set. | V3 catalog test. |
| REST-14 | Binary and multipart endpoints declare their media types and size limits. | Declaration. | Media types. | V3 test. |
| REST-15 | Every endpoint uses the semantic envelope for requests and replies. | Envelope. | Payload schema. | V3 contract test. |
| REST-16 | Aliases use the same envelope; they do not introduce a second wire shape. | Equality. | Alias paths. | V3 contract test. |
| REST-17 | Anonymous operations use the public router and `execute_anonymous`; they are not a dispatcher bypass. | Path. | Anonymous operation set. | V3 bypass test. |
| REST-18 | The reply `request_id` is the operation's `request_id`, including on errors. | Field. | — | V3 test. |

---

## 7. Error Mapping

## Rules in this section

- [REST-01 — Credentials come only from `Authorization: Bearer`.](../../rules/c/rest-01.md)
- [REST-02 — Tokens MUST NOT appear in query strings or paths.](../../rules/c/rest-02.md)
- [REST-03 — Public and protected routers are separate; protected routes use `route_layer`.](../../rules/c/rest-03.md)
- [REST-04 — The audience is configured per router and passed to the verifier.](../../rules/c/rest-04.md)
- [REST-05 — All REST success replies use 200 with the semantic envelope. 201, 202, and 20...](../../rules/c/rest-05.md)
- [REST-06 — Error mapping uses the fixed category table from `Part III.2` §5.8.](../../rules/c/rest-06.md)
- [REST-07 — 401 responses include `WWW-Authenticate: Bearer`.](../../rules/c/rest-07.md)
- [REST-08 — Mutating requests accept `Idempotency-Key` and pass it in `WireContext`.](../../rules/c/rest-08.md)
- [REST-09 — List endpoints define `limit`, `offset`, and optional `cursor`.](../../rules/c/rest-09.md)
- [REST-10 — Request bodies are bounded by `max_body_bytes`.](../../rules/c/rest-10.md)
- [REST-11 — CORS and Origin allowlists are configured; unspecified origins are denied.](../../rules/c/rest-11.md)
- [REST-12 — The OpenAPI document lists exactly the routes the router serves.](../../rules/c/rest-12.md)
- [REST-13 — Aliases call the same operation; they do not contain logic.](../../rules/c/rest-13.md)
- [REST-14 — Binary and multipart endpoints declare their media types and size limits.](../../rules/c/rest-14.md)
- [REST-15 — Every endpoint uses the semantic envelope for requests and replies.](../../rules/c/rest-15.md)
- [REST-16 — Aliases use the same envelope; they do not introduce a second wire shape.](../../rules/c/rest-16.md)
- [REST-17 — Anonymous operations use the public router and `execute_anonymous`; they are ...](../../rules/c/rest-17.md)
- [REST-18 — The reply `request_id` is the operation's `request_id`, including on errors.](../../rules/c/rest-18.md)

