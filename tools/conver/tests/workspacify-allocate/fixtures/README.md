# Allocate-side regression fixtures

These fixtures exist so the forward-rotation regression gate has something to
measure on the allocate side. Before P22-1 the directory did not exist at all,
which is self-audit finding 2 in `docs/ABOUT-REVERSE.md` §11.9: the design had
asserted "never break the forward rotation" since it was written, and the
allocate half of that assertion had no input.

## What is here

`sample-tree/` is one stage-2 input, frozen as three files:

| File | What it is |
|------|------------|
| `WORKSPACIFY-TREE-MANIFEST.json` | A COMPLETE stage-1 manifest carrying the hand-off proofs stage 2 relies on |
| `spec.md` | The specification the stage-1 manifest was built from |
| `decisions.json` | A publishable decisions payload for every `seed_required` package |

## How they were produced

They were generated once, by hand, from the same builders the allocate test
suite uses — `buildValidManifest`, `makeDecisions` and `DEFAULT_SPEC_TEXT` in
`../../helpers/build-valid-manifest.mjs`. The output was then written to disk
and is committed as **static data**, deliberately not regenerated on each run:
the values the gate freezes are only meaningful if the inputs cannot move
underneath them.

## How they are used

The regression gate copies this tree into a temporary directory, runs
`allocate finalize` there, and freezes the normalised digest of the manifest it
produces. The copy is what makes the measurement read-only — the fixtures
themselves are never written to, and a safety guarantee in the allocate stage
deliberately refuses to run in place over a populated tree.
