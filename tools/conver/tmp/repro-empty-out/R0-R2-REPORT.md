# R0 to R8 — scope, structure, dependencies, the execution surface, the semantic material, history, gaps, the oracle validity and the red reconstruction plan

Stages run: `R0`, `R0.5`, `R1`, `R2`, `R2.5`, `R3`, `R3.5`, `R4`, `R5`, `R5.5`, `R6`, `R6.5`, `R7`, `R8`.


# R0 — the analysis scope

Root: `/Users/sh01/shyme/zasso/tools/conver/tmp/repro-empty`

## The commit this is fixed to

the tree sits inside the work tree at /Users/sh01/shyme/zasso and is not a repository of its own, so its commit is that repository's HEAD and tools/conver/tmp/repro-empty records where it sits beneath it

- commit: `6b87071842d6b0c48a587d23a02a358b933bc6d7`
- work tree root: `/Users/sh01/shyme/zasso`
- path beneath it: `tools/conver/tmp/repro-empty`
- the project is its own repository: `false`

## Exclusion rules

Directories whose contents are recorded rather than measured: `target`, `.git`, `vendor`, `node_modules`.

An excluded path is still recorded, and is marked `out_of_scope`. It is never dropped from the
record, so that "outside the scope" can never be read as "not there".

## Permissions

Held over the target: `read`. The run holds no write permission over what it measures and does not need one.

## External transmission

Policy: `none`. the analysis reads the target and writes only outside it, and sends nothing anywhere. No evidence leaves this machine, so no secret-exclusion rule is needed to permit the run.

## The pattern this subject is

Undetermined — none of the four declared patterns matched this subject. Every marker that was searched is named below, so the answer can be re-derived rather than taken on trust.

What was searched for and not found:

- `RFC-*.md` — searched, not found
- `*-GRAPH.json` — searched, not found
- `*-Dirs-Tree.json` — searched, not found
- `Tickets.json` — searched, not found
- `DesignTree.json` — searched, not found
- `RFC-SEED.md` — searched, not found
- `WORKSPACIFY-*MANIFEST*` — searched, not found
- `a source file in one of the six declared languages` — searched, not found
- `a document of at least 2048 bytes` — searched, not found

## Eligibility — the conditions, read before anything runs

ABOUT-REVERSE 3.6 names six conditions a reverse rotation needs and six danger signals that make it unlikely to work. Both are read below from the source text of `/Users/sh01/shyme/zasso/tools/conver/tmp/repro-empty`, before any analysis stage runs, so the material is in front of a reader at the point where deciding is cheap.

**This is not a judgement about whether the rotation will succeed.** There is no score and no threshold here, because a score would look objective while encoding a threshold nobody chose (ABOUT-REVERSE 7.7.2). The decision is yours, and design 4.1 records rebuilding from zero as the choice most often taken in practice.

### Does the project build?

**not read by this channel** (`not_measurable_statically`), read by no channel in this run.

What was found, and where (1 entry):

- `.` — no declared build manifest was found beneath this root, so the ecosystem this project builds under is not named anywhere this channel reads

What would settle it: Whether it builds is a `build_semantic` question, and this read-only run takes no build channel. Running the project's own build would settle it; so would a manifest it can be run from.

### Do tests exist, and can they be run?

**not read by this channel** (`not_measurable_statically`), read by no channel in this run.

What was found, and where (1 entry):

- `.` — no test file was found in the project's own source, by directory name or by file name — a test declared inside a source file, as a Rust `#[cfg(test)]` module is, is invisible to that reading

What would settle it: Whether any test exists and can be run is a `runtime_dynamic` question, and this read-only run executes nothing. A declared test command would give the run something to name; executing the suite would settle it.

### Does a git history exist?

**read, and present** (`established_statically`), read by the `source_static` channel.

What was found, and where (1 entry):

- `.` — the run fixed this subject at commit 6b87071842d6, and this project sits inside the work tree at /Users/sh01/shyme/zasso and is not a repository of its own

A history exists and this run has its commit. Whether that history carries meaning — squashed, rewritten, or migrated from another VCS — is what R4 reads into `HISTORY-PROVENANCE.json`, and the danger signal below reports that half as unread rather than as clean.

### Is the main language analysable?

**read, and not there** (`not_established_statically`), read by the `source_static` channel.

What was found, and where (1 entry):

- `.` — no source file was found beneath this root, so no language could be named as dominant

