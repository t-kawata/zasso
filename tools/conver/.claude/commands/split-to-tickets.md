---
description: Analyzes a design document and decomposes it into phases and individual tickets based on dependencies.
argument-hint: </path/to/RFC-*.md> </path/to/*-GRAPH.json> </path/to/*-Dirs-Tree.json>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /split-to-tickets

Role: decompose RFC into dependency-ordered phases and safe-I/O-boundary implementation tickets.
Downstream: `Tickets.json` is read/updated by `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, and related commands.

Invariants:
- In: RFC, GRAPH, Dirs-Tree; positional order fixed. Out: `DOC_DIR/Tickets.json`.
- existing `Tickets.json` → ask; stop; overwrite only after user approval.
- all ticket scripts schema-validate before write; failure → no save.
- phase processing: P0 → P1 → …; one phase at a time; never bulk-present/process phases.
- ticketization: every phase-local node exactly once; no omission, duplication, or cross-phase node.
- phase name/summary: every phase complete before Step 5.
- ticket creation: `contracts: []`; only `merge-contracts-to-tickets.js` populates contracts after 5-2.
- script-owned: `id`, `phaseId`, `status`, `default_files`; AI must not provide.
- closure/coverage failure → no Step 6.
- phase <3 tickets → backward merge into following phase; re-index IDs; regenerate `relatedTicketIds`; final verify.
- TDD: Red → Green → Refactor; serial only; no skip/reorder/parallel.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Argument Interpretation

In: arg1 required RFC/design-document; arg2 required I/O-boundary GRAPH; arg3 required safe-boundary Dirs-Tree; paths relative | absolute.

## Output Destination

Out: `Tickets.json` in RFC directory; e.g. `docs/RFC-001-process-registry.md` → `docs/Tickets.json`.
Existing output → ask; stop before overwrite.

## List of Scripts Used

Root: `.claude/scripts/tickets/`; status/graph utility invocations below retain source paths.

| Script | Contract |
|---|---|
| `write-tickets-json-template.js <Tickets.json> '<metadata-json>'` | skeleton; `phases: []` |
| `add-phase.js <Tickets.json>` | stdin phase JSON; phaseID auto-increments from 0 |
| `add-ticket.js <Tickets.json> P{phaseID}` | stdin one ticket; ticketID auto-increments in phase |
| `bulk-add-tickets.js <Tickets.json>` | stdin bulk tickets; phase by `phaseId`/`phaseName` |
| `get-ticket.js <Tickets.json> P{phaseID}-{ticketID}` | ticket lookup |
| `search-tickets.js <Tickets.json> <query>` | title/background/scope/referenceSection search |
| `all-tickets.js <Tickets.json> [status-filter]` | list; optional status filter |
| `update-ticket.js <Tickets.json> P{phaseID}-{ticketID}` | stdin update; phaseId/ticketID immutable |
| `bulk-update-tickets.js <Tickets.json>` | stdin bulk update |
| `delete-ticket.js <Tickets.json> P{phaseID}-{ticketID}` | one deletion |
| `bulk-delete-tickets.js <Tickets.json>` | stdin deletion-key list |
| `list-phases-and-tickets.js <Tickets.json>` | checklist output |
| `update-split-step-status.js --status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <STEP_ID>` | SPLIT status; source invocations below literal |

All ticket scripts: pre-write `validate-tickets.js`; failure → no save.

## Analysis Procedure

### Step 0: Initialization (argument parsing + Malfeasance.json initialization + determine output destination) and RFC loading

#### 0-1. Initialization

```bash
IFS=' ' read -r DOC_PATH GRAPH_PATH DIRS_TREE_PATH <<< "$ARGUMENTS"
DOC_DIR="$(dirname "$DOC_PATH")"
BASENAME="$(basename "$DOC_PATH" .md)"
STATUS_PATH="${DOC_DIR}/${BASENAME}-SPLIT-Status.json"
bash .claude/scripts/tickets/init-split-to-ticket.sh --doc-path="$DOC_PATH"
```

From 0-1, status commands:

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step <STEP_ID>
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step <STEP_ID>
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" fail-step <STEP_ID>
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step <STEP_ID>
```

#### 0-2. Create Malfeasance.json

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "0-1"
node .claude/scripts/tickets/ensure-malfeasance.js "$DOC_DIR"
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "0-1"
```

`Malfeasance.json`: `DOC_DIR` ledger; incomplete implementation without `[::STUB::]` = crime; create empty if absent.

### Resuming from an Error

fix per script error; reset `"0-1"`; rerun Step 0.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "0-1"
```

#### 0-3. Read RFC (understand structure via analyze-source-structure.js → read sections sequentially)

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "0-2"
echo "=== RFC Structure Analysis ==="
node ".claude/scripts/rfc-graph/analyze-source-structure.js" "$DOC_PATH"
echo "=============================="
```

Never read long RFC all at once. After line-range structure analysis, read all sections top→bottom sequentially; retain purpose/scope, stack, data types, architecture/data/control flow, I/O boundaries, testing strategy.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "0-2"
```

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "0-2"
```

---

### Step 1: Reference I/O boundary information in the RFC

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "1"
echo "=== I/O Boundary Reference ==="
node ".claude/scripts/grill-me-for-rfc/extract-io-boundary.js" "$DOC_PATH" || echo "(No I/O boundary reference. grill/drill needed beforehand. Interrupt split.)"
echo "============================="
```

I/O reference: RFC-author intent at grill/drill time; respect as far as possible; may differ from later `/graphify-rfc` divergent subdivision. Missing → prompt prior grill/drill; interrupt split.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "1"
```

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "1"
```

---

### Step 2: Examine the relationship graph structure in the RFC design

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "2"
echo "=== Graph Structure Summary ==="
if [ -f "$GRAPH_PATH" ]; then
  node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="$GRAPH_PATH" --source="$DOC_PATH" --with-cli-examples
else
  echo "(No graph structure summary. graphify needed beforehand. Interrupt split.)"
fi
echo "==============================="
```

GRAPH: `/graphify-rfc` safe I/O-boundary nodes; finer/newer than Step 1 reference; primary ticket-decomposition material. Missing → prompt prior graphify; interrupt split.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "2"
```

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "2"
```

---

### Step 3: Examine directory and file structure via boundify

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "3"
echo "=== boundify Directory/File Structure ==="
if [ -f "$DIRS_TREE_PATH" ]; then
  node .claude/scripts/rfc-graph/show-dirs-files-tree.js "$DIRS_TREE_PATH"
else
  echo "(*-Dirs-Tree.json not found. boundify needed beforehand. Interrupt split.)"
fi
echo "========================================="
```

Current dirs/files: grill/drill → `/graphify-rfc` → `/boundify-graph` result; do not modify. Allowed: add interface-exposing dir/file for other programs; ticket must state it is absent from corresponding GRAPH/Dirs-Tree. Missing → prompt prior boundify; interrupt split.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "3"
```

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "3"
```

---

### Step 4: Primary phase design (mechanical phase grouping)

#### 4-1. Phase splitting via script

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "4-1"
node .claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js "$GRAPH_PATH" "$DIRS_TREE_PATH"
```

Weighted topological sorting + SCC condensation; all nodes → `Tickets.json.phase[].nodeIds`. Final `✅` → pass; `⚠️` → report cause; interrupt split.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "4-1"
```

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "4-1"
```

#### 4-2. Write names and summaries for all phases

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "4-2"
```

Order: P0 → P1 → …; one phase only; display nodes → judge name/summary → write; never output all phases in bulk.

```bash
node .claude/scripts/rfc-graph/show-all-nodes-title-summary.js --tickets="$TICKETS_PATH" --graph="$GRAPH_PATH" --phase="P0"
echo '{"name":"Authentication Infrastructure","summary":"Authentication token generation, verification, and session management"}' | node .claude/scripts/rfc-graph/write-phase-name-summary.js "$TICKETS_PATH" "P0"
node .claude/scripts/rfc-graph/check-phase-names-summaries.js "$TICKETS_PATH"
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "4-2"
```

Missing name/summary → fail; no Step 5.

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "4-2"
```

### Step 5: Primary ticket definition (ticket creation)

#### 5-1: Retrieve detailed information for nodes within a phase

Phase-order contract:
1. Run 5-1 for all phases P0 → P1 → …, one phase at a time; never bulk-process phases.
2. Only after every 5-1 phase loop completes: end 5-1; start 5-2.
3. Then run 5-2 for all phases P0 → P1 → …, one phase at a time.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-1"
node .claude/scripts/rfc-graph/show-phase-nodes.js --tickets="$TICKETS_PATH" --graph="$GRAPH_PATH" --dirs-tree="$DIRS_TREE_PATH" --phase="P{n}"
```

Read phase node ID/title/kind/summary/implementation path; judge safe single-implementation bundles from I/O-boundary character + file path.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-1"
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-2"
```

#### 5-2: Ticket creation (add-tickets-for-phase.js)

stdin ticket array → bulk add; script proves all phase `nodeIds` ticketized; failure → rollback/no write/exit 1.

```bash
echo '<tickets-array-json>' | node .claude/scripts/tickets/add-tickets-for-phase.js "$TICKETS_PATH" "$DIRS_TREE_PATH" "P{n}" "$GRAPH_PATH"
```

Fields: schema `tickets-schema.json#/definitions/ticket`; auto only `id`, `phaseId`, `status`; `additionalProperties: true`; `default_files` script-set with `--dirs-tree`; AI must not input; `contracts` required input `[]`, auto-populated after 5-2.

| Field | Minimum contract |
|---|---|
| `background` | 300+ chars; concrete code-level investigation/reference |
| `scope` | every item with type signature |
| `notes` | multiple sections; 500+ chars; implementation/test/translatability/risks |
| `relatedTicketIds` | explicit dependency direction + reason |
| `acceptanceCriteria` | 3–5 one-line happy/error/edge conditions |

Ticket composition: one or more nodes/ticket; single node allowed; all nodeIds exactly once; every included node listed; phase-local only; no simplistic `<...>` placeholder.

### Reference — Implementation Order (TDD Red-Green-Refactor)

Red → Green → Refactor; serial only; skip/reorder/parallel prohibited.

Red: before implementation, failing automated tests cover Goal/Purpose/Motivation/Constraints/Scope/Acceptance Criteria/Invariants; edge contract pre/post/invariant → testable input/output/invariant assertions; all observable behavior/edge/failure/invariant covered; deterministic but fundamentally untestable → redesign architectural defect; absent implementation must fail tests; accidental green invalid.

Green: generalized specified behavior only; no hardcode/input branch/stub/disguised green; inability to distinguish genuine green → add tests; never modify/delete/weaken tests; unprovable correctness invalid.

Refactor: green only; Boy Scout Rule; eliminate touched `unwrap()`, hardcode, false comment, untested code; green before/after each refactor; broken green → immediate rollback.

Done: precise tests, all green, empirical genuine correctness, no coverage/intent gap. Green-without-red, test-modified-green, stub-green = incomplete violation.

### Test Field Reference

| Field | Contract | Format |
|---|---|---|
| `testUnit` | automated function/module normal/edge/failure tests | `UT:` |
| `testIntegration` | automated multi-module tests; name integrated tickets/modules | `IT:` |
| `testExceptions` | technical reason + why not deterministic/fundamentally-untestable architecture defect | free text |

`UT:` / `IT:` are automated code, never manual tests; together cover implementation correctness. `testExceptions` supplements, never substitutes.

After all 5-2 phase loops complete:

```bash
node .claude/scripts/tickets/merge-contracts-to-tickets.js "$TICKETS_PATH" "$GRAPH_PATH"
node .claude/scripts/tickets/verify-ticket-closure.js --tickets="$TICKETS_PATH" --graph="$GRAPH_PATH"
node .claude/scripts/tickets/verify-all-ticket-coverage.js "$TICKETS_PATH"
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-2"
```

Closure/coverage fail → no Step 6; reset 5-2.

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "5-2"
```

### Step 5-3: Phase consolidation

Complete ticketization → scan phases backward; phase <3 tickets → safely merge into following phase.
Sequence: guard → validation → backward merge → ID re-index → `relatedTicketIds` regeneration → status update → final verification.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-3"
node .claude/scripts/tickets/consolidate-phase-tickets.js "$TICKETS_PATH" "$STATUS_PATH"
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-3"
```

Final `✅` → pass; `⚠️` → judge cause; fix; rerun 5-3.

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "5-3"
```

### Step 6: Output phase and ticket checklist

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "6"
node .claude/scripts/tickets/list-phases-and-tickets.js "$TICKETS_PATH"
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "6"
```

Out: checklist hierarchy `P<n>` → `P<n>-<ticket>`.

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "6"
```

## Notes

Existing destination `Tickets.json` → confirm with user before overwrite.
