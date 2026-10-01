---
description: Explain one RFC-SEED.md in plain Japanese — the facts in one document, the explanation in another, and only the human's own judgement left to the human
argument-hint: <path-to-RFC-SEED.md>
disable-model-invocation: true
---

# /explain-seed

In: one `RFC-SEED.md` path. Nothing else.
Out: `INFO-RFC-SEED.md`, `EXPLAIN-RFC-SEED.md` beside it; facts of the first on stdout.
Does: explains, then asks each recorded question once — with directions, one of them recommended, the reason, and what would overturn it — and writes the human's answer down, until `run.mjs answers` says every question carries one.
Does not: grill, decide for the human, publish a manifest, start a workflow. The grill stays the open-ended conversation this asking round is not.

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
Resolve: package + three reference paths from seed's identity block; workspace root = nearest ancestor dir holding both `WORKSPACIFY-TREE-MANIFEST.json` and `WORKSPACIFY-ALLOCATE-MANIFEST.json` — the order is read from the tool that owns the ordering rule, and that tool resolves the same pair. The neighbours are the packages at the other end of every boundary this package is a party to, found by the paths the stage-one manifest records for those package ids.
no second arg, dialogue, env var, hook, fetch → refuse; exit non-zero.

## Artifacts

`INFO-RFC-SEED.md` — record, English, script-authored from the two manifests + seed + specification + the neighbours' explanations, same bytes also on stdout.
- every fact names its source identifier; empty section says so
- no explaining/evaluating/advising sentence — this is what the AI works from
- section 2's implementation order is read from `.claude/scripts/workspacify-order/run.mjs`, which derives the levels and refuses to draw an order that disagrees with the published one; section 2 states the serial relations (declared edges only) and the parallel relations (the same level) as two separate axes, and says that a different level is not an ordering
- section 10 lists every boundary a neighbour has already settled, naming the neighbour, its document, and the decision verbatim. It is the section the explanation's 「先に決めておいたこと」 rests on, so a decision moving there reopens the introduction, the human's section and the pre-decided section
- exception: quoted specification text, manifest-carried names, and a neighbour's recorded decision stay verbatim (Japanese), untranslated — a translated quote would no longer be a record of it

`EXPLAIN-RFC-SEED.md` — explanation, Japanese, dual-authored.
- script writes the frame: 7 sections, `[::MUST-FILL::]` markers (AI fills), `<!-- 人間の判断 -->` placeholders (human fills), pre-decided items carrying ground + override condition
- every question in 「人間が決めること（ここだけ）」 carries the number it is asked under, its own context — written for a person who knows neither the implementation nor the design — the directions it may be answered with, the one recommended, the reason, and the fact that would overturn it; the material under it is the record verbatim, marked by the frame as a copy that need not be read
- human's writing under the placeholders is what `/grill-me-for-rfc` reads next
- the document is complete only when every question carries an answer under its placeholder; that is what `answers` decides, and a question with no answer is not a document this command has finished with

no mixed languages inside either document.
Command's own reports (kept/reopened, gate verdict) → stderr, English.

## Invariants

- verify-before-write: every recorded hash recomputed and agreed before first byte exists; mismatch → exit non-zero, neither document written; an earlier document changes what is preserved, never what is verified
- no recorded open item may disappear: each is asked of the human, or decided in the pre-decided section; an open item is never the ground of a decision
- read-only toward the workspace; the only files created are the two documents; a neighbour's explanation is read and never written
- a question a neighbour has clearly settled is never asked of this human: the boundary leaves the human's section and is recorded in 「先に決めておいたこと」 with the neighbour's document as its ground. "Clearly settled" means every neighbour document that could be read holds the same answer — one distinct decision, however many documents carry it — under that boundary's placeholder; a neighbour that has not been explained yet is ordinary and the question stands
- a neighbour document that exists but cannot be read settles nothing and is named on stderr. It is never read for whatever can be salvaged, and a run never fails because another package's document is malformed — the direction is always to ask again, never to settle on a guess
- the order facts are never optional: a workspace whose order cannot be read, or whose published order disagrees with its own edges, fails at G1 rather than producing a section 2 without relations
- every question in 「人間が決めること（ここだけ）」 is numbered by the frame, opens with the context a person who knows neither the implementation nor the design needs in order to answer it from the question alone, and offers at least two directions a person can tell apart — two lines written under one letter are one direction — exactly one of them recommended, a reason the records can be checked against, and the fact that would overturn the recommendation; the recorded material stands in the record's own words under a frame-written line saying it is a copy the person need not read; the placeholder stays one whole line, below the directions and above the answer
- the asking round is over only when every question carries an answer: `run.mjs answers` decides that, and the AI never writes the answer on the human's behalf, and never leaves a question unanswered to make the round pass
- `check` is the gate; AI may report only a gate-accepted explanation

