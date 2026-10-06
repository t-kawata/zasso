---
description: Interactive grill session for writing RFC design documents under strict constraints (complete coverage, no delegation, no stubs).
argument-hint: [<material file|directory>...]
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

## ★ Cross-directory resolution (first-class, top priority)

A grill reads records. Some of what it reads is wrong, and a design that cannot be
implemented is wrong whatever its records say. A run that only answers questions carries
the wrongness forward — and a defect whose fix lives in another directory is invisible to
a run that never looks outside its own.

A **defect** is a place where the design cannot be implemented: a **contradiction**
(two statements cannot both hold), a **conflict** (two declarations compete for one
thing, or one side demands an outcome the other cannot produce), or a **deficiency**
(a name is used but not defined, a contract is missing, a boundary is unstated). The
test is one question: can an implementer read this design and write the implementation
to the end, inventing nothing? A place where they must invent is a defect.

- **resolve all of them**: every defect this run finds is resolved before the run declares
  DONE. "Recorded and left open" is not a disposition this command admits.
- **the inspection is the whole workspace**: this package is a part. Read the neighbours'
  designs, not only their appendices, and check the composition — that the types this
  document names are the types its neighbours pass, that its ordering claims are the ones
  they assume, that every edge names a counterpart that exists. A part is implementable
  only in composition.
- **the target may be another directory**: a defect owned by another package is resolved by
  correcting that package's artifacts. Reaching across directories is the expected case,
  not an exception.
- **the edit surface is what this command generates**: `RFC.md`, `DesignTree.json`,
  `CheckList.md` and `Status.json` are editable **anywhere**. `RFC-SEED.md`,
  `INFO-RFC-SEED.md`, `EXPLAIN-RFC-SEED.md`, the `WORKSPACIFY-*.json` manifests and the
  specification are **never** edited: their hashes are recorded and chained.
  `guard-edit-surface.js` refuses them by name.
- **a seed defect is resolved in the output, not in the input**: where a stage-1 artifact
  asserts something a higher record contradicts, the resolution is the RFC naming the
  contradiction, taking the correct reading, and indexing it in the ledger. That is a
  resolution, not a deferral.
- **verify before carrying**: a defect inherited from another package's appendix is a
  *reading*, not a record. Open the cited section with `show-record.js` and confirm it
  before it travels. A false defect propagates: one reached two RFCs and a checklist before
  anyone read the source.
- **follow the fix downstream**: after a cross-directory fix, every artifact that recorded
  the defect as live is corrected — the target's, and the recording package's.
- **an unread neighbour is not a clean neighbour**: "no defect found" is a result, and the
  ledger records the checks that produced it. A run that did not look has not cleared
  anything.

Gates this section adds, carried outside the shared question-gate block:

- **G6 defects** — every defect found in any package is resolved: `resolved-here`,
  `resolved-other` (naming the directory and the date) or `withdrawn`. None is `open`. No
  input artifact was edited. The seed divergence ledger and the defect ledger are both
  present and well formed, and the defect ledger records the composition checks performed.

Rule: G5 and G6 are both required for DONE; a run may not trade one for the other.
Prohibition: never resolve a G6 failure by recording the defect and moving on.

<!-- question-gate:begin -->
## Core Rule

Never put a point to the human. Put only direction questions.

- **point**: one recorded open item. The set is not closed: a viewpoint the human
  brings is refined into an orderly point before it is recorded, and is then a point
  like any other, put through the same settle-and-bundle filter.
- **direction question**: one question on a priority, a desired state, or whose
  experience comes first. One answer lets the AI settle many points itself.
- **order**: AI settles first; only what it cannot settle is bundled; only the bundle
  is asked.
- **direction ≠ vague**. Wide in span, concrete in words: each direction names who,
  in what situation, gains what, loses what. No implementation term.
- **count**: questions ≪ points. At most three axes to a round.
- **the human sees little**: only what the choice needs.
- **end**: only when the AI has settled every point. Unsettled points remain → new
  direction questions on those points only.

## The question gate (settle before drafting)

A question may not be drafted until the settle test has been written out and has
failed. For every point about to become a question, write these three lines first, in
this order:

- 決定: <what is decided>
- 根拠: <the record id, the upstream document, or the question and letter it rests on>
- 覆す条件: <the fact that would overturn it>

If all three lines can be written, the point is settled: it goes to
「先に決めておいたこと」 and no question is drafted. Only a point whose three lines
cannot be written becomes a question. The gate's output is those three lines, not a
feeling: a question drafted without them is a defect even if it reads well. The line
that records the failed test is `決められなかった理由`.

