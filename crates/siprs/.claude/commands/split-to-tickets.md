---
description: Analyzes a design document and decomposes it into phases and individual tickets based on dependencies.
argument-hint: </path/to/RFC-doc.md>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /split-to-tickets

Role: decompose RFC into dependency-ordered phases and safe-I/O-boundary implementation tickets.
Downstream: `Tickets.json` is read/updated by `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, and related commands.

Invariants:
- In: RFC. GRAPH, Dirs-Tree, `Tickets.json` and the SPLIT status file are derived from it by the pipeline's naming rule. Out: `DOC_DIR/Tickets.json`.
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

In: arg1 required RFC/design-document. The GRAPH (`<RFC>-GRAPH.json`), the Dirs-Tree (`<RFC>-Dirs-Tree.json`), `Tickets.json` and the SPLIT status file are derived beside it inside the scripts; they are not arguments. Paths relative | absolute.

## Output Destination

Out: `Tickets.json` in RFC directory; e.g. `docs/RFC-001-process-registry.md` → `docs/Tickets.json`, with the SPLIT status at `docs/RFC-001-process-registry-SPLIT-Status.json`.
Existing output → ask; stop before overwrite.

A ticket that implements a node carrying `unitIds` does not copy them: `add-tickets-for-phase.js` appends every unit its nodes carry to the ticket's own `nodeIds` array before it verifies coverage. The ticket level is the level the consumers read: `verify-consistencies.js` `collectTicketNodeIds` iterates `phases[].tickets[].nodeIds` and never reads a phase-level array, so writing to the phase would put the ids where nothing looks. The schema declares `nodeIds` at both levels as an array of unconstrained strings and requires it at neither, so a unit id is structurally acceptable and no schema change is needed.

## List of Scripts Used

Root: `.claude/scripts/tickets/`; each script derives the fixed artifact paths of its stage, so the invocations below pass only that stage's anchor.

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
| `sequences-slice/verify-implementation-order.mjs --package=<dir> [--write] \| --workspace=<root> [--write]` | proves the ticket and package implementation order; writes `IMPLEMENTATION-ORDER.json` / `WORKSPACIFY-IMPLEMENTATION-ORDER.json` |

All ticket scripts: pre-write `validate-tickets.js`; failure → no save.

Step 5-2 and Step 5-3 also invoke `rfc-graph/project-step-contracts.js --mode=verify` to re-prove the step-contract sidecar against the live graph and view.

## Analysis Procedure

### Step 0: Initialization (argument parsing + Malfeasance.json initialization + determine output destination) and RFC loading

#### 0-1. Initialization

```bash
read -r DOC_PATH _ <<< "$ARGUMENTS"
DOC_DIR="$(dirname "$DOC_PATH")"
BASENAME="$(basename "$DOC_PATH" .md)"
TICKETS_PATH="${DOC_DIR}/Tickets.json"
STATUS_PATH="${DOC_DIR}/${BASENAME}-SPLIT-Status.json"
ARTIFACT_PATH="$(node -e "const fs=require('fs'),p=require('path');const a=require('./.claude/scripts/lib/package-artifacts').findAllocateManifest('$DOC_DIR');if(!a)process.stdout.write('');else{const r=p.dirname(a);const m=fs.readdirSync(r).filter(n=>n.endsWith('-sequences.json'));process.stdout.write(m.length===1?p.join(r,m[0]):'')}")"
GRAPH_PATH="$(node -e "process.stdout.write(require('./.claude/scripts/lib/package-artifacts').deriveGraphPathFromTickets(process.argv[1]) || '')" "$TICKETS_PATH")"
bash .claude/scripts/tickets/init-split-to-ticket.sh --doc-path="$DOC_PATH"
RUN_ID="$(date +%s%N)-$$"
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" begin-run --run-id="$RUN_ID"
node .claude/scripts/sequences-slice/verify-chain.mjs --stage=split --package="$DOC_DIR" --artifact="$ARTIFACT_PATH"
```

Fail-closed preflight: `STALE_DISTRIBUTION_MAP`, `UNIT_SET_MISMATCH`, `SEQUENCE_STEPS_UNDISTRIBUTED`, `MISSING_BOUNDARY_CONTRACT` ⇒ stop; do not create tickets. The same preflight requires the workspace-level `SMOOTH-VERDICT.json`: `MISSING_SMOOTH_RECEIPT` → run graphify first; `STALE_SMOOTH_VERDICT` → smooth or the root artifact moved after the receipt, so rerun graphify, boundify, then split. A missing `Tickets.json` is allowed at Step 0; the post-5-2 gate requires it.
`begin-run` counts one invocation; `end-step 6` advances `generation` only when the Tickets.json digest changes. Audit mode appends `--audit` to the final `end-step 6`: it counts the run, writes no generation, and exits 0 with `wouldExit`.

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
node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --source="$DOC_PATH" --with-cli-examples || {
  echo "(No graph structure summary. graphify needed beforehand. Interrupt split.)"
  exit 1
}
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
node .claude/scripts/rfc-graph/show-dirs-files-tree.js --doc="$DOC_PATH" || {
  echo "(*-Dirs-Tree.json not found. boundify needed beforehand. Interrupt split.)"
  exit 1
}
echo "========================================="
```

