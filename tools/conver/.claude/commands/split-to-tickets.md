---
description: Analyzes a design document and decomposes it into phases and individual tickets based on dependencies.
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
- existing `Tickets.json` → evolve in place; never renumber a phase/ticket id; fresh rebuild only when absent.
- all ticket scripts schema-validate before write; failure → no save.
- phase processing: P0 → P1 → …; one phase at a time; never bulk-present/process phases.
- ticketization: every phase-local node exactly once; no omission, duplication, or cross-phase node.
- phase name/summary: every phase complete before Step 5.
- ticket creation: `contracts: []`; only `merge-contracts-to-tickets.js` populates contracts after 5-2.
- script-owned: `id`, `phaseId`, `status`, `default_files`; AI must not provide.
- closure/coverage failure → no Step 6.
- phase <3 tickets → merge phases, never split tickets; the last phase merges backward; re-index IDs; regenerate `relatedTicketIds`; final verify.
- TDD: Red → Green → Refactor; serial only; no skip/reorder/parallel.

**Path anchor (mandatory — resolve once).**

Run this once at the start of the command:

```bash
printf '%s/.claude\n' "$(git rev-parse --show-toplevel)"
```

Record the printed absolute path as `CLAUDE_DIR`. In every later bash block, use that literal path: substitute it into `node "$CLAUDE_DIR/scripts/..."`, or assign `CLAUDE_DIR="<the printed path>"` at the top of the block. Do not run `git rev-parse` again, and do not assume the current directory is the repository root.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Argument Interpretation

In:
- none. This command takes no argument; the source is fixed at `./RFC.md`.
- a non-empty argument list is refused, because a caller-supplied path would select a document other than the package's canonical RFC.

Preflight (runs before Step 0 writes anything):

```bash
DOC_PATH="RFC.md"

if [ -n "$ARGUMENTS" ]; then
  echo "[ERROR] UNEXPECTED_ARGUMENT: /split-to-tickets takes no argument; the source is ./RFC.md"
  echo "Cause: a caller-supplied path would select a document other than the package's canonical RFC"
  echo "Action: run /split-to-tickets with no argument"
  exit 1
fi

if [ ! -f "$DOC_PATH" ]; then
  echo "[ERROR] MISSING_RFC: ./RFC.md not found"
  echo "Cause: /split-to-tickets reads only the package's canonical RFC"
  echo "Action: run /grill-me-for-rfc to write ./RFC.md, then re-run /split-to-tickets"
  exit 1
fi

if [ ! -f "RFC-GRAPH.json" ]; then
  echo "[ERROR] MISSING_GRAPH: ./RFC-GRAPH.json not found"
  echo "Cause: the split reads the graph /graphify-rfc writes"
  echo "Action: run /graphify-rfc in this directory, then re-run /split-to-tickets"
  exit 1
fi

if [ ! -f "RFC-Dirs-Tree.json" ]; then
  echo "[ERROR] MISSING_DIRS_TREE: ./RFC-Dirs-Tree.json not found"
  echo "Cause: the split reads the directory boundaries /boundify-graph writes"
  echo "Action: run /boundify-graph in this directory, then re-run /split-to-tickets"
  exit 1
fi
```

The GRAPH (`RFC-GRAPH.json`), the Dirs-Tree (`RFC-Dirs-Tree.json`), `Tickets.json`, the SPLIT status and `SEQUENCES.json` are derived from the invocation directory inside the scripts; they are not arguments. Explicit path flags remain as overrides for non-canonical callers.

## Output Destination

Out: `./Tickets.json` beside `./RFC.md`, with the SPLIT status at `./RFC-SPLIT-Status.json`; e.g. `docs/RFC-001-process-registry.md` → `docs/Tickets.json`.
Existing output → evolve in place via `split-evolve.js`; archive previous before promote. Rebuild ← archive `Tickets.json` before run; never a flag.

A ticket that implements a node carrying `unitIds` does not copy them: `add-tickets-for-phase.js` appends every unit its nodes carry to the ticket's own `nodeIds` array before it verifies coverage. The ticket level is the level the consumers read: `verify-consistencies.js` `collectTicketNodeIds` iterates `phases[].tickets[].nodeIds` and never reads a phase-level array, so writing to the phase would put the ids where nothing looks. The schema declares `nodeIds` at both levels as an array of unconstrained strings and requires it at neither, so a unit id is structurally acceptable and no schema change is needed.

