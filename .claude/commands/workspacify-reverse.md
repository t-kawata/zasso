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

**Role**: Take an existing project that already contains a substantial implementation and run R0 through R8 over it, once, publishing `ORIGIN-LONG-SPEC.json` and the Markdown rendered from it. It is the entrance the two later rotations of the fit loop are called from, not a step a human assembles by hand. It does not decide whether the reverse engineering succeeded: that judgement is a human's, taken after several loop rounds.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: Every incomplete implementation (stub, mock, placeholder, temporary implementation, by any name) **must** carry a `[::STUB::]` marker without exception. This is an absolute, inviolable law; violations are recorded as "crimes" in Malfeasance.json. In all phases of this command, read Malfeasance.json and verify there are no unresolved crimes. If you discover a violation, resolve it immediately, or add the marker and record it on the spot.

## The five-layer loop, and where this command sits

conver is five loops. Four do the work, and the fifth wraps them.

| Layer | What it does |
|---|---|
| **Upstream** | write the canon RFC, graph it, fix the directory boundaries, split it into tickets |
| **Implementation** | implement every ticket, measure the gap against the RFC, repeat until it closes |
| **Shipment** | write the usage README, and drive every RESIDUE to zero |
| **Evolution** | move the canon itself forward, as a difference |
| **Fit — the fifth layer** | partition the workspace into packages, and re-instantiate the four above once per package directory |

**You are here: the fit layer's first of three commands, and the reverse rotation's only one.** It reconstructs the origin spec from an implementation that already exists. `/workspacify-tree` and `/workspacify-allocate` follow it and fix the partition from what it published; the four inner loops begin only after that, one set per package. A project holding no implementation starts the same forward chain at `/workspacify-tree` instead, and reaches the same terminal state.

## Arguments

**It takes no positional arguments, and two options.** The subject is the current working directory and the destination is `workspacify/reverse` beneath it, and neither is selectable.

- **Do not pass `--out`, `--through` or `--query`, and do not pass a bare path.** All four are refused by name, and the run publishes nothing
- **Do not modify the tree while the run is in flight.** The run digests the subject before and after and refuses to publish if a single byte moved outside the destination
- **Two options are yours to pass, and two only.** Both name a file you authored, which is why neither is derivable and neither is refused:
  - `--answers=<path>`, on `run.mjs decide` in Step 5 — the six decisions, one key per judgement
  - `--semantics=<path>`, on `run.mjs analyze` in Step 7 — the design readings, one per cell of the package x item matrix

  Nothing else on the command line is yours: `run.mjs gate` reads `DECISIONS.json` from the reserved directory, `run.mjs readings` reads the spec from it, and no Step passes either a path

## The four principles

The spine of the reverse rotation. Every Step below is an instance of one of them.

1. **Maximise the deterministic analysis.** Whatever can be extracted mechanically is extracted. Fourteen stages run in one command, and you neither run them nor decide when to run them
2. **Minimise the area left to AI judgement.** A decision the machine can settle is never handed to you. The surface is the six items in the next section
3. **Maximise the serving to that area.** For each surviving decision the material is placed in front of it, with `file:line` and `evidence_mode` in prose, with the options and their consequences
4. **The existing tree is absolutely inviolable.** The only writes the whole rotation ever makes are `RFC-SEED.md` and the manifests

## What the machine decides, and what you decide

- **The machine decides, deterministically**: the root boundary and the artefact classification; the structural measurement; the dependency graph, its cycles and its cohesion; the execution surface; the semantic extraction; the claim ledger and the independence of its evidence; history and its quality; the gap enumeration; the oracle's validity; the Red plan and the generated properties; the origin spec's validation and its Markdown round trip; and the proof that the target did not change. These are read from the source text and its syntax tree.

**Its measurements are the material, not the verdict on your work.** Its findings are accepted rather than re-opened — but accepting a measurement is not the same as being excused from reading the code it measured. Where a Step below tells you to open the source, open it: the measurement says where to look, and what the code says is the evidence your decision rests on.

**You decide exactly these six, and nothing else.** Each carries the key the answers file spells and the shape the gate accepts under it. There is no seventh, and an answer under a key not in this list is refused rather than ignored.

1. **`package_boundary`** — the final determination of the package boundary. `{"packages": [{"path": "…", "name": "…"}], "rationale": "…"}`
2. **`owner_assignment`** — owner assignment. `[{"package": "…", "owns": ["…"]}]`
3. **`layer_estimation`** — layer estimation. `[{"package": "…", "layer": "…"}]`
4. **`contract_meaning`** — what a contract *means*. `[{"contract": "…", "meaning": "…"}]`
5. **`over_splitting`** — the over-splitting decision. `{"decision": "…", "rationale": "…"}`
6. **`proposition_classification`** — the classification of each proposition as `observed` / `inferred` / `normative` / `unresolved`. `[{"claim": "…", "class": "observed"}]`

