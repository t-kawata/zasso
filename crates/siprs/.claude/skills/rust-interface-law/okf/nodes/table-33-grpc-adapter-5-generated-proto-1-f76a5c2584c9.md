---
type: Table
id: table/33-grpc-adapter-5-generated-proto/1/f76a5c2584c9
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: f76a5c2584c9f974740e526e116281fcb65201a12346558f5b9c49bf2ed1b7a2
source: docs/archive/IMPLEMENTATION-SPEC/33-GRPC.md
---
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
