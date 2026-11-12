---
type: CodeBlock
id: codeblock/10-shared-contracts-8-wire-envelope-and-protocol-bindings-8-1-protobuf-context/1/2b7047be3ddf
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2b7047be3ddf2b033bbdcc8fb8f682713ca44b858d4e374bd62f3508339744b1
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
```proto
message Context {
  optional string request_id = 1;
  optional int64 deadline_unix_ns = 2;
  optional string idempotency_key = 3;
  optional string trace_id = 4;
}
```
