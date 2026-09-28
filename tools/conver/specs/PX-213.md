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

# Target ticket is PX-213: /workspacify-reverse takes no arguments: the current directory is the subject, and the run publishes into a reserved directory beneath it

**Ticket Key**: PX-213 · **Phase**: -1

---

## Background

### Goal
Make `/workspacify-reverse` runnable with no arguments: the current working directory is always the subject, and the run publishes its documents into a reserved directory beneath that same working directory. Remove `--out` and `--through` from the entrance.

### Purpose
Today the entrance requires a positional project root and derives its destination from the workspacify-reverse project itself, not from where it was run. Three lines carry the whole of it:

- `run.mjs:354` — `if (!root) { process.stderr.write(USAGE); return 2; }`, so a bare `analyze` is a usage error.
- `run.mjs:68` — `PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')`, i.e. the conver project, not the caller's directory.
- `run.mjs:358` — `const destination = out === null ? join(PROJECT_ROOT, ANALYSIS_OUTPUT_DIRECTORY) : resolve(out)`, with `run.mjs:117` `ANALYSIS_OUTPUT_DIRECTORY = 'tests/workspacify-reverse/analysis'`.

So an operator standing in their own project must name that project as an argument, and receives the documents in a directory belonging to a different project. The two defaults are not merely inconvenient, they are load-bearing against each other: the destination is *always* outside the default subject, which is the only reason the read-only assertion never fires on a default run.

### Motivation
A command whose subject is the directory it was run in should not need to be told which directory that is. The three sibling subcommands already take this position and resolve their project from `process.cwd()`: `regression` at `run.mjs:287`, `holdout` and `oracle` at `run.mjs:248` and `run.mjs:257`. The entrance is the one holdout, and the divergence is the defect.

### Constraints
The read-only guarantee is not negotiable, and it is implemented rather than documented:

- `scope.mjs:1791-1796` digests the target after every stage and throws when the digest moved — "A run that changes what it measured cannot be believed."
- `scope.mjs:859-868` `assertOutputIsOutsideTarget` refuses a destination equal to the target or beneath it, and `scope.mjs:1579` calls it before any stage runs.
- `tests/workspacify-reverse/unit/r0-r2.test.mjs:262-269` holds that refusal as a test: "publishing inside the target is refused rather than allowed to dirty it".

Measured, not inferred: from conver, `node .claude/scripts/workspacify-reverse/run.mjs analyze . --out=.` exits 1 with "the output directory /Users/kawata/shyme/zasso/tools/conver is inside the target ."

A destination beneath the subject is therefore permitted only where it provably cannot change what was measured: the destination must be a directory that no walk of the analysis descends into. That single requirement is the whole design of this ticket, and it is why the destination is a reserved directory rather than the working directory itself.

## Scope

- [Change] path: `.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs` | action: modify | detail: introduce `RESERVED_OUTPUT_DIRECTORY_NAME = '.workspacify-reverse'` beside the walk-exclusion constants; add it to `NEVER_WALKED_DIRECTORY_NAMES` (line 41) so `listTreeFiles`, `digestTree`, `detectPrimaryLanguage` and `EXCLUSION_RULES` (analysis-tech.mjs:39-42) all inherit it; add it to `NOT_ENUMERATED_DIRECTORY_NAMES` (analysis-tech.mjs:52) so the run's own output is not enumerated as subject material either | before: `NEVER_WALKED_DIRECTORY_NAMES = ['target', '.git']`, `NOT_ENUMERATED_DIRECTORY_NAMES = ['.git']` | after: both carry the reserved name, sourced from the one constant | api: a new exported constant, no signature change | schema: none | config: none | dep: none
- [Change] path: `.claude/scripts/workspacify-reverse/lib/scope.mjs` | action: modify | detail: `assertOutputIsOutsideTarget` (lines 859-868) becomes a predicate that refuses the target and everything beneath it *except* `join(target, RESERVED_OUTPUT_DIRECTORY_NAME)`, which it accepts because the walk provably does not descend into it; the refusal message keeps the phrase `inside the target` that `r0-r2.test.mjs:266` matches; the published digest record names the exclusion so the before/after claim is not overstated | before: every destination beneath the target refused | after: exactly the reserved directory beneath the target accepted, all others still refused | api: `analyzeProject({root, out, through})` unchanged in shape | schema: `ANALYSIS-SCOPE.json` `target_digest` gains the excluded directory names | config: none | dep: none
- [Change] path: `.claude/scripts/workspacify-reverse/run.mjs` | action: modify | detail: `parseArgs`'s `analyze` branch (lines 298-310) sets `root: process.cwd()` and `out: join(process.cwd(), RESERVED_OUTPUT_DIRECTORY_NAME)`; `ROOT_TAKING_SUBCOMMANDS` (line 80) drops `'analyze'`; `WITHDRAWN_OPTIONS` (line 96) gains `--out` and `--through` with their reasons; a stray positional is refused by the same path; `VALUE_TAKING_FLAGS` (line 83) drops `--through` and keeps `--out` for `spike`; `USAGE` (lines 132-171) loses the `--through` option line and the analyze usage line's `<root>`, `[--through=...]` and `[--out=...]`; `ANALYSIS_OUTPUT_DIRECTORY` (line 117) and the now-unused `PROJECT_ROOT` (line 68) are removed | before: `analyze <root> [--through=<stage>] [--out=<dir>]` | after: `analyze` | api: none | schema: none | config: none | dep: none
- [Change] path: `.claude/commands/workspacify-reverse.md` | action: modify | detail: the frontmatter `argument-hint` (line 3) becomes empty because the entrance takes nothing; `## Arguments` (lines 32-42) states that the current directory is the subject and the reserved directory beneath it the destination, and names `--out`, `--through` and `--query` as withdrawn-and-refused rather than as options; the Scripts used row (line 110) reads `run.mjs analyze`; Step 2 (line 161) and Step 3 (line 173) show the argument-free invocation; Step 3's second mechanical fact (line 185) and the pointer at line 188 stop claiming a command-line prefix instrument; the two Error recovery entries (lines ~276, ~282) stop offering `--through` and a destination choice | before: a documented positional root and two options | after: a documented no-argument entrance | api: none | schema: none | config: none | dep: none
- [Change] path: `tests/workspacify-reverse/` | action: modify | detail: the tests that drive the entrance are re-pointed from `['analyze', tree.root, '--out=' + out.root]` to `['analyze']` with `cwd` set to a disposable tree, reading the documents from `join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME)`; `runCli`/`runChain`/`runEntrance` gain a `cwd`; `command-procedure.test.mjs`'s frontmatter assertion (lines 196-205), prefix-instrument assertion (line 363), entrance invocation (line 543) and flags assertion (lines 552-555) are re-derived from the new contract; `command.test.mjs`'s `analyzeLine` regex (line 384) is re-derived | before: 11 CLI call sites pass `--out` into a scratch directory | after: the same assertions, driven from the working directory | api: none | schema: none | config: none | dep: none
- [Change] path: `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md`, `tests/conventions/design-citations.test.mjs` | action: modify | detail: three anchored citations move with this change — `run.mjs:80` (`ROOT_TAKING_SUBCOMMANDS`), `scope.mjs:1929` (`publishDocuments`), `scope.mjs:1791-1797` (`the analysis modified its target`) — and each is re-measured to the line that now carries its token rather than adjusted to fit; §5.4's account of atomic publishing gains the reserved-directory exclusion it now rests on | before: citations resolved against the pre-change numbering | after: re-measured | api: none | schema: none | config: none | dep: none
- [Non-change] the `analyzeProject` API keeps its `{root, out, through}` parameters. It is the programmatic surface the unit and integration suites drive, and `--through` remains reachable there: only the command line loses the prefix instrument. Weakening it would remove the only way a prefix run is expressible.
- [Non-change] the committed `tests/workspacify-reverse/analysis/` directory is neither moved nor deleted. It is read as a fixture by `reflexion.test.mjs`, `two-pass.test.mjs`, `claim-ledger.test.mjs`, `dynamic-coupling.test.mjs`, `security-lane.test.mjs`, `terminal-state.test.mjs` and `terminal-state-record.test.mjs`, and its entry count is asserted against the design document by `design-measurements.test.mjs`. The change moves where a *run* publishes; it does not move the record of the runs already published.
- [Non-change] the `spike` subcommand keeps its `--out` option (`run.mjs:258`, `SPIKE_CANDIDATES_DIRECTORY`). This ticket is about the entrance; the spike's destination is declared by its own ticket and is not part of the argument surface being contracted.
- [Impact] component: the `/workspacify-reverse` command | nature: a breaking change to the invocation contract | response: the command file's Arguments section, the frontmatter hint and every step that showed an invocation are rewritten in the same ticket, so the document and the entrance never disagree
- [Impact] component: tests that drive the entrance | nature: their working directory becomes the subject, so a test that ran against the repository would now publish into the repository | response: every such test is driven from a synthetic or disposable tree, and none is allowed to inherit the repository as its `cwd`
- [Impact] component: the published record | nature: the digest claim now covers a tree one directory smaller than the tree the reader can see | response: `ANALYSIS-SCOPE.json`'s `target_digest` names the excluded directory, so the claim is read as what it is rather than as a claim over the whole tree

