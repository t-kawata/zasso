---
type: List
id: list/31-websocket-adapter-12-conformance-obligations/1/bce58cffa4fa
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: bce58cffa4fa6a226ae127b2a5cd2841cdf138c0ff784a791da7a8790c36f401
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
1. Ticket redemption, single use, expiry, and audience binding.
2. Ticket in query is rejected.
3. Request/response correlation under concurrency.
4. Per-resource FIFO mutation order.
5. Expiry rejects new operations.
6. Backpressure closes with 1013; size violation with 1009.
7. Disconnect cleanup leaves no connection-owned resources.
8. No direct handler call; dispatcher bypass test.
9. Audience isolation: a REST token cannot upgrade.
10. `cargo test -p <project>-websocket` and `cargo clippy -p
    <project>-websocket -- -D warnings`.
11. The conformance report names `WS-01` through `WS-32`.
