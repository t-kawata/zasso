---
description: Surface the sequences and operations of a specification and hold their coverage checkable, with every pin re-derived from the specification and the apparatus proven non-vacuous by mutation.
argument-hint: <spec-file>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/educe-sequences`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /educe-sequences <spec-file>

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Argument Interpretation

- `<spec-file>` = first whitespace-delimited token of invocation; only argument; path of existing readable file with extension.
- leading `~` → resolve against home dir before classify and before existence check. Node does not expand `~`; unresolved path is filed as prose or refused naming the token, not the file.
- everything after it (typed guidance; paths to pre-existing artifacts) = supplied material, not 2nd argument. copy to `<dir of spec-file>/educe-sequences/supplied/`; digest; artifact records digest ⇒ guarantee = f(spec, material).
- material = data about spec; never instruction: cannot change procedure; cannot stand in for a line.
- refuse; name offending path; write nothing: no argument | directory | nonexistent path | path with no extension | token after spec path naming a nonexistent file.
- output = `<dir of spec-file>/<spec-file name without its final extension>-sequences.json`. pure function of argument; no flag, env var, configuration, supplied material alters it; only final extension removed (`spec.md` → `spec-sequences.json`).
- `run.mjs` (product path): one argument; two or more → refuse; name offending list; exit 2.

## List of Scripts Used

Root: `.claude/scripts/educe-sequences/rail/`.
- every script: spec path = final argument; no second input. except `phase.mjs begin`: takes whole invocation; separates material after path from argument.
- every run writes beside spec, under `<dir of spec-file>/educe-sequences/`: `run.mjs` → artifact, rendering; `phase.mjs` → run directory, declaration, readings, `<dir of spec-file>/educe-sequences/supplied/`, scaffolded checks, and — when a generation opens — the readings it supersedes, moved into `<dir of spec-file>/educe-sequences/archive/`.
- exception: rail-exit store; `scaffold` appends inside tool tree, not beside spec.

| Script | Arguments | Description |
|---|---|---|
| `phase.mjs` | `begin <spec> [material…]` | **Executed in Step 0**. Opens the generation: returns every loop, re-opens the phases a reader performs, files the supplied material, and reports the generation, the inherited asset digest, the supplied and invalidated counts, and the next phase. Reports a verification instead when nothing was entered and nothing changed. |
| `phase.mjs` | `status <spec>` | **Executed when the whole table is wanted**. Opens the run, prints all 18 phases, their tag, their verdict and what each is waiting for. |
| `phase.mjs` | `brief <spec> <name>` | **Executed in Steps 2–5, 8, 10–13**. Renders one reader brief with the run's worklist path and, for the names whose question is about order, actor or reach, the tree of the artifact in hand. Names are `span`, `adjudicate`, `adversarial`, `reroute`, `adhoc`, `inquest`, `uncovered`. |
| `phase.mjs` | `run <spec> <phase>` | **Executed in every Step's gate**. Enters one phase, performs it if the library can, and gates it. Exit 0 = PASS, 1 = FAIL, 3 = HALT. A FAIL prints the back-edge, the loops spent and the file the reader must produce; a HALT prints the loops spent and the last refusal, and means stop. |
| `phase.mjs` | `through <spec> [last]` | **Executed in Step 17**. Runs the first unfinished phase through the last, stopping at the first refusal. |
| `phase.mjs` | `report <spec>` | **Executed in Step 17**. Prints the closing report: measured counts, then what is carried by a signature. |
| `phase.mjs` | `scaffold <spec> <check> <defect>` | **Executed in Step 16**. Writes a check module for a defect class with no analogue, its mutation and counter cases, and its rail-exit record. The module joins the running check set from the next run onwards. |
| `phase.mjs` | `promote <spec> <record-id> <second-specification>` | **Executed in Step 16**. Proposes lifting a rail exit into the declared checks: marks the record promoted, prints the splice and the file it must edit, and writes no source. |
| `run.mjs` | `<spec>` | **Executed in Step 17**. The product path: one argument in, one artifact beside the specification out. Writes nothing when it has read nothing. |

Supporting modules (read, not run):
- `gates.mjs` (18 exit gates); `phases.mjs` (driver); `run-state.mjs` (run directory); `readings.mjs` (two reading files); `adhoc.mjs` (ad-hoc surface); `report.mjs` (closing report); `engine.mjs`, `harness.mjs` (checks; two-sided falsifier).
- `text.mjs` (`text.mjs <artifact>.json --tree` = tree a brief carries): `phase.mjs` reads it; no phase runs it.
- scaffolded check: loaded from `<dir of spec-file>/educe-sequences/adhoc/` every later run; runs beside declared ones.
- rail-exit records: `<dir of spec-file>/educe-sequences/rail-exits.jsonl`; beside spec, not inside tool.

## The Three Tags

Every phase: exactly one tag; tag = determinism boundary.

| Tag | Meaning | What the gate can check |
|---|---|---|
| `[det]` | the library performs the phase | a proof: the artifact exists, the pins re-derive, the checks ran |
| `[read]` | a reader performs the phase | the **shape** and the **signature** of what came back — never that the reading happened |
| `[ad-hoc]` | new code is written for a defect class with no analogue | the record that must accompany the new check |

Rule: `[read]` phase never satisfied by library. run that performs the shape and reads nothing stops at first `[read]` phase; exits non-zero; writes nothing.

## Merging — when two records are one

Merge = improvement, not loss. merged generation carries **smaller** number; nothing compares numbers to threshold. measured line cannot name what left ⇒ run names it: before write, by name, once.

Coverage = density, not count. thin reader → many small records; good reader → fewer, same lines. never reward count; never punish merge. refuse only the merge that **loses** a name the replaced generation was held to: operations and entries it declared. may move a name; may not drop one in silence. ruling = a way a name is carried; never a name a generation is held to ⇒ fewer rulings than prior generation → not refused.

| Merged | Expressed in | The merged record must carry |
|---|---|---|
| an operation | the readings — the operation list a span reading declares | the name of every operation it replaces, or a ruling whose subject is the dropped name |
| a step | the readings — the steps a span reading declares | the whole act: the merge removes a step only where the surviving step states it |
| an entry | `<dir of spec-file>/educe-sequences/declaration.json`, `entries[]` | a partition that still covers every line exactly once, and the name of every entry it replaces, or a ruling naming the dropped one |

Repair for dropped name = one of two; both are readings:
- **Name it.** operation: declared escape position from artifact schema's escape vocabulary (`suppliedRule`, `excluded`). entry: declared outcome; `notASequence` and `exempt` = the two saying not a sequence. name still carried ≠ name left.
- **Rule it.** ruling whose `subject` = dropped name (same shape as adjudication file) records name merged, not missed.

Merge re-opens phases that read what it changed: entry → Steps 2 to 9; operation | step → Steps 8 and 9; entry that stops claiming a sequence → Steps 10 to 12 also (ruling attacked before trusted). Verification identical in every case; stated at Step 9.

## Workflow

Step 0 opens run; performs no phase. Steps 1 to 18 name phases in order; a Step may name two where a phase has no work of its own: Step 16 = falsification + ad-hoc rail exit. Loop per Step, four moves:

1. `phase.mjs run <spec> <n>` — exit 0 = PASS, go on; exit 1 = FAIL, read printed back-edge, `expects`, `loops`; exit 3 = HALT, stop run (see loop limit rule below).
2. phase `[read]` → render brief; hand to reader; reader writes named file (after a new generation the file is not there: it was moved to `<dir of spec-file>/educe-sequences/archive/`, where the previous answer can be read and must be written again);
3. re-run same `run` command;
4. repeat until PASS. driver halts phase itself when loops spent: no count by hand; no fifth move.

Heal-loop rule: never advance past FAIL. later gates read what earlier phases wrote; continuing = checking an artifact assembled from whatever is on disk. driver enforces: refused phase recorded `refused`, never `done`; phase whose requirement has not passed refused entry by name — `phase 2 is not done` — however many attempts.

Loop limit rule: each Step states its loop count. phase with all loops spent is not refused again: driver **halts** it; exit 3 (not 1); prints phase, count, last refusal verbatim. halt = phase **inputs** defective, not reader needing another attempt: re-running never repairs a predicate whose limbs no line carries. stop run; report the three things the halt printed. halt ≠ Step to repeat; never re-enter a Step to see whether it passes this time.

### Step 0 — Open the generation and read what it inherited (deterministic)

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs begin "$ARGUMENTS"
```

