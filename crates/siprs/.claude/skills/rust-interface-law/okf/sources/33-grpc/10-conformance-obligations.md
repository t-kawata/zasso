---
type: "Section"
title: "10. Conformance Obligations"
description: "1. Every catalog operation has one RPC."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "33-grpc-10-conformance-obligations"
    title: "10. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/33-GRPC.md"
x-source-span: "214-228"
---
## 10. Conformance Obligations

1. Every catalog operation has one RPC.
2. Proto field numbers are stable; removed numbers are reserved.
3. Missing/wrong-audience token returns `UNAUTHENTICATED`.
4. Every error category maps to the fixed status.
5. Deadline propagation.
6. Streaming modes match the catalog.
7. Generated types do not appear in core/operation.
8. No direct handler call; dispatcher only.
9. Audience isolation: a REST token is rejected.
10. `cargo test -p <project>-grpc` and `cargo clippy -p <project>-grpc -- -D
    warnings`.
11. The conformance report names `GRPC-01` through `GRPC-19`.