## Evolve Mode

Mode ← `Tickets.json` presence; never an argument. Every later block re-derives `SPLIT_MODE` (default `fresh` when unset) and carries `PREVIOUS_TICKETS` from 4-1 to 5-2.

```bash
if [ -f "Tickets.json" ]; then SPLIT_MODE="evolve"; else SPLIT_MODE="fresh"; fi
```

`fresh` — absent. Steps 0 → 6 unchanged; phasify + consolidate remain.
`evolve` — present. `split-evolve.js`: delta → identity → add/update/retire. Existing status is never written; never renumber a phase/ticket id; `round`, `metadata`, authored fields preserved. Derived fields (`nodeIds`, `default_files`, `distribution`, `contracts`, `formulaObligations`, `prerequisites`) recomputed by existing scripts.

Conflict classes; none refuses or stops:

| class | resolution |
|---|---|
| new node | append phase at hard-edge position; add tickets |
| changed node | recompute owning ticket's derived fields |
| removed node | shrink `nodeIds`; else retire via `retiredFrom` |
| split node | original key/status kept; extra node → `todo` |
| merged node | lowest key kept; absorbed → `mergeFrom` |
| total loss (`identityLost`) | archive → fresh path → `--carry-status` |

```bash
# read-only delta: conflictClass, identityLost, newNodes, removedNodes, retiredTickets
node "$CLAUDE_DIR/scripts/tickets/split-evolve.js" --check --tickets=Tickets.json --graph=RFC-GRAPH.json --dirs-tree=RFC-Dirs-Tree.json

# apply; archive before promote; second identical run writes nothing
node "$CLAUDE_DIR/scripts/tickets/split-evolve.js" --tickets=Tickets.json --graph=RFC-GRAPH.json --dirs-tree=RFC-Dirs-Tree.json

# total-loss fallback: archive → fresh path → re-attach status/authored by identity ladder
node "$CLAUDE_DIR/scripts/tickets/split-evolve.js" --carry-status --previous=Tickets.pre-evolve-<stamp>.json --fresh=Tickets.json --graph=RFC-GRAPH.json --dirs-tree=RFC-Dirs-Tree.json
```

Retire deletes `distribution`/`contracts`/`formulaObligations`/`prerequisites` (empty `contracts` rejected by `validate-tickets.js`; empty distribution = empty unit set in `verify-chain`); previous values → `retiredFrom`.

`consolidate-phase-tickets.js` skipped in evolve mode: renumbering invalidates every key/status/external reference; implementation order = phase-array order, not numeric id.

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
| `update-split-step-status.js [--status=<path>] <start-step\|end-step\|fail-step\|reset-to-step\|status> <STEP_ID>` | SPLIT status; source invocations below literal |
| `sequences-slice/verify-implementation-order.mjs --package=<dir> [--write] \| --workspace=<root> [--write]` | proves the ticket and package implementation order; writes `IMPLEMENTATION-ORDER.json` / `WORKSPACIFY-IMPLEMENTATION-ORDER.json` |

All ticket scripts: pre-write `validate-tickets.js`; failure → no save.

Step 5-2 and Step 5-3 also invoke `rfc-graph/project-step-contracts.js --mode=verify` to re-prove the step-contract sidecar against the live graph and view.

## Analysis Procedure

### Step 0: Initialization (argument parsing + Malfeasance.json initialization + determine output destination) and RFC loading

#### 0-1. Initialization

```bash
DOC_PATH="RFC.md"
DOC_DIR="."
if [ -f "Tickets.json" ]; then SPLIT_MODE="evolve"; else SPLIT_MODE="fresh"; fi
# Canonical names the scripts default to; the Step calls do not pass them.
TICKETS_PATH="Tickets.json"
STATUS_PATH="RFC-SPLIT-Status.json"
ARTIFACT_PATH="$(node -e "const fs=require('fs'),p=require('path');const a=require('$CLAUDE_DIR/scripts/lib/package-artifacts').findAllocateManifest('$DOC_DIR');if(!a)process.stdout.write('');else{const r=p.dirname(a);const m=fs.readdirSync(r).filter(n=>n.endsWith('-sequences.json'));process.stdout.write(m.length===1?p.join(r,m[0]):'')}")"
bash "$CLAUDE_DIR/scripts/tickets/init-split-to-ticket.sh"
RUN_ID="$(date +%s%N)-$$"
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" begin-run --run-id="$RUN_ID"
node "$CLAUDE_DIR/scripts/sequences-slice/verify-chain.mjs" --stage=split --package="." --artifact="$ARTIFACT_PATH"
```

