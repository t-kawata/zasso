# `patterns/siprs-for-reverse/` — the experiment subject's decisions input

This directory is **not a representative**. The representative is the tree at the
project root, `siprs-for-reverse/`, and this directory exists so nothing has to be
written into it.

`DECISIONS.json` is the AI-authored judgement `workspacify-tree` requires before
it will publish: the `workspace[]` partition, the `ownership[]` table and a
settlement for every specification-pulse candidate. It is derived from the
measured tree and from the origin spec the reverse rotation publishes, and pinned
here once it is taken.

It is mirrored rather than placed beside the representative because that
representative is a frozen instrument. `siprs-for-reverse` is measured against
`siprs-with-4layers`, and the oracle asserts the two trees differ by exactly the
renamed test files; a decisions input inside the subject would be an eleventh
difference and would make the answer key disagree with the subject it answers
for. A fixture under `tests/` is already written by the suite and holds its own
files, so the specification's two pattern representatives keep theirs beside them
— this one cannot.

Reproduce or replace it with the helper that authored it:

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
