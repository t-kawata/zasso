---
description: Run R0 through R8 over an existing implementation and publish the origin spec (the entrance to the reverse rotation)
argument-hint: ""
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /workspacify-reverse

Role: take an existing project with substantial implementation; run R0–R8 once; publish `ORIGIN-LONG-SPEC.json` and rendered Markdown. Entrance to the two later fit-loop rotations, not a hand-assembled human step. It does not judge whether reverse engineering succeeded; that judgement follows several loop rounds.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

First-Class Rule — `[::STUB::]`: every incomplete implementation—stub, mock, placeholder, temporary implementation, any name—must carry `[::STUB::]`. Read `Malfeasance.json` in every phase; verify no unresolved crimes. On violation: resolve immediately, or add marker and record immediately.

## The five-layer loop, and where this command sits

conver: four working loops plus fit wrapper.

| Layer | Does |
|---|---|
| Upstream | canon RFC → graph → directory boundaries → tickets |
| Implementation | implement tickets; measure RFC gap; repeat until closed |
| Shipment | usage README; every RESIDUE → zero |
| Evolution | move canon forward as difference |
| Fit | partition workspace; re-instantiate preceding four per package directory |

This is fit’s first of three commands and reverse rotation’s only command. It reconstructs origin spec from existing implementation. Downstream tree builder and allocator consume its publication; inner loops begin only afterwards, per package. A no-implementation project enters forward tree builder directly and reaches the same terminal state.

## Arguments

No positional arguments. Subject: current working directory. Destination: `workspacify/reverse` beneath it. Neither selectable.

- Refused: `--out`, `--through`, `--query`, bare path → no publish
- Tree immutable during run: pre/post digest; any byte change outside destination → refuse publish
- Permitted supplied paths only:
  - `run.mjs decide --answers=<path>` in Step 5: six decisions
  - `run.mjs analyze --semantics=<path>` in Step 7: one design reading per package×item cell
- `gate` reads reserved `DECISIONS.json`; `readings` reads reserved spec; no other Step passes a path

## The four principles

1. Maximise deterministic analysis: extract every mechanically extractable fact; fourteen stages run in one command; do not choose stages or timing.
2. Minimise AI judgement: never delegate a machine-settleable decision; judgement surface is exactly six items.
3. Maximise serving to remaining judgement: for every decision provide `file:line`, `evidence_mode`, alternatives, and consequences.
4. Existing tree inviolable: rotation writes only declared artifacts; no analysis stage writes target tree.

## What the machine decides, and what you decide

Machine decides deterministically: root boundary/artifact classification; structural measurement; dependency graph/cycles/cohesion; execution surface; semantic extraction; claim ledger/evidence independence; history/quality; gaps; oracle validity; Red plan/generated properties; origin-spec validation/Markdown round trip; unchanged-target proof. Measurements are material, not verdict. Accept measurement; still inspect code when directed. Locator/search is a place to look, never evidence.

Decide exactly six, nothing else. Schema rejects absent, extra, or invalid key.

1. `package_boundary`: `{"packages":[{"path":"…","name":"…"}],"rationale":"…"}`
2. `owner_assignment`: `[{"package":"…","owns":["…"]}]`
3. `layer_estimation`: `[{"package":"…","layer":"…"}]`
4. `contract_meaning`: `[{"contract":"…","meaning":"…"}]`
5. `over_splitting`: `{"decision":"…","rationale":"…"}`
6. `proposition_classification`: `[{"claim":"…","class":"observed"}]`, class ∈ `observed|inferred|normative|unresolved`

Writer validates against `schemas/workspacify-reverse-decisions.schema.json`.

## The canonical output and its constraints

- Canon: `ORIGIN-LONG-SPEC.json` (sidecar downstream consumes); `ORIGIN-LONG-SPEC.md` (render; downstream tree-builder input)
- Companions: `ORIGIN-SPEC-CANDIDATE.json`, `CAPABILITY-PROFILE.json`, `R7-SERVING.md`, `R0-R2-REPORT.md`, R0–R8 sidecars
- Destination is sole digest-excluded target region. Byte change elsewhere → no publish
- Markdown reparses exactly to JSON sidecar
- Published set closed: every file stage-produced; identical tree → identical set regardless of host
- Publish atomic: all stages run and target unchanged, then publish once; stop → no partial document

## Scripts used

Base: `.claude/scripts/workspacify-reverse/`.