Four inferences this gate forbids. Each has produced a wrong question.

| inference | refusal, and why it is wrong |
|---|---|
| 「a flag named this point, so it is the human's」 | `flag-is-not-a-ground` — a flag is not a ground and is not weight. |
| 「a doubt about this record means there is no ground」 | `foreign-package-doubt` — a doubt filed under another package is not this package's point. Establish whose point it is before treating it as material. |
| 「the doubt says only the author can decide, so it must be asked」 | `author-only-is-material-not-exemption` — that sentence is material *for* the test above, not an exemption from it. Write the three lines. |
| 「the point is weighty, so it is the human's」 | `weight-alone-does-not-bind` — weight alone does not bind a point to a question. The binding condition is weighty **and** no ground. A ground the AI has not looked for is not an absent ground. |

## The ladder

Read the prior records before drafting anything. Every point takes the first rung that
matches:

- **Q0** — a published record already decides it → settle; ground is that record.
- **Q0'** — an upstream artifact or a neighbour clearly settled it → settle; ground is
  that document. It stands in 「先に決めておいたこと」 and is never re-asked, never
  reopened, and never moved back into a question.
- **Q1** — the material entails it, once the AI has **finished looking** → settle;
  ground is the place in the material.
- **Q2** — the result is light and reversible → settle, with an override condition.
- **Q3** — weighty or hard to reverse, **and** the three lines cannot be written after
  looking → bind to a direction question.

A question binds at least two points, unless fewer than two are open. One answer
settles every point bound to it. The axes a round may open are capped, and what does
not fit stays open for a later round rather than being dropped or folded into an axis
it would weaken.

## The question block, in order

1. 状況 — who does what, when, with what consequence.
2. 私の結論 — the AI's own answer, in words, with its reason. No option letter yet.
3. すでに決まっていること — one sentence: 「これ以外は決まっています」.
4. 残っている選択 — one sentence: 「あなたに残っているのは〜だけです」.
5. 選択肢 — `A: <meaning>` / `B: <meaning>`. The letters appear here for the first time.
6. 推奨 — the letter, now that it is defined.
7. 推奨が覆る条件 — the fact that would change it.

If line 2 cannot be written at all, or line 4 cannot be written narrowly, stop: go
back to the question gate. A name used before the line that defines it is a defect at
that line; fix the line, never append a gloss later.

## The loop

- A reply carrying a letter is an answer; prose is added to the letter, never put in
  its place.
- A reply carrying no letter is not an answer — and it is not nothing: what it raised
  is refined into a point, and the settle test is re-run on that point before any
  prose is rewritten. A reply that is not an answer is evidence about the **point**,
  not only about the wording.
- An answered axis is never re-asked. A later round asks a new axis built from the
  still-open points and the added ones only.

## Gates

- **G0 records** — the prior records were read and the scan recorded. Not read → stop.
- **G1 settle** — every point the records ground is settled, with its three lines.
- **G2 fill** — every block carries its lines and its settle trace.
- **G3 ask** — every question is a direction, binds at least two points, and reads top
  to bottom.
- **G4 check** — the structural gate: `check` exits 0.
- **G5 answers** — the verdict: every question answered and no point unsettled.

Rule: G0–G2 — a parent that is not PASS never yields a child that is PASS.
Rule: G5 asks only a round G4 accepted; G4 accepts only a round G2 filled.
Exception: G4 PASS is not G3 PASS; G4 is structural only.
Prohibition: never resolve a G4 failure by moving a question into 「先に決めておいたこと」.

## Re-entry (Done is not the end of the conversation)

Done means: no point is open for the material read so far. It does not close the
conversation, and it does not close this command.

A viewpoint the human brings after Done is a point like any other. On any human message
after Done, run the same settle test over what it raised — the three lines, in writing —
and act on the result:

- the three lines can be written → settle the point, with its override condition; update the
  documents; re-issue the report.
- the three lines cannot be written → record the point with this command's own point-writer,
  open a round on the point, and re-run the gate and the verdict.

Re-entry is this command's own loop, not another command: the human is never asked to run
anything again. A revision never renumbers a question (W7) and never overwrites an answer;
an answered axis is never re-asked (W6). A revision round asks a new axis built from the
point it raised and the still-open points only.

A command that carries this block carries a writer for a point the human brings. Which
writer it is belongs to that command's own section, not to this one.
<!-- question-gate:end -->

