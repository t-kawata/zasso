---
type: Paragraph
id: paragraph/20-core-crate-6-ports/2/1f27817d7fb1
phase: core
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 1f27817d7fb185109663336626e82822bd48369d70b90138a571075d2afeb37c
source: sources/20-CORE.md
---
A port trait is an **open extension point**: a project may add a port, but it
must not add an infrastructure dependency to core. Infrastructure implements the
port in an adapter crate.
