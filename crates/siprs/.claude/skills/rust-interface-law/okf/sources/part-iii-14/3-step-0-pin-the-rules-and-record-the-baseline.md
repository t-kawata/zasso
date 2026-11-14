---
type: "Section"
title: "3. Step 0 — Pin the Rules and Record the Baseline"
description: "For each project:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-14/3-step-0-pin-the-rules-and-record-the-baseline"
    title: "3. Step 0 — Pin the Rules and Record the Baseline"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-14/3-step-0-pin-the-rules-and-record-the-baseline"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6163-6163"
---
## 3. Step 0 — Pin the Rules and Record the Baseline

For each project:

1. Add `RULES-PROFILE.toml` with `spec_version`.
2. Declare implemented interfaces; mark the rest `false`.
3. Record baseline behavior tests for every operation that will be migrated.
   The baseline covers success, failure, authorization, and state change.
4. Record the current state as the migration baseline.
5. Do not change behavior in this step.

Identity replacement (Step 2) must not begin until the baseline tests run and
pass against the current implementation.

---

## 4. Step 1 — Shared Contract Crates

