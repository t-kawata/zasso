# WORKSPACIFY — the four execution patterns, and the design of `/workspacify-reverse`

> **Written in English** per the Language Protocol's row for design documents: this document exists
> so that a human or an AI who has never seen conver can understand the reverse rotation completely
> and correctly, and English is the language an arbitrary reader resolves most reliably.
>
> **Companion document**: `docs/ABOUT-REVERSE.md` (Japanese) is the design of record for the whole
> reverse rotation. This document does not replace it. It states the *operational* envelope — the
> four ways a project can enter, the state all four must reach, and the design of the one command
> that starts three of them.

---

## 0. How to read this document

Sections 1–4 are **understanding**: what the four patterns are, what state they must all reach, and
what "reaching it" means for the one pattern that is a structural break rather than an addition.

Sections 5–7 are **design**: the modification of `.claude/commands/workspacify-reverse.md`, what is
not yet reachable, and what has not been verified.

Appendix A lists every measurement this document rests on, with the exact command and result, so a
reader can re-derive rather than trust.

**Four errors are recorded in this document deliberately** (§3.5, §5.7, §7). Each was made while
writing this design and each is the kind of error a competent reader would also make. A document
that shows only the finished conclusion teaches a reader nothing about where the cliffs are.

---

## 1. The four execution patterns

### 1.1 The patterns

Every project that enters conver does so in one of four ways. They are distinguished by **what
conver scaffolding already exists on disk**, and by nothing else.

| # | The input project | Entry point | What must happen |
|---|---|---|---|
| **1** | Independently implemented. No conver artefacts at all — no RFC, no graph, no tickets, no headers | `workspacify-reverse` → `workspacify-tree` → `workspacify-allocate` → … | The project is drawn into conver's loop space. The four layers are **created** |
| **2** | Already driven by conver's full four-layer loop. The workspace root holds `RFC-ROOT.md`, `RFC-ROOT-GRAPH.json`, `RFC-ROOT-Dirs-Tree.json`, `Tickets.json`, `DesignTree.json` | `workspacify-reverse` → `workspacify-tree` → `workspacify-allocate` → … | The four layers are **re-instantiated per directory**, at finer granularity. See §3 |
| **3** | Developed with individual conver commands (`/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`) but never through the full four-layer loop. Holds some artefacts, not the set | `workspacify-reverse` → `workspacify-tree` → `workspacify-allocate` → … | Same terminal state as 1 and 2. What exists is kept, what is missing is created |
| **4** | Empty, plus a long specification document | **`workspacify-tree` → `workspacify-allocate` → …** — no reverse rotation | The ordinary forward rotation. Nothing is reconstructed because there is nothing to reconstruct |

Patterns 1, 2 and 3 enter through the reverse rotation. Pattern 4 does not.

### 1.2 The invariant that binds all four

> **None of the four may be blocked or aborted on the grounds that the project is an incomplete
> conver project.** Incompleteness is the *input*, not a refusal condition. What must happen instead
> is that the incompleteness is **worked through and filled**, so that the project arrives at
> ordinary forward rotation as a complete conver project.

This is the load-bearing sentence of the whole design. Every gate, every precondition and every
early exit in the reverse rotation has to be measured against it.

It is also this repository's own established posture, in three places already written:

- `install.js` — *"What to do with a file that already exists is decided by comparing the target, the
  source and the record of the previous installation — never by asking. A file the user changed is
  preserved and named; a file that differs only because conver moved on is updated."*
- `env-manifest.cjs` — *"The act of resolving never destroys anything: an npm root with an existing
  `node_modules` is reported, never rewritten."*
- `ENV-DEPS.json` — *"`providedBy` names the ticket that introduces it, so an entry whose ticket has
  not converged is reported as **not yet required** rather than as missing."*

Note carefully what that third quotation says and does not say. It is a statement about **when**
something is required. It is not a licence for the thing to be absent at the end. During the
transition an artefact may be missing and is named; at the terminal state nothing may be missing.
Confusing the two is the error recorded in §3.5.

### 1.3 The experiment pair is patterns 1 and 2

The two trees in this repository are not abstract fixtures. They are the two patterns:

```
siprs-with-4layers   RFC-ROOT.md / RFC-ROOT-GRAPH.json / RFC-ROOT-Dirs-Tree.json / Tickets.json
                     DesignTree.json / RFC-ROOT-{GRAPHIFY,BOUNDIFY,SPLIT}-Status.json
                     *.delta.json
                     — and NOT: WORKSPACIFY-TREE-MANIFEST.json, WORKSPACIFY-ALLOCATE-MANIFEST.json,
                       ARCHITECTURE-DELTA.json, RFC-SEED.md, any per-directory four-layer set
                     ⇒ pattern 2's input

siprs-for-reverse    none of the above
                     ⇒ pattern 1's input
```

**Both are incomplete conver projects.** Both stop short of the terminal state, and the fifth layer
is exactly what is missing from both. `docs/ANSWER-KEY.md` calls `siprs-with-4layers` "the answer
key"; a more precise reading is that it is the **pattern-2 representative of the same codebase**,
and `siprs-for-reverse` is the **pattern-1 representative**. The analysis is validated by checking
that both inputs converge to the same terminal structure — not by checking that one reproduces the
other byte for byte.

---

## 2. The terminal state

"Ordinary forward rotation" is a state, not an event. This section says exactly what that state is,
because everything in §5 is designed backwards from it.

### 2.1 The fifth layer makes the four layers recursive over the directory tree

This is the single most important structural fact, and the one most easily missed.

The fifth layer (`/workspacify-tree` → `/workspacify-allocate`) is **not** "one more manifest
beside the existing artefacts". It partitions the workspace into packages and then **re-instantiates
the four-layer loop once per package directory**.

