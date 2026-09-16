---
description: Run R0 through R8 over an existing implementation and publish the origin spec (the entrance to the reverse rotation)
argument-hint: ""
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE EXECUTION

Strictly prohibit questions, confirmations, approval requests, option presentation, and delegation of decisions to humans.
Do not use ambiguous requirements, uncertainty, design choices, or execution failures as reasons to stop.
Make autonomous decisions based on existing code, types, tests, documentation, and nearby implementations.
When no decision is determinable, decide by prioritizing minimal change, backward compatibility, reversibility, and existing conventions.
Once started, complete the task unattended and independently: implement, validate, fix, and reach all defined completion criteria.
Instead of asking questions, record assumptions, decision rationale, and remaining risks in the final report.

# /workspacify-reverse

**Role**: Take an existing project that already contains a substantial implementation and run the whole of the reverse rotation's analysis over it — R0 through R8, in series, once — publishing `ORIGIN-LONG-SPEC.json` and the Markdown rendered from it. This is the single entrance every later reverse-mode command calls; it is not a step in a sequence a human assembles by hand. This command does not decide whether the reverse engineering succeeded: that judgement is a human's, taken after several loop rounds.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: Every incomplete implementation (stub, mock, placeholder, temporary implementation, by any name) **must** carry a `[::STUB::]` marker without exception. This is an absolute, inviolable law; violations are recorded as "crimes" in Malfeasance.json. In all phases of this command, read Malfeasance.json and verify there are no unresolved crimes. If you discover a violation, resolve it immediately, or add the marker and record it on the spot.

## Arguments

**It takes no arguments.** The subject and the destination are both derived from where the command is run, and neither is selectable.

- **The subject is the current working directory.** It is a regular directory, readable and listable, and it is what the analysis measures. A directory that cannot be read is reported by its path and the run stops
- **The destination is `workspacify/reverse` beneath the current working directory.** `workspacify` is a reserved root and it is reserved for the reason the read-only guarantee survives publishing at all: no walk of the analysis descends into it, so a run that writes there leaves the tree it measured exactly as it found it. The documents are where you ran the command, not in the project the tool happens to live in. The root is named once, in the library, and both the destination and the walk exclusion are derived from that one binding
- The target is **read-only** otherwise. The analysis digests the tree before and after and refuses to publish anything if a single byte moved outside the reserved directory — a run that changes what it measured cannot be believed. The digest record names the directories it did not cover, so the claim is read as what it is
- **Options the entrance once honoured and no longer does are refused by name rather than ignored**, for the same reason an unrecognised stage is: a question silently dropped reads as a question answered. A bare argument is refused the same way, and naming a root is exactly such a question. The withdrawn options today are `--out` (where the documents are published — now the reserved directory beneath the working directory, the one place beneath the subject that no walk reads), `--through` (the last stage to run — now the last declared stage, because the command line has no prefix instrument at all), and `--query` (a question for a search tool). Each is refused with the reason it can no longer be honoured, and the token you wrote is named
- It requires no additional dialogue, environment variable, hook or external fetch

## The four principles

These are the spine of the whole reverse rotation, not decoration. Every step below is an instance of one of them.

1. **Maximise the deterministic analysis.** Whatever can be extracted from the project mechanically is extracted — structure, dependencies, contracts, invariants, tests, state transitions, errors, ownership candidates, evidence. Fourteen stages run in one command, and the AI neither runs them nor decides when to run them
2. **Minimise the area left to AI judgement.** A decision the machine can settle mechanically is never handed to the AI. The judgement surface is closed to the six items named in the next section, and everything else is accepted
3. **Maximise the serving to that area.** For each surviving decision, the material it needs is placed immediately in front of it — with `file:line` and `evidence_mode` embedded in prose, with the options, their consequences, the counterexamples and the default
4. **The existing tree is absolutely inviolable.** The analysis never writes to the subject: it digests the tree before and after, it refuses a destination inside the target, and the only writes the whole reverse rotation ever makes are `RFC-SEED.md` and the manifests. No step below deletes or rewrites anything in the subject

## What the machine decides, and what you decide

