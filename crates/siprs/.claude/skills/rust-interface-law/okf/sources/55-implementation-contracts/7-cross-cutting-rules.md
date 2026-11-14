---
type: "Section"
title: "7. Cross-Cutting Rules"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "55-implementation-contracts-7-cross-cutting-rules"
    title: "7. Cross-Cutting Rules"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/55-IMPLEMENTATION-CONTRACTS.md"
x-source-span: "105-123"
---
## 7. Cross-Cutting Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| IMP-01 | Dependency declarations MUST use the admitted crate, exact version, features, and default-features policy. | Admission. | Project-compatible pin inside the range. | metadata check. |
| IMP-02 | The gate MUST reject every unresolved dependency, feature, source, advisory, or license disposition. | Fail closed. | Disposition format. | negative fixtures. |
| IMP-03 | Adapter dependency edges MUST reach the dispatcher and identity contracts and MUST NOT reach operation implementations or business storage. | Edge rule. | Internal module split. | graph check. |
| IMP-04 | Core and operation-contract crates MUST NOT depend on protocol SDKs or generated transport types. | Forbidden. | — | graph check. |
| IMP-05 | Required source calls MUST be resolved by identity, and unresolved analysis MUST fail closed. | Resolved identity. | Detector implementation. | source detector. |
| IMP-06 | Generated adapter output MUST equal regeneration from the admitted template and inputs. | Equality. | Template content. | generated equality. |
| IMP-07 | Scaffold MUST NOT overwrite an existing file; an existing file without a marker becomes merge-required. | No overwrite. | Merge instructions. | scaffold fixture. |
| IMP-08 | Template bodies MUST NOT be delivered by context; only rule text, contract tables, and template references are delivered. | Delivery boundary. | Excerpt size. | delivery test. |
| IMP-09 | Missing implementation reports, missing tests, zero selected tests, and failed detectors MUST NOT pass. | Fail closed. | Evidence shape. | gate self-test. |
| IMP-10 | Every project MUST pin the law spec_version, dist hash, and policy hash; a mismatch fails unless a scoped exception exists. | Identity. | Exception scope. | identity check. |
| IMP-11 | Every implementation rule MUST have a detector or an explicit attestation row. | Coverage. | Detector choice. | registry check. |
| IMP-12 | Pipeline checkpoints MUST invoke template, implementation-check, gate, and attest through a bounded wrapper. | Process. | Wrapper name. | command inspection. |

---

## Rules in this section

- [IMP-02 — The gate MUST reject every unresolved dependency, feature, source, advisory, ...](../../rules/c/imp-02.md)
- [IMP-03 — Adapter dependency edges MUST reach the dispatcher and identity contracts and...](../../rules/c/imp-03.md)
- [IMP-04 — Core and operation-contract crates MUST NOT depend on protocol SDKs or genera...](../../rules/c/imp-04.md)
- [IMP-05 — Required source calls MUST be resolved by identity, and unresolved analysis M...](../../rules/c/imp-05.md)
- [IMP-06 — Generated adapter output MUST equal regeneration from the admitted template a...](../../rules/c/imp-06.md)
- [IMP-07 — Scaffold MUST NOT overwrite an existing file; an existing file without a mark...](../../rules/c/imp-07.md)
- [IMP-09 — Missing implementation reports, missing tests, zero selected tests, and faile...](../../rules/c/imp-09.md)
- [IMP-10 — Every project MUST pin the law spec_version, dist hash, and policy hash; a mi...](../../rules/c/imp-10.md)
- [IMP-11 — Every implementation rule MUST have a detector or an explicit attestation row.](../../rules/c/imp-11.md)

