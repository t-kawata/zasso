---
description: Explain one RFC-SEED.md in plain Japanese — the facts in one document, the explanation in another, and only the human's own judgement left to the human
argument-hint: <path-to-RFC-SEED.md>
disable-model-invocation: true
---

# /explain-seed

In: one `RFC-SEED.md` path. Nothing else.
Out: `INFO-RFC-SEED.md`, `EXPLAIN-RFC-SEED.md` beside it; facts of the first on stdout.
Does: explains; settles every point the AI can ground; grills the human with few direction questions over multiple rounds; settles the rest from the answers; writes answers down; ends when zero points are open.
Does not: decide for the human, publish a manifest, start a workflow, invoke another command. Grill = this loop. The downstream design interview is a separate session.

## Core Rule

Never put a point to the human. Put only direction questions.

- point: one recorded open item. The set is not closed: a viewpoint the human brings is refined into an orderly point before it is recorded, and is then a point like any other, put through the same settle-and-bundle filter.
- direction question: one question on a priority, a desired state, or whose experience comes first. One answer lets the AI settle many points itself.
- order: AI settles first; only what it cannot settle is bundled; only the bundle is asked.
- direction ≠ vague. Wide in span, concrete in words: each direction names who, in what situation, gains what, loses what. No implementation term.
- count: questions ≪ points. ≤ 3 per round; ≤ 5 rounds.
- the human sees little: only what the choice needs.
- end: only when the AI has settled every point. Unsettled points remain → new direction questions on those points only.

Upstream (role, not name):
- produces: `RFC-SEED.md`, two manifests, neighbours' explanations
- guarantee: hashes recorded; identity block resolvable
- missing/invalid → stop

Downstream (role, not name): design interview
- consumes: `EXPLAIN-RFC-SEED.md` — human answers under placeholders + settled items
- expects: zero open points; every settled item carries decision + ground + override condition

## The question gate (settle before drafting)

A question may not be drafted until the settle test has been written out and has failed.
For every point about to become a question, write these three lines first, in this order:

- 決定: <what is decided>
- 根拠: <the manifest id, the neighbour document, or `Qn` + letter it rests on>
- 覆す条件: <the fact that would overturn it>

If all three lines can be written, the point is settled: it goes to 「先に決めておいたこと」 and no question is drafted.
Only a point whose three lines cannot be written becomes a question.
The gate’s output is those three lines, not a feeling: a question drafted without them is a defect even if it reads well.
The line that records the failed test is `決められなかった理由`, and it is written where the frame asks for it.

Four inferences this gate forbids. Each has produced a wrong question.

| inference | why it is wrong |
|---|---|
| 「a manifest flag named this point, so it is the human's」 | `handoff_summary.risky_boundaries` is one global list covering many boundaries at once and carries no per-boundary material. **A flag is not a ground and is not weight.** |
| 「a recorded doubt about this record means there is no ground」 | a doubt filed under another package — a `residual` or `grill_question` whose `package_id` is not this package — is not this package's point. Establish whose point it is before treating it as material. |
| 「the doubt itself says only the author can decide, so it must be asked」 | that sentence is material *for* the test above, not an exemption from it. Write the three lines. |
| 「the point is weighty, so it is the human's」 | weight alone does not bind a point to a question. The binding condition is weighty **and** no ground. A ground the AI has not looked for is not an absent ground. |

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
Resolve: package + three reference paths from seed's identity block; workspace root = nearest ancestor dir holding both `WORKSPACIFY-TREE-MANIFEST.json` and `WORKSPACIFY-ALLOCATE-MANIFEST.json` — the order is read from the tool that owns the ordering rule, and that tool resolves the same pair. Neighbours = packages at the other end of every boundary this package is a party to, found by the paths the stage-one manifest records for those package ids.
second arg: `next` alone takes one — the round size — and `info`, `check` and `answers` take none. A second arg given to those three, dialogue, env var, hook, fetch → refuse; exit non-zero.

## Artifacts

