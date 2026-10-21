---
description: The final mechanical acceptance gate of the design pipeline — decide whether sequences, operations and boundary contracts are complete, consistent, sufficient and safe.
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /smooth-sequences

Command = repair loop. Script decides; executing AI repairs.
Only terminal state: fresh run exits 0.
Frozen inputs: regeneration transaction only; no in-place edits.

`/smooth-sequences`: never asks; never delegates a ground to a human; AI decides by default.
Only human surface: delegated design command's direction questions within its own limit.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Position in the workflow

```
/workspacify-* → /educe-sequences → { /explain-seed → /grill-me-for-rfc (all directories in order) }
→ /smooth-sequences → { /graphify-rfc → /boundify-graph → /split-to-tickets (all directories in order) } ...
```

`/smooth-sequences`: last gate before implementation; read upstream outputs; judge enumeration and contracts.

## Inputs

- Root = current working directory; directly contains `WORKSPACIFY-TREE-MANIFEST.json` and `WORKSPACIFY-ALLOCATE-MANIFEST.json`. Never walks up; no subdirectory promoted to workspace.
- Exactly one root `*-sequences.json` artifact.
- Each package: `SEQUENCES.json`, `RFC.md`.
- `WORKSPACIFY-ALLOCATE-MANIFEST.json`: `contract_registry`, optional `declared_interfaces`.
- Optional artifact `vocabulary`: `terminalStatuses`, `requiredInterfaces`. Absent → derive names from active operation status graphs and allocate `declared_interfaces`; artifact pins last. No record states a name → withhold that check; no invented default. Malformed `vocabulary` → misuse, exit 2; not finding. No separate vocabulary file.
- Hash chain: tree `input.source_hash`, `integrity.manifest_hash`; allocate `input_tree_manifest`; artifact `artifact.spec.path`, `spec.sha256`.

## Outputs

- Run directory `<cwd>/smooth-sequences/`; created only when a generation is written.
- `SMOOTH-SEQUENCES.json`: complete report; `schemaVersion: 3`. Beside the finding set it carries `checks.subChecks` (every check id executed or skipped with a reason), `provenance` (the artifact migration and how many authored `contract_prose` sentences survived), `readings` (educe inquest/adversarial/uncovered counts and the unresolved Yes subjects), `denominator` (the members each demand axis was measured against), `verdict`, and `wouldExit` (audit mode only).
- `SMOOTH-SEQUENCES.md`: human repair view; max 200 findings; explicit `…and N more findings` overflow line. It repeats the provenance, readings and denominator lines.
- `status.json`: `schemaVersion: 1`; `generation`, `mode`, `measuredAt`, `inputDigest`, `reportDigest`, `verdict`.
- `archive/<N>/`: the pair generation N wrote; moved byte-identically; never deleted.
- Console: one `route:` header/authored surface; one line/finding; `generation: N (new generation|verification; no new generation)`; final `next:`.
- Exits: `0` pass; `1` blocking findings; `2` misuse/refusal (broken chain, open transaction); `3` AI handoff (ground to settle / educe phase to run); not a request to a human; not completion.

## Generations

- Report-writing run opens the next generation under `<cwd>/smooth-sequences/`.
- Superseded pair → `archive/<previous generation>/`; then the new pair; then `status.json`.
- `inputDigest` + `reportDigest` unchanged → `verification`; no generation, no write.
- Unreadable `status.json` or report → no history; next run opens generation 1.
- Legacy `<cwd>/SMOOTH-SEQUENCES.json`/`.md`: read for `persisted`; never moved or deleted.

## Steps

### Step 1 — Prepare

cmd (once, workspace root):

```bash
node .claude/scripts/smooth-sequences/run.mjs
node .claude/scripts/smooth-sequences/run.mjs --audit
```

Judge current directory; no parent search.
Before design read: resolve interrupted regeneration commit; refuse while a transaction owns workspace; verify hash chain.

`--audit` runs every check family and reports every finding, but exits `0` and records `verdict: audit` with `wouldExit`. It changes no finding and writes no repair action. Use it to observe a workspace that is expected to be red; the enforce path is the invocation without the flag.

| exit | meaning | next |
|---|---|---|
| `0` | no finding, or audit mode | Step 6 |
| `1` | findings; report written | Step 2 |
| `2` | misuse/refusal; no new report | Read stderr cause + `next:`. Broken chain → follow `next:`: restore generation from `regeneration/archive/<id>/` or open regeneration. Open transaction → `node .claude/scripts/regeneration/run.mjs status` to identify it (`state: none` = none); `node .claude/scripts/regeneration/run.mjs continue`; follow `next:`; Step 1 |
| `3` | AI handoff: ground / educe | Ground → Step 5. Educe → read `.claude/commands/educe-sequences.md`; execute with printed `spec:` as first argument (full contract: Step 4); `node .claude/scripts/regeneration/run.mjs continue`; Step 1 |