## Implementation Target Files

- `.claude/scripts/workspacify-reverse/run.mjs`
- `.claude/scripts/workspacify-reverse/lib/scope.mjs`
- `.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs`
- `.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs`
- `.claude/commands/workspacify-reverse.md`
- `tests/workspacify-reverse/integration/command.test.mjs`
- `tests/workspacify-reverse/integration/command-procedure.test.mjs`
- `tests/workspacify-reverse/integration/terminal-state.test.mjs`
- `tests/workspacify-reverse/integration/decisions-authoring.test.mjs`
- `tests/workspacify-reverse/unit/r0-r2.test.mjs`
- `tests/conventions/design-citations.test.mjs`
- `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md`

## Investigation

### Evidence gathered

**The conflict, measured rather than read.** `node .claude/scripts/workspacify-reverse/run.mjs analyze . --out=.` from conver exits 1: "the output directory /Users/kawata/shyme/zasso/tools/conver is inside the target .; the analysis writes only outside what it measures, so that a run cannot change its own subject". The requested semantics (subject = current directory, destination = current directory) is refused by construction at `scope.mjs:1579` → `scope.mjs:859-868`.

**The refusal cannot simply be deleted.** `scope.mjs:1791-1796` compares `digestTree(scope.root)` before and after and throws on any movement, and `digestTree` (`holdout-ledger.mjs:259-271`) walks through `listTreeFiles` with `NEVER_WALKED_DIRECTORY_NAMES`. Publishing into the subject would make the next run measure its own output: the artefact walk (`analysis-tech.mjs:804`) would classify it, and R0.5 would carry it into `SCOPE-BOUNDARY.json`. A destination directly in the working directory is therefore not merely awkward, it is unsound.

**The extension point already exists.** `NEVER_WALKED_DIRECTORY_NAMES` (`holdout-ledger.mjs:41`) is `['target', '.git']` and feeds four consumers: the `digestTree` default, the `listTreeFiles` default, `detectPrimaryLanguage` through `PROJECT_SOURCE_EXCLUSIONS` (line 53), and `EXCLUSION_RULES` (`analysis-tech.mjs:39-42`). `NOT_ENUMERATED_DIRECTORY_NAMES` (`analysis-tech.mjs:52`) is the stronger form — `['.git']`, not enumerated at all — and its own comment states the reason: ".git holds the version-control database, which is machinery about the project rather than an artefact of it." One name in both lists makes the destination provably outside everything the run measures.

**What the refusal already costs, and would not stop costing.** `tests/workspacify-reverse/unit/r0-r2.test.mjs:262-269` asserts that `join(tree.root, 'analysis')` is refused and that it is not created. That test constrains the *general* refusal, not the reserved directory, so it stays green under this design — which is the check that the relaxation is narrow rather than a removal.

**The default subject and the default destination are the same defect.** `run.mjs:68` resolves `PROJECT_ROOT` from the module's own location, so the destination is a constant of the tool rather than of the invocation, while the subject is whatever the caller names. The three sibling subcommands already inverted this: `regression` (`run.mjs:287`), `holdout` and `oracle` (`run.mjs:248`, `run.mjs:257`) all resolve from `process.cwd()`.

**The withdrawn-option machinery is already built and already tested.** `run.mjs:96-114` refuses `--query` by name, with the reason, raising the same kind of error an unknown stage raises, and `command.test.mjs:392-405` holds it. Extending it to `--out` and `--through` is the minimal-change route to "these options no longer exist", and it is the route the project's own stated rule prescribes: "An option the entrance used to honour and no longer does is refused by name rather than ignored ... a question silently dropped reads as a question answered."

**The blast radius, enumerated by measurement.** CLI call sites that drive `analyze`: `command.test.mjs` (lines 199, 269, 292, 309, 333, 334, 395, 412, 445), `command-procedure.test.mjs` (543), `terminal-state.test.mjs` (493, 756), `decisions-authoring.test.mjs` (100). Assertions on the command file: `command-procedure.test.mjs:196-205` (frontmatter, first five lines by `deepEqual`), `:363` (the prefix instrument), `:543` (the declared invocation), `:552-555` (the four arguments); `command.test.mjs:360-390` (the `## Arguments` ↔ `USAGE` comparison in both directions), `helpers/command-file.mjs:217-236` (the eight structural assertions, which require `argument-hint:` to be present, so the key stays and its value empties). Design-document citations that move: `run.mjs:80`, `scope.mjs:1929`, `scope.mjs:1791-1797`, held by `tests/conventions/design-citations.test.mjs`.

**What must not move.** `tests/workspacify-reverse/analysis/` is read as a fixture by `reflexion.test.mjs:56`, `two-pass.test.mjs:42`, `claim-ledger.test.mjs:39-40`, `dynamic-coupling.test.mjs:465`, `security-lane.test.mjs:34`, `terminal-state.test.mjs:93-96` and `terminal-state-record.test.mjs:43`, and `design-measurements.test.mjs` asserts its entry count against the design document. `spike` keeps its `--out`. `analyzeProject` keeps `{root, out, through}`, which is what keeps every API-driven test in the suite untouched.

## Acceptance Criteria

