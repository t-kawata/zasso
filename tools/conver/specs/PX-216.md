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

# Target ticket is PX-216: The stage-identifier case rule is stated where the reader meets it, and the command file is held to it

**Ticket Key**: PX-216 · **Phase**: -1

---

## Background

### Goal
The workspacify-reverse command file states why its stage tokens appear in two cases, and the file is held to the rule it states by a mechanical census over its own text.

### Purpose
The reader who reaches Step 3's evaluation-order block meets a lowercase list inside a document that otherwise writes `R2.5`, with nothing saying why. The rule lives only in `stageLabel`'s JSDoc (`lib/scope.mjs:487-495`), which a reader of the command file never opens, so the one lowercase site reads as an inconsistency rather than as the distinction it is.

### Motivation
The alternative — uppercasing every stage identifier across the repository — was measured and rejected. A rename has no red state, because the tests are written in the vocabulary being renamed, so the suite cannot distinguish a complete rename from a partial one. The blast radius is 46 files on the high-confidence spelling and reaches 43 files under `specs/`, which are the design record of closed tickets written in the spelling of their time. Uppercasing would also make `stageLabel` an identity function and delete the very invariant it exists to encode. The confusion is real; its cause is an unstated rule, not the spelling.

### Constraints
No stage identifier changes case anywhere. `ANALYSIS_EVALUATION_ORDER` stays lowercase, because `command-procedure.test.mjs:570` asserts the command file contains it verbatim. The frontmatter description is pinned verbatim by the same file's first-five-lines assertion and must not move. The sentence must carry none of the six `FORBIDDEN_FORMULATIONS` markers. The rule must hold in all three copies of the command file.

## Scope

- **Scope of changes (describe each change comprehensively):**
- `tools/conver/.claude/commands/workspacify-reverse.md` | modify | Step 3's framing sentence before the evaluation-order block states the case rule and its reason, so the one lowercase site is read as the identifier rather than as an inconsistency | before: "The stages, in the order the machine evaluates them:" | after: the same sentence plus "Each is written lowercase because it is the identifier the command line matches and the code declares; the prose of this file writes the label a reader sees, `R2.5`, for the same stage:" | api: none | schema: none | config: none | dep: none
- `tools/conver/tests/workspacify-reverse/helpers/command-file.mjs` | add | `findLowercaseStageLines(text, { vocabulary })` reports every line carrying a lowercase stage identifier, by line number and token, matching longest first so `r2.5` is never read as `r2` | before: the helper audited structure, forbidden formulations and the judgement surface, but held no census over stage spelling | after: the command file's spelling is a predicate the suite evaluates | api: one addition beside `findAbsenceContradictions` | schema: none | config: none | dep: none
- `tools/conver/tests/workspacify-reverse/integration/command-procedure.test.mjs` | add | two assertions with their fixtures: the rule is stated in Step 3, and the set of lines carrying a lowercase stage identifier equals the set of lines whose trimmed text is the order the code declares — read over all three copies of the command file, resolved from the repository root | before: no test read the case of a stage token, so prose could drift to `r2.5` unnoticed and the rule could be dropped unnoticed | after: both fail by name | api: none | schema: none | config: none | dep: `repositoryRootFrom` from `tests/lib/repo-hygiene.mjs`
- `/Users/kawata/shyme/zasso/.claude/commands/workspacify-reverse.md` and `/Users/kawata/shyme/zasso/crates/siprs/.claude/commands/workspacify-reverse.md` | modify | the two installed copies are re-synced from the source of record | before: all three copies byte-identical at sha256 `d242d6486ba6049a78aa0b04397925dbf075f4743aadd98defab0456567b4ff1` | after: byte-identical at the new digest | api: none | schema: none | config: none | dep: none
- **Out of scope (items intentionally excluded, with justification):**
- Renaming every stage identifier to uppercase | Measured and rejected. A rename has no red state — the tests are written in the vocabulary being renamed, so the suite cannot tell a complete rename from a partial one — and the blast radius reaches 43 files under `specs/`, which record closed tickets in the spelling of their time.
- Rewriting `specs/P22-*.md` through `specs/PX-145.md` | They are the design record of closed tickets. Rewriting them would make the provenance chain claim a name that did not exist when the ticket was written, and their `file:line` citations sit outside `design-citations.test.mjs`'s coverage, so a mistake there would not be reported.
- Changing any identifier in `.claude/scripts/workspacify-reverse/` | `stageLabel` exists so that a stage can never be displayed under a name it is not invoked by; the distinction is the design, and this ticket states it rather than removing it.
- Editing `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md` | Its citations are held by `design-citations.test.mjs`, and the sentence adds no line the document cites.
- **Affected areas (components/systems impacted, even without direct modification):**
- The reader of the command file | Documentation | A lowercase spelling that had no stated reason now carries one on the line that introduces it.
- `tests/workspacify-reverse/integration/command-procedure.test.mjs` | Test suite | Gains two assertions; the existing structural, judgement-surface and forbidden-formulation audits are untouched and must stay green.
- The three installed copies of the command file | Deployment | They must move together. Nothing but this ticket's assertion holds command files identical across projects, because `installed-copy-drift.test.mjs` covers `lib/` modules only.

