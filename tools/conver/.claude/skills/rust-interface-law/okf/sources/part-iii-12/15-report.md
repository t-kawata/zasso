---
type: "Section"
title: "15. Report"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/15-report"
    title: "15. Report"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/15-report"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5624-5624"
---
## 15. Report

```rust
pub struct ConformanceReport {
    pub rows: Vec<Row>,
    pub rules: Vec<RuleVerdict>,
}

pub struct Row {
    pub operation: OperationId,
    pub interface: InterfaceId,
    pub case: &'static str,
    pub outcome: InvocationOutcome,
    pub verdict: Verdict,
}

pub struct RuleVerdict {
    pub rule_id: &'static str,
    pub verdict: Verdict,
    pub evidence: Vec<String>,
}

pub enum Verdict {
    Pass,
    Fail { reason: String },
    NotApplicable { reason: String },
}
```

A report that omits a rule or a matrix cell is itself a failure.

---

## 16. Fixed and Open

