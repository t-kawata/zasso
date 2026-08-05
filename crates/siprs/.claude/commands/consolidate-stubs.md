---
description: Consolidate existing STUB markers into ticket-sized units by normalizing resolve keys.
disable-model-invocation: true
---

# /consolidate-stubs

**Role**: Re-organize existing `[::STUB::]` markers so each maps to one coherent ticket-sized unit. The consolidation is achieved by **editing marker lines** (normalizing each unit's resolve key), never by creating tickets — new-ticket creation stays with `/find-omissions`.

**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: every marker must keep a resolvable, non-PX, non-MUST key. No marker is ever deleted without its location being preserved (true duplicates only, survivor enumerates covered lines).

## Why

STUB markers often accumulate as sub-ticket fragments — wiring hooks, accessor exposure, mechanical constant/type swaps, hardcode replacements, and duplicates — that split one ticket's work into many slivers. Consolidating them into coherent units by normalizing resolve keys lets `/find-omissions` create **one ticket per unit** instead of one per marker.

## Design Principles

- **Markers stay at their sites** — file:line provenance is preserved; consolidation is a key/content edit, not a deletion.
- **One key per unit** — every marker in a unit references exactly one resolve key.
- **Completed-key re-pointing is allowed** — a marker re-pointed to a completed ticket becomes a `resolvedCandidates` entry that `/find-omissions` re-tickets (the referenced ticket is the clone source).
- **No ticket creation** — a unit with no existing covering ticket is emitted as a find-omissions candidate, never created here.
- **True-duplicate removal only** — markers sharing the same defect in the same region merge; the survivor enumerates the covered lines so no location is lost.

## Workflow

Run from the directory containing `Tickets.json` (the target source tree is always the current directory — the Tickets.json root).

### Step 1 — Enumerate

```bash
node .claude/scripts/tickets/review/find-all-stubs.js .
```

Collect every `[::STUB::]` marker with `{ file, line, content }`.

### Step 2 — Group into units (AI judgment — the only non-deterministic step)

A **unit** is a set of markers that should become **one ticket**. Two markers belong in the same unit only when both of the following hold.

**Criterion 1 — Same unlock dependency (the grouping key).**
The unlock dependency is the prerequisite that must become true before the work is doable — read it from each marker's plan ("once X", "after Y", "requires Z"). Markers that wait on **the same** prerequisite are candidates for one unit; markers that wait on **different** prerequisites belong to different units.

**Criterion 2 — Single coherent deliverable (the validity check).**
The markers in a unit must all contribute to **one deliverable** — one feature/module outcome that a single ticket's Acceptance Criteria can describe. If the group would need two unrelated sets of ACs, split it.

**The single-ticket test (apply this to every candidate unit):**
> Could one implementer complete **all** of this unit's markers in **one pass** — after the unlock dependency lands — and verify the result with **one test surface**?

Answer these three questions. If **any** is "no", split the unit:

| Question | Split when… |
|---|---|
| Same unlock dependency? | Markers wait on different prerequisites — e.g. "once the FFI is linked" vs "once the runtime owns the event bus". |
| One deliverable? | Markers produce unrelated outcomes — e.g. one adds audio capture, another fixes error codes. |
| One pass / one test surface? | A marker alone would need its own test setup or its own review. |

**Merge rule:** two separately-formed units may merge only when they share the same unlock dependency **and** the same deliverable **and** neither is independently testable on its own. When in doubt, **split** — a ticket that is too small is a minor cost, a ticket that bundles two deliverables is a review and testing liability.

**Example:** markers that say "once the FFI is linked" and produce FFI bindings (a `bindings` module, generated constants, callback stubs) form one unit. A marker that says "once the FFI is linked" but produces a **user-facing audio API** with its own ACs and tests is a different unit — it has a different deliverable even though it shares the unlock.

### Step 3 — Author the units decision file

For each unit, decide one resolve key:

- If the unit's work is already covered by an **active future todo** ticket → use that key.
- Otherwise (the common case) → use the **original completed ticket** whose scope the work belongs to. **If you omit the key, the batch tool derives it from the markers' existing keys automatically.**
- Forbidden keys:

| Forbidden | Why | What to do instead |
|---|---|---|
| `MUST RESOLVE` | An unspecified target cannot be cloned or tracked; the marker would become an orphan. | Re-point to the original completed ticket (or an active future todo). |
| `PX-*` (e.g. `PX-5`) | PX-phase tickets have ambiguous ordering and are rejected by the tooling. | Use a normal `P{phase}-{id}` ticket key. |
| A key not in `Tickets.json` | A non-existent ticket cannot be cloned by `/find-omissions`. | Choose a ticket that already exists in `Tickets.json`. |
| A terminal-excuse plan (e.g. "awaiting approval") | A resolution plan must be an **AI-executable work item** or the no-excuse gate fails. | Rewrite the plan as an imperative deliverable. |

Write your decision once to a JSON file — the batch tool does all the mechanical work from here:

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

Each field means:

| Field | What it is | Required? |
|---|---|---|
| `unitId` | A unique identifier for this unit (e.g. `"U1"`, `"U2"`, …). Step 4 tags this unit's markers with `[::UNIT::<id>::]` so the manifest printer can group them back together — it must be **unique across the whole file**. It is an in-memory grouping id only: it does **not** appear in the emitted manifest (one `{ sourceKey, stubs: […] }` entry per unit), and the decision file is consumed on success. | **Required** |
| `resolveByTicket` | The one resolve key for this unit — the ticket the consolidated work belongs to (an active future todo, or the original completed ticket). **Omit it to let the tool derive the key from the FIRST marker's existing key only** — a unit whose first marker is `MUST RESOLVE` or `PX-*` requires an explicit `resolveByTicket`. | Optional |
| `reason` | The merged "why this stays a stub" text, written once for the whole unit. **Omit it to keep each marker's existing reason.** | Optional |
| `plan` | The merged resolution plan — what the resolving ticket must concretely implement, as an AI-executable deliverable. Keep it on **one line** — `validate-stub-format` rejects markers with non-empty trailing lines, so a multi-line plan would fail the Step 5 gate. **Omit it to keep each marker's existing plan.** | Optional |
| `markerLines` | Every marker in this unit, as `"<file>:<line>"` taken from Step 1's enumeration (e.g. `"src/call.rs:23"`). A marker may belong to **exactly one** unit. | **Required** |

Create the file under `/tmp` with a **collision-free name** — never a fixed name inside the repo (a fixed name would collide with other work and could be committed by accident). Use `mktemp` / `$TMPDIR`, e.g.:

```bash
UNITS_JSON="$TMPDIR/units-$(mktemp -u XXXXXX).json"
```

The batch tool consumes (deletes) the file on success, so the decision never lingers in the repo.

### Step 4 — Verify the plan, then apply (batch-update-stub.js)

**First, review the edit plan with `--dry-run`** — it shows every marker → unit → key change plus the `UNASSIGNED` list, **with zero side effects**:

```bash
node .claude/scripts/tickets/batch-update-stub.js "$UNITS_JSON" --dry-run
```

Confirm the grouping (and that the `UNASSIGNED` list is expected), then apply:

```bash
node .claude/scripts/tickets/batch-update-stub.js "$UNITS_JSON"
```

The tool validates every edit first (atomic — any failure aborts with zero writes), then writes a **rollback backup** (`manifests/ROLLBACK-<ts>.json`), re-points all listed markers to their unit key, merges true duplicates, emits the manifest, strips the `[::UNIT::]` tags, and consumes the decision file.

It reports:
- the manifest path + `N markers -> M units`,
- **Omissions**: any scanned marker you did **not** assign to a unit (`UNASSIGNED: file:line, ...`),
- **Failures**: any edit that failed to validate (with zero writes made),
- **Debris**: the decision file is removed and the tree is left clean on success,
- **Rollback**: the backup path, in case you later decide the apply was wrong.

**Undo a wrong apply precisely** — no git involved:

```bash
node .claude/scripts/tickets/batch-update-stub.js --rollback manifests/ROLLBACK-<ts>.json
```

### Step 5 — Verify the result (blocking gate)

The batch tool has already emitted the manifest. Run the blocking gate:

```bash
bash .claude/scripts/tickets/consolidate-stubs-gate.sh
```

The gate exits non-zero only on a **real** problem — a terminal-excuse plan, a malformed marker, a non-existent key, or a manifest that is not consumable by `/find-omissions`. Markers re-pointed to a completed key are the intended output and do **not** fail.

**This is a blocking gate — if the gate exits non-zero, you must NOT proceed.** A failure means a real defect slipped through Step 4 (or the tree changed after the apply). Recover in this exact order:

1. **Roll back the apply** — restore the pre-consolidation state precisely:
   ```bash
   node .claude/scripts/tickets/batch-update-stub.js --rollback manifests/ROLLBACK-<ts>.json
   ```
2. **Return to Step 3 and fix the units JSON** — correct the `reason` / `plan` / `resolveByTicket` / `markerLines` entry that caused the failure, and create a fresh `/tmp` decision file. **If the failure is on a marker NOT in the units JSON** (an `UNASSIGNED` marker, or one added after the apply), fix that marker directly — re-point its key to a valid ticket, rewrite a terminal-excuse plan into an imperative deliverable, or fold it into a unit in the decision file — then continue with Step 4.
3. **Re-run Step 4** — `--dry-run` to confirm the fix, then apply (this also rewrites the manifest).
4. **Re-run this gate** — loop until all three commands exit 0.

The manifest file — **`./manifests/CONSOLIDATED-MANIFEST-<YYYYMMDDhhmmss>.json`** — is the deliverable passed to `/find-omissions` Step 1, which creates one resolving ticket per unit that references a completed key (a unit whose resolve key is an active future todo is already tracked and is skipped). `/find-omissions` **consumes and removes** this manifest (and the `ROLLBACK-*.json` backup) on full success — re-running `/find-omissions` requires a fresh `/consolidate-stubs`.