Evidence, all from the code:

| Fact | Source |
|---|---|
| `RFC-SEED.md` is written into **every package directory** | `allocate-manifest.mjs:43` — `` path: `${pkg.path}/${SEED_FILE_NAME}` `` |
| There is exactly one seed per package | `workspacify-allocate/lib/reverse-mode.mjs:206` — *"each of the N seed-bearing package(s) holds exactly one `RFC-SEED.md`"* |
| The seed names its package | `seed-render.mjs:70` — `` `${SEED_TITLE_PREFIX}${pkg.name}` `` where `SEED_TITLE_PREFIX = '# RFC Seed: '` |
| `Tickets.json` is generated **in the same directory as its design document** | `.claude/commands/split-to-tickets.md:37-38` — *"e.g. `docs/RFC-001-process-registry.md` → `docs/Tickets.json`"* |
| The graph and the Dirs-Tree sit **beside their RFC** | `.claude/commands/boundify-graph.md` — `basename="$(basename "$1" -GRAPH.json)"`, `dirsTreePath="${graphDir}/${basename}-Dirs-Tree.json"` |
| The workspace root **is itself a package**, path `.` | `workspacify-tree/lib/structure-parity.mjs` — `ROOT_PACKAGE_PATH = '.'` (line 69); the comment and the assignment at lines 126–131 read *"A file at the project root is owned by the package whose path is `.` … Without this a project with a root-level `build.rs` could satisfy neither gate"*; `packageOwnsPath` (line 173) treats `.` as owning everything |

So `RFC-ROOT-GRAPH.json` is not a special name for a project-wide graph. `ROOT` is the **directory
identifier**, and the file is the graph of the directory named ROOT. A subdirectory `src/auth` gets
`RFC-AUTH-GRAPH.json` beside its own `RFC-AUTH.md`.

### 2.2 The concrete terminal layout

```
<workspace root>/
  RFC-ROOT.md                        ┐
  RFC-ROOT-GRAPH.json                │ the ROOT package's own four layers
  RFC-ROOT-Dirs-Tree.json            │
  RFC-ROOT-GRAPHIFY-Status.json      │
  RFC-ROOT-BOUNDIFY-Status.json      │
  RFC-ROOT-SPLIT-Status.json         │
  Tickets.json                       ┘
  WORKSPACIFY-TREE-MANIFEST.json     ┐
  WORKSPACIFY-ALLOCATE-MANIFEST.json │ the fifth layer: the partition, made explicit
  ARCHITECTURE-DELTA.json            ┘
  DesignTree.json
  build.rs  Cargo.toml  wrapper.h    ← owned by the `.` package

  src/auth/                          ┐
    RFC-SEED.md                      │ the fifth layer's seed for this directory
    RFC-AUTH.md                      │
    RFC-AUTH-GRAPH.json              │ this directory's own four layers
    RFC-AUTH-Dirs-Tree.json          │
    RFC-AUTH-GRAPHIFY-Status.json    │
    RFC-AUTH-BOUNDIFY-Status.json    │
    RFC-AUTH-SPLIT-Status.json       │
    Tickets.json                     ┘
  src/db/
    RFC-SEED.md
    RFC-DB.md
    RFC-DB-GRAPH.json
    …
```

**The same shape holds for all four patterns.** A pattern-4 project (never reversed) reaches it by
the ordinary forward path; a pattern-1 project reaches it by reverse then forward; a pattern-2
project reaches it by interruption then forward (§3).

### 2.3 "Complete" — the artefact inventory

A project at the terminal state holds all of the following, for the root package and for every
package the partition declares:

**Fifth layer (the partition):**
`WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json`, `ARCHITECTURE-DELTA.json`,
`RFC-SEED.md` (one per package directory)

**Fourth layer (per package):**
`RFC-<PKG>.md`, `RFC-<PKG>-GRAPH.json`, `RFC-<PKG>-Dirs-Tree.json`, `Tickets.json`,
`RFC-<PKG>-{GRAPHIFY,BOUNDIFY,SPLIT}-Status.json`

**Grounding annotations:**
`Initial Design Artifact` file headers, `[::TICKET::]` annotations, `@verifies` annotations,
`omissions/OMISSIONS-*.json`

### 2.4 "No contradiction" — the consistency web, and what a contradiction is

*"Everything is mutually consistent"* does **not** mean *"nothing differs"*. The design says the
opposite in `ABOUT-REVERSE` §6.14:

> Reverse-rotation gates sometimes PASS on **"the disagreement is recorded"** rather than on
> **"the two agree"** (T5, GF2, S2). **A difference of zero, or a disagreement of zero, can be a
> signal of abnormality rather than of health** (F1).

So the definition is:

> **A contradiction is an *unrecorded* inconsistency. A recorded inconsistency is not a
> contradiction.**

The web, at every level of the directory tree:

