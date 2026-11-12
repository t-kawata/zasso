---
type: CodeBlock
id: codeblock/30-rest-adapter-7-error-mapping/1/27856773e767
phase: adapter
delivery: must
applies_to: rest
requires: []
references: []
content_sha256: 27856773e767f21cf9cd3bf8a328204be321422b92f3669201c62b5ae41bc8ed
source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md
---
```rust
pub struct RestError {
    pub request_id: RequestId,
    pub error: OperationErrorBody,
}

impl RestError {
    /// Adapter-level failure before dispatch. Uses the supplied request ID,
    /// or generates one when the request did not carry one.
    pub fn from_contract(error: ContractError, request_id: Option<RequestId>) -> Self;
}
```