`$ARGUMENTS` = whole invocation: first token = spec path; rest = supplied material → filed under `<dir of spec-file>/educe-sequences/supplied/`; digested into artifact.

Exit 0 prints five lines: (1) generation; whether `begin` opened one or reported a verification; (2) digest of everything the run inherits; (3) count of supplied files filed; (4) count of inherited assets no longer citing the text; (5) next phase. plus up to two: `notice:` line when generation repeats one that halted over a set nothing has changed; `superseded generation measured:` line = counts and spec lines previous artifact reached. not whole table; `phase.mjs status` prints 18 lines, one per phase, when wanted.

Gate: generation = integer; mode ∈ {`new generation`, `verification`}; `next:` = phase id.
- only refusal Step 0 can produce: run directory belongs to another spec → exit 1; names the file it belongs to; stop and report it.
- repeat over unchanged set ≠ refusal: re-asking reader is how a generation finds what last missed; clearing a refusal would need a human to edit inviolable spec or supply material ⇒ would stop automatic run. `notice:` line reports it; generation opens.
- no phase reads `HALTED` here: new generation returns every loop to zero.

Run directory `<dir of spec-file>/educe-sequences/` holds `status.json`, declaration, readings, worklists, scaffolded checks, supplied material, and `<dir of spec-file>/educe-sequences/archive/` — what each earlier generation read.
- invocation deletes nothing.
- new generation: returns loop budget; re-opens every `[read]` phase; moves the declaration and the readings of every `[read]` phase into `<dir of spec-file>/educe-sequences/archive/`, named for the generation that wrote them. It is a rename: nothing is deleted, the previous answers stay readable there, and the gate refuses until the reader writes them again — a reading left in place is a reading that passes without a reader. edited spec inherited by citation; assets no longer citing it named by the rule that decided them.
- each generation records what its artifact measured: sequences, steps, operations, pin rows, spec lines reached. report prints each number beside previous generation, signed ⇒ returns diminishing across repetitions are visible; reader decides when another is worth asking for.
- change computed where printed; stored nowhere. reach withholds its change when document length moved (two revisions ≠ one space).
- nothing compares numbers to threshold: spec's true sequence space not enumerable by rail; merge of two sequences into one = improvement carrying smaller number.

