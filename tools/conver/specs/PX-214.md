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

# Target ticket is PX-214: The reverse rotation's arguments are hidden inside the instrument: one reserved root, no derivable flag

**Ticket Key**: PX-214 · **Phase**: -1

---

## Background

The workspacify family's argument surface is inconsistent between its commands, and each inconsistency is a place where the running AI must remember a fact the scripts already know.

### Goal
Every argument of the reverse rotation that is derivable from the directories the rotation already uses leaves the command line and is derived inside the instrument. One exported reserved root yields both the destination an analysis publishes into and the directory name no walk descends into, and that destination becomes `workspacify/reverse` beneath the working directory.

### Purpose
The family is driven by a running AI, and every argument it must supply is a fact it must remember correctly and spell consistently. The reverse rotation's inputs are the reverse analysis's own outputs, and today the caller re-names each of them on the next command line — so the failure mode is not a missing value but a *differently named* one, which the gates then report as an absent measurement rather than as a mistyped path. Deriving them removes the class of error rather than the instance.

### Motivation
PX-213 established that the reverse entrance takes no arguments: its subject is the working directory and its destination is a reserved directory beneath it. The rest of the family contradicts that. `workspacify-tree reverse` takes three required and five optional flags; `workspacify-allocate reverse` takes two; and the reserved destination is a dotted name chosen before the family had a shared output root. All four patterns in `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md` describe one rotation entered the same way, so a different argument posture per command is precisely where the AI's recollection diverges from what the scripts know.

### Constraints
1. **The fifth layer must stay at the workspace root.** §2.2 places `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json`, `ARCHITECTURE-DELTA.json` and `DesignTree.json` beside the ROOT package's own four layers, §2.1 makes that root itself a package (path `.`), and `workspacify-allocate/run.mjs:90` makes `workspaceRoot = dirname(manifestPath)`. Moving them would create the generated workspace inside the reserve and break all four patterns. The reserve may therefore hold only the documents a command writes for itself.
2. **The exclusion is matched by directory name, at any depth.** `holdout-ledger.mjs:245` is `if (excluded.has(entry)) continue;` inside a recursive walk, where `entry` is one `readdirSync` name. Excluding `workspacify/reverse` is therefore expressible only as excluding the name `workspacify`, which widens the net. That widening must be recorded, not silent.
3. **`MEASURED_TREE_EXCLUSIONS` must not gain the name.** `structure-parity.mjs:34-43` carries its own contract: "A name that can also be a real source directory must not appear here". The two exclusion lists are governed by opposite principles and this ticket touches only the first.
4. **Parameters stay on the API where they leave the command line**, the precedent PX-213 set with `through`.

## Scope

