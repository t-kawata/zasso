# Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

## 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.

- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.
- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.
- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.

## 2. Green — Implement Behavior (No Stubs, No Test Modification)

Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.

- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.
- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.
- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.
- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.

## 3. Refactor — Apply the Boy Scout Rule (Green State Only)

Refactor only after all tests are green. Refactoring in a red state is prohibited.

- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.
- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.

## Definition of Done

Implementation is considered incomplete unless all of the following are satisfied:

- The tests fully and precisely specify the intended behavior.
- The implementation passes all tests green, without exception.
- Correctness is empirically guaranteed by the tests (not a disguised green).
- No gap exists between test coverage and intended behavior.

Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.

# Target ticket is PX-215: The forward rotation's arguments are hidden inside the instrument, and the surviving surface is held by a guard

**Ticket Key**: PX-215 · **Phase**: -1

---

## Background

After PX-214 the reverse rotation derives everything it can from the working directory and the reserved root. The forward rotation still asks the running AI to choose where to put its decisions JSON, and nothing yet stops the argument surface from growing back.

### Goal
The decisions JSON that the tree and allocate rotations require is written to one derived path beneath the reserved root instead of a location the caller chooses; the two arguments that must survive are named together with the pattern each would break if hidden; and a guard asserts the whole family's remaining surface so it cannot grow back unnoticed.

### Purpose
The decisions file is the last place a run asks the AI to invent a fact. Every other path in the family is now derived — by PX-213 for the reverse entrance and by PX-214 for the reverse rotation — leaving this one free choice, made once at the gate and again at the finalize, with nothing tying the two to the same file. Naming it once removes the last free choice, and the guard is what keeps it removed.

### Motivation
A standard that is not asserted decays. This repository already holds two guards of exactly this shape: `design-citations.test.mjs` re-measures a document's `file:line` pointers by token, and `installed-copy-drift.test.mjs` refuses a copy that lags the source of record. Both exist because a document and a mechanism are two renderings of one fact, and nothing holds them together unless a test does. The argument surface is the same kind of fact, and after PX-214 it has no guard at all.

### Constraints
1. **`--spec` on `workspacify-tree gate` and `finalize` must survive.** It is the entire input of pattern 4, whose §1.1 row reads "Empty, plus a long specification document". An empty project holds nothing from which a specification path could be derived, so hiding it would leave that pattern with no entry at all.
2. **The positional manifest on every `workspacify-allocate` subcommand must survive.** §2.1 makes the workspace root a package (path `.`), §2.2 draws the fifth layer beside its four layers, and `workspacify-allocate/run.mjs:90` implements this as `workspaceRoot = dirname(manifestPath)`. A standard manifest path would place the generated workspace inside the reserve and break all four patterns at once.
3. **The decisions file is a staging artefact.** `workspacify-allocate.md` states the doctrine: "Intermediate artefacts (staging / scratch) are permitted only while running, and the script deletes them mechanically in the final step." The ticket must say which derived files are staging and which are records.
4. **The guard must derive the surface, not restate it.** A guard holding its own copy of the list would be a third rendering of the fact and would drift from the scripts exactly as the document would — the failure it exists to prevent.

## Scope

- **Scope of changes (describe each change comprehensively):**
- `.claude/scripts/workspacify-tree/lib/reserved-root.mjs` | modify | the reserved root introduced by PX-214 gains its document subdirectories as named constants (`tree`, `allocate`) with one join helper each, beside the existing reverse one | before: only the reverse subdirectory existed | after: three subdirectory names derived from one root, so no caller spells a path | api: three additions beside `RESERVED_ROOT_NAME` and `reservedReverseDirectory` | schema: none | config: none | dep: none
- `.claude/scripts/workspacify-tree/run.mjs` | modify | `--decisions` leaves `gate` and `finalize`; the file is read from the derived tree path, the missing-file and schema errors name that path, a `--decisions=<other>` token is refused by name, and the staging file is swept at the end of a successful finalize | before: `gate --spec=<path> --decisions=<path>`, the caller choosing the location | after: `gate --spec=<path>`, the location derived | api: the pipeline functions keep their `decisionsPath` parameter so the fixtures can still drive an arbitrary file | schema: none | config: none | dep: none
- `.claude/scripts/workspacify-allocate/run.mjs` | modify | `--decisions` leaves `gate`, `finalize` and `reverse`; the file is read from the derived allocate path, and a token naming another path is refused rather than ignored | before: `<manifest> --decisions=<path>` | after: `<manifest>` | api: the gate functions keep their `decisionsPath` parameter | schema: none | config: none | dep: none
- `tests/workspacify-tree/integration/argument-surface.test.mjs` and `tests/workspacify-allocate/integration/argument-surface.test.mjs` | add | one guard per script entrance that reads `printUsage()` and asserts each declared option is either a named survivor carrying a recorded reason or absent, in both directions; the two guards follow the shape PX-213 established in `tests/workspacify-reverse/integration/argument-surface.test.mjs` | before: no test enumerated the family's surface, so a flag could be added without anything noticing | after: the surface is data the scripts own and a test reads | api: none | schema: none | config: none | dep: none
- `.claude/commands/workspacify-tree.md` and `.claude/commands/workspacify-allocate.md` | modify | the decisions paragraphs stop telling the operator to choose a location and name the derived one; the step invocations drop the flag; the two survivors are stated together with why each survives | before: "Create the decision JSON as one file outside the specification's directory (for example in `os.tmpdir()`)" | after: the derived path, with the survivors justified by the pattern each protects | api: none | schema: none | config: none | dep: none
- `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md` | modify | §5.7's table row is updated, and the criterion this pair of tickets applies — an argument is hidden unless hiding it breaks one of the four patterns — is recorded with the survivors and the pattern each protects | before: the document states the invocation but not the criterion | after: a reader can derive the surface from the criterion | api: none | schema: none | config: none | dep: none
- `.claude/` and `crates/siprs/.claude/` installed copies | modify | re-synced through `node tools/conver/install.js -t <target> --no-install-deps`, with `run.mjs` hand-copied where the installer does not manage the path | before: the copies still document a chosen decisions location | after: byte-identical to the source of record | api: none | schema: none | config: the install state is rewritten by the installer | dep: none
- **Out of scope (items intentionally excluded, with justification):**
- Hiding `--spec` on `workspacify-tree gate` and `finalize` | It is the whole input of pattern 4. §1.1's fourth row is "Empty, plus a long specification document"; an empty project holds nothing from which a path could be derived, so hiding it would break that pattern rather than tidy it.
- Hiding the positional manifest on `workspacify-allocate` | §2.1 and §2.2 make the manifest's directory the workspace root and `workspacify-allocate/run.mjs:90` implements it as `workspaceRoot = dirname(manifestPath)`. A standard manifest path would create the generated workspace inside the reserve and break all four patterns.
- Reworking the reverse rotation or the reserved root itself | PX-214 owns both. This ticket consumes the reserve and adds the forward rotation's document subdirectories to it.
- Refreshing the committed `tests/workspacify-reverse/analysis/` | Seven test files read it as a fixture and `design-measurements.test.mjs` asserts its entry count against the design document; refreshing it is a separate decision with its own blast radius.
- A published table of the whole family's surface | A plausible later ticket once both halves land. This ticket asserts the surface; publishing it for the operator is a different deliverable.
- **Affected areas (components/systems impacted, even without direct modification):**
- `tests/workspacify-tree` (46 files) and `tests/workspacify-allocate` (38 files) | API surface | Y — every call site that passed `--decisions` is re-pointed at the derived path, and the fixtures that must drive an arbitrary decisions file call the pipeline functions directly rather than the CLI.
- `.claude/` and `crates/siprs/.claude/` installed copies | API surface | Y — re-synced through the sanctioned installer, then hand-copied where the installer does not manage the path, the follow-up P25-7 performed for the same reason.
- `workspacify-tree/lib/atomic-publish.mjs` | none | N — both rotations publish through the same write-temp-fsync-rename-readback discipline, and this ticket changes what is read, not how anything is written.
- `tests/conventions/design-citations.test.mjs` | none | Y — the design document's anchored `file:line` citations are re-measured after the annotations, because the guard fails by token and reports a moved definition rather than a wrong number.