| Relation | Gate | What must hold |
|---|---|---|
| Manifest package paths ≡ measured directories, both directions | **T1** | Exact set equality. Differences are named as extra or missing |
| Every hand-written source file is owned by some package | **T2** | Zero unowned. The `.` package owns root-level files |
| Every graph node resolves to a file that exists | **T3** / GF1 | Zero ungrounded |
| Measured DAG order ≡ manifest `implementation_order` | **T4** | Agreement; a cycle fails |
| Every logical/physical mismatch is **recorded** | **T5** | Recorded is PASS. An unrecorded mismatch is FAIL |
| `reverse_provenance` present and its bundle hash resolves | **T6** | Forward mode does not fire this: absence is normal there |
| Planned paths ≡ existing paths | **A1** | Exact set equality. One extra is BLOCKED |
| Writes limited to `RFC-SEED.md` and the manifest; no top-level rename | **A2** | Additions only |
| Every package's packet has a non-empty incoming-dependency excerpt | **A3** | Non-empty, so "why does this function exist?" is answerable |
| §1 carries the reverse index; heading count remains exactly 14 | **A4** | `seed-parse.mjs` enforces exact equality with `SEED_REQUIRED_SECTIONS` |
| Allocation Index ↔ ownership is a bijection | **A5** | 0 missing / 0 duplicated / 0 leaked |
| Every `normative` claim has a `normative_decision` | **G4** | No waiting-for-approval state is ever created |
| `normative_authority` is a stable role ID | **G5** | Not a person's name |
| Contract-candidate ↔ RFC-contract differences are all recorded | **GF2** | Recorded is PASS; a difference of zero is a signal |
| No new file generated; only the header differs | **B1**, **B2** | The header is never rewritten |
| Every existing test maps to a ticket | **S1** | Total mapping, remainder reported |
| Every absent-Red contract is recorded | **S2** | Absence of zero is not PASS |
| Every ticket carries its measured implementation files | **S3** | |
| One reconstruction ticket per absent-Red contract | **S4** | 1:1 |
| Every reconstruction ticket carries `counterexample_plan_id` | **S5** | Without it the uncertainty disappears at implementation time |
| Driving references attached where they resolve | **S6** | Failures recorded, not fatal |
| No `observed` claim touching a dynamic mechanism without dynamic evidence | §6.14.7 | Demoted to `inferred` or `unresolved` |
| No `normative` claim with a broken provenance chain | §6.14.7 | |
| No dependent evidence counted as independent | §6.14.7 | |
| No out-of-scope region written as "does not exist" | §6.14.7 | `out_of_scope` is a first-class state |

These gates are **hierarchical**: T1/T4/A1/A5 apply between the root package and each sub-package as
much as between the manifest and the filesystem. A per-directory `*-Dirs-Tree.json` that does not
nest inside the root's partition is a contradiction even if each file is individually valid.

### 2.5 Structural indistinguishability

At the terminal state, **no command downstream needs to know which pattern the project came in by.**
There is no "reverse mode" special case left to execute, and the four patterns cannot be told apart
by their structure.

This is not a nicety; it is enforced by a specific design decision. `ABOUT-REVERSE` §6.12 records
that three options were weighed and a third was chosen ("Option 2.5-refined"): uncertainty metadata
(`claim_id`, `residual_id`, `scope_ref`, risk class, bundle hash) is injected **only into RFC-SEED
§1 and the RFC**, and the intermediate artefacts keep their forward schemas and their canonical
hashes unchanged. `P22-10` fixes this as an implementation constraint:

> *Additions are limited to optional fields that appear only when `mode === "reverse"`. A
> byte-identical `manifest_hash` over the forward fixtures is mandatory.*

Had provenance been propagated thinly across every artefact (the rejected option 1), a
reverse-derived project would have been structurally distinguishable from a forward-derived one, and
the forward hash invariant would have broken. **That is the mechanism that makes §2.5 true rather
than aspirational.**

---

## 3. Pattern 2 in detail: interruption, not addition

### 3.1 The act is a layer-structure change

Pattern 2's history is the thing to hold on to:

> The project was being driven by the four-layer loop. During implementation it became clear that
> the project is **extremely large** — large enough that continuing to treat it as one unit is
> dangerous. The decision was taken mid-flight: **the directory boundaries must be drawn more
> firmly, and grill must be done per directory, meticulously.**

Executing `workspacify-*` at that moment is therefore **not** "adding a fifth layer on top of a
running cycle". The original four-layer cycle is **interrupted**. The act is a change of the layer
structure itself.

**Continuation is the wrong mental model. Discontinuity is the right one.**

### 3.2 What happens to the interrupted cycle's artefacts

The root-level artefacts — `RFC-ROOT.md`, `RFC-ROOT-GRAPH.json`, `RFC-ROOT-Dirs-Tree.json`,
`Tickets.json`, `DesignTree.json`, the `*-Status.json` files — are **not deleted**. They are left
where they are.

But they are **no longer the live cycle**. Their new role is:

| They are | They are not |
|---|---|
| Material — evidence of intent, of how far the work got | A continuing cycle |
| The **old partition**, whose coarseness is the reason for this whole act | The answer to the new partition |
| The prior against which the new partition's difference is taken | Authoritative for the new structure |

The last row is the one that bites. Reading the old `RFC-ROOT-Dirs-Tree.json` as *the* partition
would freeze the too-coarse boundaries into the new canon — that is failure mode **F3** (boundary
mis-estimation) in its most expensive form, because the whole reason the act was taken was that
those boundaries are wrong.

### 3.3 What happens to work in flight

A cycle that was running has unfinished work: tickets at `planned` or `in_progress`, a phase partway
implemented, a `DesignTree` mid-drill. Re-partitioning redraws the boundaries underneath that work,
so **in-flight items can end up belonging to no package in the new partition**.

This must not be silent. Either the work is re-homed under the new partition, or it is named as
re-homed-nowhere. A project that reaches "ordinary forward rotation" having quietly lost half a
phase is not a complete conver project, whatever its file listing says.

**This obligation is not currently discharged anywhere in the code** — see §7.2.

### 3.4 The seam, and where its record goes

The old structure and the new structure **differ**, and the difference is correct. Following §2.4,
the difference must be **recorded**, not eliminated and not silently preserved.

Two receptacles exist, and they are not interchangeable:

| Receptacle | Owner | What it records |
|---|---|---|
| `ARCHITECTURE-DELTA.json` | the reverse rotation (**T5**) | logical structure vs physical structure mismatches |
| `<X>.json.delta.json` | the **evolution loop** (`/drill-rfc-down`) | how an artefact changed across one drill round |