Fail-closed preflight: `STALE_DISTRIBUTION_MAP`, `UNIT_SET_MISMATCH`, `SEQUENCE_STEPS_UNDISTRIBUTED`, `MISSING_BOUNDARY_CONTRACT` ⇒ stop; do not create tickets. The same preflight requires the workspace-level `SMOOTH-VERDICT.json`: `MISSING_SMOOTH_RECEIPT` → run graphify first; `STALE_SMOOTH_VERDICT` → smooth or the root artifact moved after the receipt, so rerun graphify, boundify, then split. A missing `Tickets.json` is allowed at Step 0; the post-5-2 gate requires it.
`begin-run` counts one invocation; `end-step 6` advances `generation` only when the Tickets.json digest changes. Audit mode appends `--audit` to the final `end-step 6`: it counts the run, writes no generation, and exits 0 with `wouldExit`.

From 0-1, status commands:

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step <STEP_ID>
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step <STEP_ID>
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" fail-step <STEP_ID>
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step <STEP_ID>
```

#### 0-2. Create Malfeasance.json

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "0-1"
node "$CLAUDE_DIR/scripts/tickets/ensure-malfeasance.js" "$DOC_DIR"
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "0-1"
```

`Malfeasance.json`: `DOC_DIR` ledger; incomplete implementation without `[::STUB::]` = crime; create empty if absent.

### Resuming from an Error

fix per script error; reset `"0-1"`; rerun Step 0.

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "0-1"
```

#### 0-3. Read RFC (understand structure via analyze-source-structure.js → read sections sequentially)

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "0-2"
echo "=== RFC Structure Analysis ==="
node "$CLAUDE_DIR/scripts/rfc-graph/analyze-source-structure.js"
echo "=============================="
```

Never read long RFC all at once. After line-range structure analysis, read all sections top→bottom sequentially; retain purpose/scope, stack, data types, architecture/data/control flow, I/O boundaries, testing strategy.

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "0-2"
```

### Resuming from an Error

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "0-2"
```

---

### Step 1: Reference I/O boundary information in the RFC

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "1"
echo "=== I/O Boundary Reference ==="
node "$CLAUDE_DIR/scripts/grill-me-for-rfc/extract-io-boundary.js" || echo "(No I/O boundary reference. grill/drill needed beforehand. Interrupt split.)"
echo "============================="
```

I/O reference: RFC-author intent at grill/drill time; respect as far as possible; may differ from later `/graphify-rfc` divergent subdivision. Missing → prompt prior grill/drill; interrupt split.

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "1"
```

### Resuming from an Error

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "1"
```

---

### Step 2: Examine the relationship graph structure in the RFC design

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "2"
echo "=== Graph Structure Summary ==="
node "$CLAUDE_DIR/scripts/rfc-graph/show-graph-summary-markdown.js" --with-cli-examples || {
  echo "(No graph structure summary. graphify needed beforehand. Interrupt split.)"
  exit 1
}
echo "==============================="
```

GRAPH: `/graphify-rfc` safe I/O-boundary nodes; finer/newer than Step 1 reference; primary ticket-decomposition material. Missing → prompt prior graphify; interrupt split.

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "2"
```

### Resuming from an Error

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "2"
```

---

### Step 3: Examine directory and file structure via boundify

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "3"
echo "=== boundify Directory/File Structure ==="
node "$CLAUDE_DIR/scripts/rfc-graph/show-dirs-files-tree.js" || {
  echo "(*-Dirs-Tree.json not found. boundify needed beforehand. Interrupt split.)"
  exit 1
}
echo "========================================="
```

Current dirs/files: grill/drill → `/graphify-rfc` → `/boundify-graph` result; do not modify. Allowed: add interface-exposing dir/file for other programs; ticket must state it is absent from corresponding GRAPH/Dirs-Tree. Missing → prompt prior boundify; interrupt split. `default_files` is resolved from leaf files only; a directory path is never written into a ticket. A unit whose Dirs-Tree entry has no leaf file is `UNIT_WITHOUT_FILE`, and a generated header missing the unit is `UNIT_WITHOUT_HEADER`. A non-record ticket with no `default_files` must carry a non-empty `unlistedFileReason`; a record ticket (all its graph nodes are `architecture` or `rationale`) may have none.

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "3"
```

