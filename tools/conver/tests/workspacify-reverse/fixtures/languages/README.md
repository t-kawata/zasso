# The language representatives

Five frozen subject trees, one per non-Rust target language, beside the two
siprs trees. Together with `../r3-subject` — the Rust representative, which is an
existing fixture rather than a tree added here — they are **the instrument's
validation population**: the material the six-language vocabulary, name filters
and grammars are measured against.

They are not the experiment's input. `siprs-for-reverse` is the experiment
subject and the four pattern representatives are P23-12's audit input; the three
populations are declared separately, and disjointly, in `LANGUAGES.json`.

| Tree | Chosen for |
|---|---|
| `typescript/` | a re-export, and a declaration merge |
| `javascript/` | a computed property name, a dynamic `require`, a prototype method |
| `go/` | a build tag, an embedded struct, a table-driven test |
| `python/` | a metaclass, a decorator, a `__getattr__` hook |
| `c_cpp/` | a function-like macro, a conditional compilation block, one header included twice |

**`LANGUAGES.json` is the declaration.** Each entry records the root, the pinned
revision, the tree digest and the environment it was taken in, the build command
and whether it reaches the network, and the constructs the tree was chosen for
with the `file:line` of each. Read that file rather than listing this directory:
"which languages have we exercised?" is answered there, and a tree that vanished
from it must fail a test rather than quietly leave the population.

Two of the six carry `offline: false`, and the reason beside each says which kind
of not-offline it is: `r3-subject` has no crate root, so `cargo test` cannot
build it at all; the TypeScript representative needs its compiler fetched. That
is a recorded property of the population, not a defect of it — §5.8 separates
the static measurements, which all six serve, from the execution channels, which
only the `offline: true` ones may be handed to.

These trees are never written to. The suite copies a subject before any run that
could change it, the runs over these representatives are read-only by
construction, and the provenance annotator is idempotent over them — it writes
each language's own comment token, so a second run leaves every digest where it
was. What makes any of that checkable is the `treeDigest` in `LANGUAGES.json`:
the digest check names the tree if anything writes to one.

Each tree's own `README.md` states the same thing beside it, so a directory does
not have to be read through this file.