- **The machine decides, deterministically**: the root boundary and the artefact classification; the structural measurement; the dependency graph, its cycles and its cohesion; the execution surface; the semantic extraction; the claim ledger and the independence of its evidence; history and its quality; the gap enumeration; the oracle's validity; the Red plan and the generated properties; the origin spec's validation and its Markdown round trip; and the proof that the target did not change. These are read from the source text and its syntax tree
- **Its verdicts are accepted, not re-opened.** The machine's findings on T1–T6, A1–A6, G4–G5, GF1–GF2, B1–B3, S1–S6 and §6.14.7 are conclusions to build on. Re-litigating one is not analysis, it is a second opinion nobody asked for
- **The AI decides exactly these six, and nothing else:**
  1. the final determination of the package boundary
  2. owner assignment
  3. layer estimation
  4. what a contract *means*
  5. the over-splitting decision
  6. the classification of each proposition as `observed` / `inferred` / `normative` / `unresolved`

Do not widen this surface. A seventh item is a defect in the procedure, not a judgement to make.

## The terminal state this command serves

The exit is not this command. This command reaches R8 and hands over; the terminal state is reached downstream, and it is worth stating here so that "done" has a shape.

The fifth layer partitions the workspace into packages and then **re-instantiates the four-layer loop once per package directory**. So the terminal state is:

- Every package — the workspace root included, under the path `.` — holds its complete four-layer set: `RFC-<PKG>.md`, `RFC-<PKG>-GRAPH.json`, `RFC-<PKG>-Dirs-Tree.json`, `Tickets.json`, and the three `RFC-<PKG>-{GRAPHIFY,BOUNDIFY,SPLIT}-Status.json`
- One `RFC-SEED.md` per package directory
- The partition is explicit: `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json` and `ARCHITECTURE-DELTA.json` at the root
- Every inconsistency is recorded — an inconsistency is a named, located disagreement between two artefacts. It is never resolved by preferring one silently

A package whose four-layer set is complete and whose every claim carries evidence is not the same as a project that has been *proved* correct. Nothing reaches the terminal state by being declared finished.

## Two modes, never conflated

The same file is an input in one mode and a contaminant in the other. Conflating the two is the root error this design exists to remove, so the file names both and says which one it is in.

**An operational run — the one this command performs — is in the operational mode.**

| | **Operational** (patterns 1, 2, 3) | **Experiment** (validating the instrument) |
|---|---|---|
| Subject | any project the operator names | `siprs-for-reverse` set against `siprs-with-4layers` |
| Terminal state | the complete per-directory four-layer structure | a disagreement list, never a score |
| `holdout isolation` | **never used** | central: it proves the executor cannot read its own answer |
| `run.mjs scrub` / `run.mjs detect` / `run.mjs verify` | **never used** | used to manufacture the stripped input from the complete one |
| `oracle compare` | **never used** — there is no answer key | central; ten stage rows in `docs/ANSWER-KEY.md` §5 |
| `RFC-*.md`, `*-GRAPH.json`, `Tickets.json` in the tree | **input** | **contaminant** |

The experiment mode is documented in `docs/HOLDOUT-PROTOCOL.md`, `docs/ANSWER-KEY.md` and `docs/SPIKE-REPORT.md`. It belongs to the instrument's own validation, and it **must not gate an operational run**: a project carrying `RFC-ROOT.md` and `Tickets.json` is a project whose prior work the analysis must read, not one it must refuse.

## The canonical output and its constraints

- The canonical artefacts are `ORIGIN-LONG-SPEC.json` (the sidecar other scripts consume) and `ORIGIN-LONG-SPEC.md` (the Markdown rendered from it, and the form `/workspacify-tree` accepts as input). They are published **outside** the target
- The Markdown re-parses to the sidecar exactly; that round trip is asserted rather than assumed, so the two cannot disagree
- Beside them: `ORIGIN-SPEC-CANDIDATE.json` (the form the comparison against the answer key consumes), `CAPABILITY-PROFILE.json`, `R7-SERVING.md`, `R0-R2-REPORT.md` and the stage sidecars from R0 through R8
- The set is closed: every document published is one the stages produce, so the same run publishes the same set whatever the host has installed. No stage reads anything from outside the target, and no document exists because of what a machine happens to have
- Nothing is published until every stage has run and the target has been shown unchanged. A run that stops leaves no partial document behind