### Resuming from an Error

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "3"
```

---

### Step 4: Primary phase design (mechanical phase grouping)

#### 4-1. Phase splitting via script

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "4-1"
PREVIOUS_TICKETS=""
if [ "$SPLIT_MODE" = "evolve" ]; then
  DELTA="$(node "$CLAUDE_DIR/scripts/tickets/split-evolve.js" --check --tickets=Tickets.json --graph=RFC-GRAPH.json --dirs-tree=RFC-Dirs-Tree.json)"
  echo "$DELTA"
  if printf '%s' "$DELTA" | grep -q '"identityLost":true'; then
    PREVIOUS_TICKETS="$(node -e "process.stdout.write(require('$CLAUDE_DIR/scripts/tickets/split-evolve.js').archiveTickets('Tickets.json'))")"
    rm -f Tickets.json
    node "$CLAUDE_DIR/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js"
    SPLIT_MODE="fresh"
  else
    node "$CLAUDE_DIR/scripts/tickets/split-evolve.js" --tickets=Tickets.json --graph=RFC-GRAPH.json --dirs-tree=RFC-Dirs-Tree.json
  fi
else
  node "$CLAUDE_DIR/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js"
fi
```

Weighted topological sorting + SCC condensation; all nodes → `Tickets.json.phase[].nodeIds`. Final `✅` → pass; `⚠️` → report cause; interrupt split. In evolve mode: delta → plan; never renumber; `status` never written.

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "4-1"
```

### Resuming from an Error

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "4-1"
```

#### 4-2. Write names and summaries for all phases

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "4-2"
```

Order: P0 → P1 → …; one phase only; display nodes → judge name/summary → write; never output all phases in bulk. In evolve mode: only phases added by `split-evolve.js`; existing name/summary never rewritten (rename new phase via `rename-phases.js`).

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/show-all-nodes-title-summary.js" --phase="P0"
echo '{"name":"Authentication Infrastructure","summary":"Authentication token generation, verification, and session management"}' | node "$CLAUDE_DIR/scripts/rfc-graph/write-phase-name-summary.js" "P0"
node "$CLAUDE_DIR/scripts/rfc-graph/check-phase-names-summaries.jsnode" .claude/scripts/rfc-graph/update-split-step-status.js end-step "4-2"
```

Missing name/summary → fail; no Step 5.

### Resuming from an Error

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "4-2"
```

### Step 5: Primary ticket definition (ticket creation)

#### 5-1: Retrieve detailed information for nodes within a phase

Phase-order contract:
1. Run 5-1 for all phases P0 → P1 → …, one phase at a time; never bulk-process phases.
2. Only after every 5-1 phase loop completes: end 5-1; start 5-2.
3. Then run 5-2 for all phases P0 → P1 → …, one phase at a time.

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "5-1"
node "$CLAUDE_DIR/scripts/rfc-graph/show-phase-nodes.js" --phase="P{n}"
node "$CLAUDE_DIR/scripts/tickets/show-phase-distribution.js" --phase="P{n}" --artifact="$ARTIFACT_PATH"
```

Read phase node ID/title/kind/summary/implementation path and the printed distribution. This is the consolidation-first policy: start from the coarsest coherent partition, one ticket for the whole phase. Split only when one of these is proven:
1. TDD order — a dependent part's Red cannot be written before the prerequisite part is Green, and a stub is prohibited.
2. Disjoint external I/O surfaces — the parts cannot share one deterministic test process.
3. Independent release, rollback or ownership boundary, including another package.
4. Cohesion — merging would mix unrelated observable behaviours and destroy translatability.

