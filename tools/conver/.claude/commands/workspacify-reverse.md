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
  - `--through=<stage>` — stop after an inclusive prefix of the stages (`r0` … `r8`). The default is the last declared stage, so a run without it reaches R8. An unrecognised stage is refused by name rather than ignored, and nothing is published
  - `--query=<text>` — ask zg for candidate material on this question. See Step 4
- It requires no additional dialogue, environment variable, hook or external fetch

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
| `run.mjs detect <root>` | Reports the forward-rotation traces (L1–L4) in a tree as Markdown |
| `run.mjs scrub <root> [--apply]` | Plans, or performs, the removal of the removable traces |
| `run.mjs verify <root>` | Re-detects; exits 0 when no trace remains, 1 otherwise |
| `run.mjs regression <capture\|check>` | Freezes, or reproduces, the forward rotation's observable output. `check` exits 0 only when every frozen value is reproduced |
| `run.mjs holdout [freeze\|isolation <root>]` | Freezes, verifies and isolates the projects generality is measured on |
| `run.mjs oracle <freeze\|delta\|compare>` | Freezes the answer key, measures the delta between the two trees, or lists one stage's disagreements against it. A comparison lists disagreements; it never scores |
| `run.mjs spike <root> <slice>` / `spike reconcile` | Runs one vertical slice and measures it, then adds the disagreement list from the frozen bundle |

## Statuses and gates

The machine's vocabulary is **`proved`** and **`not proved`**, and nothing else. "Succeeded" and "failed" are not available to it, because whether the reverse engineering succeeded is a judgement a human makes after several loop rounds. A comparison against the answer key yields a **list of disagreements**, never a score and never a verdict.

- The forward-rotation gate (`run.mjs regression check`) speaks only of *proved* / *not proved* over the frozen forward fixtures
- `holdout isolation` exits 0 when no ground truth is reachable from the subject tree, 1 otherwise
- The entrance itself exits **0** when the analysis was published, **1** when a stage could not run, **2** on a usage error

## The boundary between design judgement and mechanisation

- **Machine (deterministic)**: the input lock and boundary, the artefact classification, structure and dependency measurement, the execution surface, the semantic extraction, the claim ledger and evidence independence, history, the gap enumeration, the oracle validity, the Red plan and property generation, the origin spec's validation and its Markdown round trip, the target-unchanged proof. These are facts read from the source text and its syntax tree, and they are decided here
- **AI (semantic judgement)**: which boundary is the real one, what a contract *means*, the owner assignment, the over-splitting decision, and the classification of each proposition as `observed` / `inferred` / `normative` / `unresolved`. The material for each of those decisions is placed in front of it as plain English, immediately before the decision — see `R7-SERVING.md` and the origin spec's own prose
- **Not mechanised, deliberately**: `observed` may only ever mean *a fact read from the source text or its syntax tree*. Runtime behaviour, dynamic dispatch targets and generated code are not `observed` without execution, build or trace evidence, so every evidence item carries `evidence_mode`
- Do not widen the AI's judgement surface. The deterministic verdicts are accepted, not re-litigated

## Step 1: probe the environment (zg)