## Implementation Target Files

- `.claude/scripts/workspacify-tree/run.mjs`
- `.claude/scripts/workspacify-allocate/run.mjs`
- `.claude/commands/workspacify-tree.md`
- `.claude/commands/workspacify-allocate.md`
- `.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs`

## Investigation

- `workspacify-tree.md:118` and `workspacify-allocate.md:194` both instruct the operator to "Create the decision JSON as one file outside the specification's directory (for example in `os.tmpdir()`)" — a free choice, made once per gate and again per finalize, with nothing tying the two invocations to the same file. This is the last path in the family that the running AI must invent.
- `workspacify-tree.md:184` and `:211` and `workspacify-allocate.md:201` and `:213` show the invocations carrying `--decisions=<decision.json>`, and `workspacify-allocate.md:286,289` the worked examples using `/tmp/decisions.json`.
- `workspacify-allocate.md:43` states the residue doctrine verbatim: "Intermediate artefacts (staging / scratch) are permitted only while running, and the script deletes them mechanically in the final step. The residue is only the three published kinds plus pre-existing files."
- `workspacify-tree/run.mjs:237-243` is the forward finalize: destination `process.cwd()`, no option, with a comment saying so. `:974-986` is `printUsage()`, the single declaration of the tree surface, which is therefore the thing a guard can read.
- `workspacify-allocate/run.mjs:90` is `const manifestDir = path.dirname(absPath)`; `:385`, `:492`, `:504` and `:507` all pass `workspaceRoot: manifestDir`. This is the binding that makes hiding the manifest argument impossible without moving the generated workspace.
- `workspacify-allocate/lib/seed-model.mjs:75` exports `ALLOCATE_MANIFEST_FILE_NAME`; `workspacify-tree/lib/atomic-publish.mjs` is the write-temp-fsync-rename-readback discipline both rotations publish through, and it is neither changed nor bypassed by this ticket.
- `tests/workspacify-tree/unit/cli-negative-paths.test.mjs:19` defines `runCli(args, cwd = process.cwd())` and `:79,105,129` read `join(dir, 'WORKSPACIFY-TREE-MANIFEST.json')`; `tests/workspacify-tree/integration/full-pipeline.test.mjs:46,57` do the same. Those reads are unaffected, because the manifest's location is unchanged by this ticket.
- `tests/workspacify-allocate/helpers/build-valid-manifest.mjs:193,290` build the stage-1 manifest at `join(dir, 'WORKSPACIFY-TREE-MANIFEST.json')` and the fixture's decisions path is passed explicitly — the call sites this ticket re-points.
- `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md` §1.1 row 4 reads "Empty, plus a long specification document | `workspacify-tree` → `workspacify-allocate` → … — no reverse rotation | The ordinary forward rotation. Nothing is reconstructed because there is nothing to reconstruct." The specification is the only input that pattern has, which is why `--spec` survives.
- `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md` §2.1-§2.2 and `workspacify-reverse/lib/terminal-state.mjs:75-105` (`TERMINAL_ARTEFACTS.fifthLayer`) agree that the fifth layer sits at the workspace root beside the ROOT package's four layers, and that the workspace root is itself a package. This is why the manifest argument survives.
- `tests/workspacify-reverse/integration/argument-surface.test.mjs` (PX-213) is the precedent for a guard that reads a script's declared surface and compares it with the document in both directions; `assertCommandFileStructure` is the convention it follows for what counts as a documented option.
- `tests/conventions/design-citations.test.mjs` and `tests/conventions/installed-copy-drift.test.mjs` are the two existing guards of this shape in the repository — a document held to its mechanism by a test that fails by token, and a copy held to its source by digest.

## Acceptance Criteria

- **[Happy path]** In a directory holding only a specification, the tree gate and finalize complete with no decisions argument; the allocate validate, plan, gate and finalize complete with no decisions argument; and the resulting workspace holds the fifth layer at its root and one `RFC-SEED.md` per package.
- **[Error case]** A run with no decisions file reports the derived path it looked for, naming the file rather than an empty argument; and a run that passes `--decisions=<other>` is refused by name with nothing published and the derived file never opened.
- **[Edge case]** A guard run against a script whose `printUsage()` gained or lost an option fails, proving the guard reads the scripts rather than a restatement of them; and a survivor whose recorded reason no longer names a pattern fails as well.

## Invariants