What would settle it: Which language dominates is read from the source text, so a `source_static` reading settles this. rust, typescript, javascript, go, python, c_cpp are the languages this instrument declares; a corpus dominated by one of them is analysable in principle.

The six languages this instrument declares are rust, typescript, javascript, go, python, c_cpp. Whether one of them dominates decides this, and the count beside the dominant language is the whole of the reading.

### Does the directory structure carry meaning?

**not read by this channel** (`not_measurable_statically`), read by no channel in this run.

What was found, and where (1 entry):

- `.` — there is no source file beneath this root, so there is no structure to read

What would settle it: A `source_static` reading of the tree settles this once the tree holds a source file; with none there, this channel has nothing to measure rather than a structure it cannot see.

### Do documentation or comments survive somewhere?

**read, and not there** (`not_established_statically`), read by the `source_static` channel.

What was found, and where (1 entry):

- `.` — no documentation file and no comment line were found in the project's own source

What would settle it: Both halves are read from the source text, and a `source_static` reading settles this: the documentation population is counted by extension and the comment population by the prefix each language uses. Finding a document or a comment anywhere would settle it the other way.

### The danger signals

Each signal is reported with what raises it and what it is evidence of. No count of them is summed: a total would be a grade in a costume.

- **Are tests missing, or present and not passing?** — read, and present (`established_statically`).
  - `.` — no test file was found in the project's own source, by directory name or by file name
  This is evidence of a missing foundation for the Red reconstruction: there is no test to build on. It is not evidence of the project being unsuitable, and it is not a count towards any total.

- **Is the history gone — squashed, or migrated from another VCS?** — not read by this channel (`not_measurable_statically`).
  - `.` — the run resolved a commit for this subject, so the "no history" half of this signal does not fire from the source text
  What would raise it: Whether that history was squashed or migrated is read by R4 into `HISTORY-PROVENANCE.json` — `source_static` evidence this run has not taken. R4 settles it.
  This is evidence of a history being reachable. It is not evidence of that history being intact; reporting it as dismissed would be reading a channel limit as an absence (F12).

- **Does material the analysis records rather than reads dominate the tree?** — read, and not there (`not_established_statically`).
  - `.` — 0 artefact(s) sit under directories the analysis records rather than measures, against 0 in the project's own source
  What would raise it: A `source_static` reading settles this and this one was taken; no further channel is needed.
  This is evidence of how much material the analysis records rather than reads as the project's own source. It is not evidence of that material having been generated, and the two are different claims.

- **Is a dynamic language with dominant metaprogramming the population?** — read, and not there (`not_established_statically`).
  - `.` — no source file was found, so no language dominates the population
  What would raise it: A `source_static` reading settles this, and the reading was taken: the signal cannot fire on a corpus with no dynamic language.
  This is evidence of the language the population is written in. It is not evidence of metaprogramming being absent — the mechanism markers are not read for any of the six languages.

- **Is the business knowledge closed to a particular person?** — not read by this channel (`not_measurable_statically`).
  - `.` — whether the business knowledge is closed to a person is not a fact any file records, and no channel here reaches it
  What would raise it: A person who knows the project would settle this — the answer is not in the tree, and no mode of reading the tree produces it.
  This is evidence of the question standing open. It is not evidence of the knowledge being closed, and it is not evidence of it being shared.

- **Is it too large for mechanical analysis to be realistic?** — read, and not there (`not_established_statically`).
  - `.` — 0 file(s) in the project's own source, against the 20000 this instrument declares impractical
  What would raise it: A `source_static` reading settles this and this one was taken; no further channel is needed.
  This is evidence of the size of the population mechanical analysis would have to read, against a marker this instrument declares rather than a threshold chosen here. It is not evidence of the project being too large to attempt.

### What this does and does not establish

Every fact above was read from the source text and the names of the files it is written in: the artefact walk, the extension each path carries, and the first comment line each language's prefix finds. Nothing was built and nothing was run, so the two conditions that need a build or an execution are reported at the strength this channel supports with the channel that would settle them named.

An entry marked `not_measurable_statically` was not read by this channel. That is a statement about this run and not about the project, and it is kept apart from `not_established_statically` — which says the tree was read and the thing is not there — so that a limit of the instrument can never be read as an absence in the project (failure F12).

These are the conditions and the signals of ABOUT-REVERSE 3.6, read from the source text and published before anything runs. This is not a judgement about whether the reverse rotation will succeed, and no field here combines them into one: the conditions and the signals are material for a human deciding whether to start, or to rebuild from zero (design 4.1), and the decision is yours.

