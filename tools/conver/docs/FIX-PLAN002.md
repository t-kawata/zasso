# FIX-PLAN002 (rev 4) — `/grill-me-for-rfc`: implementability defects, cross-directory resolution, and the two ledgers

Status: instruction for an implementing AI. Nothing here is implemented yet.
Scope: `.claude/commands/grill-me-for-rfc.md` (prose), `.claude/scripts/grill-me-for-rfc/` (five new scripts), `tests/grill-me-for-rfc/` (tests), and a retro-pass over the nine completed packages under `~/shyme/gaia/crates/`.
Language: this document is English, per the project Language Protocol. Japanese strings inside insertion blocks are **verbatim** — copy them byte for byte.
Verification: the impact set, not the full surface (§6). The full surface is `node tests/run-all-surfaces.mjs`; it takes long enough that the project forbids it as a routine check, and `.claude/tests` carries 14 failures that are a recorded baseline, not regressions (§6).

**Ticket.** MUST RESOLVE before Tier 1 begins: allocate the ticket with the project's ticket tooling and record its key here. Every file Tier 1 and Tier 2 touch will be ticket-modified code and will need the `// <KEY> @verifies <Cxxx>` provenance header the neighbouring tests already carry (`tests/grill-me-for-rfc/settle/command-file.test.mjs`, `tests/grill-me-for-rfc/args/command-file.test.mjs`). Do not invent a key.

**Path note — corrected in rev 4.** This repository (`~/shyme/zasso/tools/conver`) is the development home of the command; `~/shyme/gaia` holds an *installed* copy. Rev 3 asserted the two copies were byte-identical at 492 lines. **They are not.** Measured 2026-10-06:

| copy | lines | what it carries |
|---|---|---|
| `~/shyme/gaia/.claude/commands/grill-me-for-rfc.md` | 492 | the install as of 2026-10-05 16:40 |
| `.claude/commands/grill-me-for-rfc.md` (this repo) | 510 | + the PX-238 changes: the `canon-state.js` guard and the `backup-rfc.js` call in STEP 5 |

The conver copy is ahead by two blocks (§T1 anchors below are stated against the 510-line file). `canon-state.js` and `backup-rfc.js` exist in conver only. Tier 3 converges the two; because the install runs one way, converging means carrying PX-238 into gaia as well (§3 Tier 3).

**Anchor discipline — corrected in rev 4.** Every anchor in this document is a **heading string**, not a line number. Line numbers are given as a convenience and were correct against the 510-line file on 2026-10-06; they drift the moment an earlier insertion lands. An implementer who cannot find the heading must stop rather than guess.

---

## 0. What a defect is — added in rev 4

Rev 3 used "defect" loosely and built its gates around a ledger of *recorded* defects. That is the wrong unit. This revision states the definition the rest of the document depends on.

**A defect is a place where the design cannot be implemented.** Three forms, and only three:

| class | what it is | worked example from the nine runs |
|---|---|---|
| **contradiction** | two statements cannot both hold | the seed's §7 forbids "a session or transaction handle" while requiring the suite to exercise commit and rollback; `gaia-ports` §3.9.4 resolves it — atomicity is a batch, not a handle |
| **conflict** | two declarations compete for one thing, or one side demands an outcome the other cannot produce | a single `put_object` has no conflict outcome while the batch does; a write path carries no proof bundle while the read path returns one |
| **deficiency** | a name is used but not defined, a contract is missing, a boundary is unstated | `ScanPage`, `ScanLimit` and `CheckpointRef` are used by two operations and a test but defined nowhere, though §4.1 claimed `store.rs` held `ScanPage`; the read result type is named three ways (`Proven` in §3.12, a private double in §3.14, `stored.carrier.bytes` in §3.2) |

The test is one question: **can an implementer read this design and write the implementation to the end, inventing nothing?** A place where they must invent is a defect. "The implementer will decide" is not a design.

**Scope of the inspection is the whole workspace.** The workspace is a set of parts. A part's design is implementable only in composition with its neighbours: its types must be the types its neighbours pass, its ordering claims must be the ordering its neighbours assume, its edges must name counterparts that exist. Therefore:

- reading only this package's directory is insufficient by construction;
- a defect whose fix lives in a neighbour is still **this run's defect**, and resolving it is the ordinary case;
- `resolved-other` is a *disposition*, not a deferral — the neighbour's artifacts must actually be corrected and its own gates re-run.

**The ledgers are records, not the goal.** The seed divergence ledger and the defect ledger exist so a later reader can tell which document wins and what was already checked. A gate that passes on a well-formed ledger proves the bookkeeping, not the design. The obligation is the implementability of the workspace; the ledger is how the run demonstrates it was discharged.

---

## 1. Background

### 1.1 What was run

Nine `/grill-me-for-rfc` runs are complete under `~/shyme/gaia/crates/`: `gaia-foundation`, `gaia-network`, `gaia-soul`, `gaia-ports`, `gaia-invariants`, `gaia-forum`, `gaia-time`, `gaia-store-memory`, `gaia-store-sqlite`. That is nine packages, and `find ~/shyme/gaia/crates -name RFC.md` returns exactly nine — the nine are the scope of Tier 3.

Rev 3 additionally described "the tenth run, against `gaia-store-sqlite` (pkg-0026)" while listing `gaia-store-sqlite` among the nine. That was a counting error; there is no tenth package. What the tenth *run* refers to is the second pass over `gaia-store-sqlite`, and it is not a separate directory.

