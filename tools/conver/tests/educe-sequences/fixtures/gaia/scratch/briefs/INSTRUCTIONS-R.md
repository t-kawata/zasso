# Task — an operation has lost the sequence that named it. What is it?

Every row in the procedure registry is either placed in a sequence, or accounted for as a
single-step operation, or governed by a rule this design supplies where the specification is silent.
The three are exhaustive and the checker fails the run when a row is none of them.

Operations in your worklist have just lost their placement: the entry that named them was read and
found **not to state an ordered procedure at all**. The name was bound to those lines because the
name, or the object it produces, appeared in them. That is the fabrication shape this whole
apparatus exists to catch — so the placement was never evidence about the operation. **The
operation itself may be perfectly real.** Your question is what its procedure actually is.

## The question, for one operation

**Where does the specification state what this operation does?**

Search the whole specification for the act, not for the name. The name is this design's own
invention as often as not; searching for it proves nothing. Search for what the operation would do —
the state it changes, the object it produces, the signature it takes, the external call it starts.

Then take the first of these that holds.

| finding | disposition |
|---|---|
| a line states the act, and the section around it sets out that operation's own validity rules, pre-state conditions and rejection codes — that section **is** its whole procedure | `single_step` |
| the section states an *ordered* procedure with two or more acts by named actors | `positioned` — name the sequence entry that should carry it, or say a new one is needed |
| a line uses the act — in an allowlist, a prohibition, a schema, or a sentence that sends the reader to a procedure it never states — and **no** line defines it | `supplied_rule` |
| the act is a read: it changes no state, accepts no signed object, starts no external call, and emits no durable event | `withdraw` |
| the specification excludes it by name | `excluded` |

## What `single_step` requires

Three things, and the checker tests all three:

- `defining_section`: the heading of the section that defines the operation, written as the
  specification writes it — `section 19.6 (AcceptCommercialOffer)` means §19.6's heading text is
  `AcceptCommercialOffer`. It must be a real heading of the specification. A section that merely
  *mentions* the operation is not its defining section.
- `line`: the line inside that section that states the act. It must be a line a reader can open —
  not blank, not a fence marker, not a Markdown table row.
- `note`: what you read. Say what the section states, quote the sentence that states the act, and
  say why it is one act rather than an ordered procedure. If a neighbouring section states an
  ordered procedure, say why that procedure is not this operation's.

## What `supplied_rule` requires

The specification names the act and never defines it. This design then decides the procedure, and
the decision is written down where a reviewer can read it. Give:

```json
{"kind":"...","presupposition":"...","act":"...","rule":"...","grounds":[1234],"why":"...","override":"..."}
```

- `presupposition` — what the specification says that makes the act necessary, in one sentence. It
  must contain the exact string the specification uses for the act.
- `grounds` — the line numbers carrying that string, each of which a reader can open.
- `rule` — the procedure this design adopts, in prose. A decision, not a deferral.
- `override` — the fact that would overturn it. A decision without an override is not a decision.

## Output

`/tmp/seqwork3/out-R-NN.jsonl`, one JSON object per line, one per operation:

```json
{"kind":"SoulTransferFinalize","disposition":"single_step","defining_section":"section 24.9 (Atomic Soul Transfer Finalization)","line":12864,"note":"..."}
{"kind":"...","disposition":"supplied_rule","presupposition":"...","act":"...","rule":"...","grounds":[1234],"why":"...","override":"..."}
{"kind":"...","disposition":"withdraw","reason":"..."}
```

## Inputs

| path | what |
|---|---|
| `/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md` | the specification (Japanese). The only source of truth. |
| `/tmp/seqwork3/R-batch-NN.jsonl` | your operations, with the entry each was placed in and why it fell |
| `/Users/kawata/shyme/gaia/crates/protocol/gaia-operation/docs/procedure-registry.md` | the registry: each row's `purpose`, `result_object_classes`, `reject_code_families`, `mutates_protocol_state` and `required_authority` are this design's claims about the operation and are useful search leads |

## Rules you must not break

- Every operation in your batch gets exactly one disposition.
- Do not invent a section. `defining_section` must name a heading that exists.
- Do not invent a line. It must be inside that section and openable.
- **`supplied_rule` is not the default.** It is for an act the specification uses and never
  states. If a line states the act, the disposition is `single_step` or `positioned`.
- Do not edit any file but your own output.
