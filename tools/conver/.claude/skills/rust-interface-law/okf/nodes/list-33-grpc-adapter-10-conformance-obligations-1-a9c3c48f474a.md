---
type: List
id: list/33-grpc-adapter-10-conformance-obligations/1/a9c3c48f474a
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: a9c3c48f474aa8a9c928505aadb069240dc8fb20dbe10a1b1aca9cabae6ec9e4
source: sources/33-GRPC.md
---
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