Write all six into the answers file Step 5 hands to the writer, and the gate reads the document that writer publishes. `schemas/workspacify-reverse-decisions.schema.json` beside the rotation is the same six, and it is what refuses a wrong shape.

## The canonical output and its constraints

- The canonical artefacts are `ORIGIN-LONG-SPEC.json` (the sidecar other scripts consume) and `ORIGIN-LONG-SPEC.md` (the Markdown rendered from it, and the form `/workspacify-tree` accepts). They are published into the reserved directory, which is the one region beneath the subject that the digest does not cover: the analysis treats `workspacify/reverse` as outside the target it measures, and refuses to publish if a byte moved anywhere else
- The Markdown re-parses to the sidecar exactly; that round trip is asserted by the run, so the two cannot disagree
- Beside them: `ORIGIN-SPEC-CANDIDATE.json`, `CAPABILITY-PROFILE.json`, `R7-SERVING.md`, `R0-R2-REPORT.md` and the stage sidecars from R0 through R8
- The set is closed: every document published is one a stage produces, so the same tree yields the same set whatever the host has installed
- Nothing is published until every stage has run and the target has shown unchanged, so a run that stops leaves no partial document behind

## Scripts used

Under `.claude/scripts/workspacify-reverse/`.

| Script | Description |
|---|---|
| `run.mjs analyze` | **The entrance.** Runs R0 through R8 in series over the current directory and publishes the origin spec into `workspacify/reverse` beneath it. Exit 0 on success; 1 when a stage could not run or a withdrawn option was passed (the cause is named on stderr); 2 on a usage error |
| `run.mjs gate` | **The check after the run.** Exit 0 when the six decisions are recorded at `workspacify/reverse/DECISIONS.json`; 1 otherwise, with what is missing and the Step to return to named in English |
| `run.mjs pattern` | Step 0. Reports which pattern the subject is: the conver scaffolding present, and the pattern those facts decide. It reads the disk and writes nothing, so it is safe to run before the analysis |
| `run.mjs inventory` | Step 1. Reports what the subject already holds — its artefacts, the lifecycle status of every ticket, its `DesignTree` and its prior partition. It writes to no file |
| `run.mjs decide --answers=<path>` | Step 5. Writes the six decisions the answers file holds, through the schema the gate reads. One of the two paths this procedure passes |
| `run.mjs status` | Steps 3 and 4. Exit 0 when the destination holds every document the exit owes; 1 naming what is absent or empty |
| `run.mjs analyze --semantics=<path>` | Step 7. The entrance again, with the design readings admitted: each reading becomes an `inferred` claim beside the measured ones, or the whole file is refused and nothing is published. It erases the destination before it writes, so Step 7 closes by re-running `decide` |
| `run.mjs readings [--scope=<path>] [--item=<key>]` | Steps 6 and 7. The locator: it prints the matrix, the reading that closes each cell, and the source lines that reading's basis rests on. It judges nothing — whether a reading is true of the code is yours — and the findings it does print are the deterministic ones |
| `run.mjs seam` | Step 8. Reports where the prior partition and the fixed one differ, in both directions. On a subject with no prior partition it exits 0 and states that there is no seam |
| `run.mjs report` | Step 10. Prints the stages that ran, the destination, and `proved` / `not proved` |
| `run.mjs detect` | Reports the forward-rotation traces in the current directory as Markdown. Not used by this procedure |
| `run.mjs scrub [--apply]` | Plans, or performs, the removal of the removable traces, in the current directory. Not used by this procedure |
| `run.mjs verify` | Re-detects in the current directory; exits 0 when no trace remains, 1 otherwise. Not used by this procedure |
| `run.mjs regression <capture\|check>` | Freezes, or reproduces, the forward rotation's observable output. A maintainer's instrument: it measures this repository, not the subject |
| `run.mjs holdout [freeze\|isolation <root>]` | Freezes, verifies and isolates the projects generality is measured on. Not used by this procedure |
| `run.mjs oracle <freeze\|delta\|compare>` | Freezes the answer key, measures the delta between the two trees, or lists one stage's disagreements against it. A comparison lists disagreements; it never scores. Not used by this procedure |
| `run.mjs spike <root> <slice>` / `spike reconcile` | Runs one vertical slice and measures it, then adds the disagreement list from the frozen bundle. Not used by this procedure |

**This procedure invokes the rows that name a Step, and each is reached from the Step that names it.** The rest are the tool's own validation and are marked `Not used by this procedure`; nothing here runs them. One command the procedure runs is not a row here at all, because it belongs to the next rotation rather than to this entrance: Step 9 hands over to `.claude/scripts/workspacify-tree/run.mjs reverse`.

