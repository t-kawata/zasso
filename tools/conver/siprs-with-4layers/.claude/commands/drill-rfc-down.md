---
description: Evolve the canonical RFC and its GRAPH / Dirs-Tree / Tickets as deltas via grill-style questioning.
argument-hint: [<material file|directory>...]
disable-model-invocation: true
---

# /drill-rfc-down

**Role**: Evolve the canonical RFC and its GRAPH / Dirs-Tree / Tickets as deltas via grill-style questioning over crystalize RESIDUE, prior conversation, and given materials. Append-only, lockstep, no destructive changes.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

All arguments are **optional**. Any number of arguments may be given, separated by spaces.

**Every argument is interpreted as a "given material"** — the third input type of drill-rfc-down, alongside the crystalize RESIDUE and the prior free conversation with the user.

Each argument is a **path** to either:

- a **material file** (reference document, design note, meeting minutes, RFC excerpt, market material, etc.), or
- a **directory** containing material files (every file under it is read as a material)

```bash
/drill-rfc-down <material-file-or-dir> <material-file-or-dir> ...
```

If no arguments are given, drill-rfc-down proceeds with only the crystalize RESIDUE (in README.md) and the prior free conversation as input.

**実行前提（cwd）**: このコマンドは `Tickets.json` と `.claude/scripts/`（`$DRILL_DIR`）を**現在の作業ディレクトリ**から解決します。必ずプロジェクトルート（`.claude` ディレクトリが存在する場所）で実行してください。

## Script List

| Script | Arguments | Description |
|---|---|---|
| `preflight.cjs` | `<material file\|directory>...` | Resolve and validate all arguments plus the 3 resolved files (RFC / GRAPH / Dirs-Tree) and `README.md`; output the `[VARIABLES]` block |
| `session-init.js` | `<rfc-path>` | Create `$SESSION_DIR` with Status / DesignTree / CheckList (continue an existing session if present) |
| `session-status.js` | `<session-dir>` | Display the current phase and the count of unresolved nodes |
| `update-status.js` | `<session-dir> set-step\|set-state\|inc-loop\|show` | Advance the step / state and print the English nextAction |
| `rfc-evolution.js` | `capture\|verify\|clean <rfc-path>` | Capture the RFC baseline; verify append-only + delta extraction + contradiction candidates; clean the snapshot |
| `update-tree.js` | `<session-dir> add\|add-child\|resolve\|batch-resolve\|refine\|show\|delete\|open-count` | DesignTree operations |
| `validate-question-format.js` | `<text>` | Schema-validate the grill question format |
| `tree-query.js` | `<session-dir> tree\|search\|path\|stats` | DesignTree visualization and search |
| `generate-checklist.js` | `<session-dir> [--no-backup]` | Generate CheckList.md from the resolved DesignTree |
| `check-all-schema.js` | `<session-dir>` | Validate consistency across Status.json / DesignTree.json / CheckList.md |
| `graphify-delta-analyzer.js` | `--delta=<path> --graph=<path> --out=<path>` | Step 2: deterministically propose GRAPH evolution candidates plus the four-axis advisory |
| `graphify-step.js` | `--graph=<path> --source=<rfc> [--delta=<path>] [--stage\|--approve\|--reject]` | Step 2 driver: stage / AI design / approve / reject |
| `boundify-delta-analyzer.js` | `--graph-delta=<path> --dirs-tree=<path> --src=<dir> --out=<path> [--graph=<path>]` | Step 3: deterministically propose Dirs-Tree + src evolution candidates plus the four-axis advisory |
| `boundify-step.js` | `--dirs-tree=<path> --src=<dir> [--graph=<path>] [--graph-delta=<path>] [--stage\|--approve\|--reject]` | Step 3 driver: stage / AI design / approve / reject |
| `dirs-tree-crud.js` | `--dirs-tree=<path> --graph=<path> <add-dir\|add-file\|update-node\|update-mapped\|remove-node>` | Granular Dirs-Tree editing with schema validation after every operation |
| `generate-dir-templates-delta.js` | (module) | Step 3: create ONLY the delta newFiles with the Initial Design Artifact header |
| `refresh-file-headers.js` | (module) | Step 3: refresh existing-file headers / cross-references (implementation body untouched) |
| `split-delta-analyzer.js` | `--dirs-tree-delta=<path> --tickets=<path> --out=<path>` | Step 4: deterministically propose Tickets evolution candidates plus the four-axis advisory |
| `split-step.js` | `--tickets=<path> [--dirs-tree-delta=<path>] [--stage\|--approve\|--reject]` | Step 4 driver: stage / AI design / approve / reject |
| `detect-orphan-contracts.js` | (module) | Step 4/5: report orphaned edge contracts with connecting tickets (read-only, never auto-assigns) |
| `verify-consistencies.js` | `--rfc=<path> --graph=<path> --dirs-tree=<path> --src=<dir> --tickets=<path> [--out=<path>]` | Step 5: cross-artifact 6-consistency check |
| `verify-step.js` | `--rfc=<path> --graph=<path> --dirs-tree=<path> --src=<dir> --tickets=<path>` | Step 5 driver: PASS/FAIL blocking gate |
| `advisory-report.js` | (shared) | Four-axis (Danger / Omission / Contradiction / Deficiency) English advisory report builder |