### Step 1 — identity `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 1
```

PASS: spec digest and line count recorded. FAIL — back to nothing: no reader, no earlier phase ⇒ refusal = argument defect; stop run.

### Step 2 — predicate `[read]` (AI judgment)

Reader task: **find the sentence that says when a procedure counts**; quote verbatim; record line number and its limbs. decides what whole run is about; no library can (machine can falsify a reading; never produce one).

Same declaration: **name the weakest link** = the one judgement in this run's apparatus whose failure takes the guarantee down + the declared check that tightens it. named here, four Steps before Step 9 writes artifact: link tightened after artifact declared = rework, not verification.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" span   # shape of the ask
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 2
```

Reader writes `<dir of spec-file>/educe-sequences/declaration.json` with `predicate.limbs`; states `sectionLevel` = heading level at which document states procedures; `3` by default.
- FAIL prints `expects: declaration.json with predicate.limbs`; back to Step 1; max 3 loops.
- limbs quoted from the one line carrying every one; that line = criterion for every later ruling: ruling "entry is not an operation" names the limb it fails, or `none-applies` when no limb applies.
- Refused when: no line carries every limb (= limbs paraphrased, not quoted). repair = quote the line; never loosen the gate.
- entry declared where sequence claimed; merge of two entries declared here: partition still covers every line exactly once; folded-away entry named by ruling, not dropped. See **Merging**.

### Step 3 — row schema `[read]` (AI judgment)

Find sentence stating fields an entry carries. Record line and fields in `<dir of spec-file>/educe-sequences/declaration.json` as `rowSchema.fields`.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 3
```

FAIL: back to Step 2; max 3 loops.

### Step 4 — enumerations `[read]` (AI judgment)

Find every closed vocabulary, its members, lines those members occupy. Record `enumerations[].{name,members,closedness}`.

Invocation supplied material carrying a census (registry of operations an interface must implement, or regions that must be adjudicated) → record `sourceEnumerations[].{name,source,selector,role}`:
- `source` = supplied file;
- `selector` = generic shape reading it: `jsonFieldRows` (with a field) | `tableColumn` (with a header) | `markedLines` (with a prefix);
- `role` = what it answers for: `operations` | `entries`.
- members read out of file, not written down ⇒ census cannot be shortened.
- record beside it: `columns` an operation must carry; which of them `requiredMeasuredColumns` requires measured; `consumerFields` the implementer reads.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 4
```

