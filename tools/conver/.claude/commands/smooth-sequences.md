---
description: The final mechanical acceptance gate of the design pipeline — decide whether sequences, operations and boundary contracts are complete, consistent, sufficient and safe.
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /smooth-sequences

Command = repair loop. Script decides; executing AI repairs.
Only terminal state: a fresh run exits 0 **and** its verdict is `pass`.
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
- Optional authored waiver file `SMOOTH-SEQUENCES-WAIVERS.json`: `{"waivers":[{"findingKey":"<checkId>\u0000<subject>","ground":"..."}]}`. A waiver without a non-empty ground is refused (`INVALID_WAIVER`); the file is authored, never generated.

## Outputs

- Run directory `<cwd>/smooth-sequences/`; created only when a generation is written.
- `SMOOTH-SEQUENCES.json`: complete report; `schemaVersion: 4`. Beside the finding set it carries `checks.subChecks` (every check id executed or blocked with a surface, producer and reason), `blocked` (one entry per blocked check with its producer), `waived` (findings removed by a grounded waiver), `downgrade` (a v3 to v2 step, or null), `provenance` (migration, schema history, and the typed/legacy/absent prose partition), `readings` (educe inquest/adversarial/uncovered counts, the readings file path, the full unresolved-subject count, capped subject/line/quote details, and the blocking/advisory policy), `denominator`, `verdict`, and `wouldExit` (audit mode only).
- `SMOOTH-SEQUENCES.md`: human repair view; max 200 findings; explicit `…and N more findings` overflow line. It repeats the provenance, readings and denominator lines.
- `status.json`: `schemaVersion: 2`; `generation`, `mode`, `measuredAt`, `inputDigest`, `reportDigest`, `findingKeysDigest`, `schemaHistory`, `verdict` (`exitCode`, `findings`, `blocked`, `readings`; audit adds `wouldExit`).
- `archive/<N>/`: the pair generation N wrote; moved byte-identically; never deleted.
- Console: one `route:` header/authored surface; one line/finding; `generation: N (new generation|verification; no new generation)`; final `next:`.
- Exits: `0` pass; `1` blocking findings; `2` misuse/refusal (broken chain, open transaction); `3` AI handoff (ground to settle / educe phase to run); `4` unproven (a required surface is absent or synthesized, a reading is unresolved, the artifact was downgraded from v3 to v2, or a design-authoring gate failed); not a request to a human; only `0` is completion.

Closure mode is a v3 artifact or an evidence manifest, with both `WORKSPACIFY-TREE-MANIFEST.json` and `WORKSPACIFY-ALLOCATE-MANIFEST.json` present. In closure mode the four grill mechanical gates are run here — `check-obligation-coverage.js`, `check-contribution-completeness.js`, `check-distribution-completeness.js` and `defect-report.js --gate` — so a pass from this command means the closure they measure holds too. A failing gate keeps the certificate incomplete with an open entry `CLOSURE:<script>` carrying the gate's first refusal line, and the run exits `4`. `--legacy` does not run them. A command that is not in closure mode is not claiming that closure; say so in the report rather than reading its exit as the pipeline's.

Closure mode runs the strict evidence path automatically: it resolves the worklist, requires an effort trace, checks the generation and the write receipts, and reports `evidence: strict`. A structural-only run is not closure evidence and cannot report `pass` or `complete`. `--legacy` is the only weak path; it keeps the old report shape, writes `evidence: legacy`, and cannot claim closure. `--require-effort` and `--strict-freshness` remain accepted for compatibility and are implied in closure mode; to reproduce the closure policy explicitly, run `node .claude/scripts/smooth-sequences/run.mjs <root> --require-effort`.

## Generations

- Report-writing run opens the next generation under `<cwd>/smooth-sequences/`.
- Superseded pair → `archive/<previous generation>/`; then the new pair; then `status.json`.
- `inputDigest` + `reportDigest` + `findingKeysDigest` unchanged → `verification`; no generation, no write.
- Unreadable `status.json` or report → named refusal (`UNREADABLE_STATUS` / `UNREADABLE_REPORT`); repair or remove it. A corrupt history is never a fresh generation.
- Legacy `<cwd>/SMOOTH-SEQUENCES.json`/`.md`: read for `persisted`; never moved or deleted.

