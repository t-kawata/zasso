---
description: Run R0 through R8 over an existing implementation and publish the origin spec (the entrance to the reverse rotation)
argument-hint: <path-to-the-project-root>
disable-model-invocation: true
---

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

- First argument (required, the only one): the path to the project root to analyse (`<path-to-the-project-root>`)
  - Requirements: a regular directory / readable / listable / not a path the analysis would refuse to scope. A root that cannot be read is reported with its path and the run stops
  - The target is **read-only**. The analysis digests the tree before and after and refuses to publish anything if a single byte moved — a run that changes what it measured cannot be believed
- Optional flags:
  - `--out=<dir>` — where the documents are published. Defaults to `tests/workspacify-reverse/analysis` under this project. A destination **inside** the target is refused, because publishing into the tree being measured is not a measurement
  - `--through=<stage>` — stop after an inclusive prefix of the stages (`r0` … `r8`). The default is the last declared stage, so a run without it reaches R8. An unrecognised stage is refused by name rather than ignored, and nothing is published. **This is the only way to see a prefix**, because publishing is atomic (Step 3)
  - `--query=<text>` — ask zg for candidate material on this question. See Step 4
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
- `ZG-CANDIDATES.md` is published **only when zg is installed and a query was asked**. When zg is absent there is no candidate file at all — a missing search tool must never be left looking like a search that found nothing
- Nothing is published until every stage has run and the target has been shown unchanged. A run that stops leaves no partial document behind

## Scripts used

Under `.claude/scripts/workspacify-reverse/`.

| Script | Description |
|---|---|
| `run.mjs analyze <root>` | **The entrance.** Probes zg, then runs R0 through R8 in series and publishes the origin spec outside the target. Exit 0 on success; 1 when a stage could not run (the stage and its input are named on stderr); 2 on a usage error |
| `run.mjs detect <root>` | Reports the forward-rotation traces (L1–L4) in a tree as Markdown. Experiment only |
| `run.mjs scrub <root> [--apply]` | Plans, or performs, the removal of the removable traces. Experiment only |
| `run.mjs verify <root>` | Re-detects; exits 0 when no trace remains, 1 otherwise. Experiment only |
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

- Run the entrance with the prefix instrument, so that only R0 and R0.5 do the work and the scope is published on its own:

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze "$ARGUMENTS" --out=<destination-outside-the-target> --through=r0.5
```

- What this fixes: the analysis scope (`ANALYSIS-SCOPE.json`), the target commit, the tree hash, the exclusion rules, the read permission held over the target, and the external-transmission policy
- **Without this step fixed, the meaning of every later piece of evidence changes.** That is the whole reason the scope is a stage rather than a convention
- If the destination is inside the target, the run refuses. Name one outside it

## Step 3: reach the exit

**The purpose of this step**: reach R8 in one invocation, each stage consuming only what the previous stage produced.

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze "$ARGUMENTS" --out=<destination-outside-the-target>
```

The stages, in the order the machine evaluates them:

```
r0, r0.5, r2.5, r1, r2, r3, r3.5, r4, r5, r5.5, r6, r6.5, r7, r8
```

Three mechanical facts. Without them every outcome is misread:

1. **Publishing is atomic.** Every document is published once, after every stage in the prefix has run and the target has been re-digested. **A run that stops publishes nothing**, so there is no partial-document state to clean up
2. **`--through` is the only instrument for seeing a prefix** — precisely because of (1). A failure late in a long run costs the whole run, and the only way to see where it went wrong is to stop earlier and let a complete prefix publish. **The evaluation order is not the stage numbering**: R2.5 runs before R1 and R2, because the dependency graph's caveat has to state how many mechanisms stand between it and the running program, and the execution surface is what counts them. The order is declared once, in the analysis, and every declared stage appears in it exactly once
3. **The target is digested before and after.** The analysis digests the tree before and after and refuses to publish if a single byte moved. The tree must be quiescent, and no stage writes to it

But: a full run reaches R8 in about three minutes. **Run to the exit; descend with `--through` only if the exit is refused.** The ladder is a diagnostic, not a ritual.

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
| `ZG-CANDIDATES.md` | present **only** when zg is installed and a question was asked, so a missing search tool can never read as a search that found nothing |