# R0.5 — the scope boundary

Every artefact beneath `/Users/sh01/shyme/zasso/tools/conver/tmp/repro-empty` is classified into exactly one of `in_scope`, `out_of_scope`, `undetermined`.

| Coverage state | Artefacts |
|---|---|
| `in_scope` | 0 |
| `out_of_scope` | 0 |
| `undetermined` | 0 |

**This scope is empty.** No artefact was classified `in_scope`, so there was nothing to
measure here. An empty scope is reported as empty rather than as a report that happens to
hold no findings, because those two would otherwise read the same and mean opposite things.

## Outside the scope

These paths are recorded and marked `out_of_scope`: they are inside the tree and outside the
analysis. Their contents were not measured, and that is a statement about this run and not
about them.



## Undetermined

Nothing was left undetermined: every artefact this run could read was classified.



# R1 — the static skeleton

Analysis mode: `syntax_only`. Every fact below was read from the source text
and its syntax tree. No name was resolved and no type was checked, so an item listed here is
an item the text declares — not a claim that it survives compilation.

## What was read

| Counter | Value |
|---|---|
| files discovered | 0 |
| files parsed | 0 |
| files with error nodes | 0 |
| files semantically resolved | 0 |
| configs enumerated | 0 |

`files_semantically_resolved` is zero by construction: this layer resolves nothing.

## Packages (E1)


## Public surface (E2)


## Types (E3)


## Error types (E4)


These are candidates, not verdicts. A name matching `Error` and an implementation of the
`Error` trait are evidence that a reader may weigh; neither decides what the type means.

## Limitations


# R2 — the dependency hypothesis

Analysis mode: `syntax_only`. The coupling claim is `hypothesis`,
and this graph represents runtime binding: `false`.

> An import graph is a hypothesis about coupling read from use declarations. It does not represent runtime binding: dynamic dispatch, dependency injection, plugin registration, configuration-driven selection and reflection all couple code that no import names. The execution surface measured at R2.5 lists those mechanisms separately, and a proposition touching one of them may not be classified observed on this graph alone. This run enumerated no dynamic mechanism at R2.5, which is a fact about this subject and not a promise that none is there.

## Measured edges

| From | To | Kind | Imports | First location |
|---|---|---|---|---|

## The partition material

The three quantities below are counts over a named population, not a score. There is no `eligible`
field and no verdict of any kind, for the same reason the capability profile carries none: a number
that looked objective while encoding a threshold nobody chose would decide the boundary by accident.

### Cohesion, by candidate boundary

No package was measured, so no boundary has cohesion to read. That is a fact about this graph
and not a clean result: R2 reaches a package only through an edge that leaves or enters it.

### Dependency density

0 measured edge(s) over 1 possible ordered pair(s) of the 0 package(s) measured — density 0.000. The population is _empty_.

A density of one means every ordered pair of packages carries at least one import; a density of zero
means none does. Neither is a verdict: a graph can be dense and correctly partitioned, or sparse and
wrongly partitioned, and this number cannot tell the two apart.

### Boundary crossings

No edge crosses a package boundary in this graph, so there is no crossing to count.

### The question this material asks

Decide whether each directory above is a boundary the four-layer structure wants to keep, or a line drawn through coupling that belongs together — and where a crossing is real, decide whether it is an intended layering or an accident of history. 0 package(s) are in front of you; nothing here answers the question, and nothing here ranks them for you.

What remains unresolved is the coupling the syntax layer cannot follow: the call counts are static, so a call behind a trait object, a macro or a registry lookup leaves no trace. That gap is R2.5's and is recorded in `EXECUTION-SURFACE.json` beside this report.

## Cycles

No cycle was found among the packages this import graph reaches. That is a fact about this graph and not a promise about the program: a cycle that runs through a dynamic mechanism is invisible here.

## External dependencies

## Limitations


# R2.5 — the execution surface

Analysis mode: `syntax_only`.

> This list is evidence of presence, not proof of absence. A mechanism not listed here is one this instrument did not find, which is not the same as one that is not there — no static analysis of an arbitrary program can be exhaustive about dynamic mechanisms.

## What was found

| Mechanism kind | Count |
|---|---|

## Every mechanism, with its location


Every mechanism above is a place where the import graph and the running program can disagree.
A proposition touching one of them may not be classified `observed` without dynamic evidence (R-1).

## Limitations


# R2.5 — the static/dynamic coupling difference

Stage: `r2.5`. Subject: `/Users/sh01/shyme/zasso/tools/conver/tmp/repro-empty`.

