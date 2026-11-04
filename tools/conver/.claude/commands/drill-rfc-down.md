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

Five inferences this gate forbids. Each has produced a wrong question.

| inference | refusal, and why it is wrong |
|---|---|
| 「a flag named this point, so it is the human's」 | `flag-is-not-a-ground` — a flag is not a ground and is not weight. |
| 「a doubt about this record means there is no ground」 | `foreign-package-doubt` — a doubt filed under another package is not this package's point. Establish whose point it is before treating it as material. |
| 「the doubt says only the author can decide, so it must be asked」 | `author-only-is-material-not-exemption` — that sentence is material *for* the test above, not an exemption from it. Write the three lines. |
| 「the point is weighty, so it is the human's」 | `weight-alone-does-not-bind` — weight alone does not bind a point to a question. The binding condition is weighty **and** no ground. A ground the AI has not looked for is not an absent ground. |
| 「a read record was named, so this point may be asked」 | `read-record-not-shown-silent` — naming a record is not showing it silent. The trace must state, for each record it names, the fact that leaves the point open. |

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

The failed settle test is the only thing that makes a point a question: a point whose
three lines can be written is settled, and only a point whose 根拠 cannot be written is
asked. Lines 2 and 6 are what the human is shown — the AI's own answer in words, and
the letter it recommends — and neither is a condition on asking, nor a ground: a
recommendation can be written for any point, so it can decide none of them. If line 4
cannot be written narrowly, stop: go back to the question gate. A name used before the
line that defines it is a defect at that line; fix the line, never append a gloss later.

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

## Arguments

In:
- args: zero or more space-separated material paths.
- material: file, or directory whose every file is material.
- **zero args is a complete invocation**: the resolver discovers `README.md` (the
  `RESIDUE`) and the sequences view (`SEQUENCES.md`) once, and branches on their presence.
  Neither is required.
- explicit arguments are **appended** to the discovered list, deduplicated by resolved
  path, and never replace a discovered entry.
- run from project root containing `.claude`; resolve cwd `Tickets.json` and `.claude/scripts/` (`$DRILL_DIR`).

Invocation:
```bash
/drill-rfc-down [<material-file-or-dir> ...]
```

## Script List

| Script | Contract |
|---|---|
| `preflight.cjs <material...>` | resolve/validate material + RFC/GRAPH/Dirs-Tree (README optional); emit `[VARIABLES]` |
| `resolve-material.js` | discover README/SEQUENCES view, append arguments, record the material list |
| `drill-report.js` | write `DRILL-REPORT.json/.md`; the only source of `COMPLETE` |
| `session-init.js <rfc> [--material-paths=<json>]` | create/continue `$SESSION_DIR`; Status/DesignTree/CheckList + material record |
| `session-status.js <session>` | phase + unresolved-node count |
| `update-status.js <session> set-step\|set-state\|inc-loop\|show` | state transition + English `nextAction` |
| `rfc-evolution.js capture\|verify\|check-capture\|clean <rfc>` | baseline (`--if-absent`); generated-ledger-aware append-only/delta/contradiction verification (`--allow-empty`); concurrent-change check; clean snapshot |
| `verify-source-identity.js <rfc-dir>` | drill entry for the shared source identity gate |
| `check-formula-coverage.js <rfc-dir>` | drill entry for the shared formula coverage gate |
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
- resolve: materials, cwd `Tickets.json`, `metadata.resolvedPaths` RFC/GRAPH/Dirs-Tree.
- **README.md is optional**: present → read its `RESIDUE`; absent → `README_PRESENT=false` and
  the run proceeds. The sequences view is optional in the same way.
