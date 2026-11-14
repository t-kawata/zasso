---
type: "Section"
title: "4. Pipeline"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-16/4-pipeline"
    title: "4. Pipeline"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-16/4-pipeline"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6958-6958"
---
## 4. Pipeline

```text
1. Build the neutral schema registry from operation DTOs.
   (No REST server is started; no adapter is required.)
2. Load the operation catalog and interface bindings.
3. Merge shared authentication, error, envelope, streaming, and idempotency
   semantics.
4. Render the REST OpenAPI/Swagger output and the per-interface references.
5. Validate completeness, English-only, determinism, and secret-free output.
6. Publish or check in the generated artifacts.
```

The same generator and the same inputs produce all interface references. The
REST OpenAPI document is a rendering of the shared schema for REST, not the
source from which other interfaces are inferred.

---

## 5. Completeness