- **Scope of changes (describe each change comprehensively):**
- `.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs` | modify | `RESERVED_OUTPUT_DIRECTORY_NAME` becomes a reserved ROOT: `RESERVED_ROOT_NAME = 'workspacify'`, `RESERVED_REVERSE_SUBDIRECTORY = 'reverse'`, and `reservedReverseDirectory(root)` joining them; `NEVER_WALKED_DIRECTORY_NAMES` and `NOT_ENUMERATED_DIRECTORY_NAMES` both carry `RESERVED_ROOT_NAME` — the root, not the subdirectory, because the match is a directory name at any depth and `workspacify` is already never walked, so naming `reverse` as well would add a second generic name to the global list for no gain | before: `RESERVED_OUTPUT_DIRECTORY_NAME = '.workspacify-reverse'` as one flat name | after: one root, two derived values, one join helper, and a doc comment that states the widened match (a directory name at any depth) instead of implying a fixed path; `NOT_ENUMERATED_DIRECTORY_NAMES` names the root rather than the subdirectory | api: the removed export is replaced by the three new ones and no consumer imports the old name | schema: `ANALYSIS-SCOPE.json`'s `target_digest.excluded_directories` now names `workspacify` | config: none | dep: none
- `.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs` | modify | `EXCLUSION_RULES` and `NOT_ENUMERATED_DIRECTORY_NAMES` are re-derived from the new binding, and the doc comment that names "the one directory name" is rewritten to name the root and the subdirectory with the distinct reason each is there | before: two literals carrying the dotted name | after: the root and the subdirectory sourced from `holdout-ledger.mjs` | api: unchanged | schema: none | config: none | dep: none
- `.claude/scripts/workspacify-reverse/lib/scope.mjs` | modify | `assertOutputCannotChangeWhatIsMeasured` accepts exactly `reservedReverseDirectory(target)` beneath the target and refuses everything else beneath it, keeping the `inside the target` wording the existing guard matches on | before: `join(target, RESERVED_OUTPUT_DIRECTORY_NAME)` | after: the derived destination, one path wide | api: unchanged | schema: none | config: none | dep: none
- `.claude/scripts/workspacify-reverse/run.mjs` | modify | `analyze` publishes into `reservedReverseDirectory(process.cwd())`; `detect`, `scrub` and `verify` lose their positional root and take the working directory, so `ROOT_TAKING_SUBCOMMANDS` empties; `spike`'s `--out` joins the withdrawn options | before: three subcommands named a subject and `spike` chose a destination | after: no subcommand names its subject; every withdrawn token is refused by name with the whole token reported | api: `analyzeProject` keeps `root`, `out` and `through` | schema: none | config: none | dep: none
- `.claude/scripts/workspacify-tree/run.mjs` | modify | `runReverse` loses `--spec`, `--graph`, `--measured`, `--sidecars`, `--root`, `--delta`, `--out` and `--prior-partition`; each is derived from the working directory and the reserve, and an absent artefact keeps its present meaning (`undefined` for `readGraphNodes`/`readMeasuredEdges`, `[]` for `listSidecarFiles`); `printUsage()` states the derived invocation | before: three required flags and five optional ones | after: none; the subject is the working directory | api: `runReverseGates` and `prepareForwardPipeline` keep their parameters so the fixtures can still measure a tree other than the cwd | schema: none | config: none | dep: none
- `.claude/scripts/workspacify-allocate/run.mjs` | modify | `reverse` loses `--root`; the stage-1 manifest is read from the working directory | before: `--root=<dir> --decisions=<path>` | after: the subject is the working directory | api: unchanged | schema: none | config: none | dep: none
- `.claude/commands/workspacify-reverse.md`, `.claude/commands/workspacify-tree.md`, `.claude/commands/workspacify-allocate.md` | modify | the argument sections, the step invocations and the script tables are rewritten to the derived surface; every withdrawn flag is named as withdrawn in prose rather than headed as a list item, which is the convention `assertCommandFileStructure` and the existing guard read | before: the reverse rotation's invocation lists eight flags | after: it lists none, and the derivation is stated | api: none | schema: none | config: none | dep: none
- `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md` | modify | the reverse destination paragraph names `workspacify/reverse`; §2.2 gains the sentence that the reserved root holds documents only and that the fifth layer stays at the workspace root | before: `.workspacify-reverse` | after: `workspacify/reverse` | api: none | schema: none | config: none | dep: none
- `.claude/` and `crates/siprs/.claude/` installed copies | modify | re-synced through `node tools/conver/install.js -t <target> --no-install-deps`, and `run.mjs` hand-copied where the installer does not manage the path | before: the copies carry the dotted name | after: byte-identical to the source of record | api: none | schema: none | config: the install state is rewritten by the installer | dep: none
- **Out of scope (items intentionally excluded, with justification):**
- Moving the fifth layer beneath the reserved root | It would break all four patterns. §2.2 places the four fifth-layer artefacts at the workspace root beside the ROOT package's four layers, §2.1 makes that root a package (path `.`), and `workspacify-allocate/run.mjs:90` derives the generated workspace's root as `dirname(manifestPath)`. Hiding the manifest away would create the workspace inside the reserve.
- Standardising the decisions JSON path | PX-215. The reserve this ticket introduces is the prerequisite; the forward rotation's half is the next ticket.
- Adding `workspacify` to `MEASURED_TREE_EXCLUSIONS` | That list's own contract forbids it: `structure-parity.mjs:34-43` states that a name which can also be a real source directory must not appear there, because excluding it would shrink T2's population in silence. A directory holding only `.json`/`.md` needs no entry — `measureDirectoryTree` records only directories directly holding a source-extension file.
- Teaching `listTreeFiles` to exclude by root-relative path | The alternative mitigation for the widened name. It touches the primitive shared by `scope.mjs`, `sandbox.mjs`, `oracle-bundle.mjs` and `isolation-check.mjs`, which is a larger change than this ticket's subject; the recorded exclusion in `ANALYSIS-SCOPE.json` is the mitigation taken here.
- Refreshing the committed `tests/workspacify-reverse/analysis/` | Seven test files read it as a fixture and `design-measurements.test.mjs` asserts its entry count against the design document. Refreshing it is a separate decision with its own blast radius.
- **Affected areas (components/systems impacted, even without direct modification):**
- `tests/workspacify-reverse` (80 files), `tests/workspacify-tree` (46), `tests/workspacify-allocate` (38) | API surface | Y — every CLI call site that passed a subject or a destination is re-pointed at the working directory, and the fixtures that must measure a tree other than the cwd drive the API instead. Thirteen tree test files read the manifest as `join(<scratch>, 'WORKSPACIFY-TREE-MANIFEST.json')` and are unaffected, because the manifest stays where it was.
- `.claude/` and `crates/siprs/.claude/` installed copies | API surface / data format | Y — re-synced through the sanctioned installer, then `run.mjs` hand-copied, the follow-up P25-7 performed for the same reason: a copy documenting an argument-free entrance while its own entrance demands flags is not lagging, it is inconsistent.
- `siprs-with-4layers/` and `siprs-for-reverse/` representative trees | data format | N — they are measured, never written. The read-only guarantee is exactly what the before/after digest asserts, and this ticket strengthens the reserve it writes into rather than the trees.
- `tests/conventions/design-citations.test.mjs` | none | Y — the design document's anchored `file:line` citations are re-measured after the annotations, because the guard fails by token and reports a moved definition rather than a wrong number.

## Implementation Target Files

- `.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs`
- `.claude/scripts/workspacify-reverse/lib/scope.mjs`
- `.claude/scripts/workspacify-reverse/run.mjs`
- `.claude/scripts/workspacify-tree/run.mjs`
- `.claude/scripts/workspacify-allocate/run.mjs`
- `.claude/commands/workspacify-reverse.md`
- `.claude/commands/workspacify-tree.md`
- `.claude/commands/workspacify-allocate.md`

## Investigation