## Steps

### Step 1 — Prepare

cmd (once, workspace root):

```bash
node .claude/scripts/smooth-sequences/calibrate.mjs
node .claude/scripts/smooth-sequences/run.mjs
node .claude/scripts/smooth-sequences/run.mjs --audit
node .claude/scripts/smooth-sequences/run.mjs --advisory-readings
```

Judge current directory; no parent search.
Before design read: resolve interrupted regeneration commit; refuse while a transaction owns workspace; verify hash chain.
Calibration writes `smooth-sequences/CALIBRATION.json`: one seeded defect per check family, each detected by the real detector. No design file is written; only the calibration report is written to the live workspace.

`--audit` runs every check family and reports every finding and blocked surface, but exits `0` and records `verdict: audit` with `wouldExit` (0, 1 or 4). It changes no finding and writes no repair action. Use it to observe a workspace that is expected to be red or unproven; the enforce path is the invocation without the flag. `--advisory-readings` is the only way to keep unresolved educe readings out of the verdict; the report prints `(advisory; not blocking)`.

| exit | meaning | next |
|---|---|---|
| `0` | no finding, or audit mode | Step 6 |
| `1` | findings; report written | Step 2 |
| `2` | misuse/refusal; no new report | Read stderr cause + `next:`. Broken chain → follow `next:`: restore generation from `regeneration/archive/<id>/` or open regeneration. Open transaction → `node .claude/scripts/regeneration/run.mjs status` to identify it (`state: none` = none); `node .claude/scripts/regeneration/run.mjs continue`; follow `next:`; Step 1 |
| `3` | AI handoff: ground / educe | Ground → Step 5. Educe → read `.claude/commands/educe-sequences.md`; execute with printed `spec:` as first argument (full contract: Step 4); `node .claude/scripts/regeneration/run.mjs continue`; Step 1 |
| `4` | unproven: report written | Step 2: restore each blocked surface with its named producer, resolve the readings, or repair the design-authoring gate named `CLOSURE:<script>`; never read exit 4 as completion |

Open transaction → resume; never abandon.
Transaction owns workspace in open/derived/verified/committing → no detector report.
judgment-required → read and report: Step 5 needs live findings to act.

### Step 2 — Repair loop (the body)

Exit 1 and exit 4 → loop input; never command output. Findings or blocked surfaces remain → not completion.

Every finding has a repair class:

| class | surfaces | action |
|---|---|---|
| `in-place` | package `RFC.md` (distribution ledger, boundary name), obligation, view | Edit authored file; run route `rerun:` (view: `node .claude/scripts/sequences-slice/run.mjs <artifact> <package>`); rerun this command |
| `regeneration` | specification-derived artifact findings; allocate decisions | No live-spec edit. Copy to candidate; change candidate or decisions; run transaction |
| `judgment-required` | unresolved RFC/obligation ground | Step 5: owning AI command in staging; then `continue` |
| `blocked` | a required surface is absent, migration-synthesized, or has unknown provenance | Step 2: restore the surface with its producer (`migrate-v3 --annotations` for the v3 evidence surfaces; specification regeneration for vocabulary); rerun |

Blocked surfaces have no authored file of their own. Every blocked line names its producer. The v3 evidence surfaces (`operations[].allowed_status_transitions`, `operations[].registry_contribution`, `operations[].boundary_effects`, `steps[].contract`, `steps[].contract.authored`, `steps[].contract.crosses`) are restored by an annotations document:

```bash
node .claude/scripts/smooth-sequences/migrate-v3.mjs <root> --annotations=<annotations-file>
```

**Authoring annotations.** The document carries `contracts`, `operations` and `boundary_grounds`:

```json
{
  "contracts": {
    "<step-id>": {
      "pre": [], "post": [], "invariants": [],
      "consumes": [], "produces": [], "errors": [],
      "crosses": ["<boundary-id>"]
    }
  },
  "operations": {
    "<operation-id>": {
      "registry_contribution": "required|not_required",
      "registry_contribution_ground": "<ground when not_required>",
      "boundary_effects": [{ "boundary": "<boundary-id>", "direction": "provides|consumes" }]
    }
  },
  "boundary_grounds": [
    { "boundary": "<boundary-id>", "ground": "<why no operation crosses>", "source": { "reasonCode": "<tree dependency_reason_code>" } }
  ]
}
```