## Scripts used

Under `.claude/scripts/workspacify-reverse/`.

| Script | Description |
|---|---|
| `run.mjs analyze` | **The entrance.** Runs R0 through R8 in series over the current directory and publishes the origin spec into `workspacify/reverse` beneath it. Exit 0 on success; 1 when a stage could not run or a withdrawn option was passed (the cause is named on stderr); 2 on a usage error |
| `run.mjs detect` | Reports the forward-rotation traces (L1–L4) in the current directory as Markdown. Experiment only |
| `run.mjs scrub [--apply]` | Plans, or performs, the removal of the removable traces, in the current directory. Experiment only |
| `run.mjs verify` | Re-detects in the current directory; exits 0 when no trace remains, 1 otherwise. Experiment only |
| `run.mjs regression <capture\|check>` | Freezes, or reproduces, the forward rotation's observable output. A maintainer's instrument: it measures the conver repository, not the subject |
| `run.mjs holdout [freeze\|isolation <root>]` | Freezes, verifies and isolates the projects generality is measured on. Experiment only |
| `run.mjs oracle <freeze\|delta\|compare>` | Freezes the answer key, measures the delta between the two trees, or lists one stage's disagreements against it. A comparison lists disagreements; it never scores. Experiment only |
| `run.mjs spike <root> <slice>` / `spike reconcile` | Runs one vertical slice and measures it, then adds the disagreement list from the frozen bundle. Experiment only |

## Statuses and gates

The machine's vocabulary is **`proved`** and **`not proved`**, and nothing else. "Succeeded" and "failed" are not available to it, because whether the reverse engineering succeeded is a judgement a human makes after several loop rounds. A comparison against the answer key yields a **list of disagreements**, never a score and never a verdict.

- The forward rotation's frozen fixtures are a maintainer's gate: it speaks only of *proved* / *not proved*, and it is never a precondition of an operational run
- The entrance itself exits **0** when the analysis was published, **1** when a stage could not run, **2** on a usage error
- There is no other gate. **No step below can stop the run because the subject is not a complete conver project** — incompleteness is the input, not a refusal condition

## Step 0: identify the input

**The purpose of this step**: know which of the four patterns the subject is, because it changes what Steps 1 and 6 do and nothing else.

Read the disk and record what conver scaffolding is already there: root `*-GRAPH.json` / `*-Dirs-Tree.json` / `Tickets.json` / `RFC-*.md`; a per-directory `RFC-SEED.md`; `WORKSPACIFY-*MANIFEST*`. Presence and absence are facts, read from the filesystem.

The reading is re-derived mechanically rather than left as an impression: Step 2's scope prefix publishes it as `PATTERN.json`, naming the pattern together with the presence and absence material that decided it, so a disagreement between what you read and what the machine read is visible in a document rather than in an argument.

| Pattern | The input project | What must happen |
|---|---|---|
| **Pattern 1** | Independently implemented. No conver artefacts at all — no RFC, no graph, no tickets, no headers | The four layers are **created** |
| **Pattern 2** | Already driven by conver's full four-layer loop: the root holds `RFC-ROOT.md`, `RFC-ROOT-GRAPH.json`, `RFC-ROOT-Dirs-Tree.json`, `Tickets.json`, `DesignTree.json` | The four layers are **re-instantiated per directory**, at finer granularity |
| **Pattern 3** | Partially conver: developed through individual conver commands, holding some artefacts but not the set | What exists is kept, what is missing is created |
| **Pattern 4** | Empty, plus a long specification document | **Pattern 4 does not enter through the reverse rotation.** It goes to `/workspacify-tree` directly; there is nothing to reconstruct |

- The pattern is **read from the filesystem**, never inferred by asking
- The pattern is **not a gate**. Each of patterns 1, 2 and 3 runs to R8 through this command; a subject that is none of the four is still analysed, and the pattern is recorded as `undetermined`

## Step 1: record what is already there