- `holdout-ledger.mjs:46` exports `RESERVED_OUTPUT_DIRECTORY_NAME = '.workspacify-reverse'`; lines 52-56 place it in `NEVER_WALKED_DIRECTORY_NAMES` alongside `'target'` and `'.git'`. Line 245 is `if (excluded.has(entry)) continue;` inside the recursive `walk`, where `entry` is a single `readdirSync` name — so the exclusion matches a directory NAME at any depth, never a path. This is the fact that makes "exclude `workspacify/reverse`" inexpressible as anything narrower than "exclude `workspacify`".
- `analysis-tech.mjs:44-53` builds `EXCLUSION_RULES` as `[...NEVER_WALKED_DIRECTORY_NAMES, ...DEPENDENCY_DIRECTORY_NAMES]` and holds `NOT_ENUMERATED_DIRECTORY_NAMES = ['.git', RESERVED_OUTPUT_DIRECTORY_NAME]`; its comment distinguishes "not walked but enumerated" from "not enumerated at all".
- `scope.mjs:1854` records `excluded_directories: [...NEVER_WALKED_DIRECTORY_NAMES]` inside `ANALYSIS-SCOPE.json`'s `target_digest`, which is the record that turns a widened exclusion from silent into declared. The destination assertion accepts exactly `join(target, RESERVED_OUTPUT_DIRECTORY_NAME)`.
- `workspacify-tree/run.mjs:237-243` publishes `finalize` to `process.cwd()` with no option and says so in a comment; `:408-421` is `runReverse`, requiring `--spec`, `--decisions` and `--root` and optionally reading `--out`, `--delta`, `--graph`, `--measured`, `--sidecars`, `--prior-partition`; `:974-986` is `printUsage()`, the single declaration of the surface.
- `workspacify-tree/run.mjs:617-639` `listSidecarFiles` returns `[]` for an absent directory and throws for one that does not exist; `:640-666` `readMeasuredEdges` and `:666-690` `readGraphNodes` return `undefined` for an absent path. Their comments state that an omitted measurement and an empty one are different claims which T3 and T4 must be able to distinguish — the constraint that makes the derivation a lookup rather than a default.
- `workspacify-allocate/run.mjs:88-90` is `const manifestDir = path.dirname(absPath)`, and `:385`, `:492`, `:504`, `:507` all pass `workspaceRoot: manifestDir` — the manifest's directory IS the generated workspace's root.
- `workspacify-allocate/lib/tree-manifest-input.mjs` `readManifestSource` resolves `input.spec_path` against `manifestDir`, refuses when `!isPathContained(manifestDir, resolvedSpec)`, and requires the re-hash to equal `input.source_hash`; `gate-advice.mjs:34` states the same as operator advice: "Keep the original specification next to the manifest, unmodified, under the name recorded in input.spec_path."
- `workspacify-tree/lib/structure-parity.mjs:34-43` is `MEASURED_TREE_EXCLUSIONS`, whose own comment forbids a name that can also be a real source directory ("`build/` is the trap"); `:105-138` `measureDirectoryTree` records only directories that DIRECTLY contain a file in `SOURCE_FILE_EXTENSIONS` (`:46-63`). A directory holding only `.json` and `.md` is therefore invisible to T1 and T2 and needs no exclusion entry — which is why `.workspacify-reverse` is absent from that list today.
- `workspacify-reverse/lib/terminal-state.mjs:75-105` `TERMINAL_ARTEFACTS.fifthLayer` names the four root-level fifth-layer artefacts, and `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md` §2.1-§2.3 states the same in prose while §2.2 draws the layout.
- Argument surfaces measured today: reverse `analyze` = 0 (PX-213); tree `reverse` = 3 required + 5 optional; allocate `reverse` = 2. Both command files still instruct the operator to create the decisions JSON "outside the specification's directory (for example in `os.tmpdir()`)" — a free choice made twice per run.
- Suite sizes: `tests/workspacify-reverse` 80 test files, `tests/workspacify-tree` 46, `tests/workspacify-allocate` 38; 17 of the tree and allocate files spawn a CLI with a `cwd`, and 13 tree files read the manifest as `join(<scratch>, 'WORKSPACIFY-TREE-MANIFEST.json')`.

## Acceptance Criteria

- **[Happy path]** With the working directory set to a project, `node .claude/scripts/workspacify-reverse/run.mjs analyze` exits 0 and publishes into `workspacify/reverse` beneath it; `node .claude/scripts/workspacify-tree/run.mjs reverse`, run in that same directory with no flags at all, reads the origin spec, the graph, the measured edges and the sidecars from that reserve and reaches a verdict.
- **[Error case]** Every option the entrance and the reverse rotation once honoured is refused by name with the token reported on stderr and nothing published; and a destination beneath the target that is not the reserve is still refused with a message containing `inside the target`, naming both the target and the refused destination.
- **[Edge case]** A tree that already holds a populated reserve is analysed again and its before/after digest still matches, because no walk descends into the reserve; and the fifth layer is still published at the workspace root rather than beneath the reserve, so T1 and T2 see exactly the directories they saw before.

## Invariants

- [Normal condition] For a fixed working directory and a fixed tree, the reverse rotation reaches the same verdict from the directory alone; nothing the caller passes can move the subject or the destination.
- [Error invariant] A refusal names the refused token and publishes nothing, and no refusal creates the destination directory. A refusal is still a refusal when it is the second run over a tree whose reserve is already populated.
- [Internal state invariant] The name a run writes to and the directory name every walk skips are derived from one exported binding, so a change to one cannot leave the other behind; the entrance imports the name rather than spelling it.
- [Boundary invariant] The reserve holds documents only: no published file carries an extension from `SOURCE_FILE_EXTENSIONS`, so `measureDirectoryTree` records no directory beneath it and T1/T2 are untouched by a populated reserve.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — workspacify-reverse/run.mjs::analyze -> holdout-ledger.mjs::RESERVED_ROOT_NAME

- **Precondition**: The entrance takes no argument. Every token it once honoured (`--out`, `--through`, `--query`) and every bare positional is refused by name with exit 1, the refused token reported on stderr, nothing published and no reserve directory created.
- **Postcondition**: Run with `cwd` set to a tree, `analyze` exits 0, publishes the origin spec and its sidecars under `join(cwd, RESERVED_ROOT_NAME, RESERVED_REVERSE_SUBDIRECTORY)`, and prints that destination on stdout. `ANALYSIS-SCOPE.json`'s `root` realpaths to the same `cwd`.
- **Invariant**: Every file the run creates beneath the subject lies under the reserved reverse directory, and no other path is written: the set difference of the walk before and after the run is a subset of that directory.

### C002 — holdout-ledger.mjs::NEVER_WALKED_DIRECTORY_NAMES -> analysis-tech.mjs::EXCLUSION_RULES

- **Precondition**: `RESERVED_ROOT_NAME` is exported once from `holdout-ledger.mjs`. `NEVER_WALKED_DIRECTORY_NAMES` contains it, `NOT_ENUMERATED_DIRECTORY_NAMES` contains it too, and both are the values the walk, the artefact walk and the capability detector consume. The reverse subdirectory is NOT named in either list: the match is a directory name at any depth, so naming the root already covers everything beneath it, and naming `reverse` separately would add a second generic name to a global list for no gain.
- **Postcondition**: `digestTree(root).sha256` is unchanged by a run that publishes into the reserve, and is unchanged again when the reserve is already populated from a previous run. `ANALYSIS-SCOPE.json`'s `target_digest.excluded_directories` names the directories the digest did not cover.
- **Invariant**: The name a run writes to and the name a walk skips are derived from one binding, so they cannot drift; the literal `'workspacify'` appears in exactly one file under `lib/` and the entrance does not retype it.

### C003 — scope.mjs::assertOutputCannotChangeWhatIsMeasured

- **Precondition**: The destination assertion is evaluated before any stage runs, over the resolved realpaths of the nearest existing ancestor of each of the destination and the target.
- **Postcondition**: Exactly one destination beneath the target is accepted — `join(target, RESERVED_ROOT_NAME, RESERVED_REVERSE_SUBDIRECTORY)` — and everything else beneath it is refused with a message that contains `inside the target` and names both the target and the refused destination. A destination outside the target is accepted as before.
- **Invariant**: The exception is one path wide: an unrecorded directory beneath the target is still refused, so the guard proves a narrowing rather than a removal.