## Usage

```
/grill-me-for-rfc [<material file|directory>...]
```
- material: a file, or a directory whose every file is material
- zero or more: a run with no material works from the prior artifacts already in the
  package directory and from the conversation alone
- the RFC is not an argument. The run writes `./RFC.md`, always

Invocation:
```bash
/grill-me-for-rfc <material-file-or-dir> <material-file-or-dir> ...
```

---

## Mechanical Variable Binding from Arguments

| Variable | Derivation | Value |
|----------|------------|-------|
| `$MATERIAL_PATHS` | the arguments, in order | the files/directories this run reads |
| `$RFC_DIR` | the invocation directory | dir holding RFC artifacts (Status.json, DesignTree.json, CheckList.md, etc.) |
| `$RFC_PATH` | `"$RFC_DIR/RFC.md"` | the canonical RFC this run writes |

`$ARGUMENTS` is deliberately unquoted, as in `/drill-rfc-down`: the shell passes each
space-separated argument as argv, and init.js resolves each one. No argument means no
material — never the current directory.

invariant: once `init.js` runs, `$MATERIAL_PATHS` persist in `Status.json` — only `$RFC_DIR` needs tracking thereafter.

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
node .claude/scripts/grill-me-for-rfc/init.js "$RFC_DIR" $ARGUMENTS
```
generates in `$RFC_DIR`: `CheckList.md` (populated at STEP 4), `DesignTree.json` (empty), `Status.json` (state: GRILLING), and records the material list and the fixed RFC path in `Status.json`. A material path that does not exist is reported and the run stops before writing anything.

ask; stop — Resume mode: `Status.json` exists → ask the user: "Resume from where we left off?" (the RFC may or may not exist yet — first written at STEP 5).
ask; stop — Overwrite mode: `$RFC_PATH` exists but `Status.json` doesn't → ask the user to confirm overwrite. approved → delete the old RFC, re-run `init.js`.

Resume mode carrying material: arguments that add paths to the session are a re-entry round, not a fresh read. `init.js` records the added paths beside the ones already held — in the order given, each once — and reports them in `addedMaterials`; the material list is never replaced, and an argument already recorded changes nothing. `list-files.js` below walks the whole recorded list, so the new material reaches the reading step with no second command to run.

Guard — before any question is drafted and before anything is written, confirm the canon still stands alone:

```bash
node .claude/scripts/grill-me-for-rfc/canon-state.js "$RFC_DIR"
```

exit 1 → stop. The RFC has already been derived into a graph, a directory tree or tickets, and those were computed against the RFC as it stands: rewriting it here would leave them carrying the old design with nothing to detect the drift. Report the artifact the guard named and point the user at `/drill-rfc-down`, the command that evolves a materialised canon — it re-runs this same grill over the delta and carries it into the derived artifacts. Write no RFC in this run.

```bash
node .claude/scripts/grill-me-for-rfc/list-files.js "$RFC_DIR"
```
flat JSON array of every file beneath every material the run was given, in the order it was given them. An empty array means the run has no material. read all, internalize as research material.

**Before any question is drafted, read what this package already holds.**

```bash
node .claude/scripts/grill-me-for-rfc/settle-run.js "$RFC_DIR" prior
```

Reads `RFC.md` (or `RFC-<SLUG>.md`), `RFC-SEED.md`, `INFO-RFC-SEED.md` and
`EXPLAIN-RFC-SEED.md` in `$RFC_DIR`, and the same in each neighbour directory the
stage-one manifest names, passed as further arguments, records the scan in `DesignTree.json`, and prints what those documents
decide. What they decide is settled by the ladder in STEP 2 and is never asked. A
package where they decide everything opens no question at all, and that is a
completed run rather than a failure.

---

### STEP 1: DesignTree — Initial Node Generation

after reading all research material, before the first grill question: generate initial design-tree nodes from research content, write them.
```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '{"id":"...","title":"...","status":"open","questions":[],"children":[]}'
```

---

### STEP 2: Grill Session

## ★ First-Class Rules (MUST be followed without exception)

The rule a question obeys is stated once, above, in **Core Rule**, **The question
gate**, **The ladder**, **The question block, in order**, **The loop** and **Gates**.
It is not restated here. What this section adds is the mechanics of this command.

```bash
node .claude/scripts/grill-me-for-rfc/settle-run.js "$RFC_DIR" next <n>
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" bind <n> '<block_json>'
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" settle <node_id> '<settlement_json>'
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" answer <n> '<the human reply>'
```

1. run the ladder — **Q0**, **Q0'**, **Q1**, **Q2**, **Q3** — over every node before
   drafting any question; the first matching rung wins. A node the records ground is
   settled with `settle`, which refuses a settlement that carries no ground or no
   override.
2. `next <n>` opens at most three numbered blocks. Fill each with `bind`, which
   refuses a block binding fewer than two nodes: a single-point question is a
   fact-question wearing a question's clothes.
3. the block's seven lines are 状況 / 私の結論 / すでに決まっていること /
   残っている選択 / 選択肢 / 推奨 / 推奨が覆る条件, in that order.
4. every block carries a settle trace naming the records that were read and why none
   of them was decisive. `check` refuses a block whose trace is empty, and refuses a
   block whose trace names none of the records the scan found.
5. no RFC content during the grill session — questions and answers only.
6. after every user answer: record it with `answer`, then settle with `settle` the
   nodes that answer entails, or leave them bound and say what the answer failed to
   entail. An answer that is not a letter is not an answer — and what it raised is
   refined into a node rather than discarded.

The closed answer vocabulary is unchanged: user answers ONLY Yes/No or A/B/C. AI must
NEVER ask for free-form answers (if the user volunteers one anyway, AI may accept it).

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
write the document to `$RFC_PATH` — `$RFC_DIR/RFC.md`, the one name this command gives the RFC.

Take a copy of the document being replaced before writing it:

```bash
node .claude/scripts/grill-me-for-rfc/backup-rfc.js "$RFC_PATH"
```

The grill writes the whole RFC from the settled tree. The tree holds the decisions; it does not hold the prose or the code examples that carry them, and nothing else in this command keeps a copy. The copy taken here is what makes an unfaithful rewrite diffable by the human or by the next run instead of silent. It is not a gate: the write still replaces the file, and the copy is a second file beside it.

## RFC Hard Constraints (MUST be followed without exception)

- zero occurrences of TBD, TODO, "handle in a later version", stub, or scope delegation — in any form
- a single RFC document stands alone as a complete design fully covering the entire Design Tree
- every design decision accompanied by a code example
- IETF-style structure: Abstract / Motivation / Design / Implementation / Appendix
- the document carries a **seed divergence ledger** appendix (STEP 5b)
- the document carries a **defect ledger** appendix (STEP 7b)
- every type, trait, constant and operation the document names is **defined in this document
  or named with the record that defines it** — a name used and defined nowhere is a deficiency
- every cross-package edge states its **counterpart**: the artifact on the other side and the
  type or contract that crosses it

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state WRITING
```

