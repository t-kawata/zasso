---
description: Evolve the canonical RFC and its GRAPH / Dirs-Tree / Tickets as deltas via grill-style questioning.
argument-hint: [<material file|directory>...]
disable-model-invocation: true
---

# /drill-rfc-down

Role: evolve canonical RFC + GRAPH / Dirs-Tree / Tickets from crystalize RESIDUE, prior user conversation, and given material.

Invariants:
- RFC: append-only; no destructive change.
- artifacts evolve lockstep: RFC → GRAPH → Dirs-Tree/src → Tickets → cross-artifact verification.
- real GRAPH, Dirs-Tree, src, Tickets: unchanged until staged validation passes.
- AI never hand-edits JSON; use designated CRUD tools only.
- reject: discard staging; real artifact byte-identical.
- candidate/advisory: AI decision support only; never mandatory plan.
- promote: designated validator PASS only.
- validation failure: no promote; read English `[ERROR] Cause: ... Action: ...`; fix staging via designated CRUD; retry.
- Step 5 high finding → back to Step 2; read-only verifier never writes.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Arguments

In:
- args: zero or more space-separated material paths.
- material: file, or directory whose every file is material.
- no args → README `RESIDUE` + prior user conversation only.
- run from project root containing `.claude`; resolve cwd `Tickets.json` and `.claude/scripts/` (`$DRILL_DIR`).

Invocation:
```bash
/drill-rfc-down <material-file-or-dir> <material-file-or-dir> ...
```

## Script List

| Script | Contract |
|---|---|
| `preflight.cjs <material...>` | resolve/validate material + RFC/GRAPH/Dirs-Tree + README; emit `[VARIABLES]` |
| `session-init.js <rfc>` | create/continue `$SESSION_DIR`; Status/DesignTree/CheckList |
| `session-status.js <session>` | phase + unresolved-node count |
| `update-status.js <session> set-step\|set-state\|inc-loop\|show` | state transition + English `nextAction` |
| `rfc-evolution.js capture\|verify\|clean <rfc>` | baseline; append-only/delta/contradiction verification; clean snapshot |
| `update-tree.js <session> add\|add-child\|resolve\|batch-resolve\|refine\|show\|delete\|open-count` | DesignTree CRUD |
| `validate-question-format.js <text>` | grill-question schema validation |
| `tree-query.js <session> tree\|search\|path\|stats` | DesignTree inspect/search |
| `generate-checklist.js <session> [--no-backup]` | CheckList from resolved DesignTree |
| `check-all-schema.js <session>` | Status/DesignTree/CheckList consistency |
| `graphify-delta-analyzer.js` | Step 2 candidates + four-axis advisory |
| `graphify-step.js` | Step 2 stage/approve/reject driver |
| `boundify-delta-analyzer.js` | Step 3 candidates + four-axis advisory |
| `boundify-step.js` | Step 3 stage/approve/reject driver |
| `dirs-tree-crud.js` | Step 3 schema-valid granular Dirs-Tree edits |
| `generate-dir-templates-delta.js` | Step 3 delta-only new-file templates |
| `refresh-file-headers.js` | Step 3 existing-file headers/cross-references only |
| `split-delta-analyzer.js` | Step 4 candidates + four-axis advisory |
| `split-step.js` | Step 4 stage/approve/reject driver |
| `detect-orphan-contracts.js` | Step 4/5 read-only orphan-contract report; never auto-assign |
| `verify-consistencies.js` | Step 5 six-consistency inspection |
| `verify-step.js` | Step 5 PASS/FAIL blocking gate |
| `advisory-report.js` | English Danger/Omission/Contradiction/Deficiency report |

## Workflow

### Step 0: Preflight

G0 input:
- resolve: materials, cwd `Tickets.json`, `metadata.resolvedPaths` RFC/GRAPH/Dirs-Tree, `README.md`.
- all must exist.
- fail → stop; report error.
- pass → list resolved paths in Markdown; Step 1.

`$ARGUMENTS` is deliberately unquoted: shell passes each space-separated arg as argv; script splits/drops empty tokens; no args → no materials, never cwd.

```bash
node .claude/scripts/drill-rfc-down/preflight.cjs $ARGUMENTS || exit 1
```

### Step 1: grill

Role: understand all material, README RESIDUE, prior conversation; decide evolution by grill; append settled complete evolution to RFC.

