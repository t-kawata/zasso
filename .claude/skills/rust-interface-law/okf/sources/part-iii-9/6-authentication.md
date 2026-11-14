---
type: "Section"
title: "6. Authentication"
description: "The adapter uses a tower layer or per-request extraction with this fixed order:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-9/6-authentication"
    title: "6. Authentication"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-9/6-authentication"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4859-4859"
---
## 6. Authentication

The adapter uses a tower layer or per-request extraction with this fixed order:

```text
read `authorization` metadata
  → require Bearer
  → verifier.verify(token, audience)
  → insert Arc<VerifiedIdentity> into request extensions
  → dispatch
```

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-06 | Credentials come from gRPC metadata, not from the message body. | Source. | Metadata key. | V3 test. |
| GRPC-07 | Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`. | Mapping. | Detail text. | V3 test. |
| GRPC-08 | The adapter does not construct `VerifiedIdentity`. | Opaque type. | — | V1; V3 compile-fail. |
| GRPC-09 | The interceptor does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |

---

## 7. Error Mapping

## Rules in this section

- [GRPC-06 — Credentials come from gRPC metadata, not from the message body.](../../rules/c/grpc-06.md)
- [GRPC-07 — Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`.](../../rules/c/grpc-07.md)
- [GRPC-08 — The adapter does not construct `VerifiedIdentity`.](../../rules/c/grpc-08.md)
- [GRPC-09 — The interceptor does not authorize the target; the operation does.](../../rules/c/grpc-09.md)