### C004 — workspacify-tree/run.mjs::runReverse -> holdout-ledger.mjs::reservedReverseDirectory

- **Precondition**: `workspacify-tree reverse` and `workspacify-allocate reverse` declare no derivation input on their command lines. Their subject is the working directory, and the origin spec, the graph, the measured edges, the sidecars, the delta path and the output directory are derived from it and the reserve.
- **Postcondition**: A run in a directory whose reserve holds an analysis reaches a verdict comparable to the one the same tree produced when those inputs were passed; a second identical run reaches the same verdict. The verdict is a function of the tree and the reserve alone.
- **Invariant**: An absent derivation input keeps its present meaning and does not collapse into an empty one: `readGraphNodes` and `readMeasuredEdges` return `undefined` for an absent artefact (so T3/T4 name it) while an empty artefact may pass. The derivation is a lookup, never a default.

### C005 — terminal-state.mjs::TERMINAL_ARTEFACTS.fifthLayer -> docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md §2.2

- **Precondition**: The reserved root exists beneath the working directory. The fifth layer is published at the workspace root, because §2.1 makes that root a package (path `.`) and §2.2 draws the fifth layer beside its four layers.
- **Postcondition**: After a tree `finalize` and an allocate `finalize` in one directory, `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json` and `ARCHITECTURE-DELTA.json` are found at the workspace root, and the reserve holds no file of those names.
- **Invariant**: No file published beneath the reserve carries an extension from `SOURCE_FILE_EXTENSIONS`, so `measureDirectoryTree` records no directory there and the fifth layer's position is the only thing that keeps T1/T2 unchanged.

## Boy Scout Rule

- `holdout-ledger.mjs`: `RESERVED_OUTPUT_DIRECTORY_NAME` becomes `RESERVED_ROOT_NAME` plus `RESERVED_REVERSE_SUBDIRECTORY` plus `reservedReverseDirectory(root)`, so the name that is written to and the name that is skipped are derived from one binding instead of agreeing by hand. Every comment that names the dotted directory is rewritten to the derived root, and the comment that implies a fixed path is replaced by one that states the match is a directory name at any depth.
- `workspacify-tree/run.mjs`: the three optional-input readers (`listSidecarFiles`, `readMeasuredEdges`, `readGraphNodes`) gain named derivation helpers beside them, so `runReverse` reads as a sentence about a subject rather than as eight `optionValue` calls. This is a translatability fix inside the function the ticket touches: today the reader cannot tell which of the eight inputs is load-bearing without reading all eight.
- `workspacify-reverse/run.mjs`: the destination construction is extracted into a named function, so `parseArgs` states what the subcommand is rather than how the path is spelled; `ROOT_TAKING_SUBCOMMANDS` is removed rather than left as an empty array, because a constant whose value is `[]` documents a capability the entrance no longer has.
- Every comment in the files touched that named `.workspacify-reverse` is rewritten to the derived root, and no comment claims a flag the entrance no longer honours.

## Test Plan

### Unit Tests

- UT: [Normal] `node .claude/scripts/workspacify-reverse/run.mjs analyze` with `cwd` set to a synthetic tree exits 0, and the documents are found under `join(cwd, 'workspacify', 'reverse')`; `ANALYSIS-SCOPE.json`'s `root` realpaths to that same `cwd`.
- UT: [Normal] With that reserve populated, `node .claude/scripts/workspacify-tree/run.mjs reverse` run in the same directory with no flags at all reads the origin spec from the reserve and reaches a verdict; a second identical run reaches the same verdict.
- UT: [Error] Every withdrawn flag is refused by name with the whole token reported and nothing published: `--out=`, `--through=`, `--query=`, `--root=`, `--spec=`, `--graph=`, `--measured=`, `--sidecars=`, `--delta=`, `--prior-partition=`, and a bare positional argument.
- UT: [Boundary] An absent derivation input keeps its absent meaning: with no `<reserve>/graph.json` present `readGraphNodes` returns `undefined` and T3 fails naming the missing input, while a present-but-empty graph may pass. The two claims must not collapse into one another.
- UT: [Invariant] The reserved root name is written once in the library: no consumer retypes the literal `'workspacify'`, `RESERVED_ROOT_NAME` is a member of `NEVER_WALKED_DIRECTORY_NAMES`, and the list carries no duplicate entry.
- UT: [Invariant] No file published beneath the reserve carries an extension from `SOURCE_FILE_EXTENSIONS`, so `measureDirectoryTree` records no directory there and T1/T2 are unchanged by a populated reserve.
- UT: [C001 precondition] `analyze` refuses `--out=/tmp/x`, `--through=r0.5` and a bare positional with exit 1, stderr naming the token, and leaves no reserve directory behind.
- UT: [C001 postcondition] A bare `analyze` publishes `ORIGIN-LONG-SPEC.json` and `ORIGIN-LONG-SPEC.md` under `join(cwd, 'workspacify', 'reverse')` and prints that path on stdout.
- UT: [C002 invariant] `NEVER_WALKED_DIRECTORY_NAMES` includes `RESERVED_ROOT_NAME`, `NOT_ENUMERATED_DIRECTORY_NAMES` includes it too, `EXCLUSION_RULES` derives from the same binding, the list carries no duplicate entry, and neither list names the reverse subdirectory — the root already covers it, because the match is a directory name at any depth.
- UT: [C003 postcondition] Publishing into the reserve does not move `digestTree(root).sha256`; `ANALYSIS-SCOPE.json`'s `target_digest.excluded_directories` names the excluded directories, and a destination beneath the target that is not the reserve is still refused with a message containing `inside the target`.
- UT: [C004 invariant] `workspacify-tree/run.mjs` declares none of `--root`, `--out`, `--spec`, `--graph`, `--measured`, `--sidecars`, `--delta`, `--prior-partition` in its `printUsage()` block, and `workspacify-allocate/run.mjs` declares no `--root`.
- UT: [C005 invariant] The fifth layer is published at the workspace root and never beneath the reserve: after a tree `finalize` and an allocate `finalize` in one directory, `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json` and `ARCHITECTURE-DELTA.json` sit at that root, and the reserve holds no file of those names.

### Integration Tests

