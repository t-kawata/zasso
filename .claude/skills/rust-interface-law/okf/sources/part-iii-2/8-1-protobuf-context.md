---
type: "Section"
title: "8.1 Protobuf context"
description: "The gRPC binding uses typed messages, but the semantic context fields and their"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/8-1-protobuf-context"
    title: "8.1 Protobuf context"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/8-1-protobuf-context"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2692-2692"
---
### 8.1 Protobuf context

The gRPC binding uses typed messages, but the semantic context fields and their
field numbers are fixed:

```proto
message Context {
  optional string request_id = 1;
  optional int64 deadline_unix_ns = 2;
  optional string idempotency_key = 3;
  optional string trace_id = 4;
}
```

### 8.1 Bindings