## Statuses and gates

The machine's vocabulary is **`proved`** and **`not proved`**, and nothing else. "Succeeded" and "failed" are not available to it: whether the reverse engineering succeeded is a judgement a human makes after several loop rounds.

There are two kinds of gate, and this file observes the difference:

- **A refusal gate stops the run because of the subject** — "this is not a complete conver project". **None exists and none may be added.** Incompleteness is the input, not a refusal condition, and a subject carrying `RFC-ROOT.md` and `Tickets.json` is a project whose prior work the analysis must read. The forward rotation's frozen fixtures are a maintainer's gate over *this* repository, never a precondition of a run of this procedure
- **A progress gate reports that a Step of this procedure did not produce what it must.** Every Step below carries one. It is a fact about this run, not a verdict on the project, and its output is an instruction: what is wrong, what to do, and the Step to return to

The entrance exits **0** when the analysis was published, **1** when a stage could not run, **2** on a usage error. `run.mjs gate` exits **0** when the decisions are recorded and **1** otherwise.

## Step 0: identify the input

**The purpose of this step**: know which pattern the subject is. It changes what Steps 1 and 6 do, and nothing else.

**Run**:

```bash
node .claude/scripts/workspacify-reverse/run.mjs pattern
```

It reads the disk and names what conver scaffolding is present — root `*-GRAPH.json`, `*-Dirs-Tree.json`, `Tickets.json`, `RFC-*.md`; a per-directory `RFC-SEED.md`; `WORKSPACIFY-*MANIFEST*` — and decides the pattern from it. Presence and absence are facts, read from the filesystem, never inferred by asking. The run re-derives the same answer in R0 and publishes it as `PATTERN.json`, so your reading and the machine's are two documents rather than one impression.

| Pattern | The input project | What must happen |
|---|---|---|
| **Pattern 1** | Independently implemented. No conver artefacts at all | The four layers are **created** |
| **Pattern 2** | Already driven by conver's full four-layer loop: the root holds `RFC-ROOT.md`, `RFC-ROOT-GRAPH.json`, `RFC-ROOT-Dirs-Tree.json`, `Tickets.json`, `DesignTree.json` | The four layers are **re-instantiated per directory**, at finer granularity |
| **Pattern 3** | Partially conver: some artefacts, not the set | What exists is kept, what is missing is created |
| **Pattern 4** | Empty, plus a long specification document | **Pattern 4 does not enter through the reverse rotation.** It goes to `/workspacify-tree` directly; there is nothing to reconstruct |

**Gate**: your reading is re-derived mechanically rather than left as an impression. The run publishes `PATTERN.json`, naming the pattern with the presence and absence material that decided it, so a disagreement between what you read and what the machine read is visible in a document rather than in an argument.

**If the gate fails**: nothing to fix, and nothing to stop for. The pattern is **not** a gate: patterns 1, 2 and 3 all run to R8 through this command, and a subject that is none of the four is still analysed, with the pattern recorded as `undetermined`. Read `PATTERN.json` after Step 2 and carry your reading forward. Return to `## Step 1: record what is already there`.

**Record**: nothing yet. `PATTERN.json` is published by the run in Step 2.

## Step 1: record what is already there

**The purpose of this step**: hold the state the subject arrived in, so that whatever happens downstream is read against it.

**Run**:

```bash
node .claude/scripts/workspacify-reverse/run.mjs inventory
```

It names what is already on disk — the artefacts, the lifecycle status of every ticket, the `DesignTree` and the prior partition — and writes to no file. The inventory is mechanical, which is why it is printed rather than assembled in your notes: what a later Step must not lose is then a document rather than a recollection.

- The artefacts Step 0 found
- The work in flight: the ticket lifecycle statuses in any existing `Tickets.json`, the `DesignTree.json`, and the existing partition. An interrupted cycle's in-flight work is **recorded**, never silently continued and never silently deleted
- On a pattern 2 or 3 subject the existing `RFC-ROOT-Dirs-Tree.json` is **a prior, not the answer**. The act is being taken *because* those boundaries are too coarse

**Gate**: the material you must not lose is named, and its counterpart is on disk. `Tickets.json` and `DesignTree.json` are read where Step 0 found them; nothing is removed to make the record tidier.

**If the gate fails**: a subject holding an interrupted cycle is still analysed, so there is nothing to stop for. Re-read the disk and name what you found, rather than proceeding with an inventory you cannot state. Return to `## Step 0: identify the input`.

**Record**: nothing on disk. Nothing is written to the subject in this Step.

## Step 2: fix the boundary and the scope