- Happy path: with the current directory set to a project, `node .claude/scripts/workspacify-reverse/run.mjs analyze` exits 0 and publishes the origin spec and its sidecars into `.workspacify-reverse` beneath that same directory; the run reports the subject as the current directory and the tree it measured is unchanged apart from that directory.
- Error case: `analyze --out=/tmp/x`, `analyze --through=r2` and `analyze /some/path` each exit non-zero, name the refused token on stderr with the reason it can no longer be honoured, and publish nothing — no document, and no partially written destination.
- Edge case: `analyze` run in a directory that already holds a `.workspacify-reverse` from a previous run completes, publishes, and its before/after digest still matches, because no walk descends into that directory; and a destination beneath the target that is not the reserved directory is still refused with the message containing `inside the target`.

## Invariants

- [Normal condition] The entrance resolves the subject as `process.cwd()` and the destination as `join(process.cwd(), RESERVED_OUTPUT_DIRECTORY_NAME)`. Neither is settable from the command line, so a given working directory has exactly one (subject, destination) pair, and a run is reproducible from its directory alone.
- [Error invariant] A refused invocation writes nothing. When `--out`, `--through` or a positional argument is refused, the refusal is raised before any stage runs, is named on stderr, and leaves the destination untouched — the guarantee `P25-7` established for `--query`, held by the same path (`run.mjs:110-114`, reached from `runAnalysisPipeline` before `analyzeProject`).
- [Internal state invariant] The reserved directory name exists as one exported constant, and that same binding is a member of `NEVER_WALKED_DIRECTORY_NAMES` and of `NOT_ENUMERATED_DIRECTORY_NAMES`. The destination and the exclusion cannot drift, because they are the same value rather than two literals that agree today.
- [Boundary invariant] Beneath the target, exactly one destination is accepted: `join(root, RESERVED_OUTPUT_DIRECTORY_NAME)`. The target itself and every other path beneath it are refused with a message containing the phrase `inside the target`. Consequently `digestTree(root)` is byte-identical before and after a run that publishes into the reserved directory, because `listTreeFiles` does not descend into it.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — `/workspacify-reverse` command → `run.mjs analyze` (the entrance). The edge is the command's whole argument surface, and this ticket is the change to it.

- **Precondition**: The process is invoked with the subcommand `analyze` and with no positional argument, no `--out` and no `--through`. The current working directory is a regular, readable, listable directory. Formally: `argv[0] === 'analyze'`, `positionalArgs(argv.slice(1))` is empty, and `withdrawnOptionsUsed(optionArgs)` is empty. Any of `--out`, `--through`, `--query` or a positional present is a precondition violation and is refused rather than tolerated.
- **Postcondition**: Exactly one of two outcomes. Success: exit 0, and `join(process.cwd(), RESERVED_OUTPUT_DIRECTORY_NAME)` holds the full published document set with `ORIGIN-LONG-SPEC.json` and `ORIGIN-LONG-SPEC.md` among them, and stdout names that destination. Refusal: a non-zero exit, the offending token named on stderr together with the reason it cannot be honoured, the sentence "Nothing was published", and no document written anywhere. There is no third outcome and no partially published destination.
- **Invariant**: No document is ever written outside `join(process.cwd(), RESERVED_OUTPUT_DIRECTORY_NAME)`, and no invocation that is refused writes any document at all. Asserted by hashing the working directory before and after and by listing every path the run created.

### C002 — `holdout-ledger.mjs` (what a walk descends into) → `scope.mjs` (the destination it accepts) → `run.mjs` (the destination it builds). One constant is read by all three.

- **Precondition**: `RESERVED_OUTPUT_DIRECTORY_NAME` is exported from `holdout-ledger.mjs` and is a member of both `NEVER_WALKED_DIRECTORY_NAMES` and `NOT_ENUMERATED_DIRECTORY_NAMES`. The destination built by the entrance is `join(process.cwd(), RESERVED_OUTPUT_DIRECTORY_NAME)`, built from that same binding.
- **Postcondition**: A run that publishes into `join(root, RESERVED_OUTPUT_DIRECTORY_NAME)` leaves `digestTree(root)` byte-identical: equal `sha256`, equal `fileCount`, equal `unreadable`. A second run over a tree whose reserved directory is already populated still satisfies its own before/after comparison.
- **Invariant**: `listTreeFiles(root, {excludedDirectoryNames: NEVER_WALKED_DIRECTORY_NAMES})`, `digestTree(root)` and `listArtefacts(root)` return no path beneath `join(root, RESERVED_OUTPUT_DIRECTORY_NAME)`, whether or not that directory exists. Asserted by planting a marker file inside it and asserting the marker appears in none of the three results.

### C003 — `analyzeProject` → the destination assertion at `scope.mjs:1579`. This is the edge whose relaxation makes the rest possible, and the edge that must stay narrow.

- **Precondition**: `out` is a non-empty string and `root` names an existing directory. The assertion runs before any stage, so a refusal costs no work and publishes nothing.
- **Postcondition**: Four cases, all asserted: `out` equal to `root` refused; `out` strictly beneath `root` and not the reserved directory refused; `out` equal to `join(root, RESERVED_OUTPUT_DIRECTORY_NAME)` accepted; `out` outside `root` accepted, as today.
- **Invariant**: Every refusal message contains the phrase `inside the target` and names both the destination and the target, so `r0-r2.test.mjs:262-269` continues to hold the general refusal while the reserved directory is the single exception.

### C004 — `holdout-ledger.mjs` (the constant) ↔ `run.mjs` (the destination) and `analysis-tech.mjs` (the two exclusion lists). A drift between the name a walk ignores and the name a run writes to is the failure this contract prevents.

- **Precondition**: The reserved directory name exists as exactly one exported binding in the library.
- **Postcondition**: The name used to build the destination equals the name tested for membership in the never-walked set and in the not-enumerated set, compared by value through the binding rather than by two literals that happen to agree.
- **Invariant**: No module other than `holdout-ledger.mjs` contains the reserved name as a string literal. Asserted by scanning the library's sources for the literal.

### C005 — `.claude/commands/workspacify-reverse.md` § `## Arguments` ↔ `run.mjs`'s `USAGE`. The document and the entrance are two renderings of one argument surface.

- **Precondition**: The command file's `## Arguments` section heads no option as a list item, and its frontmatter carries an `argument-hint` key whose value declares that there is nothing to pass.
- **Postcondition**: The analyze line of `USAGE` names no option; the `## Arguments` section names exactly the withdrawn options, in prose, as options that are refused rather than honoured; and every option the section heads as a list item is declared in `USAGE`.
- **Invariant**: The two are compared in both directions by one assertion, so neither can gain an argument the other does not declare. This is the existing assertion at `command.test.mjs:378-390`, re-derived for the new surface rather than relaxed.

## Boy Scout Rule

### Translatability plan for the code this ticket touches

**`run.mjs` — a constant that names a place the caller chose, not a place the tool lives.** `PROJECT_ROOT` (line 68) is a noun describing the wrong thing: it is the tool's own project, and it is used for exactly one purpose, the default destination. It is deleted rather than renamed, because after this change the entrance has no business knowing where it is installed. `ANALYSIS_OUTPUT_DIRECTORY` (line 117) is renamed to the reserved-directory constant and moved to `holdout-ledger.mjs`, where it sits beside the other names that decide what a walk ignores — so that the constant's *position* says what it is for.

