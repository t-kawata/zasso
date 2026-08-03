---
description: Interactive grill session for writing RFC design documents under strict constraints (complete coverage, no delegation, no stubs).
argument-hint: </path/to/INFO-DIR-OR-FILE> </path/to/RFC-TO-OURPUT.md>
disable-model-invocation: true
---

# /grill-me-for-rfc

## Overview

An interactive grill session command for writing an RFC design document under strict constraints: complete coverage of the design tree, no scope delegation, and no stub implementations.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Usage

```
/grill-me-for-rfc <research-path> <rfc-output-file-path>
(Optional free-form notes on a new line below the arguments)
```

- `<research-path>`: Path to a researched file or directory
- `<rfc-output-file-path>`: Output path for the RFC design document (`.md`)
- Free-form notes: Supplementary information or constraints (optional)

---

## Mechanical Variable Binding from Arguments

The two arguments passed to the command are referenced as the following variables throughout all steps:

| Variable | Derivation | Value |
|----------|------------|-------|
| `$RESEARCH_PATH` | 1st argument | Path to research file or directory |
| `$RFC_OUTPUT_PATH` | 2nd argument | Output path for the RFC document (`.md`) |
| `$RFC_DIR` | Mechanically derived from `dirname "$RFC_OUTPUT_PATH"` | Directory holding RFC artifacts (Status.json, DesignTree.json, CheckList.md, etc.) |

**Once `init.js` is executed, both `$RESEARCH_PATH` and `$RFC_OUTPUT_PATH` are persisted in `Status.json`. From that point on, only `$RFC_DIR` needs to be tracked.**

### Schema Validation Gate

All file-modifying scripts (`init.js` / `update-tree.js` / `update-status.js` / `generate-checklist.js`) automatically call `check-all-schema.js` internally after a successful operation to validate the schema integrity of Status.json, DesignTree.json, and CheckList.md.

- **If validation fails, the script exits with `exit(1)`.** The AI must read the error, fix the affected file, and re-run the script.
- **Do not proceed to the next step until validation passes.** Skipping schema errors is forbidden.
- `check-all-schema.js` also runs standalone: `node .claude/scripts/grill-me-for-rfc/check-all-schema.js "$RFC_DIR"` can be invoked at any time.

### Session Status

`session-status.js` reads Status.json and DesignTree.json to mechanically determine the current step and next action. Run this first whenever unsure where you are:

```bash
node .claude/scripts/grill-me-for-rfc/session-status.js "$RFC_DIR"
```

Sample output:
```
📋 Session Status
  State: GRILLING
  Step: STEP 2 — STEP 2: Grill Session Active
  Next Action: Run tree-query.js tree to review unresolved nodes and generate questions
  Nodes: 5 total / 3 open
  Loop Count: 0
```

---

## Execution Steps

### STEP 0: Initialization

```bash
node .claude/scripts/grill-me-for-rfc/init.js "$RESEARCH_PATH" "$RFC_OUTPUT_PATH"
```

Generate the following scaffolding files in the same directory as the RFC output file:

- `CheckList.md` — RFC requirements checklist (populated in STEP 4)
- `DesignTree.json` — Design tree (empty nodes)
- `Status.json` — Progress state (initial state: GRILLING)

- **Resume mode**: If `Status.json` exists, ask the user: "Resume from where we left off?" (The RFC output file may or may not exist — it is first written in STEP 5.)
- **Overwrite mode**: If the RFC output file exists but `Status.json` does not, ask the user to confirm overwrite. Once approved, delete the old RFC file before re-running `init.js`.

```bash
node .claude/scripts/grill-me-for-rfc/list-files.js "$RFC_DIR"
```

- If the research path is a file, output its path. If it is a directory, output a flat JSON array of all file paths recursively.
- Read all files in the output list and internalize them as research material.

---

### STEP 1: DesignTree — Initial Node Generation

After reading all research material and before asking the first grill question, generate initial design tree nodes from the research content and write them:

```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '{"id":"...","title":"...","status":"open","questions":[],"children":[]}'
```

---

### STEP 2: Grill Session

## ★ First-Class Rules (MUST be followed without exception)

1. **Every question MUST contain the following parts in order. The length of each part should be proportional to the complexity of the design decision — do not try to be concise.**

   0. **Question ID**: Prefix the question with `Q<number>` (e.g., `Q1`, `Q2`...). IDs must be unique within a turn.
   1. **Background and rationale**: Explain why this design decision is needed, what options exist, and their trade-offs. Provide enough detail for the user to make an informed choice.
   2. **Choices as a line-broken list**: Each choice on its own line in markdown list format. Never put two or more choices on the same line.
   3. **AI's recommendation with rationale**: State which one choice you recommend and explain specifically why over the alternatives. Recommending without reasoning is forbidden.

**The user answers ONLY with Yes/No or an A/B/C choice. The AI must NEVER ask for free-form answers (if the user voluntarily provides one, the AI may accept it).**

2. **Bundle questions at a coarse granularity. Do NOT treat each design decision as a single question — each question should cover 3–5 nodes, and each turn should present 5–10 questions.**

   - One question covers a sub-domain (e.g., "choice of authentication method") bundling 3–5 related decisions together
   - One turn covers a larger design domain (e.g., the entire auth system) composed of 5–10 questions
   - Use a two-pass approach: decide the big-picture architecture first, then drill into details
   - At the end of each turn, summarize what was decided before moving to the next turn