## Implementation Target Files

- `tools/conver/.claude/commands/workspacify-reverse.md`
- `tools/conver/tests/workspacify-reverse/helpers/command-file.mjs`
- `tools/conver/tests/workspacify-reverse/integration/command-procedure.test.mjs`

## Investigation

Read `/workspacify-reverse.md` (295 lines) and counted every stage token with its case: the lowercase spelling appears exactly once, on line 178, in the evaluation-order block; the uppercase spelling on lines 2, 18, 67, 99, 109, 142, 169, 184, 187, 198, 200, 214, 261 and 295 — frontmatter, prose and the two document filenames. No role carries both spellings.

Found the rule's source: `lib/scope.mjs:487-495`, `stageLabel(stage) { return stage.toUpperCase(); }`, whose JSDoc says the identifiers stay lowercase "because they are matched against `--through` on a command line" and that the label "is derived rather than stored so that a stage can never be displayed under a name it is not invoked by". The command file obeys this rule and never states it, so the one lowercase site reads as an inconsistency.

Found the pins the sentence must not disturb: `command-procedure.test.mjs:191-199` freezes the frontmatter's first five lines verbatim, including the description carrying `R0` and `R8`; `:358-367` requires Step 3 to state the absent prefix instrument, atomic publishing and the reordering; `:564-573` requires the file to contain `ANALYSIS_EVALUATION_ORDER.join(', ')` verbatim and asserts that string differs from the stage numbering. `assertCommandFileStructure` requires frontmatter, a Language Protocol digest, the First-Class Rule sentence, a `## Step` heading, `## Scripts used` naming `run.mjs analyze`, and `## Arguments` — the sentence disturbs none of them. `helpers/command-file.mjs` holds six `FORBIDDEN_FORMULATIONS`, and the sentence carries none of their markers.

Measured the rejected alternative: 46 files carry the high-confidence lowercase spelling (`r0.5`, `r2.5`, `r3.5`, `r5.5`, `r6.5`), reaching 43 files under `specs/` — the design record of closed tickets, written in the spelling of their time — plus `Tickets.json` and `tickets/`. Three copies of the command file exist and are byte-identical at sha256 `d242d6486ba6049a78aa0b04397925dbf075f4743aadd98defab0456567b4ff1`: `tools/conver/.claude/commands/` (the source of record), the repository root's, and `crates/siprs`'s. `installed-copy-drift.test.mjs` measures `lib/` modules only (`SOURCE_MODULE_COUNT = 50`), so command files have no drift guard. `tests/lib/repo-hygiene.mjs:95` exports `repositoryRootFrom`, which the guard reuses to reach all three copies rather than spelling their paths.

`scan-crimes.sh` reports zero unresolved crimes, and no `[::STUB::]` marker sits in this ticket's scope.

## Acceptance Criteria

