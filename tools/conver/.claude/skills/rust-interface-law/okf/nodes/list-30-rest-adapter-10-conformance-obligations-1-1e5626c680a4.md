---
type: List
id: list/30-rest-adapter-10-conformance-obligations/1/1e5626c680a4
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: 1e5626c680a4c0c6e4c7e6333ab7eb7b01cf94c5d2f2a6aebe50f2b5dc0e361c
source: sources/30-REST.md
---
1. Every documented route is served, and every served operation is documented.
2. Bearer-only enforcement; query/path tokens rejected.
3. Audience isolation: a token for another interface is rejected.
4. Error mapping matches the category table for every code.
5. Idempotency key is propagated.
6. CORS/Origin denial for unlisted origins.
7. No business logic: import scan and review.
8. `cargo test -p <project>-rest` and `cargo clippy -p <project>-rest -- -D
   warnings`.
9. The conformance report names `REST-01` through `REST-18`.
