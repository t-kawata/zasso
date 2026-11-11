---
type: List
id: list/20-core-crate-10-conformance-obligations/1/3abf09034c39
phase: core
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 3abf09034c391f2b2041ad71d47717628da1d291a18ed2bd6cca2fed7bb61f08
source: docs/archive/IMPLEMENTATION-SPEC/20-CORE.md
---
1. Type-level tests for illegal-state rejection.
2. Transition tests for every listed transition and every rejected transition.
3. Port tests with deterministic fakes.
4. Import scan: no transport, JWT, SSO, HTTP, database driver, or file I/O.
5. `cargo test -p <project>-core` and `cargo clippy -p <project>-core -- -D warnings`.