Every entry in `pre`, `post` and `invariants` is `{factId, text, source: {step, line, quote}}`. The quote must appear in the step quote at that line; an uncited assertion is refused with `UNCITED_AUTHORED_FACT`. A ground whose `reasonCode` does not match the tree boundary is refused with `UNCITED_BOUNDARY_GROUND`. The migration is incremental: a later annotations document updates only the rows it names, and the same document is byte-identical on a second run. A step is authored only when every row of its surface is authored; a partial surface stays blocked and the reason reports `authored N/M`. A waiver records a finding's disposition; it never turns a blocked surface into a measured one.

**Readings.** An inquest `Yes` answer is not a finding and cannot be waived. Revise the specification for the named subject and line, open a regeneration, rerun the educe reader phases, and confirm the new readings have zero `Yes`. `--advisory-readings` is a diagnostic policy, never a repair.

**Semantic effort gate (E1–E6).** Run with `--require-effort` for a closure that must prove observable effort. A held judgment then carries an `effort` record; a missing trace, a shallow search, a missing alternative, a missing counterexample attempt, a missing discriminator or `uncertainty: high` keeps it open with the named code.

- **E1 Effort trace.** `searched` must name at least the kind's minimum distinct rows: judgment 3, risk 2, distribution 2, reading 2, escape 2. `alternatives` must cover every other verdict in the worklist vocabulary. `counterexampleAttempt` must name a concrete candidate, its source and why it fails. `discriminator` must name the basis and a different verdict that would follow if the basis were absent or false.
- **E2 Blind attack.** For Tier 1, spawn a separate reader (a subagent with only the worklist item) and write `blind: true`, `reader: <worklist attackReader>`, a literal `searched` quote and a source that does not share the basis quote. The gate rejects `BLIND_ATTACK_REQUIRED`, `ATTACK_SAME_AS_BASIS`, `ATTACK_QUOTE_NOT_FOUND`, `ATTACK_TEMPLATE_REUSED` and `ATTACK_SUBJECT_GENERIC`.
- **E3 Basis sensitivity.** Remove or negate the cited basis in a synthetic artifact and re-evaluate. A verdict that survives the removal is `BASIS_NOT_DISCRIMINATING`. The gate does not produce this evidence: when no sensitivity record exists the counter is `null` and listed in `assurance.notMeasured`. It must never be reported as 1.
- **E4 Sampled re-judgment.** Sample obligations deterministically from `worklistDigest` and have a second reader re-judge them without the first verdict. A disagreement is `REJUDGE_DISAGREEMENT`. The gate does not produce this evidence: when no re-judgment record exists the counter is `null` and listed in `assurance.notMeasured`. It must never be reported as 1.
- **E5 Anti-template.** Normalize the attack text and reject a signature reused beyond the threshold. The template must name the subject and the rows it searched.
- **E6 Uncertainty honesty.** A trace with `uncertainty: high` cannot be `held`; record `stuck` instead. A held verdict without a counterexample attempt or discriminator is invalid.

**Escape and position consistency.** An escape whose cited line orders an act is `ESCAPE_ACT_CONFLICT`; an active operation whose position is `excluded` or `suppliedRule` and whose grounding says no act is `POSITION_DISPOSITION_CONFLICT`. A designer-supplied ground must be a distinct classification, not the no-act template.

**Receipt and worklist freshness.** Every phase receipt is checked against the current spec, declaration, worklist and artifact digests. A mismatch is `STALE_RECEIPT` and keeps the certificate incomplete. The worklist is written even when empty: `JUDGMENT-WORKLIST.json` carries `schemaVersion: 2`, `generation`, `worklistDigest`, `remainingOpen` and `items`; a digest mismatch is `WORKLIST_STALE`.

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
   - `S7.sequence-steps-undistributed`: the sequence is only an `obligationUnits` row. Move it to `ownedSequenceUnits` or `crossBoundarySequenceUnits` with its ordered steps in `OBLIGATION.json`, or declare a grounded no-act residual; rerun `sequences-slice/run.mjs` and this command. An obligation row alone never satisfies step distribution.
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
| annotations (a blocked v3 surface) | the producer named on the blocked line | `regeneration/candidates/<id>-ANNOTATIONS.json` | `--annotations=<candidate>` |
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