Ledger: every point is exactly one of `open` (nothing names it) | `bound(Qn)` (a question's bound-points line names it) | `settled(ground)` (a pre-decided item carrying a ground names it). No two of the three overlap, and the universe — the recorded open set together with the points this document adds — is exactly the three together. unsettled = `open` ∪ `bound` — every point not carried in 「先に決めておいたこと」 with a ground. Script-derived, never written to a file.
Added point: a viewpoint the human brought, refined into one point and written into the human's section as a frame-marked block — `<!-- explain-seed:added-point id="added-NNN" -->` … `<!-- /explain-seed:added-point -->`, carrying 出どころ (the human's own words it was refined from) and 論点 (one line). It lives in the maintained section, so an `info` run carries it across. Refused without a reserved id (`added-NNN`), an origin, or a statement.

`INFO-RFC-SEED.md` — record, English, script-authored from the two manifests + seed + specification + neighbours' explanations; same bytes on stdout.
- every fact names its source identifier; empty section says so
- no explaining/evaluating/advising sentence — AI works from this
- section 2: implementation order read from `.claude/scripts/workspacify-order/run.mjs` (derives levels; refuses an order disagreeing with the published one); serial relations (declared edges only) and parallel relations (same level) as two separate axes; a different level is not an ordering
- section 10: every boundary a neighbour has settled — neighbour, its document, decision verbatim. Grounds 「先に決めておいたこと」; a decision moving there reopens the introduction, the human's section, the pre-decided section
- verbatim, untranslated (Japanese): quoted specification text, manifest-carried names, a neighbour's recorded decision

`EXPLAIN-RFC-SEED.md` — explanation, Japanese, dual-authored.
- script writes frame: 7 sections, ledger of points, `[::MUST-FILL::]` markers (AI fills), `<!-- 人間の判断 -->` placeholders (human fills)
- frame holds no per-point question; `run.mjs next` appends numbered empty question blocks
- question block: number (written by `next`, never by the AI, and never renumbered), context, directions `A` `B` (`C` allowed), one recommended, reason, overturning fact, scope line; bound point ids + record copy under it as AI-only, frame-marked not for the person, never echoed in chat
- settled item: decision, ground, override condition
- numbers continue across rounds; no renumbering
- human's writing under placeholders is what the downstream design interview reads
- complete only when `answers` exits 0

no mixed languages inside either document.
Command's own reports (kept/reopened, gate verdict, round count) → stderr, English.

## Invariants

- verify-before-write: every recorded hash recomputed and agreed before first byte exists; mismatch → exit non-zero, neither document written; an earlier document changes what is preserved, never what is verified
- no point vanishes: each is open, bound, or settled with ground; an open point is never the ground of a decision
- settlement needs ground: manifest id, neighbour document, or `Qn` + letter; an answer-grounded decision must be entailed by that answer; else refused
- AI-first: a point whose result is light and reversible → AI settles it, with override condition. Weighty or hard to reverse, and no ground → bound to a direction question
- a point the document adds is a point: judged by the same filter, never silently dropped, and reaching the human only through the same ≥2-point bundle
- no direction question binds fewer than 2 points, unless fewer than 2 points are open
- read-only toward workspace; only files created = the two documents; a neighbour's explanation is read, never written
- a boundary a neighbour clearly settled is never asked: it stands in 「先に決めておいたこと」 with the neighbour's document as ground. Clearly settled = every readable neighbour document holds the same answer — one distinct decision, however many documents carry it — under that boundary's placeholder; an unexplained neighbour is ordinary and the question stands
- unreadable neighbour document settles nothing; named on stderr; never read for salvage; never fails the run; direction = ask again, never settle on a guess
- order facts never optional: order unreadable, or published order disagreeing with its own edges → fail at G1
- each question: numbered by frame; context for a person who knows neither implementation nor design; ≥2 directions distinguishable by consequence (two lines under one letter = one direction); exactly one recommended; reason checkable against records; overturning fact; scope line; placeholder one whole line, below directions, above answer
- AI never writes an answer for the human; never leaves a question unanswered or a point unsettled to pass a round
- `check` is the gate; AI reports only a gate-accepted explanation

## Scripts

Base: `.claude/scripts/explain-seed/`.

