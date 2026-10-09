# FIX-PLAN003 (rev 2) — `/educe-sequences`: the measured report must answer what must be implemented

**Status.** Plan, rev 2. Supersedes rev 1. Nothing has been edited for it. No file listed in §3 has been
touched.

**What rev 2 changes against rev 1.** Rev 1 fixed the *labels* of the measured line. The human's actual
requirement is larger: the report must answer **which sequences must be implemented for the specification
to be satisfied, what composes them, and how many of them an interface must implement** (§1). Rev 2 makes
five questions (Q1–Q5) the plan's objective, and adds three things rev 1 did not have:

1. **The borrowed census is the interface's denominator and its absence is currently silent** (§2.3). Rev 1
   was silent about it too.
2. **A version-1 predecessor is partially comparable, and rev 1 threw that comparison away** (§2.4). Rev 1's
   own worked example reintroduced the defect it exists to remove.
3. **The `singleStep` brief fix moves in scope from rev 1 §7** (§3 Tier 3). The human re-runs the command in
   `~/shyme/gaia` after this change (§1.6), and without the brief fix that run can refuse before it prints
   anything.

**Scope.** `.claude/scripts/educe-sequences/rail/load.mjs`, `rail/coverage.mjs`, `rail/report.mjs`,
`rail/run.mjs`, `rail/engine.mjs` (re-export and re-exported-name readers only), `briefs/uncovered.md`,
`tests/educe-sequences/coverage.test.mjs`, `tests/educe-sequences/borrowed-census.test.mjs`,
`tests/educe-sequences/report-counts.test.mjs` (new), `docs/EDUCE-SEQUENCES-DESIGN.md`, and — only through
`make install-to-projects` — the four installed copies. Nothing outside `~/shyme/zasso/tools/conver` is
edited by this plan. The defect was found in a consumer (`~/shyme/gaia`); the repair belongs here, because
this repository is the development home of the rail and the consumer holds an installed copy of it.

**Language.** This document is English, per the project Language Protocol. Japanese appears only where a
string is quoted verbatim from a specification or from the human.

**Verification.** `make test-educe-sequences` — the impact set. See §7.

**Ticket.** RESOLVED 2026-10-09: **`PX-251`** — */educe-sequences: the measured report must state what each
count counts, for every project*, status `made`, allocated with `ensure-ticket.js` (per
`.claude/commands/make-ticket.md:66`) and detailed through Steps 3, 6, 7 and 8 of that pipeline. The spec is
`specs/PX-251.md`; `Tickets.json` holds the record. Its six Contracts (C001–C006) correspond to T1.1/T1.2,
T1.2, T1.3, T2.1/T2.2, Tier 3 and the genericity constraint respectively, and its post-install acceptance
checklist is the re-run of §4.

**Anchor discipline.** Every anchor here is a **symbol name** or a **heading string**, not a line number.
Line numbers are a convenience and were correct against the tree on 2026-10-09; they drift the moment an
earlier insertion lands. An implementer who cannot find the named symbol must stop rather than guess.

---

## 0. The vocabulary this plan rests on

Four nouns and three closed vocabularies. The defect is that the report reuses one noun for another; the
*goal* is that each number answers one question.

| noun | what it is in the artifact | what derives it |
|---|---|---|
| **entry** | one record of `artifact.sequences[]` — a span of the specification that some reader read | the array itself; `kind` is `entry` or `neighbour` |
| **sequence** | an entry whose `outcome` **claims** a sequence | `outcome` ∈ `DIAGRAMMED_OUTCOMES` |
| **step** | one act read from one line, owned by exactly one entry | `artifact.steps[]`, each carrying `line` and `quote` |
| **operation** | one unit an interface must implement, or must not | `artifact.operations[]`, each carrying `position` |

| vocabulary | members | declared in |
|---|---|---|
| `outcomes` (on an entry) | `direct`, `viaNeighbour`, `notASequence`, `singleStep`, `exempt` | `rail/artifact-schema.json` |
| `DIAGRAMMED_OUTCOMES` | the above minus `notASequence` and `exempt` = `direct`, `viaNeighbour`, `singleStep` | derived in `engine.mjs` |
| `positions` (on an operation) | `positioned`, `singleStep`, `suppliedRule`, `excluded` | `rail/artifact-schema.json` |
| `escapes` | `suppliedRule`, `excluded` | `rail/artifact-schema.json` |

**Declared vs borrowed.** A count derived from `artifact.*` is **declared** — the artifact's own record. A
count derived from `artifact.pins.sourceEnumerations[]` is **borrowed** — a census the invocation supplied,
which the artifact does not hold on its own. `coverage.mjs` already names the borrowed set a *census*
(`borrowedMembersOf`, `operationAccountingIn`), and the role it selects by is the caller's word:
*"the operations an interface must implement, the entries a reading must adjudicate"* (`coverage.mjs:108-109`).
**These two denominators are different sets, and the whole of §2.3 is that the report prints only one of them
and does not say the other is absent.**

