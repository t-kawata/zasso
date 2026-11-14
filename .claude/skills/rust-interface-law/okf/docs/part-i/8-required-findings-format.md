---
type: "Documentation"
title: "8. Required Findings Format"
description: "Use this exact shape for every finding:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/8-required-findings-format"
    title: "8. Required Findings Format"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/8-required-findings-format"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "301-301"
---
## 8. Required Findings Format

Use this exact shape for every finding:

```text
ID: R-001
Severity: Blocker | Major | Minor | Nit
Document: <file> § <section> / Rule ID
Type: Over-constraint | Under-specification | Contradiction | Gap | Security defect | Migration defect
Claim: <one sentence>
Evidence: <exact quote or precise reference>
Why it matters: <consequence for unification, feature freedom, security, or adoption>
Recommended fix: <specific change>
Affects unification: Yes | No | Conditional
Limits a legitimate feature: Yes | No | Conditional
```

A finding without a precise reference is not acceptable. Generic advice
(“improve clarity”, “add more tests”) is not a finding.

---

## 9. Required Verdict

