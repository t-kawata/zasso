---
description: Fill gaps in consideration and design deficiencies in existing RFCs through grill-style questioning. Append-only. Destructive changes prohibited.
argument-hint: </path/to/RFC-*.md>
disable-model-invocation: true
---

# /drill-rfc-down

**Role**: Fill consideration gaps in existing RFCs through grill-style questioning. Append-only, no destructive changes.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

- **First argument (required)**: Path to the RFC file to append to

## Script List

| Script | Arguments | Description |
|---|---|---|
| `init-for-drill-rfc-down.js` | `<target>` | Check existing session file. Call init.js if absent |
| `update-tree.js` | `<dir> <op> [args]` | DesignTree operations: add/resolve/delete/show/open-count |
| `update-status.js` | `<dir> <state>` | Update state in Status.json |
| `session-status.js` | `<dir>` | Display current phase and count of unresolved nodes |
| `validate-question-format.js` | `<text>` | Schema-validate question format |
| `generate-checklist.js` | `<dir>` | Generate CheckList.md from resolved DesignTree |
| `check-all-schema.js` | `<dir>` | Validate consistency across Status.json / DesignTree.json / CheckList.md |
| `tree-query.js` | `<dir> <op>` | Retrieve list of unresolved nodes |
| `list-files.js` | `<dir>` | List file paths pointed to by research-path |

## Workflow

### STEP 0: Initialization

```bash
TARGET_RFC="${ARGUMENTS%% *}"
RFC_DIR="$(dirname "$TARGET_RFC")"
SCRIPT_DIR=".claude/scripts/grill-me-for-rfc"
if [ ! -f "$TARGET_RFC" ]; then echo "Error: $TARGET_RFC"; exit 1; fi
node "$SCRIPT_DIR/init-for-drill-rfc-down.js" "$TARGET_RFC"
node "$SCRIPT_DIR/session-status.js" "$RFC_DIR"
```

### STEP 1: Generate Initial DesignTree Nodes

Read the target RFC and add nodes for areas lacking consideration:

```bash
node "$SCRIPT_DIR/update-tree.js" "$RFC_DIR" add '{"id":"Q1","title":"...","status":"open","children":[]}'
```

### STEP 2: Grill Session

## ★ First-Class Rules (Strictly Enforce)

1. **Every question MUST include the following structure in order. Each section's length should be sufficient to explain the complexity of the design decision.**

   0. **Question ID**: Prefix the question with a `Q<number>` format ID (e.g., `Q1`, `Q2`...). Use unique, non-overlapping numbers within a turn.
   1. **Background and rationale**: Explain why this design decision is needed, what alternatives exist, and what their trade-offs are, with sufficient detail to understand the design decision. Do not try to be concise.
   2. **Newline-separated list of options**: List each option on its own line in markdown list format. Do not place two or more options on the same line.
   3. **One recommended option with reasoning**: Explicitly state which option is recommended and provide concrete justification for choosing it over the others. Stating a recommendation without reasoning is prohibited.

**The user answers only with Yes/No or an A/B/C choice. The AI must never ask for free-form answers (if the user volunteers a free-form answer, receiving it is permitted).**

2. **Aggregate questions at a coarse granularity. Rather than "1 design decision = 1 question", handle 3–5 nodes per question, presenting at most 5–10 questions per turn.**

   - One question covers a sub-area such as "choosing authentication method," within which 3–5 related decisions are asked together
   - One turn covers a larger design area (e.g., authentication as a whole) and consists of 5–10 questions
   - Use a two-pass structure: "decide the big picture (architecture level) first → then fill in details"
   - After each turn, summarize what was settled in that turn before moving to the next
3. **Do not write the RFC during grill sessions. Focus solely on questions and answers.**
4. **When the user answers, update the corresponding DesignTree node immediately.**

### Automatic Question Format Validation Gate (Strictly Enforce)

Before presenting a question to the user, **you MUST pass it through `validate-question-format.js`. It is forbidden to present a question to the user without passing this validation gate.**

```bash
node .claude/scripts/grill-me-for-rfc/validate-question-format.js "<question_text_here>"
```

- Do not present a question to the user until validation returns `valid: true`
- If validation returns `valid: false`, correct the question according to the error message and re-validate
- Skipping this validation is a first-class rule violation and is not permitted

## DesignTree Updates (Must execute after receiving answers)

```bash
# Resolve one node
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" resolve "<node_id>" "<answer_summary>"

# Batch-resolve multiple nodes (when multiple questions were answered in one turn)
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" batch-resolve '["id1","id2","id3"]' "<answer_summary>"

# Add a new node (expand the design tree)
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '<node_json>'

# Add a child node (refine the design tree)
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add-child "<parent_id>" '<node_json>'

# Refine node title
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" refine "<node_id>" "<new_title>"

# Delete a node (removes all descendants)
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" delete "<node_id>"

# Check count of open nodes
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" open-count
```

