# FIX-PLAN001 — `/explain-seed`: the question gate and the question's prose

Status: instruction for an implementing AI. Nothing here is implemented yet.
Scope: `.claude/commands/explain-seed.md` (prose) and, if Tier 2 is approved, `.claude/scripts/explain-seed/` (code).
Language: this document is English, per the project Language Protocol (design docs, plans, tasks → English).
Japanese strings inside insertion blocks are **verbatim** — copy them byte for byte; do not translate or re-wrap them.
Verification command: `node .claude/tests/run-all.js` (see §6 — there is no `make test` target in this repository).

---

## 1. Background

### 1.1 What was run

`/explain-seed crates/protocol/gaia-soul/RFC-SEED.md` (pkg-0002, gaia-soul). One open point was recorded by the manifests:

- `projection.grill.questions` = `[]`
- `projection.grill.risky_boundaries` = `[{ id: 'boundary-003', topic: null }]`
- `projection.settledElsewhere` = `[]`

So the ledger's universe was `{ boundary-003 }`. The command produced `INFO-RFC-SEED.md` and `EXPLAIN-RFC-SEED.md`, filled 26 `[::MUST-FILL::]` slots, appended one question (`Q1`) with `run.mjs next`, and asked the human. It took **four asks over three rounds of prose rewriting** before the question was answered. The documents were correct at every step; `check` passed on every attempt.

Nothing in the produced documents was wrong. **Both failures were in the asking.**

### 1.2 Failure A — a question the records already answered

`boundary-003` was routed to the human although `contract_registry` settles it:

- `contract-boundary-003` carries `connection_kind: "value_only"`.
- Its `clauses.state_ownership` reads, in part: *"…it reads soul-side state to bind or rotate its root without mutating soul-side state. No write to soul-side state is performed through this boundary."*

The AI wrote the settling lines eventually — as items A15/A16/A17:

```
- 決定: この境界は、身元側が確定した値を掲示板側が読み取るだけの受け渡し（接続種別 value_only）として記録し、…
- 根拠: Q1 A / contract_registry の contract-boundary-003 の connection_kind と clauses.state_ownership
- 覆す条件: 掲示板が、身元側の変化を受けて自分で判断し、自分の運営鍵の世代を進める必要がある、と仕様で定められたとき。
```

Three lines, writable in minutes. They were writable at Step 2 as well, from the same records. **Why they were not written then:**

| what the AI treated as weight | what it actually is |
|---|---|
| `handoff_summary.risky_boundaries` names `boundary-003` | one global list over 32 of 84 boundaries. No per-boundary material. A flag is not a ground and is not weight. |
| `residual-000001` says *"only the manifest's author can say which"* | that residual is filed under **pkg-0003 (gaia-forum)**, not this package. `collectGrillMaterial` filters by `package_id`; this package's copy has `topic: null` by construction. Another package's doubt is not this package's ground. |

The human's verdict:

> Aで良いが、これが人間に問わなければ判断できなかった問いだとは思えない。これは設計上の合理的判断の範囲内で確定できるものであり、人間の判断に回す条件に合致しないように思う。

### 1.3 Failure B — questions nobody could read

Three drafts were asked. The human rejected each.

| draft | question as asked | why it could not be read |
|---|---|---|
| 1 | 「この2つの間で、いまの鍵や手続きの状態をどう渡しますか」 | no subject at all; 「身元」「掲示板」「運営の鍵」 are private coinages introduced in the same breath as the spec's nouns; 「値」「知らせ」 have no referent |
| 2 | 「掲示板は、運営鍵の交代や凍結をどうやって知りますか」 | asks *how* the coupling is implemented (a mechanism question). The human: 「フォーラムは人格を持たない。…誰かの意志によって知るとか知らないとかいう概念が存在しないはず」 |
| 3 | 「掲示板を「身元側の手続きに参加して自分の状態を変える相手」として記録するか、…として記録するか」 | the remaining choice is a record label; no person's experience changes. The predicate is a bookkeeping verb (「記録する」), the object is a referentless noun (「相手」), and the subject (who records?) is unstated |