> The dynamic channel did not run, so it has looked at nothing. The three difference sets are published empty because nothing was observed, and not because nothing was found: an unrun channel cannot disagree with the static reading, and its silence is not evidence about the program.

## The dynamic channel

The channel did not run. Reason: `no-start-plan`.

the subject at /Users/sh01/shyme/zasso/tools/conver/tmp/repro-empty matches no declared ecosystem — looked for compose (docker-compose.yml, docker-compose.yaml, compose.yml, compose.yaml), cargo (Cargo.toml), node (package.json), go (go.mod), python (pyproject.toml, requirements.txt, setup.py), cmake (CMakeLists.txt), make (Makefile, makefile, GNUmakefile). An unstartable target is reported rather than yielding an empty evidence set The ecosystems searched were compose, cargo, node, go, python, cmake, make

An unrun dynamic channel has looked at nothing. The difference below is empty for that reason,
and not because the two surfaces were compared and agreed.

## What the session exercised, and what it did not

Neither question was asked. No session ran, so no mechanism was placed in any of the three states,
and the sections that would report them are absent rather than empty.


# R3 — the semantic material

0 fact(s) enumerated, 0 candidate(s) raised. A candidate is a proposition the source text supports and cannot settle; none of them is a contract.

## Families

| family | facts | what it holds |
|---|---|---|
| public_surface | 0 | declarations the text marks public |
| types | 0 | structs, enums, unions, traits and aliases |
| error_types | 0 | declared types carrying an error signal |
| guards | 0 | branches, early returns and loop conditions |
| invariants | 0 | assertions and unwrapping calls |
| state_machines | 0 | state-like fields and the assignments to them |
| side_effects | 0 | I/O, panics and writes beyond the local frame |
| tests | 0 | boundary values and expected failures a test declares |

## Language coverage


Not exercised by this population: `rust`, `typescript`, `javascript`, `go`, `python`, `c_cpp`. The vocabulary for these is declared and its correctness is unverified here — an untested table, not an absence of the material in the project.

## What the vocabulary was exercised over

- `rust` — 0 kind(s) observed; 23 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `panic`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `type_declaration`, `unwrap_expect`
- `typescript` — 0 kind(s) observed; 22 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `throw`, `type_declaration`
- `javascript` — 0 kind(s) observed; 22 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `throw`, `type_declaration`
- `go` — 0 kind(s) observed; 23 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `panic`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `type_declaration`, `unwrap_expect`
- `python` — 0 kind(s) observed; 22 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `throw`, `type_declaration`
- `c_cpp` — 0 kind(s) observed; 21 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `throw`, `type_declaration`

## What this run could not look at

- `build_semantic` — layer C is not built here (docs/P22-ANALYSIS-TECH.md §7): name resolution, type checking and cfg evaluation need a semantic adapter, so a proposition resting on any of them is not observed
- `runtime_dynamic` — no execution, build or trace evidence was collected, so dynamic dispatch targets, generated code and post-preprocessing composition are not observable in this run

## Limitations of the instrument

- `language_absent_from_population` (rust) — the rust vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (typescript) — the typescript vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (javascript) — the javascript vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (go) — the go vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (python) — the python vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (c_cpp) — the c_cpp vocabulary was declared and not exercised by this run; its correctness is unverified here
- `vocabulary_table_unexercised` (rust/FACT_VOCABULARY) — the rust FACT_VOCABULARY was declared and this run held no rust file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (rust/NAME_FILTERS) — the rust NAME_FILTERS was declared and this run held no rust file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (typescript/FACT_VOCABULARY) — the typescript FACT_VOCABULARY was declared and this run held no typescript file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (typescript/NAME_FILTERS) — the typescript NAME_FILTERS was declared and this run held no typescript file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (javascript/FACT_VOCABULARY) — the javascript FACT_VOCABULARY was declared and this run held no javascript file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (javascript/NAME_FILTERS) — the javascript NAME_FILTERS was declared and this run held no javascript file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (go/FACT_VOCABULARY) — the go FACT_VOCABULARY was declared and this run held no go file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (go/NAME_FILTERS) — the go NAME_FILTERS was declared and this run held no go file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (python/FACT_VOCABULARY) — the python FACT_VOCABULARY was declared and this run held no python file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (python/NAME_FILTERS) — the python NAME_FILTERS was declared and this run held no python file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (c_cpp/FACT_VOCABULARY) — the c_cpp FACT_VOCABULARY was declared and this run held no c_cpp file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (c_cpp/NAME_FILTERS) — the c_cpp NAME_FILTERS was declared and this run held no c_cpp file, so nothing of it was exercised here
- `state_field_by_name` (all languages) — a state field is recognised by its name, so a state carried under a name outside the vocabulary is not enumerated