- **[Happy path]** A reader who reaches Step 3's evaluation-order block meets, immediately before it, a sentence saying that each stage is written lowercase because it is the identifier the command line matches and the code declares, and that the prose of the file writes the label a reader sees, `R2.5`, for the same stage. The block itself is byte-unchanged.
- **[Error case]** A copy of the command file in which the sentence is missing, or in which a stage token is written lowercase in prose, fails `command-procedure.test.mjs`, and the failure names the file, the line number and the token.
- **[Edge case]** The census reports nothing over the real file: the lowercase spelling appears on exactly the one line that quotes `ANALYSIS_EVALUATION_ORDER`, and the `R0` and `R2.5` spellings in the frontmatter description, the fourteen prose sites and the two document filenames are not reported.

## Invariants

- [Normal condition] The three copies of the command file state the case rule and pass the census, so a reader who meets the lowercase block meets its reason on the line before it.
- [Error invariant] A line carrying a lowercase identifier outside the quoting line is reported by file, line number and token; nothing is reported by a bare count, and a compliant document reports nothing rather than a blank.
- [Internal state invariant] No stage identifier moves case anywhere: ANALYSIS_STAGES and ANALYSIS_EVALUATION_ORDER are byte-unchanged, and stageLabel still returns the label a reader sees.
- [Boundary invariant] The census vocabulary is the code's own declaration, matched longest first and case sensitively, so a stage added later is covered without editing the test and r2.5 is never read as r2.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — PX-216 — the rule is stated where the reader meets it

- **Precondition**: The command file text read at any of its three installed paths
- **Postcondition**: Step 3 states that a stage identifier is written lowercase and that prose writes the label
- **Invariant**: The evaluation order block stays unchanged, so the text the file quotes is still the text the code declares

### C002 — PX-216 — the lowercase occurrence set is closed

- **Precondition**: The command file text and the declared stage vocabulary
- **Postcondition**: The lines carrying a lowercase identifier equal the lines quoting the evaluation order
- **Invariant**: No prose line carries a lowercase identifier, and no frontmatter or filename line carries one either

### C003 — PX-216 — a violation is reported by line and token

- **Precondition**: A document carrying a lowercase identifier outside the quoting line
- **Postcondition**: The census returns that line number and that token, and a compliant document returns an empty list
- **Invariant**: The vocabulary is matched longest first and case sensitively, so r2.5 is one token and R0 matches nothing

## Boy Scout Rule

The file this ticket touches is `tests/workspacify-reverse/helpers/command-file.mjs`, whose existing predicates each report a violation by name and line rather than by count (`findAbsenceContradictions`, `auditForbiddenFormulations`). The new census follows that shape rather than inventing one.

- Function names as verb phrases: `findLowercaseStageLines` reads as what it does, and the assertions name the property rather than the mechanism.
- Variable names as domain concepts: the guard names `declaredOrderLines` and `reportedLines` rather than `expected` and `actual`, so the comparison says what is being compared.
- One function one responsibility: the census finds occurrences; deciding whether the occurrence set is correct stays in the test, so the helper carries no policy about which lines are permitted.
- Hardcoded values as named constants: the three copy paths are derived from the repository root through `repositoryRootFrom`, and the vocabulary comes from `ANALYSIS_EVALUATION_ORDER` and `ANALYSIS_STAGES` rather than a literal list typed into the test.
- No error swallowing: the guard fails on an unreadable copy rather than skipping it, because a copy that cannot be read is the finding.

Outside the immediate scope, `run.mjs:175` builds the usage line's `R0 through R8` through `stageLabel` and needs no change; it is recorded here because a reader checking the convention will look there first.

## Test Plan

### Unit Tests