The `.delta.json` family is written by `drill-rfc-down/boundify-step.js:66`
(`` return `${dirsTreePath}.delta.json` ``) and the file's own comment says *"the delta
(`.delta.json`) is the persistent record and is kept"*. Both trees carry examples:
`RFC-ROOT-Dirs-Tree.json.delta.json`, `RFC-ROOT-GRAPH.json.delta.json`, `Tickets.json.delta.json`.

But an evolution round is an **incremental** change to an already-complete conver project. The
layer-structure change of pattern 2 is a **discontinuity**. Whether the discontinuity can be
expressed as an evolution delta, or needs `ARCHITECTURE-DELTA` plus its own record, is a design
question this document does not settle — it is named in §7.3.

### 3.5 The error this section exists to prevent

Three formulations were tried while writing this design. All three are wrong in the same direction —
they make the structural break sound seamless:

| Wrong formulation | Why it is wrong |
|---|---|
| "The root continues as the ROOT package, and subdirectories gain their own four layers" | Implies **continuation**. The root's cycle stops |
| "The fifth layer is added on top of the four layers" | Implies a **stack**, when the act is a **re-composition** |
| "Pattern 2 lacks the fifth-layer artefacts, so the chain adds them" | Names the missing *files* and misses the missing *re-instantiation* of the whole four-layer set, per directory |

The correct formulation:

> Executing the reverse rotation on a pattern-2 project **interrupts** the four-layer cycle. The
> cycle's artefacts remain on disk as material. The fifth layer then fixes a **new partition** and
> the four layers are **re-instantiated per directory** under it. Ordinary forward rotation resumes
> on the **new** structure, not on the old one.

---

## 4. What "the reverse rotation is incomplete" is not

`analyze --through=r8` over `siprs-for-reverse` produced, today:

| Quantity | Value |
|---|---|
| claims | 4,460 |
| `observed` | 337 |
| `inferred` | 409 |
| `unresolved` | **3,714** |
| regions recorded as not observed | 7,787 |
| gaps, 6 kinds | 9,748 |
| independent evidence components | 47 (from 4,460 evidence records) |
| entrypoints / activation mechanisms | 0 / 792 — **all read statically** |
| `COUNTEREXAMPLE-RESULTS.json` | `empty: true`, `applied: []` |

It is tempting to read 3,714 unresolved claims and 9,748 gaps as *"the analysis is incomplete"*.
That is the wrong reading, and it is the reading that leads to the wrong design.

**These are the raw material the chain downstream consumes.** Each `unresolved` claim carries a
`grill_question`, travels into the RFC-SEED §1 machine block, and is turned by
`/grill-me-for-rfc` into a question that is mandatory rather than optional. From
`grill-me-for-rfc/reverse-questions.js`:

> *for every unresolved claim, whether the observed behaviour is intended or accidental. A question
> framed as "what should this do?" invites the answer "what it currently does"; a question that
> forces the distinction between intent and accident does not.*

The path is:

```
R3.5  unresolved claim, with its grill_question
  → /workspacify-allocate reverse: carried into RFC-SEED §1's machine-injected block
  → /grill-me-for-rfc G1/G2: every unresolved claim becomes an intent-or-accident question
  → normative_decision (a choice event, never a waiting-for-approval state)
  → the RFC's clause
  → /graphify-rfc's node
  → the Dirs-Tree
  → the ticket
  → the implementation
```

**This is what "carefully bringing an incomplete project to a complete state" means.** The
incompleteness is not reported and left; it is *converted*. And `ABOUT-REVERSE` §6.2 forbids any
"waiting for approval" state in that path, because conver's existing discipline rejects `TODO`,
`TBD`, `ask the human` and `waiting for approval` in a payload.

---

## 5. The design of `.claude/commands/workspacify-reverse.md`

### 5.1 What the file may become

Before designing the content, the permissions:

- The file is **not** in `COMMAND_FILE_NAMES` (`command-file-digest.mjs:43`), which freezes **nine**
  command files. `command.test.mjs:159` asserts this explicitly:
  *"the tenth file is deliberately outside the frozen digest: it is a creation, not an edit"*.
  `P22-9` **created** it as a new file, so the append-only discipline that binds the nine does not
  bind it. **A rewrite is permitted.**
- But eight structural assertions **do** bind it (`command.test.mjs:162-183`). A rewrite must keep
  all of them:

| # | Assertion |
|---|---|
| 1 | the file opens with `---` frontmatter |
| 2 | it carries `description:` |
| 3 | it carries `argument-hint:` |
| 4 | it carries `disable-model-invocation: true` |
| 5 | its Language Protocol table is **byte-identical** to the nine's |
| 6 | its First-Class Rule line matches `/First-Class Rule\s*—\s*\[::STUB::\]/` |
| 7 | at least one heading matches `/Step \d/` |
| 8 | it carries `## Scripts used`, `## Arguments`, and the text `run.mjs analyze` |

The frontmatter is kept byte-identical: `/workspacify-reverse <root>` is `P22-9`'s API contract.

### 5.2 The current file's diagnosis

The current file is 159 lines and is **a description of the entrance, not a procedure for the
work**. Its five steps are an *invocation* sequence (probe zg → run analyze → read the report →
serve candidates → report). Concretely:

| # | Defect |
|---|---|
| D1 | It describes rather than instructs. It never says which instrument to run when, or in what order |
| D2 | No preconditions and no gates between the seven subcommands. Each asserts its own safety; nothing places them in a sequence |
| D3 | `--through` appears as a flag definition ("stop after an inclusive prefix") and never as what it is: **the only instrument for seeing a prefix**, because publishing is atomic |
| D4 | The four principles of `ABOUT-REVERSE` §4.6 — the spine of the whole design — do not appear |
| D5 | "Loop rounds" is mentioned once, undefined. Neither the round nor the terminal state (`§2`) is stated |

