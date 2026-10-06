# BUG-FIX002 — the question gate never reads a pre-decided item from any explanation

| Field | Value |
|---|---|
| Id | BUG-FIX002 |
| Reported | 2026-10-06 |
| Reported from | `crates/network/gaia-network` (`/grill-me-for-rfc` run, pkg-0020) |
| Primary target | `.claude/scripts/question-gate/prior-decisions.mjs` |
| Secondary targets | `.claude/scripts/grill-me-for-rfc/settle-run.js`, `.claude/scripts/drill-rfc-down/settle-run.js`, `.claude/scripts/question-gate/block.mjs`, `.claude/scripts/explain-seed/lib/items.mjs` |
| Severity | Blocking for the gate's stated purpose. Not a crash: every run succeeds while silently losing a whole input class. |
| Status | Open |

---

## 1. Summary

Before a grill or drill run may ask anything, it reads the package's prior artifacts and
records what they decide. One of those artifacts, `EXPLAIN-RFC-SEED.md`, carries the items the
human already settled (the `先に決めた` items, A1, A2, …). **The reader has never been able to
recognise a single one of them.** The predicate it uses is exact equality on a heading; the
writer that produces every such document always appends a suffix to that heading. The two were
written independently, neither side has a test, and the mismatch is total:

```text
EXPLAIN-RFC-SEED.md files in the workspace : 32
`### 先に決めた …` items across them        : 480
items the reader recognises                : 0
```

Every run of `/grill-me-for-rfc` and `/drill-rfc-down` so far has therefore treated the
human's already-settled items as if they did not exist. The concrete cost is that an item the
human has settled once can be asked again, which is the exact failure the gate exists to
prevent.

This is not a defect in one file's data. It is a predicate defined twice, with two different
meanings, and no test on either definition. Any fix that only makes today's corpus parse will
recur the moment either side's spelling moves.

---

## 2. Defect 1 — one heading token, two predicates, zero overlap

### 2.1 The reader requires exact equality

`.claude/scripts/question-gate/prior-decisions.mjs:25`

```js
export const PREDECIDED_ITEM_HEADING = '### 先に決めた';
```

`.claude/scripts/question-gate/prior-decisions.mjs:68-71`

```js
function decisionsOfExplanation({ artifact, source, text }) {
  return readLabelledItems(text)
    .filter((item) => item.heading === PREDECIDED_ITEM_HEADING)   // line 70: exact equality
    .filter((item) => (item.labels[GROUND_LABEL] ?? '') !== '')
```

`readLabelledItems` stores `heading: line` — the **whole trimmed heading line**, not the token.
So the filter matches only a line whose entire text is exactly `### 先に決めた`.

### 2.2 The writer always appends a suffix

`.claude/scripts/explain-seed/lib/items.mjs:18` — the same token, defined a second time:

```js
export const PREDECIDED_ITEM_HEADING = '### 先に決めた';
```

`.claude/scripts/explain-seed/lib/items.mjs:63-75` — the producer's own splitter, matching by
prefix:

```js
export function splitItems(sectionBodyText, heading) {
  const items = [];
  let current = null;
  for (const line of String(sectionBodyText).split('\n')) {
    if (line.startsWith(heading)) {        // line 67: prefix, not equality
```

`.claude/scripts/explain-seed/lib/frame.mjs:962` — the frame that writes the document:

```js
`${PREDECIDED_ITEM_HEADING} A${index + 1}${REFERENCE_SEPARATOR}${entry.reference}`,
```

With `REFERENCE_SEPARATOR = ' — '` (`items.mjs:21`), the written heading is always of the form
`### 先に決めた A1 — contract-boundary-083 の clauses.errors`. It is **never** the bare token.

### 2.3 The overlap is provably empty

Measured on `crates/network/gaia-network/EXPLAIN-RFC-SEED.md` (11 pre-decided items):

```text
lines starting with PREDECIDED_ITEM_HEADING : 11
lines equal to PREDECIDED_ITEM_HEADING      : 0
```

Measured across the whole workspace:

```bash
$ grep -rh "^### " --include="EXPLAIN-RFC-SEED.md" . | sort | uniq -c | sort -rn | head
  32 ### 用語ミニ辞典
  32 ### 踏むと壊れる線
   3 ### 先に決めた A8 — contract-boundary-001 の clauses.tests
   3 ### 先に決めた A7 — contract-boundary-001 の clauses.preconditions
   ...
```

There is not one bare `### 先に決めた` heading anywhere in the workspace. The reader's decision
list is empty for every document the project's own writer produces.

### 2.4 Blast radius

- `.claude/scripts/grill-me-for-rfc/settle-run.js:35` and
  `.claude/scripts/drill-rfc-down/settle-run.js:35` both
  `import { priorDecisions } from "../question-gate/prior-decisions.mjs"`, so both commands are
  affected identically.
- `decisionsOfExplanation` is the only producer of `kind: 'decision'` entries for an
  explanation. `INFO-RFC-SEED.md` and `RFC-SEED.md` go through `groundsOfStatements`, so they
  are unaffected — which is why the scan looks healthy at a glance (`grounds: 545`) while the
  decision list is empty.
- Because the loss is silent, no run has ever reported it.

---

## 3. Defect 2 — the scan record says what contributed, not what was read

`settle-run.js:236-243` builds the scan record:

```js
tree.priorScan = {
  scannedAt: new Date().toISOString(),
  directories: [...directories],
  artifacts: [...new Set(entries.map((entry) => entry.artifact))],   // line 239
  decisions: entries.filter((entry) => entry.kind === "decision"),
  grounds: entries.filter((entry) => entry.kind === "ground"),
  unreadable: [...unreadableDocuments],
};
```

`artifacts` is derived from the **entries produced**, not from the files read. An artifact that
is present and readable but yields zero entries disappears from `artifacts` entirely. That is
exactly what `EXPLAIN-RFC-SEED.md` does today, and the observable result is:

```text
$ node .claude/scripts/grill-me-for-rfc/settle-run.js <dir> prior   # (before RFC.md existed)
# priorScan.artifacts === ["RFC-SEED.md", "INFO-RFC-SEED.md"]
# EXPLAIN-RFC-SEED.md is absent, though it was read.
```

Two independent harms follow.

**Harm A — the gate's own judgement is derived from a false record.** `settle-run.js:301,320`:

```js
const scannedArtifacts = tree.priorScan?.artifacts ?? [];
...
if (scannedArtifacts.length > 0 && !scannedArtifacts.some((artifact) => block.settleTrace.includes(artifact))) {
  faults.push({ kind: "unread-prior-artifact", ... });
```

A block whose settle trace names `EXPLAIN-RFC-SEED.md` — truthfully, because the run did read
it — is refused with "its reason names none of: …". The gate punishes an honest trace because
its record of what was read is incomplete.

**Harm B — the ground universe is incomplete.** `update-tree.js:80-87`:

```js
function recordsOf() {
  const scan = tree.priorScan;
  if (scan === undefined) return [];
  return [
    ...(scan.artifacts ?? []),
    ...(scan.decisions ?? []).map((entry) => entry.ground).filter(...),
    ...(scan.grounds ?? []).map((entry) => entry.statement),
  ];
}
```

`settlePoint` (`question-gate/settle.mjs`) accepts a ground only when
`records.includes(ground)`. With Defect 1 fixed, the 480 recovered items would also feed
`scan.decisions[].ground` into this universe. With Defect 2 unfixed, the artifact itself stays
invisible to it.

**The distinction the record is missing.** `unreadable` today means "could not be read". There
is no way to express "read successfully and contributed nothing", so the two states are
indistinguishable in the record — and they mean opposite things to a reader of the scan.

---

## 4. Defect 3 — the same class, latent, in the question block reader

This is the same shape as Defect 1 and must be fixed with it, or the same bug returns at the
next token.

The gate's block renderer writes a bare options label
(`.claude/scripts/question-gate/block.mjs:39` and `:67`):

```js
const options = choice.directions.map((direction) => `${direction.letter}: ${direction.meaning}`).join('\n');
return [
  ...
  `${BLOCK_LINES[4]}\n${options}`,     // BLOCK_LINES[4] === '選択肢', bare
```

The reader requires that bare form exactly (`block.mjs:103`):

```js
const optionsIndex = lines.findIndex((line) => line.trim() === OPTIONS_LABEL);
if (optionsIndex === -1) {
  return { ok: false, faults: [{ kind: 'missing-options', line: null }] };
}
```

But the frame that writes the real documents writes a labelled bullet instead. Observed in the
workspace today — 31 occurrences across at least these files:

```text
crates/network/gaia-network/EXPLAIN-RFC-SEED.md:97:- 選択肢:
crates/network/gaia-network/EXPLAIN-RFC-SEED.md:125:- 選択肢:
crates/protocol/gaia-soul/EXPLAIN-RFC-SEED.md
crates/adapters/gaia-ekyc-adapter/EXPLAIN-RFC-SEED.md
crates/adapters/storage/gaia-store-postgres/EXPLAIN-RFC-SEED.md
...
```

`- 選択肢:` does not trim to `選択肢`, so a frame-written block fed to `readBack` yields
`missing-options`, which `settle-run.js shapeFaults` reports as a defect on the block. No
question block exists in any `DesignTree.json` yet, so **this has not yet caused a visible
failure** — it is latent, and it is reported here as such rather than as an observed one.

---

## 5. Required fix

The fix must make the class of defect impossible, not make today's corpus parse. Four
requirements.

### R1 — one predicate, one definition, used by both sides

There must be exactly **one** definition of each document token and of the rule that recognises
it, and both the producer and the consumer must call it. Today the token `### 先に決めた` is
defined twice (`question-gate/prior-decisions.mjs:25` and `explain-seed/lib/items.mjs:18`) and
the recognition rule is implemented twice with different semantics
(`items.mjs:67` prefix vs `prior-decisions.mjs:70` equality).

Preferred shape: a shared module that exports the token **and** the predicate, imported by
both sides, so that a future change to the spelling cannot reach one side without the other.

```js
// one definition, two callers — shape, not a prescribed file layout
export const PREDECIDED_ITEM_HEADING = '### 先に決めた';

/** Whether one raw line opens a pre-decided item. */
export function isItemHeading(line, heading) {
  return String(line).startsWith(heading);
}
```

If moving the definition is too invasive for this fix, the minimum acceptable form is that the
consumer imports the producer's `splitItems`/token rather than restating either — a second copy
that happens to agree is still two copies.

### R2 — the recognition rule must be the producer's rule, not a guess about it

Do not replace exact equality with a narrower pattern that happens to fit the current corpus.
A regex such as `/^### 先に決めた A\d+/` reproduces today's output and breaks on the next
ordinal scheme, the next separator, or a document written by an older frame. The producer's own
rule is `startsWith` on the heading token (`items.mjs:67`); the consumer must accept what the
producer writes, now and later.

A producer that emits a heading whose item the consumer would reject is the failure mode to
design out, and the test for it is the round trip (R3).

### R3 — the round-trip property is the test

The invariant that makes this class of defect unrepeatable:

> For any explanation the frame writes, the reader recovers exactly the items the frame wrote.

This is one property test, and it also covers Defect 3 if it is written over both tokens
(pre-decided items and the options line). It must be a property over generated input, not an
assertion about the 32 files that happen to exist.

### R4 — the scan record must say what was read

`settle-run.js` `runPrior` must record the artifacts **read**, independent of whether they
produced entries, and must distinguish "read, contributed nothing" from "could not be read".

`entriesOfDirectory` (`prior-decisions.mjs:192`) is the right place to collect this: it already
knows the name list and which names were readable. Return the artifacts read alongside the
entries, or add a sibling function, so that `runPrior` has both facts available.

### R5 — both copies, or one implementation

`.claude/scripts/grill-me-for-rfc/settle-run.js` and
`.claude/scripts/drill-rfc-down/settle-run.js` are byte-identical today
(sha256 `7a59a883da23c6c7…`, 402 lines each), and the file's own header claims the two copies
"cannot drift" — nothing enforces that claim. `runPrior` is in both copies and Defect 2 is
fixed there, so:

- either extract the shared logic into `question-gate/` so there is one implementation, or
- keep two copies and add a test asserting they are byte-identical, so the claim becomes true.

---

## 6. Prohibited fixes

Each of these makes the symptom disappear while leaving the defect, or breaks something else.

1. **Editing any generated document.** Do not add a bare `### 先に決めた` heading, or change
   `- 選択肢:` to `選択肢`, in `crates/network/gaia-network/EXPLAIN-RFC-SEED.md` or in any other
   `EXPLAIN-RFC-SEED.md`. There are 32 of them, they are generated output, and editing one
   fixes one package while hiding the defect.
2. **Hardcoding the current corpus.** No `A1` … `A11` list, no reference-name list, no
   `/^### 先に決めた A\d+ — /`.
3. **Special-casing a package or a path.** `gaia-network`, `pkg-0020`, or any single directory
   name must not appear in the fix.
4. **Loosening the ground contract.** `settlePoint`'s rule that a settlement rests on a record
   the run actually read is correct and must not be relaxed to make settling easier. In
   particular, do not make `records.includes(ground)` accept a substring or a prefix match.
5. **Fixing one copy.** Leaving `drill-rfc-down/settle-run.js` unchanged is a fix that fails
   half the commands.
6. **Making the reader stricter to match the writer, or the writer stricter to match the
   reader, without a round-trip test.** Either direction can be correct; an untested choice is
   not.

---

## 7. Method — Red, Green, Refactor

This repository's supreme law is TDD in strict order. For this fix that means:

### 7.1 Red — write the failing tests first

There is **no test anywhere** for `question-gate` or for `explain-seed/lib/items.mjs`:

```bash
$ grep -rln "prior-decisions\|priorDecisions\|PRIOR_ARTIFACTS" .claude/tests tests
(no output)
$ grep -rln "splitItems\|items.mjs\|PREDECIDED" .claude/tests tests
(no output)
```

That absence is why the drift survived. Write, and confirm each fails for the right reason
before touching any source:

**T1 — the round trip (R3).** Generate an explanation body with the frame's own
`splitItems`/heading format, pass it through `priorDecisions`, and assert the recovered
pre-decided item count equals the number written. Today this must fail with reader 0,
writer N.

**T2 — the corpus (evidence, and a regression net).** For every `EXPLAIN-RFC-SEED.md` in the
workspace, assert that the reader recovers as many pre-decided items as a raw
`startsWith(PREDECIDED_ITEM_HEADING)` count of the same file finds. Today: 0 versus 480.

**T3 — the block round trip (Defect 3).** Render a block with `renderBlock`, read it with
`readBack`, and assert `ok: true`; then do the same for a block in the frame's spelling and
assert the same. Today the second must fail with `missing-options`.

**T4 — the scan record (R4).** Run `priorDecisions` over a directory holding a readable
`EXPLAIN-RFC-SEED.md` that yields no entries, and assert the artifact is reported as read, and
that "read, contributed nothing" is distinguishable from "unreadable". Today this must fail.

**T5 — the two settle-run copies (R5).** If the copies are kept, assert byte equality. Today
this passes, and it must keep passing after the fix.

Test file placement follows the repository rule: mirrors the scripts tree, `.test.mjs` beside
ESM sources. `question-gate` declares `{"type":"module"}`, so its tests are `.test.mjs`.

### 7.2 Green — implement to the property

Make T1–T4 pass by R1, R2, R4. Nothing else. Do not touch the generated documents.

### 7.3 Refactor — green only

Then apply the Boy Scout rule to what was touched: the doubled constant, the doubled predicate,
and the false claim in the `settle-run.js` header that the two copies cannot drift.

---

## 8. Acceptance Criteria

| # | Criterion | How it is checked |
|---|---|---|
| A1 | The reader recovers every pre-decided item the frame writes, for generated input | T1 passes |
| A2 | The reader recovers 480 items across the 32 workspace `EXPLAIN-RFC-SEED.md` files, or whatever the raw prefix count is at the time | T2 passes |
| A3 | A block in the frame's spelling is accepted by `readBack` | T3 passes |
| A4 | A readable artifact that yields no entries is reported as read, and is distinguishable from an unreadable one | T4 passes |
| A5 | `settle-run.js` `priorScan.artifacts` lists `EXPLAIN-RFC-SEED.md` when that file is readable | asserted in T4 and visible in a live `prior` run |
| A6 | No generated document in the workspace is modified | `git status` shows no change under `crates/**/EXPLAIN-RFC-SEED.md` |
| A7 | The two `settle-run.js` copies are byte-identical, or the shared logic has one implementation | T5 passes |
| A8 | The suite is green, with no skipped test | `node .claude/tests/run-all.js` |
| A9 | The fix names no package, no path and no corpus-specific string | review of the diff |
| A10 | `settlePoint`'s ground contract is unchanged | review of the diff: no change to `question-gate/settle.mjs` matching semantics |

### 8.1 Verification commands

```bash
# the suite (repository rule: run tests through the documented runner)
node .claude/tests/run-all.js

# the live check that the defect is gone: this must now be non-zero
node .claude/scripts/grill-me-for-rfc/settle-run.js \
     crates/network/gaia-network prior \
  | grep -c "EXPLAIN-RFC-SEED.md"

# the raw count A2 compares
for f in $(find . -name "EXPLAIN-RFC-SEED.md" -not -path "*/node_modules/*"); do
  grep -c "^### 先に決めた" "$f"
done | paste -sd+ | bc
```

Note: `settle-run.js prior` writes `DesignTree.json` in the directory it is given. Run it
against a scratch copy, or restore the file afterwards, so a verification step does not modify
a completed run's tree.

---

## 9. Decisions the fixer must surface, not make silently

Each of these is a real fork. Pick one, state it in the fix summary, and say why.

1. **Which spelling of the options line is canonical.** The gate writes `選択肢`; the frame
   writes `- 選択肢:`. Either can be made canonical, or both can be accepted. Whichever is
   chosen, the round-trip test must cover the other one's documents, because both exist in the
   workspace right now.
2. **Whether a bare artifact name stays a valid ground.** `update-tree.js recordsOf()` includes
   `scan.artifacts` in the record universe, so `ground: "RFC-SEED.md"` is currently accepted —
   a ground with no proposition. Fixing R4 adds `EXPLAIN-RFC-SEED.md` to that same universe.
   That is consistent with today's behaviour; whether it is *intended* is a separate question.
   Do not change it in this fix without saying so.
3. **Whether the two copies are extracted or asserted equal** (R5). Extraction is the stronger
   answer; assertion is the smaller change. Both satisfy A7.
4. **Whether `priorDecisions` should return the artifacts read, or a sibling function should.**
   Either keeps `priorDecisions`'s signature stable; say which was chosen.

---

## 10. Evidence appendix

Reproduction of Defect 1, run against the real module on 2026-10-06:

```js
import { priorDecisions, PRIOR_ARTIFACTS, PREDECIDED_ITEM_HEADING }
  from "./.claude/scripts/question-gate/prior-decisions.mjs";
import fs from "node:fs";

const dir = "crates/network/gaia-network";
const entries = priorDecisions({
  directory: dir,
  readFile: (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } },
  listDirectory: (d) => { try { return fs.readdirSync(d); } catch { return []; } },
});

const text = fs.readFileSync(dir + "/EXPLAIN-RFC-SEED.md", "utf8");
console.log("EXPLAIN headings: startsWith =",
  text.split("\n").filter((l) => l.startsWith(PREDECIDED_ITEM_HEADING)).length,
  " / exact =",
  text.split("\n").filter((l) => l.trim() === PREDECIDED_ITEM_HEADING).length);
```

Observed output:

```text
EXPLAIN headings: startsWith = 11  / exact = 0
```

The decision count for the same directory read `0` while `RFC.md` did not yet exist. Once a run
has written `RFC.md`, that file matches `CANONICAL_RFC_PATTERN` (`prior-decisions.mjs:21`) and
its paragraphs are read as decisions by `decisionsOfCanonicalRfc`
(`prior-decisions.mjs:118`), which is why a later reading of the same directory reports a
non-zero decision count — none of which comes from the explanation. A fixer comparing counts
before and after must account for whether `RFC.md` is present, or the measurement will look
like it changed for the wrong reason.

Counts used in this document:

| Quantity | Value |
|---|---|
| `EXPLAIN-RFC-SEED.md` files in the workspace | 32 |
| `### 先に決めた …` items across them | 480 |
| Items the reader recognises | 0 |
| `settle-run.js` copies | 2, byte-identical, sha256 prefix `7a59a883da23c6c7` |
| Tests covering `question-gate` | 0 |
| Tests covering `explain-seed/lib/items.mjs` | 0 |
