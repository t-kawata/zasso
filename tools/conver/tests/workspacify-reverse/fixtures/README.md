# The workspacify-reverse fixtures

Every directory here is a **subject**: an input a real run can be pointed at.
None of them is an assertion, and none is a whole project — each carries the one
property its tests read and nothing else. Naming that property here is what stops
a later ticket adding a sixth fixture that duplicates the fifth.

Two are representatives of an execution pattern rather than of a crate, and they
live under `patterns/`. The rest are Rust subjects that the earlier stages read.

| Fixture | The one property it exercises |
|---|---|
| `sample-project/` | a tree carrying forward-rotation traces at every layer — the subject `detect`, `scrub` and `verify` converge to zero residue over |
| `unclosed-header-project/` | an `Initial Design Artifact` header that is never closed, which a header parser that trusted its terminator would read past |
| `mixed-l3-project/` | production code sitting beside an L3 dependency, so whole-file removal is not available and the L3 rule has to stay where it is |
| `r3-subject/` | a crate whose declarations R3's call vocabulary reads — a login path, a gated path, a session and an error type |
| `two-package-crate/` | two packages that import back into each other, so every boundary crossing runs both ways and the cycle is real |
| `patterns/partial-conver-project/` | **pattern 3**: some conver artefacts and not the set — a design document and its ledger at the document's own directory, no graph, no Dirs-Tree, no DesignTree |
| `patterns/spec-only-project/` | **pattern 4**: empty plus a long specification — a specification above the detection's declared threshold and no implementation source at all |

## The two representatives

`patterns/partial-conver-project/` and `patterns/spec-only-project/` represent
**the pattern, not a project's scale**. Design §1.1 distinguishes the four
patterns by what conver scaffolding already exists on disk, and the detection
reads exactly that: artefact presence, the shape of the subject, and nothing
else. Presence and shape are what these two directories exercise completely.

What a fuller representative would need, and what these deliberately do not
carry:

- a real development history, which R4 reads and the detection does not
- a real test suite, which R3 and R5 read and the detection does not
- enough directories for a partition to be non-trivial, which is P24-1's language
  representatives and P24-8's terminal-state observation rather than this
  ticket's work

Each representative's own `README.md` states the same thing beside the fixture,
so the directory does not have to be read through this file.

## The fixtures are never written to

The suite copies a fixture into a temporary directory before any run that could
change it. The one test that reads a fixture in place (`real-tree.test.mjs` over
the experiment input) asserts the tree is byte-identical afterwards. A fixture
edited by a test run would make every later reading of it a reading of something
else.