- UT: [Contract C001 precondition] The command file text is read at each of its three installed paths, so a copy left behind by an incomplete re-sync is measured rather than assumed.
- UT: [Contract C001 postcondition] The section of the command file beginning '## Step 3' states that a stage identifier is written lowercase and that prose writes the label a reader sees; removing the sentence from a fixture document turns the assertion red.
- UT: [Contract C001 invariant] The evaluation order block stays unchanged, so the text the file quotes is still the text the code declares.
- UT: [Contract C002 precondition] The census takes the command file text and the declared stage vocabulary, and the vocabulary is the code's own declaration rather than a second list a test maintains.
- UT: [Contract C002 postcondition] The lines carrying a lowercase identifier equal the lines quoting the evaluation order, compared as two sets of line numbers.
- UT: [Contract C002 invariant] No prose line carries a lowercase identifier, and neither a frontmatter line nor a filename line carries one either.
- UT: [Contract C003 precondition] Given a document carrying a lowercase identifier outside the quoting line, the census reports it.
- UT: [Contract C003 postcondition] The census returns that line number and that token, and a compliant document returns an empty list rather than an empty string.
- UT: [Contract C003 invariant] The vocabulary is matched longest first and case sensitively, so r2.5 is one token and R0 matches nothing.
- UT: [Normal] All three copies of the command file state the rule and pass the census, so a copy left behind is caught rather than passing silently.
- UT: [Error] A document carrying a lowercase stage token in prose is reported by line and token; the report names the token so a reader can find it without counting lines.
- UT: [Boundary] The evaluation-order line itself is not reported: it is the one line whose lowercase spelling is a quotation, and the census excises it by comparing against the order the code declares rather than by pattern.
- UT: [Invariant] Over the real file the census reports nothing, and over a fixture that renames one prose token to lowercase it reports exactly one line.

### Integration Tests

- IT: [Integration point] `command-procedure.test.mjs` reads the command file through `helpers/command-file.mjs` at three paths resolved from the repository root by `tests/lib/repo-hygiene.mjs`'s `repositoryRootFrom`.
- IT: [Verification] All three copies state the rule and pass the census; a copy left behind by an incomplete re-sync fails on the census rather than passing silently.
- IT: [Prerequisites] `tests/lib/repo-hygiene.mjs` and a git working tree, because the helper resolves the repository root from the test file's directory.
- IT: [Related tickets] PX-213, PX-214 and PX-215 — the three tickets that last moved this command file's argument surface; P22-9, which created the file.

### Exceptions

- Exception entry:
  - [Item] Whether the stated rule removes the reader's confusion
  - [Reason] It is impossible to test the reader's comprehension: it is a human judgement, and no predicate over the file text carries it. This is not a design defect — the deterministic content of the change is fully covered, because the rule is stated and the spelling obeys the census, and what remains outside those assertions is a person's response to the document rather than a property of the system. The item is exempt because a reader's understanding is judged by a reader, in the same class as the manual and end-to-end readings the project reserves for review, and not because the design declined to make a testable claim.
  - [Alternative verification] The two assertions make the mechanical halves permanent, so the rule cannot be dropped and the spelling cannot drift; `/review-ticket` reads the sentence against the lowercase block it frames.

### Plan Test Code (concrete code)

- UT: [Normal] Every installed copy of the command file states the case rule in Step 3 and spells a stage lowercase only on the line that quotes the declared evaluation order.

```js
const repositoryRoot = repositoryRootFrom(dirname(fileURLToPath(import.meta.url)));
const copies = [
  { label: 'the source of record', path: COMMAND_PATH },
  { label: 'the repository root install', path: join(repositoryRoot, COMMANDS_RELATIVE_DIR, 'workspacify-reverse.md') },
  { label: 'the crates/siprs install', path: join(repositoryRoot, 'crates', 'siprs', COMMANDS_RELATIVE_DIR, 'workspacify-reverse.md') },
];

for (const copy of copies) {
  assert.equal(existsSync(copy.path), true, `${copy.label} is present at ${copy.path}`);
  const text = readFileSync(copy.path, 'utf8');
  assert.deepEqual(
    findUnstatedCaseConvention({ text, heading: STEP_3_HEADING }),
    [],
    `${copy.label} states why a stage identifier is written lowercase`,
  );
  assert.deepEqual(
    [...new Set(findLowercaseStageLines({ text, vocabulary }).map((finding) => finding.line))],
    declaredOrderLines(text),
    `${copy.label} spells a stage lowercase only where it quotes the declared order`,
  );
}
```
- UT: [Contract C001 precondition] The command file text is read at each of its three installed paths, so a copy left behind by an incomplete re-sync is measured rather than assumed.

```js
const copies = commandFileCopies();
assert.equal(copies.length, 3, 'the source of record and its two installs are the three paths read');
for (const copy of copies) {
  assert.equal(existsSync(copy.path), true, `${copy.label} is present at ${copy.path}`);
}
```
- UT: [Contract C001 postcondition] The section of the file that quotes the evaluation order states that a stage identifier is written lowercase and that prose writes the label a reader sees.