The chat message accompanying draft 3 — written as a *demonstration of the corrected shape* — was rejected too:

> 私の結論は **A** です。フォーラムは Soul が…

> Aという選択肢はその時点では書かれていないのにも関わらず突然Aと言っている。…上から順に読んでいくだけで理解しやすいように書かれていなければならない。

That is a **forward reference**: the letter `A` used before the line that gives it meaning. The document block's own order was correct (選択肢 before 推奨); the chat prose was composed freehand and broke the order.

### 1.4 The cost

- The human spent three rounds on a decision the records determined.
- The human had to perform the AI's classification work and supply the diagnosis.
- The published `EXPLAIN-RFC-SEED.md` now contains a question that should not have existed, with the human's meta-comment recorded under it.

### 1.5 What this fix must prevent

1. A point the records can settle reaching the human (Failure A).
2. A question the human cannot read top-to-bottom (Failure B).

Both must be prevented **without** repeating the same failure mode: the file already stated the governing rules, and the AI read them and still failed. This fix therefore adds **forcing artifacts and mechanical gates**, not more adjectives.

---

## 2. Root cause

`.claude/commands/explain-seed.md` (261 lines) already contained every rule that was broken:

| existing text (anchor) | how it was broken |
|---|---|
| Step 2, `Q1 engineering? Can ground + decision + override condition be written now from manifests? yes → 「先に決めておいたこと」.` | the test was never written out, so skipping it left no trace |
| Criteria → Unfit, `U1 … can I write 決定・根拠・覆す条件 now? yes → settle` | same: a self-question with no artifact |
| Criteria → The question, `W2 never technical: AI settles API, type, algorithm, field, how` | a *how* question (pull vs push) was asked of the human |
| Criteria → The question, `W1 plain / W9 self-contained / W11 minimal / W12 concrete` | adjectives with nothing to check, so the AI's own "this is plain enough" passed |
| Criteria → Examples, Bad table row `point-question 「失敗時の再試行は3回か5回か」 technical; AI settles` | exactly this class was listed, but in a form the AI did not recognise once the question was dressed as a direction. No *tell* was given. |
| Gates, `Exception: G4 PASS ≠ G3 PASS; G4 structural only.` | G3 is unenforced self-judgement; `check` returned OK on all four asks |
| Flow Step 4a, `unanswerable from what is written → context or directions missing, not the answer; fix (G2), re-run G4, ask again.` | **the single most damaging line.** It defines a non-answer as a *prose* problem only. Rounds 2 and 3 were classification signals and were treated as prose signals. |
| Flow Step 4a, `shown: context; directions …` and Step 5 | nothing says the **chat message** obeys the same rules as the document block; the chat message was composed freehand and produced the forward reference |

Structural causes, in order of importance:

1. **No forcing artifact.** The settle test is a judgement with no output. Add one: the three lines must exist in the document before a question may be drafted.
2. **Nothing says a flag is not a ground.** Add the explicit prohibition, naming `risky_boundaries` and the other-package residual.
3. **No template for the question.** Two labels (`判断の前提`, `選択肢`) constrain content; nothing constrains order, actors, or whether a letter is defined before use.
4. **Non-answers are only a prose signal.** Add: a letterless reply re-opens the *classification* of that point, in writing, before any prose is touched.
5. **The chat message is unconstrained.** Add: it is assembled from the block, in order, and the same rules apply.

---

## 3. The change

Four tiers. **Tier 1 is mandatory. Tier 2 is recommended and is code. Tier 3 is required only if Tier 2 is done. Tier 4 is required for Tier 2.**

### Tier 1 — command prose (`.claude/commands/explain-seed.md`)

#### T1.1 — new section after Core Rule

Insert between the end of `## Core Rule` (currently line 33) and `## Language Protocol` (currently line 35). Anchor on the heading `## Language Protocol`; insert before it.

