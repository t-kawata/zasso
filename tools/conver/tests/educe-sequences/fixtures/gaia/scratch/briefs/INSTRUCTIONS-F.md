# Task — falsify this ruling

Thirty-three entries have been ruled **not a sequence** by a reader who opened their lines and
answered one question. Each of those rulings now stands as a claim about the specification. A claim
about the specification is the thing this apparatus exists to test, so each is put back to a second
reader with the opposite instruction.

**Your instruction is to falsify the ruling, not to agree with it.**

## What you are given

Each entry carries `first_reading`: the category the first reader chose, the reason they gave, and
the line they cited. Read that first — then open the entry's lines and try to break it.

## What would break it

The ruling says the entry states no ordered procedure. It breaks if the entry's own lines state
**two or more acts, performed in an order, by named actors, such that an implementer must carry them
out in that order.**

Search for it properly:

- **A procedure can be written as one line.** The specification's own execution order at line 14147
  packs steps `(1)` … `(13)` onto a single line. An entry that looks like a list may be a procedure.
- **A procedure can be stated in prose with no numbering at all** — 「〜した後、〜する」, 「〜してから」,
  「次に」, 「その後」. Numbering is not the test; the actor and the act are.
- **A numbered list may be a procedure whose items are acts**, even if some items read as
  conditions. Ask of each item: does somebody do this, or is this true of something?
- **The first reader may have cited the wrong line** as the confirming one. That alone does not
  break the ruling, but if the entry's region contains a procedure the first reader did not
  consider, say so and cite it.

## What does not break it

These are not procedures, however they are punctuated:

| shape | why |
|---|---|
| conditions a thing must satisfy | predicates on a state, not acts |
| a preference order over candidate kinds | ranks kinds of thing, not acts |
| milestones or states a record passes through | the acts causing the transitions are elsewhere |
| fields, schemas, inventories, formulas | they say what a thing IS |
| prohibitions | a contract on an act, not an act |
| the combined effect of one atomic transition | one act with several results, not several acts |

An entry whose numbered items are the **effects** of a single transition (things that *become*
revoked, *become* active, *increment*) is not an ordered procedure. An entry whose numbered items are
**things an actor does** (resolve, verify, compute, issue, set) is.

## Answer

```json
{"seq":"A-5488","upholds":true,"line":5488,
 "note":"The rule stands. 5488 sends the verifier to a checklist of ten predicates; 5501 states the consequence, not an act. No line in 5488..5501 has an actor performing an ordered act."}
```

```json
{"seq":"A-1332","upholds":false,"category":"approved_process","line":1329,
 "note":"The rule does not stand: line 1329 sends the reader to an ordered handover the definitions alone do not show.",
 "states":[{"line":1330,"text":"a short English sentence stating what the entry does say"}]}
```

`line` is the line that decided your answer, inside the entry's span, and must be a line a reader can
open — not blank, not a ``` fence marker. When `upholds` is false, `category` is one of:
`invariant_list` · `prohibition_list` · `property_definition` · `schema_block` · `mapping_table` ·
`transition_statement` · `computation` · `approved_process` · `non_sequence_prose` ·
`conformance_scenario` · `excluded_sequence` · `requirement` · `precondition_list`.

## Inputs and output

| path | what |
|---|---|
| `/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md` | the specification (Japanese). The only source of truth. |
| `/tmp/seqwork3/F-batch-NN.jsonl` | your entries, one JSON object per line |

Write **only** `/tmp/seqwork3/out-F-NN.jsonl`, one JSON object per line, one per entry.

## Rules you must not break

- Every entry in your batch gets exactly one answer.
- Judge from the specification's lines, not from `steps`, `maps_to` or `first_reading`. Those are
  this apparatus's claims and are exactly what is on trial.
- Do not edit anything except your own output file.
- **Upholding is a real answer and the common one.** Do not overturn a ruling to look thorough; do
  not uphold one to look consistent. A ruling you overturn without a line is worse than the ruling.