### 5.3 The structure the file must take

```
  frontmatter                              ← unchanged, byte-identical
  # /workspacify-reverse
  Role                                     ← unchanged
  Language Protocol                        ← unchanged, byte-identical
  First-Class Rule                         ← unchanged, byte-identical
## Arguments                               ← unchanged (assertion 8)
## The four principles                      ← NEW: the spine
## What the machine decides, and what you decide   ← rewritten
## The terminal state this command serves    ← NEW: §2, so the reader knows what "done" is
## The canonical output and its constraints  ← kept
## Scripts used                              ← kept (assertion 8)
## Statuses and gates                        ← kept, exit codes made explicit
## Step 0: identify the input
## Step 1: record what is already there
## Step 2: fix the boundary and the scope
## Step 3: reach the exit
## Step 4: read the material in the order it is needed
## Step 5: decide the partition
## Step 6: record the seam
## Step 7: hand over
## Step 8: report
## What this command cannot yet reach        ← NEW: §6, named absences
## A round, and what success is              ← NEW: L0–L3, RESIDUE 0
  Error recovery                           ← rewritten
  Prohibitions                             ← rewritten
  Definition of success                    ← rewritten
```

Assertion 7 (`/Step \d/`) is satisfied by `## Step 0` … `## Step 8`.

### 5.4 The workflow

#### Movement I — Establish what the input is (Steps 0–2)

| Step | Purpose | Instrument | Machine decides | What must **not** happen |
|---|---|---|---|---|
| **0** | Identify the pattern | Read the disk. Which conver artefacts exist: root `*-GRAPH.json` / `*-Dirs-Tree.json` / `Tickets.json` / `RFC-*.md`; per-directory `RFC-SEED.md`; `WORKSPACIFY-*MANIFEST*` | Presence and absence are facts, read from the filesystem | The pattern must **not** be inferred by asking, and must **not** be a gate |
| **1** | Record what is already there | The artefacts Step 0 found, plus the in-flight state (§3.3): ticket lifecycle statuses, the `DesignTree`, the old partition | The inventory is mechanical | Silent continuation of an existing cycle; silent deletion of anything |
| **2** | Fix the boundary and the scope | `analyze … --through=r0.5` | The scope, the target commit, the tree hash, exclusions, permissions, the external-transmission policy | — |

**There is no gate before Step 3 that can stop the run because the project is incomplete.** That is
the whole point of §1.2. Conver's own self-check (`run.mjs regression check`) measures the *conver
repository*, not the subject, and its fixtures live in `tests/workspacify-tree/baselines/` — they
are not installed into a user's project. **It is therefore a self-check for conver maintainers, not
a precondition here.** Naming it as a precondition is one of the errors this design removes.

#### Movement II — Measure (Step 3)

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze "$ARGUMENTS" \
     --out=<destination-outside-the-target> [--through=<stage>] [--query="<question>"]