**The purpose of this step**: fix, before anything is measured, the conditions under which every later measurement means something.

**Run**:

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze
```

One invocation runs all fourteen stages and publishes. There is no prefix instrument on the command line, and publishing is atomic, so this is the only run there is: a run that stops publishes nothing and leaves no partial state to clean up. **Run to the exit.**

**Gate**: the run exits 0, and `workspacify/reverse` beneath the subject holds what that run published — its verdict block names the destination, the stages that ran, the documents and the assertions it verified. The scope it fixed — the target commit, the tree hash, the directories the digest did not cover, the exclusion rules, the permissions, the external-transmission policy — is read in Step 3, from the record that same run published.

**If the gate fails**: **do not fall back to a prefix and do not re-run blindly.** Nothing was published, so there is no partial result to read. Read the report on stderr: it names the stage, the input it was reading (`root`, `out`, `through`), and the reason. Correct that input — a stage that could not read the tree, a target that moved while it was measured, an option this entrance refuses — and run the same command again: the retry is over corrected input, never over the same bytes, because the same bytes yield the same finding. Return to `## Step 2: fix the boundary and the scope` once that input has changed.

**Record**: the analysis scope, the pattern, the structure, the dependencies, the execution surface, the semantic extraction, the claim ledger, history, the gap enumeration, the Red plan, the generated properties, the serving packet, the origin spec and the capability profile — every document the stages produce, published in one act.

## Step 3: reach the exit

**The purpose of this step**: confirm the exit was reached and read the scope the run fixed, in the order the later measurements need it.

The stages, in the order the machine evaluates them — each written lowercase because it is the identifier the command line matches and the code declares, and every other mention in this file writes the label a reader sees, `R2.5`:

```
r0, r0.5, r2.5, r1, r2, r3, r3.5, r4, r5, r5.5, r6, r6.5, r7, r8
```

Three mechanical facts. Without them every outcome is misread:

1. **Publishing is atomic.** Every document is published once, after every stage in the prefix has run and the target has been re-digested. **A run that stops publishes nothing**, so there is no partial-document state to clean up
2. **There is no command-line prefix instrument** — precisely because of (1). A failure late in a long run costs the whole run, and the command line offers no way to stop earlier and let a complete prefix publish. **The evaluation order is not the stage numbering**: R2.5 runs before R1 and R2, because the dependency graph's caveat has to state how many mechanisms stand between it and the running program, and the execution surface is what counts them. The order is declared once, in the analysis, and every declared stage appears in it exactly once. The `analyzeProject` API still takes `through`, so a prefix is reachable from a program — but not from here, and this step must not pretend otherwise
3. **The target is digested before and after.** The analysis digests the tree before and after and refuses to publish if a single byte moved outside the reserved destination. The tree must be quiescent, and no stage writes to it

**Run**:

```bash
node .claude/scripts/workspacify-reverse/run.mjs status
```

The entrance reached R8 in Step 2; publishing is atomic, so there is no second invocation to make and no prefix to reach for. This command reads the destination and exits 0 only when it holds every document the exit owes, naming any that is absent or empty.

**Gate**: `ANALYSIS-SCOPE.json` opens the reading, and the exit's two documents are present beside it. Read the scope **before** any other document, because it is the record of what every later measurement is a measurement *of*; then confirm `ORIGIN-LONG-SPEC.json` and `ORIGIN-LONG-SPEC.md` are both in the destination.

**If the gate fails**: the run did not reach the exit, and the report from Step 2 named why. Return to `## Step 2: fix the boundary and the scope` and run it again; there is no prefix to fall back to and nothing to clean up.

**Record**: nothing. This Step reads what Step 2 published.

## Step 4: read the material in the order it is needed

**The purpose of this step**: take the material for your six decisions in the order the decision needs it, not the order it was produced.

The six are the numbered list under **What the machine decides, and what you decide** — `package_boundary`, `owner_assignment`, `layer_estimation`, `contract_meaning`, `over_splitting`, `proposition_classification`. Each row below names the decisions it is the material for, so a document is read for a reason rather than in passing.

| Document | The question it answers | The decisions it is material for |
|---|---|---|
| `R0-R2-REPORT.md` | the boundary, the structure, the dependencies, the execution surface — and the **analysis-attempt ledger**, which exists so that `extracted_count: 0` cannot mean both "analysed and found nothing" and "could not analyse" | `package_boundary`, `owner_assignment`, `layer_estimation`, `over_splitting` |
| `CLAIM-LEDGER.json` | the claims, with their evidence groups and how independent those groups are | `contract_meaning`, `proposition_classification` |
| `R7-SERVING.md` | the claims a human still has to decide, each with the question that would settle it | `contract_meaning`, `proposition_classification` |
| `ORIGIN-LONG-SPEC.md` | the spec itself. Every claim states what would falsify it; the `unresolved` ones say what a human has to decide | all six |
| `CAPABILITY-PROFILE.json` | what this analysis can and cannot prove, in five dimensions. It carries **no eligibility verdict** | none of the six: it states the limit every one of them is made inside |