## DesignTree Visualization & Search

Use `tree-query.js` for tree structure overview or specific node search (read-only, no schema validation required).

```bash
# Display full tree in hierarchy (🔲 = open, ✅ = resolved)
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" tree

# Keyword search (partial match on node id / title)
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" search "<keyword>"

# Show path from root to a specific node
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" path "<node_id>"

# Statistics (total / open / resolved / max depth / progress)
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" stats
```

## Status Updates

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
```

### STEP 3: Grill Session End Judgment

When you determine `open-count` has reached 0, propose ending the session to the user.
Simultaneously, ask the user whether to begin generating the RFC requirements checklist.

```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" open-count
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_PENDING
```

### STEP 4: Checklist Generation

Once the user approves, machine-generate the CheckList.md via script, then **the AI MUST visually inspect and append supplementary notes**. The CheckList.md must also include items verifying the relationship with the target RFC and whether any design decisions addressed through grilling are missing.

```bash
node .claude/scripts/grill-me-for-rfc/generate-checklist.js "$RFC_DIR" --no-backup
```

Generated checklist structure (2 levels):

```
## Problem Domain Name  ← top-level node
- [ ] The entire section is fully described
- [ ] Code snippets are included
- [ ] No occurrences of TBD / TODO
- [ ] Relationship with target RFC is clear
- [ ] All design decisions resolved via grilling are reflected

  ### Child Node Name  ← DesignTree node unit
  - [ ] The <child node title> is fully described as a design
  - [ ] Code snippets are included
  - [ ] No occurrences of TBD / TODO
```

**★ After script generation, the AI MUST do the following:**

- Visually inspect all checklist items; for nodes resolved in the DesignTree but with ambiguous descriptions, append supplementary notes
- Add project-specific constraints (language, framework, performance requirements, etc.) as checklist items
- After appending, ask the user to review and approve the CheckList.md

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_APPROVED
```

### STEP 5: Append to Target RFC (Strict Edit Policy)

**Append-first. Full rewrite, section deletion, or overwriting is prohibited.**

- If appendable → append new design decisions to the target location
- If not appendable → make minimal partial corrections
- Absolutely prohibited: full rewrite, deletion, or changing the output target

```bash
wc -l "$TARGET_RFC"
```

### STEP 6: Checklist Verification & Polish

After appending, mechanically verify every item in CheckList.md.

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state REVIEWING
```

- If any item remains incomplete, fix it and iterate until all items are ✅
- **If you detect TBD / TODO / "will be addressed in a later version", immediately warn and do not declare completion until those items are filled**
- Once all items are cleared, report to the user

---

### STEP 7: Re-grill Decision

If new unresolved nodes are discovered through the appended content, or if the design tree requires expansion, return to STEP 2 and re-grill.

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" inc-loop
```

- **Once the loop exceeds 3 iterations, report the reason for the prolongation and current status to the user before continuing.**
- Only declare completion when re-grilling is deemed unnecessary.

---

### STEP 7a: Append I/O Boundary Reference Information

For RFCs with all design tree decisions resolved, append I/O boundary reference information to enable safe partitioning by future `/graphify-rfc` (graphing) and `/boundify-graph` (directory boundary generation).

```bash
# Insert template
node "$SCRIPT_DIR/insert-io-boundary-template.js" "$TARGET_RFC"

# AI fills in content (using `[::IO-INFO-STUB::]` markers as cues, generate content from existing RFC descriptions)
```

**The AI reads each `<!-- [::IO-INFO-STUB::] ... -->` marker in the template one by one, follows its instructions to generate appropriate content from existing RFC descriptions, and replaces the marker. Repeat until no markers remain.**

Completion verification:

```bash
node "$SCRIPT_DIR/check-io-stubs.js" "$TARGET_RFC"
if [ $? -ne 0 ]; then
  echo "Error: Unfilled [::IO-INFO-STUB::] markers remain. AI content generation is incomplete."
  exit 1
fi
```

---

### STEP 8: Completion Declaration

Only declare completion when ALL of the following conditions are met:

- All DesignTree nodes are `resolved` (`open-count` = 0)
- All CheckList items are ✅
- Zero instances of TBD / TODO / stubs / deferred items in the RFC body
- Appended content is consistent with the target RFC

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state DONE
node "$SCRIPT_DIR/check-all-schema.js" "$RFC_DIR"
```

### STEP 9: Completion Report

```bash
echo "=== /drill-rfc-down Complete ==="
echo "Target: $TARGET_RFC"
wc -l "$TARGET_RFC"
```