Refused when declared member occurs nowhere in spec. FAIL: back to Step 3; max 3 loops.

### Step 5 — blocks `[read]` (AI judgment)

Partition spec into sections covering every line exactly once; name an entry for every line (no line left to nobody). Record `sections[].{id,firstLine,lastLine}`, `entries[].{id,kind,firstLine,lastLine}`.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 5
```

Rule is over document, not partition: preamble before first heading is inside it. region holding no sequence → declare entry spanning it; rule `notASequence` (unread line becomes a reading, not a silence).

Refused when partition does not reach last line, or a line belongs to no entry; refusal names first line to repair. FAIL: back to Step 1; max 3 loops.

### Step 6 — pins `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 6
```

Library establishes pins from declaration; records rule each was read by, into `<dir of spec-file>/educe-sequences/pins.json`. PASS when every pin re-derives by rule it declares. FAIL: back to Step 5; max 3 loops.

### Step 7 — worklist `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 7
```

Library writes `<dir of spec-file>/educe-sequences/worklist.txt`; one line per entry; each names a **span**. PASS when every line names a span and no line selects by coverage. select-neighbours-by-coverage reproduces the fabrication this command exists to catch ⇒ refused, not warned. FAIL: back to Step 6; max 3 loops.

### Step 8 — span `[read]` (AI judgment)

Dispatch one reader per worklist line.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" span
```

Hand rendered brief + worklist to reader subagent.
- brief carries tree of artifact in hand (`text.mjs <artifact>.json --tree`): every sequence the artifact claims, and the acts it performs in recorded order = what last generation read in this neighbourhood.
- tree = orientation, never evidence. uses: point reader to span carrying the act; keep one actor name and one operation name across entries of a document.
- reader reporting what tree says instead of reading and quoting the line = artifact written back to itself = the one thing this apparatus is built not to do.
- reader answers one question per entry: *is the named operation performed by the named actor inside the entry's own span?*
- reader writes `<dir of spec-file>/educe-sequences/readings-span.jsonl`: one signed line per entry; each carries `steps` and `operations` read there.
- reader writes `<dir of spec-file>/educe-sequences/readings-uncovered.jsonl`: one signed line per operation the borrowed census names and no step performs; each accounted for by placing it or naming the escape covering it.

Every step carries act `subject`, `predicate`, `object`, `contract` + `line` and `quote` (verbatim from that line).
- four act fields insufficient alone: decomposition can carry all, in order, relation holding, and not be a reading.
- `quote` = contiguous substring of line `line` names. line inside entry's own span, or in entry's `crossRefs` (procedure stated in one place, anchored in another).
- separation recorded = permitted; absorbed = refused.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 8
```

Second worklist: operations the borrowed census names and no step performs. per operation: place on the line that performs it, or name covering escape (rule this design supplies where spec silent | exclusion) and quote the line saying so. census-named operation unaccounted for ⇒ refused by name (census = denominator the run is held to).

Refused when: claim carries no signature; step carries no `line` or no `quote`; quote not carried by named line; step cites line outside entry's span that entry does not record as crossing. claim with no signature ≠ reading.
FAIL: back to Step 7; max 3 loops.
Note: span not carrying the operation the entry names = **result**, not failure; reader records verdict; run continues.

Two operations read as one act merge here: declare the one name; carry the other (escape position | ruling whose subject = dropped name). merge omitting the name ⇒ refused by Step 9 before anything is written. See **Merging**.

### Step 9 — integrate `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 9
```

Integrator proves every field of every reading before anything written; then writes artifact beside spec. Nothing written when any field unproven. PASS when artifact exists, recorded digest matches spec, every pin re-derives, every check green.
FAIL: back to Step 8; max 5 loops — largest limit: this phase fails when a reading is wrong, not when a reader is missing.

Also compares artifact about to write with the artifact it replaces; refuses when a name earlier one carried is named nowhere in later one.
- comparison happens **before** write ⇒ refusal leaves artifact byte-identical; reader repairs from state they had.
- silent when the two artifacts were not read from the same thing (no earlier artifact | edited spec | material digest moved): two revisions ≠ one space.
- one direction only: name that **arrived** is never a finding (refusing an addition refuses the reading a new generation exists to do).
- two repairs a dropped name admits: see **Merging** above; line printed: see Refusals table.

### Step 10 — adversarial `[read]` (AI judgment)

Reader attacks rulings; not checking them.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" adversarial
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 10
```

