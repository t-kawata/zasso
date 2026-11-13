---
type: "Section"
title: "4. Matrix"
description: "| Operation | REST | WS | CLI | gRPC | MCP | A2A |"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-4-matrix"
    title: "4. Matrix"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "93-113"
---
## 4. Matrix

| Operation | REST | WS | CLI | gRPC | MCP | A2A |
|---|---|---|---|---|---|---|
| `account.add` | required | required | required | required | required | required |
| `account.get` | required | required | required | required | required | required |
| `account.export` | required | not applicable | required | required | required | required |

A cell is `required` or `not applicable` with a catalog reason. A missing cell is
a failure. An interface that is not in the profile has no column, not a
non-applicable cell.

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-01 | Every catalog operation appears in the matrix. | Coverage. | Operation set. | V3 matrix test. |
| CONF-02 | Every implemented interface has a driver. | Coverage. | Driver. | V3 test. |
| CONF-03 | Every cell is required or not applicable with a reason. | Cell rule. | Reason. | V3 test. |
| CONF-04 | A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell. | Distinction. | — | V3 test. |

---