```markdown
## The question gate (settle before drafting)

A question may not be drafted until the settle test has been written out and has failed.
For every point about to become a question, write these three lines first, in this order:

- 決定: <what is decided>
- 根拠: <the manifest id, the neighbour document, or `Qn` + letter it rests on>
- 覆す条件: <the fact that would overturn it>

If all three lines can be written, the point is settled: it goes to 「先に決めておいたこと」 and no question is drafted.
Only a point whose three lines cannot be written becomes a question.
The gate's output is those three lines, not a feeling: a question drafted without them is a defect even if it reads well.

Four inferences this gate forbids. Each has produced a wrong question.

| inference | why it is wrong |
|---|---|
| 「a manifest flag named this point, so it is the human's」 | `handoff_summary.risky_boundaries` is one global list covering many boundaries at once and carries no per-boundary material. **A flag is not a ground and is not weight.** |
| 「a recorded doubt about this record means there is no ground」 | a doubt filed under another package — a `residual` or `grill_question` whose `package_id` is not this package — is not this package's point. Establish whose point it is before treating it as material. |
| 「the doubt itself says only the author can decide, so it must be asked」 | that sentence is material *for* the test above, not an exemption from it. Write the three lines. |
| 「the point is weighty, so it is the human's」 | weight alone does not bind a point to a question. The binding condition is weighty **and** no ground. A ground you have not looked for is not an absent ground. |
```

#### T1.2 — new rules in Criteria → The question

Insert after the existing table's judge lines (after `W7: AI reads the number…`, currently line 128), before `### Examples` (currently line 130).

```markdown
### The question's shape

judge: apply per question, in addition to W1–W12, when writing (Step 2, Step 4e) and when asking (Step 4a).

| id | rule |
|---|---|
| W13 | opinion first: the question opens with the AI's own conclusion **in words** and its reason, before any option letter or alternative is offered |
| W14 | define before use: no letter, id or name appears before the line that gives it meaning. The block reads top to bottom with nothing undefined at its point of use — a bare `A` before 選択肢 is a defect |
| W15 | nouns you can point at: no referentless nouns (相手, 整合, 主体, 扱い, 記録のうえで, 立場), no nominalized verbs (取り方, 伝わり方, 中身). test: can I point at it? no → rewrite |
| W16 | verbs are events a person can picture (移る, 使えなくなる, 決まる), not bookkeeping verbs (記録する, 扱う, 位置づける) |
| W17 | the remainder is stated as a sentence: 「あなたに残っているのは〜だけです」. If that sentence cannot be written narrowly, the point is not the human's — back to the question gate |
| W18 | every sentence carries all three parts explicitly — 誰が (subject), 何を (object), どうする (predicate, an event) — plus いつ (moment) where a moment applies. The parts stand in the sentence, not in the reader's inference. Passive voice and inanimate subjects are rewritten (「値が渡される」→「身元側が値を渡す」). One sentence carries one proposition; a sentence that reads 「〜して、〜して、〜する」 is split |
| W19 | one name per thing: the specification's own noun is used, glossed once at first use, and never replaced by a parallel coinage. Writing two names for one thing in one breath (「フォーラム（forum、掲示板）」, 「身元（soul）」) is forbidden — it makes the reader hold a mapping table |
| W20 | noun phrases stay shallow: at most one relative clause per noun. A clause-modified abstract noun (「〜する〜する相手」) is rewritten as a sentence with its own actor and verb |
| W21 | when the AI's conclusion and the remaining choice are the same thing, say so. The remainder is then 「あなたに残っているのは、この結論を覆す事実があるかどうかだけです」 — never an open A/B, which would ask the human to re-decide what the AI just decided |

**The reference form of the opening**, as the human asked for it:

> 私は〈理由〉という理由で〈結論〉とするのが良いと思っていますが、選択の余地は以下の部分に少しだけ残ります。

Lines 2–4 of the block below are this one sentence, separated so each part can be checked. Keep the three-part shape (conclusion → what is settled → how little remains) even when you rephrase; do not drop the third part, which is what makes the question narrow.

Technical nouns are not the difficulty: Soul, フォーラム, 鍵, 譲渡 are things and are fine. Referentless words are the difficulty.

Scoping decision (unresolved, for the implementer to raise): W13–W21 are written as question rules because the failures were questions. The same defects appeared in the section prose the AI wrote for E1–E7 (dense noun chains, parallel coinages). Decide whether these rules govern every `[::MUST-FILL::]` instruction or questions only, and record the decision in the command file either way.
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
```