## Workflow

### Step 0: Preflight

Read the arguments (material files / directories) and the `Tickets.json` in the current directory, resolve the paths of all materials, the 3 files in `metadata.resolvedPaths` (RFC / GRAPH / Dirs-Tree), and `README.md`, and verify that they exist. If anything is missing, instruct to interrupt with the error message; if everything exists, list the file paths in Markdown and instruct to proceed to Step 1.

Perform this verification and output with a single script line. `$ARGUMENTS` is passed **unquoted** so the shell hands each space-separated argument to `preflight.cjs` as its own argv entry; the script additionally splits and drops empty tokens, so no-argument invocations yield no materials (never the working directory itself).

```bash
node .claude/scripts/drill-rfc-down/preflight.cjs $ARGUMENTS || exit 1
```

### Step 1: grill

**Role**: Fully understand the materials, the RESIDUE in `README.md`, and the prior conversation, determine the evolution content through grilling, and append it to the RFC. Append-first; destructive changes are prohibited.

**Variables**: Bind `$RFC_PATH` / `$RFC_DIR` / `$SESSION_DIR` / `$DRILL_DIR` from the `[VARIABLES]` block of Step 0. Isolate the session (Status / DesignTree / CheckList) and the artifacts (baseline / delta) entirely under `$SESSION_DIR`; never touch the existing `$RFC_DIR/Status.json` etc.

#### 1-1. Session Initialization

Create `$SESSION_DIR` and newly create Status / DesignTree / CheckList (continue an existing session if present).

```bash
node "$DRILL_DIR/session-init.js" "$RFC_PATH"
node "$DRILL_DIR/session-status.js" "$SESSION_DIR"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-1
```

#### 1-2. Capture Baseline

Save the pre-edit snapshot of the RFC to `$SESSION_DIR/baseline.json`.

```bash
node "$DRILL_DIR/rfc-evolution.js" capture "$RFC_PATH"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-2
```

#### 1-3. Full Understanding of Inputs

