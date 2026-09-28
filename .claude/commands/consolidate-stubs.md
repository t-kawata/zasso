---
description: Consolidate existing STUB markers into ticket-sized units by normalizing resolve keys.
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /consolidate-stubs

Role: reorganize `[::STUB::]` markers into one-ticket-sized units by editing marker lines (key normalization). never creates tickets — that stays with find-omissions.

First-Class Rule — [::STUB::]: every marker keeps a resolvable, non-PX, non-MUST key. no marker deleted without location preserved (true-duplicates only; survivor enumerates covered lines).

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Why

STUBs fragment into slivers (wiring hooks, accessor exposure, mechanical swaps, duplicates). key-normalization by unit → find-omissions creates one ticket per unit, not per marker.

## Design Principles

- markers stay at their sites — edit, never delete (file:line provenance preserved)
- one resolve key per unit
- completed-key re-pointing allowed → becomes a `resolvedCandidates` entry for find-omissions
- no ticket creation here — uncovered unit → find-omissions candidate only
- true-duplicate merge only (same defect, same region) — survivor enumerates all covered lines

## Workflow

cwd = Tickets.json root = the current directory = target tree.

### Step 1 — Enumerate

```bash
node .claude/scripts/tickets/review/find-all-stubs.js .
```
out: every marker as `{ file, line, content }`.

### Step 2 — Group into units (AI judgment — the only non-deterministic step)

judge: unit = markers sharing (1) same unlock (marker-plan prerequisite — "once X"/"after Y"/"requires Z") and (2) one deliverable (one ticket's ACs cover it).
test: one implementer, one pass, one test surface, after the unlock lands?

| Question | Split when… |
|---|---|
| Same unlock dependency? | Markers wait on different prerequisites — e.g. "once the FFI is linked" vs "once the runtime owns the event bus". |
| One deliverable? | Markers produce unrelated outcomes — e.g. one adds audio capture, another fixes error codes. |
| One pass / one test surface? | A marker alone would need its own test setup or its own review. |

merge only if same unlock + same deliverable + neither independently testable. when in doubt, split — an over-small ticket is a minor cost; a ticket bundling two deliverables is a review/testing liability.

Example: markers saying "once the FFI is linked" that produce FFI bindings (a `bindings` module, generated constants, callback stubs) form one unit. A marker also saying "once the FFI is linked" but producing a **user-facing audio API** with its own ACs/tests is a *different* unit — different deliverable despite the shared unlock.

### Step 3 — Author the units decision file

judge: key = active-future-todo ticket covering the work; else original completed ticket whose scope it belongs to. omit key → tool auto-derives from the markers' existing keys.

| Forbidden | Why | Instead |
|---|---|---|
| `MUST RESOLVE` | unspecified target — cannot be cloned/tracked, marker becomes orphan | re-point to original completed ticket (or active future todo) |
| `PX-*` (e.g. `PX-5`) | PX-phase ordering is ambiguous — rejected by tooling | use a normal `P{phase}-{id}` key |
| a key not in `Tickets.json` | non-existent ticket cannot be cloned by find-omissions | choose an existing ticket |
| a terminal-excuse plan (e.g. "awaiting approval") | plan must be AI-executable or no-excuse gate fails | rewrite as an imperative deliverable |

Write the decision once to JSON — the batch tool does the rest:
```json
[
  {
    "unitId": "U1",
    "resolveByTicket": "P4-2",
    "reason": "codec enumeration deferred until FFI types exist",
    "plan": "Implement pjsua codec enumeration via runtime codec API",
    "markerLines": ["src/call.rs:23", "src/config.rs:69"]
  }
]
```

| Field | What it is | Required? |
|---|---|---|
| `unitId` | unique id (e.g. `"U1"`); Step 4 tags markers `[::UNIT::<id>::]` for the manifest printer to regroup; unique across the file; in-memory only — not in the emitted manifest; decision file consumed on success | **Required** |
| `resolveByTicket` | the one resolve key for the unit. omit → tool derives from the FIRST marker's existing key only — a unit whose first marker is `MUST RESOLVE`/`PX-*` requires an explicit key | Optional |
| `reason` | merged "why this stays a stub," once per unit. omit → keep each marker's existing reason | Optional |
| `plan` | merged resolution plan, AI-executable, one line only (`validate-stub-format` rejects trailing lines — a multi-line plan fails the Step 5 gate). omit → keep each marker's existing plan | Optional |
| `markerLines` | every marker in the unit, as `"<file>:<line>"` from Step 1. a marker belongs to exactly one unit | **Required** |

Staging: `$TMPDIR/units-$(mktemp -u XXXXXX).json` — collision-free, never a fixed in-repo name (accidental-commit risk):
```bash
UNITS_JSON="$TMPDIR/units-$(mktemp -u XXXXXX).json"
```
consumed (deleted) by the batch tool on success.

### Step 4 — Verify the plan, then apply (batch-update-stub.js)

dry-run first (zero side effects, mandatory before apply):
```bash
node .claude/scripts/tickets/batch-update-stub.js "$UNITS_JSON" --dry-run
```
out: marker → unit → key changes, plus `UNASSIGNED` list. confirm, then apply:
```bash
node .claude/scripts/tickets/batch-update-stub.js "$UNITS_JSON"
```
atomic: validates every edit first; any failure → zero writes.
apply: writes rollback backup `manifests/ROLLBACK-<ts>.json` → re-points all listed markers to their unit key → merges true duplicates → emits manifest → strips `[::UNIT::]` tags → consumes decision file.
report: manifest path + `N markers -> M units`; Omissions (`UNASSIGNED: file:line, ...`); Failures (zero writes); Debris (clean on success); Rollback path.

undo (precise, no git): `node .claude/scripts/tickets/batch-update-stub.js --rollback manifests/ROLLBACK-<ts>.json`

### Step 5 — Verify the result (blocking gate)

```bash
bash .claude/scripts/tickets/consolidate-stubs-gate.sh
```
exit0 → done. exit≠0 → real defect only (terminal-excuse plan / malformed marker / non-existent key / manifest not consumable by find-omissions) — a marker re-pointed to a completed key is intended output, not a failure.

rule (hard): exit≠0 ⇒ must NOT proceed.

Heal-loop recovery (strict order):
1. rollback: `node .claude/scripts/tickets/batch-update-stub.js --rollback manifests/ROLLBACK-<ts>.json`
2. fix: correct the offending Step-3 entry (`reason`/`plan`/`resolveByTicket`/`markerLines`) in a fresh `/tmp` decision file — or, if the failure is on a marker NOT in the units JSON (`UNASSIGNED`, or added after apply), fix that marker directly (re-point key / rewrite terminal-excuse plan / fold into a unit)
3. re-run Step 4 (`--dry-run` then apply)
4. re-run this gate
loop until rollback+apply+gate all exit 0.

manifest `./manifests/CONSOLIDATED-MANIFEST-<YYYYMMDDhhmmss>.json` — the newest one, never a concatenating glob — → find-omissions Step 1: one ticket per unit referencing a completed key (active-future-todo units already tracked, skipped). find-omissions consumes+removes the manifest (and `ROLLBACK-*.json`) on full success — re-running requires a fresh consolidation.