## Claim ledger

Claims: 0 · candidates: 0

| class | count | what it means |
|---|---|---|
| observed | 0 | read from the source text or its syntax |
| inferred | 0 | an inference the source text supports but does not state |
| normative | 0 | settled only by a recorded human decision |
| unresolved | 0 | not decidable here; handed to the human grill |

### Evidence independence

0 evidence record(s) fold to **0 independent** component(s). Nothing folded, so no two records were found to share a derivation.

Relations found: none.
Commit channel consulted: no.
Assessments: . An `unknown` assessment means no consulted channel could settle the question, which is a different statement from "these are independent" and the one the design requires.

Nothing to classify.

## History and decision provenance

> A commit records what changed, never why. It is not proof of design intent. Co-change is evidence that two artefacts are not independent; it is never evidence that they are. Every provenance entry below is a candidate for a human to decide, and the message that carries it is evidence about the change, never about the reason for it.

| Reading | Count |
|---|---|
| commits in the repository | 994 |
| commits touching this population | 0 |
| transitions | 0 |
| co-change groups | 0 |
| provenance candidates | 0 |
| unreadable commits | 0 |

**History quality**: `clean` at `high` confidence.

## Gaps and contradictions

> A gap list measures the detector and its population, not the project. A small number of gaps is never read as quality or success: gaps are the measurement itself, and a run that found none has more to explain than one that found several. Nothing below claims a region is absent — a region this instrument did not look at is unobserved, and the two are not the same word.

**0 gap(s)** across 0 kind(s).

| Kind | Count | Meaning |
|---|---|---|

**Zero gaps.** Zero gaps is a finding that requires scrutiny, not a pass. It is the signature of F1 — a ratification document that found nothing to disagree with — rather than a statement of quality. Examine the detector, the population it ran over, and the coverage denominator before reading this as a clean result.

## Oracle validity

> A mutation score measures how many injected changes the current tests detect. It is not a measure of contract coverage, and no score is emitted here. A survivor is a question about the oracle, not a failure of the implementation.

**Mutation results supplied**: no.

**Channels this run could not consult:**

- no mutation results were supplied to this run, so no survivor was classified and no equivalence was decided. This is a missing channel, not a suite with no gaps: mutation execution belongs to a stage that can build and run the target.

**Survivors classified**: 0. **Discarded as equivalent by the ladder**: 0.

### Trivial compiler-normalisation equivalence

> A trivial comparison decides whether two texts normalise to the same tree under one named grammar. It is not a decision about meaning: semantic equivalence is undecidable for general programs, so this stage never claims it, and every verdict records the two normalised forms it rested on so a reader can see what was compared.

No grammar was named for this stage, so no configuration is recorded.

- no language was named for this stage, so no TCE configuration could be published

**Comparisons**: 0 (0 trivially equivalent, 0 not trivially equivalent, 0 unreadable).


## Capability matrix

| Extraction item | rust | typescript | javascript | go | python | c_cpp |
|---|---|---|---|---|---|---|
| E1 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E2 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E3 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E4 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E5 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E6 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E7 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E8 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E9 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E10 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E11 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E12 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E13 | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle |
| E14 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E15 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E16 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |

The attempt ledger this matrix was derived from is empty: no cell above rests on an attempt, and the values state that rather than stating that the instrument attempted nothing.

A gap here is a limitation of the instrument, not evidence about the project. A cell reading `not_attempted` states that this run made no attempt of that family for that language; it is never a statement that the project lacks the thing being sought.

# The analysis attempt ledger

Without this ledger `extracted_count: 0` would mean both "analysed and found nothing" and
"could not analyse", and therefore neither. The two counts are reported separately for that
reason.

| Count | Value |
|---|---|
| attempts recorded | 1 |
| analysed and extracted nothing | 0 |
| could not run | 0 |

## Attempts that could not run

None: every file the run reached was parsed.

## How to read this

The analysis mode is `syntax_only`. Every fact above was read from source text and its syntax
tree: no name was resolved, no type was checked, and no configuration was replayed. The
execution surface is evidence of presence and not proof of absence. Nothing here decides
whether the project is correct, complete or well designed — that judgement is a human's, and
this report exists to put the material for it in front of one.