```

Three mechanical facts the file must state, because without them the operator misreads every
outcome:

1. **Publishing is atomic.** `publishDocuments` is called **once**, after every stage in the prefix
   has run and the target has been re-digested (`scope.mjs:1222`). A run that stops **publishes
   nothing**. There is no partial-document state to clean up.
2. **`--through` is the only prefix instrument.** Because of (1), a failure late in a long run costs
   the whole run, and the only way to see where it went wrong is to stop earlier and let a complete
   prefix publish. The evaluation order is **not** the stage numbering:
   `r0, r0.5, r2.5, r1, r2, r3, r3.5, r4, r5, r5.5, r6, r6.5, r7, r8` — R2.5 runs before R1 and R2
   because the dependency graph's caveat must state how many mechanisms stand between it and the
   running program.
   **But**: a full run reached R8 in about **three minutes** (Appendix A.1). The ladder is a
   diagnostic, not a ritual. Run to the exit; descend only if the exit is refused.
3. **The target is digested before and after.** A single byte moved and the run refuses to publish
   (`scope.mjs:1128-1134`). The tree must be quiescent, and the analysis never writes to it.

#### Movement III — Serve, decide, hand over (Steps 4–8)

| Step | Purpose | What the reader gets / does |
|---|---|---|
| **4** | Read the material in the order it is needed | See the table below |
| **5** | **Decide the partition** — the one load-bearing decision (§5.6) | The AI decides. Everything downstream is instantiated from this |
| **6** | Record the seam (patterns 2 and 3 only) | The old partition, the in-flight work, the difference — recorded, never eliminated (§3.4) |
| **7** | Hand over | `/workspacify-tree` reverse mode consumes `ORIGIN-LONG-SPEC.md` |
| **8** | Report | *proved* / *not proved*, the stage list, the destination, the zg statement. **Never whether the reverse engineering succeeded** (§3.3 of `ABOUT-REVERSE`) |

The material, in reading order:

| Document | The question it answers |
|---|---|
| `R0-R2-REPORT.md` | boundary, structure, dependencies, execution surface — and the **analysis-attempt ledger**, which exists so that `extracted_count: 0` cannot mean both "analysed and found nothing" and "could not analyse" |
| `CLAIM-LEDGER.json` | the claims with their evidence groups and their independence |
| `R7-SERVING.md` | the claims a human still has to decide |
| `ORIGIN-LONG-SPEC.md` | the spec itself; every claim states what would falsify it |
| `CAPABILITY-PROFILE.json` | what the analysis can and cannot prove, in five dimensions. **It carries no verdict** |
| `ZG-CANDIDATES.md` | present **only** when zg is installed and a question was asked. When zg is absent the file does not exist, so a missing search tool can never read as a search that found nothing |

### 5.5 The four principles, and where each is realised

`ABOUT-REVERSE` §4.6 names four. They are the spine of the file, not decoration.

| Principle | Where it lives in the procedure |
|---|---|
| **1. Maximise the deterministic analysis** | Step 3. Fourteen stages run in one command. The AI does not run them and does not decide when to run them |
| **2. Minimise the area left to AI judgement** | Step 5. The judgement surface is closed to the six items below, and everything else is "accept the machine's verdict; do not re-litigate" |
| **3. Maximise the serving to that area** | Steps 4–5. The material is placed immediately before the decision, with `file:line` and `evidence_mode` embedded in prose, with the options, their consequences, the counterexamples and the default |
| **4. Absolute inviolability of the existing tree** | The analysis never writes to the subject (digest before/after); `--out` inside the target is refused; and the only writes the whole reverse rotation ever makes are `RFC-SEED.md` and the manifests (A2) |

**The AI's judgement surface, closed to exactly these six** (`ABOUT-REVERSE` §6.2):

1. the final determination of the package boundary,
2. owner assignment,
3. layer estimation,
4. the determination of what a contract *means*,
5. the over-splitting decision,
6. the classification of each proposition as `observed` / `inferred` / `normative` / `unresolved`.

Nothing else. In particular the machine's verdicts on T1–T6, A1–A6, G4–G5, GF1–GF2, B1–B3, S1–S6
and §6.14.7 are **accepted, not re-opened**.

### 5.6 The one load-bearing decision

Because the terminal state is a per-directory re-instantiation of the four layers (§2.1), **every
downstream artefact is instantiated from the partition**. A wrong partition does not produce one
wrong file; it produces a whole wrong structure, in every directory, at every level.

Hence:

- R2's measurements — cohesion, dependency density, SCC condensation, co-change history, and
  **boundary-crossing call counts** — are not decoration. They are the ground the terminal
  structure stands on.
- `REVIEW-2` warned of exactly this: *"if the boundary decision at R2 is wrong and R3–R8 run on top
  of it, everything is garbage — a hallucinated specification."*
- For pattern 2, the old `RFC-ROOT-Dirs-Tree.json` is **a prior, not the answer** (§3.2). The act
  was taken *because* those boundaries are too coarse.

### 5.7 What the file must never contain

Each of these is a formulation that was tried and rejected:

| Never write | Because |
|---|---|
| A gate that stops the run because the subject is not a conver project | §1.2. This is the failure the whole design exists to prevent |
| `holdout isolation` as a precondition | **Measured**: it exits **1** on `siprs-with-4layers`, naming `RFC-ROOT.md`, `RFC-ROOT-GRAPH.json`, `Tickets.json` as "contamination". For pattern 2 those are the project's **legitimate prior work**. The check exists to *manufacture the experiment input*, not to qualify a real project |
| `scrub` / `detect` / `verify` as workflow steps | `scrub` **removes** forward traces. On a pattern-2 project those traces are its 143 `Initial Design Artifact` headers and its `@verifies` annotations. Removing them is supreme law 4 territory and destroys exactly what must be carried forward |
| `oracle compare` as a workflow step | An answer key exists only in the paired-tree experiment. No real project has one |
| `run.mjs regression check` as a precondition | It takes **no root** (`ROOT_TAKING_SUBCOMMANDS = ['detect','scrub','verify','analyze']`). It measures the conver repository, and its fixtures are not installed into a user's project |
| Any statement that the project must already be a complete conver project | §1.2 |

> **The general rule behind the table.** *The same file is an input in one mode and a contaminant in
> the other.* `RFC-ROOT.md` is the answer the executor must not read during the **experiment**, and
> it is a design document the analysis **should** read during an **operational** run on a pattern-2
> project. Conflating the two modes is the root error of the current design, and §5.8 is how the
> file prevents it.

### 5.8 Two modes, never conflated

The file must name both modes and say which one it is in.

| | **Operational** (patterns 1, 2, 3) | **Experiment** (validating the instrument) |
|---|---|---|
| Subject | any project the operator names | `siprs-for-reverse` against `siprs-with-4layers` |
| `holdout isolation` | **never used** | central: proves the executor cannot read its own answer |
| `detect` / `scrub` / `verify` | **never used** | used to manufacture the stripped input from the complete one |
| `oracle compare` | **never used** — there is no answer key | central; ten stage rows in `docs/ANSWER-KEY.md` §5 |
| `RFC-*.md`, `*-GRAPH.json`, `Tickets.json` in the tree | **input** | **contaminant** |
| Terminal state | the complete per-directory four-layer structure (§2.2) | a disagreement list, never a score |

The experiment mode is documented in `docs/HOLDOUT-PROTOCOL.md`, `docs/ANSWER-KEY.md` and
`docs/SPIKE-REPORT.md`. It belongs to the instrument's own validation and must not gate an
operational run.

### 5.9 The round, and what success is

`ABOUT-REVERSE` §3.3 and §7.7.3:

- Success is **RESIDUE 0 in `/crystalize-readme`**, reached only after several rounds and judged by
  a human. `omission 0` from `/find-omissions` is **not** the success condition; it is material for
  the human's decision.
- One round is **this command plus the whole downstream chain** (§3.2 of `ABOUT-REVERSE`), not this
  command alone. What changes between rounds is the human's answers to the `unresolved` claims,
  which return through the existing residual → grill → RFC path. **No separate "R7.5 human
  norm-setting" stage exists and none may be created.**
- The ladder: **L0** the analysis runs but the RFC is pure ratification · **L1** some directories
  reach RESIDUE 0 · **L2** all do, but Red reconstruction is incomplete · **L2.5** coverage fully
  proven and every unprovable oracle-collusion suspicion marked `unverified_oracle_risk` · **L3**
  RESIDUE 0, Red evidence on every ticket, and a human judges it a success.
  **Only L3 may be called success.**
- The machine's vocabulary is **`proved`** and **`not proved`**, and nothing else.

---

## 6. What this command cannot yet reach

A command file is a prompt. Instructing an operator to run an entrance that does not exist produces
either a fabricated success or an abort — both worse than silence. So each of these is **named in
the file** rather than omitted, which is the same discipline the instruments apply to unobserved
regions (F12; `unobserved` is a first-class state and is never rendered as "no disagreement").

**Reachability measured**: of the 39 modules under `workspacify-reverse/lib/`, **nine are not
reachable from `run.mjs`**:

```
sandbox.mjs  record-replay.mjs  dynamic-surface.mjs  sandbox-error.mjs
worktree-isolation.mjs  reflexion.mjs  two-pass.mjs  staleness.mjs  security-lane.mjs
```

| # | Absent entrance | Design home | What is lost |
|---|---|---|---|
| **N1** | `sandbox.mjs` / `record-replay.mjs` / `dynamic-surface.mjs` | R2.5's dynamic half (`measure-dynamic-coupling.mjs`, 80%, `ABOUT-REVERSE` §6.2) | **Measured**: the capability profile reports 792 activation mechanisms, all read statically, and says of the rest — *"Mechanisms that leave no static trace … are invisible to a static reading and are not counted above."* Rule R-1 therefore fires wherever a mechanism is listed and `observed` is never reached there |
| **N2** | `worktree-isolation.mjs` | R6.5's execution (`ABOUT-REVERSE` §9 design problem 3, recorded as **unfinished**) | `scope.mjs` calls `applyCounterexamples([], ledger)` with a **literal empty array**. **Measured**: `COUNTEREXAMPLE-RESULTS.json` is `{empty: true, applied: []}`. The falsification stage falsifies nothing |
| **N3** | `security-lane.mjs` | R7/R8 (`P22-22`) | `classifySecurityLane(ledger)` has **no caller outside its unit test**. Failure mode **F15** — ratification of safety and authority boundaries |
| **N4** | `reflexion.mjs` | R7/R8 (`P22-20`) | `renderAdjudicationCards` has **no caller outside its unit test**. Failure mode **F14** — conflating the logical and the physical boundary |
| **N5** | *(a defect, not an absence)* | R7 | **The exit serves a different shape from the one the spike calibrated.** `renderDecisionCards` (layered, threshold 12) is called only by `runSpike`. `analyze`'s R7 uses `renderServing`, which is **flat and capped at 100**. **Measured**: 3,714 unresolved claims, **100 printed, 3,614 withheld**. The design's own anti-decision-fatigue mechanism (F7) does not operate at the exit |
| **N6** | *(not implemented)* | R0 | `ABOUT-REVERSE` §3.6 requires the eligibility assessment to be mechanised and presented at R0; `REVIEW-2` Q1 specifies it. Nothing computes it. `capability-profile.mjs` answers five different questions at R8 |

---

## 7. What has not been verified

### 7.1 Verified, with the measurement

| Claim | How it was checked |
|---|---|
| The exit is reachable | `analyze --through=r8` on `siprs-for-reverse` → exit 0, ~3 min, 21 documents published (A.1) |
| The analysis does not write to its subject | The run's own digest comparison; plus `git status` clean afterwards |
| The workspace root is a package, path `.` | `structure-parity.mjs` lines 69, 126–131, 173 |
| `RFC-SEED.md` is per-package | `allocate-manifest.mjs:43`, `reverse-mode.mjs:206` |
| `Tickets.json` is per-design-document | `.claude/commands/split-to-tickets.md:37-38` |
| Graph / Dirs-Tree sit beside their RFC | `.claude/commands/boundify-graph.md` |
| The isolation check rejects a pattern-2 tree | `holdout isolation siprs-with-4layers` → exit 1, 9 artefacts named |
| The `.delta.json` family is the evolution loop's | `drill-rfc-down/boundify-step.js:66` |

### 7.2 Verified as *absent*

| Obligation | Finding |
|---|---|
| Handling the interrupted cycle's **in-flight work** (§3.3) | `reverse-split.js:590` reads the existing `Tickets.json` for its **declared key set only** (`readDeclaredTicketKeys`). No ticket lifecycle status is consulted. Line 525 writes a **new** ledger into `--out`. S1–S6 address *tests without tickets*; they do not address *tickets with work in flight*. **The two are different populations, and only the first has a gate** |

### 7.3 Not verified

| Question | Why it matters |
|---|---|
| Whether the pattern-2 structural discontinuity can be expressed through the existing `.delta.json` mechanism, or needs a record of its own | §3.4. An evolution delta is incremental; this is a break |
| Whether `seed-parse.mjs`'s exact heading-count check (14) rejects an `RFC-SEED.md` produced by an **older** conver | §2.4 / A4. A pattern-2 or pattern-3 project may carry a seed written under different rules |
| Whether the four patterns genuinely converge to an identical terminal structure | **Nobody has ever observed a project reach the terminal state through the reverse rotation.** Every statement in §2 is a design claim, not a measurement. This is the thing the design is *for*, and it is unmeasured |

### 7.4 The errors this document records

Recorded so a reader recognises the cliffs:

1. **Designing the experiment protocol and making it a precondition.** Steps 0/2/6 of the first
   design (`holdout isolation`, `scrub`, `oracle compare`) abort exactly the projects the feature
   exists for. §5.7
2. **Applying the environment layer's posture to project artefacts.** `ENV-DEPS.json`'s *"not yet
   required rather than missing"* is a statement about **when**, not about **whether at the end**.
   §1.2
3. **Describing the terminal state as flat.** The four layers are re-instantiated **per directory**,
   not held once. §2.1
4. **Describing the pattern-2 act as addition rather than interruption.** §3.5

And one sub-error worth its own line, because it was made *inside* this document's own
verification: `measureExistingDirectories` (the A1 measurement, allocate) **excludes** the workspace
root, while `measureDirectoryTree` (the T1/T2 measurement, tree) **includes** it as `.`. Two
measurements answering two different questions. Reading the first as evidence about the second
produced a wrong conclusion about root ownership, which §7.1 now records correctly.

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **forward rotation** | design → implementation. The original conver direction |
| **reverse rotation** | existing implementation → reconstructed specification |
| **the four layers** | upstream (RFC → graph → Dirs-Tree → tickets) → implementation → release → evolution |
| **the fifth layer** | `workspacify-*`. It fixes a partition and **re-instantiates the four layers per package directory** |
| **pattern** | one of the four ways a project enters conver (§1.1) |
| **terminal state** | "ordinary forward rotation": every package holds its complete four-layer set, the fifth layer's partition is explicit, and every inconsistency is recorded (§2) |
| **partition** | the set of package directories. The one decision everything downstream is instantiated from (§5.6) |
| **contradiction** | an **unrecorded** inconsistency. A recorded inconsistency is not one (§2.4) |
| **interruption** | what executing the reverse rotation does to a running four-layer cycle (pattern 2). A layer-structure change, not an addition (§3) |
| **`unresolved`** | a proposition the analysis could not settle. Raw material for the grill, not a defect (§4) |
| **proved / not proved** | the machine's entire vocabulary. "Succeeded" and "failed" are a human's |
| **RESIDUE 0** | the success condition, judged by a human after several rounds |
| **L0–L3** | the partial-success ladder. Only L3 is success (§5.9) |

---

## Appendix A — measurements taken

All measurements were taken on **2026-09-11** in `/Users/kawata/shyme/zasso/tools/conver`.

### A.1 The exit is reachable

```bash
node .claude/scripts/workspacify-reverse/run.mjs analyze siprs-for-reverse \
     --out=/tmp/wsp-r8-probe --through=r8
