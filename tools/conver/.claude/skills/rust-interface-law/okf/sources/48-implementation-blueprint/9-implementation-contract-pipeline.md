---
type: "Section"
title: "9. Implementation Contract Pipeline"
description: "The generator pipeline adds the implementation contract between source and adapter output."
sources: 
  - resource: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
    id: "48-implementation-blueprint-9-implementation-contract-pipeline"
    title: "9. Implementation Contract Pipeline"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
x-source-span: "532-543"
---
## 9. Implementation Contract Pipeline

The generator pipeline adds the implementation contract between source and adapter output.

```text
source docs -> rule registry -> manifest/lock/coverage -> OKF
effective policy -> template catalog -> template plan -> scaffold
implementation-check -> implementation report -> gate -> attest
```

The generator MUST use the admitted template and MUST record the template hash. The gate MUST reject a missing report, a missing test, a zero-test selection, a failed detector, or a law identity mismatch.