**Annotations candidate.** When a blocked line names `migrate-v3 --annotations`, write the annotations document described in Step 2 to `regeneration/candidates/<id>-ANNOTATIONS.json` and open with `--annotations=<candidate>`. The file is hashed at open; editing the candidate or the staged copy after open raises `CANDIDATE_CHANGED`. The staging producer applies `migrate-v3` after educe and before the views, so a specification change does not lose the authored contracts.

```bash
node .claude/scripts/regeneration/run.mjs open \
  --spec=regeneration/candidates/<id>.md \
  --annotations=regeneration/candidates/<id>-ANNOTATIONS.json \
  --reason="<checkId>: <evidence and why the change is correct>"
```

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
| `unverified` | chain refused, or the staging result adds debt (`DEBT_INCREASED`) | `node .claude/scripts/regeneration/run.mjs verify` prints every failed `link:`/`finding:` and the first new finding, blocked check or reading subject; its `next:` advisory only. No staging-tree repair: `abort`; amend candidate; open from current baseline |
| `derive-failed` | producer refused | `node .claude/scripts/regeneration/run.mjs abort`; fix candidate; `open` again |
| `commit-failed` | live tree restored | Inspect `regeneration/archive/<id>/`; open new transaction |
| `committed` | generation live | Step 1 |
| `aborted` | staging discarded | Open new transaction |

**Non-worsening transaction gate.** Verify and commit compare the staged debt with the live baseline: finding identities, blocked check ids, reading subjects, the full Yes count and unreadable readings. A new identity or a rising count is refused with `DEBT_INCREASED`; carried debt verifies and commits. The receipt records `baseline`, `staging` and `increase`, so a carried-debt commit is never mistaken for a pass. Only the final enforce run's exit 0 with verdict pass is completion.

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

Done iff a fresh enforce run exits 0 **and** the verdict is `pass`: chain verifies; transaction closed; zero findings; zero blocked surfaces; zero unresolved readings; `status.json` names the generation the fresh run computed. **Calibration.** Closure mode also requires `smooth-sequences/CALIBRATION.json` with a matching digest and `detected: true` for every seed; a missing or failed calibration is `CALIBRATION_MISSING`/`CALIBRATION_FAILED` and the run is `unproven` (exit 4).

**Closure mode.** A v3 workspace enters closure mode by default; `--legacy` keeps the old report path. When the workspace carries `educe-sequences/EVIDENCE-MANIFEST.json`, pass is the `smooth-sequences/COMPLETION-CERTIFICATE.json` status `complete`, not a zero-finding count. An absent or empty readings file is an open obligation (`MISSING_EVIDENCE`); a phase receipt whose input digest no longer matches is `STALE_RECEIPT`; a check that evaluated zero claims is `vacuous`. In closure mode the effort gate is always on; `--require-effort` and `--strict-freshness` are compatibility flags and are implied. `complete` requires `basisResolvedRatio`, `quoteGroundedRatio`, `effortCoverage` and `blindAttackRatio` to be 1, and `templateAttackRatio`, `inheritedRatio`, `escapeActConflictCount` and `staleReceiptCount` to be 0. A closure run that has not produced this evidence is `unproven`: structural validity alone is never reported as `complete` or `pass`. `discriminatingRatio` and `rejudgeAgreement` are optional: a `null` value means the evidence was not measured and is listed in `assurance.notMeasured`; a numeric value is gated when it is present. Open semantic obligations are written to `smooth-sequences/JUDGMENT-WORKLIST.json` and close only through a held decision. A workspace without the manifest keeps the legacy path so an old report stays readable, but it cannot claim the closure guarantee.
The console and JSON report carry an `instrument:` line with the inquest Yes ratio, the attack broken ratio, basis-quote discrimination and effort distinctness. It is a diagnostic: it never changes the verdict, and a zero-finding run whose instrument has never fired is reported as non-discriminating.