Open transaction → resume; never abandon.
Transaction owns workspace in open/derived/verified/committing → no detector report.
judgment-required → read and report: Step 5 needs live findings to act.

### Step 2 — Repair loop (the body)

Exit 1 → loop input; never command output. Findings remain → not completion.

Every finding has a repair class:

| class | surfaces | action |
|---|---|---|
| `in-place` | package `RFC.md` (distribution ledger, boundary name), obligation, view | Edit authored file; run route `rerun:` (view: `node .claude/scripts/sequences-slice/run.mjs <artifact> <package>`); rerun this command |
| `regeneration` | specification-derived artifact findings; allocate decisions | No live-spec edit. Copy to candidate; change candidate or decisions; run transaction |
| `judgment-required` | unresolved RFC/obligation ground | Step 5: owning AI command in staging; then `continue` |

Loop rules:

- Never hand-edit generated files: `SEQUENCES.json`, `*-sequences.json`, `WORKSPACIFY-*` → edit authored input; rerun producer.
- `persisted` = previous repair missed finding; previous generation's report (or legacy root report) carried the same identity; shown on finding line and in `SMOOTH-SEQUENCES.json` as `persisted: true`. Diagnose before repeating edit.
- cap: none. End only on fresh run exit 0.

Editable surfaces:

| surface | authored file | producer or verifier |
|---|---|---|
| package RFC | `<package>/RFC.md` | authored — edit it directly; `node .claude/scripts/smooth-sequences/run.mjs` verifies it |
| package obligation | `<package>/OBLIGATION.json` | authored — edit it directly; `node .claude/scripts/sequences-slice/run.mjs <artifact> <package>` writes the view from it |
| package view | `<package>/SEQUENCES.json` (generated) | `node .claude/scripts/sequences-slice/run.mjs <artifact> <package>` |
| specification (candidate) | `regeneration/candidates/<id>.md` | `node .claude/scripts/regeneration/run.mjs open --spec=<candidate> --reason=...` |
| allocate decisions (candidate) | `regeneration/candidates/<id>-ALLOCATE.json` | `node .claude/scripts/regeneration/run.mjs open --allocate-decisions=<candidate> --reason=...` |
| tree decisions (candidate) | `regeneration/candidates/<id>-TREE.json` | `node .claude/scripts/regeneration/run.mjs open --tree-decisions=<candidate> --reason=...` |

`<artifact>` = single root `*-sequences.json`.
`<package>` = view directory; path before `/SEQUENCES.json` on `route:`.

### Step 3 — In-place repair

1. Open `where`; fragment identifies row. Generated `SEQUENCES.json` → edit package `RFC.md` or `OBLIGATION.json`, never view.
2. Apply `fix`.
3. Run route's complete `rerun:` command; `<artifact>`/`<package>` already filled. Producer = detector → that run is Step 1.
4. Return to Step 1.

### Step 4 — Regeneration

Open transaction only for `repairClass` = `regeneration`; never for `in-place`.
No in-place edits: specification, tree manifest, allocate manifest, artifact.

| finding surface | live file | candidate | open flag |
|---|---|---|---|
| specification-derived (`spec.md#Lnn`) | the tree manifest's `input.spec_path` (a basename at the root) | `regeneration/candidates/<id>.md` | `--spec=<candidate>` |
| allocate decisions (`workspacify/allocate/DECISIONS.json#...`) | `workspacify/allocate/DECISIONS.json` | `regeneration/candidates/<id>-ALLOCATE.json` | `--allocate-decisions=<candidate>` |
| tree decisions (a derive failure names a tree decision) | `workspacify/tree/DECISIONS.json` | `regeneration/candidates/<id>-TREE.json` | `--tree-decisions=<candidate>` |
| more than one | each live file | each candidate | each flag |

`<id>` = finding `checkId` (e.g. `S3.interface-mapping-missing`); any name unique in `regeneration/candidates/` accepted and ledger-recorded.

Candidate = complete copy + intended change; not patch.
≥1 candidate differs from live counterpart; otherwise `open` → `NO_CHANGE`.

Copy live file; then edit copy:

```bash
mkdir -p regeneration/candidates

# the specification: input.spec_path is a basename resolved at the workspace root
cp "$(node -e "process.stdout.write(require('./WORKSPACIFY-TREE-MANIFEST.json').input.spec_path)")" \
  regeneration/candidates/<id>.md

# allocate decisions
cp workspacify/allocate/DECISIONS.json regeneration/candidates/<id>-ALLOCATE.json

# tree decisions
cp workspacify/tree/DECISIONS.json regeneration/candidates/<id>-TREE.json

$EDITOR regeneration/candidates/<id>.md   # or the -ALLOCATE / -TREE candidate
```

Live decisions absent (usual for tree) → write candidate instead of copying.
Supplied document with no live counterpart = change; `open` accepts.

Preconditions:

- `pwd` = workspace root.
- `node .claude/scripts/smooth-sequences/run.mjs` exits 0/1; exit 2 → resolve named broken chain/open transaction first.
- No active transaction: `node .claude/scripts/regeneration/run.mjs status` prints `state: none`, `committed` or `aborted`.

Write candidate outside frozen files using copies above; then drive transaction:

```bash
# 1. Write the candidate (the copy commands are above).
$EDITOR regeneration/candidates/<id>.md

# 2. Open the transaction.
node .claude/scripts/regeneration/run.mjs open \
  --spec=regeneration/candidates/<id>.md \
  --reason="<checkId>: <evidence and why the change is correct>"

# 3. Read the state and the staging specification path.
node .claude/scripts/regeneration/run.mjs status

# 4. Drive derive, verify and commit in one command.
node .claude/scripts/regeneration/run.mjs continue
```

`continue` prints `id`, `state`, `staging`, `spec`, exact `next:` command; stops only at handoff:

| printed state | meaning | exact next command |
|---|---|---|
| `educe-pending` | artifact does not record staged specification | Read `.claude/commands/educe-sequences.md`; execute with printed `spec:` as first argument (contract below); pass writes `<spec-dir>/<spec-base>-sequences.json` beside spec. Then `node .claude/scripts/regeneration/run.mjs continue` |
| `derived` / `verified` | advanced; unfinished; unexpected from `continue` | `node .claude/scripts/regeneration/run.mjs continue` |
| `judgment-required` | mechanically unsettled ground | Step 5; then `continue` |
| `unverified` | chain/detector refused | `node .claude/scripts/regeneration/run.mjs verify` prints every failed `link:`/`finding:`; its `next:` advisory only. No staging-tree repair: `abort`; amend candidate; open from current baseline |
| `derive-failed` | producer refused | `node .claude/scripts/regeneration/run.mjs abort`; fix candidate; `open` again |
| `commit-failed` | live tree restored | Inspect `regeneration/archive/<id>/`; open new transaction |
| `committed` | generation live | Step 1 |
| `aborted` | staging discarded | Open new transaction |

Recovery/inspection commands:

```bash
node .claude/scripts/regeneration/run.mjs open ...      # stage a candidate
node .claude/scripts/regeneration/run.mjs status        # id, state, staging, spec, next
node .claude/scripts/regeneration/run.mjs continue      # derive -> verify -> commit, or one handoff
node .claude/scripts/regeneration/run.mjs derive        # one derive step
node .claude/scripts/regeneration/run.mjs verify        # chain, grounds and detector
node .claude/scripts/regeneration/run.mjs commit        # the only live write
node .claude/scripts/regeneration/run.mjs abort         # discard staging
node .claude/scripts/regeneration/run.mjs recover       # resolve an interrupted commit
```

Educe handoff belongs to this step.
`derive`: from staging root, run `node .claude/scripts/educe-sequences/rail/phase.mjs through <staged-spec>` through all deterministic phases; stop at first reader phase.
Stopped phase = handoff, not derive failure.

Artifact still lacks staged specification → `continue` prints `state: educe-pending` + staging `spec:`; settle:

1. Read `.claude/commands/educe-sequences.md` (`disable-model-invocation: true`); execute document as this AI; no session slash invocation.
2. Execute Steps in order through every gate; staged spec path = first argument; trailing material → `<spec-dir>/educe-sequences/supplied/`.
3. Confirm passing artifact: `<spec-dir>/<spec-base>-sequences.json`, beside spec (`spec.md` → `spec-sequences.json`); records staged spec's raw digest.
4. Run `node .claude/scripts/regeneration/run.mjs continue`; resume without setup rerun.

Live-spec artifact → reject: different digest.
Ledger `pending` names stopped phase + resume command.

Failure handling:

