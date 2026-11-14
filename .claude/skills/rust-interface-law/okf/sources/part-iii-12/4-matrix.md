---
type: "Section"
title: "4. Matrix"
description: "| Operation | REST | WS | CLI | gRPC | MCP | A2A |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/4-matrix"
    title: "4. Matrix"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/4-matrix"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5423-5423"
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

## 5. Cases

## Rules in this section

- [CONF-01 — Every catalog operation appears in the matrix.](../../rules/p/conf-01.md)
- [CONF-02 — Every implemented interface has a driver.](../../rules/p/conf-02.md)
- [CONF-03 — Every cell is required or not applicable with a reason.](../../rules/p/conf-03.md)
- [CONF-04 — A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell.](../../rules/p/conf-04.md)