Ticket size is measured by v2 implementation work: `operations`, `sequenceSteps`, `ownedContracts`, `files`, `testUnit`, `testIntegration`, `modules`. Provider boundary units (`ctr-boundary-*`), node kinds and graph nodes are excluded metadata; the report prints them but they never size a ticket. `files` is the distinct `default_files` set; `modules` is the distinct top-level `src/<module>` set. Apply the `/suggest-min-tickets` policy: consolidate maximally; split only for unavoidable risk. `minimumWorkTickets = max(1, component-wise ceil(phaseWorkload / budget))` is a floor, not a target. `add-tickets-for-phase.js` enforces the floor and the evidence-backed upper bound `minimumWorkTickets + acceptedDiscretionaryRefusals`. The printed distribution is the first constraint: a sequence step stays with the ticket implementing its operation; a ctr unit keeps its registry contract; order is not re-authored.

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "5-1"
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "5-2"
```

#### 5-2: Ticket creation (add-tickets-for-phase.js)

Before calling `add-tickets-for-phase.js`, attempt to merge every adjacent pair in the phase. A pair whose merged workload stays within budget is discretionary and must be refused with a `mergeAttempts` entry carrying a valid trigger, non-empty evidence and, for `cohesion`, at least two named `behaviours`. A pair whose merged workload exceeds the budget is budget-forced and needs no refusal; the merged workload is the proof. Do not emit a partition you have not tried to reduce. The AI writes the merged prose; the script only measures and validates it.

When the phase has more than one ticket, every ticket carries `splitReason` from `tdd-order`, `disjoint-io`, `release-boundary`, `ownership-boundary`, `cohesion`. The reason must match an adjacent refused attempt and the graph: `tdd-order` needs a hard intra-phase edge, `ownership-boundary` needs foreign or consumer ownership, `disjoint-io` needs an external I/O surface, `release-boundary` needs evidence, and `cohesion` needs two named unrelated observable behaviours. The script rejects a missing or invalid reason, a missing attempt, an invalid trigger, or `tickets > minimumWorkTickets + acceptedDiscretionaryRefusals`.

stdin ticket array → bulk add; script proves all phase `nodeIds` ticketized; failure → rollback/no write/exit 1. In evolve mode `split-evolve.js` applied at 4-1; `add-tickets-for-phase.js` not called again; projection steps only.

```bash
if [ "$SPLIT_MODE" != "evolve" ]; then
  echo '<tickets-array-json>' | node "$CLAUDE_DIR/scripts/tickets/add-tickets-for-phase.js" "P{n}" --enforce-work-budget
else
  echo "[evolve] split-evolve.js applied the plan at 4-1; add-tickets-for-phase.js is skipped."
fi
```

When the package carries `SEQUENCES.json`, the same script also populates each ticket's `distribution` record: the units of the nodes it owns, the operation obligation or consumer reference, the ordered sequence steps whose operations the ticket implements, and `specRefs`. It then writes the Tickets aggregate. The split does not author these records; it only decides which nodes each ticket owns.

Formula obligations follow the same post-creation rule and are never copied by the author:

```bash
node "$CLAUDE_DIR/scripts/tickets/merge-formulas-to-tickets.js" \
  --tickets=Tickets.json --dirs-tree="$DIRS_TREE_PATH" \
  --sidecar="$RFC_DIR/RFC-FORMULAS.json" --spec="$SPEC_PATH" \
  --tree-manifest="$WORKSPACE_ROOT/WORKSPACIFY-TREE-MANIFEST.json" --write
```

Every formula reaches one implementing ticket through its node or file. The obligation carries `origin.path` as `artifact.spec.path` (never `RFC.md`), the specification line and quote, the implementation `path#symbol`, the design class and how, the theory and the tests. A missing ticket, a duplicate implementer, a `RFC.md` origin or a missing symbol/test is refused before `Tickets.json` is written. `add-tickets-for-phase.js` accepts `--formula-sidecar`, `--formula-spec` and `--formula-tree-manifest` to run the same merge in memory before its own write.
After all 5-2 phase loops, `merge-contracts-to-tickets.js` reads `RFC-STEP-CONTRACTS.json` and adds each sequence step's operation-boundary contract to the ticket's `contracts` with `stepId`, `sequenceId`, `sourceStep` and the contract prose. It also projects every registry boundary into the ticket that carries its `ctr` unit and into every ticket whose local step crosses that boundary (`crosses`), so the implementing step owes the same clauses even when another ticket owns the boundary node. `show-ticket-context --for-spec` renders them under `## Operation-Boundary Contracts`, `## Contracts`, and `### Work Share`, and `show-ticket-distribution` renders them beside the step. A sidecar row that reaches no ticket or a ticket contract whose digest differs is `CONTRACT_CHAIN_OPEN` or `STEP_CONTRACT_MISMATCH`. Two contracts with one id in the same ticket are `DUPLICATE_CONTRACT_ID`. The sidecar carries an `edges` map from each edge to the row indexes it binds; the edge note is the bounded `step-sidecar;digest:<hex>` pointer, not a per-row list, so an operation with any number of steps stays under the 240-character note limit.