**`run.mjs` — the analyze branch reads as prose after the change.** Today it interleaves five concerns. After it, `parseArgs`'s analyze branch reads: the subject is where you are; the destination is the reserved directory beneath it; any option this entrance once honoured and no longer does is refused. Each of those is one clause of one sentence, and each is a call rather than an expression.

**`scope.mjs` — a predicate whose name is currently a lie in one case.** `assertOutputIsOutsideTarget` (line 859) will no longer assert that; the reserved directory is beneath the target and accepted. It is renamed to say what it enforces — that the destination cannot change what is measured — and the JSDoc's justification changes from "the write path is unreachable when it points into the target" to the stronger and now-true "the write path is unreachable from every walk the run performs". A function whose name and body disagree is the defect this rule exists to catch.

**`scope.mjs` — the digest record stops being a bare boolean.** `target_digest.unmodified: true` currently reads as a claim over the whole tree. It gains the excluded directory names beside it, so a reader can translate the record into a sentence that is true: "the tree matched, over everything except the directory the run itself writes to."

**`holdout-ledger.mjs` — a comment that would become false.** `NOT_ENUMERATED_DIRECTORY_NAMES` is documented as "the one directory name the record does not enumerate at all" (`analysis-tech.mjs:45`). Adding a second makes that sentence wrong, so it is rewritten to state both and the distinct reason each is there — `.git` because it is machinery about the project, the reserved directory because it is machinery the run itself produces.

**Tests — helpers that name their assumption.** The entrance helpers (`runCli` at `command.test.mjs:62`, `runEntrance` at `command-procedure.test.mjs:110`, `runChain` at `terminal-state.test.mjs:272`) gain an explicit `cwd`, so a reader sees in the call that the subject is chosen by the test rather than inherited from the harness. A test that inherited the repository as its subject would be a test that writes into the repository.

## Test Plan

### Unit Tests

- UT: [Normal] the entrance invoked with no arguments, with `cwd` set to a disposable tree, exits 0 and publishes the full document set into `join(cwd, RESERVED_OUTPUT_DIRECTORY_NAME)`; the subject it analysed is reported as that same `cwd`
- UT: [Normal] the entrance resolves its subject from `process.cwd()` and not from the module's own location: run from a directory that is not the conver project, the published `ANALYSIS-SCOPE.json` names that directory as the root
- UT: [Error] `analyze --out=<dir>` exits non-zero, names `--out` on stderr, and writes no document; the same for `--out=<dir>` in the `--out <dir>` form
- UT: [Error] `analyze --through=r2` exits non-zero, names `--through` on stderr, and writes no document
- UT: [Error] `analyze <some-path>` exits non-zero, names the refused positional on stderr, and writes no document — a root silently ignored would be the same dropped question the entrance already refuses for `--query`
- UT: [Boundary] a destination that is the target itself is refused, and so is any destination beneath the target other than the reserved directory; both messages contain `inside the target`
- UT: [Boundary] the reserved directory beneath the target is accepted: `analyzeProject({root, out: join(root, RESERVED_OUTPUT_DIRECTORY_NAME)})` publishes rather than throwing
- UT: [Invariant] `RESERVED_OUTPUT_DIRECTORY_NAME` is a member of `NEVER_WALKED_DIRECTORY_NAMES` and of `NOT_ENUMERATED_DIRECTORY_NAMES`, asserted by identity against the exported bindings rather than against a retyped literal
- UT: [Invariant] `digestTree(root)` is byte-identical before and after a run that publishes into `join(root, RESERVED_OUTPUT_DIRECTORY_NAME)`; and a second run over the same tree, with the reserved directory already populated, still matches its own before/after digests
- UT: [Invariant] `listTreeFiles(root)` and `digestTree(root)` return no path beneath the reserved directory, whether or not it exists
- UT: [Contract C001 precondition] the entrance is invoked with `analyze` and no positional; the working directory is a readable, listable regular directory. Asserted by driving the entrance from a synthetic tree and from an absent directory
- UT: [Contract C001 postcondition] either exit 0 with the document set present in `join(cwd, RESERVED)`, or a non-zero exit with the refused token named on stderr and no document written — never a third outcome, and never a published document on a refusal
- UT: [Contract C001 invariant] no document is written outside `join(cwd, RESERVED_OUTPUT_DIRECTORY_NAME)`; asserted by hashing the tree before and after and by listing every file the run created
- UT: [Contract C002 precondition] the reserved name is in the never-walked set; asserted by identity against the exported constant
- UT: [Contract C002 postcondition] a run that publishes into the reserved directory leaves `digestTree(root)` unchanged
- UT: [Contract C002 invariant] `listTreeFiles`, `listArtefacts` and `digestTree` never descend into the reserved directory; asserted by planting a marker file inside it and asserting it appears in none of the three
- UT: [Contract C003 precondition] `out` is supplied to `analyzeProject`; the assertion runs before any stage, so a refusal costs no work
- UT: [Contract C003 postcondition] `out === root` refused, `out` strictly beneath `root` but not the reserved directory refused, `out === join(root, RESERVED)` accepted, `out` outside `root` accepted
- UT: [Contract C003 invariant] every refusal message contains `inside the target` and names both the destination and the target
- UT: [Contract C004 precondition] the reserved name is exported once, from `holdout-ledger.mjs`
- UT: [Contract C004 postcondition] the string used to build the destination equals the string in the never-walked set
- UT: [Contract C004 invariant] the literal `.` + `workspacify-reverse` appears in exactly one module of the library; asserted by scanning the library's sources
- UT: [Contract C005 precondition] the command file's `## Arguments` section heads no option as a list item
- UT: [Contract C005 postcondition] the analyze usage line in `USAGE` names no option, and the `## Arguments` section names exactly the withdrawn options
- UT: [Contract C005 invariant] the command file and the entrance are compared in both directions by one assertion, so neither can gain an argument the other does not declare

### Integration Tests

- IT: [Integration point] `run.mjs` (argument surface) → `scope.mjs` (destination assertion) → `holdout-ledger.mjs` (walk exclusion). The three are held together by one constant, and the integration test drives the entrance end to end from a disposable directory so the constant's three consumers are exercised in one run rather than three.
- IT: [Verification] the entrance run with `cwd` set to a disposable tree exits 0, publishes the full document set into `join(cwd, RESERVED_OUTPUT_DIRECTORY_NAME)`, publishes nothing outside it, and reports in `ANALYSIS-SCOPE.json` that the reserved directory was excluded from the digest; a second run over the same tree completes and its before/after digest still matches.
- IT: [Verification] the command file and the entrance agree: the `## Arguments` section declares no positional and heads no option as a list item, the analyze usage line names no option, and the withdrawn options named in prose are exactly the ones the entrance refuses. The existing both-directions assertion at `command.test.mjs:378-390` carries this, re-derived for the new surface.
- IT: [Prerequisites] a disposable tree the test owns (`createSyntheticTree`); `cwd` passed explicitly to `spawnSync` for every entrance invocation, never inherited from the test process; and the repository itself never used as a subject, so no test run leaves a reserved directory behind in it.
- IT: [Related tickets] `P22-4` added the analyze subcommand and the destination assertion; `P22-9` created the command file; `P23-1` wrote the procedure; `P25-7` added the withdrawn-option refusal this ticket extends to `--out` and `--through`; `P25-7` also moved the design-document citations this ticket re-measures.