- A **candidate** search finds material related to a question whose vocabulary the reader does not yet know. It cannot say what it has missed, so it proposes and nothing more
- The **exhaustive** search (`--rg`) enumerates one literal completely, and says nothing about what that literal means
- Every hit carries its mode's label and its `path:line`. A search hit is a **candidate**, never a finding: open the file and the line, read the surrounding code, and let the reading be the evidence
- **No stage of the analysis reads a zg result.** A vector or BM25 search returns different material on different runs, so it can never participate in a proof. The candidate section is served beside the result, not inside it

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

- **On success**: the stage list that ran, the destination the documents were published to, and the zg availability statement — nothing else
- **On a stage that could not run**: the stage's name, the input it was reading (`root`, `out`, `through`), the reason, and the statement that nothing was published. The run stops; no partial document is emitted
- **An unreadable root** is reported with its path, not as a bare errno
- **An empty target** produces an explicit empty origin spec — a run that looked and found no claim, not a report that might have dropped one
- Report `proved` / `not proved` and nothing else. Whether the reverse engineering succeeded is not a report this command can give

## What this command cannot yet reach

A command file is a prompt. Instructing an operator to run an entrance that does not exist produces either a fabricated success or an abort, and both are worse than silence. So each of these is **named** rather than omitted — the same discipline the instruments apply to unobserved regions, where `unobserved` is a first-class state and is never rendered as "no disagreement".

Of the modules under `workspacify-reverse/lib/`, nine are not reachable from the entrance. Six consequences follow from them:

| # | Absent entrance | What is lost |
|---|---|---|
| **N1** | `sandbox.mjs` / `record-replay.mjs` / `dynamic-surface.mjs` | R2.5's dynamic half. The capability profile reports the activation mechanisms it can read statically and says of the rest that mechanisms leaving no static trace are invisible to a static reading; `observed` is therefore never reached for them |
| **N2** | `worktree-isolation.mjs` | R6.5's execution. The counterexample plan is applied with an empty array, so `COUNTEREXAMPLE-RESULTS.json` is `{empty: true}` and the falsification stage falsifies nothing |
| **N3** | `security-lane.mjs` | R7/R8's security lane. It has no caller outside its unit test, so safety and authority boundaries go unratified (failure mode F15) |
| **N4** | `reflexion.mjs` | R7/R8's adjudication cards. They have no caller outside their unit test, so the logical and the physical boundary can be conflated (failure mode F14) |
| **N5** | *(a defect, not an absence)* | The exit serves a **different shape from the one the spike calibrated**: R7 renders a flat serving capped at 100 rather than the layered decision cards the spike exercised. The design's own anti-decision-fatigue mechanism does not operate at the exit, so most unresolved claims are withheld rather than served |
| **N6** | *(not implemented)* | R0's eligibility assessment. The design requires it to be mechanised and presented at R0; nothing computes it, and the capability profile answers five different questions at R8 instead |

**Read these as absences, not as findings about the subject.** A run that reaches R8 without them is a complete run with six fewer sections. Each is removed by a later ticket in this phase; until then, this section is correct and must not be deleted.

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
- **The exit is refused late in a long run** — re-run with `--through=<the stage before it>` so a complete prefix publishes, and read the prefix. This is what the prefix instrument is for
- **The destination is inside the target** — name a destination outside the tree being measured. This is refused rather than worked around
- **zg is absent** — not an error. Install it only if candidate material is wanted; the analysis is complete without it

## Prohibitions

- Do not treat a zg search result as evidence. A candidate is a place to look
- Do not read `unresolved` as a defect, and do not read a small gap count as quality. "We found no gaps" is not a statement that the implementation is correct
- Do not publish a document into the tree being measured
- Do not re-open a deterministic verdict. The judgement surface is the six items named above, and a seventh is a defect
- Do not use this command to settle whether the reverse engineering succeeded. It produces material; a human judges

## Definition of success

Success for this command is the coexistence of **① a complete analysis** (the run reached R8 and published the origin spec and its sidecar, with the Markdown re-parsing to it) and **② the forward rotation untouched** (its frozen fixtures still reproduce, and the gate still says *proved*). This command says neither "the reverse engineering worked" nor "it failed": the origin spec's `unresolved` claims and the disagreement list against the answer key are what a human reads to decide that, over several rounds, using the ladder above.
