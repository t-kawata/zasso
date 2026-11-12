---
type: Paragraph
id: paragraph/20-core-crate-2-dependencies/1/7e2e98a4355b
phase: core
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 7e2e98a4355b62a70a15e2fb0c74882094728b548320d2c069354760d318c5d6
source: docs/archive/IMPLEMENTATION-SPEC/20-CORE.md
---
`*-core` MAY depend on pure utility crates (time, UUID, decimal). It MUST NOT
depend on a transport SDK, an authentication implementation, or a persistence
driver. Persistence ports are traits; the driver lives in an adapter crate.