Current dirs/files: grill/drill → `/graphify-rfc` → `/boundify-graph` result; do not modify. Allowed: add interface-exposing dir/file for other programs; ticket must state it is absent from corresponding GRAPH/Dirs-Tree. Missing → prompt prior boundify; interrupt split. `default_files` is resolved from leaf files only; a directory path is never written into a ticket. A unit whose Dirs-Tree entry has no leaf file is `UNIT_WITHOUT_FILE`, and a generated header missing the unit is `UNIT_WITHOUT_HEADER`.

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
node .claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js "$DOC_PATH"
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
node .claude/scripts/rfc-graph/show-all-nodes-title-summary.js --tickets="$TICKETS_PATH" --phase="P0"
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
node .claude/scripts/rfc-graph/show-phase-nodes.js --tickets="$TICKETS_PATH" --phase="P{n}"
node .claude/scripts/tickets/show-phase-distribution.js --tickets="$TICKETS_PATH" --phase="P{n}" --artifact="$ARTIFACT_PATH"
```

Read phase node ID/title/kind/summary/implementation path; judge safe single-implementation bundles from I/O-boundary character + file path. The printed distribution is the first constraint: a sequence step stays with the ticket implementing its operation; a ctr unit keeps its registry contract; order is not re-authored.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-1"
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-2"
```

#### 5-2: Ticket creation (add-tickets-for-phase.js)

stdin ticket array → bulk add; script proves all phase `nodeIds` ticketized; failure → rollback/no write/exit 1.

```bash
echo '<tickets-array-json>' | node .claude/scripts/tickets/add-tickets-for-phase.js "$TICKETS_PATH" "P{n}"
```

When the package carries `SEQUENCES.json`, the same script also populates each ticket's `distribution` record: the units of the nodes it owns, the operation obligation or consumer reference, the ordered sequence steps whose operations the ticket implements, and `specRefs`. It then writes the Tickets aggregate. The split does not author these records; it only decides which nodes each ticket owns.
After all 5-2 phase loops, `merge-contracts-to-tickets.js` reads `RFC-STEP-CONTRACTS.json` and adds each sequence step's operation-boundary contract to the ticket's `contracts` with `stepId`, `sequenceId`, `sourceStep` and the contract prose. `show-ticket-context --for-spec` renders them under `## Operation-Boundary Contracts`, and `show-ticket-distribution` renders them beside the step. A sidecar row that reaches no ticket or a ticket contract whose digest differs is `CONTRACT_CHAIN_OPEN` or `STEP_CONTRACT_MISMATCH`. Two contracts with one id in the same ticket are `DUPLICATE_CONTRACT_ID`. The sidecar carries an `edges` map from each edge to the row indexes it binds; the edge note is the bounded `step-sidecar;digest:<hex>` pointer, not a per-row list, so an operation with any number of steps stays under the 240-character note limit.

A phase owns its own nodes. The 5-2 gate checks the units and steps reachable from `phase.nodeIds`, so a unit implemented in P1 is not a P0 omission. The package-global guarantee is the final `verify-chain`: every graph unit reaches a ticket, every owned sequence step reaches exactly one ticket, and an operation has exactly one implementing ticket across all phases. The aggregate keys a ticket by `PX-{id}` in the PX phase and `P{phaseId}-{id}` otherwise, never by the numeric id alone.

