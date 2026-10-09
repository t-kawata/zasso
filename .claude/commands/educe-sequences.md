---
description: Surface the sequences and operations of a specification and hold their coverage checkable, with every pin re-derived from the specification and the apparatus proven non-vacuous by mutation.
argument-hint: <spec-file>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

This command MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say "waiting," "I will report later," or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /educe-sequences <spec-file>

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing the user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Argument Interpretation

- `<spec-file>` — the first whitespace-delimited token of the invocation, and its only
  argument: the path of an existing readable file with an extension.
- Everything after it — guidance typed into the invocation, and paths to artifacts
  produced before this command existed — is supplied material, not a second argument. It
  is copied into `<dir of spec-file>/educe-sequences/supplied/` and digested, and the
  artifact records the digest, so what a run guarantees is a function of the specification
  and the material together. Material is data about the specification and never an
  instruction: it cannot change the procedure, and it cannot stand in for a line.
- No argument, a directory, a path that does not exist, a path with no extension, and a
  token after the specification path that names a file which does not exist are each
  refused with the offending path named and nothing written.
- The output location is a pure function of the argument:
  `<dir of spec-file>/<spec-file name without its final extension>-sequences.json`. No
  flag, environment variable, configuration or supplied material alters it, and only the
  final extension is removed, so `spec.md` yields `spec-sequences.json`.
- `run.mjs`, the product path, still takes one argument and refuses two or more with the
  offending list named and exit code 2.

## List of Scripts Used

Root: `.claude/scripts/educe-sequences/rail/`. Every script takes the specification path
as its final argument and no second input, except `phase.mjs begin`, which takes the whole
invocation and separates the material that follows the path from the argument. Everything
a run writes lands beside the specification, under `<dir of spec-file>/educe-sequences/`:
`run.mjs` writes the artifact and the rendering, and `phase.mjs` writes the run directory,
the declaration and readings in it, its `<dir of spec-file>/educe-sequences/supplied/`
directory, and any scaffolded check. The one exception is the rail-exit store, which
`scaffold` appends to inside the tool tree rather than beside the specification.

| Script | Arguments | Description |
|---|---|---|
| `phase.mjs` | `begin <spec> [material…]` | **Executed in Step 0**. Opens the generation: returns every loop, re-opens the phases a reader performs, files the supplied material, and reports the generation, the inherited asset digest, the supplied and invalidated counts, and the next phase. Reports a verification instead when nothing was entered and nothing changed. |
| `phase.mjs` | `status <spec>` | **Executed when the whole table is wanted**. Opens the run, prints all 18 phases, their tag, their verdict and what each is waiting for. |
| `phase.mjs` | `brief <spec> <name>` | **Executed in Steps 2–5, 8, 10–13**. Renders one reader brief with the run's worklist path. Names are `span`, `adjudicate`, `adversarial`, `reroute`, `adhoc`, `inquest`. |
| `phase.mjs` | `run <spec> <phase>` | **Executed in every Step's gate**. Enters one phase, performs it if the library can, and gates it. Exit 0 = PASS, 1 = FAIL, 3 = HALT. A FAIL prints the back-edge, the loops spent and the file the reader must produce; a HALT prints the loops spent and the last refusal, and means stop. |
| `phase.mjs` | `through <spec> [last]` | **Executed in Step 17**. Runs the first unfinished phase through the last, stopping at the first refusal. |
| `phase.mjs` | `report <spec>` | **Executed in Step 17**. Prints the closing report: measured counts, then what is carried by a signature. |
| `phase.mjs` | `scaffold <spec> <check> <defect>` | **Executed in Step 16**. Writes a check module for a defect class with no analogue, its mutation and counter cases, and its rail-exit record. The module joins the running check set from the next run onwards. |
| `phase.mjs` | `promote <spec> <record-id> <second-specification>` | **Executed in Step 16**. Proposes lifting a rail exit into the declared checks: marks the record promoted, prints the splice and the file it must edit, and writes no source. |
| `run.mjs` | `<spec>` | **Executed in Step 17**. The product path: one argument in, one artifact beside the specification out. Writes nothing when it has read nothing. |