- IT: [Integration point] `workspacify-reverse` → `workspacify-tree reverse` → `workspacify-allocate reverse`, driven from the CLI with nothing but a `cwd`. The reserve is the only channel between the three.
- IT: [Verification] One synthetic tree is analysed, then reversed by the tree rotation, and the chain completes with no flag beyond the working directory; the digest of the tree is byte-identical before and after, and no reserve is left in the repository by any test.
- IT: [Prerequisites] A synthetic tree with one source language and no build system; a reserve populated by a preceding `analyze`; `createSyntheticTree` from `tests/workspacify-reverse/helpers/scratch.mjs`; `digestTree` from `holdout-ledger.mjs`.
- IT: [Related tickets] PX-213 (the entrance takes no arguments; the reserved name is one binding), P25-7 (the withdrawn-option rule this reuses), P22-11 (the reverse gates T1–T6), PX-215 (the forward rotation's half, which builds on the reserved root this ticket introduces).

### Exceptions

- Exception entry:
  - [Item] The reverse rotation verdict over the two representative trees (siprs-with-4layers, siprs-for-reverse), measured end to end
  - [Reason] It is impossible to test this within a per-step instrument: the run takes minutes over multi-megabyte real trees, so making it a step gate would make every step cost minutes. That is a cost boundary and not an architectural defect, and not a design defect either: the verdict is a pure function of the measured tree, it is exercised end to end by this ticket synthetic-tree integration test, and the representatives differ from that tree in size rather than in kind. The exemption is the run cost, not an untestable behaviour.
  - [Alternative verification] The synthetic-tree chain asserts the same derivation end to end; the limited representative run that the project reserves for very few occasions remains the instrument for the real trees.

### Plan Test Code (concrete code)

- UT: [C001 precondition] every token the entrance once honoured is refused by name
```js
const tree = createSyntheticTree({ 'src/model.rs': 'pub struct User;\n' });
try {
  for (const token of ['--out=/tmp/wsp-refused', '--through=r0.5', '--query=beta']) {
    const run = runEntrance(['analyze', token], tree.root);
    assert.equal(run.status, 1, `${token}: a withdrawn option is not a success`);
    assert.equal(run.stderr.includes(token.split('=')[0]), true, `${token}: refused by name`);
    assert.match(run.stderr, /nothing was published/i);
    assert.equal(existsSync(join(tree.root, RESERVED_ROOT_NAME)), false, `${token}: no reserve is created`);
  }
  const bare = runEntrance(['analyze', '/some/other/project'], tree.root);
  assert.equal(bare.status, 1);
  assert.equal(bare.stderr.includes('/some/other/project'), true, 'the positional is named, not discarded');
} finally { tree.dispose(); }
```
- UT: [C001 postcondition] a bare analyze publishes beneath the directory it was run in
```js
const tree = createSyntheticTree({ 'src/model.rs': 'pub struct User;\n' });
try {
  const run = runEntrance(['analyze'], tree.root);
  assert.equal(run.status, 0, run.stderr);
  const reserve = reservedReverseDirectory(tree.root);
  assert.equal(existsSync(join(reserve, 'ORIGIN-LONG-SPEC.json')), true);
  assert.equal(existsSync(join(reserve, 'ORIGIN-LONG-SPEC.md')), true);
  assert.equal(run.stdout.includes(reserve), true, 'the derived destination is printed');
  const scope = JSON.parse(readFileSync(join(reserve, 'ANALYSIS-SCOPE.json'), 'utf8'));
  assert.equal(realpathSync(scope.root), realpathSync(tree.root), 'the subject is where the command was run');
} finally { tree.dispose(); }
```
- UT: [C001 invariant] every document the run creates lands under the reserved reverse directory
```js
const tree = createSyntheticTree({ 'src/model.rs': 'pub struct User;\n' });
const walk = () => listTreeFiles(tree.root, { excludedDirectoryNames: [] });
const before = walk();
try {
  assert.equal(runEntrance(['analyze'], tree.root).status, 0);
  const created = walk().filter((path) => !before.includes(path));
  assert.notEqual(created.length, 0, 'the run published something');
  for (const path of created) {
    assert.equal(path.startsWith(`${RESERVED_ROOT_NAME}/${RESERVED_REVERSE_SUBDIRECTORY}/`), true, `${path} was written outside the reserve`);
  }
} finally { tree.dispose(); }
```
- UT: [C002 precondition] the reserved root is the name no walk descends into, and the subdirectory is not named separately
```js
assert.equal(NEVER_WALKED_DIRECTORY_NAMES.includes(RESERVED_ROOT_NAME), true);
assert.equal(NOT_ENUMERATED_DIRECTORY_NAMES.includes(RESERVED_ROOT_NAME), true);
assert.equal(NEVER_WALKED_DIRECTORY_NAMES.includes(RESERVED_REVERSE_SUBDIRECTORY), false, 'the root already covers everything beneath it');
assert.equal(NOT_ENUMERATED_DIRECTORY_NAMES.includes(RESERVED_REVERSE_SUBDIRECTORY), false);
assert.equal(EXCLUSION_RULES.includes(RESERVED_ROOT_NAME), true);
assert.equal(new Set(NEVER_WALKED_DIRECTORY_NAMES).size, NEVER_WALKED_DIRECTORY_NAMES.length, 'no duplicate');
```
- UT: [C002 postcondition] publishing into the reserve does not move the digest, before or after it is populated
```js
const tree = createSyntheticTree({ 'src/model.rs': 'pub struct User;\n' });
try {
  const before = digestTree(tree.root);
  await analyzeProject({ root: tree.root, out: reservedReverseDirectory(tree.root), through: THROUGH_SCOPE });
  assert.equal(digestTree(tree.root).sha256, before.sha256, 'the tree hashed the same before and after');
  const scope = JSON.parse(readFileSync(join(reservedReverseDirectory(tree.root), 'ANALYSIS-SCOPE.json'), 'utf8'));
  assert.equal(scope.target_digest.sha256, before.sha256);
  assert.deepEqual(scope.target_digest.excluded_directories, [...NEVER_WALKED_DIRECTORY_NAMES], 'the blind spot is declared');
  await analyzeProject({ root: tree.root, out: reservedReverseDirectory(tree.root), through: THROUGH_SCOPE });
  assert.equal(digestTree(tree.root).sha256, before.sha256, 'a populated reserve still matches');
} finally { tree.dispose(); }
```
- UT: [C002 invariant] the literal is written once and the entrance does not retype it
```js
const literal = `'${RESERVED_ROOT_NAME}'`;
const carriers = readdirSync(LIB_ROOT).filter((n) => n.endsWith('.mjs'))
  .filter((n) => readFileSync(join(LIB_ROOT, n), 'utf8').includes(literal));
assert.deepEqual(carriers, ['holdout-ledger.mjs'], 'the root is one binding');
assert.equal(readFileSync(RUNNER, 'utf8').includes(literal), false);
assert.match(readFileSync(RUNNER, 'utf8'), /RESERVED_ROOT_NAME|reservedReverseDirectory/);
```
- UT: [C003 precondition] a destination that is not the reserve is refused before a stage runs
```js
const tree = createSyntheticTree({ 'src/model.rs': 'pub struct User;\n' });
try {
  await assert.rejects(() => analyzeProject({ root: tree.root, out: join(tree.root, 'analysis'), through: THROUGH_SCOPE }), /inside the target/);
  assert.equal(existsSync(join(tree.root, 'analysis')), false, 'a refused destination is not created');
} finally { tree.dispose(); }
```
- UT: [C003 postcondition] four destinations, four verdicts, and the refusal names both paths
```js
const tree = createSyntheticTree({ 'src/model.rs': 'pub struct User;\n' });
const outside = createSyntheticTree({ 'placeholder.txt': '' });
try {
  await assert.rejects(() => analyzeProject({ root: tree.root, out: tree.root, through: THROUGH_SCOPE }), /inside the target/);
  await assert.rejects(() => analyzeProject({ root: tree.root, out: join(tree.root, 'analysis'), through: THROUGH_SCOPE }), (error) => {
    assert.equal(error.message.includes(join(tree.root, 'analysis')), true, 'the destination is named');
    assert.equal(error.message.includes(tree.root), true, 'the target is named');
    return true;
  });
  await analyzeProject({ root: tree.root, out: reservedReverseDirectory(tree.root), through: THROUGH_SCOPE });
  assert.equal(existsSync(join(reservedReverseDirectory(tree.root), 'ANALYSIS-SCOPE.json')), true);
  await analyzeProject({ root: tree.root, out: outside.root, through: THROUGH_SCOPE });
  assert.equal(existsSync(join(outside.root, 'ANALYSIS-SCOPE.json')), true, 'outside the target is still accepted');
} finally { tree.dispose(); outside.dispose(); }
```
- UT: [C003 invariant] neither exclusion list returns a path beneath the reserve
```js
const tree = createSyntheticTree({ 'src/model.rs': 'pub struct User;\n' });
try {
  const digest = digestTree(tree.root);
  const reserve = reservedReverseDirectory(tree.root);
  mkdirSync(reserve, { recursive: true });
  writeFileSync(join(reserve, 'PLANTED.json'), '{}\n');
  assert.equal(listTreeFiles(tree.root).some((p) => p.startsWith(RESERVED_ROOT_NAME)), false);
  assert.equal(digestTree(tree.root).sha256, digest.sha256, 'a planted file does not move the digest');
  assert.equal(listArtefacts(tree.root).some((a) => a.path.startsWith(RESERVED_ROOT_NAME)), false);
} finally { tree.dispose(); }
```
- UT: [C004 precondition] the reverse rotation declares no derivation input on its command line
```js
const treeSource = readFileSync(TREE_RUNNER, 'utf8');
const usage = /const USAGE = \[([\s\S]*?)\]\.join\('\\n'\)/.exec(treeSource)
  ?? /function printUsage\(\) \{\s*return \[([\s\S]*?)\]\.join\('\\n'\)/.exec(treeSource);
assert.notEqual(usage, null, 'the entrance declares its surface in one block');
const declared = new Set([...usage[1].matchAll(/--[a-z-]+/g)].map(([n]) => n));
for (const gone of ['--root', '--out', '--spec', '--graph', '--measured', '--sidecars', '--delta', '--prior-partition']) {
  assert.equal(declared.has(gone), false, `${gone} left the reverse command line`);
}
assert.equal(/const ROOT_TAKING_SUBCOMMANDS\s*=\s*\[\s*\]/.test(readFileSync(REVERSE_RUNNER, 'utf8')), true, 'the entrance has one subject');
```
- UT: [C004 postcondition] the same tree reaches the same verdict from the directory alone
```js
const tree = createSyntheticTree(PATTERN_ONE_TREE);
try {
  assert.equal(runEntrance(['analyze'], tree.root).status, 0);
  const first = runEntrance(['reverse'], tree.root, TREE_RUNNER);
  const second = runEntrance(['reverse'], tree.root, TREE_RUNNER);
  assert.equal(first.stdout, second.stdout, 'the verdict is a function of the tree and the reserve alone');
} finally { tree.dispose(); }
```
- UT: [C004 invariant] an absent derivation input keeps its absent meaning and never becomes an empty one
```js
const tree = createSyntheticTree(PATTERN_ONE_TREE);
try {
  assert.equal(runEntrance(['analyze'], tree.root).status, 0);
  assert.equal(existsSync(join(reservedReverseDirectory(tree.root), RESERVED_GRAPH_NAME)), false, 'nothing publishes a graph today');
  const run = runEntrance(['reverse'], tree.root, TREE_RUNNER);
  assert.match(run.stdout, /T3/, 'T3 still judges the absence rather than being handed an empty graph');
} finally { tree.dispose(); }
```
- UT: [C005 precondition] the reserve exists and the fifth layer is declared at the workspace root
```js
assert.equal(TERMINAL_ARTEFACTS.fifthLayer.includes('WORKSPACIFY-TREE-MANIFEST.json'), true);
assert.equal(TERMINAL_ARTEFACTS.fifthLayer.includes('WORKSPACIFY-ALLOCATE-MANIFEST.json'), true);
assert.equal(TERMINAL_ARTEFACTS.fifthLayer.includes('ARCHITECTURE-DELTA.json'), true);
assert.equal(TERMINAL_ARTEFACTS.fifthLayer.every((name) => !name.includes('/')), true, 'the fifth layer sits at the root, not beneath the reserve');
```
- UT: [C005 postcondition] no fifth-layer artefact is published beneath the reserve
```js
const tree = createSyntheticTree(PATTERN_ONE_TREE);
try {
  assert.equal(runEntrance(['analyze'], tree.root).status, 0);
  const published = listTreeFiles(reservedReverseDirectory(tree.root), { excludedDirectoryNames: [] });
  for (const name of TERMINAL_ARTEFACTS.fifthLayer) {
    assert.equal(published.some((p) => p.endsWith(name)), false, `${name} belongs at the workspace root`);
  }
} finally { tree.dispose(); }
```
- UT: [C005 invariant] the reserve holds documents only, so T1 and T2 never see a directory there
```js
const tree = createSyntheticTree(PATTERN_ONE_TREE);
try {
  assert.equal(runEntrance(['analyze'], tree.root).status, 0);
  const published = listTreeFiles(reservedReverseDirectory(tree.root), { excludedDirectoryNames: [] });
  for (const path of published) {
    assert.equal(SOURCE_FILE_EXTENSIONS.some((e) => path.endsWith(e)), false, `${path} would be measured as source`);
  }
  assert.equal(measureDirectoryTree(tree.root).directories.includes(RESERVED_ROOT_NAME), false);
} finally { tree.dispose(); }
```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| `reverse` took `--spec`, `--graph`, `--measured`, `--sidecars`, `--root`, `--delta`, `--out` and `--prior-partition`, and `optionValue` ignored a token it did not know. A caller who scoped a run to `/some/other/project` received a PASS over the working directory instead. | `reverse` takes `--decisions` and nothing else. Each withdrawn token is refused by name with the whole token reported, and a bare positional with it, before anything is read: `WITHDRAWN_FROM_REVERSE_OPTIONS` carries the reason each left, and the refusal exits 1 having published nothing. | workspacify-tree `/reverse`: the withdrawn options and the bare positional are refused rather than dropped |
| `reverse --root=<dir> --decisions=<path>` read the stage-1 manifest from `<root>`, and a `--root` token the subcommand could no longer honour was ignored in silence. | `reverse --decisions=<path>` reads the manifest from `WORKSPACIFY-TREE-MANIFEST.json` at the working directory, and `--root` is refused by name with the whole token reported before the manifest is opened. | workspacify-allocate `/reverse`: `--root` is refused rather than silently dropped |
| `.claude/scripts/workspacify-reverse/{run.mjs,lib/analysis-tech.mjs,lib/holdout-ledger.mjs}` in both installed copies still carried the PX-213 state, including `RESERVED_OUTPUT_DIRECTORY_NAME = '.workspacify-reverse'`. The installer preserved them: an annotator run had changed their digests, so `decideFileAction` no longer matched them against the previous install record. | Both copies are byte-identical to the source of record across every `scripts/workspacify-*` and `commands/workspacify-*.md` path — verified by digest comparison, 0 drift — and the installer was re-run so the record names the current source. | installed copies (`.claude/`, `crates/siprs/.claude/`) re-synced to the source of record |
| `workspacify-tree.md` invoked `run.mjs reverse --spec=.. --decisions=.. --root=..` with five optional flags; `workspacify-allocate.md` invoked `run.mjs reverse --root=<dir> --decisions=<path>`. | Both state the derived invocation, name where each document is read from, and name each withdrawn option in prose. The tree file's prohibition about what a reverse run writes now names the origin spec placed beside the manifest and the delta, instead of claiming the manifest alone. | the two command documents are rewritten to the derived surface |
| The design document still wrote `.workspacify-reverse` as the destination, cited `run.mjs:77` for a `ROOT_TAKING_SUBCOMMANDS` constant that no longer exists, and did not say where the fifth layer sits relative to the reserve. | It writes `workspacify/reverse`, cites `run.mjs:321-326` for the `regression` branch that fixes `root: process.cwd()`, and §2.2 states that the reserved root is a document repository holding no source file and that the fifth layer stays at the workspace root because allocate derives the workspace from `dirname(manifestPath)`. | docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md: the destination, the stale constant and the §2.2 reserve paragraph |
| `design-citations.test.mjs` anchored four citations that had drifted — `run.mjs:77`, `reverse-mode.mjs:213`, `scope.mjs:1948`, `scope.mjs:1806-1811` — and the document still wrote the old numbers. | Each was re-measured to the line that carries its token after the annotation step shifted the anchors (`reverse-mode.mjs:212`, `scope.mjs:1948`, `scope.mjs:1806-1811`, `run.mjs:321-326`), never adjusted to fit. The suite is green. | the design document's anchored citations are re-measured after the annotations |

## Notes in Prior Implementation Rounds

- [Implementation steps] (1) Replace `RESERVED_OUTPUT_DIRECTORY_NAME` in `holdout-ledger.mjs` with the root, the reverse subdirectory and the join helper, and wire the root into `NEVER_WALKED_DIRECTORY_NAMES` and the subdirectory into `NOT_ENUMERATED_DIRECTORY_NAMES`. (2) Re-derive `analysis-tech.mjs`'s two lists and rewrite the "one directory name" comment. (3) Re-point `scope.mjs`'s assertion at the derived destination. (4) Rewrite `workspacify-reverse/run.mjs`'s destination, empty `ROOT_TAKING_SUBCOMMANDS`, and withdraw `spike`'s `--out`. (5) Derive the eight `workspacify-tree reverse` inputs from the working directory and the reserve, preserving the absent-versus-empty distinction. (6) Drop `--root` from `workspacify-allocate reverse`. (7) Rewrite the three command files and the design document. (8) Re-sync both installed copies. (9) Re-measure the design citations after the annotations, not before.
- [Risks] The largest is that the excluded name becomes generic: the walk matches a directory name at any depth, so `workspacify` is skipped wherever it appears in a measured project. `target` is precedent for a generic name in that set, but `target` names a build convention and `workspacify` names a tool. The mitigation taken is that the exclusion is declared in `ANALYSIS-SCOPE.json` rather than silent; the unmapped alternative is root-relative path exclusion, which reaches four more modules. The second risk is the derivation itself: an absent artefact must stay absent, because turning it into an empty one would let T3 and T4 pass over a graph nobody supplied — the very failure `readGraphNodes`'s comment was written to prevent.
- [Caveats] Hiding `--root` on `workspacify-tree reverse` removes the only command-line way to measure a tree other than the working directory. The API keeps the parameter, which is how the fixtures and the representative runs continue to work, but the command file must say where the capability now lives rather than dropping the subject in silence. Withdrawing a flag rather than deleting it is the same rule: a question silently dropped reads as a question answered.
- [Open items] Whether the reserve should be swept at the end of a run or kept as the record of the analysis. PX-213 kept the reverse analysis because it is the evidence a run happened; the tree and allocate decisions are staging artefacts and the family's doctrine deletes those mechanically — PX-215 settles that half.
- [Future improvements] `spike` still exists as a diagnostic that writes elsewhere; after this ticket its destination is derived too, but whether the family needs a diagnostic entrance at all is a later question. A second candidate is publishing one derived table of the family's command surface, read from the scripts, so the operator and the AI read the same declaration.
- [Plan decision, 2026-09-16] The subdirectory is NOT added to `NOT_ENUMERATED_DIRECTORY_NAMES`. The spec first said it would be. Measured: `holdout-ledger.mjs:245` is `if (excluded.has(entry)) continue;` over a single `readdirSync` entry inside the recursive walk, so both exclusion lists match a directory NAME at any depth. Once `workspacify` is never walked, nothing beneath it is reachable and `reverse` never needs naming — and naming it would put a second generic name (`reverse`) into a global list, which is the cost this ticket exists to avoid. The root is named once, in both lists, which is what the code does today with the flat dotted name.
- [Plan decision, 2026-09-16] `detect`, `scrub` and `verify` do lose their positional root, as the spec's scope says. Checked against the criterion "hiding must not break a pattern": §1.3's experiment pair (`siprs-with-4layers`, `siprs-for-reverse`) stays reachable, because a subject is measured by standing in it, which is how `analyze` already works. `holdout`, `oracle`, `regression` and `spike <root> <slice>` keep their selections: those name WHICH fixture or WHICH slice, a genuine choice with no derivable location, and they are marked "Experiment only" in the command file.
- [Plan decision, 2026-09-16] The derivation of the graph and the measured edge set is a LOOKUP in a declared location, not a default. Nothing publishes those two artefacts today, so the derivation finds nothing and passes `undefined`, which is exactly what an omitted flag does now — T3 and T4 continue to report the absence. The names are declared beside the join helper so no caller spells them, and the day a stage publishes them the same lookup finds them.
Implementation summary (PX-214):
- Changed files (source of record): `.claude/scripts/workspacify-tree/lib/reserved-root.mjs` (new), `.claude/scripts/workspacify-tree/run.mjs`, `.claude/scripts/workspacify-allocate/run.mjs`, `.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs`, `.claude/scripts/workspacify-reverse/{run.mjs,lib/analysis-tech.mjs,lib/holdout-ledger.mjs,lib/scope.mjs}`, the three `.claude/commands/workspacify-*.md`, `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md`, and eleven test files.
- Key changes: the reserved root is one binding in `workspacify-tree/lib/reserved-root.mjs`; the reverse rotation derives its subject and destination; every withdrawn option is refused by name; both installed copies are byte-identical to the source of record.
- Test results: workspacify-tree 337 pass / 0 fail, workspacify-allocate 262 pass / 0 fail, workspacify-reverse 1370 pass / 0 fail / 2 skipped, tests/conventions 52 pass / 2 fail. The two conventions failures are pre-existing and unrelated to this ticket: `derived-artefacts.test.mjs` measures `tools/conver/tmp/`, whose files commit 8c289f45 (2026-09-15, P25) deleted from the working tree, so the prefix is absent and its frozen digest is null. The test forbids adjusting its constant; re-recording that measurement belongs to the ticket that removed the files.
- Assumptions recorded: (1) the installer's "preserve" decision for the four reverse files was staleness, not a user edit — their content was the PX-213 state that the source of record had already left, so hand-copying them forward was the repair the scope prescribes, not an overwrite of somebody's work. (2) The tree's `--spec` withdrawal is scoped to `reverse`, because `gate` and `finalize` still honour it; withdrawal belongs to the entrance that lost the option.
- Remaining risk: the refusal is exercised by `IT-6b`/`IT-6c` (tree) and `IT-2c` (allocate). The withdrawn set for the tree is asserted from the outside, so a later option added to `WITHDRAWN_FROM_REVERSE_OPTIONS` without a test would not be caught by a guard that enumerates the set itself.

## PX-214 — implemented at 56 locations

### .claude/scripts/workspacify-allocate/lib/reverse-mode.mjs

- Line 642
```
export function measureExistingDirectories(root) {
```

### .claude/scripts/workspacify-allocate/run.mjs

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

- Line 621
```
// [::TICKET::] PX-214 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-214 --for-spec --no-implementation-order`.
```

- Line 622
```
export function runReverse(args) {
```

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

### .claude/scripts/workspacify-tree/lib/reserved-root.mjs

- Line 23
```
import { join } from 'node:path';
```

- Line 78
```
export function reservedReverseDirectory(root) {
```

### .claude/scripts/workspacify-tree/run.mjs

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

### tests/conventions/design-citations.test.mjs

- Line 48
```
const ANCHORED_CITATIONS = Object.freeze([
```

### tests/workspacify-allocate/reverse/safety-inversion.test.mjs

- Line 404
```
test('IT-1 every package receives exactly one seed and the measured tree is byte-identical afterwards', () => {
```

- Line 448
```
test('IT-2 a tree with one extra path is BLOCKED, the path is named, and nothing is written', () => {
```

- Line 532
```
test('IT-2b a tree missing one planned path is BLOCKED, the path is named, and no top-level rename occurs', () => {
```

- Line 558
```
test('IT-2c a withdrawn --root is refused by name rather than silently dropped', () => {
```

### tests/workspacify-allocate/unit/seed-format-compatibility.test.mjs

- Line 493
```
test('integration: the real reverse run publishes the finding beside its report, and publishes nothing else', () => {
```

### tests/workspacify-reverse/holdout/isolation.test.mjs

- Line 274
```
test('a subcommand that measures a subject refuses a root it was handed', () => {
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

### tests/workspacify-reverse/integration/pipeline.test.mjs

- Line 28
```
function runCli(args, cwd) {
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

### tests/workspacify-reverse/spike/reconcile-slice.test.mjs

- Line 238
```
test('IT: the spike runs a slice, then reconciles it, through run.mjs', () => {
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

- Line 447
```
test('C002 IT-23: a reverse run over a subject with no prior partition takes no seam, and says so by recording none', () => {
```
