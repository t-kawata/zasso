---
description: Interactive grill session for writing RFC design documents under strict constraints (complete coverage, no delegation, no stubs).
argument-hint: </path/to/INFO-DIR-OR-FILE> </path/to/RFC-TO-OURPUT.md>
disable-model-invocation: true
---

# /grill-me-for-rfc

## Overview

Interactive grill session for writing an RFC design document under strict constraints: complete design-tree coverage, no scope delegation, no stub implementations.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Usage

```
/grill-me-for-rfc <research-path> <rfc-output-file-path>
(Optional free-form notes on a new line below the arguments)
```
- `<research-path>`: researched file or directory
- `<rfc-output-file-path>`: RFC design document output path (`.md`)
- free-form notes: optional supplementary info/constraints

---

## Mechanical Variable Binding from Arguments

| Variable | Derivation | Value |
|----------|------------|-------|
| `$RESEARCH_PATH` | 1st argument | research file/directory path |
| `$RFC_OUTPUT_PATH` | 2nd argument | RFC document output path (`.md`) |
| `$RFC_DIR` | `dirname "$RFC_OUTPUT_PATH"` | dir holding RFC artifacts (Status.json, DesignTree.json, CheckList.md, etc.) |

invariant: once `init.js` runs, `$RESEARCH_PATH`/`$RFC_OUTPUT_PATH` persist in `Status.json` — only `$RFC_DIR` needs tracking thereafter.

### Schema Validation Gate

gate: every file-modifying script (`init.js`/`update-tree.js`/`update-status.js`/`generate-checklist.js`) auto-calls `check-all-schema.js` post-op to validate Status.json/DesignTree.json/CheckList.md schema integrity.
fail (exit1) → read error, fix affected file, re-run. do not proceed until pass — skipping forbidden.
standalone: `node .claude/scripts/grill-me-for-rfc/check-all-schema.js "$RFC_DIR"` (any time).

### Session Status

`session-status.js` mechanically determines current step + next action from Status.json+DesignTree.json. run first whenever unsure where you are:
```bash
node .claude/scripts/grill-me-for-rfc/session-status.js "$RFC_DIR"
```
out:
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
generates in the RFC output dir: `CheckList.md` (populated at STEP 4), `DesignTree.json` (empty), `Status.json` (state: GRILLING).

ask; stop — Resume mode: `Status.json` exists → ask the user: "Resume from where we left off?" (RFC output file may or may not exist yet — first written at STEP 5).
ask; stop — Overwrite mode: RFC output file exists but `Status.json` doesn't → ask the user to confirm overwrite. approved → delete old RFC file, re-run `init.js`.

```bash
node .claude/scripts/grill-me-for-rfc/list-files.js "$RFC_DIR"
```
file → its path. directory → flat JSON array of all file paths recursively. read all, internalize as research material.

---

### STEP 1: DesignTree — Initial Node Generation

after reading all research material, before the first grill question: generate initial design-tree nodes from research content, write them.
```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '{"id":"...","title":"...","status":"open","questions":[],"children":[]}'
```

---

### STEP 2: Grill Session

## ★ First-Class Rules (MUST be followed without exception)

