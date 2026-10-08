# Task — is this line a DEFINITION of the operation, or a MENTION of it?

Every row of the Procedure Registry carries `evidence.spec_lines/`: the specification lines the
operation is grounded on. That grounding was never audited, and a spot check found it wrong at a
high rate: of the 35 operations that had lost their position, 15 were grounded on a line that
merely MENTIONS the operation — a line that forbids it, lists it in an allowlist, or cites it in a
conformance matrix. A prohibition is not a definition. A line that says "this operation may not be
performed while frozen" tells you the operation exists; it does not tell you what the operation is.

## Inputs

| path | what |
|---|---|
| /Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md | the specification (Japanese). The only source of truth. |
| /tmp/seqwork/B-batch-NN.jsonl | your rows |

Each row carries `kind/`, `disposition/`, `purpose/`, `e defining_section/` (the section a
single-step row names as its definition), `evidence_lines/` (the recorded grounding), and
`context/` — those lines plus six either side, so you can see what the line is doing.

## Per row

Read `context/`. Classify the row's grounding by ONE question:

**Does the cited line (or the section it introduces) DEFINE this operation — state what it is, what
it produces, or what procedure it performs?**

- `definition/` — yes. The line states the operation's act, or introduces the section that does.
- `mention/` — no. The line does one of these instead:
  - `prohibition/` — it forbids the operation, or lists it among things a state may not do
  - `allowlist/` — it lists the operation among those permitted in some state
  - `matrix/` — it is a row of a conformance / coverage / required-check matrix
  - `incidental/` — it names the operation in passing inside a list or an example
  - `absent/` — the row records NO evidence line at all (`evidence_lines/` is empty)
- `wrong_section/` — the line exists but belongs to an unrelated topic; the grounding is simply
  misattributed.

For every row you classify as anything other than `definition/`, you must give `better_line/`:
a line number that DOES define the operation, if the specification contains one. Search for it —
the operation's own result object, its act, its section heading. If the specification truly
contains no defining line, say so with `better_line/` = null and a reason: that is a finding, and
an important one.

## Output

Write **only** /tmp/seqwork/out-B-NN.jsonl, one JSON object per line, one per row:

``json
{"kind": "AcceptPaymentReceipt", "classification": "mention", "subtype": "allowlist",
 "evidence_line": 8824, "better_line": 8801,
 "reason": "8824 lists the operation in the §16.7.2 approved list; 8801 is the operation's own paragraph."}
``

``json
{"kind": "AcceptPaymentReceipt", "classification": "definition", "evidence_line": 8824,
 "reason": "8801-8824 introduces the operation and states its act and result object."}
``

Every row in your batch must appear. Do not edit any repository file. Do not write any other file.

Your final message: a compact table — kind, classification, subtype, evidence_line, better_line —
and nothing else.