- `CANDIDATE_CHANGED`: staged spec/decisions differ from candidate recorded at open → abort; edit candidate; open again.
- `STAGING_CHANGED`: staging changed after verify → abort; open again; verify new generation.
- `SILENT_CHANGE_DETECTED`: live chain broken → no thaw; restore generation from `regeneration/archive/<id>/` or repair frozen input outside workspace.
- `TRANSACTION_OPEN`: finish/abort current before another open; run `continue`.
- `TRANSACTION_TERMINAL`: named transaction committed/aborted; record, not edit surface → open new transaction.
- `UNVERIFIED_GENERATION`: `continue` or `verify` before `commit`.
- `BASELINE_CHANGED`: live design changed since open → abort; open from current baseline.

Interrupted commit: detector calls `recover` before reading.
Manual: `node .claude/scripts/regeneration/run.mjs recover`.
Journal `prepared`/`applying` → rollback; `verifying` + valid live chain → complete.
Never delete `regeneration/GENERATIONS.json` or `regeneration/COMMIT-JOURNAL.json`.

Forbidden in this step:

- No edits: live specification, `WORKSPACIFY-*`, artifact, live decisions.
- No staged-spec/decisions edits after open (`CANDIDATE_CHANGED`).
- No staging-tree edits after verify (`STAGING_CHANGED`).
- No deletion: ledger, journal, archive.
- No `--force`, `--hash`, `--source-hash`; transaction computes chain.

### Step 5 — judgment-required is an AI repair, not a stop

`judgment-required` = mechanically unsettled ground.
State's `next:` names owning command + argument; `groundHandoff` selects by ground reason:

| ground | owning command | argument |
|---|---|---|
| an RFC or obligation ground | `/grill-me-for-rfc` | the staging root printed as `staging:` |
| an RFC seed (the reason contains `RFC-SEED` or `RFC SEED`) | `/explain-seed` | the `RFC-SEED.md` path the ground names under the staging root |

Both: `disable-model-invocation: true`.
Read `.claude/commands/grill-me-for-rfc.md` or `.claude/commands/explain-seed.md`; execute its Steps with mapped argument; no slash invocation.

Owners: settle every point possible from specification, code, documents.
Only human surface: owners may ask direction questions only, within own limits (3 questions/round, 5 rounds).
`/smooth-sequences`: never ask; never delegate ground itself.

`continue` prints only handoff → `node .claude/scripts/regeneration/run.mjs verify` exposes ground as `reason:`.
Detector exit 3 → ground on `transaction:` line.
Ground text defines what owner must settle.

Owner settles → run `node .claude/scripts/regeneration/run.mjs continue`; grounds rerun.
Observable settlement: advance to commit or return `judgment-required` with new reason.
State = repair route; never terminal/completion.
Owner cannot settle → ground/spec defective: abort; amend candidate; open new transaction; never hand ground to human.
In-place staged-candidate edit → `CANDIDATE_CHANGED`.

### Step 6 — Complete

Done iff fresh exit 0: chain verifies; transaction closed; zero findings; `status.json` names the generation the fresh run computed.

- Zero findings + zero withheld → `verdict: pass`.
- Zero findings + withheld → list every withheld surface; end `verdict: pass with N unproven surface(s)`; never call proved.
- Report verdict; quote boundary verbatim:

> does not guarantee: whether the enumeration is complete relative to the world; semantic prose equivalence remains a judgment.

## Appendix A — Check families

One detector invocation runs all check families; console groups by repair route. Diagnostic reference only; not operating step.

Every check id is listed once in `lib/check-status.mjs`; a family reports it as `executed` or `skipped` with a reason. The report's `checks.run` is the number of executed sub-checks, not the number of families.

