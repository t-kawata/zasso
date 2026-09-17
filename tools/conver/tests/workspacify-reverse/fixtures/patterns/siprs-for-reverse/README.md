# `patterns/siprs-for-reverse/` — the experiment subject's decisions input

This directory is **not a representative**. It was the decisions input of the tree
at the project root, `siprs-for-reverse/`, mirrored here so nothing had to be
written into that tree. **The tree has since been deleted**, and this directory is
now the only copy: the reading below outlives its subject, and nothing can
re-derive it.

`DECISIONS.json` is the AI-authored judgement `workspacify-tree` requires before
it will publish: the `workspace[]` partition, the `ownership[]` table and a
settlement for every specification-pulse candidate. It is derived from the
measured tree and from the origin spec the reverse rotation publishes, and pinned
here once it is taken.

It was mirrored rather than placed beside the representative because that
representative was a frozen instrument: `siprs-for-reverse` was measured against
`siprs-with-4layers`, and the oracle asserted the two trees differed by exactly
the renamed test files, so a decisions input inside the subject would have been an
eleventh difference. A fixture under `tests/` is already written by the suite and
holds its own files, which is why the specification's two pattern representatives
keep theirs beside them — this one could not.

Reproducing it needs the tree it was measured over, so this command no longer
runs; it is kept as the record of how the reading was taken. Replacing it needs a
new subject to measure, which is a different representative and a different
reading.

The helper that authored it:

```sh
node -e "import('./tests/workspacify-reverse/helpers/decisions-authoring.mjs') \
  .then((m) => m.writeDecisions({ \
    specPath: '<the ORIGIN-LONG-SPEC.md the reverse run published>', \
    measuredRoot: '<a scratch copy of siprs-for-reverse>', \
    representative: 'siprs-for-reverse', \
    projectRoot: process.cwd(), \
  }))"
```

The file is large — one settlement per pulse candidate, and a claim-carrying
specification produces thousands of them. Read it through
`decisions-authoring.mjs` rather than by eye.

## Which reading this is

`integration/decisions-authoring.test.mjs` holds `PINNED_DECISIONS_DIGEST`, the
SHA-256 of the bytes below, and asserts the file still hashes to it. The input
also records `decisions_input.spec_digest`, the digest of the origin spec the
settlements were taken over — a path names where one operator happened to keep a
scratch copy, and only the digest says the reading is still about the same
document. Re-taking the judgement means re-running the helper and updating the
constant; editing the file without doing so fails that test rather than passing
as the same reading.
