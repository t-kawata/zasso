# Task — re-derive each sequence entry's ordered operation decomposition FROM THE SPECIFICATION TEXT

You are correcting a known-wrong artifact. Read this whole file before starting.

## The defect you are fixing

`/tmp/seqwork/batch-NN.jsonl` lists sequence entries. Each carries `id`, `subject`,
`spec_lines`, `span`, and `current_maps_to`.

**`current_maps_to` is WRONG. It was produced by assigning operations to whatever
25-line window happened to contain the entry, not by reading the entry's procedure.**
Do NOT copy it. Do NOT consult it. Derive everything from the specification text.
Treat `current_maps_to` as noise you may compare against at the end, never as a source.

The `subject` field is usually a genuine reading and is a useful hint, but it is not
authoritative either — verify it against the text and correct it if it is wrong.

## Inputs

| path | what it is |
|---|---|
| `/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md` | the specification (Japanese). This is the ONLY source of truth. |
| `/tmp/seqwork/vocabulary.md` | the closed list of Core Operation kinds you may bind. Read it first, fully. |
| `/tmp/seqwork/batch-NN.jsonl` | your batch of entries |

An entry's `span` is `[min(spec_lines), max(spec_lines)]`. **Read `span` plus 40 lines
either side.** The recorded span is itself suspect: it may be too wide (a fixed 25-line
window was used) or too narrow. If the procedure you find lies outside it, widen
`spec_lines` in your output and say so in `notes`.

## What to produce, per entry

An **ordered step decomposition** — the procedure as the specification states it.

For each step:

```json
{"step": 1, "subject": "who", "predicate": "does what (verb phrase)",
 "object": "to what", "contract": "the condition/effect that makes this step complete",
 "operation": "VocabularyKind", "line": 12345, "quote": "exact substring of spec line 12345"}
```

- `operation` — a kind from `vocabulary.md`, or `null` when the step is a real step of
  the procedure but is not itself an operation (a check, a signature, a wait, a
  derivation). A `null` step must still carry `subject`/`predicate`/`object`/`contract`.
- `line` — the 1-based line of `GaiaSekkeiShiyousho_v32.md` that states this step.
- `quote` — **an exact substring of that line**, 20–160 characters, the clause that
  states this step. It will be verified mechanically with a substring test. A quote
  that is not literally present in that line is a hard failure of this task.

Order = the order the specification states. Where the spec fixes an order elsewhere
(e.g. "the following seven steps in this order"), use that order and cite the line
that fixes it in `notes`.

Do not bind a kind whose `[excluded]` disposition appears in `vocabulary.md` — those
are not Core Operations. Do not invent a kind name.

## Gaps

If the procedure requires an action that **no** vocabulary kind covers, do not stretch a
name to fit. Emit it as a gap:

```json
{"id": "...", "gaps": [{"step": 4, "needs": "a one-line description of the missing operation",
                        "line": 12345, "why": "why no existing kind covers it"}]}
```

A gap is a finding, not a failure. Inventing a name to avoid a gap is the failure.

## Output

Write **only** `/tmp/seqwork/out-NN.jsonl` (replace `NN` with your batch number), one
JSON object per line, one object per entry in your batch:

```json
{"id":"A-525","spec_lines":[525,531],"subject":"...","steps":[ ... ],
 "gaps":[], "notes":"..."}
```

Every entry in your batch must appear. Do not edit any file in the repository. Do not
write any other file. Return as your final message a short table: entry id, step count,
number of bound operations, number of gaps.

## Method

1. Read `vocabulary.md` in full first — you cannot bind what you have not read.
2. For each entry: read the span ±40 lines. Identify the procedure. Write the steps in
   order with the line and quote that state each.
3. Where the spec defers to another section for part of the procedure, read that
   section too, and cite the line you actually read.
4. Be exhaustive about the *procedure* and conservative about the *vocabulary*: every
   step the spec states gets a step here; only steps that really are a Core Operation
   get an `operation`.