**Judgment decisions.** Every obligation receives one decision: `held` (a validated judgment or a signed reading), `proven` (mechanical or census), `not_applicable`, `broken`, `stuck` or `open`. Only `held`, `proven` and `not_applicable` close an obligation; `broken`, `stuck` and `open` keep the certificate incomplete. A judgment record closes an obligation only when its `obligationId` matches a worklist item and its `worklistDigest`, `contextDigest` and `artifactDigest` match the current run; `schemaVersion` is 2; `provisional` is false; the verdict is in the kind's vocabulary and is a closing verdict; every basis quote occurs on its cited line inside the obligation anchors; the basis is not reused by another obligation; and a Tier 1 obligation carries an attack written by a different reader whose `searched` states the rows it read. Rejection codes are `CONTEXT_MISMATCH`, `WORKLIST_MISMATCH`, `STALE_EVIDENCE`, `LEGACY_RECORD`, `PROVISIONAL_EVIDENCE`, `VERDICT_NOT_ALLOWED`, `BASIS_SHAPE`, `QUOTE_NOT_FOUND`, `BASIS_OUT_OF_SCOPE`, `REUSED_BASIS`, `NO_ATTACK`, `SELF_ATTACK`, `ATTACK_UNGROUNDED`, `COUNTEREXAMPLE_MISSING` and `ROUND_CAP`. The certificate `assurance` block reports `anchoredRatio`, `genericBasis`, `reusedBasis`, `staleRecords`, `provisionalRecords`, `unattackedTier1` and `independentAttacks`; `complete` requires every counter clean and `anchoredRatio` 1.

- Zero findings + zero blocked + zero unresolved readings under the run's readings policy → `verdict: pass`. The default policy is blocking; `--advisory-readings` must be printed in the report.
- Any blocked surface, unresolved reading or schema downgrade → `verdict: unproven`, exit 4. List every blocked check and surface; never call it pass and never call it proved.
- A grounded waiver removes a finding from the blocking set; it does not turn a blocked surface into a measured one. The run remains `unproven` until the surface is restored; a waiver records the finding's disposition, not a proof.
- Report verdict; quote boundary verbatim:

> does not guarantee: whether the enumeration is complete relative to the world; semantic prose equivalence remains a judgment.

An inquest `Yes` is a finding, not a clean answer: it stays open as `FINDING_OPEN` until the same generation records a `resolution` whose `kind` is `spec-change` or `artifact-change`, whose `artifactDigest` matches the current artifact, and whose `evidence` cites a line and quote. A `No` closes only with its own line and quote. `readings-adversarial.jsonl` carries rulings (`excluded`, `notASequence`, `suppliedRule`); `readings-attack.jsonl` carries an attack that names the ruling, and a broken or unresolved attack leaves the obligation open. An empty pinned column is an open property obligation unless `operation.grounding.properties[column]` carries a classification, a citation and a quote.

The certificate states the same limit as `residue` and separates `proven` (mechanical closure), `judged` (validated judgment decisions), `readings` (signed reading closures) and `accepted` (risk dispositions and declaration exemptions). A `complete` status means no open, stuck, vacuous, broken or unresolved obligation remains and every assurance counter is clean; it does not turn the residual judgments into proofs.

### Judgment pass (J1–J4)

J1. Run the gate. `smooth-sequences/JUDGMENT-WORKLIST.json` lists every open semantic obligation with its `contextDigest`, `worklistDigest`, `artifactDigest`, `anchorSet`, `answerVocabulary`, `reader` and `attackReader`.

J2. Answer the worklist in `educe-sequences/readings-judgment.jsonl` and `educe-sequences/readings-attack.jsonl`. A judgment record carries `schemaVersion: 2`, `obligationId`, `contextDigest`, `worklistDigest`, `artifactDigest`, a closing verdict from the item vocabulary, a kind-specific `basis`, `reader: <worklist reader>` and a `recordId` equal to the digest of the body. A Tier 1 item also owes an attack with `reader: <worklist attackReader>`, the same context and worklist digests, `outcome` and `searched` (source, line range, quote). A FALSIFY item is answered by its attack alone. Under `--require-effort`, a held judgment also carries the `effort` trace described in Step 2, and a Tier 1 attack must be `blind: true` with a separate reader and a non-shared source; a missing trace or a non-blind attack is rejected with the named code.