**Run**:

```bash
node .claude/scripts/workspacify-reverse/run.mjs status
```

It prints every document the destination holds and the state of each — `present`, `absent` or `empty` — and exits 0 only when the three the exit owes are all present. A document in the reading set that is `absent` is printed and is **not** a failure: the analysis publishes such a document only when its depth reached the stage that produces it. The exit code is therefore a check on the three, not on the five, and this Step's gate is over the five — so read the table rather than the exit code. Then open the source. A measurement tells you where to look; it is not the evidence. For every claim your six decisions touch, open the file and line the measurement names, read the surrounding code, and let that reading be what the decision rests on. No stage of this analysis reads a search result, and neither do you: a search is a place to look, never a finding.

**Gate**: the five documents above are present in the destination and non-empty — read from the table `status` prints, because an `absent` reading document does not change its exit code — and `ORIGIN-LONG-SPEC.md` is the spec you are deciding about rather than a stage sidecar.

**If the gate fails**: the set is closed and every document in it is one a stage published, so a missing one means the run did not reach the exit. Return to `## Step 2: fix the boundary and the scope`.

**Record**: nothing on disk. What you read is the material for Step 5.

## Step 5: decide the partition

**The purpose of this step**: take the load-bearing decision of the six, and record all six. Everything downstream is instantiated from the package boundary.

Decide the package boundary — the first of the six. Because the terminal state is a per-directory re-instantiation of the four layers, **a wrong partition does not produce one wrong file; it produces a whole wrong structure, in every directory, at every level.** A hallucinated specification is what a boundary decided carelessly becomes.

**Run**: author the six answers as **one JSON object, one key per decision, the six keys the list above names and no seventh** — and hand them to the writer rather than writing the document by hand. The subject is fixed and the destination is derived, so the only path on this line is the answers file you authored:

```bash
node .claude/scripts/workspacify-reverse/run.mjs decide --answers=<path to your answers.json>
node .claude/scripts/workspacify-reverse/run.mjs gate
```

The object holds exactly the six keys, each with the answer that key carries:

```json
{
  "package_boundary": { "packages": [{ "path": ".", "name": "root" }], "rationale": "…" },
  "owner_assignment": [{ "package": ".", "owns": ["…"] }],
  "layer_estimation": [{ "package": ".", "layer": "…" }],
  "contract_meaning": [{ "contract": "…", "meaning": "…" }],
  "over_splitting": { "decision": "…", "rationale": "…" },
  "proposition_classification": [{ "claim": "…", "class": "observed" }]
}
```

A key left out, a key added, or an answer whose shape the schema refuses is refused as a whole: nothing is written, and the destination keeps no partial document to repair. `schemas/workspacify-reverse-decisions.schema.json` is where that shape is declared, and the writer applies it rather than trusting the file.

**Gate**: all six are recorded in `workspacify/reverse/DECISIONS.json`, each with the material it was decided from, and `run.mjs gate` exits 0. R2's cohesion, dependency density, SCC condensation, co-change history and boundary-crossing call counts are the ground the decision stands on — they are not decoration.

**If the gate fails**: the gate names every answer that is missing, every document the run did not publish, and the Step to return to. Answer the missing items in the document, or return to Step 2 if the material is what is absent — the answers file is yours to rewrite, so this Step always has something to change, and re-running it over an unchanged answers file yields the same findings. Do not add a seventh answer: the surface is closed to six, and a seventh is a defect in the procedure. Return to `## Step 5: decide the partition` once the answers have changed.

**Record**: `workspacify/reverse/DECISIONS.json` — the six decisions, each beside the material it was made from.

## Step 6: author the design semantics

**The purpose of this step**: say what the measurements mean, at every package.

The analysis measures, and a measurement is not an interpretation. It states that a reference
exists at a line; it cannot state what the package is for, what it guarantees, why its boundary
is where it is. That is the design reading, it is an engineer's to write, and the spec is not
published with the rest of its content until it is written.

**The unit is the package, not the document.** One reading set for the whole spec is not what is
asked for: each package owes an answer to each of the 21 items, and a file that fills one package
and leaves the next is refused whole. Read the list before writing:

```bash
node .claude/scripts/workspacify-reverse/run.mjs readings
```

It prints the matrix as it stands — every cell, and whether a reading closes it — and for each
cell it names the question that has to be answered. Narrow it when you want one package or one
item at a time:

```bash
node .claude/scripts/workspacify-reverse/run.mjs readings --scope=src/api --item=purpose
```

**Run**: author the readings file as one JSON object with two keys, and hand it to the entrance
rather than writing the document by hand.

```json
{
  "readings": [
    {
      "scope": "src/api",
      "item": "purpose",
      "statement": "src/api owns the request lifecycle, so no caller outside it observes a half-built request",
      "falsification": "publish a request from src/state before the guard at src/api/login.rs:7 returns, and observe whether a consumer reads it as open",
      "basis": ["clm-login-boundary_crossing-1"]
    }
  ],
  "declined": [
    { "scope": "src/build", "item": "concurrency", "reason": "this package runs single-threaded and holds no concurrent state" }
  ]
}
```

- **Every cell is either a reading or a decline.** A decline needs a reason a reader can weigh; `N/A` and `none` are refused by name
- **`basis` names the measured claims the reading rests on**, and every id must exist. A reading is an inference beside the measurements, never a measurement
- **`falsification` names something a reader could go and do** — a `file:line` or a command. An interpretation nobody can refute is indistinguishable from a preference
- **A reading may not repeat the measurement**, reuse another cell's sentence, or re-open a measured claim by naming an id, a `claim_type` or evidence

Then close every cell whose basis the run has not changed, re-read the source where it has, and hand the file over:

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze --semantics=<path to your readings.json>
```

**Gate**: exit 0, and `readings` reports every cell closed and every basis resolving. The readings appear as `clm-design-*` claims under their own package in `## Packages`, and `## Design semantics` records what was written and what was declined.

**Record**: the readings file you wrote and the destination the re-run published. What it records is not a summary of your work: each reading is a claim in the spec carrying the `item` it answers, the basis it rests on and the falsification that would refute it, and each decline is a cell recorded as deliberately left open with the reason you gave.

**If the gate fails**: the refusal names the cell, the rule and the act that fixes it, and **nothing is published** — so there is no partial spec to repair. Correct the file and run the same command again. A cell you cannot answer is a decline, not a gap: decline it with the reason, and the matrix closes.

## Step 7: inspect, repair and reinforce the semantics

**The purpose of this step**: judge the readings against the code, not against their own wording.

Step 6 establishes that every cell is closed. That is a statement about the file, not about the
subject: 21 fields can be filled with true sentences that say nothing. Whether a reading is *true
of this package* is a judgement, and no script makes it — which is why this step is yours and why
the tool it runs shows you evidence rather than a verdict.

**Run**: the locator over the cells you are judging.

```bash
node .claude/scripts/workspacify-reverse/run.mjs readings --scope=<path> --item=<key>
```

For each cell it prints the reading, the measured claims it rests on, the `file:line` each of
those anchors to, and a bounded window of the source around each anchor.

**Then open the file.** The window is where to look, not the evidence — a reading whose subject is
larger than the window cannot be judged from it. Ask of each cell:

- is the statement **true of this code**, or is it true of the file's wording?
- does it name the **right** invariant, owner, counterpart — or one that merely sounds plausible?
- is there something this package owes a reader that none of the 21 items has caught?

Repair what is wrong and reinforce what is thin: reword a sentence that restates the measurement,
replace a counterpart that does not exist, add the reading a package was declined out of laziness
rather than honesty.

**Gate**: `readings` exits 0, **and** `run.mjs gate` exits 0 after the closing write, because the
entrance erases the destination before it writes and `DECISIONS.json` is not a published document:

```bash
node .claude/scripts/workspacify-reverse/run.mjs decide --answers=<the same answers file>
node .claude/scripts/workspacify-reverse/run.mjs gate
```

**Record**: the repaired readings file, the cell each repair was about, and the source you read it
against — the `file:line` `readings` printed. A repair that changed a statement without opening the
file it describes is a rewording, and the record is what lets a reader tell the two apart.

**If the gate fails**: `readings` names the cell that is still open, and the correction is the one
Step 6 describes. A `gate` failure after a re-run is the erasure described above, not a wrong
decision: re-run `decide` with the same answers file and the same decisions are written again.

## Step 8: record the seam

**The purpose of this step**: record the discontinuity, on the subjects where there is one.

**Run**:

```bash
node .claude/scripts/workspacify-reverse/run.mjs seam
```

**Pattern 1 has no seam — skip to Step 9**, and the command states that itself rather than leaving you to decide it. Patterns 2 and 3 record it here, from the two directions the command prints: what only the prior partition carries, and what only the fixed one does.

- The old partition, the work in flight, and the difference between the two — **recorded, never eliminated**
- The old `RFC-ROOT-Dirs-Tree.json` is a prior, not the answer. The act was taken *because* those boundaries are too coarse
- Nothing in the subject is removed to make the record tidier