```js
assert.deepEqual(
  findUnstatedCaseConvention({ text: TEXT, heading: STEP_3_HEADING }),
  [],
  'no unstated-case-convention finding over the real file',
);
assert.match(sectionText(TEXT, STEP_3_HEADING), CASE_CONVENTION, 'Step 3 carries the rule and its reason');
```
- UT: [Contract C001 invariant] The evaluation order block stays unchanged, so the text the file quotes is still the text the code declares.

```js
assert.equal(
  TEXT.includes(ANALYSIS_EVALUATION_ORDER.join(', ')),
  true,
  'the line the file quotes is byte-identical to the order the code declares',
);
assert.deepEqual(declaredOrderLines(TEXT), [178], 'and it is one line, still on line 178');
```
- UT: [Contract C002 precondition] The command file text and the declared stage vocabulary are the two inputs, and the vocabulary is the code's own declaration rather than a second list a test maintains.

```js
const vocabulary = [...ANALYSIS_EVALUATION_ORDER];
assert.equal(vocabulary.length, 14, 'the vocabulary is the fourteen stages the analysis declares');
assert.equal(vocabulary[0], 'r0', 'and it is read from the code, lowercase, not retyped');
assert.equal(vocabulary.at(-1), 'r8', 'through the last declared stage');
```
- UT: [Contract C002 postcondition] The lines carrying a lowercase identifier equal the lines quoting the evaluation order, compared as two sets of line numbers.

```js
const reportedLines = [...new Set(
  findLowercaseStageLines({ text: TEXT, vocabulary }).map((finding) => finding.line),
)];
assert.deepEqual(reportedLines, declaredOrderLines(TEXT), 'the occurrence set is closed to the quotation');
```
- UT: [Contract C002 invariant] No prose line carries a lowercase identifier, and neither a frontmatter line nor a filename line carries one either.

```js
const mutated = TEXT.replace('R2.5 runs before R1 and R2', 'r2.5 runs before R1 and R2');
const prose = findLowercaseStageLines({ text: mutated, vocabulary })
  .filter((finding) => !declaredOrderLines(mutated).includes(finding.line));
assert.equal(prose.length, 1, 'the one mutated prose line is the only finding the mutation adds');
assert.equal(findLowercaseStageLines({ text: TEXT.split('\n').slice(0, 5).join('\n'), vocabulary }).length, 0, 'the frontmatter carries no lowercase stage token');
```
- UT: [Contract C003 precondition] Given a document carrying a lowercase identifier outside the quoting line, the census reports it.

```js
const fixture = TEXT.replace('R2.5 runs before R1 and R2', 'r2.5 runs before R1 and R2');
assert.notEqual(fixture, TEXT, 'the fixture is the real file with exactly one token recased');
assert.equal(
  fixture.split('\n').filter((line, index) => line !== TEXT.split('\n')[index]).length,
  1,
  'and exactly one line differs, so the fixture is wrong in one way',
);
```
- UT: [Contract C003 postcondition] The census returns that line number and that token, and a compliant document returns an empty list rather than a blank.

```js
const reported = findLowercaseStageLines({ text: mutated, vocabulary });
assert.equal(reported.filter((finding) => !declaredOrderLines(mutated).includes(finding.line))[0].token, 'r2.5', 'the finding names the token');
assert.match(reported.at(-1).text, /r2\.5 runs before/, 'and the line it names is the mutated one');
assert.deepEqual(findLowercaseStageLines({ text: 'nothing to see here', vocabulary }), [], 'a compliant document yields an empty list');
```
- UT: [Contract C003 invariant] The vocabulary is matched longest first and case sensitively, so r2.5 is one token and R0 matches nothing.

```js
const probe = findLowercaseStageLines({ text: 'a r2.5 b\nc R0 d\ne render2 f', vocabulary });
assert.deepEqual(probe.map((finding) => finding.token), ['r2.5'], 'longest first, case sensitive, and render2 is not r2');
assert.deepEqual(probe.map((finding) => finding.line), [1], 'and only the line that carries it is reported');
```
- UT: [Error] A document carrying a lowercase stage token in prose is reported by line and token; the report names the token so a reader can find it without counting lines.

