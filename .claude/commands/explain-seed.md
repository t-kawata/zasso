---
description: Explain one RFC-SEED.md in plain Japanese — the facts in one document, the explanation in another, and only the human's own judgement left to the human
argument-hint: <path-to-RFC-SEED.md>
disable-model-invocation: true
---

# /explain-seed

In: one `RFC-SEED.md` path. Nothing else.
Out: `INFO-RFC-SEED.md`, `EXPLAIN-RFC-SEED.md` beside it; facts of the first on stdout.
Does not: grill, decide, publish a manifest, start a workflow. Explains; human grills.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Arguments

In: arg: `<path-to-RFC-SEED.md>`, required, only.
Resolve: package + three reference paths from seed's identity block; workspace root = nearest ancestor dir holding `WORKSPACIFY-TREE-MANIFEST.json`.
no second arg, dialogue, env var, hook, fetch → refuse; exit non-zero.

## Artifacts

`INFO-RFC-SEED.md` — record, English, script-authored from the two manifests + seed + specification, same bytes also on stdout.
- every fact names its source identifier; empty section says so
- no explaining/evaluating/advising sentence — this is what the AI works from
- exception: quoted specification text and manifest-carried names stay verbatim (Japanese), untranslated — a translated quote would no longer be a record of it

`EXPLAIN-RFC-SEED.md` — explanation, Japanese, dual-authored.
- script writes the frame: 7 sections, `[::MUST-FILL::]` markers (AI fills), `<!-- 判断内容を人間が書き込む -->` placeholders (human fills), pre-decided items carrying ground + override condition
- human's writing under the placeholders is what `/grill-me-for-rfc` reads next

no mixed languages inside either document.
Command's own reports (kept/reopened, gate verdict) → stderr, English.

## Invariants

- verify-before-write: every recorded hash recomputed and agreed before first byte exists; mismatch → exit non-zero, neither document written; an earlier document changes what is preserved, never what is verified
- no recorded open item may disappear: each is asked of the human, or decided in the pre-decided section; an open item is never the ground of a decision
- read-only toward the workspace; the only files created are the two documents
- `check` is the gate; AI may report only a gate-accepted explanation

## Scripts

Base: `.claude/scripts/explain-seed/`.

| Script | Contract |
|---|---|
| `run.mjs info <path-to-RFC-SEED.md>` | resolves, verifies, writes the facts + prints those bytes, maintains the explanation beside the seed. exit 0 = published; non-zero = names the offending artefact. stderr reports what was kept / reopened |
| `run.mjs check <path-to-RFC-SEED.md>` | gate: exit 0 only if every instruction answered, every human question names whose experience changes, no recorded open item vanished, every section rests on current facts. else names sections at fault, exit non-zero |

## Criteria — Kind, and Unfit to report

Kindness is a judgement about prose, not a script; a test that claimed to measure it would measure the taste of whoever wrote the test. The tables below are not a line-by-line mechanical pass — they guide one integrated judgement the AI makes over the whole of its own prose, before reporting. On an unlisted or borderline case, judge by this standard, not by whichever row looks closest.

This section is the standard, not the place the AI meets it — it governs both tables below. Each `[::MUST-FILL::]` instruction is where the standard is actually applied. If an instruction and this section ever disagree, this section is wrong and should be fixed.

Neither table is caught by the gate. judge: apply both, to the AI's own prose, item by item, before Step 3's gate call.

### Kind

| id | check | fail pattern |
|---|---|---|
| K1 | human's list = only what only a human can answer | engineering question left for human to decide |
| K2 | each item states decision + whose experience changes + consequence of leaving it undecided | stakes-less question |
| K3 | human's own words, term of art explained or replaced | spec vocabulary handed over untranslated |
| K4 | ids / clause names / line numbers present, checkable against facts doc | unverifiable claim |
| K5 | omissions declared (count trimmed, boundary uncovered) | silent gap |
| K6 | explanation length ≤ facts length | explanation longer than the facts it explains |

judge: evaluate against source, not cached summaries.

### Unfit to report