**The purpose of this step**: establish whether candidate discovery can be served at all, before the analysis is run. zg is a search tool; it is **not** deterministically available, which is exactly why it lives in the serving layer.

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze "$ARGUMENTS" --out=<destination>
```

The probe runs as part of the entrance, so there is no separate step to invoke. What it reports:

- **Available** — the version is reported, and candidate material is served (Step 4)
- **Not installed** — stated plainly, with the fix (`npm install -g @zvec/zvec-grep`). This is a **normal condition, not an error**: the analysis runs to completion without it

Do not treat an absent zg as a blocker, and do not simulate one. A run with no search tool is a complete run with one fewer section.

## Step 2: run R0 through R8

**The purpose of this step**: reach the origin spec in one invocation, each stage consuming only what the previous stage produced.

```
R0    the root boundary, the project classification
R0.5  the analysis scope: permissions, the target commit, exclusions, the tree hash
R2.5  the execution surface — entrypoints, DI, reflection, flags, schedulers, queues
R1    the structural measurement: directories, files, languages, lines
R2    the dependency graph, cycles and cohesion
R3    the semantic material: public surface, types, errors, guards, invariants, state machines, effects, tests
R3.5  the claim ledger, bound to its evidence, with evidence independence measured
R4    the archaeology of intent: transitions, co-changes, rationale, decision provenance
R5    what is missing and what contradicts: dead code, untested surface, tautological tests, stubs
R5.5  the oracle's validity: why a surviving mutant survived
R6    the Red each claim needs, planned but not executed
R6.5  the property tests generated from R3's invariants, and the counterexample channel
R7    the serving: what a human still has to decide, as plain Markdown
R8    the origin spec, validated, and its Markdown round trip
```

- **Success condition (to advance)**: the run exits 0 and `ORIGIN-LONG-SPEC.json` and `ORIGIN-LONG-SPEC.md` are present in the destination
- **Why R2.5 precedes R1 and R2**: the dependency graph's caveat has to state how many mechanisms stand between it and the running program, and the execution surface is what counts them. The stage numbering is the design's; the evaluation order is declared once in `ANALYSIS_EVALUATION_ORDER` and asserted to reach every declared stage
- **On failure**: see Step 5

## Step 3: read the report

**The purpose of this step**: put the material for the human's judgement in front of them, in the order they need it.

- `R0-R2-REPORT.md` — the boundary, the structure, the dependencies, the execution surface, and the analysis-attempt ledger. The attempt ledger exists so that `extracted_count: 0` cannot mean both "analysed and found nothing" and "could not analyse"
- `R7-SERVING.md` — the claims a human still has to decide, each with the question that would settle it
- `ORIGIN-LONG-SPEC.md` — the spec itself. Every claim states what would falsify it; the `unresolved` ones say what a human has to decide
- `CAPABILITY-PROFILE.json` — what this analysis can and cannot prove, in five dimensions. It carries **no eligibility verdict**: a profile is material, not a gate

## Step 4: serve the candidates (zg)

**The purpose of this step**: put search material where a reader can see it, labelled so it cannot be mistaken for a finding.

- The **candidate** search (a hybrid of word and meaning) finds material related to a question whose vocabulary the reader does not yet know. It cannot say what it has missed, so it proposes and nothing more
- The **exhaustive** search (`--rg`) enumerates one literal completely, and says nothing about what that literal means
- Every hit carries its mode's label and its `path:line`. A search hit is a **candidate**, never a finding: open the file and the line, read the surrounding code, and let the reading be the evidence
- **No stage of the analysis reads a zg result.** A vector or BM25 search returns different material on different runs, so it can never participate in a proof. The candidate section is served beside the result, not inside it

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze "$ARGUMENTS" --out=<destination> --query="<a question whose vocabulary you do not yet know>"
```

## Step 5: report

**The purpose of this step**: print the outcome in the minimal form the next reader can act on.

- **On success**: the stage list that ran, the destination the documents were published to, and the zg availability statement — nothing else
- **On a stage that could not run**: the stage's name, the input it was reading (`root`, `out`, `through`), the reason, and the statement that nothing was published. The run stops; no partial document is emitted
- **An unreadable root** is reported with its path, not as a bare errno
- **An empty target** produces an explicit empty origin spec — a run that looked and found no claim, not a report that might have dropped one

## Error recovery

- **A stage that could not run** — read the named stage and the input, correct it, and run again. Nothing was written, so there is no partial state to clear
- **The run refused to publish** — the target changed while it was measured. Find what wrote to the tree and run again over a quiescent checkout
- **The destination is inside the target** — name a destination outside the tree being measured. This is refused rather than worked around
- **zg is absent** — not an error. Install it only if candidate material is wanted; the analysis is complete without it

## Prohibitions

- Do not treat a zg search result as evidence. A candidate is a place to look
- Do not read `unresolved` as a defect, and do not read a small gap count as quality. "We found no gaps" is not a statement that the implementation is correct
- Do not publish a document into the tree being measured
- Do not use this command to settle whether the reverse engineering succeeded. It produces material; a human judges

## Definition of success

Success is the coexistence of **① a complete analysis** (the run reached R8 and published the origin spec and its sidecar, with the Markdown re-parsing to it) and **② the forward rotation untouched** (the regression gate still says *proved*). This command says neither "the reverse engineering worked" nor "it failed": the origin spec's `unresolved` claims and the disagreement list against the answer key are what a human reads to decide that, over several loop rounds.