A phase owns its own nodes. The 5-2 gate checks the units and steps reachable from `phase.nodeIds`, so a unit implemented in P1 is not a P0 omission. The package-global guarantee is the final `verify-chain`: every graph unit reaches a ticket, every owned sequence step reaches exactly one ticket, and an operation has exactly one implementing ticket across all phases. The aggregate keys a ticket by `PX-{id}` in the PX phase and `P{phaseId}-{id}` otherwise, never by the numeric id alone.

Fields: schema `tickets-schema.json#/definitions/ticket`; auto only `id`, `phaseId`, `status`; `additionalProperties: true`; `default_files` is script-set from the Dirs-Tree derived beside `Tickets.json`; AI must not input; `contracts` required input `[]`, auto-populated after 5-2.

| Field | Minimum contract |
|---|---|
| `background` | 300+ chars; concrete code-level investigation/reference |
| `scope` | every item with type signature |
| `notes` | multiple sections; 500+ chars; implementation/test/translatability/risks |
| `relatedTicketIds` | explicit dependency direction + reason |
| `acceptanceCriteria` | 3–5 one-line happy/error/edge conditions |

Ticket composition: one or more nodes/ticket; a single node is a valid ticket only when it is itself the whole coherent unit, never the default; all nodeIds exactly once; every included node listed; phase-local only; no simplistic `<...>` placeholder. A multi-ticket phase carries a `splitReason` on every ticket.

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
if [ -n "$PREVIOUS_TICKETS" ]; then
  node "$CLAUDE_DIR/scripts/tickets/split-evolve.js" --carry-status --previous="$PREVIOUS_TICKETS" --fresh=Tickets.json --graph=RFC-GRAPH.json --dirs-tree=RFC-Dirs-Tree.json
