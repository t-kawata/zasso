# FIX-PLAN004 — `sequences-slice`: the per-package view prints a calibration sentence it never measured

**Status.** Plan. Nothing has been edited for it. No file listed in §3 has been touched. Written
2026-10-13 from a run of `/grill-me-for-rfc` in `~/shyme/gaia`, where the defect was found in a
consumer. The repair belongs here, because this repository is the development home of the rail
and the consumer holds an installed copy of it.

**The one sentence.** `buildPackageView` renders a workspace-wide statement from a package-local
input it fabricates as empty, so every package's `SEQUENCES.md` carries the same false claim
about its own coverage.

**Scope.** `.claude/scripts/sequences-slice/lib/view.mjs`, `calibrate.mjs` (the seed walker
moves out of it), `lib/segments.mjs` (the walker's new home), `run.mjs`,
`tests/sequences-slice/view.test.mjs`, `tests/sequences-slice/run.test.mjs`,
`tests/sequences-slice/calibrate.test.mjs`, and — only through `make install-to-projects` — the
four installed copies. Nothing outside `~/shyme/zasso/tools/conver` is edited by this plan.

---

## 1. The defect, as measured

### 1.1 Two packages that claim different things print the same sentence

`~/shyme/gaia` holds two generated views, and their seeds claim different segments:

| Package | `RFC-SEED.md` `source_segments` |
|---|---|
| `crates/foundation/gaia-foundation` | `["s-000027"]` |
| `crates/network/gaia-network` | `["s-000024","s-000026","s-000028","s-000029","s-000031","s-000032","s-000033"]` |

Both `SEQUENCES.md` files carry these three lines, byte for byte:

```
It claims 0 of the specification's lines and leaves 15971 unclaimed, so it is total.
But 0 of the claimed lines are claimed by more than one package, and only 0 of 33 segments belong to a single package, the busiest to 0.
1 packages claim no segment at all, so it cannot reach them whatever the ranges are.
```

The same text is in both `SEQUENCES.json` files, under `lineRange.statement`, with
`claimedLineCount: 0`, `multiClaimedLineCount: 0`, `unclaimedLineCount: 15971`.

A function of a package's claims cannot return the same value for a package claiming one segment
and a package claiming seven. The paragraph therefore carries no information about either.

### 1.2 The same artifact, calibrated correctly, says something else entirely

`node .claude/scripts/sequences-slice/calibrate.mjs ~/shyme/gaia/GaiaSekkeiShiyousho_v32-sequences.json`
over the same artifact prints:

```
It claims 15969 of the specification's lines and leaves 2 unclaimed, so it is total.
But 14307 of the claimed lines are claimed by more than one package, and only 3 of 33 segments belong to a single package, the busiest to 15.
10 packages claim no segment at all, so it cannot reach them whatever the ranges are.
```

`10 packages claim no segment at all` is the finding `readPackageSegments` documents in its own
comment ("ten packages claiming nothing is one of the findings this calibration exists to
report"). The view path prints `1`, which is the count of the fabricated list's single entry,
not of the workspace.

### 1.3 The wrong number is not inert

`SEQUENCES.md` is a material `/grill-me-for-rfc` reads at STEP 0, and this defect has already
cost two runs: the human running the rail over `gaia-foundation` and then over `gaia-network`
asked, twice, whether an empty projection was a correct verdict or a broken detector. It was
neither — the emptiness was sound and this sentence was not — but nothing in the artifact let
them tell the two apart.

---

## 2. Root cause

`lib/view.mjs:83-86`:

```js
const structureSegments = normalizeStructureSegments(treeManifest.structure.segments);
const lineRange = measureLineRangeJoin({
  packageSegments: [{ packagePath: '', segmentIds: [] }],
  structureSegments,
  specLines: artifact.spec.lines,
});
```

`renderLineRangeStatement` (`lib/report.mjs:59`) is written for the workspace calibration and
its subjects are cross-package facts:

- `only N of 33 segments belong to a single package` — needs every package's claims;
- `the busiest to N` — needs every package's claims;
- `N packages claim no segment at all` — needs the package count and every package's claims.

`calibrate.mjs:152` supplies those claims, by walking `<workspaceRoot>/crates/**/RFC-SEED.md`
(`readPackageSegments`, `calibrate.mjs:125`, with `PACKAGE_ROOT_DIRECTORY = 'crates'` and
`SEED_FILENAME = 'RFC-SEED.md'` at `calibrate.mjs:37-38`). `buildPackageView` supplies one
fabricated empty entry instead
and then renders the same template over it. Every number in the resulting paragraph is the
arithmetic of nothing.

`measureLineRangeJoin` (`lib/segments.mjs:138-166`) is not at fault: given an empty list it
reports an empty measurement, which is correct. The fault is that its result is printed as
though it were the calibration.

**Why the sentence is there at all.** It is a contract, not an accident. `specs/PX-256.md` C003
postcondition: the view carries "the operations the package owns, the sequences it owns, the
sequences that cross its boundary, **and the calibration line coordinate statement**". This plan
keeps that contract and makes the statement true; it does not delete the requirement.

---

## 3. The change

### 3.1 The decision this plan takes, and the one it refuses

Two repairs are available.

- **A (this plan).** Give the view the real workspace segmentation, so the calibration sentence
  it must carry is measured rather than fabricated. The sentence stays, it becomes true, and it
  remains identical across views — because it is a workspace fact and always was.
- **B (refused).** Rewrite the paragraph to be about the package alone and amend C003's
  postcondition. Refused for two reasons: it invents a second sentence shape for the same
  measurement, and it weakens a ticket's postcondition to fit its implementation, which is the
  move this repository's own plans exist to prevent.

Under A the input must be data, not a path: `buildPackageView` stays pure (its inputs are the
artifact, the manifest, the package-segment list and the package id), and `run.mjs`, which
already does I/O, does the walking. A pure input is also what lets the regression test run
without a filesystem.

### 3.2 Tier 1 — one seed walker, in one place

`readPackageSegments` is private in `calibrate.mjs:125`. Its helper is already in the right place:
`readSourceSegments` is exported from `lib/segments.mjs:62` and imported at `calibrate.mjs:29`.
Move `readPackageSegments` beside that helper, into `lib/segments.mjs`, exporting it and taking
`PACKAGE_ROOT_DIRECTORY` and `SEED_FILENAME` (`calibrate.mjs:37-38`) with it; have `calibrate.mjs`
import them back. Do not write a second walker in `view.mjs` or `run.mjs`.

- `lib/segments.mjs` gains `export function readPackageSegments(packageRoot)`, with its existing
  doc comment carried over verbatim — it is the comment that records why a seed claiming nothing
  is kept rather than skipped, which is the finding §1.2 turns on.
- `calibrate.mjs` loses the function and the two constants and imports them. Its behaviour is
  unchanged, which `tests/sequences-slice/calibrate.test.mjs` already pins.
- The module's own header already states its subject ("The join is built in two steps: each
  package's RFC-SEED.md carries `source_segments`…", `lib/segments.mjs:4`), so the walker belongs
  there and no comment needs rewriting to justify the move.

### 3.3 Tier 2 — `run.mjs` supplies the workspace segmentation

At `run.mjs:97`, today:

```js
const view = buildPackageView({ artifact, treeManifest }, resolved.packageId);
```

Change to pass the already-computed root (`run.mjs:77`):

```js
const packageSegments = readPackageSegments(path.join(root, PACKAGE_ROOT_DIRECTORY));
const view = buildPackageView({ artifact, treeManifest, packageSegments }, resolved.packageId);
```

`PACKAGE_ROOT_DIRECTORY` moves to a shared constant or is imported; it must not be spelled twice.

**When the segmentation cannot be read, write nothing.** C003's precondition already fixes this
shape for absent inputs: no file, exit 0, the reason named. A workspace whose `crates/`
directory is missing or holds no seed is the same case, not a licence to print `0`. So:
`packageSegments.length === 0` → refuse with the reason named (`no package seed was readable
under <path>`), write neither view file, exit 0. A view file that exists therefore always
carries a measured statement — that is the invariant this repair buys.

### 3.4 Tier 3 — `lib/view.mjs`

- Signature becomes `buildPackageView({ artifact, treeManifest, packageSegments }, packageId)`.
- `packageSegments` is required. Do not default it to `[]` and do not keep the fabricated entry
  anywhere: a default is how this defect would return.
- The `lineRange` block and the sentence are rendered from
  `measureLineRangeJoin({ packageSegments, structureSegments, specLines: artifact.spec.lines })`
  — the same call `buildCalibrationReport` makes (`lib/report.mjs:94`), over the same input.
- `identityUse` becomes `LINE_RANGE_IDENTITY_USE`, imported from `lib/report.mjs`, instead of the
  literal `'not used as an identity'` currently written at `view.mjs:104`. One constant, one
  spelling, so the view and the report cannot drift apart in wording either.
- `renderPackageViewMarkdown` (`view.mjs:146`) is unchanged; it already interpolates
  `view.lineRange.statement`.

### 3.5 What Tier 3 must not do

- Do not delete the sentence to make the defect disappear. C003 requires it.
- Do not pass a package-local list into the workspace template. That is option B by the back
  door and it renders `1 of 33` where the truth is `3 of 33`.
- Do not catch a read failure and continue with an empty list. An empty list and an unread
  workspace must not be the same value.

---

## 4. Tests, written first and red before Tier 3

`tests/sequences-slice/view.test.mjs` already builds a synthetic workspace from
`fixtures/synthetic-workspace.mjs` and `fixtures/line-range-shape.mjs`
(`RECORDED_MANIFEST_SEGMENTS`, `SPEC_LINES`), and its header states the property it protects
("the partition is the property that matters"). Add, in that file:

- **T1 — the view and the calibration agree.** Build a synthetic `packageSegments` list; assert
  `buildPackageView(...).lineRange.statement === renderLineRangeStatement(measureLineRangeJoin({
  packageSegments, structureSegments, specLines }))` over the same list. This is the assertion
  the defect fails today: the view's statement is the calibration's, or the build is wrong.
- **T2 — the numbers are not the arithmetic of nothing.** For a synthetic list in which one
  package claims segments and one claims none, assert `claimedLineCount > 0`,
  `unclaimedLineCount < SPEC_LINES`, and that the `packages claim no segment at all` clause
  names the real count. T2 exists so T1 cannot pass by both sides being degenerate.
- **T3 — two packages that claim differently obey the same workspace.** Assert that
  `buildPackageView({...}, a).lineRange` equals `buildPackageView({...}, b).lineRange` **and**
  that T2's non-degeneracy holds. The first half alone is satisfied by the current defect, which
  is exactly why the second half is written.

`tests/sequences-slice/run.test.mjs` adds the refusal case:

- **T4 — an unreadable workspace writes nothing.** Run `run.mjs` against a fixture root whose
  `crates/` directory holds no `RFC-SEED.md`; assert exit 0, no `SEQUENCES.md` and no
  `SEQUENCES.json` written, and the reason on stdout naming the path that was searched.

`tests/sequences-slice/calibrate.test.mjs` needs no new assertion; if Tier 1 is done correctly
it stays green untouched, which is the evidence that the walker moved and did not change.

---

## 5. Install

```
make install-to-projects
```

Four copies, named by the Makefile: `~/shyme/zasso/.claude`, `~/shyme/zasso/crates/siprs/.claude`,
`~/shyme/gaia/.claude`, `~/shyme/conver/.claude`. No copy is edited by hand; a copy edited by
hand is a fifth source of truth.

---

## 6. Regenerating the views that already carry the false sentence

Two views exist today and both are wrong: `~/shyme/gaia/crates/foundation/gaia-foundation/` and
`~/shyme/gaia/crates/network/gaia-network/`. After install, regenerate each:

```
node ~/shyme/gaia/.claude/scripts/sequences-slice/run.mjs \
  ~/shyme/gaia/GaiaSekkeiShiyousho_v32-sequences.json \
  ~/shyme/gaia/crates/<path-to-package>
```

Regeneration is safe for both: the views are generated files, `guard-edit-surface.js` lists
`SEQUENCES.md` and `SEQUENCES.json` as frozen **inputs** (PX-256 C005), and no seed, manifest or
RFC is touched by a run. A consumer's `Status.json` records the two view paths as material; the
paths do not change, so no session is disturbed.

---

## 7. Acceptance

Run over `~/shyme/gaia/GaiaSekkeiShiyousho_v32-sequences.json`, whose `supplied.digest` is
`59b26af21c4fd326ed31cd40c384062749a49816e208d9d93b152261327ef2ef`:

1. For **every** package, `SEQUENCES.json`'s `lineRange.claimedLineCount` is `15969`, not `0`.
2. For every package, the sentence in `SEQUENCES.md` equals the sentence `calibrate.mjs` prints
   for the same artifact, digit for digit.
3. `run.mjs` for `gaia-foundation` and for `gaia-network` both report `written:
   ["SEQUENCES.md","SEQUENCES.json"]`.
4. The sequences-slice test suite is green, including T1–T4, which are red before Tier 3.

The numerals are a property of that artifact, not of the code: if the artifact is regenerated,
acceptance is "the view equals the calibration", recomputed, and not this paragraph's digits.

A hand check that costs one command:

```
grep -h "claims .* of the specification's lines" $(find ~/shyme -name SEQUENCES.md)
```

It must print one sentence per view, and each must be the calibration's.

---

## 8. What this plan does not fix

**The consumer's RFC text about this paragraph.**
`~/shyme/gaia/crates/network/gaia-network/RFC.md` Appendix F carries a subsection titled *The
claim this ledger does not rest on*, which states that the paragraph "is rendered from an empty
package list and is byte-identical for every package that has a view", and the package's
`CheckList.md` supplement repeats it. After this plan ships and §6 runs, that recorded claim is
**false**, and both files must be corrected — a gaia-side edit, downstream of this one, with its
own re-run of that package's gates. The same check is owed to `gaia-foundation` if a run there
recorded it.

**Anything else in `view.mjs`.** The line-range paragraph is the only fabricated input found. The
ownership join (`lib/ownership.mjs`) was re-derived by hand over the live workspace and agreed
with the view: 257 operations, 210 carrying result classes, reaching 13 packages, 16 owning
none. No other field of the view was checked against an independent computation, and this plan
claims nothing about them.

**Which packages are empty.** 13 of 29 packages own a unit and 16 do not, and the split is the
protocol-versus-infrastructure boundary. That is a property of the artifact and the manifests,
not a defect, and this plan does not touch it.

**The `identityUse` sentence itself.** "The line coordinate is not used as an identity, and this
is the measurement that says so" is a claim about method. This plan makes the measurement under
it true; whether the sentence is worth carrying in a per-package view is a design question for
PX-256's owner and is left where it is.