- S1 enumeration integrity: duplicate ids; unresolved step operation/sequence; drawn sequence without step; a `notASequence` region without a ground (`ground`, `reason`, `grounding.classification`, or `ground_ref`). `predicateLimb: none-applies` alone is not a ground.
- S3 operation envelope: initial status; transition targets; transitions out of terminal status; external-dependency finality; every required interface. Terminal names: artifact `vocabulary`, else union of statuses active operations end at. Interfaces: `vocabulary`, else allocate `declared_interfaces` columns, else columns artifact pins reach. No record states vocabulary → withhold corresponding check. The migration closes a transition target only when the operation records `status_terminality_ground` for it.
- S4 boundary clauses: required/extra `stage2_contract_scope` clauses; provider/consumer direction + counterpart; contribution completeness. v3 operation: `registry_contribution` ∈ `required`/`not_required`; `not_required` requires `registry_contribution_ground`; owner distribution ledger requires `op-<operationId>` row. Ledger `Kind` does not map to contribution value. An active operation reachable only through `obligationUnits` is `S4.contribution-unowned`, not skipped.
- S5 contract meshing (v3 only): precondition implication; produced/consumed closure; error-set agreement; crossing-boundary resolution. Meshing reads `contract.authored` (or a step's authored `contract_prose`); a step with only a registry projection is `S5.projection-only` and is never reported as meshed. A declared boundary no step crosses and no `boundary_grounds` entry covers is `S5.boundary-uncovered`.
- S6 danger: operation-dependency cycle; active operation unreachable from steps and uncovered by grounded escape; orphan object fact; repeated operation lacking `loop`/`retry`/`exception` annotation; step depending on later step; an operation `boundary_effects` entry no step crosses and no `boundary_grounds` entry covers (`S6.boundary-effect-drift`).
- S7 artifact/view/RFC consistency: missing view; package-id mismatch; owned unit mismatch; boundary absent from RFC; an `obligationUnits` operation/sequence subject the artifact does not declare (`S7.obligation-unit-unknown`).

## Appendix B — Frozen inputs and the chain

Hash-chained: specification, `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json`, artifact.
Recorded hashes must agree before detector runs; disagreement → `SILENT_CHANGE_DETECTED`, exit 2.
Change: open regeneration → derive in staging → verify chain + every ground → commit with rollback.
Live design files remain byte-identical until commit.

## Appendix C — Withheld surfaces

Withheld check: named in report; not pass. `withheld` entries: `{layer, check, reason}`:

- `B`: v2 artifact lacks typed step contract → Layer B withheld.
- `vocabulary:S3.terminal-status` / `vocabulary:S3.interface-mapping`: neither artifact `vocabulary` nor derivable records state corresponding list.
- `S4.contribution`: v2 artifact lacks `registry_contribution`.
- `readings:<file>`: an educe readings file is unreadable or a JSONL line is malformed; the reason names the file and line. A reading is never converted to a finding; the report carries its counts separately.

Never rewrite v2 artifact or require v3.

## Appendix D — Rare states

Crash/refusal/terminal-record states only; handled by Step 4 commands. Diagnostic table:

| state | meaning |
|---|---|
| `committing` | an interrupted commit owns the live tree; `continue` calls `recover` first |
| `commit-failed` | the live tree was restored byte-identically; inspect `regeneration/archive/<id>/` |
| `aborted` | the staging tree was discarded; open a new transaction |
| `committed` | the generation is live; rerun the detector |

## Appendix E — Example

```bash
cd /path/to/workspace
node .claude/scripts/smooth-sequences/run.mjs
# smooth-sequences: 1 finding(s) in 1 repair route(s); /path/to/workspace/smooth-sequences/SMOOTH-SEQUENCES.json
# generation: 1 (new generation)
# route: spec.md#L20 (read-only; copy it to a candidate first) | rerun: node .claude/scripts/regeneration/run.mjs open --spec=<candidate> --reason=<reason>
#   S3.interface-mapping-missing ConsumeFact | why: no grpc mapping | fix: map grpc on the operation
# next: fix every finding above, then rerun this command. exit 0 only when this block is empty.

node .claude/scripts/regeneration/run.mjs open --spec=regeneration/candidates/spec.md --reason="S3.interface-mapping-missing: map grpc"
node .claude/scripts/regeneration/run.mjs continue
# state: educe-pending
# spec: /path/to/workspace.regeneration/<tx>/spec.md
# next: run .claude/commands/educe-sequences.md with /path/to/workspace.regeneration/<tx>/spec.md, then node .claude/scripts/regeneration/run.mjs continue

# Execute .claude/commands/educe-sequences.md with that spec path.
# A passing run writes /path/to/workspace.regeneration/<tx>/spec-sequences.json.

node .claude/scripts/regeneration/run.mjs continue
# state: committed
# next: node .claude/scripts/smooth-sequences/run.mjs

node .claude/scripts/smooth-sequences/run.mjs
# smooth-sequences: 0 finding(s); /path/to/workspace/smooth-sequences/SMOOTH-SEQUENCES.json
# generation: 2 (new generation)
# next: none. verdict: pass.
# /path/to/workspace/smooth-sequences/archive/1/ holds the generation 1 pair.

node .claude/scripts/smooth-sequences/run.mjs
# smooth-sequences: 0 finding(s); /path/to/workspace/smooth-sequences/SMOOTH-SEQUENCES.json
# generation: 2 (verification; no new generation)
# next: none. verdict: pass.
```
