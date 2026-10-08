# Task — test the claim that an entry is NOT a sequence

You are auditing a recorded judgment. Each entry in your batch was read once and recorded as
"this is not an ordered procedure", with a category and a reason. That judgment has never been
tested. Several judgments of exactly this shape have already been found wrong in this program:
one entry recorded as a "7-step sequence" was the operation's own internal stages, and eleven
operations recorded as "single-step, no ordered flow" turned out to sit inside procedures.

## Inputs

| path | what |
|---|---|
| /Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md | the specification (Japanese). The only source of truth. |
| /tmp/seqwork/vocabulary.md | the closed list of Core Operation kinds you may bind. Read it first, in full. |
| /tmp/seqwork/A-batch-NN.jsonl | your entries |

Each entry carries `id`, `spec_lines` (the recorded span), `subject`, `category` (the recorded
adjudication), `reason` (why it was called a non-sequence), and `context` (those lines plus
three either side, so you can see what you are being pointed at).

## Per entry

**Read the specification at and around the recorded span, generously** — the span may be wrong in
either direction. Then answer one question:

**Does this region state an ordered procedure — two or more acts, performed in an order, by named
actors?**

- **No** → the recorded judgment stands. Say so and give the line that shows why. A better reason
  than the recorded one is a useful result; say that too.
- **Yes** → the recorded judgment is WRONG, and the entry belongs in a sequence. Produce the
  ordered step decomposition (shape below).

Two traps, both already sprung in this program:

1. **A status field's value sequence is not a procedure.** `A -> B -> C` over a `status` field is a
   lifecycle description; the acts that cause the transitions are other operations. If the arrow
   chain names status values, answer **No**.
2. **A computation with a fixed order of evaluation is not a procedure.** If the acts are
   arithmetic or a derivation performed by a verifier over inputs, answer **No**. If named actors
   perform acts one after another, answer **Yes**.

## The step shape

```json
{"step": 1, "subject": "who", "predicate": "does what", "object": "to what",
 "contract": "the condition/effect that makes this step complete",
 "operation": "VocabularyKind", "line": 12345, "quote": "exact substring of spec line 12345"}
```

- `operation` is a kind from `vocabulary.md`, or `null` for a real step that is not itself an
  operation (a check, a signature, a wait, a derivation). A `null` step still carries all four
  text fields.
- `quote` must be a **byte-exact substring of the cited line**. A quote not literally present in
  that line fails.
- Do not bind a kind marked `[excluded]`. Do not invent a kind name.
- A sequence of nothing but `null` steps is not a sequence — if you cannot bind at least one
  operation, answer **No** instead.
- **Do not cite a Markdown table row** (a line starting with `|`). A table states what a thing is,
  never what anyone does. Fenced code blocks are fine — union-type lines inside them begin with
  `|` but are code, not tables. Do not cite the opening line of a type declaration either
  (`SomeRecord {`): a schema states what a thing IS.

## Output

Write **only** `/tmp/seqwork/out-A-NN.jsonl`, one JSON object per line, one per entry in your batch:

```json
{"id": "R-1394", "is_procedure": false, "category": "invariant_list",
 "reason": "your own reason, grounded in a line", "evidence_line": 1396}
```

```json
{"id": "R-1394", "is_procedure": true, "recorded_category_was_wrong": true,
 "sequence": {"spec_lines": [1394, 1400], "subject": "..."},
 "steps": [ ... ], "notes": "..."}
```

Every entry in your batch must appear. Do not edit any repository file. Do not write any other file.

Your final message: a compact table — id, is_procedure, and either the confirming line or the step
count — and nothing else.