- RFC/GRAPH/Dirs-Tree must exist. `WORKSPACE_ROOT` comes from the nearest `WORKSPACIFY-TREE-MANIFEST.json`.
- Tickets missing → `BLOCKED_PREREQUISITE` + `TICKETS_MISSING_ROUTE_SPLIT_TO_TICKETS`; Action: `/split-to-tickets`; stop.
- target mismatch → `PACKAGE_TARGET_MISMATCH`; Action: run from the package or pass `--package`; stop.
- other missing → producer command from the error; stop.
- fail → report `[ERROR] Cause / Action / Verify / Route`; stop.
- pass → list resolved paths in Markdown, with `README_PRESENT`, `SEQUENCES_PRESENT`,
  `MATERIAL_PATHS` and `MATERIAL_ADDED`; Step 1.

`$ARGUMENTS` is deliberately unquoted: shell passes each space-separated arg as argv; script splits/drops empty tokens; no args → no materials, never cwd.

```bash
node "$CLAUDE_DIR/scripts/drill-rfc-down/preflight.cjs" $ARGUMENTS || exit 1
```

### Step 1: grill

Role: understand all material, README RESIDUE, prior conversation; decide evolution by grill; append settled complete evolution to RFC.

Artifacts:
- bind `$RFC_PATH`, `$RFC_DIR`, `$SESSION_DIR`, `$DRILL_DIR`, `$WORKSPACE_ROOT` from G0 `[VARIABLES]`.
- session-only: Status / DesignTree / CheckList / baseline / delta under `$SESSION_DIR`.
- no touch: existing `$RFC_DIR/Status.json` and equivalent existing session artifacts.

Sequence material — an optional input this run may have. `sequences-material.js` is the tolerant reader: it exits 0 for every input, so it can never stop the drill, and it runs here, after preflight and before `session-init.js`, so it reports before anything else reads a material list.

```bash
node "$DRILL_DIR/sequences-material.js" "$RFC_DIR" --session-dir="$SESSION_DIR"
```

one JSON object: `present`, `source`, `view`, `viewExists`, `materialPaths`, `staleMaterialPaths`, `searched`. The session record is searched first and carries no `materialPaths` of its own, so the answer comes from `$RFC_DIR/Status.json` or from the view's deterministic location — which is why the search has three steps rather than one.

- `present` false → this package has no sequences material. Read no sequences; the drill is exactly the drill it would have been without this input.
- `present` true → read `$RFC_DIR/SEQUENCES.md` as material alongside everything preflight listed, and treat cross-boundary units (`xdir-*`) as work that reaches beyond this package.

The view is deliberately **not** added to the preflight material arguments: preflight refuses a missing file argument and an empty directory argument, so a view that had been deleted would abort the drill — precisely the failure this input must not introduce. Read it by this instruction instead, which cannot fail.

**Source identity gate.**

Prove the seed names the specification on disk before any Step 1 write. Seed hash mismatch, unreadable specification and missing seed identity block; INFO / `*-sequences.json` divergence is `STALE_SECONDARY_RECORD` advisory and proceeds. `--no-record` leaves the package `Status.json` byte-identical.

```bash
node "$DRILL_DIR/verify-source-identity.js" "$RFC_DIR" --workspace="$WORKSPACE_ROOT" --no-record || exit 1
```

Repair: `SPEC_HASH_MISMATCH` / `SEED_IDENTITY_MISSING` → the seed or specification producer; never edit the specification. `STALE_SECONDARY_RECORD` → list the record and continue; follow-up `/explain-seed` or `/educe-sequences`.

#### 1-1. Session Initialization

```bash
node "$DRILL_DIR/session-init.js" "$RFC_PATH" --material-paths="$MATERIAL_PATHS" --readme-present="$README_PRESENT" --sequences-present="$SEQUENCES_PRESENT"
node "$DRILL_DIR/session-status.js" "$SESSION_DIR"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-1
```

Create session Status/DesignTree/CheckList and record the resolved material list; an
existing session continues and keeps its recorded list.

#### 1-2. Capture Baseline

```bash
node "$DRILL_DIR/rfc-evolution.js" capture "$RFC_PATH" --if-absent
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-2
```