Fields: schema `tickets-schema.json#/definitions/ticket`; auto only `id`, `phaseId`, `status`; `additionalProperties: true`; `default_files` is script-set from the Dirs-Tree derived beside `Tickets.json`; AI must not input; `contracts` required input `[]`, auto-populated after 5-2.

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
node .claude/scripts/tickets/merge-contracts-to-tickets.js "$TICKETS_PATH"
node .claude/scripts/rfc-graph/project-step-contracts.js --mode=verify --graph="$GRAPH_PATH" --view="$DOC_DIR/SEQUENCES.json"
node .claude/scripts/tickets/verify-ticket-closure.js --tickets="$TICKETS_PATH"
node .claude/scripts/tickets/verify-all-ticket-coverage.js "$TICKETS_PATH"
node .claude/scripts/tickets/show-ticket-distribution.js "$TICKETS_PATH"
node .claude/scripts/sequences-slice/verify-chain.mjs --stage=split --package="$DOC_DIR" --artifact="$ARTIFACT_PATH" --require-tickets
node .claude/scripts/sequences-slice/verify-implementation-order.mjs --package="$DOC_DIR" --write
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-2"
```

`verify-implementation-order.mjs --package` derives every ticket's implementation prerequisites from the graph hard edges and the artifact's `consumes`/`produces`/`crosses` relations, writes `IMPLEMENTATION-ORDER.json` beside `Tickets.json`, and fails closed on `PREREQUISITE_SET_MISMATCH` (the tickets do not carry what the derivation says), `PREREQUISITE_NOT_BEFORE` (a same-package prerequisite is placed at or after its dependent), `PREREQUISITE_PACKAGE_UNSPLIT` (a cross-package prerequisite has no `Tickets.json`), `PREREQUISITE_PACKAGE_BEFORE` (a cross-package prerequisite is later in the implementation order), and `IMPLEMENTATION_ORDER_CYCLE`. A package without a view or graph is `skipped:no-distribution`.

Every split-stage script derives the graph, Dirs-Tree, RFC and view from the directory holding `$TICKETS_PATH`. The pipeline fixes those names, so the command line does not repeat them; the scripts keep their explicit-path arguments only as overrides for a non-standard layout. `verify-ticket-closure.js` and `merge-contracts-to-tickets.js` also discover the workspace's `WORKSPACIFY-ALLOCATE-MANIFEST.json` at the nearest ancestor holding both workspace manifests, so the registry chain runs whenever the split is inside a workspacify workspace and is skipped otherwise.

Closure/coverage fail → no Step 6; reset 5-2. The named failures are `CONTRACT_CHAIN_OPEN`, `INTER_TICKET_CLOSURE_OPEN`, `MISSING_UNIT_AT_LAYER`, `INVENTED_UNIT`, `MISSING_BOUNDARY_CONTRACT`, `BOUNDARY_CONTRACT_MISMATCH`, `BOUNDARY_DIRECTION_MISMATCH`, `INVENTED_TICKET_CONTRACT`, `DUPLICATE_UNIT_AT_TICKET`, `DUPLICATE_CONTRACT_ID`, `MISSING_IMPLEMENTER`, `AMBIGUOUS_BOUNDARY_EDGE`, `MISSING_SEQUENCE_STEP`, `MISSING_SEQUENCE`, `STEP_IDENTITY_MISMATCH`, `SEQUENCE_STEPS_UNDISTRIBUTED`, `DUPLICATE_SEQUENCE_STEP`, `SEQUENCE_STEP_WITHOUT_IMPLEMENTER`, `SEQUENCE_ORDER_MISMATCH`, `UNASSIGNED_SEQUENCE_STEP`, `SPEC_REF_MISSING`, and `DISTRIBUTION_DIGEST_MISMATCH`. `MISSING_SEQUENCE` names an artifact sequence this package owns that the view does not declare; `STEP_IDENTITY_MISMATCH` names a step whose operationId, order, line, quote, subject, predicate, object, contract or prose differs between the artifact, view or ticket. `SEQUENCE_ORDER_MISMATCH` compares the ticket placement itself: the local steps of one sequence must appear in artifact order across the `(phase, ticket)` positions. Foreign steps and cross-package build order are outside the check. The ticket's unit ids are appended by `add-tickets-for-phase.js`; the author never copies them.

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "5-2"
```

### Step 5-3: Phase consolidation

