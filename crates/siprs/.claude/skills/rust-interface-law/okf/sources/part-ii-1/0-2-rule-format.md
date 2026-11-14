---
type: "Section"
title: "0.2 Rule format"
description: "Every rule has four parts:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/0-2-rule-format"
    title: "0.2 Rule format"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/0-2-rule-format"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "433-433"
---
### 0.2 Rule format

Every rule has four parts:

1. **Fixed** — the seam or invariant the rule freezes. This is what makes
   implementations comparable across projects.
2. **Open** — what the rule deliberately leaves free. This is what prevents the
   rule from limiting what a project can build.
3. **Verification** — how compliance is proven. A rule without verification is
   not yet a rule.
4. **Exceptions** — none unless stated. An exception must be declared in the
   project's `RULES-PROFILE.toml` with a reason and an expiry.

A rule that cannot name its **Open** part is over-specified and must be
rewritten, unless it is a safety invariant with no permissible variation (for
example, "secrets MUST NOT appear in logs"). A rule that cannot name its
**Fixed** part is not a rule.

### 0.3 Precedence