---

### STEP 5b: Seed divergence ledger

The RFC carries an appendix titled **Seed divergence ledger**. Its job is the precedence
question a reader otherwise has to guess at: this document is canonical, and the three
stage-1 artifacts beside it are inputs.

It contains, in this order:

1. a **precedence statement** — `RFC.md` is canonical; `RFC-SEED.md`, `INFO-RFC-SEED.md` and
   `EXPLAIN-RFC-SEED.md` are the stage-1 inputs this run read, not authorities; where a
   reader finds one of them disagreeing, this ledger is the index;
2. the **reason the seed is not edited** — its header marks the reference paths, the
   implementation order and the contract ids as machine-injected and states that "a
   disagreement with the manifests is a gate failure", and `INFO-RFC-SEED.md` records the
   seed's sha256, so a rewrite breaks both the gate and the chain;
3. a **table**, one row per departure:
   `Artifact | Location | What the artifact says | What this document decides | Ground`;
4. a **testable form** — a `DIVERGENCES` const and a test asserting every row names one of
   the three stage-1 artifacts and a resolvable location, so a departure cannot quietly
   disappear.

A package with **no** departure still carries the appendix, and it records the **checks**
that establish that. "No departure" is a result, not an omission, and it must be auditable
rather than trusted.

gate: `node .claude/scripts/grill-me-for-rfc/check-divergence-ledger.js "$RFC_DIR"`

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
node .claude/scripts/grill-me-for-rfc/insert-io-boundary-template.js "$RFC_PATH"
```
heal-loop: AI reads each `<!-- [::IO-INFO-STUB::] ... -->` marker, follows its instruction, generates content from the existing RFC, replaces the marker. repeat until none remain.
```bash
node .claude/scripts/grill-me-for-rfc/check-io-stubs.js "$RFC_PATH"
if [ $? -ne 0 ]; then
  echo "ERROR: Remaining [::IO-INFO-STUB::] markers found. AI content completion is incomplete."
  exit 1