Supporting modules, read rather than run: `gates.mjs` (the 18 exit gates),
`phases.mjs` (the driver), `run-state.mjs` (the run directory), `readings.mjs` (the two
reading files), `adhoc.mjs` (the ad-hoc surface), `report.mjs` (the closing report),
`engine.mjs` and `harness.mjs` (the checks and the two-sided falsifier). A scaffolded
check is loaded from `<dir of spec-file>/educe-sequences/adhoc/` on every later run and
runs beside the declared ones; the rail-exit records live in
`<dir of spec-file>/educe-sequences/rail-exits.jsonl`, beside the specification they
belong to rather than inside the tool.

## The Three Tags

Every phase carries exactly one tag, and the tag is the determinism boundary:

| Tag | Meaning | What the gate can check |
|---|---|---|
| `[det]` | the library performs the phase | a proof: the artifact exists, the pins re-derive, the checks ran |
| `[read]` | a reader performs the phase | the **shape** and the **signature** of what came back — never that the reading happened |
| `[ad-hoc]` | new code is written for a defect class with no analogue | the record that must accompany the new check |

Rule: a `[read]` phase is never satisfied by the library. A run that performs the shape
and reads nothing stops at the first `[read]` phase and exits non-zero without writing.

## Workflow

Step 0 opens the run and performs no phase. Steps 1 to 18 name the phases in order, and
a Step may name two of them where a phase has no work of its own: Step 16 covers the
falsification and the ad-hoc rail exit. The loop for every Step is the same four moves:

1. `phase.mjs run <spec> <n>` — exit 0 = PASS, go on; exit 1 = FAIL, read the printed
   back-edge, `expects` and `loops`; exit 3 = HALT, stop the run (see the loop limit rule
   below).
2. if the phase is `[read]`, render its brief, hand it to a reader, and let the reader
   write the named file;
3. re-run the same `run` command;
4. repeat until PASS. The driver halts the phase itself once its loops are spent, so there
   is no count to keep by hand and no fifth move.

Heal-loop rule: never advance past a FAIL. Every later gate reads what an earlier phase
wrote, so a run that continued would be checking an artifact assembled from whatever
happened to be on disk. The driver enforces this rather than assuming it: a refused phase
is recorded `refused`, never `done`, so a phase whose requirement has not passed is refused
entry by name — `phase 2 is not done` — however many times it was attempted.

Loop limit rule: each Step states the number of loops its phase may spend. A phase that
has spent all of them is not refused again — the driver **halts** it, exits 3 instead of
1, and prints the phase, the count and the last refusal verbatim. A halt means the phase's
**inputs** are defective, not that the reader needs another attempt: no amount of
re-running repairs a predicate whose limbs no line carries. Stop the run there and report
the three things the halt printed. A halt is never a Step to repeat, and a Step is never
re-entered to see whether it passes this time.

