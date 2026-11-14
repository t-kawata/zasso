---
type: "Section"
title: "7. Error Mapping"
description: "```rust"
sources: 
  - resource: "sources/30-REST.md"
    id: "30-rest-7-error-mapping"
    title: "7. Error Mapping"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/30-REST.md"
x-source-span: "173-212"
---
## 7. Error Mapping

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

`RestError` implements `IntoResponse`. It is used for pre-dispatch adapter
failures (malformed body, context conflict, missing or malformed bearer
header). Operation failures are returned as
`SemanticReply { request_id, error }`; they are not converted to `RestError`.

For adapter-level errors, `RestError` writes the same semantic error shape and
uses a generated request ID when the request did not carry one.

```json
{
  "request_id": "0190f3c2-...",
  "error": {
    "code": "invalid_input",
    "domain": "account",
    "retryable": false,
    "details": {}
  }
}
```

The body never contains a token, a password, a provider response, or a stack
trace.

---