Capture pre-edit RFC at `$SESSION_DIR/baseline.json`.

#### 1-3. Full Understanding of Inputs

Read all material, README RESIDUE, prior user conversation; understand complete scope; present evolution scope to user.

**Before any question is drafted, read what this package already holds.**

```bash
node "$DRILL_DIR/settle-run.js" "$SESSION_DIR" prior "$RFC_DIR"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-3
```

Reads `RFC.md` (or `RFC-<SLUG>.md`), `RFC-SEED.md`, `INFO-RFC-SEED.md` and
`EXPLAIN-RFC-SEED.md` in the package directory — and in any neighbour directory the
stage-one manifest names, passed as further arguments — records the scan in the session `DesignTree.json`, and prints what those
documents decide. What they decide is settled by the ladder in 1-5 and is never asked.
A package where they decide everything opens no question at all, and the session
completes with nothing put to the human.

#### 1-3b. Mode

- FRESH: new settled evolution → 1-4…1-12, append RFC prose.
- MIGRATION: owned formulas, no ledger → skip 1-4…1-10 and RFC prose; author the generated ledger at 1-8.
- REPAIR: no new evolution, repairable formula finding → skip 1-4…1-10; repair the generated ledger `rfcDigest` / sidecar.
- VERIFY_ONLY: no new evolution, every drill gate passes; zero-owned with no ledger also selects this → skip 1-4…1-10 and 1-8; read-only Steps 2-5; report `NO_CHANGES`.

Repairable finding → execute its `Action`, re-run its `Verify`, repeat until exit 0. No progress → `REPAIR_NO_PROGRESS`.

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

The rule a question obeys is stated once, above, in **Core Rule**, **The question
gate**, **The ladder**, **The question block, in order**, **The loop** and **Gates**.
It is not restated here. What this step adds is the mechanics of this command.

The cycle this session runs is 質問 → 回答 → 追記 → CheckList 照合 → 再 grill 判定, in
that order: this step performs the 質問 and 回答 halves, 1-8 performs the 追記, 1-7 and
1-9 the CheckList 照合, and 1-10 the 再 grill 判定.

1. run the ladder — **Q0**, **Q0'**, **Q1**, **Q2**, **Q3** — over every node before
   drafting any question; the first matching rung wins. A node the records ground is
   settled with `settle`, which refuses a settlement carrying no ground or no override.
2. `next <n>` opens at most three numbered blocks. Fill each with `bind`, which refuses
   a block binding fewer than two nodes.
3. the block's seven lines are 状況 / 私の結論 / すでに決まっていること /
   残っている選択 / 選択肢 / 推奨 / 推奨が覆る条件, in that order.
4. every block carries a settle trace: a list of entries, each names a record the scan
   returned and the fact that leaves the point open. `check` refuses a block whose trace
   is empty, refuses a block whose trace names none of the records the scan found, and
   refuses an entry that names a read record without saying what leaves its point open
   (`read-record-not-shown-silent`) — naming a record is not showing it silent, and a
   point the records leave open is the only point there is to ask about.
5. before display: run `validate-question-format.js` until `valid: true`; never skip.
6. answer received → record it with `answer`, then settle the nodes it entails with
   `settle`, or leave them bound and say what the answer failed to entail. An answer
   carrying no letter is not an answer — and what it raised is refined into a node
   rather than discarded.

User answer: Yes/No or A/B/C only; never request free-form answer; unsolicited free
text allowed.

Grill contract:
- Coarse-grained bundling: 1 question = 3–5 nodes; 1 turn = 5–10 questions.
- Two-pass approach: architecture → details.
- Summarize settled decisions at each turn end.
- answer received → immediately update the node: `node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add '<json>'` — the standalone `add` for a new top-level node, then `resolve` / `batch-resolve`; `add-child` / `refine` / `delete` as required.
- Do not write the RFC while grilling.