Under `--require-effort` or `--strict-freshness`, stage the records and write them through `node .claude/scripts/shared-obligations/evidence-writer.mjs --root=<workspace> --kind=<judgment|attack|effort> --input=<staging.jsonl>`. The writer stamps `readAt` and `readerGeneration`, validates every record against its worklist item, writes all records or none, and records a write receipt in `EVIDENCE-MANIFEST.json`. A direct write to `readings-*.jsonl` has no write receipt and is rejected with `MISSING_WRITE_RECEIPT`; a record from an older generation is `READER_GENERATION_STALE`, and a record older than the generation start is `READING_NOT_REREAD`.

J3. Re-run. The gate validates every record and leaves rejected records named; it rewrites the worklist with the remaining open set.

J4. A `broken` or `stuck` decision is reported by name. The loop ends at `complete`, or at a named incomplete set; it never converts an open finding into a held judgment to reach complete.

Batching: `--scope=<obligation-prefix>` writes only the matching worklist items (for example `--scope=READ:INQUEST:`), and a later unscoped run reports the remainder. The reader is `educe-sequences/generation-<n>` and the attack reader is the same id with `/attack`; a ticket key is never a reader. Do not generate records, reuse one quote across obligations, cite line 1 as a generic basis, or rewrite a record's reader.

## Appendix A — Check families

One detector invocation runs all check families; console groups by repair route. Diagnostic reference only; not operating step.

Every check id is listed once in `lib/check-status.mjs` with `requires`, `claims` and a `denominator`; a family reports it as `executed` or `blocked` with a surface and reason. A check whose required surface is absent, whose denominator is zero, or whose spec-claiming input was synthesized by migration is blocked; a blocked check never contributes a finding. The report's `checks.run` is the number of executed sub-checks, not the number of families.

