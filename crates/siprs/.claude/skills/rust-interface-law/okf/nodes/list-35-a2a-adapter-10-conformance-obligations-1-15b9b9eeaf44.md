---
type: List
id: list/35-a2a-adapter-10-conformance-obligations/1/15b9b9eeaf44
phase: adapter
delivery: reference
applies_to: a2a
requires: []
references: []
content_sha256: 15b9b9eeaf44e93698f38904b6b917691fe87d4a2626453e07f6ab3b8bf6e13c
source: docs/archive/IMPLEMENTATION-SPEC/35-A2A.md
---
1. Every applicable operation has a skill; every skill maps to one operation.
2. The agent card declares the implemented security scheme.
3. A token for another audience is rejected.
4. Task state never enters business tables.
5. No business logic in the adapter.
6. Cancellation semantics match the operation.
7. Streaming termination distinguishes success, failure, and cancellation.
8. Every error category maps; no secrets in details.
9. `cargo test -p <project>-a2a` and `cargo clippy -p <project>-a2a -- -D
   warnings`.
10. The conformance report names `A2A-01` through `A2A-24`.
