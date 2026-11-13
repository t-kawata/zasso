---
type: Paragraph
id: paragraph/30-rest-adapter-2-dependencies/1/597d51cd0ad9
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: 597d51cd0ad9b3894ae4563d918e8d39f5359af756078fca0dbd36bfb84378a9
source: sources/30-REST.md
---
`*-rest` MUST NOT depend on `*-core`, `*-operation` internals, or another
interface crate. It depends on the contract crates and the dispatcher.