## Scripts

Base: `.claude/scripts/explain-seed/`.

| Script | Contract |
|---|---|
| `run.mjs info <path-to-RFC-SEED.md>` | resolves, verifies, reads the implementation order from `workspacify-order`, reads the neighbours' explanations for boundaries already settled, writes the facts + prints those bytes, maintains the explanation beside the seed. exit 0 = published; non-zero = names the offending artefact. stderr reports what was kept / reopened, and names any neighbour document it could not read |
| `run.mjs check <path-to-RFC-SEED.md>` | gate: exit 0 only if every instruction answered, every human question offers directions and a recommendation and names whose experience changes, no recorded open item vanished, every section rests on current facts. else names sections at fault, exit non-zero |
| `run.mjs answers <path-to-RFC-SEED.md>` | the asking round's verdict: exit 0 only if every question in 「人間が決めること（ここだけ）」 carries an answer under its placeholder; else names the questions still open, exit non-zero. reads, writes nothing |

## Criteria — the question, Kind, and Unfit to report

Kindness is a judgement about prose, not a script; a test that claimed to measure it would measure the taste of whoever wrote the test. The tables below are not a line-by-line mechanical pass — they guide one integrated judgement the AI makes over the whole of its own prose, before reporting. On an unlisted or borderline case, judge by this standard, not by whichever row looks closest.

This section is the standard, not the place the AI meets it — it governs all three tables below. Each `[::MUST-FILL::]` instruction is where the standard is actually applied. If an instruction and this section ever disagree, this section is wrong and should be fixed.

None of the three tables is caught by the gate. judge: apply all of them, to the AI's own prose and to its own questions, item by item, before Step 3's gate call.

### The question

Rules for the question itself — the one put to the human. judge: apply per question, when writing it (Step 2) and when asking it (Step 4).

