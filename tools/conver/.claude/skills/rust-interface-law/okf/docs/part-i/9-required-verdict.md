---
type: "Documentation"
title: "9. Required Verdict"
description: "At the top of your report, provide:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/9-required-verdict"
    title: "9. Required Verdict"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/9-required-verdict"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "323-323"
---
## 9. Required Verdict

At the top of your report, provide:

```text
Overall verdict: PASS | PASS WITH CONDITIONS | FAIL

Unification:      PASS | CONDITIONAL | FAIL
Non-limitation:   PASS | CONDITIONAL | FAIL
Security:         PASS | CONDITIONAL | FAIL
Consistency:      PASS | CONDITIONAL | FAIL
Testability:      PASS | CONDITIONAL | FAIL
Migration:        PASS | CONDITIONAL | FAIL
```

Then provide:

1. **Executive summary** — at most one page.
2. **Findings table** — sorted by severity.
3. **Must-fix before adoption** — numbered list.
4. **Can-defer list** — numbered list.
5. **Answers to the ten specific questions** in §7.
6. **A short statement** on whether the package achieves both success
   conditions simultaneously.

Severity definitions:

| Severity | Meaning |
|---|---|
| Blocker | Prevents adoption or violates a security/unification invariant. |
| Major | Causes significant divergence or blocks a legitimate feature. |
| Minor | Ambiguity, inconsistency, or documentation defect. |
| Nit | Style or wording. |

---

## 10. Out of Scope