- [Normal condition] The decisions JSON is read from one derived path for both rotations, and a gate/finalize pair that names no decisions argument completes and publishes.
- [Error invariant] A missing or schema-invalid decisions file is reported by its derived path, never by an empty argument name; nothing is published, and no partial tree or manifest is left behind.
- [Internal state invariant] The derived decisions path is one binding, so the gate and the finalize in a single run cannot read different files and the semantics approved are the semantics applied.
- [Boundary invariant] The survivors are exactly two — the tree's `--spec` and allocate's positional manifest — and each carries a recorded reason naming the pattern it would break. A survivor without a reason, or a hidden argument the document still offers, fails the guard in the same file.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — workspacify-tree/run.mjs::runFinalize -> holdout-ledger.mjs::reservedTreeDecisionsPath

- **Precondition**: The decisions JSON is read from one derived path beneath the reserved root, for the tree rotation and the allocate rotation alike. The path is a function of the working directory and the reserved root alone; no environment variable, no argument and no pre-existing file can move it. A `--decisions=<other>` token is refused by name rather than ignored.
- **Postcondition**: `gate` and `finalize` complete with no decisions argument when the file at the derived path is present and valid, and report that path by name when it is missing or schema-invalid. A run that succeeds sweeps the staging file where the doctrine calls it staging and leaves the residue holding only published artefacts.
- **Invariant**: The gate and the finalize within one run resolve to the same string, so the semantics the gate approved are the semantics the finalize applies: a run cannot pass one file and publish from another.

### C002 — workspacify-tree/run.mjs::prepareForwardPipeline -> lib/normalization.mjs

- **Precondition**: `workspacify-tree finalize --spec=<path>` and `gate --spec=<path>` keep their one argument. The specification is the entire input of pattern 4 (§1.1: "Empty, plus a long specification document"), and an empty project holds nothing from which a path could be derived.
- **Postcondition**: The manifest assembled after this ticket is identical to the manifest assembled before it for the same specification and the same authored decisions: the same normalised bytes, the same `input.source_hash`, the same self-hash.
- **Invariant**: The specification is read from the path given, normalised by the same function, and never rewritten: the command reads its input and the input is unchanged afterwards, byte for byte.

### C003 — workspacify-allocate/run.mjs::runFinalize -> lib/tree-manifest-input.mjs::readManifestSource

- **Precondition**: Every `workspacify-allocate` subcommand keeps its positional manifest argument. §2.1 makes the workspace root a package (path `.`), §2.2 draws the fifth layer beside its four layers, and `workspacify-allocate/run.mjs:90` implements this as `workspaceRoot = dirname(manifestPath)`.
- **Postcondition**: The tree, the seeds and the allocate manifest are published into `dirname(manifestPath)`, exactly as before; the stage-1 manifest is still read from that directory and the co-located specification still re-hashes to `input.source_hash`.
- **Invariant**: The fifth layer stays at the workspace root: after a full rotation, `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json` and `ARCHITECTURE-DELTA.json` are found there and never beneath the reserved root. Hiding the manifest would create the generated workspace inside the reserve.

### C004 — tests/*/integration/argument-surface.test.mjs -> workspacify-tree/run.mjs::printUsage

- **Precondition**: Each entrance declares its surface in one place — `printUsage()` for the two script entrances — and the guard reads that declaration rather than restating it, following `tests/workspacify-reverse/integration/argument-surface.test.mjs` from PX-213.
- **Postcondition**: The guard fails in both directions: an option deleted from the script while the guard still expects it fails, and an option added to the script while the guard does not know it fails. The declared surface is therefore data the script owns.
- **Invariant**: There is exactly one declaration of the surface per command. A guard that restates the list would be a third copy of the fact and would drift from the scripts it is meant to hold, which is the failure it exists to prevent.

### C005 — docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md §5.7 -> lib/entry-parity.mjs

- **Precondition**: Every argument that survives this ticket carries a recorded reason naming the pattern it would break if hidden. The survivors are `--spec` on the tree `gate`/`finalize` and the positional manifest on every allocate subcommand.
- **Postcondition**: The design document states the criterion this ticket applies — an argument is hidden unless hiding it breaks one of the four patterns — and names for each survivor the pattern and the fact that breaks. A reader can derive the surface from the criterion rather than memorise it.
- **Invariant**: A survivor without a reason fails the guard, and a hidden argument that the document still declares as available fails the both-directions assertion in the same file. The document and the scripts remain two renderings of one surface, held to each other by one test.

## Boy Scout Rule

- `workspacify-tree/run.mjs` and `workspacify-allocate/run.mjs`: `printUsage()` becomes the single declaration that the operator, the guard and the command file all derive from, so the surface has one home rather than three renderings.
- `holdout-ledger.mjs`: the derived paths are built by named functions (`reservedTreeDecisionsPath`, `reservedAllocateDecisionsPath`) beside `reservedReverseDirectory`, so a call site reads as "the tree decisions" rather than as a join of three strings — the translatability fix for the function this ticket extends.
- The two command files: the decisions paragraph is replaced by a statement of where the file goes and why the operator no longer chooses, and the survivors are stated with the pattern each protects rather than as a bare list of accepted flags.
- Every comment and table row touched that described the decisions file as operator-placed is rewritten to the derived location, and no comment claims a flag the entrance no longer honours.

## Test Plan

### Unit Tests

- UT: [Normal] `run.mjs gate --spec=<spec>` with no decisions argument exits 0 when the file at the derived path is present and valid, and `finalize --spec=<spec>` with no decisions argument then publishes the manifest to the working directory.
- UT: [Normal] `workspacify-allocate/run.mjs finalize <manifest>` with no decisions argument reads the decisions from the derived allocate path and publishes the tree, the seeds and the allocate manifest.
- UT: [Error] A missing decisions file is reported with its derived path in the message; a schema-invalid file is reported with the derived path and the failing field; in both cases nothing is published and no partial tree is left.
- UT: [Boundary] A `--decisions=<other>` token is refused by name with the whole token reported and nothing published, so a caller who learned the old surface is told rather than silently read from the derived path. The derived file is never opened in that run.
- UT: [Invariant] The derived decisions path is one binding: the gate and the finalize within one run resolve to the same string, asserted by comparing what each reports on failure rather than by reading the constant.
- UT: [Invariant] The declared surface of every workspacify entrance, read from its `printUsage()`, contains no option other than the recorded survivors, and each survivor carries a reason naming the pattern it would break.
- UT: [C001 precondition] The derived decisions path is a function of the working directory and the reserved root alone: no environment variable, no argument and no pre-existing file can move it.
- UT: [C001 postcondition] After a successful finalize the staging decisions file is swept where the doctrine calls it staging, and the residue holds only published artefacts; a file the doctrine calls a record is kept and named.
- UT: [C002 invariant] `workspacify-tree finalize --spec=<path>` reaches the same manifest as before this ticket: the specification is read from the same path, normalised the same way, and hashed to the same `input.source_hash`.
- UT: [C003 invariant] `workspacify-allocate` still publishes into `dirname(manifestPath)`, and `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json` and `ARCHITECTURE-DELTA.json` are still found at the workspace root after a full rotation.
- UT: [C004 invariant] The guard derives the surface rather than restating it: deleting an option from `printUsage()` while leaving the guard's data unchanged makes the guard fail, and adding one makes it fail too.
- UT: [C005 invariant] Every surviving option carries a reason string that names one of the four patterns by its §1.1 row, and a survivor without such a reason fails the guard.