```js
const stripped = `${TEXT.replace('R2.5 runs before R1 and R2', 'r2.5 runs before R1 and R2')}`;
const violations = findLowercaseStageLines({ text: stripped, vocabulary })
  .filter((finding) => !declaredOrderLines(stripped).includes(finding.line));
assert.equal(violations.length, 1, 'one violation, not a count of zero');
assert.equal(typeof violations[0].line, 'number', 'the finding carries a line number');
assert.equal(typeof violations[0].token, 'string', 'and a token');
```
- UT: [Boundary] The evaluation-order line itself is not reported: it is the one line whose lowercase spelling is a quotation, and the census excises it by comparing against the order the code declares rather than by pattern.

```js
assert.deepEqual(
  declaredOrderLines(TEXT),
  [178],
  'the quotation is found by equality against ANALYSIS_EVALUATION_ORDER.join(\', \')',
);
assert.equal(
  findLowercaseStageLines({ text: TEXT, vocabulary }).every((finding) => finding.line === 178),
  true,
  'every lowercase occurrence in the real file sits on the quotation line',
);
```
- UT: [Invariant] Over the real file the census reports nothing outside the quotation, and over a fixture that renames one prose token to lowercase it reports exactly one line.

```js
const real = findLowercaseStageLines({ text: TEXT, vocabulary });
assert.equal(real.length, 14, 'the quotation line carries the fourteen declared tokens');
assert.equal(new Set(real.map((finding) => finding.line)).size, 1, 'and no other line carries one');
const drifted = TEXT.replace('R2.5 runs before R1 and R2', 'r2.5 runs before R1 and R2');
assert.equal(new Set(findLowercaseStageLines({ text: drifted, vocabulary }).map((finding) => finding.line)).size, 2, 'the drift adds exactly one line');
```
- IT: [Integration point] `command-procedure.test.mjs` reads the command file through `helpers/command-file.mjs` at three paths resolved from the repository root by `tests/lib/repo-hygiene.mjs`'s `repositoryRootFrom`.

```js
import { repositoryRootFrom } from '../../lib/repo-hygiene.mjs';
const repositoryRoot = repositoryRootFrom(dirname(fileURLToPath(import.meta.url)));
assert.notEqual(repositoryRoot, null, 'the helper resolves the repository root from this file');
assert.equal(existsSync(join(repositoryRoot, 'crates', 'siprs')), true, 'and the second install root exists beneath it');
```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| The stages, in the order the machine evaluates them: | The stages, in the order the machine evaluates them — each written lowercase because it is the identifier the command line matches and the code declares, and every other mention in this file writes the label a reader sees, `R2.5`: | `tools/conver/.claude/commands/workspacify-reverse.md` — Step 3's framing line now states the case convention and its reason. The line was **replaced, not added**: `specs/P25-2.md` and `specs/P25-7.md` cite this file by line (`:115`, `:198`, `:243-254`) and `specs/` sits outside `design-citations.test.mjs`'s coverage, so an inserted line would have moved every citation below it with nothing to report it. The file's length is unchanged. |
| no predicate over stage spelling existed; the helper audited structure, forbidden formulations and the judgement surface only | `CASE_CONVENTION`, `findUnstatedCaseConvention({ text, heading })` and `findLowercaseStageLines({ text, vocabulary })` | `tests/workspacify-reverse/helpers/command-file.mjs` — two predicates added, each taking its subject as text so a fixture can drive it, following `findAbsenceContradictions`. Both report by name and line rather than by count. The constant sits beside its only consumer at the end of the file: `design-citations.test.mjs` pins `command-file.mjs:217` to `assertCommandFileStructure`, and placing the constant in the top block shifted it to 233 — the guard reported the drift, and the placement is what restored it. |
| no test read the case of a stage token, so prose could drift to `r2.5` unnoticed and the rule could be dropped unnoticed | 8 assertions and 2 fixture helpers, reading the command file at all three of its installed paths | `tests/workspacify-reverse/integration/command-procedure.test.mjs` — the rule must be stated in Step 3, and the set of lines carrying a lowercase stage identifier must equal the set of lines quoting `ANALYSIS_EVALUATION_ORDER`. Fixtures are derived by mutating the real file on exactly one line. The three-copy assertion is load-bearing: `installed-copy-drift.test.mjs` measures `lib/` modules only, so nothing else held command-file copies together. The quotation is pinned to line 178 as an anchor for the citations above. |
| three copies byte-identical at sha256 d242d6486ba6049a78aa0b04397925dbf075f4743aadd98defab0456567b4ff1 | three copies byte-identical at sha256 13427073b138422d10e18f7d20d3954ad2b35d47876682095ea1517d2153a0b0 | `.claude/commands/workspacify-reverse.md` and `crates/siprs/.claude/commands/workspacify-reverse.md` re-synced from the source of record. The copy was made file-wise rather than through `install.js`: that installer has no module-selection flag and rewrites all 779 tracked files, and this repository records a case where an installer run silently reverted hand-edits from other tickets. `.claude/.conver-install-state.json` still records the previous hash for this path and was left unchanged — it is a record of what the installer produced, and no test validates it against the working tree. |

