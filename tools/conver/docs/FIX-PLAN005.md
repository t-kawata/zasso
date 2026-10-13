# FIX-PLAN005 — `sequences-ledger.js`: the obligation report cannot see the units it exists to report

**Status.** Implemented 2026-10-13 — see §8 for the delivered change and for the claims above
that the implementation corrected. Written 2026-10-13 from a run of `/grill-me-for-rfc` in
`~/shyme/gaia/crates/protocol/gaia-soul`, where the defect was found in a consumer. The repair
belongs here, because this repository is the development home of the rail and the consumer
holds an installed copy of it.

**The one line.** `main()` calls `renderStageReport` with a literal `units: []`, so the stage
report answers "no unit is distributed to this package" for every package, including the first
package the projection ever distributed a unit to.

**Scope.** `.claude/scripts/grill-me-for-rfc/sequences-ledger.js`,
`tests/grill-me-for-rfc/sequences-ledger.test.mjs`, and — only through
`make install-to-projects` — the four installed copies. Nothing outside
`~/shyme/zasso/tools/conver` is edited by this plan.

---

## 1. The defect, as measured

### 1.1 The report answers the one question it was invoked to answer, wrongly

`/grill-me-for-rfc` STEP 1 instructs the operator to ask what the registry obliges, and gives
this command:

```
node .claude/scripts/grill-me-for-rfc/sequences-ledger.js "$RFC_DIR" --stage=upstream
```

Run against `~/shyme/gaia/crates/protocol/gaia-soul`, whose `SEQUENCES.json` carries 17
`ownedOperationUnits`, 5 `ownedSequenceUnits` and 4 `crossBoundarySequenceUnits`, it prints:

```
# Distribution ledger at upstream

not proved: no unit is distributed to this package, so there is nothing to discharge
```

The package has 26 distributed units. The report is a function of nothing.

### 1.2 The same session's gate disagrees with the report, over the same files

`check-distribution-ledger.js`, run in the same directory, refuses for the opposite reason:

```
refused: this RFC carries no Distribution ledger
```

Exit 1. That gate reads `SEQUENCES.json` through `readUnitIds(unitsPath)` and bounds its rows
against the real unit set. The two commands read the same view and reach opposite conclusions
about whether there is anything to discharge; the gate is right and the report is not.

*Superseded 2026-10-13:* `gaia-soul`'s `RFC.md` has since gained its ledger. The gate now
answers `Distribution ledger is well formed: 26 row(s)`, exit 0, so the refusal quoted above
was measured before that ledger was written. §1.1's defect is the one that survived, and it
was reproduced live immediately before the repair. §8 records both.

### 1.3 Why it matters, and why it has not mattered until now

The report is the only thing that tells a run *which* units it is obliged to account for before
it writes an appendix for them. For every package the rail has been run over so far the
projection was empty — `gaia-foundation` and `gaia-network` both own no unit — so the false
answer coincided with the true one and cost nothing. `gaia-soul` is the first package where the
two diverge, and there the report would have the run write an empty ledger for a package with 26
units. `check-distribution-ledger.js` would then refuse it, which is the only reason the error
is visible at all.

---

## 2. Root cause

`sequences-ledger.js:107-115`:

```js
function main(argv = process.argv.slice(2)) {
  const stageArgument = argv.find((argument) => argument.startsWith('--stage='));
  const stage = stageArgument === undefined ? 'upstream' : stageArgument.slice('--stage='.length);

  if (!STAGES.includes(stage)) {
    process.stderr.write(`usage: sequences-ledger.js <project-dir> --stage=<${STAGES.join('|')}>\n`);
    return EXIT_FAILED;
  }
  // The units come from the package's own view; with none distributed there is nothing to
  // report and the verdict says so rather than reporting an empty run as a pass.
  process.stdout.write(renderStageReport({ stage, units: [] }));
  return EXIT_OK;
}
```

The comment states the rule — *the units come from the package's own view* — and the next line
contradicts it by passing a literal empty list. The comment is not a description of the code; it
is a description of the code that was intended.

**Everything the fix needs is already in the file and already exported.**