### Integration Tests

- IT: [Integration point] `workspacify-tree finalize` → `workspacify-allocate validate|plan|gate|finalize`, driven from the CLI with the specification and the manifest as the only inputs. The derived decisions path is the only channel carrying the authored semantics.
- IT: [Verification] A full forward rotation over a synthetic specification completes from a directory that holds only the spec; a second run whose derived decisions file is stale is refused rather than silently reused, and the refusal names the file.
- IT: [Prerequisites] A specification fixture with ATX headings (`tests/workspacify-tree/fixtures/objects-table.md`), a decisions fixture that reaches COMPLETE (`tests/workspacify-tree/fixtures/decisions-complete.json`), and a synthetic root; `createSyntheticTree` for the allocate half.
- IT: [Related tickets] PX-214 (the reverse rotation's half and the reserved root this builds on), PX-213 (the entrance takes no arguments; the withdrawal rule), P25-7 (the same rule first applied), P22-11 (the tree gates).

### Exceptions

- Exception entry:
  - [Item] The full forward rotation over the representative specification, every gate, end to end
  - [Reason] It is impossible to test this within a per-step instrument: the run is minutes long, so making it a step gate would make every step cost minutes. That is a cost boundary and not an architectural defect, and not a design defect either: the same gate pipeline runs over a small specification in this ticket integration test, tests/workspacify-tree/integration/full-pipeline.test.mjs already asserts the loop, and the long run differs from it in size rather than in kind. The exemption is the run cost, not an untestable behaviour.
  - [Alternative verification] The synthetic forward rotation asserts the derivation end to end; the existing full-pipeline test remains the instrument for the real specification, run at the limited timing the project reserves for it.

### Plan Test Code (concrete code)

- UT: [C001 precondition] the decisions path is derived from the working directory and the reserved root, and cannot be moved
```js
assert.equal(reservedTreeDecisionsPath('/a/b'), join('/a/b', RESERVED_ROOT_NAME, RESERVED_TREE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME));
process.env.WSP_DECISIONS = '/elsewhere/decisions.json';
assert.equal(reservedTreeDecisionsPath('/a/b'), join('/a/b', RESERVED_ROOT_NAME, RESERVED_TREE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME), 'an environment variable cannot move it');
const run = runChain(TREE_RUNNER, ["gate", `--spec=${specPath}`], { cwd: subject.root });
assert.equal(run.status, 1, 'the derived file is not there yet');
assert.match(`${run.stdout}${run.stderr}`, new RegExp(reservedTreeDecisionsPath(subject.root).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the refusal names the derived path');
```
- UT: [C001 postcondition] a gate and a finalize complete with no decisions argument, and the staging file is swept
```js
const subject = createSyntheticTree({ 'src/mod.rs': 'pub fn call() {}\n' });
try {
  writeDecisionsAt(reservedTreeDecisionsPath(subject.root), completeDecisions());
  const gate = runChain(TREE_RUNNER, ['gate', `--spec=${specPath}`], { cwd: subject.root });
  assert.equal(gate.status, 0, gate.stderr);
  const finalize = runChain(TREE_RUNNER, ['finalize', `--spec=${specPath}`], { cwd: subject.root });
  assert.equal(finalize.status, 0, finalize.stderr);
  assert.equal(existsSync(join(subject.root, 'WORKSPACIFY-TREE-MANIFEST.json')), true, 'the manifest is published at the workspace root');
  assert.equal(existsSync(reservedTreeDecisionsPath(subject.root)), false, 'the staging decisions file is swept');
} finally { subject.dispose(); }
```
- UT: [C001 invariant] a refusal names the refused token, and the derived file is never opened in that run
```js
writeDecisionsAt(reservedTreeDecisionsPath(subject.root), completeDecisions());
const refused = runChain(TREE_RUNNER, ['gate', `--spec=${specPath}`, '--decisions=/tmp/other.json'], { cwd: subject.root });
assert.equal(refused.status, 1, 'an option the entrance once honoured is refused rather than ignored');
assert.match(`${refused.stdout}${refused.stderr}`, /--decisions=\/tmp\/other\.json/, 'the whole token is named');
assert.doesNotMatch(`${refused.stdout}${refused.stderr}`, /DECISIONS/, 'the derived file is not read on the way to the refusal');
```
- UT: [C002 invariant] the specification path is read from the argument and is byte-identical afterwards
```js
const before = readFileSync(specPath);
const run = runChain(TREE_RUNNER, ['gate', `--spec=${specPath}`], { cwd: subject.root });
assert.deepEqual(readFileSync(specPath), before, 'the command reads its input and never rewrites it');
const manifest = JSON.parse(readFileSync(join(subject.root, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
assert.equal(manifest.input.source_hash, sha256Hex(normalizeTextBytes(before).bytes), 'the recorded hash is the normalised input');
assert.equal(manifest.input.spec_path, basename(specPath), 'the specification is still recorded as the basename stage two resolves');
```
- UT: [C003 invariant] the fifth layer stays at the workspace root, and the reserve is not the workspace root
```js
const allocate = runChain(ALLOCATE_RUNNER, ['finalize', join(subject.root, 'WORKSPACIFY-TREE-MANIFEST.json')], { cwd: subject.root });
assert.equal(allocate.status, 0, allocate.stderr);
for (const name of ['WORKSPACIFY-TREE-MANIFEST.json', 'WORKSPACIFY-ALLOCATE-MANIFEST.json', 'ARCHITECTURE-DELTA.json']) {
  assert.equal(existsSync(join(subject.root, name)), true, `${name} belongs at the workspace root`);
  assert.equal(existsSync(join(reservedReverseDirectory(subject.root), name)), false, `${name} is not published beneath the reserve`);
}
assert.deepEqual(
  seedsUnder(subject.root),
  packagesOf(subject.root).map((pkg) => `${pkg}/RFC-SEED.md`).sort(),
  'one seed per package, placed in the package rather than in the reserve',
);
```
- UT: [C004 postcondition] the guard reads each script's declared surface rather than restating it
```js
const source = readFileSync(TREE_RUNNER, 'utf8');
const usage = /function printUsage\(\) \{\s*return \[([\s\S]*?)\]\.join\('\\n'\)/.exec(source);
assert.notEqual(usage, null, 'the entrance declares its surface in one block');
const declared = new Set([...usage[1].matchAll(/--[a-z-]+/g)].map(([name]) => name));
assert.equal(declared.has('--decisions'), false, 'the decisions argument left the command line');
assert.equal(declared.has('--spec'), true, 'the specification survives, and the guard says so from the script');
// The guard fails in both directions: a surface it does not know is reported.
assert.deepEqual(survivingArguments().filter((name) => !DECLARED_SURVIVORS.some((s) => s.name === name && s.pattern !== undefined)), [], 'every surviving argument carries the pattern it would break');
```
- UT: [C004 invariant] a survivor without a recorded pattern fails the guard
```js
const withoutReason = DECLARED_SURVIVORS.filter((entry) => entry.name !== '--spec');
assert.throws(
  () => assertSurvivorsAreJustified(withoutReason),
  /--spec: a surviving argument must name the pattern hiding it would break/,
  'an unjustified survivor is a failure, not a warning',
);
```
- UT: [C005 invariant] the document and the scripts are held to each other in both directions
```js
const section = implementationSection(readFileSync(join(PROJECT_ROOT, 'docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md'), 'utf8'));
assert.match(section, /an argument is hidden unless hiding it breaks one of the four patterns/, 'the criterion is stated');
for (const survivor of DECLARED_SURVIVORS) {
  assert.equal(section.includes(survivor.name), true, `${survivor.name} is named with the reason it survives`);
  assert.match(section, new RegExp(`${survivor.name}[^\\n]*pattern [1-4]`), `${survivor.name} names the pattern it protects`);
}
assert.equal(/--decisions=<path>/.test(section), false, 'an argument the scripts no longer declare is not offered by the document');
```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| reserved-root.mjs declared one subdirectory beneath the reserved root (`reverse`) and one join helper. | It declares three subdirectories (`reverse`, `tree`, `allocate`) and one join helper each, plus the single name both forward rotations stage their decisions document under. One root, three derived paths, no caller spelling a path. | The decisions document became a derived path for the tree and allocate rotations, so the reserve needed its two document subdirectories. Declared in the tree layer because the forward rotation must not depend on the reverse tree (tests/lib/layer-direction.mjs refuses that edge). |
| `workspacify-tree gate --spec=<path> --decisions=<path>` and `finalize --spec=<path> --decisions=<path>`; `reverse --decisions=<path>`. The caller chose where the decisions document lived, once per gate and again per finalize, with nothing tying the two to the same file. | `gate --spec=<path>`, `finalize --spec=<path>`, `reverse`. The document is read from `workspacify/tree/DECISIONS.json` beneath the subject; a `--decisions=<other>` token is refused by name with the whole token, before anything is read; the staging document and the directories that held nothing else are swept after a publish that succeeded. The missing-file and schema errors now name the derived path. | The gate and the finalize of one run resolve the same string, so the semantics approved are the semantics applied. Refusal is by name rather than lenient: a question dropped in silence reads exactly like one answered. |
| `workspacify-allocate gate|finalize <manifest> --decisions=<path>` and `reverse --decisions=<path>`; the usage line was an inline string in `main()`. | `gate|finalize <manifest>`, `reverse`. The document is read from `workspacify/allocate/DECISIONS.json` beneath the workspace root (`dirname(manifestPath)`), refused by name when a caller passes one, and swept after a successful publish. `printUsage()` is extracted as the single declaration of the surface, which the guard, the operator and the command file all read. | The positional manifest survives and is the only argument: §2.1 makes the workspace root a package of its own, §2.2 draws the fifth layer beside its four layers, and the rotation implements both as workspaceRoot = dirname(manifestPath). |
| `walkTree` in workspacify-allocate/lib/tree-staging.mjs walked every directory, so the reload verification reported the reserve holding the run's own staged decisions document as an unexpected directory. | It does not descend into the reserved root, matching the exclusion the reverse measurement already applies. Measured: a reserve holding the staged document no longer trips the forward gates, and the residue after a successful finalize is the published set plus the pre-existing files. | This was the plan's open question — whether a reserve trips the forward population — and it was measured rather than assumed. `fresh-workspace only` (G2.4) judges the planned directories only, so it was never at risk; the reload directory scan was. |
| workspacify-reverse/lib/regression-gate.mjs spawned the frozen forward pipelines with `--decisions=<fixture>`. | It stages each fixture at the name the rotation derives, inside the run's own copy, and passes no decisions argument. `node .claude/scripts/workspacify-reverse/run.mjs regression check` reports proved, 0 pipeline runs disagreed. | The frozen baseline is reproduced rather than re-captured: the same 25 fixtures, the same normalised manifest digests. |
| No test enumerated the family's argument surface, so a flag could be added without anything noticing. | tests/workspacify-tree/integration/argument-surface.test.mjs (13 tests) and tests/workspacify-allocate/integration/argument-surface.test.mjs (10 tests) read `printUsage()` and fail in both directions: an option added to the script alone, and an option deleted from the script alone. The survivors are recorded with the §1.1 pattern each protects, and a survivor that cannot name its pattern fails. | The surface is data the script owns. A guard holding its own copy would be a third rendering of the fact and would drift exactly as a document would. |
| 33 test files drove the two rotations through the CLI with `--decisions=<path>`. | Every call site places the document where the rotation derives it, through tests/workspacify-tree/helpers/stage-tree-decisions.mjs and tests/workspacify-allocate/helpers/stage-allocate-decisions.mjs, and passes the manifest or the specification alone. A run that publishes sweeps the document, so a test with two runs stages it twice — which is what an operator does. | Re-pointed, never weakened: no assertion was removed and no expectation was relaxed. Two expectations were strengthened, both about residue: the cross-stage pipeline now asserts the reserve is gone, and the copy fixtures exclude the reserve from their fingerprints. |
| The two command files told the operator to create the decisions JSON outside the specification's directory (for example in `os.tmpdir()`), and the design document stated the invocation without the criterion behind it. | Both command files state the derived location, say why the operator no longer chooses, and name the pattern each surviving argument protects. The design document gains §9, which states the criterion — an argument is hidden unless hiding it breaks one of the four patterns — and names both survivors with the pattern each protects, and §5.7 gains the row that records it. Both installed copies were re-synced and are byte-identical to the source of record across all 477 workspacify files. | A reader derives the surface from the criterion rather than memorising a table. |

## Notes in Prior Implementation Rounds

- [Implementation steps] (1) Add the `tree` and `allocate` document subdirectories and their join helpers to the reserved root in `holdout-ledger.mjs`, beside the reverse one PX-214 introduced. (2) Drop `--decisions` from the tree `gate` and `finalize` and from the allocate `gate`, `finalize` and `reverse`, deriving each path from the reserve and refusing an explicit token by name. (3) Sweep the staging file at the end of a successful finalize, following the doctrine `workspacify-allocate.md` already states. (4) Add the two guards. (5) Rewrite the two command files and the design document. (6) Re-sync both copies. (7) Re-measure the design citations after the annotations.
- [Risks] The largest is that the guard becomes a third copy of the surface and drifts from the scripts — the exact failure mode the ticket exists to prevent. It must read `printUsage()` or an equivalent single declaration, and the guard for the guard is that adding or deleting an option in the script alone must break it. The second risk is the sweep: deleting a file the operator may have wanted. The family's doctrine already deletes staging artefacts mechanically, but the ticket must state which derived files are staging and which are records, or the sweep becomes a silent loss.
- [Caveats] Refusing `--decisions=<other>` by name is deliberate rather than lenient: an option the entrance once honoured and no longer does is refused by name, because a question silently dropped reads as a question answered. A caller who learned the old surface must be told, not quietly read from the derived file.
- [Open items] Whether the allocate decisions should also be swept, given `workspacify-allocate.md` already promises mechanical deletion of intermediate artefacts — and whether the tree decisions should be kept as the record of what was decided, since a decision is evidence in a way a scratch file is not.
- [Future improvements] Once both halves land, the family's entire command surface is "the working directory plus the genuine inputs", and a later ticket could publish one derived table of it for the operator. A second candidate is extending the guard to the reverse entrance's own subcommands, which PX-214 empties.
- [Plan decision, 2026-09-16] The derived paths are declared in `workspacify-tree/lib/reserved-root.mjs`, not in `workspacify-reverse/lib/holdout-ledger.mjs` as the spec's scope first said. PX-214's own implementation moved the declaration there: the forward rotation must not depend on the reverse tree, and `tests/lib/layer-direction.mjs` computes that edge from the sources on every run and refuses it. The guard caught the first version of PX-214 for exactly this, and the repair was a move rather than a permission, following the module's own P22-10 precedent. PX-215 adds `tree` and `allocate` beside `reverse` in that one module, and the reverse tree keeps re-exporting them.
- [Plan decision, 2026-09-16] PX-215 must verify that a reserve holding `workspacify/tree/DECISIONS.json` does not trip the FORWARD rotation's gates. The reverse rotation's A1 population already needed the reserved root excluded (found while implementing PX-214: without it, `the tree holds path(s) no package claims: workspacify` blocked every reverse run over an analysed subject). The forward rotation has a different population — `fresh-workspace only` and allocate's G2 existing-output policy — and whether a reserve is an "existing output" there is measured by this ticket rather than assumed.
- [Plan decision, 2026-09-16] PX-214's document half is unfinished: `workspacify-tree.md` and `workspacify-allocate.md` still show the flags PX-214 withdrew (`--root`, `--graph`, `--measured`, `--sidecars`, `--delta`, `--out`, `--prior-partition`). PX-215 rewrites the decisions paragraphs in those same two files, so it carries that repair rather than leaving the tree in a state where the document and the instrument disagree.
- [Dependency] PX-215 consumes the reserve PX-214 introduced. PX-214 is implemented and its three suites are green (tree 335, allocate 261, reverse 1370 pass / 0 fail), but PX-214 itself has not passed its own remaining gates and is still `planned`. PX-215's plan is sound over that implementation; the two must not be started concurrently, because both rewrite `printUsage()` in the same two scripts.
Implementation summary:

## Changed files
- `.claude/scripts/workspacify-tree/lib/reserved-root.mjs` (new subdirectories, the decisions document name, two join helpers)
- `.claude/scripts/workspacify-tree/lib/staging-decisions.mjs` (new: the sweep both rotations share)
- `.claude/scripts/workspacify-tree/run.mjs`, `.claude/scripts/workspacify-allocate/run.mjs` (the decisions argument leaves; the derived path; the refusal; the sweep; `printUsage()` for allocate)
- `.claude/scripts/workspacify-allocate/lib/tree-staging.mjs` (`walkTree` no longer descends into the reserve)
- `.claude/scripts/workspacify-reverse/lib/regression-gate.mjs`, `lib/holdout-ledger.mjs` (staged fixtures; the new names re-exported)
- `tests/workspacify-tree/integration/argument-surface.test.mjs`, `tests/workspacify-allocate/integration/argument-surface.test.mjs` (new guards, 23 tests)
- two new test helpers, 33 re-pointed test files
- `.claude/commands/workspacify-tree.md`, `.claude/commands/workspacify-allocate.md`, `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md`
- both installed copies re-synced

## Test results
- `tests/workspacify-tree`: 350 pass / 0 fail
- `tests/workspacify-allocate`: 272 pass / 0 fail
- `tests/workspacify-reverse`: 1370 pass / 0 fail / 2 skipped
- `tests/conventions`: 52 pass / 2 fail (pre-existing, unrelated — see below)
- `verify-red-coverage --ticket-key=PX-215`: ok, 5/5 contracts covered
- `validate-ticket-targets`: {"ok":true,"verifiedEmpty":true}
- `scan-crimes.sh`: 0 records; `find-all-stubs.js`: no `[::STUB::]` marker in any touched file
- `run-quality-checks.js` over every changed JS/MJS file: 0 issues
- `regression check` (forward-rotation gate): proved, 0 pipeline runs disagreed, 0 command-file losses
- installed-copy drift: 0, and a whole-set comparison shows 0 missing / 0 extra / 0 differing across 477 files per copy

## Pre-existing failures, evidenced rather than assumed
The two `tests/conventions/derived-artefacts.test.mjs` failures are not caused by this ticket. Commit `8c289f45` (2026-09-15, P25) deleted the files under `tools/conver/tmp/`, and the directory does not exist, so the frozen `prefixDigest` cannot be reproduced. PX-215 touches neither that path nor its measurement. The test itself says the constant is resolved by re-measuring and recording rather than by adjusting it, and the re-recording belongs to the ticket that removed the files. The constant was not changed.

## Decisions taken, and their grounds
1. **The survivor table records every declared argument, not only the two survivors.** `packet --package=<id>` is declared by the allocate entrance and is neither withdrawn nor a survivor. It carries a recorded reason and no pattern, and the guard fails if the entrance declares an argument the table does not hold — which is the "cannot grow back unnoticed" property. Grounds: withdrawing `--package` would change a behaviour three existing tests assert (`runmjs-handlers.test.mjs:60,64,65`, `cli-negative-paths.test.mjs:43`), and modifying another ticket's tests is forbidden. The plan's sketch required every declared argument to carry a pattern; following it would have meant either withdrawing `--package` or weakening the guard, so the table was widened and the reason recorded instead.
2. **Schemas of the two rotations stay separate.** `workspacify/tree/DECISIONS.json` and `workspacify/allocate/DECISIONS.json` are one name under two subdirectories rather than one shared file, because the two decisions schemas are not one schema.
3. **The sweep runs on the publish path only.** A refused run leaves the author's document where they can repair it; a successful one removes it and the directories that held nothing else, which is the residue rule `workspacify-allocate.md` already states. The reverse subcommands sweep on the same terms.
4. **The spec re-export went to the ticket's own `specPath` under `tickets/specs/`, not to `specs/PX-215.md`.** The project moved spec output to the Tickets.json-relative path; `specs/PX-215.md` would be a second rendering of one fact.

## Risks and open items
- The annotation pass attributes the whole uncommitted tree. Eleven files that only PX-214 changed were backed up before the PX-215 pass and restored afterwards, so no false PX-215 provenance survives; the two installed copies were re-synced from the source of record afterwards, and the installer preserved two files whose digests no longer matched, which were hand-copied (the same repair PX-214 recorded).
- The reverse subcommands now sweep the staged decisions too. That is one step beyond the scope's letter, which names `finalize`; it is recorded here because leaving a staging file beside a manifest that already carries the decisions contradicts the residue rule the same command file states.
- `--package` on `packet` remains a free choice by the ticket's own criterion (hiding it would print every package's packet rather than break a pattern). A later ticket could withdraw it if the authoring step no longer needs the selector.
- Whether the allocate decisions should be swept at all was the plan's open item; this ticket answers it the same way for both rotations and records the answer here.