Complete ticketization → scan phases backward; phase <3 tickets → safely merge into following phase.
Sequence: guard → validation → backward merge → ID re-index → `relatedTicketIds` regeneration → status update → final verification.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-3"
node .claude/scripts/tickets/consolidate-phase-tickets.js "$TICKETS_PATH"
node .claude/scripts/rfc-graph/project-step-contracts.js --mode=verify --graph="$GRAPH_PATH" --view="$DOC_DIR/SEQUENCES.json"
node .claude/scripts/sequences-slice/verify-chain.mjs --stage=split --package="$DOC_DIR" --artifact="$ARTIFACT_PATH" --require-tickets
node .claude/scripts/sequences-slice/verify-implementation-order.mjs --package="$DOC_DIR" --write
WORKSPACE_ROOT="$(node -e "const p=require('./.claude/scripts/lib/package-artifacts').findAllocateManifest(process.argv[1]);process.stdout.write(p?require('path').dirname(p):'')" "$DOC_DIR")"
if [ -n "$WORKSPACE_ROOT" ]; then node .claude/scripts/sequences-slice/verify-implementation-order.mjs --workspace="$WORKSPACE_ROOT" --write; fi
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-3"
```

The workspace gate writes `WORKSPACIFY-IMPLEMENTATION-ORDER.json` with `buildOrder` copied from the stage-2 manifest and `implementationOrder` derived from the union. It never rewrites `Tickets.json` or the published build order. A package whose prerequisite package is unsplit is `PREREQUISITE_PACKAGE_UNSPLIT`; a prerequisite placed later is `PREREQUISITE_PACKAGE_BEFORE`; a union cycle is `IMPLEMENTATION_ORDER_CYCLE`.

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
Stage counters: `end-step 6` records `runs` and advances `generation` only when the Tickets.json digest changes; `--audit` on that step writes no generation.

### Resuming from an Error

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "6"
```

## Notes

Existing destination `Tickets.json` → confirm with user before overwrite.

## Reverse mode (S1 to S6)

**Rotation gate** — this section runs only when `measured-tree-root` holds. The forward rotation generates the tree from a Dirs-Tree and is given no `--root`, so this section cannot fire in one.

Forward: a design document is decomposed into phases and tickets that declare what is to be built. Reverse: the same step describes what is there. Entered by naming a subject tree rather than a design document, and it changes four things.

- **The input is a tree, not a document.** `--root` names the project to describe; there is no RFC and no `GRAPH.json` to read first, and the directory structure comes from the `/boundify-graph` reverse branch.
- **`default_files` is measured, not resolved.** Forward resolves it from the Dirs-Tree through `nodeIds`; here the implementation already exists, so the file is measured on disk and recorded. When none exists yet that fact is recorded explicitly rather than left as an empty list: the loop runs one ticket per session, so an empty file list is a ticket no session can execute.
- **Tickets are reconstruction tickets.** A contract whose test never had a Red cannot be proved by a green suite — the test was written against an implementation that already existed. Each such contract produces exactly one ticket to rebuild that Red, recording whether the absence is re-checkable or is a candidate only a human can settle.
- **`counterexample_plan_id` is mandatory.** It names what the ticket will confirm or refute, not merely what it will implement. A ticket without it is refused rather than emitted: the uncertainty the plan encoded would dissolve at implementation time and the reconstruction would become ordinary test-writing.

```bash
node .claude/scripts/tickets/lib/reverse-split.js --root=<subject tree> \
  --tickets=<path> [--test-dir=<dir>] [--gaps=<path>] [--ledger=<path>] \
  [--language=<name>] [--out=<dir>] [--candidate=<path>] [--json]
```

The exit code is a gate verdict, not a measure of success: 0 when every existing test is mapped and every reconstruction ticket carries a plan identifier, non-zero otherwise. An absence count of zero is a comparison result and never a pass — it means either that no contract was measured or that the detection reads nothing.

Nothing here executes a reconstruction ticket; executing them is a separate step and these tickets are its input.

Absent-Red detection is compared against the frozen answer key rather than asserted, which is what keeps it a measurement:

```bash
node .claude/scripts/workspacify-reverse/run.mjs oracle compare --stage mapping \
  --candidate=<path written by --candidate>
```

The comparison lists disagreements by name in both directions, and never a score or a verdict. Classifying each is a human's work.