fi
node "$CLAUDE_DIR/scripts/tickets/merge-contracts-to-tickets.js"
node "$CLAUDE_DIR/scripts/rfc-graph/project-step-contracts.js" --mode=verify
node "$CLAUDE_DIR/scripts/tickets/verify-ticket-closure.js"
node "$CLAUDE_DIR/scripts/tickets/verify-all-ticket-coverage.js"
node "$CLAUDE_DIR/scripts/tickets/show-ticket-distribution.js"
node "$CLAUDE_DIR/scripts/sequences-slice/verify-chain.mjs" --stage=split --package="." --artifact="$ARTIFACT_PATH" --require-tickets
node "$CLAUDE_DIR/scripts/sequences-slice/verify-implementation-order.mjs" --package="." --write
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "5-2"
```

`verify-implementation-order.mjs --package` derives every ticket's implementation prerequisites from the graph hard edges and the artifact's `consumes`/`produces`/`crosses` relations, writes `IMPLEMENTATION-ORDER.json` beside `Tickets.json`, and fails closed on `PREREQUISITE_SET_MISMATCH` (the tickets do not carry what the derivation says), `PREREQUISITE_NOT_BEFORE` (a same-package prerequisite is placed at or after its dependent), `PREREQUISITE_PACKAGE_UNSPLIT` (a cross-package prerequisite has no `Tickets.json`), `PREREQUISITE_PACKAGE_BEFORE` (a cross-package prerequisite is later in the implementation order), and `IMPLEMENTATION_ORDER_CYCLE`. A package without a view or graph is `skipped:no-distribution`.

Every split-stage script derives the graph, Dirs-Tree, RFC and view from the invocation directory. The pipeline fixes those names, so the command line does not repeat them; the scripts keep their explicit-path arguments only as overrides for a non-standard layout. `verify-ticket-closure.js` and `merge-contracts-to-tickets.js` also discover the workspace's `WORKSPACIFY-ALLOCATE-MANIFEST.json` at the nearest ancestor holding both workspace manifests, so the registry chain runs whenever the split is inside a workspacify workspace and is skipped otherwise.

The split closure re-proves the graphify chain; it is not the first place a gap is discovered. The graph is the durable source of `satisfiedBy`, and a hand-edited ticket contract is overwritten by the next merge. `verify-ticket-closure.js` reads the graph root's `contractChain`: under `obligation` the node-chain and inter-ticket chain proofs are skipped while every boundary, step and unit check remains; under `transition` an outgoing precondition closes when any incoming provision at the target node satisfies it. An absent field reads as `obligation`.

Closure/coverage fail → no Step 6; reset 5-2. The named failures are `CONTRACT_CHAIN_OPEN`, `INTER_TICKET_CLOSURE_OPEN`, `MISSING_UNIT_AT_LAYER`, `INVENTED_UNIT`, `MISSING_BOUNDARY_CONTRACT`, `BOUNDARY_CONTRACT_MISMATCH`, `BOUNDARY_DIRECTION_MISMATCH`, `INVENTED_TICKET_CONTRACT`, `DUPLICATE_UNIT_AT_TICKET`, `DUPLICATE_CONTRACT_ID`, `MISSING_IMPLEMENTER`, `OWNER_ROLE_UNDECIDED`, `MISSING_PACKAGE_VIEW`, `PREREQUISITE_SET_MISMATCH`, `PREREQUISITE_NOT_BEFORE`, `PREREQUISITE_PACKAGE_UNSPLIT`, `PREREQUISITE_PACKAGE_BEFORE`, `PREREQUISITE_ORDER_STALE`, `STALE_IMPLEMENTATION_ORDER`, `AMBIGUOUS_BOUNDARY_EDGE`, `MISSING_SEQUENCE_STEP`, `MISSING_SEQUENCE`, `STEP_IDENTITY_MISMATCH`, `SEQUENCE_STEPS_UNDISTRIBUTED`, `DUPLICATE_SEQUENCE_STEP`, `SEQUENCE_STEP_WITHOUT_IMPLEMENTER`, `SEQUENCE_ORDER_MISMATCH`, `UNASSIGNED_SEQUENCE_STEP`, `SPEC_REF_MISSING`, and `DISTRIBUTION_DIGEST_MISMATCH`. `MISSING_SEQUENCE` names an artifact sequence this package owns that the view does not declare; `STEP_IDENTITY_MISMATCH` names a step whose operationId, order, line, quote, subject, predicate, object, contract or prose differs between the artifact, view or ticket. `SEQUENCE_ORDER_MISMATCH` compares the ticket placement only for a real data prerequisite: when an earlier step produces a fact a later step consumes, the later step's ticket must not precede the earlier step's ticket. Narrative order alone is not an implementation constraint; hard-edge and boundary prerequisites are reported by `PREREQUISITE_NOT_BEFORE`, and foreign steps are outside the check. The ticket's unit ids are appended by `add-tickets-for-phase.js`; the author never copies them.

### Resuming from an Error

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "5-2"
```

### Step 5-3: Phase consolidation

Complete ticketization → merge phases, never split tickets. A phase with fewer than 3 tickets merges into the following phase; when the last phase has fewer than 3 tickets and a previous phase exists, it merges backward into the previous phase. `MIN_TICKETS_PER_PHASE` remains 3. The add-stage gate does not enforce this floor: it uses `max(1, ceil(workload / budget))`, so a 2-ticket phase can still reach this consolidation step. All-small phases collapse into one final phase; that is the expected result of maximal consolidation, not a defect. The final phase is exempt from the three-ticket floor only when it is the sole remaining phase.
Sequence: guard → validation → last-phase backward merge → right-to-left phase merge → ID re-index → ticket-key remap → `relatedTicketIds` regeneration → status update → final verification. The remap rewrites `prerequisites[].ticket` and every distribution obligation's `implementerTicketId` / `implementerTicketKey` before the order gate runs, so a phase merge cannot leave a reference pointing at another ticket.

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "5-3"
if [ "$SPLIT_MODE" != "evolve" ]; then
  node "$CLAUDE_DIR/scripts/tickets/consolidate-phase-tickets.js"
else
  echo "[evolve] consolidate-phase-tickets.js is skipped in evolve mode: renumbering would destroy every existing ticket key and status."