**Gate**: the two partitions the seam is computed from are both readable — the prior at `RFC-ROOT-Dirs-Tree.json` in the subject, the fixed one inside `ORIGIN-LONG-SPEC.json` in the destination — and `run.mjs seam` exited 0 on both directions. On pattern 1 there is no prior partition, so there is no seam to name, and `PATTERN.json` says so.

**If the gate fails**: the command names which partition document it could not read, and the corrective act is on that document — repair it, or move it aside, and run the same command again. A partition that is present and unreadable is not a subject without one, so the one thing that does not help is re-running over the same bytes: the same unreadable file yields the same finding. If the document cannot be repaired and must not be moved, then the seam cannot be computed here, and the record says so rather than being guessed at. Return to `## Step 8: record the seam` once the document, and not the command, has changed.

**Record**: nothing on disk in this Step, and the seam's durable home is downstream rather than here. `/workspacify-tree` reverse publishes it into `ARCHITECTURE-DELTA.json` at the workspace root when the subject carries a prior partition, computing it from the same two documents this Step read. What this Step records is the printed seam, carried into the hand-over as the statement of what the next rotation is about to meet.

## Step 9: hand over

**The purpose of this step**: place the spec where the next command reads it.

**Run**:

```bash
node .claude/scripts/workspacify-tree/run.mjs reverse
```

The next rotation's reverse mode consumes `ORIGIN-LONG-SPEC.md` from `workspacify/reverse` and produces the partition's machinery. The bare `/workspacify-tree` is **not** this command: it enters the forward rotation, whose Steps parse a specification the operator names, and `resolveTreeMode` returns forward for a mode that is absent or unrecognised. That run is where this procedure's responsibility ends: `/workspacify-allocate` and the four inner loops come after it, and this Step neither drives nor waits on them.

**Gate**: `ORIGIN-LONG-SPEC.md` and `ORIGIN-LONG-SPEC.json` are present in `workspacify/reverse` beneath the directory the command was run in, and the decisions document the gate accepted is beside them.

**If the gate fails**: the hand-over is the published document and nothing else, so a missing one means the run did not reach the exit. Return to `## Step 2: fix the boundary and the scope`.

**Record**: nothing further. What changes between one round and the next is the human's answers to the `unresolved` claims, which return through the existing residual → grill → RFC path. **No separate human-norm-setting stage exists and none may be created.**

## Step 10: report

**The purpose of this step**: print the outcome in the minimal form the next reader can act on.

**Run**:

```bash
node .claude/scripts/workspacify-reverse/run.mjs report
```

It prints the stages that ran, the destination the documents were published to, and `proved` / `not proved` — read from what the run published, so the report is a reading rather than a recollection. Nothing else goes in it.

**Gate**: the report carries the stage list that ran, the destination the documents were published to, and `proved` / `not proved` — and nothing else. Whether the reverse engineering succeeded is not a report this command can give.

**If the gate fails**: the command says which of the three it could not read. When it names a destination holding nothing, the entrance did not reach the exit and the return is Step 2 — re-running this Step over the same destination reports the same absence. When it names a stage list or an outcome the report does not carry, you are about to report something this command cannot know: read the exit code and the verdict block again, and report only what they say. Return to `## Step 10: report` once the destination, and not the command, has changed.

**Record**: nothing on disk.

- **On a stage that could not run**: the stage's name, the input it was reading, the reason, and the statement that nothing was published
- **An unreadable root** is reported with its path, not as a bare errno
- **An empty target** produces an explicit empty origin spec — a run that looked and found no claim, not a report that might have dropped one

## The terminal state this command serves

This command reaches R8 and hands over; the terminal state is reached downstream. It is stated here so that "the exit was reached" has a shape, and so that no reader is left to decide for themselves whether it was.

The fifth layer of the fit loop — the outer shell wrapping the four inner rotations — partitions the workspace into packages and re-instantiates the four-layer set once per package directory. The fifth layer wraps the four; it is not a fifth set stacked on top of them. The terminal state is:

- Every package, the workspace root included under the path `.`, holds its complete four-layer set: `RFC-<PKG>.md`, `RFC-<PKG>-GRAPH.json`, `RFC-<PKG>-Dirs-Tree.json`, `Tickets.json`, and the three `RFC-<PKG>-{GRAPHIFY,BOUNDIFY,SPLIT}-Status.json`
- One `RFC-SEED.md` per package directory
- The partition is explicit: `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json` and `ARCHITECTURE-DELTA.json` at the root
- Every inconsistency is recorded — a named, located disagreement between two artefacts, never resolved by preferring one silently