### Plan Test Code (concrete code)

- UT: [C001 precondition] the entrance is invoked with `analyze` and nothing else, from a directory that is a readable, listable regular directory. Code:
```js
test('PX-213 / C001 precondition: analyze takes no argument and refuses every token it once honoured', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  try {
    for (const refused of [['--out=/tmp/wsp-refused'], ['--through=r2'], ['/some/other/project']]) {
      const run = runCli(['analyze', ...refused], { cwd: tree.root });
      assert.equal(run.status, 1, `${refused[0]} is not a success`);
      assert.match(run.stderr, new RegExp(refused[0].replace(/[/=.]/g, '\\$&')), 'the refused token is named');
      assert.match(run.stderr, /Nothing was published/);
      assert.equal(existsSync(join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME)), false, 'a refusal leaves no destination');
    }
  } finally { tree.dispose(); }
});
```
- UT: [C001 postcondition, success half] a bare `analyze` exits 0 and publishes the full set into `join(cwd, RESERVED_OUTPUT_DIRECTORY_NAME)`, naming that destination on stdout. Code:
```js
test('PX-213 / C001 postcondition: a bare analyze publishes beneath the directory it was run in', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  try {
    const run = runCli(['analyze'], { cwd: tree.root });
    assert.equal(run.status, 0, run.stderr);
    const destination = join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME);
    assert.equal(existsSync(join(destination, 'ORIGIN-LONG-SPEC.json')), true);
    assert.equal(existsSync(join(destination, 'ORIGIN-LONG-SPEC.md')), true);
    assert.match(run.stdout, new RegExp(RESERVED_OUTPUT_DIRECTORY_NAME.replace('.', '\\.')), 'the destination is named');
    const scope = JSON.parse(readFileSync(join(destination, 'ANALYSIS-SCOPE.json'), 'utf8'));
    assert.equal(realpathSync(scope.root), realpathSync(tree.root), 'the subject is where the command was run');
  } finally { tree.dispose(); }
});
```
- UT: [C001 postcondition, refusal half] a stage that cannot run still publishes nothing, and the refusal is raised before any stage runs. Code:
```js
test('PX-213 / C001 postcondition: a refusal publishes nothing at all', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  try {
    const run = runCli(['analyze', '--out=/tmp/wsp-refused'], { cwd: tree.root });
    assert.equal(run.status, 1);
    assert.equal(existsSync(join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME)), false);
    assert.deepEqual(publishedNames(tree.root), publishedNamesOfSubject(tree.root), 'the subject is untouched');
  } finally { tree.dispose(); }
});
```
- UT: [C001 invariant] no document is written outside the reserved directory; the path set the run created is exactly the documents it reports publishing. Code:
```js
test('PX-213 / C001 invariant: every document lands under the reserved directory and nowhere else', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const before = filePathsUnder(tree.root);
  try {
    const run = runCli(['analyze'], { cwd: tree.root });
    assert.equal(run.status, 0, run.stderr);
    const created = filePathsUnder(tree.root).filter((path) => !before.includes(path));
    assert.notEqual(created.length, 0, 'the run published something');
    for (const path of created) {
      assert.equal(path.startsWith(`${RESERVED_OUTPUT_DIRECTORY_NAME}/`), true, `${path} is outside the reserved directory`);
    }
  } finally { tree.dispose(); }
});
```
- UT: [C002 precondition] the reserved name is a member of both exclusion lists and of the rules derived from them, compared through the exported bindings. Code:
```js
test('PX-213 / C002 precondition: the reserved destination is the name no walk descends into', () => {
  assert.equal(NEVER_WALKED_DIRECTORY_NAMES.includes(RESERVED_OUTPUT_DIRECTORY_NAME), true);
  assert.equal(NOT_ENUMERATED_DIRECTORY_NAMES.includes(RESERVED_OUTPUT_DIRECTORY_NAME), true);
  assert.equal(EXCLUSION_RULES.includes(RESERVED_OUTPUT_DIRECTORY_NAME), true);
  assert.equal(Object.isFrozen(NEVER_WALKED_DIRECTORY_NAMES), true);
});
```
- UT: [C002 postcondition] `digestTree(root)` is byte-identical before and after a run that publishes into the reserved directory, and a second run over the populated tree matches its own recorded digest. Code:
```js
test('PX-213 / C002 postcondition: publishing into the reserved directory does not move the digest', async () => {
  const tree = syntheticCrateTree();
  try {
    const before = digestTree(tree.root);
    await analyzeProject({ root: tree.root, out: join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME), through: THROUGH_R2_5 });
    const after = digestTree(tree.root);
    assert.equal(after.sha256, before.sha256, 'the tree hashed the same');
    assert.equal(after.fileCount, before.fileCount);
    assert.deepEqual(after.unreadable, before.unreadable);
    const scope = JSON.parse(readFileSync(join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME, 'ANALYSIS-SCOPE.json'), 'utf8'));
    assert.equal(scope.target_digest.sha256, before.sha256, 'the record states the digest it took');
    assert.equal(scope.target_digest.unmodified, true);
    assert.deepEqual(scope.target_digest.excluded_directories, [...NEVER_WALKED_DIRECTORY_NAMES], 'the record names what the digest did not cover');
    await analyzeProject({ root: tree.root, out: join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME), through: THROUGH_R2_5 });
    assert.equal(digestTree(tree.root).sha256, before.sha256, 'a second run over the populated tree still matches');
  } finally { tree.dispose(); }
});
```
- UT: [C002 invariant] `listTreeFiles`, `digestTree` and `listArtefacts` return no path beneath the reserved directory, asserted by planting a marker file inside it. Code:
```js
test('PX-213 / C002 invariant: no walk returns a path beneath the reserved directory', () => {
  const tree = syntheticCrateTree();
  try {
    const digest = digestTree(tree.root);
    const reserved = join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME);
    mkdirSync(reserved, { recursive: true });
    writeFileSync(join(reserved, 'PLANTED.json'), '{}\n');
    assert.equal(listTreeFiles(tree.root).some((path) => path.startsWith(`${RESERVED_OUTPUT_DIRECTORY_NAME}/`)), false);
    assert.equal(digestTree(tree.root).sha256, digest.sha256, 'a file under the reserved directory does not move the digest');
    assert.equal(listArtefacts(tree.root).some((artefact) => artefact.path.startsWith(RESERVED_OUTPUT_DIRECTORY_NAME)), false);
  } finally { tree.dispose(); }
});
```
- UT: [C003 precondition] the destination assertion runs before any stage, so a refusal costs no work and creates nothing. Code:
```js
test('PX-213 / C003 precondition: the destination is judged before a stage runs', async () => {
  const tree = syntheticCrateTree();
  try {
    await assert.rejects(
      () => analyzeProject({ root: tree.root, out: join(tree.root, 'analysis'), through: THROUGH_R2_5 }),
      /inside the target/,
    );
    assert.equal(existsSync(join(tree.root, 'analysis')), false, 'a refused destination is not created');
  } finally { tree.dispose(); }
});
```
- UT: [C003 postcondition] four destinations, four verdicts: the target refused, a non-reserved path beneath it refused, the reserved directory accepted, a path outside accepted. Code:
```js
test('PX-213 / C003 postcondition: the reserved directory is the one destination beneath the target that is accepted', async () => {
  const tree = syntheticCrateTree();
  const outside = outputDirectory();
  try {
    await assert.rejects(() => analyzeProject({ root: tree.root, out: tree.root, through: THROUGH_R2_5 }), /inside the target/);
    await assert.rejects(() => analyzeProject({ root: tree.root, out: join(tree.root, 'analysis'), through: THROUGH_R2_5 }), /inside the target/);
    await analyzeProject({ root: tree.root, out: join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME), through: THROUGH_R2_5 });
    assert.equal(existsSync(join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME)), true);
    await analyzeProject({ root: tree.root, out: outside.root, through: THROUGH_R2_5 });
    assert.equal(existsSync(join(outside.root, 'ANALYSIS-SCOPE.json')), true);
  } finally { tree.dispose(); outside.dispose(); }
});
```
- UT: [C003 invariant] every refusal names both the destination and the target and contains `inside the target`, so the pre-existing guard keeps its force. Code:
```js
test('PX-213 / C003 invariant: a refusal names the target and the destination it refused', async () => {
  const tree = syntheticCrateTree();
  try {
    await assert.rejects(
      () => analyzeProject({ root: tree.root, out: join(tree.root, 'analysis'), through: THROUGH_R2_5 }),
      (error) => {
        assert.match(error.message, /inside the target/);
        assert.equal(error.message.includes(join(tree.root, 'analysis')), true, 'the destination is named');
        assert.equal(error.message.includes(tree.root), true, 'the target is named');
        return true;
      },
    );
  } finally { tree.dispose(); }
});
```
- UT: [C004 precondition / postcondition] the name is one binding, and the destination and the exclusion are that binding rather than two literals. Code:
```js
test('PX-213 / C004: the destination and the exclusion are the same binding', () => {
  const source = readFileSync(RUNNER, 'utf8');
  assert.equal(source.includes("'" + RESERVED_OUTPUT_DIRECTORY_NAME + "'"), false, 'the entrance does not retype the name');
  assert.match(source, /RESERVED_OUTPUT_DIRECTORY_NAME/, 'the entrance imports the name');
  const destinationLine = /const destination = ([^;]+);/.exec(source);
  assert.notEqual(destinationLine, null, 'the entrance builds one destination');
  assert.equal(destinationLine[1].includes('RESERVED_OUTPUT_DIRECTORY_NAME'), true);
});
```
- UT: [C004 invariant] no module other than the one that declares it contains the reserved name as a literal. Code:
```js
test('PX-213 / C004 invariant: the reserved directory name is written once in the library', () => {
  const literal = `'${RESERVED_OUTPUT_DIRECTORY_NAME}'`;
  const carriers = readdirSync(LIB_ROOT)
    .filter((name) => name.endsWith('.mjs'))
    .filter((name) => readFileSync(join(LIB_ROOT, name), 'utf8').includes(literal));
  assert.deepEqual(carriers, ['holdout-ledger.mjs'], 'one binding, not a literal retyped per consumer');
});
```
- UT: [C005 precondition] the command file's `## Arguments` section heads no option as a list item, and the frontmatter declares an entrance that takes nothing. Code:
```js
test('PX-213 / C005 precondition: the command file heads no option as an argument', () => {
  const text = readFileSync(NEW_COMMAND_PATH, 'utf8');
  assert.deepEqual(
    [...argumentsSection(text).matchAll(/^\s+- `(--[a-z-]+)/gm)].map(([, name]) => name),
    [],
    'an option the entrance refuses is named in prose, never headed as an argument',
  );
  assert.deepEqual(text.split('\n').slice(0, 5), [
    '---',
    'description: Run R0 through R8 over an existing implementation and publish the origin spec (the entrance to the reverse rotation)',
    'argument-hint: ""',
    'disable-model-invocation: true',
    '---',
  ]);
});
```
- UT: [C005 postcondition] the analyze usage line names no option, `--through` is gone from `USAGE`, and the `## Arguments` section names the withdrawn options as withdrawn. Code:
```js
test('PX-213 / C005 postcondition: the entrance and the document declare the same, empty, argument surface', () => {
  const source = readFileSync(RUNNER, 'utf8');
  const usage = /const USAGE = \[([\s\S]*?)\]\.join\('\\n'\)/.exec(source);
  assert.notEqual(usage, null, 'the entrance declares its options in one block');
  const declared = new Set([...usage[1].matchAll(/--[a-z-]+/g)].map(([name]) => name));
  assert.equal(declared.has('--through'), false, 'the entrance no longer declares --through');

  const analyzeLine = /'  analyze([^']*)'/.exec(source);
  assert.notEqual(analyzeLine, null, 'the entrance declares how analyze is invoked');
  assert.deepEqual([...analyzeLine[1].matchAll(/--[a-z-]+/g)].map(([name]) => name), [], 'analyze takes no option');

  const section = argumentsSection(readFileSync(NEW_COMMAND_PATH, 'utf8'));
  for (const withdrawn of ['--out', '--through', '--query']) {
    assert.equal(section.includes(withdrawn), true, `${withdrawn} is named as withdrawn rather than dropped`);
  }
  assert.match(section, /current working directory/i, 'the subject is stated');
  assert.match(section, new RegExp(RESERVED_OUTPUT_DIRECTORY_NAME.replace('.', '\\.')), 'the destination is stated');
});
```
- UT: [C005 invariant] the command file and the entrance are compared in both directions by one assertion, so neither gains an argument the other does not declare. Code:
```js
test('PX-213 / C005 invariant: neither the document nor the entrance declares an argument the other does not', () => {
  const section = argumentsSection(readFileSync(NEW_COMMAND_PATH, 'utf8'));
  const documented = new Set([...section.matchAll(/^\s+- `(--[a-z-]+)/gm)].map(([, name]) => name));
  const source = readFileSync(RUNNER, 'utf8');
  const usage = /const USAGE = \[([\s\S]*?)\]\.join\('\\n'\)/.exec(source);
  const declared = new Set([...usage[1].matchAll(/--[a-z-]+/g)].map(([name]) => name));
  assert.deepEqual([...documented].filter((name) => !declared.has(name)), [], 'the document documents no option the entrance does not declare');
  const analyzeLine = /'  analyze([^']*)'/.exec(source);
  assert.deepEqual(
    [...new Set([...analyzeLine[1].matchAll(/--[a-z-]+/g)].map(([name]) => name))].filter((name) => !documented.has(name)),
    [],
    'the entrance accepts no option on analyze that the document does not carry',
  );
});
```
- IT: [integration] the entrance, the destination assertion and the walk exclusion are exercised in one end-to-end run from a disposable directory, and the repository is never the subject. Code:
```js
test('PX-213 / IT: an end-to-end run from a disposable tree publishes, and the repository is never its subject', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  try {
    const run = runCli(['analyze'], { cwd: tree.root });
    assert.equal(run.status, 0, run.stderr);
    const destination = join(tree.root, RESERVED_OUTPUT_DIRECTORY_NAME);
    assert.deepEqual(
      publishedNames(destination),
      publishedNames(join(PROJECT_ROOT, 'tests', 'workspacify-reverse', 'analysis')),
      'the published set is the same shape wherever it lands',
    );
  } finally { tree.dispose(); }
  assert.equal(
    existsSync(join(PROJECT_ROOT, RESERVED_OUTPUT_DIRECTORY_NAME)),
    false,
    'a test that inherited the repository as its cwd would publish into it',
  );
});
```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| `run.mjs analyze <root> [--through=<stage>] [--out=<dir>]` — the subject was the positional root and the destination defaulted to `join(PROJECT_ROOT, 'tests/workspacify-reverse/analysis')`, i.e. into the conver project regardless of where the command was run. | `run.mjs analyze` — no arguments. The subject is `process.cwd()` and the destination is `join(process.cwd(), RESERVED_OUTPUT_DIRECTORY_NAME)`. `PROJECT_ROOT` and `ANALYSIS_OUTPUT_DIRECTORY` are deleted, along with the now-unused `resolve` and `fileURLToPath` imports. | The entrance names its own subject and destination. Measured before the change: `analyze . --out=.` exited 1 with "the output directory ... is inside the target .", so the two defaults were load-bearing against each other — publishing beneath the subject is legal only where no walk descends. |
| `--out` and `--through` were honoured; only `--query` was withdrawn. `withdrawnOptionsUsed` returned option NAMES, so a refusal reported `--through` but never the stage the caller asked for. | `--out` and `--through` join `WITHDRAWN_OPTIONS` with the reason each left, and `withdrawnOptionsUsed` returns the TOKEN the caller wrote, so `--through=r99` is refused with `r99` named. `VALUE_TAKING_FLAGS` drops `--through` (`--out` stays for `spike`). A bare positional is refused by the new `refusePositionalArguments`, which names it. `ROOT_TAKING_SUBCOMMANDS` drops `analyze`. | An option the entrance once honoured and no longer does is refused by name rather than ignored — the rule P25-7 established for `--query`, applied to the two options this ticket removes. A dropped question reads as a question answered. |
| `NEVER_WALKED_DIRECTORY_NAMES = ['target', '.git']` and `NOT_ENUMERATED_DIRECTORY_NAMES = ['.git']`, both as literals, with no notion of a directory a run writes to. | `RESERVED_OUTPUT_DIRECTORY_NAME = '.workspacify-reverse'` is exported from `holdout-ledger.mjs` and is a member of both sets, so `digestTree`, `listTreeFiles`, `detectPrimaryLanguage`, `EXCLUSION_RULES` and the artefact walk all inherit the exclusion from one binding. `analysis-tech.mjs`'s "the one directory name" doc comment is rewritten to name both and the distinct reason each is there. | The destination and the walk exclusion are the same value rather than two literals that agree today. This is what makes a destination beneath the subject provable rather than merely convenient: writing there cannot change anything the run measured. |
| `assertOutputIsOutsideTarget(out, root)` refused every destination equal to or beneath the target, and the name asserted something the body no longer would. | `assertOutputCannotChangeWhatIsMeasured(out, root)` accepts exactly `join(target, RESERVED_OUTPUT_DIRECTORY_NAME)` and refuses everything else beneath the target, keeping the `inside the target` wording the existing guard matches on. The JSDoc's justification changes from "the write path is unreachable when it points into the target" to the stronger and now-true "unreachable from every walk the run performs". | The relaxation is one path wide, and the existing test that refuses `join(root, 'analysis')` stays green — which is the check that the exception is narrow rather than a removal. |
| `ANALYSIS-SCOPE.json`'s `target_digest` recorded `{sha256, file_count, unreadable_paths, unmodified: true}` — a claim that read as a statement about the whole tree. | `target_digest` gains `excluded_directories: [...NEVER_WALKED_DIRECTORY_NAMES]`, so a digest over a tree one directory smaller says which directory it did not cover. | The same argument the record already made about unreadable entries, one level up: a shorter walk must not be readable as a claim over all of it. |
| `argument-hint: <path-to-the-project-root>`; an Arguments section documenting a required positional root, `--out` and `--through` as options; Step 2 and Step 3 invoking `analyze "$ARGUMENTS" --out=<...>`; Step 3 claiming `--through` is the only prefix instrument; two error-recovery entries offering a destination choice and a `--through` ladder. | `argument-hint: ""`; the Arguments section states that the entrance takes no arguments, that the subject is the current working directory and the destination the reserved directory beneath it, and names `--out`, `--through` and `--query` in prose as withdrawn. Step 2 and Step 3 show the argument-free invocation. Step 3 states that there is no command-line prefix instrument and that the `analyzeProject` API's `through` is where a prefix lives. Error recovery names where the documents are and why no prefix is available. | The document and the entrance are two renderings of one argument surface, and both directions of that agreement are asserted by one test. The withdrawn options are named in prose rather than headed as list items, which is the convention the existing guard reads. |
| Eleven CLI call sites passed a positional root and `--out=<scratch>`; `runCli`, `runEntrance`, `runChain` inherited the harness's working directory. | Every entrance invocation names its `cwd` — a disposable or synthetic tree, never the repository — and reads the documents from `join(cwd, RESERVED_OUTPUT_DIRECTORY_NAME)`. `runCli`, `runEntrance` and both `runChain` helpers take a `cwd`. New file `tests/workspacify-reverse/integration/argument-surface.test.mjs` holds contracts C001–C005 in fourteen tests. `configuredRepresentativeRun` now asserts the analysis reached the exit before the chain is measured over it. | A test that inherited the repository as its subject would publish into the repository. The final test in the new file asserts no reserved directory is left in it. The helper assertion replaces an ENOENT deep inside a graph reader — a failure that named nothing about what actually refused. |
| `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md` restated the old invocation, cited `scope.mjs:1929` and `scope.mjs:1791-1797`, called `--through` the only prefix instrument, and quoted `ROOT_TAKING_SUBCOMMANDS = ['detect','scrub','verify','analyze']` at `run.mjs:80`. | The invocation, the three mechanical facts and the §5.7 table row are rewritten to the new contract; the four anchored citations are re-measured to `scope.mjs:1946`, `scope.mjs:1805-1809`, `run.mjs:77` and `command.test.mjs:147`/`:155` rather than adjusted to fit. | The design document rests its argument on file:line pointers, and `design-citations.test.mjs` fails by token so a moved definition is reported as moved. |
| The repository-root and `crates/siprs` copies of the library lagged the source; the drift guard reported three differing modules and the record's lists were empty. | Both copies are re-synced through the sanctioned installer, which is digest-based and updated exactly the four changed files plus the install state; the copies' `run.mjs`, which the installer does not manage and which would otherwise have left each copy documenting an argument-free entrance while its own entrance demanded a root, is brought to the source of record afterwards — the same follow-up P25-7 performed. Both copies are now byte-identical to the source, and `installed-copy-drift.test.mjs` passes with its record still empty. | A copy whose document and instrument disagree is not lagging, it is inconsistent. |

## Notes in Prior Implementation Rounds

- [Implementation steps] (1) Add `RESERVED_OUTPUT_DIRECTORY_NAME` to `holdout-ledger.mjs` and wire it into both exclusion lists. (2) Relax `scope.mjs`'s destination assertion to accept exactly that one path beneath the target, keeping the `inside the target` wording, and record the exclusion in `ANALYSIS-SCOPE.json`. (3) Rewrite `run.mjs`'s `analyze` branch, `ROOT_TAKING_SUBCOMMANDS`, `WITHDRAWN_OPTIONS`, `VALUE_TAKING_FLAGS`, `USAGE`, and remove `ANALYSIS_OUTPUT_DIRECTORY` and the now-dead `PROJECT_ROOT`. (4) Rewrite the command file. (5) Re-point the tests that drive the entrance. (6) Re-measure the three design-document citations. (7) Run only the affected suites; the full suite is not a per-step instrument.
- [Risks] The largest risk is a test that inherits the repository as its `cwd` and leaves a reserved directory in the working tree, which would show up as an untracked path and could be mistaken for a fixture. Every entrance invocation in the suite must pass `cwd` explicitly. The second is the design-document citations: `design-citations.test.mjs` resolves three line numbers this change moves, and it fails by token, so a careless edit reports a moved definition rather than a wrong number.
- [Caveats] Removing `--through` from the command line removes the only command-line way to see a prefix, and the procedure's Step 2 and its error-recovery entry both rested on it. The API keeps the parameter, so the capability is not lost, but the command file must stop claiming a command-line instrument it no longer has — and must say where the capability now lives rather than dropping the subject in silence.
- [Open items] Whether the committed `tests/workspacify-reverse/analysis/` should be refreshed from a new run, or kept as the record of the runs that produced it. This ticket keeps it: seven test files read it as a fixture and one asserts its entry count against the design document. Refreshing it is a separate decision with its own blast radius.
- [Future improvements] `spike` still takes both a positional root and `--out`. If the argument surface is to be unified, that is the next candidate, and the reserved-directory mechanism added here is what it would reuse.
## Implementation summary (PX-213)

### Changed files
Source of record (`tools/conver`): `.claude/scripts/workspacify-reverse/run.mjs`, `lib/scope.mjs`, `lib/holdout-ledger.mjs`, `lib/analysis-tech.mjs`, `.claude/commands/workspacify-reverse.md`, `tests/workspacify-reverse/integration/command.test.mjs`, `command-procedure.test.mjs`, `terminal-state.test.mjs`, `decisions-authoring.test.mjs`, `tests/workspacify-reverse/integration/argument-surface.test.mjs` (new), `tests/conventions/design-citations.test.mjs`, `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md`. Installed copies re-synced: `.claude/` and `crates/siprs/.claude/` (4 files + install state each).

### Key changes
- The entrance takes no arguments. Subject = `process.cwd()`, destination = `join(process.cwd(), '.workspacify-reverse')`, both derived, neither selectable.
- The reserved name is a single exported binding that is also a member of `NEVER_WALKED_DIRECTORY_NAMES` and `NOT_ENUMERATED_DIRECTORY_NAMES`, so the destination and the exclusion cannot drift.
- `assertOutputIsOutsideTarget` → `assertOutputCannotChangeWhatIsMeasured`, accepting exactly the reserved directory beneath the target and refusing every other path beneath it.
- `--out` and `--through` are withdrawn and refused by name, with the whole token reported; a bare positional is refused the same way. `--through` remains on the `analyzeProject` API.
- `ANALYSIS-SCOPE.json`'s `target_digest` names the directories the digest did not cover.

### Test results
- `tests/workspacify-reverse/unit/*.test.mjs` — 798 pass, 0 fail.
- `argument-surface.test.mjs` (new) — 14 pass, 0 fail.
- `command.test.mjs` + `command-procedure.test.mjs` + `unit/r0-r2.test.mjs` — 198 pass, 0 fail.
- `terminal-state.test.mjs` — 9 pass, 0 fail, 2 skipped (representative-dependent, unchanged).
- `decisions-authoring.test.mjs` — 4 pass, 0 fail.
- `tests/conventions/*.test.mjs` — 51 pass, 3 fail.
- Full `tests/workspacify-reverse` suite via `run-tests.mjs` — see the run recorded below.

### Pre-existing failures, out of scope and measured as such
`tests/conventions/derived-artefacts.test.mjs` fails 3 assertions about `.claude/scripts/lib/__pycache__/ecc_dashboard_runtime.cpython-314.pyc`, a path that is untracked and whose parent directory does not exist. Verified pre-existing by running the same file in a clean `git worktree` at HEAD (`586fe61e`), where the same three fail. Unrelated to this ticket's tree.

### Assumptions recorded
1. The destination is a reserved subdirectory of the working directory rather than the working directory itself. Publishing directly into it cannot be made sound: the next run would measure its own output, and the artefact walk would carry the run's own documents into `SCOPE-BOUNDARY.json` as material it had declined to measure. `cwd/.workspacify-reverse/` satisfies "the documents are where you ran the command" while keeping the read-only guarantee provable.
2. The copies' `run.mjs` was brought to the source of record by hand after the installer. The installer does not manage that path, and leaving it would have left each copy documenting an argument-free entrance while its own entrance demanded a root.
3. `argument-hint` keeps its key with an empty value rather than being removed, because `assertCommandFileStructure` requires the key to be present.

### Remaining risks
- `--through` is gone from the command line, so the procedure lost its diagnostic ladder. Step 3 and the error-recovery section now say so and name the API as where a prefix lives, rather than dropping the subject.
- The committed `tests/workspacify-reverse/analysis/` is now the record of the runs that produced it and is no longer refreshed by a run in this directory. Seven test files read it as a fixture and `design-measurements.test.mjs` asserts its entry count against the design document. Refreshing it is a separate decision with its own blast radius.

## PX-213 — implemented at 29 locations

### .claude/scripts/workspacify-reverse/lib/analysis-tech.mjs

- Line 66
```
export const NOT_ENUMERATED_DIRECTORY_NAMES = Object.freeze(['.git', RESERVED_ROOT_NAME]);
```

### .claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs

- Line 45
```
import {
```

- Line 84
```
export const NEVER_WALKED_DIRECTORY_NAMES = Object.freeze([
```

### .claude/scripts/workspacify-reverse/lib/scope.mjs

- Line 871
```
function assertOutputCannotChangeWhatIsMeasured(out, root) {
```

### .claude/scripts/workspacify-reverse/run.mjs

- Line 114
```
function withdrawnOptionsUsed(optionArgs) {
```

- Line 124
```
function refuseWithdrawnOptions(withdrawn) {
```

- Line 140
```
function refusePositionalArguments(positionals) {
```

- Line 245
```
function commonOptions(subcommand, optionArgs) {
```

- Line 288
```
function parseSpikeArguments(second, rest, argv) {
```

- Line 316
```
function parseArgs(argv) {
```

- Line 374
```
function reportStage({ stage, input, error }) {
```

- Line 402
```
async function runAnalysisPipeline({ root, through, out }) {
```

- Line 755
```
async function main() {
```

### tests/conventions/design-citations.test.mjs

- Line 47
```
// [::TICKET::] PX-214 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-214 --for-spec --no-implementation-order`.
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

### tests/workspacify-reverse/integration/command-procedure.test.mjs

- Line 101
```
function runEntrance(args, cwd) {
```

### tests/workspacify-reverse/integration/command.test.mjs

- Line 62
```
function runCli(args, { path, cwd } = {}) {
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