| Script | Contract |
|---|---|
| `run.mjs info <path>` | resolves, verifies, reads implementation order from `workspacify-order`, reads neighbours' explanations for settled boundaries, writes facts + prints those bytes, writes frame + ledger beside seed. exit 0 = published; non-zero = names offending artefact. stderr: kept / reopened; unreadable neighbour documents |
| `run.mjs next <path> <n>` | appends n empty numbered question blocks; numbers continue; n ≤ 3; refuses past round 5, or when no point is open; rewrites nothing existing. non-zero = names reason |
| `run.mjs check <path>` | gate: exit 0 only if every instruction answered; every question has context, ≥2 directions, one recommendation, overturning fact, scope line, ≥2 bound points; every settled item has ground + override condition; no point vanished; every section rests on current facts. else names sections at fault, exit non-zero |
| `run.mjs answers <path>` | verdict: exit 0 only if every question carries an answer under its placeholder AND ledger unsettled = 0 (no point left `open` or `bound`); else names unanswered questions and unsettled points, exit non-zero. reads, writes nothing |

## Criteria

Prose quality = judgement, not script. Tables guide one integrated judgement over all own prose before reporting. Borderline → judge by this standard, not nearest row. This section governs every `[::MUST-FILL::]` instruction; disagreement → this section wins, fix the instruction.

Gate catches none of the tables. judge: apply all, item by item, before Step 3's gate call.

### The question

judge: apply per question when writing (Step 2, Step 4e) and asking (Step 4a).

| id | rule |
|---|---|
| W1 | plain Japanese a high-school student can answer: no unglossed term of art; no sentence needing implementation or design to parse; no sentence needing the record to be read |
| W2 | never technical: AI settles API, type, algorithm, field, how; human gives only direction |
| W3 | choosable from the weight of the result alone, from the question's own context alone |
| W4 | each direction states what happens and to whom; mechanism without consequence ≠ direction |
| W5 | exactly one recommended, stated as a choice, never a decision taken; reason checkable against records; overturning fact stated |
| W6 | asked once. neighbour-settled boundary never asked. answered axis never re-asked; a later round asks a new axis built from the still-open residual and added points only |
| W7 | numbered `Q1: ` `Q2: ` … by frame; answer names its question |
| W8 | answered by letter; prose is added to the letter, never replaces it. A free answer with no letter means the question was not answered — never a reason to discard what it raised |
| W9 | self-contained: context glosses every design term the directions and reason use |
| W10 | direction-level: asks priority / desired state / whose experience first; never a single point; scope line states in one line what the answer lets the AI settle |
| W11 | minimal: ≤ 3 sentences context; ≤ 2 per direction; 1 reason; 1 overturning fact; no ids, clause names, point lists, record text, deliberation. test: remove it — still choosable? → remove |
| W12 | concrete: each direction names who, in what situation, gains what, loses what |

judge: W1–W5, W9–W12 fail → fix prose (G2, G3). Never lower the question to fit the answer; never move it to 「先に決めておいたこと」 to silence it.
W7: AI reads the number, never counts it. W8: AI records letter and prose, never supplies the letter; a letterless free answer is unanswered, and what it raised is refined into a point rather than dropped.

### The question's shape

judge: apply per question, in addition to W1–W12, when writing (Step 2, Step 4e) and when asking (Step 4a).