## RFC Discrepancies found in Prior Implementation Rounds

- Contract C003's invariant is written as "A line carrying a lowercase identifier outside the quoting line is reported by file, line number and token". The finding carries line, token and the trimmed line text; the file is supplied by the caller, because the predicate takes text rather than a path so that a fixture can drive it — the same trade `findAbsenceContradictions` makes. In the shipped guard a violation is therefore attributable to all three: the copy loop names the file in its assertion message, and the finding names the line and the token. Recorded rather than reworded, because the wording is the ticket's and the behaviour is correct.

## Notes in Prior Implementation Rounds

### Implementation steps
1. Write the two assertions and the census's fixture cases red in `command-procedure.test.mjs`; run the suite and confirm red.
2. Add `findLowercaseStageLines` to `helpers/command-file.mjs`; confirm the fixture cases turn green while the assertion over the real file stays red.
3. Add the sentence to `tools/conver/.claude/commands/workspacify-reverse.md`.
4. Re-sync the two installed copies.
5. Confirm the suite green, including the existing structural audits of the command file.

### Risks
The census could be satisfied by uppercasing the evaluation-order line — which is exactly what `command-procedure.test.mjs:570` forbids, so the two assertions hold each other and neither can be satisfied by weakening the other.

### Caveats
The sentence is added to a file whose frontmatter, Step 3 assertions and Language Protocol digest are pinned elsewhere; none of those pins is touched, and all must stay green.

### Open items
Nothing holds the three command-file copies identical except this ticket's assertion. Command files have no equivalent of `installed-copy-drift.test.mjs`, which covers `lib/` modules only.

### Future improvements
If command copies gain a drift guard, the three-path assertions fold into it and this ticket's copy case becomes redundant.
Implementation summary (PX-216):

- Changed files: `.claude/commands/workspacify-reverse.md` (x3 copies), `tests/workspacify-reverse/helpers/command-file.mjs`, `tests/workspacify-reverse/integration/command-procedure.test.mjs`.

- TDD: Red was confirmed in two stages. First the test file failed to load because the helper exports did not exist. Then, with the helper in place, exactly 3 assertions failed — the ones requiring the command file to state the rule — while the census assertions passed, because the file already obeyed the convention and the census is a regression guard. Green was confirmed in two stages as well: after editing only the source of record, 49 of 50 passed and the single remaining failure was the three-copy assertion, which is the guard catching the not-yet-synced installs.

- Verification: `node --test tests/workspacify-reverse/integration/command-procedure.test.mjs` 50/50; `command.test.mjs` 16/16; `tests/conventions/{design-citations,module-convention,repo-hygiene,bundle-freshness}` 26/26; `make check-conventions` pass; `run-quality-checks.js` 0 issues on both changed files (negative control confirmed the checker is live).

- `make test` reports 14 failures in claude-tests and 2 in project-mjs. Both sets are pre-existing: stashing this ticket's changes reproduces the same 2 project-mjs failures (`tests/conventions/derived-artefacts.test.mjs`, which requires the gitignored, untracked `tools/conver/tmp/` to exist and be non-empty — it is absent from this working tree and cannot be restored from git). This ticket adds zero failures.