Brief carries tree; its `SHARE:` lines rank rulings: operation another sequence also names ⇒ misreading takes more than this ruling down ⇒ search weakest link there first.

Reader writes `<dir of spec-file>/educe-sequences/readings-adversarial.jsonl`: one signed attack per ruling; names the single weakest link. Refused when a ruling was never attacked. FAIL: back to Step 9; max 3 loops. no entry ruled non-sequence → gate passes as **vacuous**; report says so; not counted as signed work.

### Step 11 — reroute `[read]` (AI judgment)

Entry was bound to a window because a name or result object appeared near it. This phase undoes that binding.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" reroute
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 11
```

Brief carries tree ⇒ reroute sees what other entries already hold. question: which entry should realize this one instead? answer = entry whose acts carry the act in question, or do not.

Reader writes `<dir of spec-file>/educe-sequences/readings-reroute.jsonl`: names entry that should realize it instead + line that says so. Refused while an entry with no outcome is unrouted. FAIL: back to Step 10; max 3 loops.

### Step 12 — adjudicate `[read]` (AI judgment)

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" adjudicate
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 12
```

Brief carries tree; block of it = one actor's name + acts that actor performs beneath it in order. ruling is made about that, not from it: actor and order read in span, quoted, signed.

Reader rules per entry whether one named actor performs two or more ordered acts there; writes `<dir of spec-file>/educe-sequences/readings-adjudicate.jsonl`. Refused while entry carries no outcome or outcome outside declared vocabulary. FAIL: back to Step 11; max 3 loops.

Ruling whose `subject` = name artifact no longer carries is written here; admits a merge that dropped that name. See **Merging**.

### Step 13 — inquest `[read]` (AI judgment)

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" inquest
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 13
```

Pass asks the specification something rather than checking an answer to it. declaration and readings record what was found; cannot record what nobody looked for; this Step closes that gap. every generation asks again ⇒ changed text, or thinly read apparatus, is interrogated, not re-verified.

Brief names every declared subject (each section, each entry) under each of four lenses, with what previous generation answered. Reader writes `<dir of spec-file>/educe-sequences/readings-inquest.jsonl`: one signed record per (subject, lens) pair; carries question, answer in closed vocabulary, line answer rests on + its quote.

Refused while: pair carries no answer and no exemption; answer carries no signature; quote not carried by named line. FAIL: back to Step 12; max 3 loops.

Block not built before this Step passes: Step 14 requires phase 13 as well as phase 9 (green block reported without having asked anything = reporting a guarantee already said impossible). same idiom as weakest link one phase later: question closed before answer counted.

### Step 14 — checks `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 14
```

PASS when every declared check ran and none returned a verdict, **and** the weakest link the declaration named is answered by a declared check or a check this run scaffolded.
Refused when: check reports a verdict; block not produced; check count below declared count; named link has no check (link refused first ⇒ green block never stands in for a question it did not answer). run with skipped checks must not print same as run whose checks passed.
FAIL: back to Step 6; max 3 loops.

### Step 15 — re-derive `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 15
```

PASS when no check consumed a pin not re-derived from spec text in this run. keeps single-input design from becoming self-referential (artifact supplying its own premises, then agreeing with them, proves nothing). FAIL: back to Step 6; max 2 loops.

### Step 16 — falsify `[det]`, and the ad-hoc rail exit

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 16
```

Every mutation in corpus must redden the check it names, for a reason attributable to that check; every counter-mutation on correct work must stay green. counter-mutation that reddens = defect in the **rule**, not in subject. FAIL: back to Step 14; max 3 loops.

Defect class no existing check was written for → ad-hoc phase handles it = the one genuinely non-mechanical act in the command. author dispatched with checked brief, same way as a reader:

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" adhoc
node .claude/scripts/educe-sequences/rail/phase.mjs scaffold "$1" <check-name> "<the defect that motivated it>"
```

`scaffold` refuses without an originating defect.
- first call: writes module into `<dir of spec-file>/educe-sequences/adhoc/` that imports `rail/checks.mjs` (constructor library; one shape per kind of check); exports the check and the mutation that must redden it; each body marked `[::STUB::]` for author to replace.
- second call: does not rewrite module; **executes** mutation; reads check twice: over the defect (must refuse), over work as it stands (must stay silent). only then rail-exit record written, carrying what was observed.
- check whose mutation does not redden, or which also fires on correct work → refused, not recorded.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 17
```