**The purpose of this step**: leave a record of the state the subject was in, so that whatever this command does downstream can be read against it.

- The artefacts Step 0 found, as an inventory
- The work in flight: the ticket lifecycle statuses in any existing `Tickets.json`, the `DesignTree.json`, and the existing partition. An interrupted cycle's in-flight work is **recorded**, never silently continued and never silently deleted
- On a pattern 2 or pattern 3 subject the existing `RFC-ROOT-Dirs-Tree.json` is **a prior, not the answer**. The act is being taken *because* those boundaries are too coarse
- Nothing is written to the subject in this step

## Step 2: fix the boundary and the scope

**The purpose of this step**: fix, before anything is measured, the conditions under which every later measurement means something.

- The entrance fixes the scope as its first act. Read `ANALYSIS-SCOPE.json` **before** any other document, because it is the record of what every later measurement is a measurement *of*:

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze
```

- What this fixes: the analysis scope (`ANALYSIS-SCOPE.json`), the target commit, the tree hash, the directories the digest did not cover, the exclusion rules, the read permission held over the target, and the external-transmission policy
- **Without this step fixed, the meaning of every later piece of evidence changes.** That is the whole reason the scope is a stage rather than a convention — it is published by the same run as everything else, and read first
- The subject and the destination are the working directory and `workspacify/reverse` beneath it. Neither is selectable, so there is no destination to get wrong and no root to name

## Step 3: reach the exit

**The purpose of this step**: reach R8 in one invocation, each stage consuming only what the previous stage produced.

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze
```

The stages, in the order the machine evaluates them:

```
r0, r0.5, r2.5, r1, r2, r3, r3.5, r4, r5, r5.5, r6, r6.5, r7, r8
```

Three mechanical facts. Without them every outcome is misread:

1. **Publishing is atomic.** Every document is published once, after every stage in the prefix has run and the target has been re-digested. **A run that stops publishes nothing**, so there is no partial-document state to clean up
2. **There is no command-line prefix instrument** — precisely because of (1). A failure late in a long run costs the whole run, and the command line offers no way to stop earlier and let a complete prefix publish. **The evaluation order is not the stage numbering**: R2.5 runs before R1 and R2, because the dependency graph's caveat has to state how many mechanisms stand between it and the running program, and the execution surface is what counts them. The order is declared once, in the analysis, and every declared stage appears in it exactly once. The `analyzeProject` API still takes `through`, so a prefix is reachable from a program — but not from here, and this step must not pretend otherwise
3. **The target is digested before and after.** The analysis digests the tree before and after and refuses to publish if a single byte moved outside the reserved destination. The tree must be quiescent, and no stage writes to it

But: a full run reaches R8 in about three minutes. **Run to the exit.** When the exit is refused, read Step 8: the failing stage is named, and nothing was published, so there is no prefix to fall back to and nothing to clean up.

- **Success condition (to advance)**: the run exits 0 and `ORIGIN-LONG-SPEC.json` and `ORIGIN-LONG-SPEC.md` are present in the destination
- **On failure**: see Step 8

## Step 4: read the material in the order it is needed

**The purpose of this step**: put the material for the human's judgement in front of them, in the order the decision needs it — not in the order it was produced.

| Document | The question it answers |
|---|---|
| `R0-R2-REPORT.md` | the boundary, the structure, the dependencies, the execution surface — and the **analysis-attempt ledger**, which exists so that `extracted_count: 0` cannot mean both "analysed and found nothing" and "could not analyse" |
| `CLAIM-LEDGER.json` | the claims, with their evidence groups and how independent those groups are |
| `R7-SERVING.md` | the claims a human still has to decide, each with the question that would settle it |
| `ORIGIN-LONG-SPEC.md` | the spec itself. Every claim states what would falsify it; the `unresolved` ones say what a human has to decide |
| `CAPABILITY-PROFILE.json` | what this analysis can and cannot prove, in five dimensions. It carries **no eligibility verdict**: a profile is material, not a gate |