| id | rule |
|---|---|
| W13 | opinion first: the question opens with the AI's own conclusion **in words** and its reason, before any option letter or alternative is offered |
| W14 | define before use: no letter, id or name appears before the line that gives it meaning. The block reads top to bottom with nothing undefined at its point of use — a bare `A` before 選択肢 is a defect |
| W15 | nouns that can be pointed at: no referentless nouns (相手, 整合, 主体, 扱い, 記録のうえで, 立場), no nominalized verbs (取り方, 伝わり方, 中身). test: can the AI point at it? no → rewrite |
| W16 | verbs are events a person can picture (移る, 使えなくなる, 決まる), not bookkeeping verbs (記録する, 扱う, 位置づける) |
| W17 | the remainder is stated as a sentence: 「あなたに残っているのは〜だけです」. If that sentence cannot be written narrowly, the point is not the human's — back to the question gate |
| W18 | every sentence carries all three parts explicitly — 誰が (subject), 何を (object), どうする (predicate, an event) — plus いつ (moment) where a moment applies. The parts stand in the sentence, not in an inference the human must supply. Passive voice and inanimate subjects are rewritten (「値が渡される」→「身元側が値を渡す」). One sentence carries one proposition; a sentence that reads 「〜して、〜して、〜する」 is split |
| W19 | one name per thing: the specification's own noun is used, glossed once at first use, and never replaced by a parallel coinage. Writing two names for one thing in one breath (「フォーラム（forum、掲示板）」, 「身元（soul）」) is forbidden — it makes the human hold a mapping table |
| W20 | noun phrases stay shallow: at most one relative clause per noun. A clause-modified abstract noun (「〜する〜する相手」) is rewritten as a sentence with its own actor and verb |
| W21 | when the AI's conclusion and the remaining choice are the same thing, say so. The remainder is then 「あなたに残っているのは、この結論を覆す事実があるかどうかだけです」 — never an open A/B, which would ask the human to re-decide what the AI just decided |

**The reference form of the opening**, as the human asked for it:

> 私は〈理由〉という理由で〈結論〉とするのが良いと思っていますが、選択の余地は以下の部分に少しだけ残ります。

Lines 2–4 of the block below are this one sentence, separated so each part can be checked. Keep the three-part shape (conclusion → what is settled → how little remains) even when the AI rephrases; do not drop the third part, which is what makes the question narrow.

Technical nouns are not the difficulty: Soul, フォーラム, 鍵, 譲渡 are things and are fine. Referentless words are the difficulty.

Scoping decision, recorded here so the prose says which it is: W13–W21 are question rules. The Criteria section above continues to govern every `[::MUST-FILL::]` instruction, including the section prose (E1–E7); these nine govern the questions put to the human.
These rules govern the **chat message** as well as the document block. The human reads the chat message first; a block that reads well does not excuse a message that does not.

### The question block, in order

Every line is written before the next one. The chat message is this block, in this order, with the AI-only region omitted.

1. 状況 — who does what, when, with what consequence. 2–3 sentences. No design words.
2. 私の結論 — the AI's own answer, in words, with its reason. No option letter yet.
3. すでに決まっていること — one sentence: 「これ以外は決まっています」. Never an enumeration of the AI's own work.
4. 残っている選択 — one sentence: 「あなたに残っているのは〜だけです」.
5. 選択肢 — `A: <meaning>` / `B: <meaning>`. The letters appear here for the first time, each with its meaning on its own line.
6. 推奨 — the letter, now that it is defined.
7. 推奨が覆る条件 — the fact that would change it.

If line 2 cannot be written at all, or line 4 cannot be written narrowly, stop: go back to the question gate.

Sentence pass, before the read-back: take the block one sentence at a time and fill four slots for each — 誰が / 何を / どうする / いつ.
A slot that cannot be filled means the sentence is rewritten there and then, not carried to the gate.
A sentence whose 何を slot turns out to be a clause (「〜のか〜のかが決まっていません」) has no object at all; rewrite it as a sentence whose object is a thing.
A sentence whose 誰が slot is a document, a record or an abstraction (「契約が定めている」「書き方が無い」) is rewritten with the person who does it.

Read-back, before the block is written into the document or the message is sent:
read the block top to bottom, one line at a time, and at each line ask whether every name, letter and term in it has already been given its meaning above.
A line that introduces a name its reader has not met is a defect at that line. Fix the line; do not add a gloss later in the block.

### Examples

Good (Japanese, as shown to the human):

> Q1: サーバーの調子が悪いとき、このアプリを使っている利用者にどう振る舞ってほしいですか。
> A: 「いまは使えません」と正直に止めて知らせる。使えない時間が出るが、間違った内容は見ない。
> B: 古い情報や簡単な結果でも出し続ける。使い続けられるが、古い内容を見ることがある。

> Q2: 利用者が入力した内容を、どこに置きますか。
> A: 利用者の端末の中だけに置く。他の端末では見られないが、外に漏れる危険は小さい。
> B: サーバーにも保存する。どの端末でも見られるが、サーバーが攻撃されると内容が漏れる危険がある。