## PX-215 — implemented at 90 locations

### .claude/scripts/workspacify-allocate/lib/tree-staging.mjs

- Line 202
```
function walkTree(absRoot) {
```

### .claude/scripts/workspacify-allocate/run.mjs

- Line 562
```
function refuseDecisionsArgument(args) {
```

- Line 575
```
function withdrawnReverseOptionsUsed(args) {
```

- Line 585
```
function refuseWithdrawnReverseOptions(drawn) {
```

- Line 602
```
function refuseReversePositionalArguments(positionals) {
```

- Line 795
```
function printUsage() {
```

- Line 819
```
function main() {
```

### .claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs

- Line 45
```
import {
```

### .claude/scripts/workspacify-reverse/lib/regression-gate.mjs

- Line 170
```
function stageDecisions(stagingDirectory, sourcePath) {
```

- Line 176
```
function sortKeys(record) {
```

### .claude/scripts/workspacify-tree/lib/reserved-root.mjs

- Line 92
```
export function reservedTreeDecisionsPath(root) {
```

- Line 104
```
export function reservedAllocateDecisionsPath(root) {
```

### .claude/scripts/workspacify-tree/lib/staging-decisions.mjs

- Line 16
```
import { existsSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
```

- Line 30
```
export function sweepStagingDecisions(decisionsPath) {
```