| Piece | Where | What it does |
|---|---|---|
| `materialPathsOf(record)` | `sequences-ledger.js:55` | reads `Status.json`'s material list the way `init.js` and `list-files.js` do |
| `obligationsFor(record)` | `sequences-ledger.js:67` | returns the obligation when a `SEQUENCES.md`/`SEQUENCES.json` is recorded — the *detection* half, and it is correct |
| `reportUnit(unit, layer)` | `sequences-ledger.js:88` | renders `proved`/`not proved: <unitId> at <layer>` from `{unitId, discharged}` |
| `renderStageReport({stage, units})` | `sequences-ledger.js:95` | renders the whole report; already handles the empty case by name |
| `MACHINE_VERDICTS` | `sequences-ledger.js:25` | the two-word vocabulary, frozen |

`main` never calls `materialPathsOf`, never calls `obligationsFor`, and never builds a unit. The
detection half was written, exported and left unwired — the module's public surface is tested by
nothing, which is why the gap survived.

### 2.1 There is no test

`grep -rl "sequences-ledger" .claude/` in `~/shyme/gaia` returns exactly three paths:
`.conver-install-state.json` (the install manifest), the script itself, and
`.claude/commands/grill-me-for-rfc.md` (the command text). No test file mentions it. The
`question-gate` package beside it has `settle.mjs` and its own tests; this file has none.

### 2.2 The two installed copies agree, so this is not drift

| Copy | mtime | line 114 |
|---|---|---|
| `~/shyme/conver/.claude/scripts/grill-me-for-rfc/sequences-ledger.js` | 2026-10-13 11:55 | `renderStageReport({ stage, units: [] })` |
| `~/shyme/gaia/.claude/scripts/grill-me-for-rfc/sequences-ledger.js` | 2026-10-13 11:21 | `renderStageReport({ stage, units: [] })` |

Both are 122 lines and carry the literal. The gaia copy being four minutes older is ordinary
install lag and not the cause; fixing only the home copy and reinstalling is what this plan
requires, and §5 says so.

---

## 3. The change

### 3.1 The decision this plan takes, and the one it refuses

Two repairs are available.

- **A (this plan).** Make the report read the view and the document, and report per unit what the
  stage can actually know. `/grill-me-for-rfc`'s obligation — "Ask what the registry obliges
  rather than testing whether the material is there" — is satisfied because the answer becomes a
  function of the material *and* of the RFC.