> Q3: このシステムを後から引き継ぐ開発者の、どの負担を軽くしますか。
> A: 最初に覚えることを減らす。機能を足すとき、作り直しが出やすい。
> B: 機能を足しやすくする。引き継いだ直後は覚えることが多い。

Bad:

| label | example | fail |
|---|---|---|
| point-question | 「失敗時の再試行は3回か5回か」 | technical; AI settles |
| vague-actor | 「手間と見落としのどちらを重く見るか」 | who, what unnamed; unchoosable |
| question-flood | 「エラー表示は?」「キャッシュは?」「再試行は?」を別々に聞く | one direction asked as many questions |

Bad, from this pipeline, with the tell that classifies it:

| label | what was asked | the tell, and where it belongs |
|---|---|---|
| dressed point-question | 「この境界を value_only として記録するか state_transition として記録するか」 | the answer changes only a record's label; no person's experience changes. **Tell: the party line cannot name anyone.** → settle (U1) |
| mechanism question | 「掲示板は鍵の交代や凍結をどうやって知りますか」 | asks *how* the coupling is implemented. **Tell: the directions are mechanisms (pull / push), not outcomes.** → settle (W2) |
| actorless question | 「この2つの間で、いまの鍵や手続きの状態をどう渡しますか」 | **Tell: the sentence has no subject.** → W4, W15 |
| unreadable question | 「身元側の手続きに参加して自分の状態を変える相手」 | **Tell: the noun cannot be pointed at; the verb is a bookkeeping verb.** → W15, W16 |
| forward reference | 「私の結論は A です」 before the 選択肢 block | **Tell: the letter is used before it is defined.** → W14 |

Good, the same content written to be read top to bottom. This point should have been settled, so the example shows shape only.

> Soul の持ち主が替わると、その Soul が持っているフォーラムの運営権も、新しい持ち主に移ります。古い持ち主の鍵は、その瞬間から使えなくなります。
> 私の結論は、フォーラムは Soul が決めた結果を受け取るだけで自分では何も決めない、というものです。理由は…。これ以外は決まっています。
> あなたに残っているのは一点だけです。フォーラムは運営権を、次のどちらとして持つかです。
> - A: Soul から渡された内容で決まる。自分では決めない。
> - B: フォーラムが自分で運営権を決める。
> 私は A を推します。覆る条件は…。

### Kind

| id | check | fail pattern |
|---|---|---|
| K1 | human's list = only directions only a human can give | engineering question; point-question |
| K2 | each question states decision + whose experience changes + consequence of leaving it undecided | stakes-less question |
| K3 | human's own words; terms of art explained or replaced | spec vocabulary untranslated |
| K4 | settled items carry ids / clause names / line numbers, checkable against facts doc; ground names Qn + letter | unverifiable claim; groundless settlement |
| K5 | omissions declared (count trimmed, boundary uncovered) | silent gap |
| K6 | explanation length ≤ facts length | explanation longer than facts |
| K7 | each direction says what happens and to whom | mechanism-only direction |
| K8 | recommendation names its overturning fact | unchangeable recommendation |
| K9 | choosable from what the result costs | question needing implementation or record |
| K10 | question stands alone | context glossing other sections' terms but not this question's |
| K11 | human sees little: few questions, short bodies | over-attached detail; question flood |
| K12 | each settled point derives from its cited answer | settlement beyond what the answer entails |

judge: evaluate against source, not cached summaries.

### Unfit to report