```bash
node "$DRILL_DIR/validate-question-format.js" "<question text>"
node "$DRILL_DIR/settle-run.js" "$SESSION_DIR" next <n>
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" bind <n> '<block_json>'
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" settle "<node_id>" '<settlement_json>'
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" answer <n> "<the human reply>"
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
ask the user; stop: simultaneously propose grill end and ask to start RFC-requirements CheckList generation. Approval → 1-7.

```bash
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" open-count
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state CHECKLIST_PENDING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-6
```

#### 1-7. CheckList Generation & Approval

Generate CheckList; the AI visually inspects all items; append notes for ambiguous nodes and project-specific constraints; present to user.
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
- insert the evolution before the generated `## Formula ledger`; the ledger stays the last generated appendix so `rfcDigest` covers the new prose.
- before appending: `RFC_CHANGED_SINCE_CAPTURE` → re-capture and re-apply; never overwrite.
- resume: read `session-status.js`; if 1-8 already appended, skip check-capture and the append; continue at the recorded step.

```bash
node "$DRILL_DIR/rfc-evolution.js" check-capture "$RFC_PATH"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state WRITING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-8
```

#### 1-8b. Formula ledger and sidecar

Generated appendix only. Source: spec lines the seed's `source_segments` claim, resolved through `WORKSPACIFY-TREE-MANIFEST.json`; four delimiters are one identity. Write `$RFC_DIR/RFC.md` `## Formula ledger` and `$RFC_DIR/RFC-FORMULAS.json` with `specDigest`, `rfcDigest`, theory, class, implementation anchor, design how and tests for every owned formula. No owned formula → no ledger or sidecar.

- one-time when absent; otherwise verify rows and update `rfcDigest` only.
- ledger row and sidecar carry the same theory, class, symbols, design and tests; `specPath` and `specLocation` are the extracted values.
- ledger is the only RFC region regenerated; prose stays append-only.
- `SEGMENT_UNRESOLVED`, `SPEC_PATH_MISMATCH`, `SPEC_LOCATION_MISMATCH`, `DUPLICATE_LEDGER_HEADING`, missing field → act on the finding; re-run.

```bash
node "$DRILL_DIR/check-formula-coverage.js" "$RFC_DIR" --workspace="$WORKSPACE_ROOT"
```

#### 1-9. CheckList Verification

Proceed after 1-7 approval; no additional approval gate. Verify every CheckList item; repair until all `✅`.
- detect `TBD`, `TODO`, `will be addressed in a later version` → warn; incomplete; do not declare completion until fully written.

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
node "$DRILL_DIR/rfc-evolution.js" verify "$RFC_PATH" --allow-empty
```

Machine: append-only, delta extraction, well-formedness, contradiction candidates; write `$SESSION_DIR/delta.json`.
- append-only compares RFC prose; the generated Formula ledger is excluded; a non-ledger line change still fails.
- exit 1 → back to 1-8.
- formula coverage is blocking: `check-formula-coverage.js` exit 1 → repair the finding and re-run.

AI engineering expert judgment; inspect result, `delta.json`, resolved DesignTree, scope:
- Danger: breaks existing design/implementation/contracts?
- Omission: every resolved node reflected?
- Contradiction: existing RFC/GRAPH/Dirs-Tree/Tickets contradiction?
- Deficiency: each decision code example, I/O boundary info, sufficient detail?

Heal-loop quality:
- any insufficient → return to 1-8 without compromise; fix; repeat 1-8 → 1-11.
- all pass → next.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-11
```

#### 1-12. Completion Declaration