Artifacts:
- bind `$RFC_PATH`, `$RFC_DIR`, `$SESSION_DIR`, `$DRILL_DIR` from G0 `[VARIABLES]`.
- session-only: Status / DesignTree / CheckList / baseline / delta under `$SESSION_DIR`.
- no touch: existing `$RFC_DIR/Status.json` and equivalent existing session artifacts.

#### 1-1. Session Initialization

```bash
node "$DRILL_DIR/session-init.js" "$RFC_PATH"
node "$DRILL_DIR/session-status.js" "$SESSION_DIR"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-1
```

Create session Status/DesignTree/CheckList; existing session → continue.

#### 1-2. Capture Baseline

```bash
node "$DRILL_DIR/rfc-evolution.js" capture "$RFC_PATH"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-2
```

Capture pre-edit RFC at `$SESSION_DIR/baseline.json`.

#### 1-3. Full Understanding of Inputs

Read all material, README RESIDUE, prior user conversation; understand complete scope; present evolution scope to user.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-3
```

#### 1-4. Generate DesignTree Nodes

Rule: one node = one design decision.
- top id: `Q1`, `Q2`, …; child id: `Q1a`, `Q1b`, …; IDs correspond to grill question numbers.
- `title`: concrete noun phrase.
- new `status`: `"open"`; resolve → `"resolved"`.
- `children`: initially `[]`; add sub-decisions via `add-child`.
- `questions`: initially `[]`; resolve appends `{resolvedAt, answer}`.

```bash
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add '{"id":"Q1","title":"<design decision>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add-child "Q1" '{"id":"Q1a","title":"<sub-decision>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-4
```

#### 1-5. Grill (Strictly Enforce Rules)

Ask validated 5–10-question turn; await answers. Determine evolution by grill questions.

Every question; ordered; detail proportional to decision complexity; do not over-compress:
0. unique turn-local `Q<number>` ID.
1. background/rationale: need, options, trade-offs.
2. Markdown options: one option per newline/list item; never multiple options on one line.
3. concrete recommendation + why better than alternatives.

User answer: Yes/No or A/B/C only; never request free-form answer; unsolicited free text allowed.

Grill contract:
- bundling: 1 question = 3–5 nodes; 1 turn = 5–10 questions.
- two pass: architecture → details.
- each turn end: summarize settled decisions.
- before display: run `validate-question-format.js` until `valid: true`; never skip.
- answer received → immediately update node: add/resolve/batch-resolve; add-child/refine/delete as required.
- no RFC write while grilling.

```bash
node "$DRILL_DIR/validate-question-format.js" "<question text>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add '{"id":"Q5","title":"<new design decision>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" resolve "<node_id>" "<answer summary>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" batch-resolve '["Q1","Q2","Q3"]' "<answer summary>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add-child "Q1" '{"id":"Q1a","title":"<sub-decision>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" refine "<node_id>" "<new title>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" delete "<node_id>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" open-count
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" tree
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-5
```

Inspect DesignTree:

```bash
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" tree
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" search "<keyword>"
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" path "<node_id>"
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" stats
```

#### 1-6. Completion Judgment

precondition: `open-count == 0`.
ask; stop: simultaneously propose grill end and ask to start RFC-requirements CheckList generation. Approval → 1-7.

```bash
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" open-count
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state CHECKLIST_PENDING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-6
```

#### 1-7. CheckList Generation & Approval

Generate CheckList; AI visually inspect every item; append notes for ambiguous nodes/project constraints; present to user.
ask; stop: user approval required; then `CHECKLIST_APPROVED`.

```bash
node "$DRILL_DIR/generate-checklist.js" "$SESSION_DIR" --no-backup
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state CHECKLIST_APPROVED
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-7
```

#### 1-8. Append to RFC

Proceed after 1-7 approval; no additional approval gate. Append settled evolution as complete, self-contained design spanning entire scope.
- every design decision: code example.
- include I/O-boundary reference information for downstream partitioning.
- no TBD / TODO / stub / deferral, any form.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state WRITING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-8
```

#### 1-9. CheckList Verification

Proceed after 1-7 approval; no additional approval gate. Verify every CheckList item; repair until all `✅`.
- detect `TBD`, `TODO`, `will be addressed in a later version` → warn; incomplete; do not complete until fully written.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state REVIEWING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-9
```

#### 1-10. Re-grill Decision

new unresolved node → back to 1-5; loop count > 3 → report user.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state GRILLING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" inc-loop
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-10
```

#### 1-11. Evolution Verification (Script Verification + AI Expert Judgment)

G1 RFC evolution:

```bash
node "$DRILL_DIR/rfc-evolution.js" verify "$RFC_PATH"
```

Machine: append-only, delta extraction, well-formedness, contradiction candidates; write `$SESSION_DIR/delta.json`.
- exit 1 → back to 1-8.

AI expert judgment; inspect result, `delta.json`, resolved DesignTree, scope:
- Danger: breaks existing design/implementation/contracts?
- Omission: every resolved node reflected?
- Contradiction: existing RFC/GRAPH/Dirs-Tree/Tickets contradiction?
- Deficiency: each decision code example, I/O boundary info, sufficient detail?

Heal-loop quality:
- any insufficient → back to 1-8; fix; repeat 1-8 → 1-11.
- all pass → next.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-11
```

#### 1-12. Completion Declaration

Done iff: open-count 0; CheckList all `✅`; RFC has no TBD/TODO/stub; G1 PASS.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state DONE
node "$DRILL_DIR/check-all-schema.js" "$SESSION_DIR"
node "$DRILL_DIR/rfc-evolution.js" clean "$RFC_PATH"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-12
```

out: `$SESSION_DIR/delta.json` → Step 2.

### Step 2: graphify

Goal: evolve existing `*-GRAPH.json` from Step 1 delta. AI designs; scripts supply candidates, safe edits, validation.

Evolution loop GRAPH:
1. stage: copy real → `<graph>.staging.json`; write `<graph>.candidates.json`; report candidates + English four-axis advisory. Real GRAPH unchanged.
2. judge: cross-check candidates, `delta.json`, RFC. Candidates advisory only.
3. edit: staging only; `crud.js` only; schema-validated granular edits.
4. approve: verify staging; PASS → promote + GRAPH delta; FAIL → no promotion; fix staging; retry.
5. reject: discard staging; real GRAPH byte-identical.

Four axes:
- Danger: new/modified nodes/edges break design?
- Omission: every delta section represented?
- Contradiction: merge-vs-new correct?
- Deficiency: kind/slug/headingRefs/edge contracts appropriate?

Stage advisory includes slug collision, duplicate heading, weak match, Step-1 contradiction candidates, >100-line section, slug >25 chars; advisory never changes promotion gate.

```bash
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --delta="$SESSION_DIR/delta.json" --source="$RFC_PATH" --stage
node "$DRILL_DIR/../rfc-graph/crud.js" --graph="$GRAPH_PATH.staging.json" create-nodes --file="$SESSION_DIR/ai-nodes.json"
node "$DRILL_DIR/../rfc-graph/crud.js" --graph="$GRAPH_PATH.staging.json" create-edges --file="$SESSION_DIR/ai-edges.json"
node "$DRILL_DIR/../rfc-graph/crud.js" --graph="$GRAPH_PATH.staging.json" update-node --id=N0003 --file="$SESSION_DIR/ai-patch.json"
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --source="$RFC_PATH" --approve
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --source="$RFC_PATH" --reject
```

- `--approve`: does not re-run analyzer; validates/promotes exact AI-designed staging graph.
- verifier: uncovered headings, isolated nodes, headingRefs resolvability, uniqueness.
- deletion: forbidden by default; explicit AI approval only.
- only graph writes: staging `crud.js`; driver promote.

### Step 3: boundify

Goal: evolve existing `*-Dirs-Tree.json` and real `$RFC_DIR/src` from Step-1 delta + Step-2 `$GRAPH_PATH.delta.json`. AI designs; scripts supply candidates, safe edits, validation.

Evolution loop Dirs-Tree:
1. stage: copy real → `<dirsTree>.staging.json`; write candidates + four-axis advisory; real Dirs-Tree/src unchanged.
2. judge: cross-check candidates, graph delta, RFC, src drift; candidates advisory only.
3. edit: staging only; `dirs-tree-crud.js` only; schema validation every edit.
4. approve: validation PASS → derive `dirs-tree-delta.json`; generate allowed src effects; promote. FAIL → no promotion; fix; retry.
5. reject: discard staging; real Dirs-Tree/src byte-identical.

Four axes:
- Danger: new/modified files break implementation?
- Omission: every GRAPH node reflected in Dirs-Tree/src?
- Contradiction: placement/language/kind correct?
- Deficiency: declaration stubs, Prose exclusion, Prune rules satisfied?

Stage advisory includes path collision, dependency cycle, unmapped GRAPH node, kind mismatch, Prose exclusion, missing declaration stub; advisory never changes promotion gate.

```bash
node "$DRILL_DIR/boundify-step.js" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph="$GRAPH_PATH" --graph-delta="$GRAPH_PATH.delta.json" --stage
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" add-file --path=src/api/session_storage.rs --kind=architecture --mapped=N0003:Session storage
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" add-dir --path=src/api/cache --kind=architecture
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" update-node --path=src/api/auth.rs --file="$SESSION_DIR/ai-patch.json"
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" update-mapped --path=src/api/auth.rs --mapped=N0002:Auth module
node "$DRILL_DIR/boundify-step.js" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph="$GRAPH_PATH" --approve
node "$DRILL_DIR/boundify-step.js" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph="$GRAPH_PATH" --reject
```

- `--approve`: does not re-run analyzer; validates/promotes exact AI-designed staging Dirs-Tree.
- validator: GRAPH/Dirs-Tree consistency, `mappedNodeIds` resolution, dependency cycles.
- PASS effects: delta-only `newFiles` via `generate-dir-templates-delta.js`, Initial Design Artifact header; existing mapped-file headers/cross-references via `refresh-file-headers.js` when graph delta given; never implementation body.
- delta generator inapplicable → AI may hand-create file.
- file/directory deletion or move: forbidden by default; explicit AI approval: `remove-node --force` only.
- only Dirs-Tree writes: staging `dirs-tree-crud.js`; driver promote.

### Step 4: split

Goal: evolve existing `Tickets.json` from `$DIRS_TREE_PATH.delta.json` through ticket edits/additions. AI designs; scripts supply candidates, safe edits, validation.

Evolution loop Tickets:
1. stage: copy real → `<tickets>.staging.json`; write candidates + four-axis advisory; real Tickets unchanged.
2. judge: cross-check candidates, Dirs-Tree delta, existing statuses; candidates advisory only.
3. edit: staging only; `add-ticket.js` / `update-ticket.js` only; schema validation every edit.
4. approve: validation PASS → derive `tickets-delta.json`; promote. FAIL → no promotion; fix; retry.
5. reject: discard staging; real Tickets byte-identical.

Four axes:
- Danger: existing ticket statuses, especially `reviewed` / `R<N>`, preserved?
- Omission: every GRAPH node/file ticketed?
- Contradiction: phase assignments/nodeIds mappings correct?
- Deficiency: new ticket scope/test plan sufficient?

Stage advisory includes status-overwrite risk, unmapped modified node, duplicate-node ticket, scope/test-plan deficiency; advisory never changes promotion gate.

```bash
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --dirs-tree-delta="$DIRS_TREE_PATH.delta.json" --stage
echo '{"title":"Session storage","nodeIds":["N0003"],"scope":[],"testUnit":[],"testIntegration":[],"testExceptions":[],"changes":[]}' | node "$DRILL_DIR/../tickets/add-ticket.js" "$TICKETS_PATH.staging.json" "P1"
echo '{"title":"Auth module extended"}' | node "$DRILL_DIR/../tickets/update-ticket.js" "$TICKETS_PATH.staging.json" "P0-1"
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --approve
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --reject
```

- `--approve`: does not re-run analyzer; validates/promotes exact AI-designed staging Tickets.
- validator: title/round/metadata/phases/ticket-status/phaseId consistency.
- never silently overwrite status.
- ticket deletion: forbidden by default; explicit AI approval only.
- round `R<N>` / `phaseId`: existing phasify conventions.
- only ticket writes: staging add/update tools; driver promote.

### Step 5: verify

G5 cross-artifact consistency; canonical RFC / GRAPH / Dirs-Tree / src / Tickets; zero contradiction.

```bash
node "$DRILL_DIR/verify-step.js" --rfc="$RFC_PATH" --graph="$GRAPH_PATH" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --tickets="$TICKETS_PATH"
```

| Check | Severity |
|---|---|
| RFC headings ↔ GRAPH headingRefs: every heading covered | high |
| GRAPH ↔ Dirs-Tree `mappedNodeIds`: every non-Prose node mapped | high |
| Dirs-Tree ↔ src: planned files / src extras | high / low |
| GRAPH ↔ Tickets `nodeIds`: every non-Prose node ticketed | high |
| dangling Dirs-Tree/Tickets references → extant GRAPH target | high |
| edge contracts ↔ connecting Tickets contracts; orphan-free | high |

- high finding → exit 1; back to Step 2; repair Steps 2 → 3 → 4; re-run G5 until exit 0.
- low/cosmetic findings only → PASS.
- verifier: deterministic, read-only, no artifact rewrite.
