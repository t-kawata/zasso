---
type: "Section"
title: "5. Generated Proto"
description: "```proto"
sources: 
  - resource: "sources/33-GRPC.md"
    id: "33-grpc-5-generated-proto"
    title: "5. Generated Proto"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/33-GRPC.md"
x-source-span: "97-142"
---
## 5. Generated Proto

```proto
syntax = "proto3";
package <project>.v1;

service <Project>Service {
  rpc AccountAdd(AccountAddRequest) returns (AccountAddResponse);
  rpc AccountWatch(AccountWatchRequest) returns (stream AccountEvent);
  // one RPC per catalog operation
}

message Context {
  optional string request_id = 1;
  optional int64 deadline_unix_ns = 2;
  optional string idempotency_key = 3;
  optional string trace_id = 4;
}

message AccountAddRequest {
  Context context = 1;
  optional string name = 2;
  optional string email = 3;
}

message AccountAddResponse {
  string request_id = 1;
  string id = 2;
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-01 | The proto is generated from the catalog and checked in. | Generation and check-in. | Message fields. | V2 diff. |
| GRPC-02 | Field numbers are never reused. Removed numbers are `reserved`. | Reserved rule. | — | V2 schema check. |
| GRPC-03 | Scalars that need presence are declared `optional`. | Presence rule. | Field set. | V2 schema check. |
| GRPC-04 | `Context` uses the fixed field numbers from Part III.2 §8.1. | Field numbers. | — | V2 schema check. |
| GRPC-05 | Generated protobuf types do not appear in `*-core` or `*-operation`. | Import ban. | — | V2 scan. |
| GRPC-17 | Every reply message carries the operation's `request_id`. | Field. | — | V3 test. |
| GRPC-18 | Typed protobuf messages are the gRPC binding; the universal JSON-bytes envelope is not required. | Binding. | Message shape. | V3 contract test. |
| GRPC-19 | A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient. | Result authorization. | Store backend. | V3 test. |

---