**Do not judge this.** A subject at the end of this command is *not* at the terminal state, and that is correct: reaching it is the work of the two later rotations. The instrument that measures it is `.claude/scripts/workspacify-reverse/lib/terminal-state.mjs`, which reports an L-rung and a `proved` / `not proved` outcome and is driven by `/workspacify-tree` and `/workspacify-allocate`, each of which has its own gate over its own decisions document. A package whose four-layer set is complete is not a project proved correct; nothing reaches the terminal state by being declared finished.

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

## Error recovery

Every failure below names where to go back to. Nothing here is a question, and none of them ends the work.

**How the loop moves.** A Step is re-entered only after something it reads has changed. Running the same command over the same bytes produces the same finding, so that is not a retry — it is the same measurement taken twice. Before returning to a Step, change what the message named: the tree, the answers file, the partition document, the option on the command line. When the message names nothing you can change, the failure is a fact about the subject rather than a task, and the way forward is the Step that can still make progress: publish what the analysis could reach, and let the record say what it could not. **A finding is never a reason to stop, and never a reason to end the run without the origin spec.**

**The loop ends when the origin spec exists.** `ORIGIN-LONG-SPEC.json` and `ORIGIN-LONG-SPEC.md` in `workspacify/reverse` beneath the subject, and `run.mjs gate` exiting 0 over the six decisions, are the whole of what this procedure owes. Nothing here is a precondition of that: not a complete conver project, not a prior partition, not an answer to any `unresolved` claim, not a human's verdict on whether the reverse engineering succeeded. **Do not end the run by reporting that it could not be done.** An analysis that reaches R8 with every claim `unresolved` has done its work; an analysis that stopped before publishing has not, and the route back from every such stop is in this table.

| What you see | What it means | Return to |
|---|---|---|
| A stage that could not run | The named stage could not read its input. Nothing was published | `## Step 2: fix the boundary and the scope` |
| The run refused to publish | The target changed while it was measured. Nothing was published | `## Step 2: fix the boundary and the scope`, over a quiescent checkout |
| `analyze --semantics=` refuses the readings | The refusal names the cell, the rule and the act. Nothing was published, so there is no partial spec to repair | `## Step 6: author the design semantics`, once the file has changed |
| `readings` reports a cell still open after the entrance admitted the file | The file and the document have parted: the run that admitted it is not the one the destination holds | `## Step 7: inspect, repair and reinforce the semantics` |
| `gate` is red after a semantics re-run | The entrance erases the destination before it writes and `DECISIONS.json` is not a published document, so the decisions were removed rather than refused | `## Step 7: inspect, repair and reinforce the semantics` — re-run `decide` with the same answers file |
| The exit was refused late in a long run | The named stage and the input it was reading are the finding. There is no prefix to fall back to | `## Step 2: fix the boundary and the scope` |
| The documents are not where they were looked for | They are in `workspacify/reverse` beneath the directory the command was run in, and nowhere else | `## Step 9: hand over` |
| A withdrawn option or a bare argument was passed | Not a warning. The entrance names the token and publishes nothing | Re-run without it; nothing to correct |
| `run.mjs gate` names an unanswered item | The procedure's own Step 5 did not finish. No document the run publishes is affected | `## Step 5: decide the partition` |
| `run.mjs gate` names material that was not published | The entrance did not reach the exit, so the decision has no material | `## Step 2: fix the boundary and the scope` |
| `run.mjs seam` names a partition document it could not read | The document is corrupt, not absent. The same bytes yield the same finding | `## Step 8: record the seam`, once the document has been repaired or moved aside |
| `run.mjs report` names a destination holding nothing | The entrance did not reach the exit | `## Step 2: fix the boundary and the scope` |

## Prohibitions

- Do not treat a search result as evidence. A candidate is a place to look
- Do not read `unresolved` as a defect, and do not read a small gap count as quality
- Do not publish a document into the region the digest covers. The reserved directory beneath the subject is the one place the analysis writes, and it is the only region the digest excludes
- Do not re-open a measurement. The judgement surface is the six items named above, and a seventh is a defect
- Do not use this command to settle whether the reverse engineering succeeded. It produces material; a human judges
- Do not add a gate that refuses the subject. Only a Step of this procedure can fail a gate

## Definition of success

Success for this command is the coexistence of **① a complete analysis** (the run reached R8 and published the origin spec and its sidecar, with the Markdown re-parsing to it, and `run.mjs gate` reporting the six decisions recorded) and **② the forward rotation untouched** (its frozen fixtures still reproduce, and the gate still says *proved*).

The loop does not end before ① holds. Neither half is optional and neither has a substitute: an analysis that stopped short is not a smaller success, and a report that the analysis could not be completed is not this command's outcome at all. The route back from every stop is in **Error recovery**, and the only thing that closes the work is the origin spec existing in the destination.