1. every question MUST contain, in order (length proportional to design-decision complexity — do not aim for concise):
   0. Question ID: `Q<number>`, unique within a turn
   1. Background and rationale: why this decision is needed, what options exist, trade-offs — enough for an informed choice
   2. Choices as a line-broken list: one choice per line, markdown list — never two choices on one line
   3. AI's recommendation with rationale: state the one recommended choice, explain specifically why over alternatives — recommending without reasoning forbidden

   closed answer vocabulary (absolute, on the AI's asking behavior): user answers ONLY Yes/No or A/B/C. AI must NEVER ask for free-form answers (if the user volunteers one anyway, AI may accept it).

2. bundle questions at coarse granularity — never one question per design decision:
   - one question = a sub-domain (e.g. "choice of authentication method") bundling 3–5 related decisions
   - one turn = a larger design domain (e.g. the entire auth system), 5–10 questions
   - two-pass: big-picture architecture first, then details
   - end of each turn: summarize what was decided before the next turn
3. no RFC content during the grill session — questions and answers only.
4. after every user answer: immediately update the corresponding DesignTree nodes.

### Question Format Validation Gate (MANDATORY)

gate: every question passes through `validate-question-format.js` **before** presenting to the user. presenting unvalidated = forbidden.
```bash
node .claude/scripts/grill-me-for-rfc/validate-question-format.js "question text here"
```
`valid:false` → reformulate per the error message, re-validate. skipping this gate = first-class rule violation.

ask; stop — the grill loop itself: present each validated question, wait for the user's closed-vocabulary answer.

## DesignTree Updates (run after every user answer)

```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" resolve "<node_id>" "<answer_summary>"
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" batch-resolve '["id1","id2","id3"]' "<answer_summary>"
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '<node_json>'
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add-child "<parent_id>" '<node_json>'
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" refine "<node_id>" "<new_title>"
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" delete "<node_id>"
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" open-count
```

## DesignTree Visualization & Search

`tree-query.js` (read-only, no schema validation needed):
```bash
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" tree
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" search "<keyword>"
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" path "<node_id>"
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" stats
```

## Status Update

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
```

---

### STEP 3: Grill Session End Condition

`open-count`==0 → propose ending the grill session; ask; stop — ask the user: "Shall I start generating the RFC requirements checklist?"
```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" open-count
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_PENDING
```

---

### STEP 4: CheckList.md Generation

user approves → generate mechanically:
```bash
node .claude/scripts/grill-me-for-rfc/generate-checklist.js "$RFC_DIR"
```
structure (two-level):
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
judge: review all items, add clarifying notes for resolved-but-ambiguous nodes; append project-specific constraint items (language/framework/perf/etc).
ask; stop — present the completed `CheckList.md` to the user for review and approval.
```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_APPROVED
```

---

### STEP 5: RFC Writing

begin once the user approves the checklist.

## RFC Hard Constraints (MUST be followed without exception)

- zero occurrences of TBD, TODO, "handle in a later version", stub, or scope delegation — in any form
- a single RFC document stands alone as a complete design fully covering the entire Design Tree
- every design decision accompanied by a code example
- IETF-style structure: Abstract / Motivation / Design / Implementation / Appendix

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state WRITING
```

---

### STEP 6: CheckList Verification and Revision

mechanically verify every `CheckList.md` item.
```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state REVIEWING
```
heal-loop: fix unmet items, repeat until all ✅.
invariant: TBD/TODO/"handle in a future version" detected anywhere → immediate warning; do not declare completion until that section is fully written.
out: report to the user once all items pass.

---

### STEP 7: Re-grill Decision

new unresolved nodes / required design-tree expansion discovered while writing → back to STEP 2, re-grill.
```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" inc-loop
```
loop-count > 3 → report the reason for the extended cycle + current status to the user before continuing *(ambiguous in the source between a pure status report and an implicit pause for acknowledgment — preserved as found, not resolved either way)*.
declare RFC completion only when re-grilling is no longer needed.

---

### STEP 7a: I/O Boundary Reference Information

Downstream (role): future graph-splitting commands (`/graphify-rfc`, `/boundify-graph`).
- consumes: I/O boundary reference info in the RFC
- contract: lets them split the document along natural seams safely

```bash
node "$SCRIPT_DIR/insert-io-boundary-template.js" "$TARGET_RFC"
```
heal-loop: AI reads each `<!-- [::IO-INFO-STUB::] ... -->` marker, follows its instruction, generates content from the existing RFC, replaces the marker. repeat until none remain.
```bash
node "$SCRIPT_DIR/check-io-stubs.js" "$TARGET_RFC"
if [ $? -ne 0 ]; then
  echo "ERROR: Remaining [::IO-INFO-STUB::] markers found. AI content completion is incomplete."
  exit 1
fi
```

---

### STEP 8: RFC Completion Declaration

gate (all 3 required): all DesignTree nodes `resolved` (`open-count`=0) AND all CheckList items ✅ AND zero TBD/TODO/stub/delegation in the RFC body.
```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state DONE
```

---

## Reverse mode (G1 to G5)

Mode: forward | reverse
  detect: `reverse-seed-index` in the seed's section 1. a forward seed carries none — this section cannot fire on one.

reverse overlays the **same command, same Steps 0–8** — it does not replace them.

Upstream (role): `/workspacify-allocate` (reverse mode).
- produces: RFC-SEED with a `reverse-seed-index` injected into its machine-written section 1
- guarantee: a forward seed carries no such index — mode-detection by presence/absence is sound; a seed without it is refused by name (a forward seed is not this grill's input in reverse mode)

rationale: when the material is an existing implementation rather than a design, "what should this do?" invites "what it currently does" — a *ratification RFC* that restates code as spec, satisfying surface consistency while proving nothing (implementation/tests/comments all descend from one design and corroborate each other, not the design itself). reverse mode makes this failure structurally unavailable.

| Change | What it does |
|---|---|
| **G1 mechanical question generation** | `reverse-questions.js` reads the seed's reverse index + the residual record section 12 renders from, generates initial question candidates; AI confirms. generation separated from rendering — testable without producing a document |
| **G2 ratification prevention** | for **every** unresolved claim, machine inserts the intent-or-accident question (3 answers + default). unconditional — the insertion itself is the whole defence |
| **G3 residual carry-over** | upstream unresolved travels to the grill verbatim — same candidate id, topic, question. rewording any loses the observation; when stage-one hand-off is supplied, carry is proven **before any question is built**; divergence stops the run, naming the differing field |
| **G4 record of a normative choice** | `normative-decision.js` records every choice as a **selection event** in `normative_decision`, never a wait-state. no answer → `chosen_default` adopted, `selection_source` says so. high-risk proposition is not promoted to a norm — keeps `unresolved-contract-candidate` + question + `requires_human_approval` |
| **G5 the authority** | `normative_authority` = a stable role/team/council identifier (e.g. `security-domain-steward`). a personal name is refused — people change, the authority and re-review duty do not |

Scripts (reverse mode only; forward steps run their same scripts unchanged):

| Script | Invocation | What it does |
|---|---|---|
| `reverse-questions.js` | `reverse-questions.js <RFC-SEED.md> [--claims=<json>] [--residuals=<json>] [--stage-one=<json>]` | generates question candidates from the seed's reverse index+residuals, inserts the intent-or-accident question per unresolved claim, prints in this command's standard question format. `--stage-one` proves G3's verbatim carry before any question is built. a claim/residual no question can be built for is **reported, never skipped** |
| `normative-decision.js` | `normative-decision.js decide --input=<json>` / `normative-decision.js authority --ref=<id> --kind=<kind>` | records choices as selection events; validates both the authority's reference and kind; refuses a normative clause with a broken provenance chain. no approval-waiting state in its vocabulary |

invariant: every reverse-mode question still passes through `validate-question-format.js` exactly as a forward question does; the closed answer vocabulary (Yes/No or A/B/C, no solicited free-form) applies unchanged.

Prohibitions:
- never omit the intent-or-accident question for an unresolved claim — mandatory, not optional
- never write RFC prose during the grill — reverse mode adds questions, not content
- never record a choice as an approval state — a record names what was selected, by whom, on what basis
- never record a person as the authority; never leave `normative_authority` empty
- never promote a default to a norm because no answer arrived — the default keeps analysis moving, it does not decide the design
- never drop a question for a claim/residual the machine couldn't ask about — report it and say why