# → exit 0, ~3 minutes
# → 21 documents published, including:
#     ORIGIN-LONG-SPEC.json          5,266,764 B
#     ORIGIN-LONG-SPEC.md            3,182,772 B
#     ORIGIN-SPEC-CANDIDATE.json       563,840 B
#     R7-SERVING.md                     60,194 B
#     CAPABILITY-PROFILE.json            4,364 B
#     RED-RECONSTRUCTION-PLAN.json   4,449,661 B
#     GENERATED-PROPERTIES.json      1,222,727 B
#     COUNTEREXAMPLE-RESULTS.json          499 B
# → "Stages r0 … r8 published"
# → zg: not installed; ZG-CANDIDATES.md correctly absent
# → git status after the run: clean
```

This is the measurement that reframes the problem. **The instrument is not broken. What was
missing was a procedure that told anyone to run it to the exit, and what to do with what comes
out.** `tests/workspacify-reverse/analysis/` holds the sidecars of an earlier `--through=r5.5` run.

### A.2 The isolation check rejects a pattern-2 tree

```bash
node .claude/scripts/workspacify-reverse/run.mjs holdout isolation siprs-with-4layers
# → exit 1  "Contaminated. 9 ground-truth artefact(s) are reachable"
#   RFC-ROOT.md, RFC-ROOT-GRAPH.json, Tickets.json, README.md, …

