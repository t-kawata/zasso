---
type: "Section"
title: "5.3 Per-interface authentication"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/5-3-per-interface-authentication"
    title: "5.3 Per-interface authentication"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/5-3-per-interface-authentication"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "745-745"
---
### 5.3 Per-interface authentication

| ID | Rule | Verification |
|---|---|---|
| AUTH-21 | REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401. | V3 test. |
| AUTH-22 | WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. Long-lived JWT query parameters are forbidden. | V3 test. |
| AUTH-23 | gRPC MUST read credentials from metadata and map auth failures to `UNAUTHENTICATED` or `PERMISSION_DENIED`. | V3 test. |
| AUTH-24 | CLI MUST store tokens in an OS-protected store or a `0600` file, never in argv or shell history. | V2 argv scan; V3 test. |
| AUTH-25 | CLI local execution MUST establish an explicit principal and MUST NOT grant implicit administrator rights. | V3 test. |
| AUTH-26 | MCP MUST implement the authentication discovery/challenge required by the adopted MCP specification, and MUST NOT pass a received token through to a downstream API. | V3 protocol test. |
| AUTH-27 | A2A MUST implement the security mechanism required by the adopted A2A specification. | V3 protocol test. |
| AUTH-28 | Authentication requirement (`Required`/`Anonymous`) MUST be separate from scope. Anonymous operations use `AnonymousOperation` and never receive a `VerifiedIdentity`. | V1 type; V3 test. |
| AUTH-29 | `VerifiedIdentity` MUST carry the credential binding: interface, audience, method, authentication time, expiry, token ID, and token version. The dispatcher MUST reject a binding mismatch. | V1 type; V3 test. |
| AUTH-30 | A session ticket and a local identity issuer MUST create a new binding. A token or identity verified for one interface/audience MUST NOT be reused for another. | V3 test. |
| AUTH-31 | Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST reject an unauthorized actor or an excessive scope set. | V3 test. |

---

## 6. SSO Extension

## Rules in this section

- [AUTH-21 — REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multipl...](../../rules/c/auth-21.md)
- [AUTH-22 — WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. L...](../../rules/c/auth-22.md)
- [AUTH-23 — gRPC MUST read credentials from metadata and map auth failures to `UNAUTHENTI...](../../rules/c/auth-23.md)
- [AUTH-24 — CLI MUST store tokens in an OS-protected store or a `0600` file, never in arg...](../../rules/c/auth-24.md)
- [AUTH-25 — CLI local execution MUST establish an explicit principal and MUST NOT grant i...](../../rules/c/auth-25.md)
- [AUTH-26 — MCP MUST implement the authentication discovery/challenge required by the ado...](../../rules/c/auth-26.md)
- [AUTH-27 — A2A MUST implement the security mechanism required by the adopted A2A specifi...](../../rules/c/auth-27.md)
- [AUTH-28 — Authentication requirement (`Required`/`Anonymous`) MUST be separate from sco...](../../rules/c/auth-28.md)
- [AUTH-29 — `VerifiedIdentity` MUST carry the credential binding: interface, audience, me...](../../rules/c/auth-29.md)
- [AUTH-30 — A session ticket and a local identity issuer MUST create a new binding. A tok...](../../rules/c/auth-30.md)
- [AUTH-31 — Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST re...](../../rules/c/auth-31.md)

