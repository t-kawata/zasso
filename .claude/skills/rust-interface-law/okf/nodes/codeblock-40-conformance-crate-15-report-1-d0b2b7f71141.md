---
type: CodeBlock
id: codeblock/40-conformance-crate-15-report/1/d0b2b7f71141
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d0b2b7f71141f834e8dafa4c8bcefd732ce6e83a70c9f1aeffb0ef1b3b0112dd
source: docs/archive/IMPLEMENTATION-SPEC/40-CONFORMANCE.md
---
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