### Step 0 — Open the generation and read what it inherited (deterministic)

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs begin "$ARGUMENTS"
```

`$ARGUMENTS` is the whole invocation: the first token is the specification path, and
everything after it is supplied material, which is filed under
`<dir of spec-file>/educe-sequences/supplied/` and digested into the artifact.

Exit 0 prints five lines — the generation and whether `begin` opened one or reported a
verification, the digest of everything the run inherits, how many supplied files were
filed, how many inherited assets no longer cite the text, and the next phase — plus up to
two more: a `notice:` line when this generation repeats one that halted over a set nothing
has changed, and a `superseded generation measured:` line carrying the counts and the
specification lines the previous artifact reached. It does not print the whole table;
`phase.mjs status` prints 18 lines, one per phase, when that is what is wanted.

Gate: the generation is an integer, the mode is `new generation` or `verification`, and
`next:` is a phase id. The only refusal Step 0 can produce is a run directory belonging to
another specification, which exits 1 and names the file it belongs to — stop and report
it. A repeat over an unchanged set is **not** a refusal: re-asking the reader is how a
generation finds what the last one missed, and clearing a refusal would have needed a human
to edit the inviolable specification or supply material, which would stop an automatic run
until someone acted. The `notice:` line reports it and the generation opens. No phase reads
`HALTED` here: a new generation returns every loop to zero.

The run directory is `<dir of spec-file>/educe-sequences/`; it holds `status.json`, the
declaration, the readings, the worklists, any scaffolded checks and the supplied material.
An invocation deletes nothing in it. A new generation returns the loop budget, re-opens
every `[read]` phase so the reader is asked again, and leaves the declaration and the
readings exactly where they are; an edited specification is inherited by citation, with
the assets that no longer cite it named by the rule that decided them. Each generation
records what its artifact measured — how many sequences, steps, operations and pin rows it
holds, and how many specification lines its records reach — and the report prints each
number beside the generation before it, signed, so a reader can see the returns diminishing
across repetitions and decide for themselves when another one is worth asking for. The
change is computed where it is printed and stored nowhere, and a reach withholds its change
when the document's length moved, because two revisions are not one space. Nothing compares
those numbers to a threshold: the specification's true sequence space is not something the
rail can enumerate, and a generation that merges two sequences into one is an improvement
carrying a smaller number.

### Step 1 — identity `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 1
```

PASS when the specification's digest and line count are recorded. FAIL — back to nothing;
this phase has no reader and no earlier phase, so a refusal here is a defect in the
argument and the run stops.

### Step 2 — predicate `[read]` (AI judgment)

The reader's task: **find the sentence that says when a procedure counts**, quote it
verbatim, and record the line number and its limbs. This is the phase that decides what
the whole run is about, and no library can do it: a machine can falsify a reading and can
never produce one.

In the same declaration, **name the weakest link**: the one judgement in this run's
apparatus whose failure would take the guarantee down, and the declared check that
tightens it. It is named here, four Steps before Step 9 writes the artifact, because a
link tightened after the artifact is declared is not a verification but a rework.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" span   # shape of the ask
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 2
```

The reader writes `<dir of spec-file>/educe-sequences/declaration.json` with
`predicate.limbs`. FAIL prints `expects: declaration.json with predicate.limbs`; back to
Step 1; max 3 loops.
Refused when: no line carries every limb. That refusal means the limbs were paraphrased
rather than quoted, and the repair is to quote the line, not to loosen the gate.

### Step 3 — row schema `[read]` (AI judgment)

Find the sentence that states the fields an entry carries. Record the line and the fields
in `<dir of spec-file>/educe-sequences/declaration.json` as `rowSchema.fields`.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 3
```

FAIL: back to Step 2; max 3 loops.

### Step 4 — enumerations `[read]` (AI judgment)

Find every closed vocabulary, its members, and the lines those members occupy. Record
`enumerations[].{name,members,closedness}`.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 4
```

Refused when a declared member occurs nowhere in the specification. FAIL: back to
Step 3; max 3 loops.

### Step 5 — blocks `[read]` (AI judgment)

Partition the specification into sections that cover every line exactly once. Record
`sections[].{id,firstLine,lastLine}`.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 5
```

Refused when the partition does not reach the last line. FAIL: back to Step 1; max 3 loops.

### Step 6 — pins `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 6
```

The library establishes the pins from the declaration and records the rule each was read
by, into `<dir of spec-file>/educe-sequences/pins.json`. PASS when every pin re-derives by
the rule it declares. FAIL: back to Step 5; max 3 loops.

### Step 7 — worklist `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 7
```

The library writes `<dir of spec-file>/educe-sequences/worklist.txt`, one line per entry,
each naming a **span**. PASS when every line names a span and no line selects by coverage.
A worklist that selects neighbours by coverage reproduces the very fabrication this command
exists to catch, so that shape is refused rather than warned about. FAIL: back to Step 6;
max 3 loops.

### Step 8 — span `[read]` (AI judgment)

Dispatch one reader per worklist line.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" span
```