| Script | Contract |
|---|---|
| `run.mjs analyze` | Entrance; R0–R8 serial; publish reserved origin spec. 0 published; 1 stage failure/withdrawn option, cause on stderr; 2 usage |
| `run.mjs gate` | 0 iff all six decisions in reserved `DECISIONS.json`; 1 otherwise, names missing and return Step |
| `run.mjs pattern` | Step 0; read-only scaffolding/pattern report |
| `run.mjs inventory` | Step 1; read-only artifacts, ticket lifecycle, DesignTree, prior partition |
| `run.mjs decide --answers=<path>` | Step 5; schema-backed decision write |
| `run.mjs status` | Steps 3–4; 0 iff exit-owed docs present; 1 names absent/empty |
| `run.mjs analyze --semantics=<path>` | Step 7; admit readings as inferred claims or refuse all/no publish; erases destination before write |
| `run.mjs readings [--scope=<path>] [--item=<key>]` | Steps 6–7; matrix, cell closure, source anchors; no truth verdict |
| `run.mjs seam` | Step 8; bidirectional prior/fixed partition difference; no prior → 0/no seam |
| `run.mjs report` | Step 10; stages, destination, `proved|not proved` |

Not used by this procedure: `detect`, `scrub [--apply]`, `verify`, `regression <capture|check>`, `holdout [freeze|isolation <root>]`, `oracle <freeze|delta|compare>`, `spike <root> <slice>`, `spike reconcile`. Step 9 invokes `.claude/scripts/workspacify-tree/run.mjs reverse`.

## Statuses and gates

Machine vocabulary: `proved` / `not proved` only; never succeeded/failed. Reverse-engineering success is post-loop human judgement.

No refusal gate over subject may exist: incompleteness is input; existing `RFC-ROOT.md`/`Tickets.json` are prior work to read. Frozen forward fixtures are maintainer gate over this repository, never subject precondition. Every gate below is progress gate: reports a Step’s missing output, correction, return Step. `analyze`: 0 published, 1 stage could not run, 2 usage. `gate`: 0 decisions recorded, 1 otherwise.

## Step 0: identify the input

Run: `node .claude/scripts/workspacify-reverse/run.mjs pattern`

Read filesystem facts: root `*-GRAPH.json`, `*-Dirs-Tree.json`, `Tickets.json`, `RFC-*.md`, per-directory `RFC-SEED.md`, `WORKSPACIFY-*MANIFEST*`; determine pattern. R0 re-derives and publishes `PATTERN.json`.

| Pattern | Input | Must happen |
|---|---|---|
| 1 | independently implemented; no conver artifacts | create four layers |
| 2 | complete root four-layer artifacts | re-instantiate per directory, finer |
| 3 | partial conver | retain existing; create missing |
| 4 | empty + long specification | do not enter reverse; enter tree builder directly |

Gate: pattern is mechanically derived, not impression. It is not refusal: patterns 1–3 and `undetermined` run to R8. Fail: read published `PATTERN.json` after Step 2; carry it; Step 1. Record: none.

## Step 1: record what is already there

Run: `node .claude/scripts/workspacify-reverse/run.mjs inventory`

Read artifacts, ticket lifecycle, `DesignTree.json`, prior partition. Interrupted work: record; never silently continue/delete. Pattern 2/3 root dirs tree: prior, not answer. Gate: material named and counterpart remains on disk; no tidying write. Fail: reread/name disk; Step 0. Record: none.

## Step 2: fix the boundary and the scope

Run: `node .claude/scripts/workspacify-reverse/run.mjs analyze`

One invocation, fourteen stages, no CLI prefix; run to exit. Gate: exit 0; verdict names destination, stages, docs, assertions; scope records commit/hash, digest exclusions, exclusion rules, permissions, external-transmission policy.

Fail: no prefix, no blind rerun, no partial read. Read stderr stage/input (`root|out|through`)/reason; correct named input, then re-run Step 2 over changed input only. Record: all analysis scope, pattern, structure, dependencies, execution surface, semantics, claim ledger, history, gaps, Red plan, generated properties, serving packet, origin spec, capability profile; one atomic act.

## Step 3: reach the exit

Order: `r0, r0.5, r2.5, r1, r2, r3, r3.5, r4, r5, r5.5, r6, r6.5, r7, r8`; dependency order, not numeric order.

