---
type: "Section"
title: "15. Report"
description: "```rust"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-15-report"
    title: "15. Report"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "294-326"
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

