---
type: "Section"
title: "3. Closed Seams"
description: "These are fixed because variation would break interoperability, security, or"
sources: 
  - resource: "sources/00-FOUNDATION.md"
    id: "00-foundation-3-closed-seams"
    title: "3. Closed Seams"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/00-FOUNDATION.md"
x-source-span: "68-88"
---
## 3. Closed Seams

These are fixed because variation would break interoperability, security, or
conformance.

| Seam | Why closed |
|---|---|
| `InvocationContext` and envelope shape | Every interface and operation must speak the same request/reply shape. |
| `VerifiedIdentity` and `SubjectId` | Operations must never see provider-specific identity. |
| Authorization location | An adapter-level check is a bypass for every other interface. |
| Token validation order and required claims | A weaker order is a security defect, not a design choice. |
| Audience separation | Cross-interface token reuse turns one leak into six. |
| Error categories and mapping table | Different mappings make the same failure mean different things per interface. |
| Dependency direction | A transport type in `*-core` destroys portability. |
| Conformance obligations | Without them, “unified” is a claim rather than a proof. |

Closed seams are small and stable. They are the only place where a rule may say
“exactly this and nothing else.”

---