Schema values verified 2026-10-09:
`outcomes = ["direct","viaNeighbour","notASequence","singleStep","exempt"]`,
`DIAGRAMMED_OUTCOMES = ["direct","viaNeighbour","singleStep"]` (`engine.mjs:48-51`, comment: *"The outcomes
that claim a sequence, which is the set a diagram is owed for"*),
`positions = ["positioned","singleStep","suppliedRule","excluded"]`,
`escapes = ["suppliedRule","excluded"]` (`rail/artifact-schema.json`).

`kind` and `outcome` are two different axes: `kind: "neighbour"` says *how the span was chosen*; `outcome`
says *what the reader ruled about it*. A neighbour can still carry a drawn sequence — the measured artifact
below holds 48 that do.

---

## 1. The objective: five questions the measured line must answer

### 1.1 The questions

The human's requirement, stated 2026-10-09, in their words:

> プロジェクト全体でどのくらいのシーケンスが実装されないと仕様設計を満たせないのか、そしてそれらを構成する
> オペレーションやステップが総数で幾つになり、インターフェースとして実装しなければならないのは幾つなのか、
> それらを満たすことでプロジェクトの実装が成功するという目安がちゃんとわかるようにしたい。

| # | question | the set that answers it | answerable today |
|---|---|---|---|
| Q1 | how many sequences are there | entries whose `outcome` claims a sequence | no — the line prints the entry ledger under the word `sequences` |
| Q2 | what composes them — how many steps and operations in total | `artifact.steps[]`, `artifact.operations[]`, and their partitions | partly — the totals print, the partitions do not |
| Q3 | how many sequences must be implemented for the specification to be satisfied | the same set as Q1, and the steps inside those entries | no — Q1 is mislabelled and the steps' partition is unprinted |
| Q4 | how many must an **interface** implement | `placed` operations, and the **borrowed census** when one is supplied | no — the line prints all operation records, and says nothing when no census is borrowed |
| Q5 | what tells a reader the implementation has succeeded | the categorical checks, plus the reported partitions (§1.5) | no — nothing states the relation, and rev 1's plan states it as a percentage it must not be |

### 1.2 What was measured

`/educe-sequences GaiaSekkeiShiyousho_v32.md` in `~/shyme/gaia`, third generation, 2026-10-09. The run
completed: 18 of 18 phases, artifact digest
`72f1bb619bdc20e3619c73d678fb77854f875e1eb66ed1d7638a6ba36646a257`.

The product path (`rail/run.mjs`, function `report`) printed one measured line:

```
sequences=553 steps=283 operations=257 rows=292 linesReached=15971 of 15971
```

The human read `sequences=553`, compared it with `operations=257`, and asked the question this plan exists to
answer: **a sequence is a bundle of operations, so how can there be twice as many sequences as operations?**
Nothing in the output answered it, and no check reddens — the report is printed, never gated (`coverage.mjs`
head: *"The counts are not a pass condition"*; design §7: *"Nothing compares one of these to a threshold"*).
A wrong number that reads as right therefore survives every gate, and this one survived three generations.

| what | count | composition |
|---|---|---|
| `artifact.sequences[]` — **entries** | **553** | `kind`: entry 68, neighbour 485 |
| of those, **sequences** | **68** | `outcome`: `direct` 67, `viaNeighbour` 1 |
| of those, ruled not a sequence | 485 | `outcome: notASequence` |
| entries owning at least one step | 116 | 67 direct + 1 viaNeighbour + 48 neighbour |
| `artifact.steps[]` — **steps** | **283** | inside a drawn entry 203, placed elsewhere 80 |
| `artifact.operations[]` — **operations** | **257** | `position`: positioned 68, singleStep 80, suppliedRule 10, excluded 99 |
| of those, **placed** (not an escape) | **148** | positioned 68 + singleStep 80 |
| of those, **excused** | **109** | suppliedRule 10 + excluded 99 |
| `artifact.pins.blocks[]` — the heading partition | 292 | equals the declared section count |
| specification lines reached | 15971 of 15971 | union of entry spans and operation presuppositions |

So the printed line was wrong in three of its five numbers: `sequences=553` is the **entry ledger** (8.1× the
sequences); `operations=257` counts records of which 109 record that the operation is *not* to be implemented;
`rows=292` repeats the section count under a name that maps to nothing a reader can see.

**A caution about this artifact.** Its `kind: entry` count (68) equals its claiming count (68). The two sets
are different and the equality is a coincidence of this specification; no arithmetic in the report or in a
test may assume it. That coincidence is itself an argument for printing both partitions.

### 1.3 The frozen golden fixture proves the defect is the report's, not this specification's

`tests/educe-sequences/fixtures/spec/ledger-sequences.json` is a synthetic artifact. Measured 2026-10-09:

| what | count | composition |
|---|---|---|
| entries | 8 | `kind`: entry 6, neighbour 2 |
| sequences | 2 | `outcome`: `direct` 1, `viaNeighbour` 1, `notASequence` 4, absent 2 |
| steps | 6 | drawn 6, elsewhere 0 |
| operations | 3 | `position`: positioned 2, suppliedRule 1 → placed 2, excused 1 |
| blocks | 10 | |
| lines | 60 of 60 | |
| borrowed censuses | **none** | `pins.sourceEnumerations` is empty |

The product path already prints `sequences=8` for it (`tests/educe-sequences/coverage.test.mjs`, the assertion
containing `/sequences=8/`) — an artifact holding 2 sequences, printed as 8. The design document already knows
the difference and says so in prose (design §7c, currently lines 384-385):

> over the artifact the reader holds for the project this apparatus was built against — 375 sequences, 663
> steps — 68 sequences claim to be a sequence

Only the printed line disagrees with that sentence — and, under this plan's vocabulary, the sentence's own
nouns are wrong too (§3 Tier 4).

### 1.4 Why three numbers and not one

`entries ⊃ sequences` (every sequence is an entry; 485 entries are not sequences). A step belongs to exactly
one entry, drawn or not, so `steps` is not the size of the drawn sequences. An operation is reached by a step
**or** excused by an escape; 109 operations of this artifact are reached by nothing, and they are exactly the
ones an implementer must be told about. Printing only `steps` would hide them; printing only `sequences` would
hide both.

### 1.5 What a "目安" (yardstick) may be — and what it may not be

The design forbids a threshold, in the file that computes these numbers (`coverage.mjs` head):

> The counts are not a pass condition. … A generation that merges two sequences into one is an improvement
> carrying a smaller number, so a threshold on any of these would refuse the work it is meant to encourage.

So the yardstick is **not** a percentage and **not** a pass condition. It is three things, two of which
already exist:

1. **The surface is decided or it is not** — categorical, and already a refusal:
   `every-enumerated-operation-accounted-for` (`engine.mjs:124`) refuses when a borrowed census and the
   declared operations disagree in either direction, and `every-censused-entry-adjudicated` (`engine.mjs:147`)
   refuses a censused entry the artifact adjudicates nowhere. Both are silent when nothing is borrowed
   (*"An artifact that borrows no census has no denominator, so both checks are silent rather than wrong"*,
   `engine.mjs:120`). The silence is correct for the *check* and wrong for the *report* (§2.3).
2. **The surface is classified** — reported: `placed` (to implement) against `excused` (not to implement),
   and the borrowed census split into `reached` / `excused` (`operationAccountingIn`, `coverage.mjs:126`).
3. **The drawn sequences are stated** — `sequences`, and the steps inside them (`drawn`), because a diagram is
   owed for every claiming entry (`engine.mjs:48`).

And the limit, which must be printed in the design document rather than left for a reader to discover:
**the rail reads the specification, not the implementation.** `reached` means *a step in the sequence names
this operation*, not *the code implements it*. "実装済み / 未実装" — how much of the interface is already
built — is not a number this command can print. If such a metric is ever wanted, the census members are the
join key, and the join is a different apparatus.

### 1.6 What this fix must prevent

1. A measured number printed under a word that denotes a different set.
2. A composition hidden behind a single number, so that "placed" and "excused", or "drawn" and "elsewhere",
   cannot be told apart *at the console* — where only `coverageLine` is printed (`run.mjs:262-270`).
3. A previous-generation comparison drawn between two numbers that do not mean the same thing — including the
   comparison rev 1 would have made (§2.4) and the one this change must not introduce.
4. A **missing denominator printed as if it were a denominator** (the census case, §2.3).
5. A repair that names a project. The rail names no project, no project file and no transport, and
   `tests/educe-sequences/genericity.test.mjs` (C007) holds that by reading the modules.

### 1.7 The human's next action, which this plan must make succeed

After this change is installed, the human re-runs, in `~/shyme/gaia`:

```
/educe-sequences GaiaSekkeiShiyousho_v32.md
```

This is not the first such run; it is a repeated generation. Two consequences are load-bearing:

* **A run holding readings does not judge the old artifact first.** `run.mjs:65-69` states the doctrine and
  `run.mjs:85-126` implements it: *"a run holding readings is about to replace it, so it clears the ground and
  is judged by what it built. Judging the old artifact first would make a check added after that artifact was
  written a wall rather than a gate."* So §1.8's 78 refusals do **not** block this run. The older, one-check-
  behind gaia copy accepted the artifact; after Tier 6 the new generation is judged by the 21-check engine,
  and the same reading behaviour would produce the same defect in the **new** artifact — refused at
  `run.mjs:111-114`, before any measurement is printed. That is why the brief fix (Tier 3) is in scope.
* **The first post-change run has a version-1 predecessor**, so whatever suppression rule this plan adopts
  decides what the human sees on exactly this run. A silent suppression would show "no previous generation"
  where there is one — the same class of defect as the mislabelled number (§2.4).

---

## 2. Root cause, and the two silences

### 2.1 The mislabelling

Every number in the measured line was an array length, named after the **artifact section** it was taken from
rather than after what it counts. One section name — `sequences` — denotes the entry ledger. The report is
faithful to the schema and wrong about the world.

| existing text (anchor) | why it does not fire |
|---|---|
| `coverage.mjs` — `coverageOf`, `sequences: (artifact.sequences ?? []).length` | counts the section; the section is the entry ledger, and 485 of its 553 records say "not a sequence" |
| `coverage.mjs` — `coverageOf`, `operations: (artifact.operations ?? []).length` | counts records, and 109 of them record an operation that must *not* be implemented |
| `coverage.mjs` — `coverageOf`, `rows: (artifact.pins?.blocks ?? []).length` | names the heading partition "rows", a word that maps to nothing a reader can check |
| `coverage.mjs` — `operationSpelling` | the un-spelled branch is taken whenever no census is borrowed — the common case, and this run's case |
| `coverage.mjs` — `coverageLine` | the single spelling, faithful to `coverageOf`, so it repeats the section names verbatim into both surfaces |
| `report.mjs` — `coverageLines`, `againstPrevious('sequences', …)` | compares two generations that both mean the ledger: right about the wrong number |
| the engine | no check holds a printed label to the set it counts; the design makes the measurements ungated on purpose |

### 2.2 The first silence — the composition is only in the block

Rev 1 put the operations breakdown in the phase driver's block (`report.mjs` `coverageLines`) and left the
product path's single line composition-free, calling the asymmetry pre-existing. It is not pre-existing for
this purpose: the human's console shows the **product path**, and `run.mjs:262-270` prints `coverageLine`,
`limbCensusLines`, `checksRun`, `pinsRederived`, `railExits` and `sequencesUnread` — no block. A composition
that only the other surface prints does not answer Q2 at the console.

### 2.3 The second silence — a missing denominator is printed as a denominator

`operationAccountingIn` returns `{operationsEnumerated: null, …}` when no census is borrowed, and
`operationSpelling` then prints `String(coverage?.operations ?? 0)`. The comment is explicit
(`coverage.mjs:123`): *"Null when no census is borrowed: a denominator nobody supplied must not be printed as
a zero."* The intent is right and the execution is inverted: the absent census is not printed as a **zero**, it
is printed as the **declared record count**, which is a different set wearing the position a denominator
occupies. On the measured artifact the reader saw `operations=257` where the interface question needs a number
the artifact does not hold. Nothing said the interface's denominator was never supplied.

This is the same defect as §2.1 and it is why Q4 is unanswerable in gaia today: **the rail cannot invent the
interface's member list; it can only print the one it was handed, or say it was handed none.**

### 2.4 The third silence — rev 1's suppression, and rev 1's own bad comparison

`coverage_version` is right in principle: `run.mjs` reads the predecessor from
`recorded?.history?.at(-1)?.coverage ?? null` (`run.mjs:248-250`), history stores the **coverage object only**
(the artifact is not kept), so a version-1 record cannot be re-measured. But rev 1 drew the consequence too
wide in two places.

1. **Rev 1 suppressed the whole block.** Five of the six rev-2 keys are recoverable from a version-1 record,
   because version 1 recorded the same arrays under different words:

   | rev-2 key | version-1 field | comparable |
   |---|---|---|
   | `entries` | `sequences` (v1's `sequences` **was** the ledger: `(artifact.sequences ?? []).length`) | yes, same set |
   | `steps` | `steps` | yes |
   | `operations` | `operations` (v1 counted all records too) | yes |
   | `sections` | `rows` (v1 read `artifact.pins?.blocks`) | yes, same array |
   | `linesReached`, `specLines` | same names, same derivations | yes |
   | `sequences`, `placed`, `excused`, `stepsDrawn`, the partitions | — | **no: version 1 never recorded them** |

   Rev 1's T1.4 prints nothing at all for a version-1 predecessor. That discards five valid comparisons and,
   worse, makes their absence indistinguishable from "this is the first generation" — a silence of exactly the
   kind this plan exists to remove.

2. **Rev 1's worked example compares two different sets.** T2.1 prints
   `operations=148 of 257 … (previous generation: 76, change +72)`. The left number is `placed` (148); the
   predecessor's 76 is the count of **all** records. The delta +72 is arithmetic between two sets that do not
   correspond — the defect of §2.1, reintroduced by the fix. Under the mapping above the correct comparison is
   `operations=257 … (previous generation: 76, change +181)`, with `placed` carrying no predecessor.

**The rule rev 2 adopts:** a predecessor is compared **per key**, through a declared mapping, and every key
without a counterpart prints that it was **not measured**, by name. Nothing is suppressed silently, and no
delta is drawn between two sets.

### 2.5 A second defect this investigation surfaced — recorded, not fixed here

While measuring the artifact against the current rail, the conver copy **refused** it:

```
refused: every-step-belongs-to-a-drawn-sequence: A-195__census_RegisterDeviceIncarnation —
         a step whose sequence is not one the artifact draws
```

78 such refusals, one per step placed inside an entry ruled `notASequence`. Three facts:

* The gaia copy accepts the artifact because it is **one check behind**: `engine.mjs` declares 21 checks in
  this repository and 20 in the installed copy. `every-step-belongs-to-a-drawn-sequence` (`engine.mjs:225`) is
  the difference. `make install-to-projects` is enough to make the refusal appear there.
* The cause is the same noun confusion this plan is about. `singleStep` is a member of **both** vocabularies:
  as an operation `position` it means "this operation is a single step", and as an entry `outcome` it means
  "this entry is a single-step sequence, and is drawn". The run recorded the position and left the entry ruled
  `notASequence`, so the steps it placed hang off entries no diagram carries.
* Repairing it would raise this artifact's honest `sequences` from 68 to about 116 — the number of entries that
  own a step — which is the number the fixed report lets a reader see.

**Unresolved arithmetic, flagged rather than guessed.** §1.2 records 80 steps "placed elsewhere", §2.5 records
78 refusals. The difference of 2 is unexplained by anything measured here. An implementer must resolve it
(some of the 80 may hang off an entry that is absent rather than ruled, or the two counts may be over
different sets) before any test asserts either number. Do not paper over it.

---

## 3. The change

Six tiers. Tier 1 and 2 are the measurement fix; Tier 3 is the brief without which the human's next run can
refuse before printing; Tier 4 keeps the document that states these numbers true; Tier 5 is the tests, written
first; Tier 6 ships it.

### Tier 1 — `rail/load.mjs` and `rail/coverage.mjs`: one measurement source

#### T1.0 Move the derived vocabularies to `load.mjs`

`coverageOf` must count the entries that claim a sequence, which needs `DIAGRAMMED_OUTCOMES`. That set is
declared in `engine.mjs` (`engine.mjs:49`), and `engine.mjs` imports `coverage.mjs` (the summary spreads
`coverageOf(artifact)` into it), so `coverage.mjs` cannot import it back without a cycle.

Move the three schema-derived sets — `OPERATION_POSITIONS` (`engine.mjs:34`), `UNREACHED_ESCAPES`
(`engine.mjs:43`), `DIAGRAMMED_OUTCOMES` (`engine.mjs:49`) — from `engine.mjs` into `load.mjs`, beside
`readArtifactSchema`, the module that already owns the schema's vocabulary. `engine.mjs` then re-exports them
unchanged:

```js
export { DIAGRAMMED_OUTCOMES, OPERATION_POSITIONS, UNREACHED_ESCAPES } from './load.mjs';
```

so every existing importer (including `tests/conventions/design-measurements.test.mjs`, which imports
`ENGINE_DECLARED_CHECK_COUNT` from `engine.mjs`) keeps working. One declaration, two readers, no cycle. The
comment explaining why the vocabulary is read from the schema rather than written in code moves with the
declarations.

#### T1.1 `coverageOf` reports what each number counts, and records its partitions

`coverageOf(artifact)` keeps its role — the one pure function that measures an artifact — and changes its key
set. `rows` is dropped, `sequences` changes meaning, the partitions become recorded keys (so that the single
line can print them, and so that history carries them), and the object carries a version:

```js
export const COVERAGE_VERSION = 2;

export function coverageOf(artifact) {
  const entries = artifact.sequences ?? [];
  const steps = artifact.steps ?? [];
  const operations = artifact.operations ?? [];
  const claims = (entry) => DIAGRAMMED_OUTCOMES.includes(entry?.outcome);
  const ownerOf = new Map(entries.map((entry) => [entry.id, entry]));
  const escaped = (operation) => UNREACHED_ESCAPES.includes(operation?.position);
  return {
    coverage_version: COVERAGE_VERSION,
    entries: entries.length,
    entriesByKind: countBy(entries, (entry) => entry.kind),
    sequences: entries.filter(claims).length,
    steps: steps.length,
    stepsDrawn: steps.filter((step) => claims(ownerOf.get(step.sequence))).length,
    operations: operations.length,
    operationsByPosition: countBy(operations, (operation) => operation.position),
    placed: operations.filter((operation) => !escaped(operation)).length,
    excused: operations.filter(escaped).length,
    sections: (artifact.pins?.blocks ?? []).length,
    linesReached: reachedLinesIn(artifact).size,
    specLines: artifact.spec?.lines ?? 0,
    ...operationAccountingIn(artifact),
  };
}
```

Notes the implementer must not soften:

* `countBy` groups by a value the **data** carries, so the partition's member names come from the schema and
  the artifact, never from this module. `entriesByKind` has no schema declaration (kind values are not in
  `artifact-schema.json`), which is why `entry` / `neighbour` may be read straight from the records.
* An entry whose `outcome` is absent does not claim a sequence. `DIAGRAMMED_OUTCOMES.includes(undefined)` is
  `false`, which is the wanted answer — the golden fixture carries two such records.
* `placed` and `excused` partition `operations` exactly (`placed + excused === operations`), and `escapes` is
  read from the schema, not written here, so the check that excuses an escape and the count that reports one
  cannot disagree.
* `rows` is gone. It was the heading partition under a name that says nothing; the same number is
  `artifact.pins.blocks` and equals `artifact.sections`, which `sections-agree-with-blocks` (`engine.mjs:474`)
  holds over every artifact. If the human asks for it back, it returns as `sections`, not as `rows`.
* Every key is derived from the artifact alone. No key may come from a project name, a project file, an id
  convention, or a word the caller did not declare — `genericity.test.mjs` (C007) scans for those.

#### T1.2 `coverageLine` states each set, its composition, and the census

One spelling for both surfaces (`run.mjs:22`, `run.mjs:263-264`; `report.mjs:46`) — and now the only complete
answer a console gets, because the product path prints no block (§2.2).

```js
export function coverageLine(coverage) {
  return [
    `entries=${coverage.entries}${partition(coverage.entriesByKind)}`,
    `sequences=${coverage.sequences}`,
    `steps=${coverage.steps}${partition({ drawn: coverage.stepsDrawn, elsewhere: coverage.steps - coverage.stepsDrawn })}`,
    `operations=${coverage.operations}${partition(coverage.operationsByPosition)}`,
    `placed=${coverage.placed}`,
    `excused=${coverage.excused}`,
    `sections=${coverage.sections}`,
    `linesReached=${coverage.linesReached} of ${coverage.specLines}`,
    `census=${censusSpelling(coverage)}`,
  ].join(' ');
}
```

Spelling rules, each load-bearing:

* **`partition(map)`** renders `(name count, name count, …)` with the members **sorted by name**, every member
  present, including members whose count is zero. Sorted-by-name is deterministic and drops nothing; a rule
  that named the two members it expected would silently drop a third if a schema ever gained one, which is the
  defect class this plan removes. `drawn` / `elsewhere` are the only invented names, and they name the
  partition of steps by whether their owning entry claims a sequence — the partition §2.5 shows to be
  load-bearing.
* **`of` is used once**, in `linesReached=… of …`, where the total is the specification's own line count and
  the reading is a subset of it. The operations term no longer uses `of`: rev 1's `148 of 257` overloaded a
  token that the next term used for coverage, and a reader could take it for progress. Placement is stated by
  its own keys.
* **`censusSpelling(coverage)`** returns `none` when `operationsEnumerated` is not a number, and otherwise
  `<n> (reached <r>, excused <e>)`. `census=none` is the answer to Q4's silence (§2.3): the interface's
  denominator is named as absent rather than replaced by the artifact's record count. The word `census` is the
  one `coverage.mjs:106` and `coverage.mjs:123` already use for the borrowed set, and it keeps the two
  denominators apart — the artifact's declared records and the interface's borrowed members.
* **One line, nine terms, one number per set.** Nothing is summed across sets; nothing is printed twice under
  two names. `placed` and `excused` are derivable from `operationsByPosition` **given** the escapes vocabulary,
  and are printed anyway because the arrow from a position name to "must implement" is the schema's to draw,
  not the reader's to guess.

The measured artifact of §1.2 would print:

```
entries=553 (entry 68, neighbour 485) sequences=68 steps=283 (drawn 203, elsewhere 80) operations=257 (excluded 99, positioned 68, singleStep 80, suppliedRule 10) placed=148 excused=109 sections=292 linesReached=15971 of 15971 census=none
```

(The `operationsByPosition` order above is the sorted order the rule produces: `excluded`, `positioned`,
`singleStep`, `suppliedRule`. The `entriesByKind` order is `entry`, `neighbour`.)

The frozen golden fixture today prints
`sequences=8 steps=6 operations=3 rows=10 linesReached=60 of 60`, and becomes:

```
entries=8 (entry 6, neighbour 2) sequences=2 steps=6 (drawn 6, elsewhere 0) operations=3 (positioned 2, suppliedRule 1) placed=2 excused=1 sections=10 linesReached=60 of 60 census=none
```

#### T1.3 A predecessor is compared per key, through a declared mapping

`coverage_version` exists so that no delta is drawn between two sets. It does **not** license discarding the
comparisons that do correspond (§2.4). The mapping is declared once:

```js
const PREDECESSOR_KEY_FOR = Object.freeze({
  entries: 'sequences',   // version 1's `sequences` was the entry ledger: (artifact.sequences ?? []).length
  sequences: null,        // version 1 never recorded the claiming count
  steps: 'steps',
  stepsDrawn: null,
  operations: 'operations',
  operationsByPosition: null,
  placed: null,
  excused: null,
  sections: 'rows',       // version 1 named the heading partition `rows`
  linesReached: 'linesReached',
  specLines: 'specLines',
});
```

* `predecessorValueFor(key, predecessor)` answers the mapped value or `null` for "not measured".
* `predecessorLine(predecessor)` re-spells a stored record through the mapping, so a console line can read
  `(previous generation: entries=375 steps=663 operations=76 sections=292 linesReached=6190 of 15971)` instead
  of a version-2 spelling run over version-1 fields (`entries=undefined …`).
* `isComparableCoverage(coverage)` stays — it answers whether the record was measured under the current
  version — but it no longer decides *whether to print*, only *whether the mapping is needed*.
* A key whose mapping is `null` prints **`(previous generation: not measured)`**, by name. Suppression is
  never silent.
* When the predecessor was measured under another version, the phase driver's block prints one note naming the
  mapping: which of this report's keys the predecessor recorded under other words, and which it never
  recorded. The first post-change run — the human's next run (§1.7) — shows five real deltas and four named
  absences instead of nothing.
* The existing withhold rule stays where it is: a `linesReached` change is still withheld when `specLines`
  moved, because two revisions are not one space.

### Tier 2 — `rail/report.mjs` and `rail/run.mjs`

#### T2.1 The block is the line, one term per line, with a delta

`coverageLines(summary, status)` currently emits five lines built from `coverageLine`'s five keys. It emits one
line per term of the new line, in the line's order, each through `againstPrevious`, so that the block and the
console line are the same spelling by construction (D3):

```
- entries=553 (entry 68, neighbour 485) (previous generation: 375, change +178)
- sequences=68 (previous generation: not measured)
- steps=283 (drawn 203, elsewhere 80) (previous generation: 663, change -380)
- operations=257 (excluded 99, positioned 68, singleStep 80, suppliedRule 10) (previous generation: 76, change +181)
- placed=148 (previous generation: not measured)
- excused=109 (previous generation: not measured)
- sections=292 (previous generation: 292, change 0)
- linesReached=15971 of 15971 (previous generation: 6190 of 15971, change +9781)
- census=none
(previous generation measured under coverage v1: its "sequences" is this report's "entries", its "rows" is "sections"; "sequences", "placed", "excused", "stepsDrawn" were not measured)
```

The `operations` delta is **+181**, not rev 1's +72: 257 and 76 are both counts of all records, and the
`placed` line carries no predecessor because version 1 never recorded placement. The partition members are
composed from the artifact the report was handed, not read from a constant, so a project whose escapes or
positions are declared differently prints its own vocabulary. A partition member with a zero count still
prints.

#### T2.2 `run.mjs` prints the predecessor through the mapping

`report(stdout, summary, previousCoverage = null)` (`run.mjs:262`) becomes: the measured line through
`coverageLine`, then `(previous generation: <predecessorLine(previousCoverage)>)` when a predecessor exists —
re-spelled through the mapping, never a version-2 spelling over version-1 fields. When the predecessor exists
but a key has no counterpart, the console line simply omits that key and the block carries the named absence;
the console gets one line, so the mapping note lives in the block.

#### T2.3 Nothing else in the block changes

`phasesDone`, `checksRun`, `pinsRederived`, `predicateLimbs`, `readPhasesSettled`, `railExits` and the three
`inquest*` lines keep their names and their meanings; the `predicateLimbs` line is deliberate (design §7: *"the
report prints how many limbs were cited and how many were not, so a predicate that nothing decided by is
visible as a number rather than as an absence"*). The product path's own list (`sequencesUnread` and the rest)
is likewise untouched.

### Tier 3 — `briefs/uncovered.md`: the `singleStep` outcome rule (moved in from rev 1 §7)

`briefs/uncovered.md:7` invites the reader, of a region: *"if one does [hold a sequence], report the operation
and the step that performs it, with the line"*. The brief does not say that the **owning entry's outcome** must
claim a sequence for that step to be drawable, and `singleStep` is a member of both closed vocabularies — as an
operation `position` it means "this operation is a single step"; as an entry `outcome` it means "this
single-step sequence is drawn" (`DIAGRAMMED_OUTCOMES` contains it). The reading that follows the brief as
written produces exactly the artifact §2.5 refuses.

The brief gains the rule, in its own words and without naming a project:

* A step may be placed only in an entry whose **`outcome`** is one of `DIAGRAMMED_OUTCOMES`
  (`direct`, `viaNeighbour`, `singleStep`).
* Reporting a single-step operation therefore requires ruling its entry `outcome: singleStep` as well as
  recording the operation's `position: singleStep`. The two are different fields on different records, and
  `every-step-belongs-to-a-drawn-sequence` (`engine.mjs:225`) refuses the half-done pair.
* An entry the reading cannot rule on is `notASequence`, and a step placed inside it is refused rather than
  recorded.

Why this is in scope and not deferred: the human's next run (§1.7) is a generation, so it is judged by what it
builds (`run.mjs:111-114`) and a refusal returns before `report` is reached (`run.mjs:123`). Without this
rule the run can print no measurement at all — the opposite of this plan's purpose. The check stays as it is;
only the brief that invites the reading changes.

### Tier 4 — `docs/EDUCE-SEQUENCES-DESIGN.md`

#### T4.1 The measured paragraph in §7c, corrected and extended

The paragraph quoted in §1.3 (lines 384-385) uses `sequences` for the ledger — the noun this plan declares
wrong — and then uses it again for the claiming set in the same sentence. It is **corrected and extended**,
not merely extended (rev 1 said "extended, not corrected", which would leave the document teaching the usage
the report stops using):

* `375 sequences` becomes `375 entries`, and `68 sequences claim to be a sequence` becomes
  `68 of them claim a sequence`.
* The rules gain a statement: an entry is not a sequence; the report prints both; a step placed for a
  single-step operation needs an entry whose **outcome** claims a sequence (`singleStep`), not merely an
  operation whose position is `singleStep` (§2.5, Tier 3).
* The census rule gains a statement: `census=none` means no interface denominator was supplied, and such a run
  answers Q1–Q3 but not Q4 — the rail cannot enumerate an interface it was not handed (§2.3), and "実装済み"
  is not a number this command prints (§1.5).

The three quantities `tests/conventions/design-measurements.test.mjs` holds the document to — corpus file count
and byte total, `reports N checks over M pins` — are **not** touched by this change. This plan adds no engine
check, so `ENGINE_DECLARED_CHECK_COUNT` (`engine.mjs:706`) and the pin count are unchanged, and that test
stays green without edit. That is deliberate: a new check would be a new declaration and a new mutation corpus,
and the defect here is a label, not a missing refusal.

### Tier 5 — tests (written first, red before Tier 1)

#### T5.1 `tests/educe-sequences/coverage.test.mjs`

* The exact-key assertion on `Object.keys(coverageOf(artifact))` (currently `coverage.test.mjs:281`) becomes
  the **new** set, sorted: `coverage_version, entries, entriesByKind, excused, linesReached, operations,
  operationsByPosition, operationsEnumerated, operationsExcused, operationsReached, placed, sections,
  sequences, specLines, steps, stepsDrawn`. Red today.
* `coverageOf` over the golden fixture returns `entries: 8`, `entriesByKind: {entry: 6, neighbour: 2}`,
  `sequences: 2`, `steps: 6`, `stepsDrawn: 6`, `operations: 3`, `operationsByPosition: {positioned: 2,
  suppliedRule: 1}`, `placed: 2`, `excused: 1`, `sections: 10`, `linesReached: 60`, `specLines: 60`, and
  `placed + excused === operations` (§1.3's numbers). Red today (`sequences` is 8, `rows` is present).
* `coverageLine` over that object is exactly the string in T1.2 — asserted as a whole string, so a future key
  cannot be added to one surface only. Red today.
* `censusSpelling` over that object is `none`; over an object with `operationsEnumerated: 7,
  operationsReached: 5, operationsExcused: 2` it is `7 (reached 5, excused 2)`. Red today.
* An artifact whose operation records are all escapes spells `placed=0 excused=3` and the position partition
  lists that class — the zero is printed, not special-cased away. Red today.
* `predecessorValueFor('entries', {coverage_version: 1, sequences: 375, steps: 663, operations: 76, rows: 292,
  linesReached: 6190, specLines: 15971})` is `375`; for `'sequences'` it is `null`;
  `predecessorLine` of that record spells `entries=375 steps=663 operations=76 sections=292
  linesReached=6190 of 15971`. Red today (the functions do not exist).
* The product-path assertion containing `/sequences=8/` becomes `/sequences=2/` **and** `/entries=8/`, on the
  same fixture. Red today.
* The existing assertions that survive unchanged are kept: the count-equals-array-length checks for `steps` and
  `operations`, `linesReached` against an independently recomputed clipped union, the thin-and-malformed-record
  cases raising nothing, the C003 previous-generation string rules including the sign and the withheld
  reach-change, the append-only history, and the scan that no rail module compares a coverage count to a
  threshold.
* The C003 assertions are kept by **re-stamping the fixtures, not by weakening the assertions**. Those tests
  drive a run whose `status.json` history holds a stored coverage object, and they assert strings such as
  `sequences=2 (previous generation: 4, change -2)`. After this change that stored object is a version-1
  predecessor, so the assertion would fail for the right reason. The fixture's stored coverage gains
  `coverage_version` with the current value — a fixture is an input, not an expectation — and the assertion
  stands unchanged. T5.3 then asserts the mapped and the named-absent cases separately.

#### T5.2 `tests/educe-sequences/borrowed-census.test.mjs`

* `measured.operationsReached + measured.operationsExcused === measured.operationsEnumerated`
  (`borrowed-census.test.mjs:366`) is kept. Whether a **check** enforces it, rather than the fixture
  exhibiting it, must be confirmed during Tier 1 and recorded in the ticket: the census is forced to equal the
  declared operations by `every-enumerated-operation-accounted-for`, and every operation is forced into one
  position class, but the step from "positioned" to "reached by a step" is not obviously a check's work. If it
  is not enforced, this assertion is a property of the fixture and the plan says so rather than implying a
  guarantee.
* The census clause's spelling changes from `<n> enumerated, <r> reached by a step, <e> excused`
  (`borrowed-census.test.mjs:367`) to `census=<n> (reached <r>, excused <e>)`. Same set, new spelling, so that
  two denominators cannot be read as one; the rewrite is recorded in the ticket's changes.
* Added: a run with no census spells its operations term `placed=<p> excused=<e>` and its census term
  `census=none`. Red today (it prints the bare record count).

#### T5.3 `tests/educe-sequences/report-counts.test.mjs` — new

`report.mjs` is currently exercised only through `inquest.test.mjs` and `predicate.test.mjs`, and neither looks
at the measured lines. A new file drives `healthLines`/`buildReport` over the golden fixture's status and
asserts:

* the measured block carries exactly the nine terms of T2.1 in the line's order, plus the mapping note when
  the predecessor is version 1;
* the partition composition is the artifact's own (`entry 6, neighbour 2`; `positioned 2, suppliedRule 1`), and
  a zero-count member still prints;
* a predecessor stored with `coverage_version: 1` prints five deltas and four named
  `(previous generation: not measured)` terms, and the mapping note — and prints no silent blank;
* a predecessor stored with the current version prints nine deltas and no note;
* the `inquest*` lines keep their own annotations unchanged — the rule is scoped to the measured block.

#### T5.4 What must not be touched

`tests/educe-sequences/genericity.test.mjs` (C007) must pass **unmodified**. It is the constraint that makes
this fix generic rather than a Gaia-shaped one: it reads every module under `rail/` and every brief and refuses
a project token. If a proposed edit to Tier 1, Tier 2 or Tier 3 needs a project word, the edit is wrong.

### Tier 6 — install

```
make install-to-projects
```

runs `node install.js -y -t` into `~/shyme/zasso/.claude`, `~/shyme/zasso/crates/siprs/.claude`,
`~/shyme/gaia/.claude` and `~/shyme/conver/.claude`. The copies must end up byte-identical to this
repository's. Two consequences to state, not discover:

* The installer **does not delete**, so a file removed here stays in the target as an orphan; this change
  removes no file.
* The installed copy gains the 21st check. A **verification** run (no readings) against the existing gaia
  artifact will then refuse with the 78 refusals of §2.5. A **generation** run does not (§1.7).

---

## 4. Post-install acceptance — the human's next run

After Tier 6, in `~/shyme/gaia`:

```
/educe-sequences GaiaSekkeiShiyousho_v32.md
```

The run must print a measured line that answers Q1–Q5 as far as the artifact and the invocation allow:

1. `entries=` and `sequences=` distinct, and `sequences` smaller than `placed` (Q1, Q3).
2. `steps=` with its `drawn` / `elsewhere` split, and `operations=` with its position partition — the
   `elsewhere` count being the visible trace of §2.5 (Q2).
3. `placed=` / `excused=`, which is what an interface must implement and what it must not (Q4).
4. `census=none`, stating that the interface's own denominator was not supplied (Q4's honest partial answer,
   §2.3).
5. `linesReached=… of …`, unchanged in meaning (the reading's reach).

**This plan cannot make Q4 a number in gaia.** The interface's member list is borrowed material the invocation
must supply (`pins.sourceEnumerations`, recorded by phase 4: *"When the invocation supplied material carrying a
census, also record `sourceEnumerations[]` naming the file, the shape, the parameter and the role it answers
for"*, `phases.mjs:99`). Until `~/shyme/gaia` supplies an operations census, the honest answer is
`census=none`, and the value of this change is that the absence is **stated**. Supplying the census is an act
in `~/shyme/gaia`, outside this plan's scope (§6).

The run is also the first with a version-1 predecessor: it must show the five mapped deltas and the four named
absences, not a blank.

---

## 5. Definition of Done

| id | check |
|---|---|
| D1 | `coverageOf` reports `coverage_version`, `entries`, `entriesByKind`, `sequences`, `steps`, `stepsDrawn`, `operations`, `operationsByPosition`, `placed`, `excused`, `sections`, `linesReached`, `specLines`, and the three borrowed-census keys, and nothing else |
| D2 | On the golden fixture `coverageOf` returns the numbers of T5.1; on the measured artifact of §1.2 it would return `entries: 553`, `sequences: 68`, `steps: 283`, `stepsDrawn: 203`, `operations: 257`, `placed: 148`, `excused: 109`, `sections: 292` |
| D3 | `coverageLine` is the only spelling, is called by both `run.mjs` and `report.mjs`, and its terms in order are `entries`, `sequences`, `steps`, `operations`, `placed`, `excused`, `sections`, `linesReached`, `census` — with the phase-driver block emitting exactly those terms, one per line, same text |
| D4 | Every partition prints every member, sorted by name, including zero counts; no member is dropped and no vocabulary is written in code |
| D5 | `censusSpelling` prints `none` when no census is borrowed, and `<n> (reached <r>, excused <e>)` otherwise; the artifact's record count never appears in the census position |
| D6 | A predecessor is compared per key through `PREDECESSOR_KEY_FOR`; a key with no counterpart prints `(previous generation: not measured)`; the mapping is named once when the predecessor was measured under another version; no key is suppressed silently, in either surface |
| D7 | No delta is drawn between two sets: `operations` compares `operations` and `placed` carries no predecessor (rev 1's `+72` is gone) |
| D8 | The product path's line alone answers Q1–Q3 and Q4-as-`census=none`, with no block (asserted over `run.mjs`'s stdout) |
| D9 | `briefs/uncovered.md` states the `singleStep` outcome rule of Tier 3, and `tests/educe-sequences/genericity.test.mjs` passes unmodified |
| D10 | No engine check was added or removed: `ENGINE_DECLARED_CHECK_COUNT` and the `checksRun=N of N` the tests assert are unchanged |
| D11 | `make test-educe-sequences` passes with no assertion weakened; every changed assertion was changed from a wrong expectation to a right one, and each is listed in the ticket's changes |
| D12 | `make install-to-projects` leaves the four installed copies byte-identical to this repository's (`diff -q` is silent for each changed file) |
| D13 | `docs/EDUCE-SEQUENCES-DESIGN.md` states the entry/sequence rule, the `singleStep` outcome rule and the `census=none` rule, and `make test-educe-sequences` still holds its three measured quantities |
| D14 | §1.2's 80-elsewhere and §2.5's 78-refusals discrepancy is resolved and the resolution recorded before any assertion depends on either number |

---

## 6. Constraints and prohibitions

* **Scope is this repository.** Nothing under `~/shyme/gaia` is edited by this plan — including the artifact
  repair of §2.5 and the supply of an operations census (§4). The consumer is updated by
  `make install-to-projects` and by nothing else.
* **Do not add an engine check.** The report is measured, not gated, by design. A check that held the label to
  the number would make a label a pass condition and turn a measurement into a target — the exact thing
  `coverage.mjs` says these numbers are not.
* **Do not introduce a percentage, a ratio or a threshold.** `coverage.mjs`'s head forbids it in the file that
  computes these numbers. "何 % 実装したら成功" is not a thing this command may print; §1.5 states what it may.
* **Do not rename the `sequences` section of the artifact.** It is read at ~25 sites across twelve modules
  (`engine.mjs` treats it as the entry list, `gates.mjs:87` filters `kind === 'entry'`, `load.mjs` checks its
  shape, `harness.mjs` mutates it), it is a required section of `artifact-schema.json`, and the design already
  calls it the entry ledger. The defect is the printed label.
* **Do not import `engine.mjs` from `coverage.mjs`.** `engine.mjs` imports `coverage.mjs`. The shared
  vocabulary moves down to `load.mjs` (T1.0), it does not move sideways.
* **Do not weaken a test to reach green.** Several assertions state the wrong number *on purpose*; they pinned
  the behaviour that existed. Each is rewritten to the corrected expectation as the Red step, and each rewrite
  is recorded. An assertion deleted rather than corrected is a violation. The `borrowed-census` spelling change
  (T5.2) is a rewrite to a corrected spelling, not a relaxation, and the set it asserts is unchanged.
* **Preserve the one-spelling rule.** If a second spelling is introduced anywhere so that one surface can print
  something the other cannot, D3 fails and the change is wrong. This is why the composition moves into
  `coverageOf` (T1.1) rather than being composed at the two print sites.
* **Every touched function gets the house treatment**: verb-phrase names, no hardcoded vocabulary that the
  schema already declares, a `// [::TICKET::] <key> changes.` provenance line carrying the runnable
  design-context command, and comments that state why the key exists rather than what it computes.

---

## 7. Verification commands

The impact set, measured 2026-10-09 before any edit (rev 1's measurement, inherited): **398 tests, 398 pass,
0 fail, 2.7 s**.

```bash
cd ~/shyme/zasso/tools/conver

# the impact set for this change — expect 0 fail, and a larger count than 398
make test-educe-sequences

# the report itself, over the frozen fixture, before and after
node --input-type=module -e "
import {readFileSync} from 'node:fs';
import {coverageOf,coverageLine} from './.claude/scripts/educe-sequences/rail/coverage.mjs';
const a=JSON.parse(readFileSync('tests/educe-sequences/fixtures/spec/ledger-sequences.json','utf8'));
console.log(coverageLine(coverageOf(a)));"
# before: sequences=8 steps=6 operations=3 rows=10 linesReached=60 of 60
# after:  entries=8 (entry 6, neighbour 2) sequences=2 steps=6 (drawn 6, elsewhere 0) operations=3 (positioned 2, suppliedRule 1) placed=2 excused=1 sections=10 linesReached=60 of 60 census=none

# the neutrality constraint, unmodified
node --test tests/educe-sequences/genericity.test.mjs

# the three quantities the design document is held to
node --test tests/conventions/design-measurements.test.mjs

# no stubs, no crimes
make stubs
make crimes

# the copies converge
make install-to-projects
diff -q .claude/scripts/educe-sequences/rail/coverage.mjs ~/shyme/gaia/.claude/scripts/educe-sequences/rail/coverage.mjs
diff -q .claude/scripts/educe-sequences/rail/report.mjs   ~/shyme/gaia/.claude/scripts/educe-sequences/rail/report.mjs
diff -q .claude/scripts/educe-sequences/briefs/uncovered.md ~/shyme/gaia/.claude/scripts/educe-sequences/briefs/uncovered.md
```

The full surface is `node tests/run-all-surfaces.mjs` (the `make test` target runs exactly this). It is long.
This repository's standing rule is to verify the impact set, and **the impact set is green** — none of the
surface's recorded failures is a file in `tests/educe-sequences/` or in the two convention files that target
runs. Rev 1's measurement of the full surface (466 test files, exit 1: `claude-tests` 14 failed, `project-js-cjs`
1 failed on `tests/scope-extensions.test.cjs` refusing `.jsonl`, `project-mjs` 7 failed in `tests/explain-seed/`
and the workspacify and ledger surfaces) is **inherited, not re-measured here**, and is quoted so that an
implementer judges a regression against it rather than against zero. All 22 are pre-existing, and no file this
plan touches is among them.

The gaia copy is one check behind this repository (`every-step-belongs-to-a-drawn-sequence`, `engine.mjs:225`).
A *verification* run of this repository's `rail/run.mjs` against `~/shyme/gaia/GaiaSekkeiShiyousho_v32.md` is
read-only and currently exits 1 with 78 refusals (§2.5). That is expected and is not a regression caused by
this plan; a *generation* run is judged by what it builds (§1.7).

---

## 8. What this plan does not fix

* **The artifact of §1.2.** Its 78 steps hang off entries ruled `notASequence`, and this repository's rail
  refuses it. The repair is to rule the owning entries by `outcome: singleStep` (or to re-read them). Under
  Tier 3 the *next generation* in gaia cannot reproduce the defect, but the artifact on disk today is still
  refused by a verification run. Repairing it is a gaia-side piece of work.
* **Supplying the interface census in gaia.** Q4 is a number only when the invocation supplies
  `pins.sourceEnumerations` with `role: "operations"` (§4). Until then the honest report is `census=none`. This
  plan states the absence; it cannot fill it.
* **An implementation-side metric.** The rail reads the specification, not the code. "実装済み率" needs a join
  between the census members and the implementation, which is a different apparatus (§1.5).
* **The red tests on the full surface.** 22 of them, measured by rev 1 and inherited in §7, none in this
  plan's impact set. The one that touches this command's own work is `tests/scope-extensions.test.cjs` refusing
  `.jsonl`, which the educe-sequences fixtures present and the extension decision map does not carry; deciding
  it is a one-line addition to that map beside `.json` and `.md`. This plan neither fixes nor hides any of the
  22.
* **The product path's line set.** `run.mjs` prints `sequencesUnread` and the guarantee lines but neither
  `phasesDone`, `readPhasesSettled` nor the `inquest*` lines, while `phase.mjs report` prints the reverse.
  Pre-existing, and not a wrong number. Tier 2 changes what the shared line says, not which lines each surface
  prints.
* **`rail/text.mjs`.** Its `--list` mode prints one line per entry, carrying `outcome ?? 'unread'`. The outcome
  is on the line, so a reader can see `notASequence`; the mode is named for listing an artifact's records, not
  its sequences. Left as it is.
* **Whether a check enforces `reached + excused === enumerated`.** T5.2 records the question and requires it
  answered during Tier 1; if no check enforces it, the plan says the assertion is a fixture property rather
  than implying a guarantee.
* **The `entries` census role.** `every-censused-entry-adjudicated` (`engine.mjs:147`) exists and is untouched.
  Whether an *entries* census should also carry the sequence question (Q3's denominator, borrowed rather than
  declared) is a design question with its own plan, and `coverageLine` leaves room for it as a second census
  term when it is decided.
* **Any change outside `~/shyme/zasso/tools/conver`.** Including the consumer's installed copy, which receives
  this change by `make install-to-projects` or not at all.