Mechanical facts:
- Every stage completes; target re-digest; all documents publish once. Stop → no partial document/no cleanup state.
- CLI has no prefix instrument. `analyzeProject(... through ...)` is API-only; never use it here.
- Pre/post digest target. Any byte outside reserved destination → refuse publish. No stage writes target tree.

Run: `node .claude/scripts/workspacify-reverse/run.mjs status`

Gate: read `ANALYSIS-SCOPE.json` before all else; confirm both origin files present. Fail: Step 2; no prefix or cleanup. Record: none.

## Step 4: read the material in the order it is needed

Run: `node .claude/scripts/workspacify-reverse/run.mjs status`

Read non-empty: `R0-R2-REPORT.md` (boundary/structure/dependencies/execution/attempt ledger; distinguishes `extracted_count:0` found-none from could-not-analyse); `CLAIM-LEDGER.json` (claims/evidence independence); `R7-SERVING.md` (unsettled question); `ORIGIN-LONG-SPEC.md` (all six/falsification); `CAPABILITY-PROFILE.json` (five proof limits; no eligibility verdict). `status` exit validates exit documents, not this five-document gate. For every decision-touching claim: open named `file:line` and surrounding source. Gate: all five present/non-empty. Fail: Step 2. Record: none.

## Step 5: decide the partition

Create exactly one JSON object with exactly six keys; writer, never hand-write destination.

```json
{"package_boundary":{"packages":[{"path":".","name":"root"}],"rationale":"…"},"owner_assignment":[{"package":".","owns":["…"]}],"layer_estimation":[{"package":".","layer":"…"}],"contract_meaning":[{"contract":"…","meaning":"…"}],"over_splitting":{"decision":"…","rationale":"…"},"proposition_classification":[{"claim":"…","class":"observed"}]}
```

```bash
node .claude/scripts/workspacify-reverse/run.mjs decide --answers=<path>
node .claude/scripts/workspacify-reverse/run.mjs gate
```

Gate: all six beside their material in `DECISIONS.json`; gate 0. Grounds include R2 cohesion, dependency density, SCC condensation, co-change history, boundary-crossing calls. Missing/extra/invalid → whole refusal/no partial write. Fail: missing answer → change answers, Step 5; missing material → Step 2. Record `DECISIONS.json`.

## Step 6: author the design semantics

Unit: every package × every 21 items. Every cell: reading or reasoned decline; `N/A`/`none` refused. Reading is inference, not measurement; `basis` is existing measured-claim-id array; falsification is executable `file:line` or command; no measurement repetition, duplicate cell sentence, or reopening claim via id/type/evidence.

```bash
node .claude/scripts/workspacify-reverse/run.mjs readings
node .claude/scripts/workspacify-reverse/run.mjs readings --scope=src/api --item=purpose
```

```json
{"readings":[{"scope":"src/api","item":"purpose","statement":"src/api owns the request lifecycle, so no caller outside it observes a half-built request","falsification":"publish a request from src/state before the guard at src/api/login.rs:7 returns, then observe consumer state","basis":["clm-login-boundary_crossing-1"]}],"declined":[{"scope":"src/build","item":"concurrency","reason":"single-threaded; no concurrent state"}]}
```

Re-read source where basis changed. Run: `node .claude/scripts/workspacify-reverse/run.mjs analyze --semantics=<path>`. Gate: 0; all cells closed/bases resolve; `clm-design-*` claims under packages; design-semantics section records readings/declines. Fail: correct named cell/rule/action, then rerun after file changes; no partial publish. Record readings file/destination.

## Step 7: inspect, repair and reinforce the semantics

For each cell: `node .claude/scripts/workspacify-reverse/run.mjs readings --scope=<path> --item=<key>`; open anchored source. Locator window is not evidence. Judge code truth, correct invariant/owner/counterpart, and uncaught reader obligation. Repair false/thin reading or dishonest decline.

Repair evidence: record repaired cell, inspected source, locator `file:line`. Changed wording without opening described source is rewording, not repair.

```bash
node .claude/scripts/workspacify-reverse/run.mjs decide --answers=<same path>
node .claude/scripts/workspacify-reverse/run.mjs gate
```

Gate: readings 0 and gate 0. Semantics analyze erased destination; `DECISIONS.json` is not published; re-run decide. Fail: open cell → Step 6 after correction; red gate → Step 7, same answers. Record repaired file/cell/source anchor.

## Step 8: record the seam

Run: `node .claude/scripts/workspacify-reverse/run.mjs seam`