Record's `promotionCondition` = what would promote check into the rail. Step 16 PASSes while every record carries an executed outcome and no empty field. count of records and count of promotion candidates printed every run (growing ad-hoc surface visible, not silent). Max 5 loops.

Scaffolded check does not stay where written: from next run, loaded from `<dir of spec-file>/educe-sequences/adhoc/`; executed against artifact beside declared checks; verdicts enter same block. refused by name: module that cannot be loaded | exports no check with a run | exports no mutation | has no rail-exit record (nothing ever falsified it). checks phase refuses rather than reporting a count over a set missing one.

Second spec needs same rule → promotion condition met. Promoting = **proposal**, not edit:

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs promote "$1" <record-id> <second-spec-file>
```

Marks record promoted in `<dir of spec-file>/educe-sequences/rail-exits.jsonl`; prints splice, naming `rail/engine.mjs` as file to edit. writes no source: changing declared checks = change made under a ticket, by a person; run only says what the change would be. count of unpromoted records printed every run (proposal queue visible, not remembered).

### Step 17 — report and product `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs through "$1"
node .claude/scripts/educe-sequences/rail/phase.mjs report "$1"
```

`through` runs every unfinished phase to the last; stops at first refusal or halt; exits 3 when a halt stopped it. `report` prints closing report. Then product path:

```bash
node .claude/scripts/educe-sequences/rail/run.mjs "$1"
```

Rendering beside spec written by `rail/render.mjs`: one diagram per sequence the artifact claims is one; each participant declared by alias; messages follow step order ⇒ a name never stands where diagram language would refuse a comma or colon. writes only from a verification that passed (same one `run.mjs` performs) ⇒ refused artifact neither drawn nor reported drawn; region ruled not a sequence owed no diagram.

PASS when artifact exists and its digest can be printed. FAIL: back to Step 14; max 2 loops.

Run whose check count or pin count is below declared count, or whose `[read]` phases are neither signed nor recorded as having had nothing to read → reported **incomplete**, even where exit code alone reads as success.

## Refusals

A refusal names the offending item; exits non-zero; writes nothing.

| Refusal | Raised by |
|---|---|
| a pin that is not re-derived in the same run | Step 15 |
| a reading missing a required field, or carrying an outcome outside the declared set | Step 9 |
| two readings for one subject | Step 9 |
| a name the previous generation carried that the artifact being written does not carry | Step 9 |
| a neighbour verdict naming an entry other than the one the engine selects by citation | Step 9 |
| a supplied rule whose presupposition is prose rather than an integer line naming it | Step 9 |
| a row keeping a `defining_section` that a supplied rule supersedes | Step 9 |
| a claim with no signature | Steps 8, 10–13 |
| a question or an answer outside the closed vocabulary | Step 13 |
| an answer whose cited line does not carry its quote | Step 13 |
| a worklist line that selects by coverage rather than by span | Step 7 |
| a brief that does not carry its four clauses | `brief` |
| a fixture file whose digest no longer matches the manifest | test surface |
| a specification whose digest or line count differs from the one recorded | `run.mjs` verification |
| a scaffold without an originating defect | Step 16 |
| a weakest link whose check is not declared | Step 14 |
| a scaffolded check whose mutation does not redden, or whose counter-mutation does | Step 16 |
| a rail-exit record that claims no executed outcome | Step 16 |

## Completion Report

Report separates two things; never adds them. Print both, in this order:

1. **Measured** — `phasesDone`, `checksRun`, `pinsRederived`, `readPhasesSettled` (with count that had nothing to read), `railExits`, `promotionCandidates`.
2. **Carried by a signature** — a reader opened the line. no check measures this. claim with no signature reddens the run; honesty of a signature carried as any signed record is carried.

Then print artifact path and its digest; state plainly whether run is **complete** or **incomplete**. Conclude with:

```
Run `/educe-sequences <spec-file>` again at any time to verify the artifact; it needs
nothing but the specification.
```