- S1 enumeration integrity: duplicate ids; unresolved step operation/sequence; drawn sequence without step; a `notASequence` region without a ground (`ground`, `reason`, `grounding.classification`, or `ground_ref`). `predicateLimb: none-applies` alone is not a ground.
- S3 operation envelope: initial status; transition targets; transitions out of terminal status; external-dependency finality; every required interface. Terminal names: artifact `vocabulary`, else union of statuses active operations end at. Interfaces: `vocabulary`, else allocate `declared_interfaces` columns, else columns artifact pins reach. No record states vocabulary → withhold corresponding check. The migration closes a transition target only when the operation records `status_terminality_ground` for it.
- S4 boundary clauses: required/extra `stage2_contract_scope` clauses; provider/consumer direction + counterpart; contribution completeness. v3 operation: `registry_contribution` ∈ `required`/`not_required`; `not_required` requires `registry_contribution_ground`; owner distribution ledger requires `op-<operationId>` row. Ledger `Kind` does not map to contribution value. An active operation reachable only through `obligationUnits` is `S4.contribution-unowned`, not skipped.
- S5 contract meshing: precondition implication; produced/consumed closure; error-set agreement; crossing-boundary resolution. Meshing reads `contract.authored` (or a step's authored `contract_prose`); a step with only a registry projection is `S5.projection-only` and is never reported as meshed. An authored assertion must cite its step line and a quote the step carries; `S5.authored-source-missing` reports an uncited assertion. A declared boundary no step crosses and no `boundary_grounds` entry covers is `S5.boundary-uncovered`; a ground also covers a one-sided crossing. The whole family is blocked when the typed contract or authored surface is absent.
- S6 danger: operation-dependency cycle; active operation unreachable from steps and uncovered by grounded escape; orphan object fact; repeated operation lacking `loop`/`retry`/`exception` annotation; step depending on later step; an operation `boundary_effects` entry no step crosses and no `boundary_grounds` entry covers (`S6.boundary-effect-drift`). The graph checks read typed step contracts and are blocked when the surface is absent or migration-synthesized. The drift check is a projection claim: it may read migration-synthesized effects but is blocked when `boundary_effects` is absent. A finding whose check later becomes blocked is re-emitted as `S.evidence-withdrawn` from the most recent report that carried findings, current or archived; it leaves the blocking set only through resolution or a grounded waiver.
- S7 artifact/view/RFC consistency: missing view; package-id mismatch; owned unit mismatch; boundary absent from RFC; an `obligationUnits` operation/sequence subject the artifact does not declare (`S7.obligation-unit-unknown`); an obligation-only sequence whose steps have no `ownedSequenceUnits`/`crossBoundarySequenceUnits` record (`S7.sequence-steps-undistributed`); a step order that disagrees with the artifact (`S7.sequence-step-order`); a step whose operation no view carries (`S7.step-operation-missing`); an active operation parked as a residual without `position: suppliedRule`, `grounding.classification: designer_supplied` and zero steps (`S7.active-operation-residual`).

## Appendix B — Frozen inputs and the chain

Hash-chained: specification, `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json`, artifact.
Recorded hashes must agree before detector runs; disagreement → `SILENT_CHANGE_DETECTED`, exit 2.
Change: open regeneration → derive in staging → verify chain + every ground → commit with rollback.
Live design files remain byte-identical until commit.

## Appendix C — Blocked surfaces and evidence provenance

A blocked check is named in the report with `{checkId, family, surface, producer, reason}`; it is not pass and it never contributes a finding. `blocked` is the authoritative list; `withheld` remains as a compatibility projection for older readers.

- The v3 evidence surfaces are restored with `node .claude/scripts/smooth-sequences/migrate-v3.mjs <root> --annotations=<file>`. A blocked line prints that command as its producer.
- `operations[].allowed_status_transitions` absent, migration-synthesized, or unknown provenance → S3 status checks blocked. A v2-authored transition graph stays authored; a migration that adds a terminal closure makes the surface migration.
- `operations[].registry_contribution` absent or migration-synthesized → S4.contribution blocked.
- `operations[].boundary_effects` absent → S6.boundary-effect-drift blocked. A field present on every active operation, even as `[]`, is a measured zero.
- `steps[].contract` absent, migration-synthesized, or unknown provenance → S5.projection-only and the S6 graph checks blocked.
- `steps[].contract.authored` absent → S5 meshing checks blocked; the step may still be reported as `S5.projection-only` when its typed contract exists.
- `steps[].contract.crosses` absent or inheriting a migration origin → S5 crossing and coverage checks blocked.
- `vocabulary.terminalStatuses` / `vocabulary.requiredInterfaces` absent → the corresponding S3 check blocked.
- An authored assertion without a matching source step/line/quote is refused by `migrate-v3` and reported by `S5.authored-source-missing`.
- A non-empty `artifact.boundary_grounds` entry covers both `S5.boundary-uncovered` and `S5.crossing-side-missing` for that boundary. An empty ground covers neither.
- `S.evidence-withdrawn` is emitted when a previous finding's check is now blocked. The finding keeps its previous repair route; restore the surface with its producer or record a waiver with a non-empty ground in `SMOOTH-SEQUENCES-WAIVERS.json`. A waiver does not clear the blocked surface.
- `readings:<file>`: an educe readings file is unreadable or a JSONL line is malformed; the reason names the file and line. The report also carries the readings file path, the full distinct unresolved-subject count, and capped subject/line/quote details. Unresolved Yes readings are blocking by default; `--advisory-readings` makes them advisory and prints that policy.

A v2 artifact is readable but can never pass: its v3-only surfaces are blocked and the verdict is `unproven` (exit 4). A v3 artifact whose history records v3 and whose current schema is v2 is a `UNPROVEN_DOWNGRADE`; the run is unproven regardless of findings. A v3 artifact that records `migration` but neither `authorship` nor `synthesized_surfaces` has unknown provenance and blocks every spec claim. Never rewrite a v2 artifact to escape a finding; restore the surface with `migrate-v3 --annotations` instead.

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
# next: fix every finding above; blocked surfaces must also be restored. exit 0 only when both sets are empty.

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
