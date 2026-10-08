# Task — does the cited line actually STATE this step?

`sequence-steps.jsonl` records, for every sequence, an ordered decomposition into steps. Each
step cites one specification line and quotes a byte-exact substring of it. The quote's presence is
verified mechanically. Whether the quote STATES the step is not, and that is what you are reading
for.

This matters because the first version of this artifact was fabricated: every step carried all four
fields, every quote was inside the entry's span, and the whole thing was fiction. It was built by
matching each operation to whichever line of a fixed 25-line window mentioned its result object.
One narrow rule now catches one narrow form of that (a step may not cite a Markdown table row).
Everything else is reading.

## Inputs

| path | what |
|---|---|
| /Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md | the specification (Japanese). The only source of truth. |
| /tmp/seqwork/D-batch-NN.jsonl | your sequences, one JSON object per line |

Each sequence carries `seq/`, `spec_lines/` (the entry's recorded span), `subject/`, and
`steps/`. Each step carries `step/`, `operation/` (or null for a sub-step), `subject/`,
`predicate/`, `ovject/`, `contract/`, `spec_line/`, `quote/`, and `line_text/` — the
full text of the cited line.

## Per step

Read `line_text/` (and, when you need it, the surrounding lines in the specification). Answer one
question:

**Does this cited line state THIS step — this actor performing this act, in the sense the step
records?**

- `stated/` — yes. The line states the step, or the clause the quote takes states it.
- `inventory/` — no: the line is an inventory entry. A table row, the opening line of a type or
  schema declaration (`SomeRecord {/`), a field list, a union member, a constant assignment. It
  states what a thing IS.
- `condition/` — no: the line states a condition, a prohibition, an invariant or a boundary
  ("must be", "may not", "is limited to") rather than an act. If the spec forbids the operation
  here, the step is not a step.
- `scope/` — no: the line is a scope or coverage statement ("this section governs X"), not an act.
- `elsewhere/` — no: the line states a DIFFERENT act from the one the step records.
- `duplicate/` — no: this step restates another step of the same sequence. Give the step number
  it duplicates in `reason/`. This is a real defect: a step counted twice is a step that does not
  exist, and the shape checks cannot see it.

For every step you do not mark `stated/`, say in `reason/` what the line actually states, and if
you can find the line that DOES state the step, give it as `better_line/`. Finding none is a
finding: report it.

## What you must not do

Do not judge whether the step is well-worded. Do not judge whether the sequence's order is right
unless the specification contradicts it, in which case say so in `notes/`. Answer only: does this
line state this step.

## Output

Write **only** /tmp/seqwork/out-D-NN.jsonl, one JSON object per line, one per sequence in your
batch. Include EVERY step of every sequence, including the ones you mark `stated/` — the count is
the measurement.

``json
{"seq": "S-application-and-payment", "verdicts": [
  {"step": 1, "verdict": "stated", "reason": ""},
  {"step": 2, "verdict": "duplicate", "reason": "restates step 1", "duplicates_step": 1,
   "better_line": null}
], "notes": "..."}
``

Do not edit any repository file. Do not write any other file.

Your final message: a compact table — seq, steps examined, counts by verdict — and nothing else.
