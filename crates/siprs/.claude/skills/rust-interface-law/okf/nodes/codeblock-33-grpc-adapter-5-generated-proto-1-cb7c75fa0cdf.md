---
type: CodeBlock
id: codeblock/33-grpc-adapter-5-generated-proto/1/cb7c75fa0cdf
phase: adapter
delivery: must
applies_to: grpc
requires: []
references: []
content_sha256: cb7c75fa0cdfb716f489fdbe9fee94b711a10510f174c15eb3b01c7d5b35c451
source: sources/33-GRPC.md
---
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
