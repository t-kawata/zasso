# Task — decide whether each section states an ordered procedure, and if it does, write it down

You are auditing 48 single-step operations, 12 per reader. Each is currently recorded as an
operation whose whole procedure is the validity rules of the section that defines it. That is a
legitimate disposition — but only if the section really states no ordered flow. Several of these
sections do state one, and then the operation belongs in a sequence.

## Inputs

| path | what |
|---|---|
| `/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md` | the specification (Japanese). The only source of truth. |
| `/tmp/seqwork/vocabulary.md` | the closed list of Core Operation kinds you may bind. Read it first, in full. |
| `/tmp/seqwork/single-batch-NN.jsonl` | your sections: `{kind, purpose, evidence_line, defining_section, section_line, section_heading}` |

## Per section

Read the section that begins at `section_line` (read to the next heading of the same or higher
level, plus 20 lines either side where the section is short). Answer one question:

**Does this section state an ordered procedure — two or more acts, performed in an order, by
named actors?**

- **No.** It states a definition, a policy value, a schema, an invariant, or a single act whose whole
  procedure is the section's validity rules. Say so, with the reason and the line that shows it.
  Most policy-publication sections are this case and are correct as they stand.
- **Yes.** Give the sequence: an id, the lines it spans, a one-line subject, and the **ordered step
  decomposition** in the same shape the other readers produced (see below). The operation already
  recorded for this section is one of the steps — bind it. Bind the other operations the procedure
  performs, wherever they are defined, not only the one that led you here.

## The step shape

```json
{"step": 1, "subject": "who", "predicate": "does what", "object": "to what",
 "contract": "the condition/effect that makes this step complete",
 "operation": "VocabularyKind", "line": 12345, "quote": "exact substring of spec line 12345"}
```

- `operation` is a kind from `vocabulary.md`, or `null` for a real step that is not itself an
  operation (a check, a signature, a wait, a derivation). A `null` step still carries all four text
  fields.
- `quote` must be a **byte-exact substring** of the cited line. This is verified mechanically; a
  quote not present in that line fails the task.
- Do not bind a kind marked `[excluded]`. Do not invent a kind name.
- A sequence of nothing but `null` steps is not a sequence — if you cannot bind at least one
  operation, answer **No** instead.
- **Do not cite a Markdown table row** (a line starting with `|`). A table states what a thing is,
  never what anyone does; a step citing one fails the check S27 exists for. Fenced code blocks are
  fine — union-type lines inside them begin with `|` but are code, not tables.

## Output

Write **only** `/tmp/seqwork/out-single-NN.jsonl`, one JSON object per line, one per section in your
batch:

```json
{"kind": "...", "section_line": 1234, "is_procedure": false, "reason": "...", "evidence_line": 1240}
```

```json
{"kind": "...", "section_line": 1234, "is_procedure": true,
 "sequence": {"id": "S-...", "spec_lines": [1234,1260], "subject": "..."},
 "steps": [ ... ], "notes": "..."}
```

Every section in your batch must appear. Do not edit any repository file. Do not write any other
file.

Your final message: a compact table — kind, section, is_procedure, step count if any — and nothing
else.