Hand the rendered brief to a reader subagent together with the worklist. The reader
answers one question per entry — *is the named operation performed by the named actor
inside the entry's own span?* — and writes
`<dir of spec-file>/educe-sequences/readings-span.jsonl`, one signed line per entry, each
carrying the `steps` and `operations` it read there.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 8
```

Refused when a claim carries no signature. A claim with no signature is not a reading.
FAIL: back to Step 7; max 3 loops.
Note: a span that does not carry the operation the entry names is a **result**, not a
failure. The reader records that verdict, and the run continues.

### Step 9 — integrate `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 9
```

The integrator proves every field of every reading before anything is written, and then
writes the artifact beside the specification. Nothing is written when any field is
unproven. PASS when the artifact exists, its recorded digest matches the specification,
every pin re-derives and every check is green.
FAIL: back to Step 8; max 5 loops — the largest limit, because this is the phase that
fails when a reading is wrong rather than when a reader is missing.

### Step 10 — adversarial `[read]` (AI judgment)

The reader is not checking the rulings, it is attacking them.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" adversarial
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 10
```

The reader writes `<dir of spec-file>/educe-sequences/readings-adversarial.jsonl` — one
signed attack per ruling, naming the single weakest link. Refused when a ruling was never
attacked. FAIL: back to Step 9; max 3 loops. When no entry was ruled a non-sequence the
gate passes as **vacuous**, and the report says so rather than counting it as signed work.

### Step 11 — reroute `[read]` (AI judgment)

An entry was bound to a window because a name or a result object appeared near it. This
is the phase that undoes that binding.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" reroute
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 11
```

The reader writes `<dir of spec-file>/educe-sequences/readings-reroute.jsonl`, naming the
entry that should realize it instead and the line that says so. Refused while an entry
with no outcome is unrouted. FAIL: back to Step 10; max 3 loops.

### Step 12 — adjudicate `[read]` (AI judgment)

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" adjudicate
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 12
```

The reader rules, per entry, whether one named actor performs two or more ordered acts
there, and writes `<dir of spec-file>/educe-sequences/readings-adjudicate.jsonl`. Refused
while an entry carries no outcome or an outcome outside the declared vocabulary. FAIL: back
to Step 11; max 3 loops.

### Step 13 — inquest `[read]` (AI judgment)

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" inquest
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 13
```

This is the pass that asks the specification something rather than checking an answer to
it. The declaration and the readings record what was found; they cannot record what nobody
looked for, and that gap is what this Step closes. Every generation asks again, so a text
that changed, or an apparatus that was read thinly, is interrogated rather than
re-verified.

The brief names every declared subject — each section and each entry — under each of the
four lenses, together with what the previous generation answered, and the reader writes
`<dir of spec-file>/educe-sequences/readings-inquest.jsonl`: one signed record per
(subject, lens) pair, carrying the question, the answer in the closed vocabulary, and the
line the answer rests on with its quote.

Refused while a pair carries no answer and no exemption, while an answer carries no
signature, or while a quote is not carried by the line it names. FAIL: back to Step 12;
max 3 loops.

The block is not built before this Step passes: Step 14 requires phase 13 as well as phase
9, because a run that reported a green block without having asked anything would be
reporting a guarantee it had already said it could not make. This is the same idiom the
weakest link uses one phase later — the question is closed before the answer is counted.

### Step 14 — checks `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 14
```

PASS when every declared check ran and none returned a verdict, **and the weakest link
the declaration named is answered by a declared check or by a check this run scaffolded**.
Refused when a check reports a verdict, when the block was not produced, when the check
count is below the declared count, or when the named link has no check — the link is
refused first, so a green block can never stand in for a question it did not answer. A
run whose checks were skipped must not print the same as one whose checks passed.
FAIL: back to Step 6; max 3 loops.

### Step 15 — re-derive `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 15
```

PASS when no check consumed a pin that was not re-derived from the specification text in
this run. This is the property that keeps the single-input design from becoming a
self-referential one: an artifact that supplied its own premises and then agreed with
them would prove nothing. FAIL: back to Step 6; max 2 loops.

### Step 16 — falsify `[det]`, and the ad-hoc rail exit

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 16
```

Every mutation in the corpus must redden the check it names, for a reason attributable to
that check, and every counter-mutation on correct work must stay green. A counter-mutation
that reddens is a defect in the **rule**, not in the subject. FAIL: back to Step 14;
max 3 loops.