| id | check | fail pattern | self-question |
|---|---|---|---|
| U1 | item is not an engineering question | handing back a question the AI could already ground | could I write 決定・根拠・覆す条件 for this item right now? if yes → move to pre-decided |
| U2 | item is not decided silently in pre-decided | experiential question settled without asking | would a reasonable engineer downstream disagree over how it feels, not over the facts? if yes → move to human's section |
| U3 | item names whose experience changes | vague or restated question | — |
| U4 | vocabulary translated | spec term left unglossed | — |
| U5 | prose interprets, not restates | 「〜と記録されています」 in place of 「だから何を決めるのか」 | — |
| U6 | check/change stated concretely | empty politeness (「ご確認ください」「重要です」) | — |
| U7 | override condition real and specific | decision beyond question, formulaic override that never fires | — |
| U8 | answer proportionate to the question | thinness passed off as brevity | — |

fail → AI fixes before Step 3, or names the item as thin in Step 4's report.

## Gates

G0 arg     : one resolvable path                          → fail: stop
G1 info    : `run.mjs info "$ARGUMENTS"` exit 0            → fail: stop (report as-is; no repair; no retry with other args; no hand-authored doc)
G2 fill    : every `[::MUST-FILL::]` replaced per its own instruction → fail: back to G2
G3 kind    : self-judged, one integrated judgement, against Kind/Unfit standard → fail: fix, re-judge; if unfixable → proceed, but Step 4 must name the item thin
G4 check   : `run.mjs check "$ARGUMENTS"` exit 0            → fail: back to G3
Rule: G0–G2 — parent not PASS ⇒ child never PASS.
Exception: G4 PASS does **not** imply G3 PASS. G4 is structural only.
Prohibition: never resolve a G4 failure by moving a question into the pre-decided section to silence the gate — that is exactly the delegation this command exists to remove, even when the gate would then accept it.

## Flow

1. **Write facts, maintain explanation**
   `node .claude/scripts/explain-seed/run.mjs info "$ARGUMENTS"`
   G1. On fail: report the stderr diagnosis (artefact + field) as-is; repair nothing; do not retry with a different argument; do not produce a document by hand.

2. **Write the explanation** — auto; never ask.
   Read facts on stdout. Replace every `[::MUST-FILL::]` with Japanese prose per the instruction it carries.
   judge, per item, in this order:
   - Q1 (engineering?): could I write ground + decision + override condition for this right now, pointing at the manifests? → yes: write it in 「先に決めておいたこと」, not the human's section.
   - Q2 (human's?): would a reasonable engineer downstream disagree over how it feels, not over the facts? → yes: write it in 「人間が決めること（ここだけ）」.
   Batch-write, per item, order: directory purpose in human's words → what is decided → whose experience changes → consequence if undecided → (human item: leave `<!-- 判断内容を人間が書き込む -->` blank) / (pre-decided item: override condition, do not re-open).
   preserve (do not strip): quoted material, ids, clause names per item.
   no AI-added `##` heading. no editing the facts document — if facts are wrong, name the offending manifest instead.

3. **Self-judge, then gate**
   Heal-loop kind+check:
     judge: apply Kind/Unfit standard as one integrated judgement over own prose; fix what is caught (G3).
     check: `node .claude/scripts/explain-seed/run.mjs check "$ARGUMENTS"` (G4)
     ok → next
     fail → judge: fix per stderr's named sections; re-run check
   G4 pass ≠ G3 satisfied (see Gates exception). Never report a gate-refused explanation. Never weaken an item to pass G4.

4. **Report** — Japanese, ordered:
   package location + contents (human is about to hold a design conversation)
   → grill points: each human-decided question; each frame-decided item with its reason (state plainly if nothing needs deciding)
   → thin items named explicitly, per Unfit table, if any
   → one line: human's judgement goes under each `<!-- 判断内容を人間が書き込む -->`; that is what the grill reads
   no hand-editing either document; if wrong, its inputs are wrong — regenerate.

Done: both documents exist, published; facts printed once; G4 passed; every G3-caught-but-unfixed item named in the report.