- **B (refused).** Delete the empty-case branch and print nothing when there are no units.
  Refused: the empty verdict is a *result* and the module says so in its own header ("an absent
  material therefore yields an empty loop, and the gate is a no-op"). The empty line is correct
  behaviour for a package with no units; it is wrong only for a package with units, and that is
  the case that must be repaired.

### 3.2 Tier 1 — read the units, from the view, the way the gate does

`check-distribution-ledger.js:44-58` already solves the reading half and should be copied rather
than reinvented, including its flag:

- accept `--units=<path>`, defaulting to `path.join(rfcDir, 'SEQUENCES.json')`, spelled exactly
  as `check-distribution-ledger.js` spells it (`UNITS_FLAG_PREFIX = '--units='`);
- read the three arrays in the view's own order — `ownedOperationUnits`, `ownedSequenceUnits`,
  `crossBoundarySequenceUnits` — and take each `unitId` as written. Do not rename, re-sort or
  de-duplicate: the ledger is checked against these ids, and an id the report invents is an id
  the appendix cannot carry;
- an unreadable or absent view yields an empty unit list, not an error. That is the module's
  existing contract (`exit 0 for every input`) and the empty case is already rendered by name.

If the same three-array read is wanted in both files, extract it into
`../sequences-slice/lib/material.mjs` beside `VIEW_JSON_NAME` and have both import it. Do not
write a second copy of the array names in this file while the gate keeps its own.

### 3.3 Tier 2 — decide `discharged`, per stage, from a record

`reportUnit` consumes `{unitId, discharged}`. The report is worthless if `discharged` is
computed from nothing a second time, so this is the design decision of the repair and it must be
made explicitly, not defaulted.

The recommended reading, which is checkable at every stage and uses only artifacts that exist:

- **`upstream`** — a unit is `discharged` when this package's `RFC.md` carries a row for it in
  its Distribution ledger. `readDistributionLedger(rfcText, unitIds)` from
  `../sequences-slice/lib/distribution-ledger.mjs` already returns `{ok, reason, rows}` and is
  already imported at the top of this file for `LEDGER_TITLE_SUFFIX`. A package with units and
  no ledger reports every unit `not proved` — which is the true statement, and is precisely the
  state `gaia-soul` was in when this defect was found.
- **the four later stages** — `conformance`, `implementation`, `ship`, `evolution` — each has its
  own discharge artifact and this plan does **not** invent one. Until a stage's artifact is
  named, that stage must report the same verdict as `upstream` and the header must say so, rather
  than printing `proved` for a check nobody ran. An invented `proved` is worse than a missing
  stage.

If the implementer finds that a later stage's artifact does exist and is readable, wiring it is in
scope; guessing one is not.

### 3.4 Tier 3 — `main` wires it, and the empty case stays

```js
function main(argv = process.argv.slice(2)) {
  // ... stage parsing and the STAGES check unchanged ...

  const statusRecord = readStatusRecord(rfcDir);        // Status.json, or {} when unreadable
  const obligations = obligationsFor(statusRecord);     // the detection half, finally called
  if (obligations.length === 0) {
    process.stdout.write(renderStageReport({ stage, units: [] }));
    return EXIT_OK;
  }

  const units = readUnitIds(unitsPath).map((unitId) => ({
    unitId,
    discharged: dischargedAt(stage, rfcDir, unitId),
  }));
  process.stdout.write(renderStageReport({ stage, units }));
  return EXIT_OK;
}
```

Two properties this shape keeps, both of which the module's header already claims and neither of
which the current code has:

1. **The gate stays a no-op for a package with no material.** `obligationsFor` returns `[]`, the
   empty verdict prints, and nothing about a package that was never handed the material changes.
2. **The verdict is a machine word, never a sentence.** `renderStageReport` and `reportUnit`
   already emit only `proved` and `not proved`; the repair must not introduce a third word.

### 3.5 What Tier 3 must not do

- Do not default `units` to `[]` anywhere. That default is the defect.
- Do not report `proved` for a unit because the view lists it. Being listed is the obligation,
  not its discharge; conflating them turns the report into a tautology.
- Do not branch on a material's file name to decide whether to run. The header refuses this
  explicitly ("a gate that read 'if sequences are present, then require something' would make the
  material a precondition of operation"). The obligation set is `obligationsFor`'s business and
  it already answers without a file-name branch in the gate.
- Do not print the RFC's ledger rows instead of the unit verdicts. The report is per unit, one
  line each; a row that exists and a unit that is discharged are different facts.

---

## 4. Tests, written first and red before Tier 3

Create `tests/grill-me-for-rfc/sequences-ledger.test.mjs`, following the layout of the tests
beside it. The module exports `registerObligation`, `obligationsFor`, `reportUnit`,
`renderStageReport` and `MACHINE_VERDICTS`, so every assertion below is reachable without a
filesystem except T4.

- **T1 — the units reach the report.** Given a status record whose `materialPaths` carry
  `SEQUENCES.json`, `obligationsFor` returns exactly one obligation; given one that carries none
  of the view names, it returns none. This pins the detection half, which is correct today and
  must stay correct.
- **T2 — an empty unit list still explains itself.** `renderStageReport({stage: 'upstream', units:
  []})` contains `MACHINE_VERDICTS[1]` and the phrase naming that no unit is distributed. This is
  the behaviour option B would have deleted.
- **T3 — a non-empty list is never rendered as the empty case.** For a synthetic list of three
  units, the report contains three lines, one per `unitId`, each beginning with a machine verdict,
  and does **not** contain the empty-case sentence. This is the assertion the defect fails today:
  today's code cannot produce a non-empty report for any input, so T3 fails before Tier 3 and
  passes after, and it fails for the right reason.
- **T4 — the report agrees with the gate over one directory.** Build a fixture package directory
  holding a `SEQUENCES.json` with one owned operation unit and an `RFC.md` with no Distribution
  ledger; assert the report says `not proved` for that unit and that
  `check-distribution-ledger.js` refuses the same directory. Two commands, one directory, one
  unit set: they must not disagree. Add the ledger to the fixture and assert both flip together.

T4 is the regression that matters. T1–T3 pin the parts; T4 pins the disagreement that §1.2
measured, and it is the only one of the four that would have caught this defect in the state it
was actually found in.

---

## 5. Install

```
make install-to-projects
```

Four copies, named by the Makefile: `~/shyme/zasso/.claude`, `~/shyme/zasso/crates/siprs/.claude`,
`~/shyme/gaia/.claude`, `~/shyme/conver/.claude`. No copy is edited by hand; a copy edited by
hand is a fifth source of truth.

After install, re-run the report against a package with units and confirm the verdict changes.
`~/shyme/gaia/crates/protocol/gaia-soul` is the only such package today:

```
node ~/shyme/gaia/.claude/scripts/grill-me-for-rfc/sequences-ledger.js \
  ~/shyme/gaia/crates/protocol/gaia-soul --stage=upstream
```

Before this plan: one line beginning `not proved:` and naming no unit. After: 26 lines, one per
unit id as `SEQUENCES.json` spells it.

---

## 6. Acceptance

1. The command in §1.1, over `gaia-soul`, prints one line per distributed unit — 26 of them — and
   none of them is the empty-case sentence.
2. The command over `~/shyme/gaia/crates/foundation/gaia-foundation` and over
   `~/shyme/gaia/crates/network/gaia-network` still prints the empty-case sentence, unchanged.
   A package with no units must read exactly as it did before this plan, which is the evidence
   that the detection half was wired and not replaced.
3. `make test` in this repository is green, including T1–T4, which are red before Tier 3.
4. For any package the rail has been run over, the report and `check-distribution-ledger.js`
   agree on whether that package has units. That agreement, not any digit, is what this plan
   buys.

---

## 7. What this plan does not fix

**The general shape of an unwired detection half.** `registerObligation` is exported and called
only by `obligationsFor`; `reportUnit` is exported and called only by `renderStageReport`. Both
are reachable from a test and neither had one. Whether `sequences-ledger.js` should be
restructured so an unwired half cannot compile is a question for the module's owner, and this
plan does not answer it — a test for the whole path is what it adds.

**The four later stages.** §3.3 recommends reporting `upstream`'s verdict for `conformance`,
`implementation`, `ship` and `evolution` until each one's discharge artifact is named. If those
artifacts exist and this plan did not find them, the implementer should wire them; if they do not
exist, the stages are a design question for the rail's owner and not a defect here.

**The consumer's record of this finding.** `~/shyme/gaia/crates/protocol/gaia-soul/RFC.md` was
written during the run that found this defect, and its prose records the false report as a
finding with this document as its disposition. That record is a gaia-side artifact; it is
corrected there if this plan's outcome differs from what it says, and this plan does not touch it.

**`FIX-PLAN004`'s aftermath.** That plan's §8 states that the consumer-side text about the
line-range paragraph must be corrected once its fix ships, and names
`~/shyme/gaia/crates/network/gaia-network/RFC.md` Appendix F and that package's `CheckList.md`.
The empty-package sentence is no longer byte-identical across views — `gaia-soul`'s regenerated
view carries `15969 claimed / 2 unclaimed` while `gaia-network`'s unchanged view carries
`0 / 15971` — so that recorded claim is now false. That correction is a gaia-side edit and is
outside this plan's scope; it is named here because a reader of this directory is the person most
likely to be holding both.

---

## 8. Outcome — what was delivered, and what the plan got wrong

Implemented and installed 2026-10-13. Delivered files:

| File | Change |
|---|---|
| `.claude/scripts/grill-me-for-rfc/sequences-ledger.js` | `main` reads the view and the ledger; the header states which artifact discharges a unit and what an unnamed stage reports |
| `.claude/scripts/grill-me-for-rfc/check-distribution-ledger.js` | reads the unit ids through the extracted function; behaviour unchanged (its seven tests still pass) |
| `.claude/scripts/sequences-slice/lib/material.mjs` | new export `collectUnitIds(view)` — the one reading of the three arrays |
| `tests/grill-me-for-rfc/sequences-ledger.test.mjs` | new — C001–C005, all five red before the wiring and green after |
| `tests/sequences-slice/material.test.mjs` | two tests for `collectUnitIds` |
| `docs/FIX-PLAN005.md` | this document |

`make install-to-projects` ran; its forward-rotation regression gate reported proved (25
fixtures, 0 pipeline disagreements, 0 command-file losses). The four copies carry the fix, and
`units: []` survives in exactly one place — the deliberate answer for a package whose obligation
set is empty, which is §3.4's own shape and not the defect.

### 8.1 §1.2's measurement is superseded

`gaia-soul`'s `RFC.md` gained a well-formed 26-row ledger during the same run that produced this
plan, so the gate no longer refuses it. §1.1's defect was unaffected: reproduced live before the
repair, and the report now prints 26 lines for that package.

### 8.2 §2 and §7 are wrong about there being no test

`tests/drill-rfc-down/unit-preservation.test.mjs:66-99` imports and asserts `obligationsFor` and
`DISTRIBUTION_OBLIGATION`, and `:84-98` reads shipped gate text to hold the no-material-name
rule. The detection half was covered. What no test reached was `main`, which is why the literal
`units: []` survived: the unwired half was not the one §7 names.

### 8.3 §4's T3 could not be red, and T1 is a duplicate

`renderStageReport` is exported and already rendered a non-empty list, so a unit-level assertion
over three synthetic units passed before the fix — verified by running it against the unmodified
module. Every delivered assertion therefore goes through the shipped entry point via
`spawnSync`, which is what makes the Red gate hold for all five. T1 as written repeated the
existing C001 assertions, so it was dropped; the newly exported `collectUnitIds` is pinned by two
tests beside `material.mjs` instead.

### 8.4 §3.4 could not be run as written

`readUnitIds` in the gate returns a Set, so the snippet's `.map` would have thrown;
`readStatusRecord` exists nowhere in the repository; `unitsPath`, `rfcDir` and `dischargedAt`
were undefined; and `main` never parsed the positional `<project-dir>` the usage line advertises.
Delivered instead: `findSequenceMaterial` (already exported, reads `<rfc-dir>/Status.json`
through the injected file system) supplies the record, `collectUnitIds` is the single reading of
the three arrays, and `main` parses `<project-dir>`, refusing with the usage line when it is
absent — the same refusal the sibling gate already made. §4's T4 also needed a `Status.json` in
its fixture: without one `obligationsFor` returns nothing and the report answers the empty case,
so T4 as written would have failed after the fix too. Delivered as C003 with the record written.

### 8.5 §3.3 contradicted itself, and the second principle won

§3.3 asks a later stage to "report the same verdict as `upstream`" and, in the same bullet, not
to print "`proved` for a check nobody ran". Those cannot both hold for a unit discharged
upstream. Resolved toward the stated principle: a stage whose artifact is not named reports
`not proved` for every unit (C004), and the header says so. Upstream is the only stage whose
artifact is read, and naming another stage's artifact is what would let it report more.

### 8.6 §6.4 was not what the design guarantees, and was not falsifiable

The gate reads the view unconditionally; the report reads it only when `Status.json` records the
material, because that record is what registers the obligation (acceptance 2 requires it). A
package holding units and no record therefore still reads as the empty case. Measured instead:
C003 flips the report and the gate together over one directory, and the live pair on `gaia-soul`
agrees (`well formed: 26 row(s)` from the gate; 26 verdict lines from the report).

Acceptance results: §6.1 proved live, 26 lines for `gaia-soul`, none of them the empty case;
§6.2 proved live, `gaia-foundation` and `gaia-network` own no unit and print the empty case at
exit 0; §6.3 proved over the affected files (38 tests across the four importing test files, with
`check-conventions`, the stub sweep and the malfeasance scan clean) rather than over the whole
aggregate; §6.4 replaced as above.

### 8.7 Two smaller corrections

§3.2's "do not de-duplicate" sits alongside its instruction to copy the gate's reader, which
returns a Set. `collectUnitIds` returns the ids in view order with repeats kept, and the gate
wraps it in a Set where membership is the only question it asks. §3.2's literal
`path.join(rfcDir, 'SEQUENCES.json')` is written as the already-imported `VIEW_JSON_NAME`,
because a hardcoded view name is the thing that test at
`tests/drill-rfc-down/unit-preservation.test.mjs:84-98` exists to prevent.
