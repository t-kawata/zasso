# Task — has anyone asked whether this entry is a sequence at all?

The apparatus accepts an entry as a sequence in three ways: it names operations; or a neighbour
whose span covers it names them; or it is adjudicated as not a procedure. The third way was put to
readers one at a time and all forty-one were confirmed. **The first two never were.** Naming an
operation is not the same as stating a procedure, and a neighbour's span reaching your lines is not
the same as someone having read them.

So, for every entry in your worklist, answer one question from the specification itself.

## The question

**Does this entry state an ordered procedure — two or more acts, performed in an order, by named
actors, such that an implementer must carry them out in that order?**

Read the specification from `spec_lines[0]` to `spec_lines[1]`. The specification is Japanese; the
entry's `subject`, `maps_to` and `steps` are this apparatus's own earlier claims about it, and they
are exactly what is under test. Where a step's `predicate` and the line it cites disagree, the line
wins.

Both answers are ordinary and neither is a failure. What is a failure is answering from the shape
of the entry rather than from its lines.

### Answer NO

The entry is not a procedure. Name what it actually is — one of these categories, already in use:

`invariant_list` · `prohibition_list` · `property_definition` · `schema_block` · `mapping_table` ·
`transition_statement` · `computation` · `approved_process` · `non_sequence_prose` ·
`conformance_scenario` · `excluded_sequence` · `requirement` · `precondition_list`

Then **`states`**: what the entry does actually state, one short line each, with its line number.
This is not decoration — when an entry is ruled not a procedure its steps are withdrawn, so anything
it genuinely says about an operation has to survive here or it is lost.

```json
{"seq":"R-2612","is_sequence":false,"category":"precondition_list","line":2609,
 "reason":"The entry is a numbered list of ten conditions a transaction must satisfy to contribute to the Forum Revenue Pool. It names no actor and no act; every item is a predicate on state.",
 "states":[{"line":2612,"text":"a contributing transaction requires forum_revenue_pool_policy.enabled on the forum genesis"}]}
```

### Answer YES

```json
{"seq":"R-480","is_sequence":true,"line":482,
 "note":"The entry states a numbered procedure the operator carries out in order: request, then the forum resolves, then the grant is issued."}
```

## A numbered list is not a procedure

Many entries in your worklist are the raw output of a detector that fires on numbered lists. A
numbered list is a procedure only when its items are **acts performed in order by an actor**. These
are not procedures, though they are numbered:

| shape | why not |
|---|---|
| conditions a thing must satisfy | they are predicates on a state, not acts |
| a preference order over candidate kinds | it ranks kinds of thing, not acts |
| milestones or states a record passes through | the acts that cause the transitions are elsewhere |
| fields, schemas, inventories | they say what a thing IS |
| prohibitions | a prohibition is a contract on an act, not an act |

A procedure written as one numbered item is still a procedure. `FinalizeTransferWhenAuthorized`'s
eight atomic transitions are numbered inside the operation. The test is the actor and the act, not
the numbering.

## If `realized_by` is `viaNeighbour`, answer a second question

The entry names no operation. The apparatus claims its **neighbour** realises it, on the ground that
the neighbour's span covers this entry's span. Coverage is not reading: a neighbour whose span
reaches from line 8714 to 8951 covers everything in between, whether or not anyone read it.

The neighbour is given to you as `neighbour`, with its `steps` and with `neighbour.cites_inside` —
the step numbers whose cited line falls inside **this** entry's span.

Answer: **do the neighbour's steps read this entry's lines?** Report each neighbour step that cites
a line inside this span and what it reads there. If `cites_inside` is empty, say so — the coverage
was a stretched span and nobody read these lines.

```json
{"seq":"R-480","is_sequence":true,"line":482,"note":"...",
 "neighbour_reads":[{"neighbour_step":3,"line":483,"reads":"the forum resolves the request and binds the grant"}],
 "realized_by_neighbour":true}
```

An entry that IS a procedure but whose neighbour cites none of its lines is a real answer:
`"is_sequence":true, "realized_by_neighbour":false`. Do not bend the reading to avoid it.

## Inputs and output

| path | what |
|---|---|
| `/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md` | the specification (Japanese). The only source of truth. |
| `/tmp/seqwork3/E-batch-NN.jsonl` | your entries, one JSON object per line |

Each entry carries `id`, `kind`, `spec_lines`, `subject`, `maps_to`, `realized_by`, and `steps`
(each with `step`, `spec_line`, `subject`, `predicate`, `object`, `contract`, `operation`, `quote`).
A `viaNeighbour` entry also carries `neighbour`.

Write **only** `/tmp/seqwork3/out-E-NN.jsonl`, one JSON object per line, one per entry.

## Rules you must not break

- Every entry in your batch gets exactly one answer. Not one fewer, not one more.
- `line` must be a real line number inside the span and must be a line a reader can open — not a
  blank line, not a ``` fence marker.
- `states[].line` likewise. `states[].text` is a short English sentence, not a quotation.
- Do not edit anything except your own output file.
- If a step's `quote` and the line it cites disagree, report it in your `note`; do not silently
  prefer either.