node .claude/scripts/workspacify-reverse/run.mjs holdout isolation siprs-for-reverse
# → exit 0  "Clean. No ground-truth artefact is reachable among the 2791 file(s) inspected."
```

### A.3 The fifth-layer artefact sets

```bash
find siprs-with-4layers -maxdepth 2 \( -name 'WORKSPACIFY-*' -o -name 'RFC-SEED.md' \
     -o -name 'ARCHITECTURE-DELTA.json' \) # → empty
find siprs-with-4layers -maxdepth 2 \( -name '*-GRAPH.json' -o -name '*-Dirs-Tree.json' \
     -o -name 'Tickets.json' -o -name 'DesignTree.json' -o -name '*.delta.json' \)
# → RFC-ROOT-GRAPH.json, RFC-ROOT-Dirs-Tree.json, Tickets.json, DesignTree.json,
#   RFC-ROOT-{GRAPHIFY,BOUNDIFY,SPLIT}-Status.json, *.delta.json, tickets/, drills/

find siprs-for-reverse -maxdepth 2 \( … \) # → empty
```

### A.4 The exit's contents

```bash
node -e "…" # over /tmp/wsp-r8-probe
# ORIGIN-LONG-SPEC.md: 4,460 claims — observed 337 / inferred 409 / unresolved 3,714
# R7-SERVING.md:       "100 unresolved claim(s) are set out below …
#                       3614 further unresolved claim(s) were not printed here"
# CAPABILITY-PROFILE:  5 dimensions, no verdict field of any kind
#                      observability: 0 entrypoints, 792 activation mechanisms, read statically
#                      unprovable:    7,787 regions recorded as not observed
# COUNTEREXAMPLE-RESULTS.json: { empty: true, applied: [], revisions: [] }
```

### A.5 Reachability from `run.mjs`

```bash
# transitive import closure from run.mjs over lib/*.mjs
# reachable 30 · unreachable 9:
#   dynamic-surface, record-replay, reflexion, sandbox-error, sandbox,
#   security-lane, staleness, two-pass, worktree-isolation
```