- The list is closed: **every document is one a stage produced.** Nothing is served beside the result, so the same tree yields the same set on any machine, and a document whose existence depended on what was installed could not be read as evidence of anything
- A search over the codebase is a reasonable thing to do while deciding what a claim means, and it is done outside this rotation. Its results are **candidates, never findings**: open the file and the line, read the surrounding code, and let the reading be the evidence
- **No stage of this analysis reads a search result.** A vector or BM25 search returns different material on different runs, so it can never participate in a proof

## Step 5: decide the partition

**The purpose of this step**: take the one load-bearing decision. Everything downstream is instantiated from it.

Decide the package boundary — the first of the six items. Because the terminal state is a per-directory re-instantiation of the four layers, **a wrong partition does not produce one wrong file; it produces a whole wrong structure, in every directory, at every level.** A hallucinated specification is what a boundary decided carelessly becomes.

- The material the decision needs is in front of you: R2's cohesion, dependency density, SCC condensation, co-change history and **boundary-crossing call counts**. These are not decoration; they are the ground the terminal structure stands on
- Bring the remaining five items to the material too — owner assignment, layer estimation, what each contract means, the over-splitting decision, and the classification of each proposition
- On a pattern 2 subject the old `RFC-ROOT-Dirs-Tree.json` is a prior, not the answer
- **Do not re-open a machine verdict.** If a measurement disagrees with the partition you want, the measurement is the material and the disagreement is recorded, not overruled

## Step 6: record the seam

**The purpose of this step**: record the discontinuity, on the subjects where there is one. A pattern 1 subject has no seam; this step is for patterns 2 and 3.

- The old partition, the work in flight, and the difference between the two — **recorded, never eliminated**
- A break is not an increment. Whether the existing `.delta.json` mechanism can express a structural discontinuity or needs a record of its own is not yet settled; until it is, record the seam explicitly rather than forcing it into an increment's shape
- Nothing in the subject is removed to make the record tidier

## Step 7: hand over

**The purpose of this step**: place the spec where the next command reads it.

- `/workspacify-tree` in reverse mode consumes `ORIGIN-LONG-SPEC.md` and produces the partition's machinery
- The hand-over is the published document and nothing else. This command does not run the downstream chain
- What changes between one round and the next is the human's answers to the `unresolved` claims, which return through the existing residual → grill → RFC path. **No separate human-norm-setting stage exists and none may be created**

## Step 8: report

**The purpose of this step**: print the outcome in the minimal form the next reader can act on.

- **On success**: the stage list that ran and the destination the documents were published to — nothing else
- **On a stage that could not run**: the stage's name, the input it was reading (`root`, `out`, `through`), the reason, and the statement that nothing was published. The run stops; no partial document is emitted
- **An unreadable root** is reported with its path, not as a bare errno
- **An empty target** produces an explicit empty origin spec — a run that looked and found no claim, not a report that might have dropped one
- Report `proved` / `not proved` and nothing else. Whether the reverse engineering succeeded is not a report this command can give

## What this command cannot yet reach

A command file is a prompt. Instructing an operator to run an entrance that does not exist produces either a fabricated success or an abort, and both are worse than silence. So each of these is **named** rather than omitted — the same discipline the instruments apply to unobserved regions, where `unobserved` is a first-class state and is never rendered as "no disagreement".

**The set is measured, not remembered.** `tests/workspacify-reverse/helpers/module-closure.mjs` computes the import closure from the entrance over the library, and `tests/workspacify-reverse/integration/command-procedure.test.mjs` holds this section to it in **both** directions: a module the closure cannot reach and this section does not name fails, and so does a module the closure *does* reach and this section names absent. Recompute the closure rather than re-reading this paragraph; the guard reports the disagreement by name if the two have parted.

Five modules stand outside the closure. Two are absences nobody owns; three are exclusions this design chose and states.