Done iff: open-count 0; CheckList all `✅`; RFC has no TBD/TODO/stub; G1 PASS; `check-formula-coverage.js` exit 0 (or zero owned).
This is **design complete**, not complete: `COMPLETE` is declared only by the Step 5
`DRILL-REPORT.json`, after every P1 gate exits 0.

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state DESIGN_DONE
node "$DRILL_DIR/check-all-schema.js" "$SESSION_DIR"
node "$DRILL_DIR/rfc-evolution.js" clean "$RFC_PATH"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-12
```

out: `$SESSION_DIR/delta.json` → Step 2.

#### 1-13. Re-entry after Completion

Completion is a state of the material read so far, not the end of the conversation. A
viewpoint the human brings afterwards re-enters this command's own grill; the human is never
asked to run anything again.

1. Run the settle test in writing — 決定 / 根拠 / 覆す条件. A point the records ground is
   settled with the DesignTree `settle` operation, and Steps 2 → 3 → 4 → 5 re-run.
2. A point they do not ground is added as a node:
   ```bash
   node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add '{"id":"...","title":"...","status":"open","questions":[],"children":[]}'
   node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-5
   ```
   and 1-5 to 1-12 re-run over it, followed by Steps 2 → 3 → 4 → 5.
3. The RFC stays append-only: the re-entry appends the settled evolution, it never rewrites
   what a previous cycle wrote. Step 5's cross-artifact verification re-runs because the
   artefacts changed, and a high finding sends the run back to Step 2 as it always does.

---

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

- `--approve`: does not re-run the analyzer; validates/promotes the exact AI-designed staging graph.
- formula delta: the RFC's `RFC-FORMULAS.json` is the source. No sidecar → skip this block. Attach the delta to the staging graph before approve:
  ```bash
  node "$DRILL_DIR/../rfc-graph/attach-formula-ids.js" --graph="$GRAPH_PATH.staging.json" --sidecar="$RFC_DIR/RFC-FORMULAS.json" --rfc="$RFC_PATH" --write
  ```
  The command touches `formulaIds` and `formulaDigest` only; unrelated nodes and edges stay byte-identical.
  `MISSING_NODE` / `AMBIGUOUS_NODE` / `STALE_SIDECAR` → repair the generated ledger RFC location; re-run; never hand-edit the graph or sidecar.
- verifier (`verify.js`): uncovered headings, isolated nodes, headingRefs resolvability, uniqueness.
- Destructive change: deletion forbidden by default; explicit AI approval only; never hand-edit the JSON — design it through the loop.
- only graph writes: staging `crud.js`; driver promote; `attach-formula-ids.js` for formulaIds.

### Step 3: boundify

Goal: evolve existing `*-Dirs-Tree.json` and real `$RFC_DIR/src` from Step-1 delta + Step-2 `$GRAPH_PATH.delta.json`. AI designs; scripts supply candidates, safe edits, validation.

Evolution loop Dirs-Tree:
1. stage: copy real → `<dirsTree>.staging.json`; write `<dirsTree>.candidates.json` + four-axis advisory; real Dirs-Tree/src unchanged.
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

- `--approve`: does not re-run the analyzer; validates/promotes the exact AI-designed staging Dirs-Tree.
- formula delta: `distribution.formulas` and the generated `formulas:` header line follow the graph's `formulaIds`. After the staging graph carries them, merge the index and mapped entries:
  ```bash
  node "$DRILL_DIR/../rfc-graph/attach-formula-ids.js" --graph="$GRAPH_PATH" --sidecar="$RFC_DIR/RFC-FORMULAS.json" --rfc="$RFC_PATH" --dirs-tree="$DIRS_TREE_PATH.staging.json" --write
  ```
  Then re-run `verify-formula-file-coverage.js` on the staging pair. A missing index entry, file or symbol is a high finding and returns to Step 2. Zero owned and no sidecar → skip this block; zero owned with a sidecar → run it, because the sidecar proves the artifacts.
- validator (`validate-dirs-tree-schema`): GRAPH/Dirs-Tree consistency, `mappedNodeIds` resolution, dependency cycles.
- PASS effects: delta-only `newFiles` via `generate-dir-templates-delta.js`, Initial Design Artifact header; existing mapped-file headers/cross-references via `refresh-file-headers.js` when graph delta given; never implementation body.
- delta generator inapplicable → AI may hand-create file.
- Destructive change: file/directory deletion or move forbidden by default; explicit AI approval: `remove-node --force` only; never hand-edit the JSON.
- only Dirs-Tree writes: staging `dirs-tree-crud.js`; driver promote.

### Step 4: split

Goal: evolve existing `Tickets.json` from `$DIRS_TREE_PATH.delta.json` through ticket edits/additions. AI designs; scripts supply candidates, safe edits, validation.

Evolution loop Tickets:
1. stage: copy real → `<tickets>.staging.json`; write `<tickets>.candidates.json` + four-axis advisory; real Tickets unchanged.
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

- `--approve`: does not re-run the analyzer; validates/promotes the exact AI-designed staging Tickets.
- formula delta: after the ticket edits, project the RFC formulas onto the staging Tickets before approve. No sidecar → skip this block:
  ```bash
  node "$DRILL_DIR/../tickets/merge-formulas-to-tickets.js" --tickets="$TICKETS_PATH.staging.json" --dirs-tree="$DIRS_TREE_PATH" --sidecar="$RFC_DIR/RFC-FORMULAS.json" --spec="$SPEC_PATH" --tree-manifest="$WORKSPACE_ROOT/WORKSPACIFY-TREE-MANIFEST.json" --write
  ```
  The merge writes `formulaObligations` only; statuses, scope and contracts stay as the staging edits left them. A missing ticket, duplicate implementer or `RFC.md` origin is a high finding and blocks approve.
  - `FORMULA_NO_TICKET` → add one staging ticket or edit one existing staging ticket; re-run.
  - `FORMULA_DUPLICATE_TICKET` → narrow nodeIds / default_files on staging; re-run.
  - `FORMULA_OBLIGATION_ON_COMPLETED_TICKET` → advisory; status unchanged; report `/review-ticket` or `/plan-ticket`.
- validator (`validate-tickets`): title/round/metadata/phases/ticket-status/phaseId consistency.
- never silently overwrite status.
- Destructive change: ticket deletion forbidden by default; explicit AI approval only; never hand-edit the JSON.
- round `R<N>` / `phaseId`: existing phasify conventions.
- only ticket writes: staging add/update tools; driver promote.

### Step 5: verify

G5 cross-artifact consistency; canonical RFC / GRAPH / Dirs-Tree / src / Tickets; zero contradiction.

```bash
node "$DRILL_DIR/verify-step.js" --rfc="$RFC_PATH" --graph="$GRAPH_PATH" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --tickets="$TICKETS_PATH" --session-dir="$SESSION_DIR" --workspace="$WORKSPACE_ROOT"
```

| Check | Severity |
|---|---|
| RFC headings ↔ GRAPH headingRefs: every heading covered | high |
| GRAPH ↔ Dirs-Tree `mappedNodeIds`: every non-Prose node mapped | high |
| Dirs-Tree ↔ src: planned files / src extras | high / low |
| GRAPH ↔ Tickets `nodeIds`: every non-Prose node ticketed | high |
| dangling Dirs-Tree/Tickets references → extant GRAPH target | high |
| formula obligation set/digest differs between RFC sidecar, GRAPH and Tickets | high |
| view unit ↔ distribution ledger ↔ GRAPH ↔ implementation header ↔ Tickets | high |
| edge contracts ↔ connecting Tickets contracts; orphan-free | high |

**Two scopes.** P1 is per package and blocking: `verify-consistencies`, the formula coverage
gate and `verifyFormulaChain`. P2 is workspace residue (`check-obligation-coverage`,
`check-distribution-completeness`, `verify-api-consistency`); it is recorded in
`DRILL-REPORT.json.p2` and never blocks this package, so one package can evolve while a
neighbour is incomplete. A package with no sequences view has no unit chain to check; that is
vacuous, not a failure. The API gate reads the Rust fences of every package RFC and reports a
cross-package symbol that is undefined, duplicated, wrongly called or used with the wrong
generic arity; an unparsed construct is advisory.

- high finding → exit 1; back to Step 2; repair Steps 2 → 3 → 4; re-run G5 until exit 0.
- low/cosmetic findings only → PASS.
- verifier: deterministic, read-only, no artifact rewrite.
- formula check uses the exported `verifyFormulaChain` with the specification bytes; the CLI smooth receipt and unit-set layer are not run.
- every finding carries `Action` and `Verify`; repair and re-run until zero. No progress → `REPAIR_NO_PROGRESS`.
- terminal: `COMPLETE` (all drill gates 0, advisories listed), `BLOCKED_PREREQUISITE` (input producer named), `REPAIR_NO_PROGRESS` (action did not clear). Workspace S8 is a rollout report, not a drill gate.
- report `$SESSION_DIR/DRILL-REPORT.json` (all findings) and `.md` (capped, `...and N more`); only the report state declares COMPLETE.

## Reverse rotation only — staleness as an input to this drill

**Rotation gate** — this section runs only when `claim-ledger` holds. The forward rotation writes no `CLAIM-LEDGER.json`, and `staleness.mjs` takes it as a required argument, so this section cannot fire in one. The forward steps above are unchanged and run the same scripts they always ran.

A record is only as current as the artefacts it was read from. When a dependency, a configuration, a schema or an external contract moves on, the record keeps its shape and quietly stops describing the code (ABOUT-REVERSE 7.6 F13): nothing throws and nothing turns red, so the next reader treats a stale claim as a current one. Propagation is the signal that was missing, and a re-examination condition is exactly the kind of question this command already asks.

1. **Read the recorded hashes, then compare.** `staleness.mjs` reads `forward_refs.ref_hashes` from `CLAIM-LEDGER.json`, hashes each named input as it stands now, and marks every claim whose recorded hash differs. The authority for the comparison sits in the reverse sidecar, so no forward artefact gains a field (ABOUT-REVERSE 6.12.2, "Option 2.5-refined").
2. **A comparison that could not be made is reported, never assumed unchanged.** An input that cannot be hashed and a recorded hash that is not a hash are both reported by name: a claim that stopped being checked must not read like one that was checked and found current.
3. **Emit, then pass as material.** The emitted document is an ordinary material argument, the third input type this command already accepts; nothing about the input contract changes.
4. **Staleness never cancels `COMPLETE`.** The two are independent axes: `COMPLETE` is a value the forward rotation reads, staleness is a reverse-rotation concept. A stale claim is a question for the grill, not a completion verdict, and no reader of `COMPLETE` is changed by it. Conflating them would let a reverse-only signal alter forward behaviour, which the phase forbids.
5. **A claim with no recorded `ref_hashes` is not stale.** A normal branch rather than an error; reporting it would drown the real signal.
6. **A run that found nothing stale says so in words.** The material states that no claim is stale rather than emitting an empty document, which reads as a failure where nothing failed.

```bash
# Mark the claims whose recorded reference hashes no longer match, and emit
# their re-examination conditions as material. Nothing is written unless --out
# is given, and the measured tree is never written to at all.
node "$CLAUDE_DIR/scripts/workspacify-reverse/lib/staleness.mjs" \
  --claim-ledger="<directory holding CLAIM-LEDGER.json>" \
  --changed=graph="<the GRAPH as it stands now>" \
  --changed=dirs_tree="<the Dirs-Tree as it stands now>" \
  --out="<destination>"

/drill-rfc-down <destination>/STALENESS-REEXAMINATION.md
```

`STALENESS-INDEX.json` is written beside it as the record of what was found. A claim whose `staleness_ref` points here is the one this command's grill must re-examine.

**Forward guarantee.** The forward output of this command is byte-identical to its pre-change form: no required field is added and no existing step is altered. The P22-1 regression gate's command-file digest is run before and after every edit to this file.