### .claude/scripts/workspacify-tree/run.mjs

- Line 189
```
function refuseDecisionsArgument(args) {
```

- Line 199
```
function runGate(args) {
```

- Line 255
```
function runFinalize(args) {
```

- Line 342
```
function prepareForwardPipeline(specPath, decisionsPath) {
```

- Line 470
```
function withdrawnReverseOptionsUsed(args) {
```

- Line 480
```
function refuseWithdrawnReverseOptions(drawn) {
```

- Line 495
```
function refuseReversePositionalArguments(positionals) {
```

- Line 516
```
function runReverse(args) {
```

- Line 624
```
function readReverseInputs({ derived, packages }) {
```

- Line 644
```
function resolveDeltaWithSeam({ derived, packages }) {
```

- Line 678
```
function resolveReverseInputs() {
```

- Line 711
```
function placeOriginSpecBesideTheManifest({ specPath, outDir }) {
```

- Line 1154
```
function printUsage() {
```

### tests/workspacify-allocate/acceptance/cross-stage-pipeline.test.mjs

- Line 119
```
test('C002/C003 a real stage-1 manifest drives a real stage-2 publish, prose segment included', () => {
```

### tests/workspacify-allocate/acceptance/end-to-end-allocate.test.mjs

- Line 17
```
test('C005 acceptance: a COMPLETE tree manifest becomes a real workspace with grill-ready seeds', () => {
```

