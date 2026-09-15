# Adjudication cards — the logical boundary and the physical one, side by side

These cards present two partitions and decide neither. Which partition the RFC records is the first of
the six judgements ABOUT-REVERSE 6.2 reserves for the AI, and a document that picked one would take it.

## Physical partition

- `.`
- `examples`
- `examples/common`
- `src`
- `src/api`
- `src/architecture`
- `src/audio`
- `src/build`
- `src/concurrency_contexts`
- `src/config`
- `src/error`
- `src/ffi`
- `src/model`
- `src/runtime`
- `src/security`
- `src/state`
- `src/tests`
- `tests`

## Logical partition

No prior partition is on disk at RFC-ROOT-Dirs-Tree.json, which is the normal case for a project that came in by pattern 1 or 3: the logical partition is undecided, so the cards below are a prompt rather than a comparison.

## Cards

- served: 18
- withheld: 0

- cards with no mismatch: 2
- merged: 25
- missing: 0
- extra: 0

### `.`

- adjudication: unresolved
- options: 1
- mismatches: none

### `examples`

- adjudication: unresolved
- options: 2
- mismatches: merged `examples`

### `examples/common`

- adjudication: unresolved
- options: 2
- mismatches: merged `examples/common`

### `src`

- adjudication: unresolved
- options: 3
- mismatches: merged `src`, merged `src`

### `src/api`

- adjudication: unresolved
- options: 3
- mismatches: merged `src/api`, merged `src/api`

### `src/architecture`

- adjudication: unresolved
- options: 2
- mismatches: merged `src/architecture`

### `src/audio`

- adjudication: unresolved
- options: 3
- mismatches: merged `src/audio`, merged `src/audio`

### `src/build`

- adjudication: unresolved
- options: 2
- mismatches: merged `src/build`

### `src/concurrency_contexts`

- adjudication: unresolved
- options: 2
- mismatches: merged `src/concurrency_contexts`

### `src/config`

- adjudication: unresolved
- options: 3
- mismatches: merged `src/config`, merged `src/config`

### `src/error`

- adjudication: unresolved
- options: 3
- mismatches: merged `src/error`, merged `src/error`

### `src/ffi`

- adjudication: unresolved
- options: 3
- mismatches: merged `src/ffi`, merged `src/ffi`

### `src/model`

- adjudication: unresolved
- options: 3
- mismatches: merged `src/model`, merged `src/model`

### `src/runtime`

- adjudication: unresolved
- options: 3
- mismatches: merged `src/runtime`, merged `src/runtime`

### `src/security`

- adjudication: unresolved
- options: 2
- mismatches: merged `src/security`

### `src/state`

- adjudication: unresolved
- options: 3
- mismatches: merged `src/state`, merged `src/state`

### `src/tests`

- adjudication: unresolved
- options: 2
- mismatches: merged `src/tests`

### `tests`

- adjudication: unresolved
- options: 1
- mismatches: none

## What was withheld


A candidate whose mismatches are zero agrees with the measured layout by construction, which is what that
rule asserts rather than a finding about the architecture: a zero difference is a signal rather than a clean
result (design 2.4, F1). A mismatch recorded above is not a contradiction — a contradiction is an
*unrecorded* inconsistency, and the record is this page.