Pattern 1: no seam; skip Step 9. Patterns 2/3: retain old partition, work in flight, bidirectional difference; never eliminate to tidy. Old root dirs tree is prior, not answer. Gate: readable prior root tree and fixed destination spec; seam 0 in both directions. Fail: repair/move named corrupt partition then Step 8; same bytes do not help. If immovable, record uncomputable seam; never guess. Record no disk artifact here; downstream reverse tree builder publishes `ARCHITECTURE-DELTA.json`.

## Step 9: hand over

Run: `node .claude/scripts/workspacify-tree/run.mjs reverse`

Reverse tree builder consumes reserved Markdown. Bare tree builder is forward mode; never use it here. Responsibility ends here; do not run/wait for allocator or inner loops. Gate: both origin files and accepted decisions beside them. Fail: Step 2. No separate human norm-setting stage; later unresolved answers return by residual → grill → RFC path. Record none.

## Step 10: report

Run: `node .claude/scripts/workspacify-reverse/run.mjs report`

Report/gate only: stage list, destination, `proved|not proved`; nothing else. Fail: empty destination → Step 2; absent required report field → reread exit/verdict; report only known field; Step 10 after destination change. Unreadable root: report path, not bare errno. Empty target: explicit empty origin spec. Record none.

## The terminal state this command serves

Not reached here. Downstream terminal state: every package including root `.` has complete four-layer set (`RFC-<PKG>.md`, graph, dirs tree, `Tickets.json`, three graphify/boundify/split status files); one `RFC-SEED.md` per package; root `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json`, `ARCHITECTURE-DELTA.json`; every inconsistency named/located, never silently preferred. `lib/terminal-state.mjs` measures whole chain under downstream gates. Do not declare terminal correctness from complete package set.

## What this command cannot yet reach

Closure is measured, not remembered: `tests/workspacify-reverse/helpers/module-closure.mjs` and `tests/workspacify-reverse/integration/command-procedure.test.mjs` compare procedure text and import closure both directions. Recompute closure; guard names disagreement.

| Module | Kind | Why / loss |
|---|---|---|
| `two-pass.mjs` | absence, unowned | no import; sweep precedes fixed crossed boundaries; cross-package contract boundedness is hope, not input property |
| `staleness.mjs` | absence, unowned | no import; dependency/config/schema/external-contract drift can silently stale canon without red signal |
| `invariant-audit.mjs` | exclusion | design forbids audit as gate; regression suite is its entrance |
| `language-representatives.mjs` | exclusion | fixture-population evidence; subject run is one project, not population |
| `terminal-state.mjs` | exclusion | whole-chain property; this command is one entrance only |

Treat absences/exclusions, never subject findings. First two: complete R8 run with fewer sections. Last three: decisions, not debts.

## Error recovery

Re-enter Step only after an input it reads changes. Same bytes → same finding, not retry. Change named tree, answers file, partition document, or CLI option. If no mutable named input, proceed through Step that can publish reachable analysis; record what it cannot. Finding never ends run before origin spec.

Loop ends when both origin files exist in reserved destination and `gate` 0 over six decisions. Neither complete conver project, prior partition, resolved claim, nor human success verdict is precondition. Never report cannot-complete instead.

| Finding | Return |
|---|---|
| stage cannot run; target moved; late exit refusal; unpublished material; report destination empty | Step 2 after named input/quiescence correction |
| `analyze --semantics` refuses readings | Step 6 after readings change |
| readings open after admission; gate red after semantics rerun | Step 7; re-run decide with same answers |
| unreadable seam partition | Step 8 after repair/move; otherwise record uncomputable |
| withdrawn option/bare argument | rerun without it; no subject change |
| unanswered decision | Step 5 after answers change |
| documents looked up elsewhere | Step 9; reserved destination only |

## Prohibitions

- No search result as evidence; candidate is locator only
- No `unresolved`=defect; no small gap count=quality
- No publish into digest-covered region
- No reopening measurement; no seventh decision
- No reverse-engineering success judgement here
- No subject-refusal gate

## Definition of success

Success is both: (1) complete analysis—R8 reached; origin spec/sidecar published; Markdown round-trips; gate records six decisions—and (2) forward rotation untouched—frozen fixtures still reproduce; gate remains `proved`. Neither optional; stopped analysis is not smaller success; cannot-complete report is not outcome. Only origin spec at destination closes work.