### tests/workspacify-allocate/helpers/stage-allocate-decisions.mjs

- Line 40
```
function write(decisionsPath, text) {
```

### tests/workspacify-allocate/integration/allocate-reload.test.mjs

- Line 33
```
function publish() {
```

### tests/workspacify-allocate/integration/argument-surface.test.mjs

- Line 86
```
function declaredUsage(source) {
```

- Line 103
```
function declaredTokens(usage) {
```

- Line 113
```
function survivingArguments() {
```

- Line 119
```
function assertSurvivorsAreJustified(entries) {
```

- Line 129
```
function authorDecisions(dir, manifest, options) {
```

- Line 138
```
function runChain(args, cwd) {
```

- Line 145
```
function seedsUnder(root) {
```

- Line 170
```
function implementationSurfaceSection(text) {
```

### tests/workspacify-allocate/integration/full-allocate-pipeline.test.mjs

- Line 21
```
test('IT validate -> plan -> packet -> gate -> finalize publishes the real tree and seeds', () => {
```

### tests/workspacify-allocate/reverse/helpers/reverse-fixture.mjs

- Line 229
```
export function fingerprintTree(root) {
```

### tests/workspacify-allocate/reverse/safety-inversion.test.mjs

- Line 600
```
// [::TICKET::] PX-206, PX-207, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-206|PX-207|PX-215) --for-spec --no-implementation-order`.
```

- Line 601
```
function stageDecisions(workspace) {
```

### tests/workspacify-allocate/unit/allocate-manifest.test.mjs

- Line 35
```
function fixture() {
```

### tests/workspacify-allocate/unit/cli-negative-paths.test.mjs

- Line 19
```
test('C001 unknown subcommand and missing arguments exit non-zero with a guide', () => {
```

### tests/workspacify-allocate/unit/gate-pipeline-contracts.test.mjs

- Line 33
```
test('C005 a dropped side, an undeclared contract and a weakened clause all stop the run', () => {
```

### tests/workspacify-allocate/unit/px193-branch-coverage.test.mjs

- Line 42
```
test('contract-model C003: seed-level validation reports every defect class', () => {
```

### tests/workspacify-allocate/unit/px195-branch-coverage.test.mjs

- Line 32
```
test('C001 a sparse manifest still yields a complete, self-verifying record', () => {
```

### tests/workspacify-allocate/unit/runmjs-handlers.test.mjs

- Line 40
```
test('C001 runValidate succeeds on a locked manifest and throws without an argument', () => {
```

### tests/workspacify-allocate/unit/seed-format-compatibility.test.mjs

- Line 108
```
test('C001 precondition: the declared formats are a table whose rows carry a version, ordered sections and a machine section index', () => {
```

### tests/workspacify-reverse/integration/argument-surface.test.mjs

- Line 90
```
function runEntrance(args, cwd) {
```

- Line 97
```
function relativeFilesUnder(root) {
```

- Line 103
```
function argumentsSection(text) {
```

- Line 112
```
function declaredUsage(source) {
```

### tests/workspacify-reverse/integration/decisions-authoring.test.mjs

- Line 74
```
function runChain(command, args, { cwd = PROJECT_ROOT } = {}) {
```

- Line 89
```
function publishOriginSpec(representative) {
```

### tests/workspacify-reverse/integration/terminal-state.test.mjs

- Line 279
```
function runChain(command, args, { cwd = PROJECT_ROOT } = {}) {
```

- Line 298
```
function reverseInputsFor({ inputsRoot, workspaceRoot, preparedGraphPath = null }) {
```

- Line 333
```
function reverseArgs({ subject, documents }) {
```

- Line 452
```
function runReverseChain({ subject, documents, through = 'allocate' }) {
```

- Line 742
```
function configuredRepresentativeRun() {
```

- Line 926
```
function buildGroundedWorkspace() {
```

- Line 1001
```
function allocateDecisionsFor({ workspaceRoot, inputsRoot }) {
```

### tests/workspacify-tree/acceptance/acceptance.test.mjs

- Line 23
```
test('acceptance C005 [@verifies C005]: a long specification produces a COMPLETE manifest meeting every §14.4 condition', () => {
```

### tests/workspacify-tree/acceptance/entry-parity.test.mjs

- Line 24
```
test('entry parity C005 [@verifies C005]: a gaia-like spec yields a manifest that passes the ALLOCATE entry gate', () => {
```

### tests/workspacify-tree/acceptance/gaia-grade.test.mjs

- Line 23
```
test('gaia-grade C001/C002 [@verifies C001][@verifies C002]: dependency discipline and conformance are emitted', () => {
```

### tests/workspacify-tree/acceptance/gaia-handoff-fix.test.mjs

- Line 28
```
test('fix C001/C002 [@verifies C001][@verifies C002]: invariant and error owners appear and parity passes', () => {
```

### tests/workspacify-tree/acceptance/review-regressions.test.mjs

- Line 56
```
function finalizeWith(mutate) {
```

### tests/workspacify-tree/helpers/stage-tree-decisions.mjs

- Line 39
```
function write(decisionsPath, text) {
```

### tests/workspacify-tree/integration/argument-surface.test.mjs

- Line 81
```
function declaredUsage(source) {
```

- Line 94
```
function declaredTokens(usage) {
```

- Line 102
```
function survivingArguments() {
```

- Line 108
```
function assertSurvivorsAreJustified(entries) {
```

- Line 126
```
function createSubject({ withDecisions = true } = {}) {
```

- Line 148
```
function runChain(args, cwd) {
```

- Line 155
```
function decisionsPathNamedIn(text) {
```

- Line 370
```
function implementationSurfaceSection(text) {
```

### tests/workspacify-tree/integration/existing-manifest.test.mjs

- Line 17
```
test('existing manifest with a different source hash is preserved (BLOCKED)', () => {
```

### tests/workspacify-tree/integration/full-pipeline.test.mjs

- Line 28
```
test('cli C003 [@verifies C003]: no arguments prints usage and exits non-zero', () => {
```

### tests/workspacify-tree/integration/info-level-loop.test.mjs

- Line 24
```
test('doc C001 [@verifies C001]: Step 3 describes an information-raising iteration', () => {
```

### tests/workspacify-tree/reverse/cli-reverse.test.mjs

- Line 33
```
function buildReverseWorkspace() {
```

- Line 87
```
function runReverseCli(workspace, extraArgs = []) {
```

### tests/workspacify-tree/reverse/layer-structure-seam.test.mjs

- Line 102
```
test('C002 the five classes are the vocabulary the count and the assertion share', () => {
```

### tests/workspacify-tree/unit/cli-negative-paths.test.mjs

- Line 27
```
test('PX-188 C001 [PX-188 @verifies C001]: unknown subcommand prints usage and exits non-zero', () => {
```

### tests/workspacify-tree/unit/command-realize.test.mjs

- Line 53
```
test('command C001 [@verifies C001]: the command markdown exists, is written in English, and carries the required contract', () => {
```

### tests/workspacify-tree/unit/dependency-review-decisions.test.mjs

- Line 26
```
test('C002 the decision vocabulary is closed and every candidate needs one decision', () => {
```

### tests/workspacify-tree/unit/pulse-visibility.test.mjs

- Line 23
```
test('C004 extract prints the pulse candidates the gate will require to be settled', () => {
```

### tests/workspacify-tree/unit/responsibilities.test.mjs

- Line 19
```
test('C004 an empty or absent responsibilities list fails validation by package id', () => {
```

### tests/workspacify-tree/unit/segment-ownership.test.mjs

- Line 17
```
test('C001 every published segment declares the inventory it carries', () => {
```

### tests/workspacify-tree/unit/spec-defects.test.mjs

- Line 42
```
test('C002 a fully accounted payload passes and every defect field is required', () => {
```