Read all materials and the RESIDUE in `README.md`, understand everything including the prior conversation with the user, and present the evolution scope to the user.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-3
```

#### 1-4. Generate DesignTree Nodes

Add initial nodes from the evolution scope. **1 node = 1 design decision**.

**DesignTree node JSON rules**:
- **id convention**: Top-level nodes are `Q1, Q2, ...` (Q + number). Child nodes are `Q1a, Q1b` (parent Q number + lowercase letter). They correspond to the Q numbers of the grill questions
- **title**: A concrete noun phrase expressing that design decision
- **status**: New nodes are `"open"` (becomes `"resolved"` after the grill resolves them)
- **children**: Array of child nodes (initially `[]`; sub-decisions are added with `add-child`)
- **questions**: Initially `[]`. On `resolve`, `{resolvedAt, answer}` is appended automatically

```bash
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add '{"id":"Q1","title":"<design decision>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add-child "Q1" '{"id":"Q1a","title":"<sub-decision>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-4
```

#### 1-5. Grill (Strictly Enforce Rules)

Determine the evolution content through grill-style questioning. Strictly enforce all of the following rules.

**★ Every question MUST include the following in order** (length proportional to the complexity of the design decision; do not be concise):
0. **Question ID**: `Q<number>` format (unique within a turn)
1. **Background and rationale**: Why this design decision is needed, what options exist, and their trade-offs, with sufficient detail
2. **Newline-separated options**: Each option on its own line in markdown list format (do not place two or more options on one line)
3. **Recommendation with reasoning**: Which option is recommended and why it is better than the others, concretely

**The user answers only with Yes/No or an A/B/C choice. Never ask for free-form answers** (receiving a self-volunteered free-form answer is permitted).

- **Coarse-grained bundling**: 1 question = 3–5 nodes, 1 turn = 5–10 questions. **Two-pass approach** (overall architecture → details)
- **Summarize what was settled at the end of each turn** before moving to the next
- **Always pass every question through `validate-question-format.js` before presenting it** (until `valid: true`; skipping is prohibited)
- **Update the DesignTree node immediately after receiving an answer** (`add` / `resolve` / `batch-resolve`, and `add-child` / `refine` / `delete` as needed)
- **Do not write the RFC during grilling**. Focus solely on questions and answers

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

**DesignTree visualization & search** (used to survey and search the tree state during grilling):

```bash
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" tree              # hierarchical display (🔲/✅)
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" search "<keyword>"  # partial match on id/title
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" path "<node_id>"  # path from the root to the node
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" stats             # statistics (open/resolved/progress %)
```

#### 1-6. Completion Judgment

When `open-count` reaches 0, propose ending the grill session to the user and **simultaneously ask the user whether to begin generating the CheckList (RFC requirements checklist)**. Proceed once approved.

```bash
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" open-count
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state CHECKLIST_PENDING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-6
```

#### 1-7. CheckList Generation & Approval

Machine-generate the CheckList with `generate-checklist.js`, then **the AI visually inspects all items and appends supplementary notes** (annotations for ambiguous nodes, project-specific constraints), **presents it to the user, and obtains approval**. After approval, transition to CHECKLIST_APPROVED.

```bash
node "$DRILL_DIR/generate-checklist.js" "$SESSION_DIR" --no-backup
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state CHECKLIST_APPROVED
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-7
```

#### 1-8. Append to RFC

Append the settled evolution content to the RFC. **The appended content must be a complete design that self-containedly covers the entire evolution scope**. Every new section MUST include:

- **Code snippets (code examples)**: every design decision must include a code example (the same constraint as the original STEP 5)
- **I/O boundary reference information**: include reference information so the downstream graphify / boundify can make partitioning decisions
- **No TBD / TODO / stubs / deferrals**: forbidden in any form

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state WRITING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-8
```

#### 1-9. CheckList Verification

Mechanically verify every item in the CheckList, fix unfinished items, and **repeat until all items are ✅**. **If TBD / TODO / "will be addressed in a later version" is detected, warn immediately and do not declare completion until the relevant section is fully written**.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state REVIEWING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-9
```

#### 1-10. Re-grill Decision

If new unresolved nodes appear, return to 1-5 (report to the user after exceeding 3 iterations).

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state GRILLING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" inc-loop
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-10
```

#### 1-11. Evolution Verification (Script Verification + AI Expert Judgment)

**Deterministic script verification** (mechanical gate; the result is information for the AI): verify the append-only gate, delta extraction, well-formedness, and contradiction candidates, and generate `$SESSION_DIR/delta.json`. A violation exits 1 → return to 1-8.

```bash
node "$DRILL_DIR/rfc-evolution.js" verify "$RFC_PATH"
```

**AI engineering-expert judgment** (non-deterministic, no compromise): review the verification result, `delta.json`, the resolved DesignTree nodes, and the evolution scope, and strictly judge the following as an engineering expert:

- **Danger**: does the appended content break existing design, implementation, or contracts?
- **Omission**: are all resolved DesignTree nodes in the evolution scope reflected in the RFC?
- **Contradiction**: does it contradict the existing RFC / GRAPH / Dirs-Tree / Tickets?
- **Deficiency**: does each design decision have a code example, I/O boundary information, and sufficient detail?

**Quality loop (no compromise)**: if any of the above is judged insufficient, **return to 1-8 without compromise and fix**, repeating 1-8 → 1-11. Proceed only when all checks pass.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-11
```

#### 1-12. Completion Declaration

Declare DONE when open-count is 0, the CheckList is all ✅, the RFC has zero TBD/TODO/stubs, and verification passes.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state DONE
node "$DRILL_DIR/check-all-schema.js" "$SESSION_DIR"
node "$DRILL_DIR/rfc-evolution.js" clean "$RFC_PATH"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-12
```

**Next**: proceed to **Step 2: graphify** with `$SESSION_DIR/delta.json` as input.

### Step 2: graphify

Reflect the evolution settled in Step 1 (`$SESSION_DIR/delta.json`) into the existing `*-GRAPH.json`. **The AI designs as the engineering expert; the scripts provide information and safe editing tools and validation**. To complete it with zero danger / omission / contradiction / deficiency, proceed through the **stage → AI design (edit staging with crud.js) → approve (promote only after verify.js passes)** loop. **The AI must never hand-edit JSON**. `crud.js` is the only edit path; every edit runs schema validation, and on failure the AI is given a natural-language English message (`[ERROR] Cause: ... Action: ...`) telling it how to fix.

**① stage (scripts only provide candidate information; the real GRAPH is unchanged)**: `graphify-step.js --stage` copies the real `*-GRAPH.json` to `<graph>.staging.json`, writes the `graphify-delta-analyzer.js` candidates (new nodes / modified nodes / new edges) to `<graph>.candidates.json`, and displays the report. It additionally prints the **four-axis inspection report (Danger / Omission / Contradiction / Deficiency)** in English. The concrete inspection points — slug collision, duplicate heading, weak match, **Step 1 contradiction candidates**, >100-line section, slug over 25 chars — are each classified into one of the four axes. **This is information to aid the AI's design judgment, not a plan, and the promote gate (verify.js) is never changed**. The real GRAPH is never rewritten.

```bash
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --delta="$SESSION_DIR/delta.json" --source="$RFC_PATH" --stage
```

**② AI design (non-deterministic engineering-expert judgment)**: cross-check the candidate report with `delta.json` and the RFC text, and **edit the staging graph with `crud.js`** while strictly judging the following:

- **Danger**: do the new/modified nodes and edges break existing design?
- **Omission**: are all delta sections reflected in the GRAPH?
- **Contradiction**: is the merge-vs-new judgment for new nodes correct?
- **Deficiency**: are the new nodes' kind / slug / headingRefs / edge contracts appropriate?

The candidates are reference information only; there is no obligation to apply them as-is. If the AI's judgment differs from the candidates, reflect it on staging with crud.js granular editing tools (`create-nodes` / `update-node` / `create-edges`). **`--approve` does NOT re-run the analyzer; it validates and promotes the staging graph the AI designed with crud.js as-is**.

```bash
# Example: add a node to the staging graph (--graph points at the staging path)
node "$DRILL_DIR/../rfc-graph/crud.js" --graph="$GRAPH_PATH.staging.json" create-nodes --file="$SESSION_DIR/ai-nodes.json"
# Example: add an edge to the staging graph
node "$DRILL_DIR/../rfc-graph/crud.js" --graph="$GRAPH_PATH.staging.json" create-edges --file="$SESSION_DIR/ai-edges.json"
# Example: modify a staging node
node "$DRILL_DIR/../rfc-graph/crud.js" --graph="$GRAPH_PATH.staging.json" update-node --id=N0003 --file="$SESSION_DIR/ai-patch.json"
```

**③ approve (only when judged complete)**: run `--approve` once the design is complete. `verify.js` fully inspects the staging graph (uncovered headings / isolated nodes / headingRefs resolvability / uniqueness), and **promotes staging → real GRAPH only if it passes**. On validation failure, an English message (`[ERROR] Cause: ... Action: ...`) is emitted and no promotion occurs, so fix with crud.js and re-run. **Destructive changes (node deletion) are forbidden by default; explicit AI approval only**.

```bash
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --source="$RFC_PATH" --approve
```

**④ reject (discard the design)**: to redo the design, use `--reject` to discard the staging copy. The real GRAPH stays byte-identical (perfect-before-write gate).

```bash
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --source="$RFC_PATH" --reject
```

**Verification**: `verify.js` fully inspects the staging before promote, so **repeat ②③ until it passes**. The only graph write paths are `crud.js` (staging) and the promote in `graphify-step.js`.

### Step 3: boundify

Reflect the Step 1 evolution (delta.json) and the Step 2 GRAPH evolution (`$GRAPH_PATH.delta.json`) into the existing `*-Dirs-Tree.json` and the real directories/files under `src`. **The AI designs as the engineering expert; the scripts provide information and safe editing tools and validation**. To complete it with zero danger / omission / contradiction / deficiency, proceed through the **stage → AI design (edit staging with dirs-tree-crud.js) → approve (promote only after validation passes) → reject** loop. **The AI must never hand-edit JSON**. `dirs-tree-crud.js` is the only Dirs-Tree edit path; every edit runs schema validation, and on failure the AI is given a natural-language English message (`[ERROR] Cause: ... Action: ...`) telling it how to fix.

**① stage (scripts only provide candidate information; the real Dirs-Tree/src is unchanged)**: `boundify-step.js --stage` copies the real `*-Dirs-Tree.json` to `<dirsTree>.staging.json`, writes the `boundify-delta-analyzer.js` candidates (new files / modified files / **src drift (missing/extra)** / dependency directories) to `<dirsTree>.candidates.json`, and displays the report. It additionally prints the **four-axis inspection report (Danger / Omission / Contradiction / Deficiency)** in English. The concrete inspection points — path collision, dependency cycle, unmapped GRAPH node, kind mismatch, **Prose exclusion**, missing declaration stub — are each classified into one of the four axes. **This is information to aid the AI's design judgment, not a plan, and the promote gate (validate-dirs-tree-schema) is never changed**. The real Dirs-Tree and src are never rewritten.

```bash
node "$DRILL_DIR/boundify-step.js" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph="$GRAPH_PATH" --graph-delta="$GRAPH_PATH.delta.json" --stage
```

**② AI design (non-deterministic engineering-expert judgment)**: cross-check the candidate report with `graph-delta.json`, the RFC text, and the src drift, and **edit the staging Dirs-Tree with `dirs-tree-crud.js`** while strictly judging the following:

- **Danger**: do the new/modified files break existing implementation?
- **Omission**: are all GRAPH nodes reflected in the Dirs-Tree / src?
- **Contradiction**: are the placement, language, and kind correct?
- **Deficiency**: are the declaration stubs, Prose exclusion (rationale/glossary/requirement), and Prune rules satisfied?

The candidates are reference information only; there is no obligation to apply them as-is. If the AI's judgment differs from the candidates, reflect it on staging with dirs-tree-crud.js granular editing tools (`add-dir` / `add-file` / `update-node` / `update-mapped` / `remove-node`). **`--approve` does NOT re-run the analyzer; it validates and promotes the staging Dirs-Tree the AI designed with dirs-tree-crud.js as-is**. Actual src files are then produced mechanically: `generate-dir-templates-delta.js` creates ONLY the delta newFiles with the Initial Design Artifact header, and `refresh-file-headers.js` refreshes the headers of existing files whose mapped nodes changed — never touching implementation bodies. The AI may still hand-create files when the delta generator is not applicable.

```bash
# Example: add a file node to the staging Dirs-Tree (--dirs-tree points at the staging path)
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" add-file --path=src/api/session_storage.rs --kind=architecture --mapped=N0003:Session storage
# Example: add a directory node to the staging Dirs-Tree
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" add-dir --path=src/api/cache --kind=architecture
# Example: update a staging node's kind
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" update-node --path=src/api/auth.rs --file="$SESSION_DIR/ai-patch.json"
# Example: update a staging node's mappedNodeIds
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" update-mapped --path=src/api/auth.rs --mapped=N0002:Auth module
```

**③ approve (only when judged complete)**: run `--approve` once the design is complete. `validate-dirs-tree-schema.js` fully inspects the staging Dirs-Tree (GRAPH/Dirs-Tree consistency, mappedNodeIds resolution, dependency cycles), and **only if it passes**, mechanically derive the evolution delta `dirs-tree-delta.json`, generate the delta-only new src template files (Initial Design Artifact header) via `generate-dir-templates-delta.js`, refresh existing-file headers via `refresh-file-headers.js` (when `--graph-delta` is provided), and promote staging → real Dirs-Tree. On validation failure, an English message (`[ERROR] Cause: ... Action: ...`) is emitted and no promotion occurs, so fix with dirs-tree-crud.js and re-run. **Destructive changes (file/directory deletion or moves) are forbidden by default; explicit AI approval (`remove-node --force`) only**.

```bash
node "$DRILL_DIR/boundify-step.js" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph="$GRAPH_PATH" --approve
```

**④ reject (discard the design)**: to redo the design, use `--reject` to discard the staging copy. The real Dirs-Tree and src stay byte-identical (perfect-before-write gate).

```bash
node "$DRILL_DIR/boundify-step.js" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph="$GRAPH_PATH" --reject
```

**Verification**: `validate-dirs-tree-schema.js` fully inspects the staging before promote, so **repeat ②③ until it passes**. The only Dirs-Tree write paths are `dirs-tree-crud.js` (staging) and the promote in `boundify-step.js`.

### Step 4: split

Reflect the Step 3 evolution (`$DIRS_TREE_PATH.delta.json`) into the existing `Tickets.json` as ticket edits and additions. **The AI designs as the engineering expert; the scripts provide information and safe editing tools and validation**. To complete it with zero danger / omission / contradiction / deficiency, proceed through the **stage → AI design (edit staging with add-ticket / update-ticket) → approve (promote only after validate-tickets passes) → reject** loop. **The AI must never hand-edit JSON**. `add-ticket.js` / `update-ticket.js` are the only ticket edit paths; every edit runs schema validation, and on failure the AI is given a natural-language English message (`[ERROR] Cause: ... Action: ...`) telling it how to fix.

**① stage (scripts only provide candidate information; the real Tickets.json is unchanged)**: `split-step.js --stage` copies the real `Tickets.json` to `<tickets>.staging.json`, writes the `split-delta-analyzer.js` candidates (new tickets / edited tickets / phase assignments / **existing ticket statuses**) to `<tickets>.candidates.json`, and displays the report. It additionally prints the **four-axis inspection report (Danger / Omission / Contradiction / Deficiency)** in English. The concrete inspection points — status overwrite risk, unmapped modified node, duplicate-node ticket, scope and test-plan deficiency — are each classified into one of the four axes. **This is information to aid the AI's design judgment, not a plan, and the promote gate (validate-tickets) is never changed**. The real Tickets.json is never rewritten.

```bash
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --dirs-tree-delta="$DIRS_TREE_PATH.delta.json" --stage
```

**② AI design (non-deterministic engineering-expert judgment)**: cross-check the candidate report with `dirs-tree-delta.json` and the existing status list, and **edit the staging Tickets.json with `add-ticket.js` / `update-ticket.js`** while strictly judging the following:

- **Danger**: do the existing tickets (especially `reviewed` / `R<N>`) keep their status?
- **Omission**: are all GRAPH nodes / files reflected in the tickets?
- **Contradiction**: are the phase assignments and nodeIds mappings correct?
- **Deficiency**: does each new ticket have sufficient scope and a test plan?

The candidates are reference information only; there is no obligation to apply them as-is. If the AI's judgment differs from the candidates, reflect it on staging with add-ticket.js / update-ticket.js. **`--approve` does NOT re-run the analyzer; it validates and promotes the Tickets.json the AI designed on staging as-is**.

```bash
# Example: add a new ticket to the staging Tickets.json (--tickets points at the staging path)
echo '{"title":"Session storage","nodeIds":["N0003"],"scope":[],"testUnit":[],"testIntegration":[],"testExceptions":[],"changes":[]}' | node "$DRILL_DIR/../tickets/add-ticket.js" "$TICKETS_PATH.staging.json" "P1"
# Example: update a staging ticket's title
echo '{"title":"Auth module extended"}' | node "$DRILL_DIR/../tickets/update-ticket.js" "$TICKETS_PATH.staging.json" "P0-1"
```

**③ approve (only when judged complete)**: run `--approve` once the design is complete. `validate-tickets` fully inspects the staging Tickets.json (title / round / metadata / phases / tickets status and phaseId consistency), and **only if it passes**, mechanically derive the evolution delta `tickets-delta.json` and promote staging → real Tickets.json. On validation failure, an English message (`[ERROR] Cause: ... Action: ...`) is emitted and no promotion occurs, so fix with add-ticket / update-ticket and re-run. **Never silently overwrite existing ticket statuses. Destructive changes (ticket deletion) are forbidden by default; explicit AI approval only**.

```bash
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --approve
```

**④ reject (discard the design)**: to redo the design, use `--reject` to discard the staging copy. The real Tickets.json stays byte-identical (perfect-before-write gate).

```bash
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --reject
```

**Verification**: `validate-tickets` fully inspects the staging before promote, so **repeat ②③ until it passes**. Round management (`R<N>`) and phaseId numbering follow the existing phasify conventions. The only Tickets.json write paths are `add-ticket.js` / `update-ticket.js` (staging) and the promote in `split-step.js`.

### Step 5: verify

Mechanically verify the **mutual consistency** of the 5 artifacts (canonical RFC / GRAPH / Dirs-Tree / src implementation / Tickets) and confirm **cross-artifact zero contradiction**. `verify-consistencies.js` inspects the 6 consistencies and `verify-step.js` decides PASS/FAIL by severity. **If even one high-severity finding remains, FAIL (exit 1) → return to Step 2 to fix → re-verify** (blocking loop). Only low (cosmetic) findings remain → PASS.

```bash
node "$DRILL_DIR/verify-step.js" --rfc="$RFC_PATH" --graph="$GRAPH_PATH" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --tickets="$TICKETS_PATH"
```

**6 consistency checks (severity: high = structural break / low = cosmetic)**:

| Check | Content | severity |
|---|---|---|
| RFC headings ↔ GRAPH headingRefs | every heading is covered by a GRAPH node | high |
| GRAPH ↔ Dirs-Tree mappedNodeIds | every non-Prose node is mapped in the Dirs-Tree | high |
| Dirs-Tree ↔ src | every Dirs-Tree file exists in src / src extras | high / low |
| GRAPH ↔ Tickets nodeIds | every non-Prose node exists in a ticket | high |
| Dangling references | Dirs-Tree / Tickets reference targets exist in the GRAPH | high |
| Edge contracts ↔ Tickets contracts | every edge contract is present in at least one connecting ticket (orphan-free) | high |

**Loop control**: if `verify-step.js` returns exit 1, **return to Step 2 (graphify) to fix** the reported high items, re-run Steps 3/4, then re-verify. Repeat until exit 0 (PASS). The verification is **read-only** (it never rewrites any artifact and is deterministic).