#### T1.3 — worked examples from this pipeline

Append to `### Examples` (currently ends at line 152, before `### Kind`). Keep the three generic Good examples and the three-row Bad table; add:

```markdown
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
```

#### T1.4 — non-answers are a classification signal

Replace the last sentence of Step 4a (currently line 240, the line beginning `judge: W1–W12 per question; unanswerable from what is written →`) with:

```markdown
      judge: W1–W12 and W13–W21 per question; unanswerable from what is written → context or directions missing, not the answer; fix (G2), re-run G4, ask again. The one who asks carries the context.
      before asking: perform the block's sentence pass and read-back (see Criteria → The question block) and confirm that the document block and the chat message are the same content in the same order. The human reads the message first; a block that reads well does not excuse a message that does not.
      A reply that is not an answer — no letter (W8) — is evidence about the *point*, not only about the prose. Before rewriting anything, re-run Step 2's Q0–Q3 on that point and write the three lines out. Re-ask the axis only after that gate has failed again, in writing.
      Prose-only repair of a question the human could not answer is a defect: it spends the human's round on the AI's classification error.
      Three consecutive prose repairs of one question → stop; settle the point or name it misclassified in Step 5.
```

#### T1.5 — the report carries the evidence

Append to Step 5 (after the line `→ thin items named per Unfit table, if any`, currently line 257):

```markdown
   → per question: whether only a human could answer it, and the three lines that could not be written (that is the evidence)
   → any question the settle gate would have settled: named, with the three lines it should have produced
```

#### T1.6 — the frame's instructions must ask for the new shape

The frame's `[::MUST-FILL::]` texts are what the AI actually follows. Two of them must be rewritten so the shape is requested where it is written (Tier 2, step T2.4 below gives the exact strings). If Tier 2 is not approved, make the same two edits alone: they change no label and therefore reopen no existing document.

### Tier 2 — the mechanical gate (code). Recommended.

Rationale: prose rules were broken by the AI that had just read them. A gate cannot be. Three defects are mechanical; two more are made mechanical by one new label.

Work under Supreme Law §1 (TDD, red → green → refactor). Boy Scout Rule applies to every file touched.

#### T2.1 — `forward-reference` (no new label)

- File: `.claude/scripts/explain-seed/lib/frame.mjs`, in `faultsOfDecisions` (currently line 1240).
- Detect: within a question item, take the text of the `判断の前提` value and the `何を決めるのか` prose (the unfilled item prose above the `選択肢` block), and match a standalone option letter: `(?<![\w-])[ABC](?![\w-])`.
- Fault only when the `選択肢` block offers at least two letters, and only in the text **before** the `選択肢` label.
- Do **not** scan the AI-only region (`束ねた論点`, `この質問で決まること`, `記録の写し`): verbatim contract text legitimately contains standalone letters.
- New fault kind `forward-reference`; message in `.claude/scripts/explain-seed/run.mjs` `FAULT_MESSAGES` (currently lines 95–128):
  `'the question names an option before the options are written'`

#### T2.2 — `settle-trace` (one new label)

- New label in `frame.mjs`, beside `BOUND_POINTS_LABEL`: `export const SETTLE_TRACE_LABEL = '決められなかった理由';`
- Added to the question block by `renderQuestionBlock` (currently line 762), in the AI-only region, immediately after `BOUND_POINTS_LABEL`:

```js
    `- ${SETTLE_TRACE_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${SETTLE_TRACE_LABEL} — この論点について 決定・根拠・覆す条件 を先に書いてみて、書けなかった理由を書く。どの記録を調べて、なぜそれが決め手にならなかったかを名指しする。書けたなら、この論点は質問ではなく「先に決めておいたこと」に置く。人間には見せない。`,
```

- Gate: `labelledValue(item.body, SETTLE_TRACE_LABEL) === null` → fault `missing-settle-trace`, message
  `'the question does not record why the records could not settle the point'`
- **Breaking change.** Adding a label to the block requires adding it to `SHAPE_LABELS_THIS_FRAME_WRITES` (currently line 988); otherwise `carriesTheShapeThisFrameWrites` (line 1006) accepts a document the gate then refuses, with no way back. Adding it also means every existing document fails the merge test and its human section is **reset, discarding answers**. See Tier 3.

#### T2.3 — narrow the search for the record copy

While in `faultsOfDecisions`, confirm the `記録の写し` value is excluded from every new scan, and that `boundPointIds` still reads the first `束ねた論点` label only.

#### T2.4 — frame instruction text (no label change)

Rewrite the two `[::MUST-FILL::]` instruction strings so the requested output has the new shape:

- `renderContextBlock` (line 711) currently:
  `'実装も設計も知らない高校生が、選択肢と推奨の理由だけを読んで選べるように、そこに出てくる設計の言葉をすべて日常語に言い換え、何の話かを2〜3文で閉じる。上の記録や他の節を読んだ前提で書かない。事実や論点の写しにしない。'`
  Replace with a version that additionally requires: who does what, when, with what consequence; the AI's own conclusion in words with its reason (no option letter); the sentence 「これ以外は決まっています」; and the sentence 「あなたに残っているのは〜だけです」. State that referentless nouns and nominalized verbs are forbidden.
- The `何を決めるのか` instruction (line 775) already forbids moving a groundable point to the human; add that it must be written **after** the settle test has failed in writing (T2.2's label), not before.

### Tier 3 — migration (required if Tier 2 is done)

Existing `EXPLAIN-RFC-SEED.md` documents, found by scanning `workspace.packages` for the file:

| package | path | questions | answered |
|---|---|---|---|
| pkg-0001 | `crates/foundation/gaia-foundation` | 0 | 0 |
| pkg-0002 | `crates/protocol/gaia-soul` | 1 | 1 |
| pkg-0020 | `crates/network/gaia-network` | 2 | 2 |

Adding a label to `SHAPE_LABELS_THIS_FRAME_WRITES` reopens the human's section of every one of these and discards the three recorded answers.

Required procedure, in this order:

1. **Before the code change lands**, add the `- 決められなかった理由:` line with its filled value to each question block of the two documents that carry questions (pkg-0002, pkg-0020). This is a migration, not a content edit; do it as its own reviewed commit and say so in the message.
2. **Do not run `run.mjs info` or `run.mjs next` on any existing seed while developing.** `info` rewrites both documents and will reset an unmigrated human section; `next` appends. Develop and test against fixtures.
3. After the change lands, `run.mjs check` must exit 0 on all three documents with no edits beyond step 1. If it does not, the migration is incomplete.
4. Add a note to `docs/FIX-PLAN001.md` (or a short `docs/` successor) recording which documents were migrated and when.

If Tier 2 is **not** approved, no migration is needed and Tier 3 is void — but then Defect B is prevented by prose alone, which is exactly what failed here.

### Tier 4 — tests

Location: `.claude/tests/commands/`, CommonJS `.test.js`, matching the precedent of `.claude/tests/commands/plan-command.test.js` (which asserts on `commands/plan.md`).

Required:

1. `explain-seed-command.test.js` — asserts the command file contains the sections from T1.1–T1.5: the heading `## The question gate (settle before drafting)`, the four forbidden inferences, `W13`…`W21`, the reference opening sentence, the seven-line block order, the sentence pass, the read-back paragraph, the five worked-example rows, the Step 4a non-answer rule, the Step 5 evidence lines. Assert on presence of the distinctive strings, not on line numbers.
2. If Tier 2 is done: unit tests for `forward-reference` and `missing-settle-trace` against fixture question bodies — one that passes, one that raises each fault. Place beside the existing lib tests (`.claude/tests/lib/`) or a new `.claude/tests/scripts/explain-seed/`, whichever matches the module system of the code under test (`.claude/scripts/explain-seed/` is ESM, so fixtures are `.mjs` and the test file is `.test.mjs`; confirm the runner's glob `tests/**/*.test.{js,cjs}` — it does **not** match `.mjs`, so a `.test.mjs` file must be run directly or the glob extended; resolve this before writing the test).

---

## 4. Definition of Done

| id | check |
|---|---|
| D1 | every Tier 1 insertion is present in `.claude/commands/explain-seed.md`, verbatim, at the stated anchor |
| D2 | every Tier 4 test passes; `node .claude/tests/run-all.js` exits 0 |
| D3 | if Tier 2 is done: `run.mjs check` exits 0 on all three existing documents after migration, and raises `forward-reference` / `missing-settle-trace` on fixtures built to trigger them |
| D4 | no existing `INFO-RFC-SEED.md` or `EXPLAIN-RFC-SEED.md` was regenerated during the work (verify with `git status` — only the migrated files may differ) |
| D5 | the three recorded human answers under `<!-- 人間の判断 -->` are still present byte for byte |

## 5. Constraints and prohibitions

- Language Protocol: the command file is English; every Japanese string above is verbatim and must not be translated. Comments you add to code: English.
- Supreme Law §1 applies to every code change (Tier 2, Tier 4): red first, green, then refactor. No test may be weakened to pass.
- Supreme Law §4: if you touch a file carrying the `Initial Design Artifact — RFC-driven Implementation` header, do not alter the header.
- Stub rule: any incomplete implementation you leave behind carries a `[::STUB::]` marker.
- Plan Gate: this change is **Never-Tiny** (it changes a pipeline command used by all 29 packages and, in Tier 2, public script behaviour). Run it through `/make-ticket` → plan → start → review, not `/plan` directly.
- Do not regenerate any existing seed's documents to "check" the change.

## 6. Verification commands

```bash
# tests (there is no `make test` target in this repository — verify with: grep -n '^test' Makefile)
node .claude/tests/run-all.js
node .claude/tests/commands/explain-seed-command.test.js

# gate, on an existing package, after migration (read-only; does not rewrite documents)
node .claude/scripts/explain-seed/run.mjs check "crates/protocol/gaia-soul/RFC-SEED.md"
node .claude/scripts/explain-seed/run.mjs answers "crates/protocol/gaia-soul/RFC-SEED.md"

# migration audit: which EXPLAIN documents exist and what they answer
node -e "const fs=require('fs'),path=require('path');const m=JSON.parse(fs.readFileSync('WORKSPACIFY-TREE-MANIFEST.json','utf8'));(m.workspace.packages||[]).forEach(p=>{const f=path.join(p.path,'EXPLAIN-RFC-SEED.md');if(fs.existsSync(f))console.log(p.id,p.path);});"
```

## 7. What this plan does not fix

No document can guarantee correct judgement. The settle gate makes misclassification **visible and expensive**: the three lines either exist or they do not, and Step 5 requires them to be reported. The mechanical gate covers only the defects that are mechanical — a forward reference, a missing settle trace. A question that is well-formed, correctly classified, and still not the human's remains possible, and the only remaining defence is Step 4a's rule that a letterless reply reopens the classification in writing.

Do not claim, in the commit message or elsewhere, that this makes the failure class impossible. Claim what is true: it can no longer happen without leaving a trace the report must name.