fi
```

---

### STEP 7b: Cross-directory defect resolution

Every defect this run found is resolved, including the ones no fix inside this directory
can reach. A defect is a contradiction, a conflict or a deficiency — a place where the
design cannot be implemented. The inspection covers the workspace: the neighbours'
designs, not only their appendices.

1. Name each defect's **class** and its **target**: the directory whose artifact is wrong.
2. Guard the edit surface before touching it.
   ```bash
   node .claude/scripts/grill-me-for-rfc/guard-edit-surface.js "<TARGET_PATH>"
   ```
   exit 1 → the path is an input and MUST NOT be edited. Resolve the defect in the owning
   RFC's output instead, and never in the seed.
3. Correct the target's `RFC.md`, and settle a DesignTree node there so the fix passes that
   package's own gate. Regenerate its `CheckList.md`, and return its `Status.json` to DONE.
4. Correct every other artifact that recorded the defect as live — the recording package's
   RFC and checklist included. A resolution that exists only in the target is a defect in
   the record that still asserts it.
5. Write the **defect ledger** appendix (format below) and return here to re-run STEP 6 →
   STEP 8: the cross-directory fix invalidates every record that read the old text.

**Defect ledger format.** The appendix title ends with `Cross-directory defect ledger`.
One table, six columns, in this order:

| Defect | Class | Target | Disposition | Evidence | Ground |
|---|---|---|---|---|---|

- `Class` — `contradiction`, `conflict` or `deficiency`. No other value.
- `Target` — repository-relative path of the artifact that must change; it ends in `RFC.md`.
- `Disposition` — `resolved-here`, `resolved-other` or `withdrawn`. `open` and `unresolved`
  are not members of this vocabulary.
- `Evidence` — `resolved-other`: `<target> @ YYYY-MM-DD`; `resolved-here`: `§<section>`;
  `withdrawn`: the artifacts the withdrawal was recorded in.
- `Ground` — the record that makes the disposition right. Never empty.

A package with **no** defect still carries the appendix, and it carries a **composition
check** subsection listing the neighbours whose designs were read and what was checked —
types crossing each edge, ordering claims, contract counterparts. "No defect" is a result,
not an omission.

gate: `node .claude/scripts/grill-me-for-rfc/defect-report.js <workspace-root> --gate`

---

### STEP 8: RFC Completion Declaration

gate (all 5 required): all DesignTree nodes `resolved` (`open-count`=0) AND all CheckList items ✅ AND zero TBD/TODO/stub/delegation in the RFC body AND the seed divergence ledger and the defect ledger are present and well formed AND `defect-report.js --gate` exits 0.
```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state DONE
```

---

### STEP 8a: Re-entry after DONE

DONE means no node is open for the material read so far. It is not the end of the
conversation: a viewpoint the human brings afterwards is a node like any other, and this
command handles it — the human is never asked to run anything again.

1. Run the settle test in writing — 決定 / 根拠 / 覆す条件. A point the records ground is
   settled with `update-tree.js settle`, and STEP 6, STEP 7 and STEP 8 re-run.
2. A point they do not ground is recorded, not argued with:
   ```bash
   node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '{"id":"...","title":"...","status":"open","questions":[],"children":[]}'
   ```
   Then reopen the grill and re-run STEP 2 to STEP 8:
   ```bash
   node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
   node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" inc-loop
   ```
3. A re-entry round follows the same rules as any round: it asks a new axis built from the
   added node and the still-open nodes only (W6), it never renumbers a question (W7), and it
   never overwrites an answer already written (W8). `loop-count > 3` is reported as STEP 7 says.
4. A defect whose target is another package re-enters **that** package, not this one:
   `guard-edit-surface.js` the target, correct its `RFC.md`, settle a node there, then
   re-run that package's STEP 6 → STEP 8 before returning here. A cross-directory fix that
   leaves the target's gates unrun is not a fix.

Re-entry is this command's own loop. STEP 5's RFC prose is written once the grill closes
again, so the document never carries a decision the re-entry round has not settled.

---

## Reverse mode (G1 to G5)
**Rotation gate** — this section runs only when `reverse-seed-index` holds. A forward seed carries no `reverse_index` in its machine-injected section 1, and `reverseIndexOf` returns null for it, so this section cannot fire in one.

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
