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

Run from the directory containing `Tickets.json` (the target source tree is the current directory or a subdirectory passed as the argument).

### Step 1 — Enumerate

```bash
node .claude/scripts/tickets/review/find-all-stubs.js .
```

Collect every `[::STUB::]` marker with `{ file, line, content }`.

### Step 2 — Group into units (AI judgment — the only non-deterministic step)

Group fragments into ticket-sized units by logical cohesion. The primary signal is the **unlock dependency** (the prerequisite that must hold before the work is doable, e.g. "the FFI layer is linked", "the runtime owns the event bus"); secondary signals are domain coherence, shared spec section, and shared work-item shape.

**Acceptance test for a unit**: "If I wrote a single ticket for this unit, would its ACs be coherent, and could one implementer do all of its markers in one pass once the unlock dependency lands?"

Split a unit when it is too large to be one ticket; merge when too small.

### Step 3 — Choose each unit's resolve key

For each unit pick exactly one resolve key:

- If the unit's work is already covered by an **active future todo** ticket → re-point to that key.
- Otherwise (the common case) → re-point to the **original completed ticket** whose scope the work belongs to. This is the `resolvedCandidates` handoff: `/find-omissions` will create a resolving ticket cloned from it.

The following resolve keys are **forbidden** — do not use them as a unit key:

| Forbidden | Why | What to do instead |
|---|---|---|
| `MUST RESOLVE` | This is a placeholder meaning "to be resolved later, unspecified". A STUB must reference a **concrete existing ticket**; an unspecified target cannot be cloned or tracked, so the marker would become an orphan. | Re-point the unit to the original completed ticket whose scope the work belongs to (or an active future todo ticket). |
| `PX-*` (e.g. `PX-5`) | PX-phase tickets have ambiguous ordering and break the pipeline timeline, so they are rejected as resolve targets by the tooling. | Use a normal `P{phase}-{id}` ticket key. |
| A key not present in `Tickets.json` | A non-existent ticket cannot be cloned by `/find-omissions` (no source to deep-clone), so the marker can never be re-ticketed. | Choose the ticket whose scope actually covers the unit's work — it must already exist in `Tickets.json`. |
| A terminal-excuse plan (e.g. "awaiting approval", "blocked until the FFI is linked") | A resolution plan must be an **AI-executable work item**. "Waiting for X" is not something an AI can do, so the marker would fail the no-excuse gate and the ticket could never be implemented. | Rewrite the plan as an imperative deliverable, e.g. "Vendor and build the FFI library in build.rs". |

### Step 4 — Normalize markers mechanically (update-stub.js)

Re-point every marker in a unit to its unit key via `update-stub.js` (never edit source by hand). The tool preserves each marker's file:line anchor and only rewrites the target line.

```bash
node .claude/scripts/tickets/update-stub.js \
  --file=<path> --line=<N> --resolve-by-ticket=<unit-key> \
  --stub-reason="<merged reason>" --resolve-plan="<unit work item>" \
  --unit-id=<unit-id>
```

Each flag means:

| Flag | What to put | Example |
|---|---|---|
| `--file=<path>` | The source file that contains the marker you are re-pointing. | `--file=src/call.rs` |
| `--line=<N>` | The 1-indexed line number of that marker (from Step 1's enumeration). | `--line=23` |
| `--resolve-by-ticket=<unit-key>` | The unit's resolve key chosen in Step 3 — the same key for **every** marker in the unit. | `--resolve-by-ticket=P4-2` |
| `--stub-reason="..."` | The reason this code stays a stub, merged across the unit's markers (a single line). | `--stub-reason="codec enumeration deferred until FFI types exist"` |
| `--resolve-plan="..."` | What the resolving ticket must concretely implement — an imperative, AI-executable deliverable (a single line). | `--resolve-plan="Implement pjsua codec enumeration via runtime codec API"` |
| `--unit-id=<unit-id>` | The unit's identifier — the **same id for every marker in the unit**. This tag is what the manifest printer uses to group the markers back together, so pick a distinct id per unit (e.g. `U1`, `U2`, ...). | `--unit-id=U1` |

Run this once per marker in the unit, always passing the same `--resolve-by-ticket` **and** the same `--unit-id`. Tickets.json is always `./Tickets.json` in the current directory — `--tickets-path` is not accepted (same convention as `batch-create-resolving-tickets.js`).

**Merge true duplicates** (same defect, same file/region) by keeping the lowest-line marker and removing the others with `remove-stub.js`; the survivor's content is annotated with the covered line span:

```bash
node .claude/scripts/tickets/remove-stub.js --file=<path> --lines=<N1,N2,...>
```

Each flag means:

| Flag | What to put | Example |
|---|---|---|
| `--file=<path>` | The source file that contains the duplicate markers. | `--file=build.rs` |
| `--lines=<N1,N2,...>` | The comma-separated line numbers of the markers to **remove** — the redundant duplicates, **not** the survivor you keep. | `--lines=11` (when keeping line 8) |

### Step 5 — Run the gates

```bash
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
node .claude/scripts/tickets/validate-stub-format.js
```

Loop until exit 0: fix any reported marker (rewrite the plan / rewrite the key / remove a stale duplicate). Note that markers re-pointed to a completed key will fail Check C (stale key) by design — that is the find-omissions re-ticketization signal, not an excuse; the gate's intent is zero terminal excuses (Check A/B) and well-formed markers.

### Step 6 — Emit the handoff manifest

Run the manifest printer (no input — it scans the tree for the `[::UNIT::]` tags you embedded in Step 4):

```bash
node .claude/scripts/tickets/print-manifest-for-find-omissions.js
```

The script:
1. scans the tree for `[::UNIT::<id>::]`-tagged markers and groups them by unit id,
2. writes the grouped manifest — one `{ sourceKey, stubs: [{file,line,content}] }` entry per unit — to **`./manifests/CONSOLIDATED-MANIFEST-<YYYYMMDDhhmmss>.json`** (auto-creating `manifests/`),
3. and only after a successful write, mechanically strips every `[::UNIT::]` tag from the source markers so they return to their clean format.

That manifest file is the input to `/find-omissions` Step 1, which creates one resolving ticket per unit. You can preview the ticket count without committing by piping the file to the batch tool's dry-run:

```bash
cat manifests/CONSOLIDATED-MANIFEST-*.json \
  | node .claude/scripts/tickets/batch-create-resolving-tickets.js --no-write
```

## Output Message Convention

Every stdout/stderr line is English, self-contained, and Action-directive. A fresh session must be able to act on a message alone.