fi
node "$CLAUDE_DIR/scripts/rfc-graph/project-step-contracts.js" --mode=verify
node "$CLAUDE_DIR/scripts/sequences-slice/verify-chain.mjs" --stage=split --package="." --artifact="$ARTIFACT_PATH" --require-tickets
node "$CLAUDE_DIR/scripts/sequences-slice/verify-implementation-order.mjs" --package="." --write
WORKSPACE_ROOT="$(node -e "const p=require('$CLAUDE_DIR/scripts/lib/package-artifacts').findAllocateManifest(process.argv[1]);process.stdout.write(p?require('path').dirname(p):'')" "$DOC_DIR")"
if [ -n "$WORKSPACE_ROOT" ]; then node "$CLAUDE_DIR/scripts/sequences-slice/verify-implementation-order.mjs" --workspace="$WORKSPACE_ROOT" --write; fi
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "5-3"
```

The workspace gate writes `WORKSPACIFY-IMPLEMENTATION-ORDER.json` with `buildOrder` copied from the stage-2 manifest and `implementationOrder` derived from the union. It never rewrites `Tickets.json` or the published build order. A package whose prerequisite package is unsplit is `PREREQUISITE_PACKAGE_UNSPLIT`; a prerequisite placed later is `PREREQUISITE_PACKAGE_BEFORE`; a union cycle is `IMPLEMENTATION_ORDER_CYCLE`.

Final `✅` → pass; `⚠️` → judge cause; fix; rerun 5-3.

### Resuming from an Error

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "5-3"
```

### Step 6: Output phase and ticket checklist

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" start-step "6"
node "$CLAUDE_DIR/scripts/tickets/list-phases-and-tickets.js"
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" end-step "6"
```

Out: checklist hierarchy `P<n>` → `P<n>-<ticket>`.
Step 6 also reports `## Consolidation`: phases before → after, tickets preserved, final phase ticket count. A `skipped:no-budget-gate` in the add result is a command-contract failure, not a pass; the canonical command always passes `--enforce-work-budget`. `skipped:no-distribution` is the only allowed skip.
Stage counters: `end-step 6` records `runs` and advances `generation` only when the Tickets.json digest changes; `--audit` on that step writes no generation.

### Resuming from an Error

```bash
node "$CLAUDE_DIR/scripts/rfc-graph/update-split-step-status.js" reset-to-step "6"
```

## Notes

Existing destination `Tickets.json` → evolve in place; `status`/`round`/`metadata`/authored fields never written; never renumber.

## Reverse mode (S1 to S6)

**Rotation gate** — this section runs only when `measured-tree-root` holds. The forward rotation generates the tree from a Dirs-Tree and is given no `--root`, so this section cannot fire in one.

Forward: a design document is decomposed into phases and tickets that declare what is to be built. Reverse: the same step describes what is there. Entered by naming a subject tree rather than a design document, and it changes four things.

- **The input is a tree, not a document.** `--root` names the project to describe; there is no RFC and no `GRAPH.json` to read first, and the directory structure comes from the `/boundify-graph` reverse branch.
- **`default_files` is measured, not resolved.** Forward resolves it from the Dirs-Tree through `nodeIds`; here the implementation already exists, so the file is measured on disk and recorded. When none exists yet that fact is recorded explicitly rather than left as an empty list: the loop runs one ticket per session, so an empty file list is a ticket no session can execute.
- **Tickets are reconstruction tickets.** A contract whose test never had a Red cannot be proved by a green suite — the test was written against an implementation that already existed. Each such contract produces exactly one ticket to rebuild that Red, recording whether the absence is re-checkable or is a candidate only a human can settle.
- **`counterexample_plan_id` is mandatory.** It names what the ticket will confirm or refute, not merely what it will implement. A ticket without it is refused rather than emitted: the uncertainty the plan encoded would dissolve at implementation time and the reconstruction would become ordinary test-writing.

```bash
node "$CLAUDE_DIR/scripts/tickets/lib/reverse-split.js" --root=<subject tree> \
  --tickets=<path> [--test-dir=<dir>] [--gaps=<path>] [--ledger=<path>] \
  [--language=<name>] [--out=<dir>] [--candidate=<path>] [--json]
```

The exit code is a gate verdict, not a measure of success: 0 when every existing test is mapped and every reconstruction ticket carries a plan identifier, non-zero otherwise. An absence count of zero is a comparison result and never a pass — it means either that no contract was measured or that the detection reads nothing.

Nothing here executes a reconstruction ticket; executing them is a separate step and these tickets are its input.

Absent-Red detection is compared against the frozen answer key rather than asserted, which is what keeps it a measurement:

```bash
node "$CLAUDE_DIR/scripts/workspacify-reverse/run.mjs" oracle compare --stage mapping \
  --candidate=<path written by --candidate>
```

The comparison lists disagreements by name in both directions, and never a score or a verdict. Classifying each is a human's work.