- Two defects of mine were caught by guards and fixed: placing `CASE_CONVENTION` in the helper's top constant block moved the line `design-citations.test.mjs` pins, and hand-writing the provenance annotation in the older `— see` form made `annotate-ticket-context-by-git-diff.js --verify` report the definitions as unannotated. Both guards reported the drift by name.

- Residual: `.claude/.conver-install-state.json` records sha256 `d242d648…` for `commands/workspacify-reverse.md` while the file now hashes `13427073…`. The next `install.js` run will reconcile it. Recorded rather than hand-edited, because the file is a record of what the installer produced.

- Also observed, not fixed, outside this ticket's scope: the citations into the command file in `specs/P25-2.md:106` and `specs/P25-7.md:56` already pointed at unrelated lines before this change (`:115` is the `oracle` row of the scripts table, `:198` is the `R0-R2-REPORT.md` row). `specs/` is outside `design-citations.test.mjs`'s coverage, so nothing reports this class of drift.
Review report (PX-216):

Four defects were found and fixed during review. Each was fixed by changing the code, and each was verified by running the guard that covers it.

1. **An empty vocabulary reported a match at every position.** `findLowercaseStageLines` built its alternation by joining the vocabulary; with an empty vocabulary the alternation is empty, and the pattern matched the empty string at every offset — 5 findings with `token: ""` over a two-line input. This is the exact inverse of contract C003's postcondition, "a compliant document returns an empty list rather than a blank". Fixed with an early return, which states the domain rather than excusing the regex: with no stages to match there is nothing to find. A boundary test was written red first (it failed against the old code), then the guard was added.

2. **The repository root was resolved per call with no precondition guard.** `commandFileCopies()` called `repositoryRootFrom(...)` on every invocation, so a non-git checkout would have failed with a bare `TypeError` from `join(null, ...)`. `installed-copy-drift.test.mjs:87` names this precondition — `assert.ok(REPOSITORY_ROOT, '...belongs to a repository, or nothing here can be measured')`. The root is now resolved once at module scope and asserted, matching the established pattern.

3. **The regex-metacharacter escape was untested, and it is load-bearing for the shipped vocabulary.** `r2.5` is one of the fourteen declared tokens and `.` is a metacharacter: without the escape the pattern matches `r2X5`. Coverage was added for both directions (the spurious match and the real one). A mutation check proved the test has teeth: stripping the escape makes exactly that test fail and nothing else, and restoring it returns the suite to green.

4. **The `CASE_CONVENTION` JSDoc carried a rhetorical clause with no information** ("the convention this pattern states is about placement as much as about case"). No-Justification Rule: replaced with the concrete constraint it was gesturing at — `design-citations.test.mjs` pins `command-file.mjs:217`, so a constant added above that line moves it and the guard reports the drift.

One assertion of mine was wrong and was corrected: the first version of the metacharacter test expected one finding for `r2X5`, but `r2` is itself a declared stage and `r2X5` legitimately carries it. The vocabulary was narrowed to the dotted token so that `r2` cannot answer for `r2.5`.

Implementation completeness: all three acceptance criteria and all four invariants hold; the three excluded-scope decisions were respected (`specs/` untouched, no identifier recased, the design document untouched). The ticket's stated risk — that the census could be satisfied by uppercasing the evaluation-order line — is held by `command-procedure.test.mjs:570`, which forbids exactly that, so the two guards constrain each other.

Test results: 52/52 in `command-procedure.test.mjs` (was 50 before the two review additions), 16/16 in `command.test.mjs`, 4/4 in `design-citations.test.mjs`, 26/26 across the conventions suite, `make check-conventions` pass.

## PX-216 — implemented at 4 locations

### tests/workspacify-reverse/helpers/command-file.mjs

- Line 403
```
export function findUnstatedCaseConvention({ text, heading }) {
```

- Line 422
```
export function findLowercaseStageLines({ text, vocabulary }) {
```

### tests/workspacify-reverse/integration/command-procedure.test.mjs

- Line 605
```
function commandFileCopies() {
```

- Line 627
```
function declaredOrderLines(text) {
```