| Module | Kind | Why it is here | What is lost |
|---|---|---|---|
| `two-pass.mjs` | absence, unowned | Nothing imports it. | The 2-Pass Hybrid (ABOUT-REVERSE §7.7.1): the analysis sweeps each package without first fixing the boundaries it crosses, so a package's contract is settled from that package alone and boundedness is a hope rather than a property of the input. The unit test executes the module; no run does |
| `staleness.mjs` | absence, unowned | Nothing imports it. | The evolution loop's signal (F13): a dependency, a configuration, a schema or an external contract moves on, the canonical record keeps its shape and quietly stops describing the code, and nothing turns red. Its unit and integration tests execute the module; no run does |
| `invariant-audit.mjs` | exclusion, P23-12 | The audit measures this chain's gates, and design §1.2 forbids it from doing so *as a gate* — wiring it in is precisely what would let it refuse a run. The regression suite is the entrance §1.2 asks for | Nothing. The audit is not a stage, and an enforcement gate is the shape §1.2 forbids |
| `language-representatives.mjs` | exclusion, P24-1 | What reads the language declaration is the suite and the tickets that parameterise over the six representatives. A run is pointed at one subject at a time, never at a fixture population | Nothing. Wiring it in would put a declaration about test fixtures inside the run it is only evidence about |
| `terminal-state.mjs` | exclusion, P24-8 | The terminal state is a property of a run of the whole chain, and this entrance is one command of that chain | Nothing. The inventory is read by the observation test that drives the chain, not by one of the chain's own steps |

**Read these as absences and exclusions, not as findings about the subject.** A run that reaches R8 without the first two is a complete run with two fewer sections. The three exclusions are decisions rather than debts, and they are listed because a reader who finds a module in the library and no mention of it here cannot tell a decision from an omission.

## A round, and what success is

- Success is **RESIDUE 0 in `/crystalize-readme`**, and it is reached only after several rounds. A human judges it; no machine gate can
- **`omission 0` from `/find-omissions` is not the success condition.** It is material for the human's decision. Neither is a small gap count a statement of quality: "we found no gaps" is not a statement that the implementation is correct
- One round is **this command plus the whole downstream chain**, not this command alone. What changes between rounds is the human's answers to the `unresolved` claims
- The ladder, and only its top rung is success:
  - **L0** — the analysis runs, but the RFC is pure ratification of what was already there
  - **L1** — some directories reach RESIDUE 0
  - **L2** — all do, but the Red reconstruction is incomplete
  - **L2.5** — coverage is fully proven, and every unprovable oracle-collusion suspicion is marked `unverified_oracle_risk`
  - **L3** — RESIDUE 0, Red evidence on every ticket, and a human judges it a success
- **Only L3 may be called success.** The rungs below it are progress, and calling one of them success is the ratification failure mode this design exists to prevent
- The machine's vocabulary is **`proved`** and **`not proved`**, and nothing else

## Error recovery

- **A stage that could not run** — read the named stage and the input, correct it, and run again. Nothing was written, so there is no partial state to clear
- **The run refused to publish** — the target changed while it was measured. Find what wrote to the tree and run again over a quiescent checkout
- **The exit is refused late in a long run** — the named stage and the input it was reading are the finding. Nothing was published, so there is no partial result to read and no prefix to fall back to: correct the input and run again. A prefix is reachable only through the `analyzeProject` API's `through`, which this procedure does not use
- **The documents are not where they were looked for** — they are in `workspacify/reverse` beneath the directory the command was run in, and nowhere else. The run prints that path on success
- **A withdrawn option or a bare argument is passed** — not a warning. The entrance names the token, says why it can no longer be honoured, and publishes nothing: re-run without it. A root cannot be named at all, and a search is something a search tool is asked directly

## Prohibitions

- Do not treat a search result as evidence. A candidate is a place to look
- Do not read `unresolved` as a defect, and do not read a small gap count as quality. "We found no gaps" is not a statement that the implementation is correct
- Do not publish a document into the tree being measured
- Do not re-open a deterministic verdict. The judgement surface is the six items named above, and a seventh is a defect
- Do not use this command to settle whether the reverse engineering succeeded. It produces material; a human judges

## Definition of success

Success for this command is the coexistence of **① a complete analysis** (the run reached R8 and published the origin spec and its sidecar, with the Markdown re-parsing to it) and **② the forward rotation untouched** (its frozen fixtures still reproduce, and the gate still says *proved*). This command says neither "the reverse engineering worked" nor "it failed": the origin spec's `unresolved` claims and the disagreement list against the answer key are what a human reads to decide that, over several rounds, using the ladder above.