3. **Do not write any RFC content during the grill session. Focus solely on questions and answers.**
4. **After receiving a user's answer, immediately update the corresponding DesignTree nodes.**

### Question Format Validation Gate (MANDATORY)

**Before presenting any question to the user, you MUST pass it through `validate-question-format.js`. Presenting an unvalidated question is forbidden.**

```bash
node .claude/scripts/grill-me-for-rfc/validate-question-format.js "question text here"
```

- Do NOT present a question until validation returns `valid: true`
- If validation returns `valid: false`, reformulate the question according to the error message and re-validate
- Skipping this validation is a first-class rule violation and is not permitted

## DesignTree Updates (run after every user answer)

```bash
# Resolve a single node
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" resolve "<node_id>" "<answer_summary>"

# Batch-resolve multiple nodes (when the user answered several questions in one turn)
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" batch-resolve '["id1","id2","id3"]' "<answer_summary>"

# Add a new node (expand the design tree)
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '<node_json>'

# Add a child node (refine the design tree)
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add-child "<parent_id>" '<node_json>'

# Refine a node title
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" refine "<node_id>" "<new_title>"

# Delete a node and all its descendants
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" delete "<node_id>"

# Check number of open nodes
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" open-count
```

## DesignTree Visualization & Search

Use `tree-query.js` for visual overview and search (read-only, no schema validation needed):

```bash
# Display full tree hierarchy (🔲 = open, ✅ = resolved)
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" tree

# Search nodes by keyword (partial match on id / title)
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" search "<keyword>"

# Show path from root to a specific node
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" path "<node_id>"

# Show statistics (total / open / resolved / max depth / progress)
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" stats
```

## Status Update

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
```

---

### STEP 3: Grill Session End Condition

When `open-count` reaches 0, propose ending the grill session to the user.
At the same time, ask the user: "Shall I start generating the RFC requirements checklist?"

```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" open-count
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_PENDING
```

---

### STEP 4: CheckList.md Generation

Once the user approves, machine-generate `CheckList.md` via script, then **the AI must manually review the output and append any supplementary notes**.

```bash
node .claude/scripts/grill-me-for-rfc/generate-checklist.js "$RFC_DIR"
```

Generated checklist structure (two-level hierarchy):

```
## §N Section Name  ← top-level node
- [ ] Section is fully described
- [ ] Code snippets are included
- [ ] No occurrences of TBD / TODO / "handle in a future version"

  ### §N.M Child Node Name  ← DesignTree node level
  - [ ] <node title> is fully described as a design decision
  - [ ] Code snippets are included
  - [ ] No occurrences of TBD / TODO / "handle in a future version"
```

**★ After script generation, the AI must:**

- Review all checklist items and add clarifying notes for any nodes that are resolved in the DesignTree but whose descriptions may be ambiguous
- Append project-specific constraints (language, framework, performance requirements, etc.) as additional checklist items
- Present the completed `CheckList.md` to the user for review and approval

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_APPROVED
```

---

### STEP 5: RFC Writing

Begin writing the RFC once the user approves the checklist.

## RFC Hard Constraints (MUST be followed without exception)

- **The RFC MUST NOT contain any occurrences of TBD, TODO, "handle in a later version", stub, or scope delegation — in any form.**
- **A single RFC document must stand alone as a complete design that fully covers the entire Design Tree.**
- **Every design decision MUST be accompanied by a code example (code snippet).**
- RFC section structure follows IETF style:
  - Abstract
  - Motivation
  - Design
  - Implementation
  - Appendix

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state WRITING
```

---

### STEP 6: CheckList Verification and Revision

After writing the RFC, mechanically verify every item in `CheckList.md`.

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state REVIEWING
```

- Fix any unmet items and repeat until all items are ✅.
- **If TBD / TODO / "handle in a future version" is detected anywhere, issue an immediate warning and do not declare RFC completion until the relevant section is fully written.**
- Report to the user once all items pass.

---

### STEP 7: Re-grill Decision

If RFC writing reveals newly discovered unresolved nodes or required expansions of the design tree, return to STEP 2 and re-grill.

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" inc-loop
```

- **If the loop count exceeds 3, report to the user the reason for the extended cycle and current status before continuing.**
- Declare RFC completion only when re-grilling is no longer needed.

---

### STEP 7a: I/O Boundary Reference Information

Add I/O boundary reference information to the RFC so that future `/graphify-rfc` (graphing) and `/boundify-graph` (directory boundary generation) can safely split the document along natural seams.

```bash
# Insert template
node "$SCRIPT_DIR/insert-io-boundary-template.js" "$TARGET_RFC"

# AI fills in content (reads [::IO-INFO-STUB::] markers, generates content from existing RFC descriptions)
```

**The AI reads each `<!-- [::IO-INFO-STUB::] ... -->` marker in the template, follows its instruction to generate appropriate content from the existing RFC, and replaces the marker. This process repeats until no markers remain.**

Verify no markers remain:

```bash
node "$SCRIPT_DIR/check-io-stubs.js" "$TARGET_RFC"
if [ $? -ne 0 ]; then
  echo "ERROR: Remaining [::IO-INFO-STUB::] markers found. AI content completion is incomplete."
  exit 1
fi
```

---

### STEP 8: RFC Completion Declaration

Declare completion only when ALL of the following conditions are met:

- All DesignTree nodes are `resolved` (`open-count` = 0)
- All CheckList items are ✅
- The RFC body contains zero occurrences of TBD / TODO / stub / delegation

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state DONE
```