| id | check | fail pattern | self-question |
|---|---|---|---|
| U1 | engineering never reaches the human | question the AI could already ground | can I write 決定・根拠・覆す条件 now? yes → settle |
| U2 | weighty experiential point not settled without ground | AI-settled weighty point with no manifest, neighbour, or answer behind it | light and reversible? no → bind to a direction question |
| U3 | question names whose experience changes | vague or restated question | — |
| U4 | vocabulary translated where the question is | spec term unglossed, or glossed elsewhere | — |
| U5 | prose interprets, not restates | 「〜と記録されています」 in place of 「だから何を決めるのか」 | — |
| U6 | check/change stated concretely | empty politeness (「ご確認ください」「重要です」) | — |
| U7 | override condition real and specific | formulaic override that never fires | — |
| U8 | answer proportionate to question | thinness passed off as brevity | — |
| U9 | question carries a proposed direction | direction-less question = work handed back | can the human answer by choosing? no → directions missing |
| U10 | overturning condition can fire | formulaic condition | — |
| U11 | answerable by someone who has read nothing else | question needing design recalled or record read | could a person who read only this answer? no → context missing |
| U12 | question is a direction | one question per point; question count ≈ point count | can ≥ 2 points be settled from one answer? yes → merge |
| U13 | question is lean | detail beyond what the choice needs | remove it — still choosable? yes → remove |
| U14 | no repeated asking | re-asking an answered axis; same point reworded | what did the earlier answer fail to entail? ask only that |
| U15 | question is concrete | vague-actor: who or what unnamed | can I point to who gains and who loses? no → rewrite |

fail → AI fixes before Step 3, or names the item thin in Step 5.

## Gates

G0 arg     : one resolvable path → fail: stop
G1 info    : `run.mjs info "$ARGUMENTS"` exit 0 → fail: stop (report as-is; no repair; no retry with other args; no hand-authored doc)
G2 fill    : every `[::MUST-FILL::]` replaced per its own instruction → fail: back to G2
G3 kind    : self-judged, one integrated judgement, against Criteria → fail: fix, re-judge; unfixable → proceed; Step 5 names item thin
G4 check   : `run.mjs check "$ARGUMENTS"` exit 0 → fail: back to G3
G5 answers : `run.mjs answers "$ARGUMENTS"` exit 0 → fail: next round (Step 4e); `next` refuses → stop
Rule: G0–G2 — parent not PASS ⇒ child never PASS.
Rule: G5 asks only an explanation G4 accepted; G4 accepts only an explanation G2 filled.
Exception: G4 PASS ≠ G3 PASS; G4 structural only.
Prohibition: never resolve a G4 failure by moving a question into the pre-decided section.

## Flow

1. **Write facts, write frame** — `node .claude/scripts/explain-seed/run.mjs info "$ARGUMENTS"`
   G1. fail: report stderr diagnosis (artefact + field) as-is; repair nothing; no retry with another argument; no hand-authored document.

2. **Settle and bundle** — auto; never ask.
   Read facts on stdout. Replace every `[::MUST-FILL::]` with Japanese prose per its instruction.
   judge, per point — recorded or added from what the human brought — in order; first match wins:
   - Q0 published? Order, levels, edges, parallel set = records. Never ask; never write as a decision just taken. Order disagreeing with its own edges = broken manifest: name `WORKSPACIFY-ALLOCATE-MANIFEST.json`'s `implementation_order`.
   - Q0' neighbour-settled? Boundary = party-record of exactly two packages. Clearly settled → 「先に決めておいたこと」: neighbour's words as 決定, its document as 根拠. no re-ask, no reopen, no move back. AI supplies only 覆す条件, a fact about *this* package. Gate refuses an item asking it (`unrecorded-decision`) and requires the 根拠 naming it. Not settled next door → continue.
   - Q1 engineering? Can ground + decision + override condition be written now from manifests? yes → 「先に決めておいたこと」.
   - Q2 light and reversible? Result small for any person, cheap to undo → settle with ground + override condition → 「先に決めておいたこと」.
   - Q3 remaining = weighty or hard to reverse, no ground → cluster by direction: fewest axes such that one answer each lets the AI settle every bound point. ≥ 2 points per axis; ≤ 3 axes per round; overflow stays open for later rounds. An added point steps through Q1 and Q2 first and, if it survives, is clustered here with the rest — no looser path.
   Then `run.mjs next "$ARGUMENTS" <axes>`; fill each block per Criteria; bind points under it as AI-only record; leave `<!-- 人間の判断 -->` blank.
   Batch-write, per item: directory purpose in human's words → context for a person knowing neither implementation nor design → what is decided → whose experience changes → consequence if undecided → (question: placeholder blank) / (settled item: override condition; do not reopen).
   Position section only: serial axis = declared edges and nothing else; parallel axis = same level, level rule as ground. Restating level numbers is not an answer.
   preserve: quoted material, ids, clause names per item; directory paths the order block prints.
   no AI-added `##` heading. no editing the facts document — facts wrong → name the offending manifest.