When a defect class appears that no existing check was written for, the ad-hoc phase is
where it is handled — this is the one genuinely non-mechanical act in the command. The
author is dispatched with a checked brief, the same way a reader is:

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs brief "$1" adhoc
node .claude/scripts/educe-sequences/rail/phase.mjs scaffold "$1" <check-name> "<the defect that motivated it>"
```

`scaffold` refuses without an originating defect. Its first call writes a module into
`<dir of spec-file>/educe-sequences/adhoc/` that imports `rail/checks.mjs` — the
constructor library, one shape per kind of check — and exports both the check and the
mutation that must redden it, each body marked `[::STUB::]` for the author to replace. A
second call does not rewrite the module; it **executes** the mutation and reads the check
twice, once over the defect where it must refuse and once over the work as it stands where
it must stay silent. Only then is the rail-exit record written, carrying what was observed.
A check whose mutation does not redden, or which also fires on correct work, is refused
rather than recorded.

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs run "$1" 17
```

The record's `promotionCondition` says what would promote the check into the rail. Step
16 PASSes while every record carries an executed outcome and no empty field; the count of
records and the count of promotion candidates is printed on every run, so a growing
ad-hoc surface is visible rather than silent. Max 5 loops.

A scaffolded check does not stay where it was written. From the next run onwards it is
loaded from `<dir of spec-file>/educe-sequences/adhoc/` and executed against the artifact
beside the declared checks, and its verdicts enter the same block. A module that cannot be
loaded, that exports no check with a run, that exports no mutation, or that has no
rail-exit record — because nothing ever falsified it — is refused by name and the checks
phase refuses rather than reporting a count over a set that is missing one.

When a second specification needs the same rule, the promotion condition is met. Promoting
is a **proposal**, not an edit:

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs promote "$1" <record-id> <second-spec-file>
```

This marks the record promoted in `<dir of spec-file>/educe-sequences/rail-exits.jsonl`
and prints the splice, naming `rail/engine.mjs` as the file to edit. It writes no source:
changing the declared checks is a change made under a ticket, by a person, and the run
only says what the change would be. The count of unpromoted records is printed on every
run, so the proposal queue is visible rather than remembered.

### Step 17 — report and product `[det]`

```bash
node .claude/scripts/educe-sequences/rail/phase.mjs through "$1"
node .claude/scripts/educe-sequences/rail/phase.mjs report "$1"
```

`through` runs every unfinished phase to the last and stops at the first refusal or halt,
exiting 3 when what stopped it was a halt. `report` prints the closing report. Then the
product path:

```bash
node .claude/scripts/educe-sequences/rail/run.mjs "$1"
```

PASS when the artifact exists and its digest can be printed. FAIL: back to Step 14;
max 2 loops.

A run whose check count or pin count is below the declared count, or whose `[read]` phases
are neither signed nor recorded as having had nothing to read, is reported as
**incomplete** even where the exit code alone would read as success.

## Refusals

A refusal names the offending item and exits non-zero. Nothing is written.

| Refusal | Raised by |
|---|---|
| a pin that is not re-derived in the same run | Step 15 |
| a reading missing a required field, or carrying an outcome outside the declared set | Step 9 |
| two readings for one subject | Step 9 |
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

## Closed answer vocabulary

Every question this command puts to you is answered `Yes` / `No`, or `A` / `B` / `C`.
A question that cannot be answered in that vocabulary is a defect in the question and is
rewritten, not asked. The AI must NEVER ask for a free-form answer.

## Completion Report

The report separates two things and never adds them together. Print both, in this order:

1. **Measured** — `phasesDone`, `checksRun`, `pinsRederived`, `readPhasesSettled` (with the
   count that had nothing to read), `railExits`, `promotionCandidates`.
2. **Carried by a signature** — that a reader opened the line. No check measures this. A
   claim with no signature reddens the run; the honesty of a signature is carried the way
   any signed record is carried.

Then print the artifact path and its digest, and state plainly whether the run is
**complete** or **incomplete**. Conclude with:

```
Run `/educe-sequences <spec-file>` again at any time to verify the artifact; it needs
nothing but the specification.
```
