---
type: "Section"
title: "6. Authentication"
description: "The adapter uses a tower layer or per-request extraction with this fixed order:"
sources: 
  - resource: "sources/33-GRPC.md"
    id: "33-grpc-6-authentication"
    title: "6. Authentication"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/33-GRPC.md"
x-source-span: "143-163"
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