3. **Self-judge, then gate** — auto; never ask.
   Heal-loop kind+check:
     judge: apply Criteria as one integrated judgement over own prose and questions; fix what is caught (G3).
     check: `node .claude/scripts/explain-seed/run.mjs check "$ARGUMENTS"` (G4)
     ok → next
     fail → judge: fix per stderr's named sections; re-run check
   Never report a gate-refused explanation. Never weaken an item to pass G4.

4. **Grill loop** — a: ask; stop. b: auto. c: auto; never ask. d–e: auto.
   Round:
   a. ask: put every unanswered question as `Q<n>: `.
      shown: context; directions `A` `B` (`C` where useful); recommendation as a choice; reason; overturning fact. Scope line → in the document only.
      not shown: point list, ids, clause names, record text, deliberation.
      judge: W1–W12 per question and W13–W21 per question; unanswerable from what is written → context or directions missing, not the answer; fix (G2), re-run G4, ask again. The one who asks carries the context.
      before asking: perform the block's sentence pass and read-back (see Criteria → The question block, in order) and confirm that the document block and the chat message are the same content in the same order. The human reads the message first; a block that reads well does not excuse a message that does not.
      A reply that is not an answer (no letter, W8) is evidence about the *point*, not only about the prose. Before rewriting anything, re-run Step 2's Q0–Q3 on that point and write the three lines out (the question gate). Re-ask the axis only after that gate has failed again, in writing.
      Prose-only repair of a question the human could not answer is a defect: it spends the human's round on the AI's classification error.
      Three consecutive prose repairs of one question → stop; settle the point or name it misclassified in Step 5.
   b. record: under the question's `<!-- 人間の判断 -->`, lines below: letter + human's prose. placeholder line untouched. never answer for the human; never fill a placeholder to pass G5.
   c. refine, then settle: if the answer raises a viewpoint no recorded point covers, refine it into one point and record it in the human's section as an added-point block (reserved id `added-NNN`, 出どころ = the human's own words it came from, 論点 = one line). It is a point like any other. Then per point bound to an answered question, judge: does letter + prose entail a decision?
      yes → 「先に決めておいたこと」: 決定, 根拠 (`Qn` + letter, + manifest ids), 覆す条件.
      no → point stays open; note what the answer failed to entail. Never guess. An added point takes the same ladder: settled here if the answer entails it, bound next round if it does not.
   d. gate: `run.mjs check` (G4); fail → fix per stderr; re-run.
   e. verdict: `node .claude/scripts/explain-seed/run.mjs answers "$ARGUMENTS"` (G5)
      exit 0 → leave loop
      unanswered question remains → a, those questions only
      open points remain → re-run Step 2's Q0–Q3 on residual points and added points alike; `run.mjs next "$ARGUMENTS" <axes>`; new axis per U14; → a
      `next` refuses (round cap, or nothing open) → stop; report residual points; settle none.

5. **Report** — Japanese, ordered; written after loop exit; reports what was decided:
   package location + contents (human is about to hold a design conversation)
   → each question by round, with the letter + prose written under it
   → each settled point: decision, ground (`Qn` + letter / manifest), override condition — grouped by the question that settled it; AI-settled items with reason (state plainly if none)
   → rounds used; points left open if stopped at cap
   → thin items named per Unfit table, if any
   → per question: whether only a human could answer it, and the three lines that could not be written (that is the evidence)
   → any question the settle gate would have settled: named, with the three lines it should have produced
   → one line: human's judgement stands under each `<!-- 人間の判断 -->`; the downstream design interview reads it
   no hand-editing either document; wrong → inputs wrong → regenerate.

Done: both documents exist, published; facts printed once; G4 passed; G5 passed (every question answered, ledger unsettled = 0 — no point left `open` or `bound`); report written after loop exit, naming every G3-caught-but-unfixed item.