That run closed correctly by every gate the command defines: **0 questions, 28 settled nodes, `check` exit 0, `answers` exit 0**.

Everything below was found *after* that clean close, by the human asking one question: 「欠陥に対して現時点で対応しておく必要はないのか？」 — "don't the recorded defects need handling now?"

### 1.2 Three classes of defect the command never asks a run to look for

#### (a) A stale input record

`INFO-RFC-SEED.md` §9 named `residual-000008` (the store port's transaction boundary) as the one point "the grill must settle", and §10 stated *"No neighbouring package has settled a question this package shares."*

Both were stale. The upstream `crates/ports/gaia-ports/RFC.md` §3.9.4 is titled, literally, **"Atomic batch, and no transaction handle"**, and its Appendix C defect 5 adds that "atomicity is a batch, not a handle". The timestamps:

```
INFO-RFC-SEED.md generated     2026-10-05 12:31
gaia-ports/RFC.md completed    2026-10-06 02:40   → §3.9.4 settles residual-000008
```

The stage-one record is a snapshot. It cannot see an upstream RFC published after it was generated. Had the run trusted §10, it would have asked the human a question the provider had already answered.

#### (b) Defects that make the workspace unimplementable and are owned elsewhere

Auditing the nine packages' defect appendices on 2026-10-06 produced the breakdown below. Rev 3 recorded the total as 52 and the breakdown as shown; the breakdown sums to roughly 47, so at least one of the two figures is wrong and **neither is reliable as written**. Re-measure before use. Grouped by the directory that owns the fix:

| owner | count | disposition at the time |
|---|---|---|
| `gaia-ports` (its own `RFC.md`) | 11 | recorded by `gaia-store-memory` and `gaia-store-sqlite`, which could not fix another package's document |
| the recording package's own seed | ~30 | resolved by the design taking the correct reading |
| `EXPLAIN-RFC-SEED.md` (generated) | 4 | resolved by the design |
| the contract registry / manifests | 2 | resolved by the design |

The eleven `gaia-ports` defects were the deficiency and conflict classes in bulk: the read result type was named in two signatures but defined nowhere (§3.12 defined `Proven` instead, the only `StoredObject` was a *private double* in §3.14, and §3.2 read `stored.carrier.bytes` — three names for one value); `ScanPage`, `ScanLimit` and `CheckpointRef` were used by two operations and a test but defined nowhere, although §4.1 claimed `store.rs` held `ScanPage`; `IdempotencyKey` derived neither `Ord` nor `Hash`, so the at-most-once ledger the entrance requires was not expressible in the standard collections; a single `put_object` has no conflict outcome while the batch does; the write path carries no proof bundle while the read path returns one; and the scan range's inclusivity was unfixed.

Under §0, every one of them is an implementability defect, and every one was **unreachable by any fix inside the recording package**. They were resolved by a re-entry round on `gaia-ports` — settle six nodes, correct `RFC.md`, regenerate `CheckList.md`, return to DONE. That round cost the human nothing: all six points settled from `gaia-ports`' own records, so it opened no question.

**State of those eleven at the time of writing (corrected in rev 4).** Rev 3 called them "live" and separately said the re-entry round resolved them, which a reader cannot reconcile. Precisely: they are **resolved upstream** in `gaia-ports/RFC.md` as of 2026-10-06, and they remain **asserted as live** in the two downstream appendices that recorded them. A resolution that exists only upstream is itself a defect in the downstream record (§1.3, third bullet). Tier 3 closes both halves.

#### (c) A false defect, already propagated

`gaia-store-memory`'s Appendix C recorded that `gaia-ports` §4.4 "shows a malfeasance test passing a retry argument to `put_object`, which §3.9.2's signature does not have", quoting `deadline_without_retry()` and annotating it `no such argument`.

**It is false.** `deadline_without_retry()` is a *nullary* function returning a `Deadline`. The call carries exactly the four declared arguments.

That claim had already reached **two RFCs and one checklist** before anyone opened §4.4. The `gaia-store-sqlite` run had copied it forward without checking, because a neighbouring run's appendix reads like evidence — and the command says nothing about verifying it.

A false defect is also an implementability defect of the third kind: it makes an implementer change code that is already correct, or stop at a boundary that does not exist.

### 1.3 The cost

- Nine clean runs closed DONE while 11 implementability defects stayed uncorrected in an upstream document, because no rule told any run to look outside its own directory.
- A human had to propose the cross-directory fix and the seed-divergence ledger; neither was in the command.
- A false defect travelled into two published RFCs. Nothing in the command refuses a misreading, because a misreading is typed exactly like a reading.
- After the upstream fix, the downstream RFCs and checklists still asserted the defects as live. A resolution that exists only upstream is a defect in the downstream record.

### 1.4 What this fix must prevent

1. A design that cannot be implemented — in any of the three classes of §0 — surviving DONE, **including when the fix lives in another directory**.
2. A claim inherited from another package's document travelling unverified.
3. A seed statement that contradicts the finished RFC leaving no trace, so a reader treats the stale text as equal authority.

### 1.5 Revisions this plan absorbed — and rejected

The rules in §3 are the **fourth** revision. The first two were rejected; **do not reintroduce what they contained.**

| revision | what it proposed | why it was rejected |
|---|---|---|
| 1 | "resolve now, **or record it as `unresolved` with the reason**" | an escape hatch that legalises leaving cross-directory defects unfixed. The human: 「別ディレクトリも含めて直さないと解決できない欠陥が解決されないのではダメ。別ディレクトリの修正も含めて全解決を明確に最優先にせねばならない。」 |
| 2 | "the edit surface is `<dir>/RFC.md` only" | too narrow. The human: 「DesignTree.json と CheckList.md など、/grill-me-for-rfc で生成されるファイルに関しては編集可能対象で良いのでは？」 |
| 3 | full resolution is the top priority; the edit surface is everything the command *generates*; the inputs stay frozen | factually and structurally defective against the repository: stale anchors, an impossible insertion point, a gate that contradicts its own constraint, an unspecified record format, and a scope defined by record-keeping rather than implementability (§8 lists all twelve) |
| 4 | **this revision** — §0 defines the defect as implementability and fixes the inspection scope at the workspace; every rev-3 defect is closed in place; the record format is specified so Tier 2, Tier 3 and Tier 4 can be written against one shape | — |

---

## 2. Root cause

`grill-me-for-rfc.md` already contained rules that arguably cover (b) and (c) — and they did not fire:

| existing text (anchor) | why it did not fire |
|---|---|
| `## The ladder` → **Q0'** — "an upstream artifact or a neighbour clearly settled it → settle; ground is that document" | this settles a *question*. It says nothing about a defect in the neighbour's own document, which is the opposite situation: the neighbour is the one that is wrong. |
| STEP 8a — "a viewpoint the human brings afterwards is a node like any other" | the human's "fix the defects" arrived after DONE, and was handled as a node. It worked — but only because a human brought it. Nothing in the command raises it. |
| `## Gates` — G0 records, G1 settle, G2 fill, G3 ask, G4 check, G5 answers | all six are about *questions*. There is no gate about the correctness of the records the run read. |
| `## RFC Hard Constraints` — "zero occurrences of TBD, TODO, stub, or scope delegation" | forbids *this* document being incomplete. Says nothing about another document being wrong, and nothing about a name this document uses without defining. |
| STEP 0 — `settle-run.js prior` | reads the prior records to ground settlements. Never asks whether what it read is **true**. |

Structural causes, in order of importance:

0. **The command has no concept of a defect at all.** It has questions, points, nodes, gates and a verdict — every one of them about whether a *question* was answered. Nothing in the vocabulary names "this design cannot be implemented". §0 supplies the missing concept; without it the other causes are unfixable, because a rule cannot require something the command cannot name.
1. **No concept of a defect owned elsewhere.** The command's unit of work is one directory. A defect whose fix lives in another directory is invisible to it by construction.
2. **DONE is reachable with implementability defects.** STEP 8's gate is three conditions, all about this directory's own completeness.
3. **A neighbour's record is treated as evidence.** `prior` reads neighbours' artifacts and admits their grounds; nothing distinguishes *quoting* a neighbour from *trusting* one.
4. **The seed's authority is never bounded.** The command reads `RFC-SEED.md` as material and as a gate ("a disagreement with the manifests is a gate failure"), but never states where the RFC's authority begins. A reader cannot tell which of two disagreeing documents wins.

---

## 3. The change

Four tiers. **Tier 1 is mandatory. Tier 2 is recommended and is code. Tier 3 is required if Tier 2 is done. Tier 4 is required for Tier 2.**

### Tier 1 — command prose (`.claude/commands/grill-me-for-rfc.md`)

Seven insertion points. Each gives the heading anchor and the exact text. Line numbers are against the 510-line file as of 2026-10-06 and are indicative only.

#### T1.1 — new first-class section, above the shared block (before line 23)

**Corrected in rev 4.** Rev 3 said "insert immediately before `## The ladder` (line 67) … **outside** the shared `<!-- question-gate:begin --> … <!-- question-gate:end -->` block". Those two instructions are mutually exclusive: the block begins at line 23 and ends at line 148, so line 67 is **inside** it. There is no position that is both immediately before `## The ladder` and outside the block.

The resolved anchor is **immediately before the line `<!-- question-gate:begin -->`** — that is, after the `## Language Protocol` table and above `## Core Rule`. This is the only placement that satisfies "outside the block" while keeping the section first in the document, which is what its heading claims.

Why it must stay outside: the block is byte-shared with `/drill-rfc-down` and guarded by `tests/question-gate/unit/shared-rule-text.test.mjs`, `tests/question-gate/unit/one-driver.test.mjs` and `tests/question-gate/unit/reverse-g2-g3-untouched.test.mjs`. Editing inside it without editing the twin command turns those red. §5 of this plan forbids folding that into this change, and rev 4 keeps that prohibition.

```markdown
## ★ Cross-directory resolution (first-class, top priority)

A grill reads records. Some of what it reads is wrong, and a design that cannot be
implemented is wrong whatever its records say. A run that only answers questions carries
the wrongness forward — and a defect whose fix lives in another directory is invisible to
a run that never looks outside its own.

A **defect** is a place where the design cannot be implemented: a **contradiction**
(two statements cannot both hold), a **conflict** (two declarations compete for one
thing, or one side demands an outcome the other cannot produce), or a **deficiency**
(a name is used but not defined, a contract is missing, a boundary is unstated). The
test is one question: can an implementer read this design and write the implementation
to the end, inventing nothing? A place where they must invent is a defect.

- **resolve all of them**: every defect this run finds is resolved before the run declares
  DONE. "Recorded and left open" is not a disposition this command admits.
- **the inspection is the whole workspace**: this package is a part. Read the neighbours'
  designs, not only their appendices, and check the composition — that the types this
  document names are the types its neighbours pass, that its ordering claims are the ones
  they assume, that every edge names a counterpart that exists. A part is implementable
  only in composition.
- **the target may be another directory**: a defect owned by another package is resolved by
  correcting that package's artifacts. Reaching across directories is the expected case,
  not an exception.
- **the edit surface is what this command generates**: `RFC.md`, `DesignTree.json`,
  `CheckList.md` and `Status.json` are editable **anywhere**. `RFC-SEED.md`,
  `INFO-RFC-SEED.md`, `EXPLAIN-RFC-SEED.md`, the `WORKSPACIFY-*.json` manifests and the
  specification are **never** edited: their hashes are recorded and chained.
  `guard-edit-surface.js` refuses them by name.
- **a seed defect is resolved in the output, not in the input**: where a stage-1 artifact
  asserts something a higher record contradicts, the resolution is the RFC naming the
  contradiction, taking the correct reading, and indexing it in the ledger. That is a
  resolution, not a deferral.
- **verify before carrying**: a defect inherited from another package's appendix is a
  *reading*, not a record. Open the cited section with `show-record.js` and confirm it
  before it travels. A false defect propagates: one reached two RFCs and a checklist before
  anyone read the source.
- **follow the fix downstream**: after a cross-directory fix, every artifact that recorded
  the defect as live is corrected — the target's, and the recording package's.
- **an unread neighbour is not a clean neighbour**: "no defect found" is a result, and the
  ledger records the checks that produced it. A run that did not look has not cleared
  anything.

Gates this section adds, carried outside the shared question-gate block:

- **G6 defects** — every defect found in any package is resolved: `resolved-here`,
  `resolved-other` (naming the directory and the date) or `withdrawn`. None is `open`. No
  input artifact was edited. The seed divergence ledger and the defect ledger are both
  present and well formed, and the defect ledger records the composition checks performed.

Rule: G5 and G6 are both required for DONE; a run may not trade one for the other.
Prohibition: never resolve a G6 failure by recording the defect and moving on.
```

#### T1.2 — `## RFC Hard Constraints` (four bullets, currently lines 383–386)

Anchor: after the bullet `- IETF-style structure: Abstract / Motivation / Design / Implementation / Appendix`. Add four bullets — rev 3's two, plus two that carry §0 into the document's own constraints:

```markdown
- the document carries a **seed divergence ledger** appendix (STEP 5b)
- the document carries a **defect ledger** appendix (STEP 7b)
- every type, trait, constant and operation the document names is **defined in this document
  or named with the record that defines it** — a name used and defined nowhere is a deficiency
- every cross-package edge states its **counterpart**: the artifact on the other side and the
  type or contract that crosses it
```

#### T1.3 — new `### STEP 5b`, between STEP 5 and STEP 6

Anchor: after the closing code fence of STEP 5 (`update-status.js "$RFC_DIR" set-state WRITING`), before the `---` that precedes `### STEP 6` (line 394 in the 510-line file).

```markdown
### STEP 5b: Seed divergence ledger

The RFC carries an appendix titled **Seed divergence ledger**. Its job is the precedence
question a reader otherwise has to guess at: this document is canonical, and the three
stage-1 artifacts beside it are inputs.

It contains, in this order:

1. a **precedence statement** — `RFC.md` is canonical; `RFC-SEED.md`, `INFO-RFC-SEED.md` and
   `EXPLAIN-RFC-SEED.md` are the stage-1 inputs this run read, not authorities; where a
   reader finds one of them disagreeing, this ledger is the index;
2. the **reason the seed is not edited** — its header marks the reference paths, the
   implementation order and the contract ids as machine-injected and states that "a
   disagreement with the manifests is a gate failure", and `INFO-RFC-SEED.md` records the
   seed's sha256, so a rewrite breaks both the gate and the chain;
3. a **table**, one row per departure:
   `Artifact | Location | What the artifact says | What this document decides | Ground`;
4. a **testable form** — a `DIVERGENCES` const and a test asserting every row names one of
   the three stage-1 artifacts and a resolvable location, so a departure cannot quietly
   disappear.

A package with **no** departure still carries the appendix, and it records the **checks**
that establish that. "No departure" is a result, not an omission, and it must be auditable
rather than trusted.

gate: node .claude/scripts/grill-me-for-rfc/check-divergence-ledger.js "$RFC_DIR"
```

#### T1.4 — new `### STEP 7b`, after STEP 7a and before STEP 8

**Corrected in rev 4.** Rev 3 placed STEP 7b *between* STEP 7 and STEP 7a, which makes the document read 7, 7b, 7a, 8. The numbering is monotonic nowhere else in this file. The corrected anchor is **after STEP 7a's closing code fence and before the `---` that precedes `### STEP 8`** (line 438 in the 510-line file), so the order reads 7, 7a, 7b, 8.

````markdown
### STEP 7b: Cross-directory defect resolution

Every defect this run found is resolved, including the ones no fix inside this directory
can reach. A defect is a contradiction, a conflict or a deficiency — a place where the
design cannot be implemented (§0). The inspection covers the workspace: the neighbours'
designs, not only their appendices.

1. Name each defect's **class** and its **target**: the directory whose artifact is wrong.
2. Guard the edit surface before touching it.
   ```bash
   node .claude/scripts/grill-me-for-rfc/guard-edit-surface.js "<TARGET_PATH>"
   ```
   exit 1 → the path is an input and MUST NOT be edited. Resolve the defect in the owning
   RFC's output instead, and never in the seed.
3. Correct the target's `RFC.md`, and settle a DesignTree node there so the fix passes that
   package's own gate. Regenerate its `CheckList.md`, and return its `Status.json` to DONE.
4. Correct every other artifact that recorded the defect as live — the recording package's
   RFC and checklist included. A resolution that exists only in the target is a defect in
   the record that still asserts it.
5. Write the **defect ledger** appendix (format below) and return here to re-run STEP 6 →
   STEP 8: the cross-directory fix invalidates every record that read the old text.

**Defect ledger format.** The appendix title ends with `Cross-directory defect ledger`.
One table, six columns, in this order:

| Defect | Class | Target | Disposition | Evidence | Ground |
|---|---|---|---|---|---|

- `Class` — `contradiction`, `conflict` or `deficiency` (§0). No other value.
- `Target` — repository-relative path of the artifact that must change; it ends in `RFC.md`.
- `Disposition` — `resolved-here`, `resolved-other` or `withdrawn`. `open` and `unresolved`
  are not members of this vocabulary.
- `Evidence` — `resolved-other`: `<target> @ YYYY-MM-DD`; `resolved-here`: `§<section>`;
  `withdrawn`: the artifacts the withdrawal was recorded in.
- `Ground` — the record that makes the disposition right. Never empty.

A package with **no** defect still carries the appendix, and it carries a **composition
check** subsection listing the neighbours whose designs were read and what was checked —
types crossing each edge, ordering claims, contract counterparts. "No defect" is a result,
not an omission.

gate: node .claude/scripts/grill-me-for-rfc/defect-report.js <workspace-root> --gate
````

#### T1.5 — STEP 8 gate (currently line 440)

Replace the gate line with:

```markdown
gate (all 5 required): all DesignTree nodes `resolved` (`open-count`=0) AND all CheckList items ✅ AND zero TBD/TODO/stub/delegation in the RFC body AND the seed divergence ledger and the defect ledger are present and well formed AND `defect-report.js --gate` exits 0.
```

#### T1.6 — `## Gates` — **moved out of the shared block in rev 4**

**Corrected in rev 4.** Rev 3 said "Anchor: after the existing `- **G5 answers**` line. Add: `- **G6 defects** …`". That line is at 120, inside the shared block (23–148). Rev 3's own §5 says *"If any part must go inside, that is a separate decision with its own plan — do not fold it into this one."* The instruction contradicted the constraint in the same document, and it would have turned the three `tests/question-gate/unit/*` guards red.

The resolved text of G6 is carried in the T1.1 section, above the block, and `## Gates` is **left untouched**. `## Reverse mode (G1 to G5)` (line 473) therefore stays accurate: G6 is not part of the reverse ladder.

#### T1.7 — STEP 8a (currently line 447; numbered list begins at 453)

Anchor: the numbered list. Add a fourth item after item 3:

```markdown
4. A defect whose target is another package re-enters **that** package, not this one:
   `guard-edit-surface.js` the target, correct its `RFC.md`, settle a node there, then
   re-run that package's STEP 6 → STEP 8 before returning here. A cross-directory fix that
   leaves the target's gates unrun is not a fix.
```

---

### Tier 2 — the mechanical gates (code). Recommended.

Five scripts under `.claude/scripts/grill-me-for-rfc/`. The directory declares `{"type":"module"}` and `.claude/rules/node.md` records it as `module`, so these are ESM `.js` files — not `.mjs`. House style, read off `canon-state.js` and `update-status.js`: a shebang, a JSDoc block naming the invocation, `process.exit(0|1)`, and a single JSON line on stdout when `--json` is passed.

#### T2.1 `guard-edit-surface.js <path> [--why]`

The mechanical enforcement of the edit boundary, and the cheapest of the five.

- **Exit 1** for a known input, printing why and what to do instead (`resolve it in the owning RFC's output`): basename `RFC-SEED.md`, `INFO-RFC-SEED.md`, `EXPLAIN-RFC-SEED.md`, `WORKSPACIFY-ALLOCATE-MANIFEST.json`, `WORKSPACIFY-TREE-MANIFEST.json`, or matching `GaiaSekkeiShiyousho_v*.md`.
- **Exit 0** for a known output: basename `RFC.md`, `DesignTree.json`, `CheckList.md`, `Status.json`.
- **Exit 1 for anything else**, with `unknown path; extend the allow-list deliberately`. Default-deny: the boundary is a list a human grows, not a guess.
- `--why` prints the matching rule. If a path matched no rule, `--why` must say so and still exit 1.

#### T2.2 `defect-report.js <root> [--gate] [--json]`

The workspace-wide inventory, and the gate that makes full resolution binding.

- Walks `<root>` for `RFC.md` files. For each, parses the appendix whose title ends with `Cross-directory defect ledger` (T1.4) and the seed divergence ledger (T1.3).
- Groups by **target directory**, by **class**, and by **disposition**.
- **`--gate` exits 1** while any row's class is outside the three, its target does not end in `RFC.md`, its disposition is outside the three, its `resolved-other` evidence is not `<path> @ <date>`, or its ground is empty. It also exits 1 when a package carries **no** defect-ledger appendix, because absence is indistinguishable from "not looked" unless the package records the checks — an appendix with zero rows and a composition-check subsection is the passing form.
- Without `--gate`, prints the table.
- It parses the RFC's markdown, not a side file: the RFC is the record, and a second source of truth is what this plan exists to prevent.

The disposition vocabulary is exactly three values:

| disposition | meaning |
|---|---|
| `resolved-here` | fixed in this directory's own `RFC.md` — including a seed defect resolved by the RFC taking the correct reading |
| `resolved-other` | fixed in another directory's artifacts; the evidence names the directory and the date |
| `withdrawn` | verified false; the withdrawal is recorded in every document the claim reached |

`open` and `unresolved` are **not** members of this vocabulary.

#### T2.3 `check-divergence-ledger.js <RFC_DIR>`

The structural gate for STEP 5b.

Asserts: the appendix whose title ends with `Seed divergence ledger` exists; the precedence statement is present; the table has the five columns in order; every row names one of the three stage-1 artifacts; every `Location` begins with `§`; every `Ground` is non-empty; the DesignTree carries a resolved `seed-divergence-ledger` node.

**Corrected in rev 4.** Rev 3 also asserted "the design-tree coverage table names that node". Measured 2026-10-06: `gaia-foundation/RFC.md` carries **only** Appendix E — no coverage table at all — so that assertion cannot pass on one of the nine, and D5 as rev 3 wrote it was unreachable. The coverage-table requirement is dropped; the DesignTree-node requirement (present in all nine) replaces it.

#### T2.4 `scan-defects.js <RFC_DIR> [--json]`

Discovery. It cannot decide contradictions — that is not computable — so it reports the **candidate set** for the AI to adjudicate. Exit 0 whether or not it finds anything; a non-empty set is the AI's work, not a failure.

The patterns that produced real defects in the nine runs:

| pattern | what it reports |
|---|---|
| a §13 block deferring trait signatures / concrete I/O contract / protocol implementation | the deferral and its location — the grill process forbids honouring it |
| a §12 item marked unresolved whose topic also appears as a settled item in an upstream RFC | both locations |
| `INFO-RFC-SEED.md` §10 says no neighbour settled a shared question, **and** a neighbour RFC exists whose mtime is later than the INFO seed's | the timestamp pair (the (a) class above) |
| an `EXPLAIN-RFC-SEED.md` settled item whose ground string contains `chosen default` | the item — a default the seed admits it does not fix is not a ground |
| a seed assertion of the form "the specification does not fix X" | the assertion, so the specification can be searched for a counterexample |

Two patterns added in rev 4, which carry §0's composition requirement into the candidate set. These are the ones the nine runs actually exhibited and the five above would have missed:

| pattern | what it reports |
|---|---|
| a name this document uses that is defined in neither this document nor a named record | the name and its uses — the deficiency class |
| a type or contract one package names at a boundary that the neighbouring package names differently or does not declare | both packages and both spellings — the conflict class |

Note on the mtime pattern (row 3): mtime is not stable across clones or checkouts. Treat a hit as a hint to read the neighbour, never as a finding.

The list is extendable, and must be extended whenever a sixth pattern appears in a real run.

#### T2.5 `show-record.js <path> --section "<heading>"`

Makes "open the cited section" a single command instead of a paragraph of advice. Resolves the heading in `<path>` and prints that section's body. **Exit 1 if the heading does not resolve** — which is itself the finding: a claimed defect citing a section that does not exist is a defect in the claim.

---

### Tier 3 — migration

Required if Tier 2 is done.

1. **Retro-pass over the nine gaia packages.** Measured 2026-10-06, they are **not uniform**, and rev 3's "convert each" assumed they were:

| package | defect appendix | seed divergence ledger | ledger has the 5-column header |
|---|---|---|---|
| `gaia-store-memory` | `Appendix C. Defects found in the seed and in the upstream RFC during this grill` | `Appendix E` | yes |
| `gaia-store-sqlite` | `Appendix C. Defects found in the seed and in the upstream RFC during this grill` | `Appendix E` | yes |
| `gaia-ports` | `Appendix C. Defects found in the seed during this grill` | `Appendix E` | yes |
| `gaia-forum` | `Appendix A. Seed defects found during this grill` | `Appendix D` | yes |
| `gaia-invariants` | `Appendix A. Seed and Explanation Defects Found During This Grill` | `Appendix C` | yes |
| `gaia-soul` | `Appendix A. Seed Defects Found During This Grill` | `Appendix C` | yes |
| `gaia-time` | **none** | `Appendix D` | yes |
| `gaia-network` | **none** | `Appendix D` | yes |
| `gaia-foundation` | **none** | `Appendix E` | **no** |

   Per package:

   - the six that carry a defect appendix: retitle it to `Appendix <letter>. Cross-directory defect ledger`, convert its rows to the six columns of T1.4, and supply class, target and disposition for each row. The eleven `gaia-ports` defects recorded by the two store packages become `resolved-other`, target `crates/ports/gaia-ports/RFC.md`, dated 2026-10-06.
   - the three that do not (`gaia-foundation`, `gaia-network`, `gaia-time`): **do not invent rows.** Their rows are the defect-ledger rows *elsewhere in the workspace whose target is this package*; enumerate those from the other packages first, then write the appendix with however many that yields, plus the composition-check subsection.
   - `gaia-foundation`: bring its seed divergence ledger to the five-column form; it is the one package where `check-divergence-ledger.js` fails today.
   - every package: correct every artifact that still asserts a resolved defect as live (§1.2(b)).

2. **Re-sync the install.** The install runs one way, from this repository into four targets, and the runnable form is in this repository's `Makefile`:

   ```bash
   make install-to-projects
   # runs: node install.js -y -t ~/shyme/zasso/.claude
   #       node install.js -y -t ~/shyme/zasso/crates/siprs/.claude
   #       node install.js -y -t ~/shyme/gaia/.claude
   #       node install.js -y -t ~/shyme/conver/.claude
   ```

   Confirm with `diff -q .claude/commands/grill-me-for-rfc.md ~/shyme/gaia/.claude/commands/grill-me-for-rfc.md`.

3. **Re-sync the scripts** — the same command; the installer carries `.claude/scripts/` with the commands. Confirm the two new scripts are present in the target and that `canon-state.js` and `backup-rfc.js` (which conver carries and gaia does not) are carried too — D7 requires the copies be identical, and they cannot be identical while conver is ahead.

   Note the known behaviour recorded in this project: the installer **does not delete**; a file removed here stays in the target as an orphan. Check the target for orphans rather than assuming the mirror is exact.

---

### Tier 4 — tests

Required for Tier 2. `tests/grill-me-for-rfc/`, `node:test` + `assert/strict`, `*.test.mjs`.

Script tests go at the root of `tests/grill-me-for-rfc/`, matching `canon-state.test.mjs`, `generate-checklist-backup.test.mjs` and `rfc-rewrite-backup.test.mjs` already there.

- `guard-edit-surface.test.mjs` — every frozen basename exits 1; every generated basename exits 0; an unknown path exits 1; the `--why` output names the matching rule and an unmatched path still exits 1.
- `defect-report.test.mjs` — a fixture workspace where one row's disposition is missing → `--gate` exits 1; the same with all three dispositions → exits 0; `resolved-other` without a date → exits 1; a package with no ledger appendix → exits 1; a package with a zero-row appendix **and** a composition-check subsection → exits 0.
- `check-divergence-ledger.test.mjs` — a well-formed ledger passes; a row naming `NOTES.md` fails; a row whose ground is empty fails; a missing `seed-divergence-ledger` node fails.
- `scan-defects.test.mjs` — a fixture seed with a §13 deferral and an `INFO` §10 older than a neighbour RFC yields exactly those two candidates; a fixture where one package names a boundary type the neighbour does not declare yields the conflict candidate.
- `show-record.test.mjs` — a resolvable heading prints its body; an unresolvable one exits 1.
- `tests/grill-me-for-rfc/settle/command-file.test.mjs` (**this one**, not `tests/grill-me-for-rfc/args/command-file.test.mjs`) — rev 3 said "`command-file.test.mjs` (existing)" and two files carry that name. The settle one is the file whose stated purpose is "the grill command file is held to what it promises", and it already has `step0()`/`step2()` slicing helpers to copy. Extend it to assert the seven Tier 1 anchors are present. Assert the **heading strings and the gate lines**, never line numbers — the anchors move when the insertions land, and a line-number assertion would fail on the change that satisfies it.

---

## 4. Definition of Done

| id | check |
|---|---|
| D1 | All seven Tier 1 insertions are present, at the anchors named, with their text verbatim. T1.1 is above `<!-- question-gate:begin -->`; `## Gates` is **unmodified**; the three `tests/question-gate/unit/*` guards stay green |
| D2 | The five Tier 2 scripts exist, and the impact set of §6 is green — no new failure beyond the recorded baseline, and no weakening of any existing test |
| D3 | `guard-edit-surface.js` refuses every frozen basename and defaults to deny |
| D4 | `defect-report.js --gate` exits 1 on a workspace with one row lacking a disposition and 0 on a fully-resolved one; it exits 1 on a package with no ledger appendix and 0 on a zero-row appendix with a composition check |
| D5 | `check-divergence-ledger.js` passes on all nine migrated gaia packages — reachable only after `gaia-foundation`'s ledger is brought to the five-column form |
| D6 | The retro-pass converted all nine packages to the §T1.4 form, inventing no rows for the three that had no appendix |
| D7 | `diff -q` shows the conver and gaia copies of the command **and** of `.claude/scripts/grill-me-for-rfc/` are identical |
| D8 | No test was weakened to reach green |
| D9 | The §0 obligation is discharged, not merely recorded: the workspace composition check is written into each package's defect ledger, and no row is `open` |

---

## 5. Constraints and prohibitions

- **Never edit an input.** `RFC-SEED.md`, `INFO-RFC-SEED.md`, `EXPLAIN-RFC-SEED.md`, the manifests and the specification are hash-recorded. Their hashes are recomputed and compared at generation time; editing one breaks the chain and, for the seed, the gate itself.
- **No `open` defect survives DONE.** There is no "record and leave" path, and adding one is a defect in this plan's implementation.
- **The RFC is the record.** Do not introduce a `Defects.json` or similar side file: a second source of truth is what the seed-divergence ledger exists to eliminate. The scripts parse the RFC's markdown.
- **Default-deny in `guard-edit-surface.js`.** An unknown path exits 1. Growing the list is a deliberate human act.
- **Do not weaken `command-file.test.mjs`** — either of them. If an anchor moved, fix the prose or the anchor, not the test.
- **Do not fold the shared block into this change.** The `<!-- question-gate:begin --> … <!-- question-gate:end -->` block is shared with `/drill-rfc-down` and guarded by `tests/question-gate/unit/*`. Tier 1's new section and G6 go **outside** it. If any part must go inside, that is a separate decision with its own plan.
- **The ledger is not the deliverable.** A green `defect-report.js --gate` proves the bookkeeping. The deliverable is §0: a design an implementer can write to the end without inventing anything.

---

## 6. Verification commands

The full surface is `node tests/run-all-surfaces.mjs` (the `make test` target runs exactly this). It is long, and this project's standing rule is to verify the **impact set** instead: run the tests that reference what changed, by `node --test`, and treat `.claude/tests`' 14 failures as the recorded baseline rather than as regressions.

```bash
# the impact set for this change
node --test tests/grill-me-for-rfc/settle/command-file.test.mjs \
            tests/grill-me-for-rfc/args/command-file.test.mjs \
            tests/grill-me-for-rfc/guard-edit-surface.test.mjs \
            tests/grill-me-for-rfc/defect-report.test.mjs \
            tests/grill-me-for-rfc/check-divergence-ledger.test.mjs \
            tests/grill-me-for-rfc/scan-defects.test.mjs \
            tests/grill-me-for-rfc/show-record.test.mjs

# the shared block must be untouched by this change
node --test tests/question-gate/unit/shared-rule-text.test.mjs \
            tests/question-gate/unit/one-driver.test.mjs \
            tests/question-gate/unit/reverse-g2-g3-untouched.test.mjs

# the five new scripts, directly
node .claude/scripts/grill-me-for-rfc/guard-edit-surface.js /path/RFC-SEED.md ; echo $?   # expect 1
node .claude/scripts/grill-me-for-rfc/guard-edit-surface.js /path/RFC.md      ; echo $?   # expect 0
node .claude/scripts/grill-me-for-rfc/defect-report.js ~/shyme/gaia --gate    ; echo $?   # expect 0 after migration
node .claude/scripts/grill-me-for-rfc/check-divergence-ledger.js ~/shyme/gaia/crates/ports/gaia-ports

# the retro-pass, package by package
node .claude/scripts/grill-me-for-rfc/check-divergence-ledger.js ~/shyme/gaia/crates/foundation/gaia-foundation   # fails until D5 is done

# the install is in sync
make install-to-projects
diff -q .claude/commands/grill-me-for-rfc.md ~/shyme/gaia/.claude/commands/grill-me-for-rfc.md
diff -rq .claude/scripts/grill-me-for-rfc ~/shyme/gaia/.claude/scripts/grill-me-for-rfc
```

---

## 7. What this plan does not fix

- **`scan-defects.js` cannot be complete.** Contradiction detection between two prose documents is not decidable; the seven patterns are the ones that fired in nine runs. The command text must therefore keep the AI's own scan as the obligation and treat the script as an assistant, not as the gate. The two composition patterns added in rev 4 raise the floor; they do not reach the ceiling.
- **Composition checking is not mechanizable.** That a type this package names is the type its neighbour passes is a judgement over two prose designs. The plan makes the judgement mandatory and its evidence auditable; it cannot make it automatic.
- **It does not make the grills re-run.** (a)'s root cause — a stage-one record going stale the moment an upstream RFC is published — is inherent to generating a snapshot. The ledger makes the staleness *visible*; it does not prevent it.
- **It does not touch `sim/`.** The workspace's `Malfeasance.json` carries six records from the `sim/` implementation tickets. They are a different subsystem, and the human has declared `sim/` out of scope.
- **It does not change `/drill-rfc-down`.** That command shares the question-gate block and `settle-run.js`. If the defect discipline belongs there too, it needs its own plan, because its artifacts and its DONE condition differ.

---

## 8. Rev 3's defects, closed in rev 4

Recorded so the same errors are not reintroduced. Each was a place rev 3 could not be implemented as written.

| # | class | rev 3 said | why it could not be implemented | closed by |
|---|---|---|---|---|
| 1 | contradiction | insert T1.1 "immediately before `## The ladder`" and "outside the shared block" | line 67 is inside the block (23–148); no such position exists | T1.1 — anchor moved above the block |
| 2 | contradiction | T1.6 adds G6 inside `## Gates` | that line is inside the block, which rev 3's own §5 forbids touching | T1.6 — G6 moved into the T1.1 section |
| 3 | contradiction | the copies are byte-identical at 492 lines | conver is 510 lines and ahead by PX-238 | Path note |
| 4 | contradiction | nine runs, and "the tenth" on `gaia-store-sqlite` | `gaia-store-sqlite` is listed among the nine | §1.1 |
| 5 | contradiction | the 11 gaia-ports defects are "live" and were "resolved by a re-entry round" | both cannot hold; upstream-resolved and downstream-still-asserted are different states | §1.2(b) |
| 6 | contradiction | "convert each" defect appendix | three of the nine have no defect appendix | Tier 3.1 |
| 7 | contradiction | D5 passes on all nine; T2.3 asserts a coverage table | `gaia-foundation` has no coverage table and no 5-column ledger header | T2.3, D5 |
| 8 | deficiency | the defect record's format is never given | T2.2 parses it, Tier 3 writes it and Tier 4 tests it — three parts against a shape that did not exist | T1.4 format spec |
| 9 | deficiency | Tier 3.2/3.3 "run whatever install step converges them" | not a runnable instruction; the step is `make install-to-projects` | Tier 3.2/3.3 |
| 10 | deficiency | D2 requires `make test` green | the project forbids routine full-surface runs and carries a 14-failure baseline | §6, D2 |
| 11 | deficiency | `command-file.test.mjs` (existing) | two files carry that name | Tier 4 |
| 12 | conflict | STEP 7b placed between STEP 7 and STEP 7a | numbering reads 7, 7b, 7a, 8 | T1.4 anchor |