| id | rule |
|---|---|
| W1 | plain Japanese a high-school student who knows neither the implementation nor the design can answer: no unglossed term of art, no sentence that needs the implementation or the design to parse, no sentence that needs the record standing above it to have been read |
| W2 | never a technical question. the AI settles the technical part — which API, which type, which algorithm, which field, how it is carried out — and the human is asked only for the direction: what should happen, what state things should be in, whose experience changes how |
| W3 | the test is not whether the words can be read but whether a choice can be made: someone who knows neither the implementation nor the design must be able to pick a direction from the weight of the result alone, having read the question's own context and nothing above it |
| W4 | each direction states what happens and who it happens to; a mechanism with no consequence is not a direction |
| W5 | exactly one direction recommended, the reason checkable against the records, the fact that would overturn it stated |
| W6 | asked once. a boundary a neighbour has settled is recorded in 「先に決めておいたこと」 and never asked here (§Invariants, Q0') |
| W7 | numbered. every question is put as `Q1: `, `Q2: ` … — the number the frame writes beside it — so an answer can name the question it answers and the next round names the same ones |
| W8 | answered by letter. the directions are put as `A` and `B`, and `C` only where the records leave a third reading; the human answers with one of those letters, and prose of the human's own is added to that letter, never put in place of it |
| W9 | self-contained. the context the question opens with is written for a person who knows neither the implementation nor the design, so every design term its directions and its reason name is glossed there, and no recorded line standing above the question has to be read; the question is answerable from itself alone, because the one who asks carries the context, never the one who is asked |

Mechanised — the script's job, never the AI's: the block skeleton and its markers; the structural rules at G4 — the four about the directions a question offers, and the one about the context it opens with; the completion verdict at G5; the count the introduction declares; the neighbours' settled answers and the refusal to ask a settled boundary again; the placeholder's position and its one-per-question count.
Judged — the AI's job: the sentences of the question; the asking; the writing down of what comes back. A judgement about prose is not mechanised here because a check for it would measure the taste of whoever wrote the check, which is the reason this whole section is a standard rather than a script.

judge: W1–W5 and W9 fail → fix the prose (G2, G3). never lower the question to fit the answer, and never move it to 「先に決めておいたこと」 to silence it.
W7: the frame writes the number; the AI reads it, never counts it. W8: the human gives the letter; the AI records the letter and any prose, never supplies the letter.
W9: the frame writes the place the context goes and the line that says the record under it is a copy; the AI writes the context itself, and the AI cannot answer it with a blank, because G4 refuses a question whose context is empty.

### Kind

| id | check | fail pattern |
|---|---|---|
| K1 | human's list = only what only a human can answer | engineering question left for human to decide |
| K2 | each item states decision + whose experience changes + consequence of leaving it undecided | stakes-less question |
| K3 | human's own words, term of art explained or replaced | spec vocabulary handed over untranslated |
| K4 | ids / clause names / line numbers present, checkable against facts doc | unverifiable claim |
| K5 | omissions declared (count trimmed, boundary uncovered) | silent gap |
| K6 | explanation length ≤ facts length | explanation longer than the facts it explains |
| K7 | each direction says what happens and whose experience it changes | a direction that names only a mechanism |
| K8 | the recommendation says what fact would overturn it | a recommendation nothing could change |
| K9 | a person who knows neither the implementation nor the design can choose from what the result costs | a question answerable only by reading the implementation, or only by reading the record standing above it |
| K10 | the question stands alone: nothing above it must be read to answer it | context that glosses the design terms of another section but not the ones this question uses |

judge: evaluate against source, not cached summaries.

### Unfit to report

| id | check | fail pattern | self-question |
|---|---|---|---|
| U1 | item is not an engineering question | handing back a question the AI could already ground | could I write 決定・根拠・覆す条件 for this item right now? if yes → move to pre-decided |
| U2 | item is not decided silently in pre-decided | experiential question settled without asking | would a reasonable engineer downstream disagree over how it feels, not over the facts? if yes → move to human's section |
| U3 | item names whose experience changes | vague or restated question | — |
| U4 | vocabulary translated where the question is | spec term left unglossed, or glossed only in a section the person was not told to read | — |
| U5 | prose interprets, not restates | 「〜と記録されています」 in place of 「だから何を決めるのか」 | — |
| U6 | check/change stated concretely | empty politeness (「ご確認ください」「重要です」) | — |
| U7 | override condition real and specific | decision beyond question, formulaic override that never fires | — |
| U8 | answer proportionate to the question | thinness passed off as brevity | — |
| U9 | the question carries a proposed direction | a question handed over with no direction proposed is work given back, not a question | could the human answer this by choosing? if no → the directions are missing, not the answer |
| U10 | the recommendation's overturning condition can fire | a formulaic condition that never fires is not a reason | — |
| U11 | the question is answered by someone who has read nothing else | a question whose answer needs the design recalled, or the record above it read | could a person who has read only this question answer it? if no → the context is missing, not the human |

fail → AI fixes before Step 3, or names the item as thin in Step 5's report.

## Gates

G0 arg     : one resolvable path                          → fail: stop
G1 info    : `run.mjs info "$ARGUMENTS"` exit 0            → fail: stop (report as-is; no repair; no retry with other args; no hand-authored doc)
G2 fill    : every `[::MUST-FILL::]` replaced per its own instruction → fail: back to G2
G3 kind    : self-judged, one integrated judgement, against Kind/Unfit standard → fail: fix, re-judge; if unfixable → proceed, but Step 5 must name the item thin
G4 check   : `run.mjs check "$ARGUMENTS"` exit 0            → fail: back to G3
G5 answers : `run.mjs answers "$ARGUMENTS"` exit 0          → fail: back to Step 4 with the questions it named, never by answering one on the human's behalf
Rule: G0–G2 — parent not PASS ⇒ child never PASS.
Rule: G5 may ask only an explanation G4 accepted, and G4 may accept only an explanation G2 filled — a question put to the human on a document the gate refused is a question about a document that does not exist yet.
Exception: G4 PASS does **not** imply G3 PASS. G4 is structural only.
Prohibition: never resolve a G4 failure by moving a question into the pre-decided section to silence the gate — that is exactly the delegation this command exists to remove, even when the gate would then accept it.

## Flow

1. **Write facts, maintain explanation**
   `node .claude/scripts/explain-seed/run.mjs info "$ARGUMENTS"`
   G1. On fail: report the stderr diagnosis (artefact + field) as-is; repair nothing; do not retry with a different argument; do not produce a document by hand.

2. **Write the explanation** — auto; never ask.
   Read facts on stdout. Replace every `[::MUST-FILL::]` with Japanese prose per the instruction it carries.
   judge, per item, in this order:
   - Q0 (already published?): does the published implementation order already answer it? → the order, the levels, the edges and the parallel set are records, not questions. Never ask the human to re-decide the order, the levels, the edges or the parallel set, and never write any of those into 「先に決めておいたこと」 as a decision just taken. An order that disagrees with its own edges is a broken manifest, not a question: name `WORKSPACIFY-ALLOCATE-MANIFEST.json`'s `implementation_order`.
   - Q0' (already settled next door?): a boundary is a party-record of exactly two packages, so the same question is asked at both ends. The script has already read the neighbours' explanations: a boundary a neighbour has clearly settled is absent from 「人間が決めること（ここだけ）」 and stands in 「先に決めておいたこと」 with the neighbour's words as 決定 and its document as 根拠. Do not re-ask it, do not re-open it, and do not move it back. The boundary is not an open item of this document, so the gate refuses an item asking it (`unrecorded-decision`) — and it accepts, indeed requires, a 根拠 naming it, because the script has already written that ground and a decision whose ground is missing is refused too. What the neighbour decided is a record, exactly like a published order; the AI supplies only 覆す条件, and that condition must be a fact about *this* package, not a reason to have asked the question again. A boundary that is still a question here was not settled next door, which usually means no neighbour has been explained yet: ask it normally.
   - Q1 (engineering?): could I write ground + decision + override condition for this right now, pointing at the manifests? → yes: write it in 「先に決めておいたこと」, not the human's section.
   - Q2 (human's?): would a reasonable engineer downstream disagree over how it feels, not over the facts? → yes: write it in 「人間が決めること（ここだけ）」.
   Batch-write, per item, order: directory purpose in human's words → what a person who knows neither the implementation nor the design must be told (the item's own context) → what is decided → whose experience changes → consequence if undecided → (human item: leave `<!-- 人間の判断 -->` blank) / (pre-decided item: override condition, do not re-open).
   In the position section only: write the serial axis as the declared edges and nothing else — a different level is not an ordering — and the parallel axis as the same level, giving the level rule as the ground. Restating the level numbers is not an answer.
   preserve (do not strip): quoted material, ids, clause names per item; the directory paths the order block prints.
   no AI-added `##` heading. no editing the facts document — if facts are wrong, name the offending manifest instead.

3. **Self-judge, then gate**
   Heal-loop kind+check:
     judge: apply Kind/Unfit standard as one integrated judgement over own prose; fix what is caught (G3).
     check: `node .claude/scripts/explain-seed/run.mjs check "$ARGUMENTS"` (G4)
     ok → next
     fail → judge: fix per stderr's named sections; re-run check
   G4 pass ≠ G3 satisfied (see Gates exception). Never report a gate-refused explanation. Never weaken an item to pass G4.

4. **Ask, and write down what comes back** — put the questions to the human before reporting anything about the document. After the human replies, record the answers as below.
   put each question as `Q1: `, `Q2: ` … — the number the frame wrote beside it. the answer names the question; the next round names the same ones.
   never a technical question. which API, which type, which algorithm, which field, how it is carried out → the AI settles from the manifests. the human is asked only for the direction: what should happen, what state things should be in, whose experience changes how.
   judge: apply the W rules of §Criteria to the question being asked — plain Japanese a high-school student who knows neither the implementation nor the design can answer, choosable from the weight of the result alone and from nothing standing above the question.
   directions as `A` and `B`; `C` only where the records leave a third reading. each says what happens and who it happens to. one recommended, with the reason and the fact that would overturn it. state the recommendation as a choice, never as a decision already taken.
   answer: one of those letters, plus prose of the human's own if any. the letter is the answer; the prose is added to it.
   write it under that question's `<!-- 人間の判断 -->`, on the lines below. leave the placeholder line untouched — it is the record of where the human writes, and `answers` reads what stands under it.
   then `node .claude/scripts/explain-seed/run.mjs answers "$ARGUMENTS"` (G5). it names every question still open; ask those again, one round at a time, until exit 0.
   prohibition: never answer on the human's behalf; never write a placeholder full to make G5 pass — a filled placeholder records that the question was put, and one answered by the AI is a decision the human never made.
   judge: a question the human cannot answer from what is written there → the context or the directions are missing, not the answer. the one who asks carries the context, never the one who is asked; fix what is missing (G2), re-run G4, ask again.

5. **Report** — Japanese, ordered. Written after the questions are answered, so it reports what was decided and not what is still open:
   package location + contents (human is about to hold a design conversation)
   → each question asked, and what was written under it
   → each frame-decided item with its reason (state plainly if nothing needed deciding)
   → thin items named explicitly, per Unfit table, if any
   → one line: human's judgement stands under each `<!-- 人間の判断 -->`; that is what the grill reads
   no hand-editing either document; if wrong, its inputs are wrong — regenerate.

Done: both documents exist, published; facts printed once; G4 passed; every question answered and G5 passed; the report written after the answers, naming every G3-caught-but-unfixed item.
