# FIX-PLAN006 — the obligation set must be a projection of every relation that assigns work, and the run must prove the union covers the project, so a package that owes nothing is a named state and never a silence

A workspace's sequences and operations are supposed to be an **allocation of implementation duty**:
which directory must implement what, such that when every directory has discharged its duty, every
sequence and every operation of the project is implemented, and the project's operative procedures are
therefore provably complete.

They are not. The projection assigns units by **ownership** — the stage-1 tree manifest's
`inventory.objects` says which package owns which object, and an operation is owned by whoever owns the
object its result names — and by nothing else. Ownership is a real relation and it is not the relation
the guarantee needs. A package can owe work that produces no object: it can be the dispatcher, the port,
the transport, the backend, or the surface every operation is reached through. For all of those the
projection is silent, and the silence is indistinguishable from a satisfied obligation.

This revision states the guarantee as a proof obligation, adds the two relations that discharge it, and
replaces the per-package silence check with a **workspace-level coverage proof**. It refuses to redefine
the relations that already exist, because units already carry their ids into materialised design records
and a renamed or withdrawn id reads downstream as an undisclosed unit.

Measured on `~/shyme/gaia` (2026-10-14), the first workspace large enough to expose it:
**13 of 26 projected packages receive an empty obligation set, and all 13 have declared DONE.**

---

## 0. The guarantee, and the two absolute conditions on the change

### 0.1 The guarantee

> **G.** If every package discharges every unit in its obligation set, then every sequence and every
> operation the specification names is implemented, and the project's operative procedures are complete.

`G` is an implication whose antecedent is a property of the *whole workspace*, so it is not establishable
by looking at one package at a time. What must be proved is that the assignment is **total**:

> **U — the demand.** The four axes of §3.2: `OPS` (every operation), `SEQS` (every sequence that is a
> sequence), `BND` (every contract), `SURF` (every candidate column).
>
> **T (totality).** `∀d ∈ U : ∃p : d ∈ obligationUnits(p)` — every demand is assigned to a **named
> package**, by a relation or by an adjudication that names one. There is no third outcome: a demand
> that is neither assigned nor exempted is a demand nobody owes, and a run that counted it as covered
> would establish nothing, because `G`'s antecedent could not be discharged for it.
>
> **T ⟹ G.** `OPS` is covered because every operation is owned (it produces an object some package owns)
> or served (it is reached through a declared surface whose holder owes the whole path to it); `SEQS`
> because a sequence is its steps' operations' owners; `BND` because an operation's implementation is
> only real where the boundaries it crosses are honoured — exactly why the 13 structural packages must be
> in the demand set at all; `SURF` because it is the route by which the 47 operations that produce no
> object are assigned.

`T` is decidable from the artifacts the tool already reads. **A plan that does not establish `T` cannot
establish `G`, whatever relations it adds.**

### 0.2 The two absolute conditions

> **C1 — no capability is destroyed.** `educe-sequences.md` and `grill-me-for-rfc.md` keep every command,
> script, flag, branch, exit code and output they have today, with the same meaning. Everything reachable
> before is reachable after. Nothing is removed, renamed or weakened; the change is additive in exactly
> the sense that new sections, new fields and new gates appear and no existing output is withdrawn or
> altered in meaning.
>
> **C2 — re-running over an old target certainly reinforces it.** Both commands evolve a target by being
> run over it repeatedly. A project or directory that does **not** contain the obligation concepts — no
> `owns`/`serves`/boundary projection, no declaration, no contract registry, an older projection on disk
> — must, on re-run, **certainly gain** the obligation part: the view carries the obligation section, the
> gates carry the coverage proof, and the run names what is not yet assigned. "It ran and nothing
> changed" is forbidden; so is "it refused".

C1 and C2 pull in opposite directions on exactly one point: a workspace that is uncovered must now
**fail** a gate (`G`'s requirement), while every capability it had must remain (C1's preservation). Both
hold because the failure is a **named verdict on a new gate**, not the removal or alteration of an old
one: the same run, the same commands, the same outputs, plus one added section and one added gate that
says which demand is unassigned and what repairs it. §3.12 makes both testable; §4's T13–T15 are their
tests.

### 0.3 Why the previous draft established neither `T` nor C2 — measured

| what the previous draft relied on | what is on disk (2026-10-14) |
|---|---|
| `allocate.allocation` carries a declared obligation field | three integers only: `package_count`, `seed_count`, `parsed_package_count` |
| a package's seed may declare an obligation block | 29 of 29 seeds carry the same 13 fence keys, none an obligation: `package`, `source_spec`, `stage1_manifest`, `stage2_manifest`, `implementation_order`, `contract_refs`, `contract_edges`, `no_external_contracts`, `no_external_contracts_reason`, `schema_version`, `seed_package`, `seed_path`, `source_segments` |
| `participates` reaches packages ownership does not | it **is** the existing `xdir-` relation: 38 multi-owner sequences, the same 10 packages, **0** differing sets, **0** net new units |
| the 13 empty packages gain units under `serves` and/or `participates` | `serves`: 0, nothing declares. `participates`: 0, a package that owns no object executes no step |
| "an absent section is seeded as before" (C2's failure path) | the silent path C2 forbids: an old projection would be re-run and change nothing |

As drafted, the plan would have moved 13 packages from a silent empty set to a named `undeclared` set
and given them **zero** obligations. It would have made the hole legible. It would not have closed it,
and it would not have reinforced an old target.

### 0.4 What this revision changes

1. It states `T` and makes it the run's proof obligation (§3.6), replacing a per-package silence check
   that cannot prove a union property (§2.5).
2. It sources the structural duty from a relation that **already exists in conver and is already
   computed**: `allocateManifest.contract_registry`, whose every entry names a `provider_package` and a
   `consumer_package`, and which `explain-seed/lib/projection.mjs:148-158` already projects per package
   as `provides`/`consumes` (§1.5). Measured: 84 of 84 entries carry both, and their union reaches
   **29 packages — every package in the workspace**, including all 13 empty ones.
3. It derives the surface duty from the artifact's own per-operation columns, with a **decidable,
   deliberately over-approximating** candidate rule measured against the live data (§3.2, §3.4).
   Measured on gaia: six candidate columns. Measured on the only other artifacts on disk, the educe
   fixtures: **none** — so a legacy target's surface axis is empty and untouched by the new demand.
4. It drops `participates` (§0.3, row 3).
5. It replaces "undeclared is a valid answer" with **adjudication having exactly two outcomes** —
   assign to a named package, or exempt with a ground — and makes an unowned demand report the guarantee
   as **not established** rather than counting it as covered (§3.5).
6. It widens the unit-id vocabulary, deliberately and in one place, because an obligation that cannot
   reach the ship layer is not an obligation (§3.10).
7. It adds the compatibility and re-entry contract of C2 (§3.12): a three-valued obligation source, the
   regeneration invariant, idempotence, and the legacy triad.
8. It names the relation vocabulary once (§3.12.4), including the relation the requirement calls
   `projects`.

---

## 1. The defect, as measured

### 1.1 The projection is keyed by ownership ✅ verified

`sequences-slice/lib/view.mjs` `buildPackageView` builds three unit lists and no others:

```js
const shared = ownerPackageIds.length > 1;
if (shared) crossBoundarySequenceUnits.push(unit);
else ownedSequenceUnits.push(unit);
```

`ownershipByCanonicalName` comes from `resolveOwningPackages(treeManifest.inventory.objects)`, and
`classifySequenceOwnership` (`lib/units.mjs:80-88`) unions the owners of the operations a sequence's steps
name. **A package appears in a unit's owner set only if it owns an inventory object that an operation's
result names.** Nothing else can put a package into a unit.

### 1.2 Thirteen of twenty-six packages receive nothing, and every one of them has declared DONE ✅ verified

Measured over `crates/**/SEQUENCES.json` in `~/shyme/gaia`:

```
packages with a view:                    26
of which all three unit lists empty:     13
empty-view AND Status.json state DONE:   13
packages with a seed but no view:         3   (interfaces/gaia-websocket, interfaces/gaia-cli,
                                               conformance/gaia-conformance)
```

The empty thirteen, with what each owes: `core/gaia-core` pkg-0016 (the mutation entry point and the
registry assembly), `ports/gaia-ports` pkg-0015 (the capability traits every external effect is reached
through), `network/gaia-network` pkg-0020 (the transport and the authenticated-connection header),
`foundation/gaia-foundation` pkg-0001 (canonical encoding, hash, exact arithmetic, signatures),
`protocol/gaia-invariants` pkg-0024, `interfaces/gaia-rest` pkg-0017, the adapters pkg-0029/0021/0022, and
the four persistence backends `gaia-store-{memory,mysql,postgres,sqlite}` pkg-0025–0028.

This is not a presentation-package problem. It is **every package whose duty is structural rather than
object-producing** — exactly the half of the workspace `G` is about. The measurement of *why* ownership
cannot reach them has two cases:

| case | how many of the 13 | measured |
|---|---|---|
| owns no inventory object at all | 11 | `inventory.objects` holds 1294 entries; `pkg-0001`, `pkg-0015`, `pkg-0016`, `pkg-0017` and the four `gaia-store-*` own **zero** |
| owns objects no operation's result names | 2 | `pkg-0020` owns **95**, `pkg-0024` owns **3**; **0** of those 98 canonical names appears in any operation's `result_object_classes` |

The second case matters twice over: it is why the operation→object join reaches exactly **13** packages —
the same 13 with populated views — while two packages hold 98 objects the join never sees; and
`ownership.mjs:149-155` records that case as explicitly **not a defect** ("a package that owns objects
and that no operation reaches is not a defect"), so no gate reports it today. Under `G` those 98 objects
are duties like any other: §3.2 covers them through the boundary relation, §3.5 requires the rest to be
adjudicated.

### 1.3 The artifact's own text admits the hole ✅ verified

Two strings the generator produces state the failure without being asked to. Both are on disk verbatim:

- `unmatchedClassNames` renders as: *"These are recorded residuals: **no manifest owns them, so no
  package can be told to implement them.**"*
- `lineRange.statement` renders (in `crates/core/gaia-core/SEQUENCES.md`) as: *"10 packages claim no
  segment at all, **so it cannot reach them whatever the ranges are.**"*

The generator is not wrong about its own output: it reports that its assignment rule cannot reach a set
of packages, and nothing downstream acts on the report.

### 1.4 Why it has not mattered until now

FIX-PLAN005 §1.3 records it as a fact that cost nothing:

> For every package the rail has been run over so far the projection was empty — `gaia-foundation` and
> `gaia-network` both own no unit — so the false answer coincided with the true one and cost nothing.

That reasoning was sound where the projection is empty for *everyone*: an empty projection is then
indistinguishable from one not yet populated, and no run is harmed. It stops being sound the moment a
workspace has 26 projected packages and 13 of them are empty while the other 13 are not. `gaia` is that
workspace.

### 1.5 The relation that assigns the structural duty already exists, and nothing reads it ✅ verified

`WORKSPACIFY-ALLOCATE-MANIFEST.json` carries `contract_registry`: one entry per boundary between two
packages, of this shape:

```json
{ "contract_id": "contract-boundary-001", "boundary_id": "boundary-001",
  "consumer_package": "pkg-0002", "provider_package": "pkg-0001", "connection_kind": "value_only",
  "owners": { "semantic": "not_applicable", "port": "not_applicable", "adapter": "not_applicable", … },
  "clauses": { "canonicalization": "…", "errors": "…", "input": "…", "invariants": "…", "output": "…",
               "postconditions": "…", "preconditions": "…", "tests": "…" },
  "source_refs": [ … ] }
```

Measured over the 84 entries: **0** with no `provider_package`, **0** with no `consumer_package`, **84**
carrying at least one clause, 22 distinct providers, 27 distinct consumers, **union 29** — every seeded
package. Clause keys across the registry: the eight above plus `signature`, `ordering`, `atomicity`,
`finality`, `idempotency`, `state_ownership`, `proof_verification`.

Two facts follow, both load-bearing. **The contract axis is already totally assigned** — no package
declares anything for a boundary duty to exist. And **it reaches every one of the 13 empty packages**:
duty counts measured, pkg-0001 19, pkg-0015 9, pkg-0016 20, pkg-0020 1, pkg-0024 2, the four stores 3
each, pkg-0017 1, pkg-0021 2, pkg-0022 2, pkg-0029 3.

`conver` already knows how to project this, per package, and already does — in a different command:
`.claude/scripts/explain-seed/lib/projection.mjs:148-158` filters `contract_registry` by package and
emits `direction: 'provides' | 'consumes'` with a `counterpart`. **The defect is not that the relation is
unmodelled. It is that the sequences projection does not read the model that exists.**

### 1.6 The surface axis is total over the operations, including the ones ownership cannot reach ✅ verified

Measured over the artifact's 257 operations and 27 columns: `rest`, `websocket` and `cli` are carried by
**257 of 257** operations, and **all 47** operations with no `result_object_classes` carry all three. The
47 are exactly the operations ownership cannot reach, so a `serves` relation correctly sourced and
completed by §3.2's candidate rule assigns them — the second half of `T`.

---

## 2. Root cause

### 2.1 One expression serves two meanings ✅ verified

`view.mjs` computes "sequences that cross this package boundary" as `ownerPackageIds.length > 1`. Read as
*shared ownership* that is correct. Read as *this sequence passes through this package*, which is what
the section heading says, it is a proxy that coincides with the truth only when the package owns a share.
The fix is not a rename: boundary and ownership are two relations, and conflating them is what made the
second unavailable.

### 2.2 Ownership is a stage-1 allocation and cannot express a structural obligation

`inventory.objects` is a harvest: stage 1 recorded the objects it found, each with an owner. It records
**things**, not **duties**. A duty to assemble a registry from contributions, to provide a trait, to
implement a backend, to expose every operation over a surface — none of these is a thing, so none was
harvested. That is not a defect in the harvest. It is a defect to make it the **only** source of
obligation — and, as §1.5 shows, it is not the only source available.

### 2.3 CORRECTED — the artifact does carry the interface columns; what is missing is a reader

The previous draft asserted, as a measurement, that a per-operation row *"carries a `rest` column and
**no `websocket` and no `cli` column**"*, and built its asymmetry table and its educe amendment on it.
That is wrong. Measured on the same artifact on the same day, the row's 27 keys include `rest`,
`websocket` and `cli`, on all 257 operations. The correction matters twice: the asymmetry premise is
false for this workspace, and the general case it named — an interface whose column the artifact does not
carry — remains a case the reader must **render** (§3.4), not one it may assume.

### 2.4 The grill cannot distinguish an empty obligation set from a satisfied one ✅ verified

`grill-me-for-rfc` STEP 1 seeds `op-`/`seq-`/`xdir-` nodes from the view, unconditionally. When the view
is empty it seeds nothing: correct for a package with no units, incorrect for one whose units were
dropped. No gate distinguishes the two: `sequences-ledger.js:116` prints `not proved: no unit is
distributed to this package, so there is nothing to discharge`, and `not proved` is a verdict, not a
failure. All of G0–G6 pass, and the run declares DONE.

### 2.5 NEW — a per-package check cannot prove a workspace property

Even if every package's view were non-empty, `T` would not follow: coverage is a property of the
**union**, and a unit can be assigned to no package while each package's own set is non-empty. The
previous draft's gate ("declares an obligation and has an empty unit list") is therefore not a weaker
`T`; it checks a different property. It is kept in §3.6 as a **named repair signal** — "the declaration
did not bind" and "no package serves this column" call for different repairs, and this codebase
separates those on principle (`unit-provenance.mjs:4-8`) — but it is not the proof.

---

## 3. The change

### 3.1 Decisions taken, and refused

**Taken.** Obligation becomes a first-class concept beside ownership. A package's obligation set is the
union of the units it holds under **three** relations — `owns`, `serves`, `carries` — computed in one
place, rendered as a new additive section, and **proved total** by a workspace-level coverage check.

**Taken.** The unit-id vocabulary is widened to five prefixes. The previous draft refused this in the
name of additivity; that refusal is what made `G` unreachable, because an obligation that cannot be
carried to the ship layer is not an obligation. §3.10 enumerates every site.

**Refused.** Redefining `ownedOperationUnits`, `ownedSequenceUnits` or `crossBoundarySequenceUnits`.
PX-257 gates on unit ids being *present* in the package, not on a count (`distribution-ledger.mjs:162-166`;
`verify-consistencies.js:219-233`), so an id that changes meaning or disappears while a materialised
record cites it reads downstream as an undisclosed unit. The three lists keep their exact present
semantics and contents. This is also C1's first clause.

**Refused.** Deriving any relation from a project's naming. The tool reads columns, ids and package
fields; it interprets none of them.

**Refused.** `participates`. Measured redundant against `xdir-` (§0.3). Nothing here reintroduces it.

### 3.2 The demand axes — what must be assigned, measured from the artifacts

| axis | demand | source | measured on gaia |
|---|---|---|---|
| **operations** | every operation | `artifact.operations` | 257 |
| **sequences** | every sequence whose outcome is not `notASequence` | `artifact.sequences` | 119 (114 assigned; 5 with no owner) |
| **boundaries** | every contract | `allocateManifest.contract_registry` | 84, already totally assigned (§1.5) |
| **surfaces** | every **candidate column** (§3.4) | `artifact.operations` × `artifact.pins.enumerations` | 6: `rest`, `websocket`, `cli`, `initial_status`, and the 2 over-approximated (`id`, `kind`) |

The fourth axis cannot be inferred, so its rule is fixed by measurement and is deliberately an
**over-approximation**: a **candidate column** is an operation column with at least one non-empty value
that instantiates a member of some pinned vocabulary. The two errors are not symmetric — a false
positive costs one exemption row (§3.5), a false negative is the silent hole this plan exists to remove.
Measured on gaia, tightening the rule to "every value instantiates" would drop `id` and `kind` (each
coinciding with a `WebSocketMethod` member in **1 of 257** values), and a near-miss column — one stray
value, one differently-joined object — would escape entirely. Loosening it costs exactly two extra
adjudications:

| column | vocabulary | instantiation | uncovered spellings |
|---|---|---|---|
| `rest` | `RestEndpoint` (8) | 257/257 | 0 |
| `websocket` | `WebSocketMethod` (10) | 257/257 | 1 → `operation.unsubscribe` |
| `cli` | `CliCommand` (6 members → 8 spellings) | 257/257 | 0 |
| `initial_status` | `OperationStatus` (15) | 257/257 | 13 → the statuses no operation starts in |
| `id`, `kind` | `WebSocketMethod` | 1/257 each | over-approximated; to be exempted |

Each candidate must be **adjudicated** (§3.5): declared as an interface with a serving package (§3.4),
exempted as a non-surface with a ground, or assigned to a package. In the measured shape `rest`,
`websocket`, `cli` are interfaces, `initial_status` is a status field rather than a reachability axis,
and `id`/`kind` are the over-approximation's cost.

Two properties matter beyond gaia. **A legacy target is untouched**: measured on the only other sequence
artifacts on disk — `tests/educe-sequences/fixtures/{census,spec}/ledger-sequences.json`, whose columns
are `id`, `position`, `grounding`, `reader` — **no column is a candidate** (their single pinned
vocabulary, `OperationStatus(5)`, is instantiated by no column), so an old target's surface axis is empty
and re-running it raises no new demand (C2, §3.12.3). And **a candidate nobody adjudicated is the
failure**, named by column — not a vocabulary nobody mentioned, and not a silence.

The 98 objects of §1.2 are deliberately **not** a fifth axis: they are duties *on a boundary*, covered by
`carries` (§3.3) or adjudicated, and the coverage run prints their count beside the four axes.

### 3.3 The three supply relations

**`owns`** — unchanged. *Meaning:* this package implements the procedure. *Source:* `inventory.objects`,
as today. *Unit ids:* `op-`, `seq-`, `xdir-`. *Status:* already implemented, **not touched by this plan**.

**`serves`** — the surface relation. *Meaning:* every operation the artifact records against this
package's interface must be reachable through that interface's external surface; and because the surface
is where those operations are *reached*, the unit is an **implementation** obligation, not a routing one
— it is discharged by a design showing, for each of the N operations, where its behaviour is implemented
and that this surface reaches it. That is what lets it cover the 47 operations that produce no object
(§1.6): no owner claims them, and the surface's holder owes the whole path to each. *Unit shape:* **one
unit per declared interface**, `obl-<interfaceId>` — not one per operation, because the obligation is
"every operation is reachable" and enumerating 257 per-operation units for a package whose duty is one
lookup path states the same duty 257 times. The unit's **content** is the measured operation count, which
§3.4's cross-check asserts. *Source:* a declared interface record (§3.4).

**`carries`** — the boundary relation. *Meaning:* this package holds one side of a declared boundary; the
provider owes the contract's clauses on the providing side, the consumer on the consuming side. *Unit
shape:* one unit per contract, `ctr-<boundaryId>`, carrying `direction: "provides" | "consumes"` and
`counterpart: <packageId>`. The same id appears in both packages' views, exactly as `xdir-` already
appears in each owner's view — the pattern is not new. *Obligation content:* the contract's clauses,
which the registry already carries (§1.5), so the duty arrives **with its own acceptance criteria** — the
`tests` clause — which is what makes it dischargeable rather than merely stated. *Source:*
`allocateManifest.contract_registry`. Nothing is declared; the allocation already did it.

`carries` is deliberately **not** `serves`: a surface package executes no step of any sequence — the flow
enters through it, it does not pass through it — and a boundary provider may own no object at all.

### 3.4 The declared interface record, and the rules that make it decidable

The tool must not know any project's layer, endpoint or column names. It reads, per package, a
**declared interface record**, from one of two sources in precedence order: a **field in the stage-2
(allocation) manifest**, if present, preferred because that manifest already owns "what this package is";
or **a block in the package's seed document**, the mechanism by which `source_segments` is already read
out of `RFC-SEED.md` by `lib/segments.mjs:71-89`.

```json
{ "serves": [ { "interfaceId": "<project-chosen id>", "column": "<artifact column>",
                "operationSet": "<pinned vocabulary name>", "valueJoin": ["<sub-field>", "…"] } ] }
```

`interfaceId`, `column` and `operationSet` are **opaque strings to the tool**; `valueJoin` is an optional
list of sub-field names used when a column's values are objects rather than strings (measured: `rest`
holds `{ "method": "GET", "path": "/v1/capabilities" }`, so its record declares
`"valueJoin": ["method", "path"]`). The tool interprets none of them: it uses `column` as a key into the
operation rows, `operationSet` as a key into `pins.enumerations`, and `valueJoin` as the join that turns a
value into the spelling a vocabulary can be compared against. That is what keeps it generic —
`rest`/`websocket`/`cli` are one project's vocabulary; `http`/`grpc`/`tui` are equally admissible with no
code change.

**The one rule that makes the cross-check decidable.** A vocabulary member *spells a set*: each
whitespace token of the form `<…>` is dropped, and a token containing `|` is expanded into a cartesian
product of alternatives. Measured: `CliCommand`'s 6 members spell **8** surfaces, because
`gaia operation get|watch|cancel <operation-id>` spells three. A value instantiates a member when the
value equals one of its spellings. Where the artifact carries the named column the tool asserts two
measured things — **value coverage**, that every distinct non-empty value instantiates a member
(measured: 257/257 on all four real candidates of §3.2), and **surface coverage**, the number of
operations carrying the column, printed as the unit's content and asserted against the artifact rather
than against a number the project wrote down. Whatever spelling no operation carries is a **named**
residual (§3.5): measured, one for `websocket` and thirteen for `initial_status`.

The two ways a cross-check can be absent are rendered, never omitted: where the artifact carries the
column the unit carries both counts and the view says `cross-checked against <column>, <n> of <m>
operations`; where it does not, the unit carries `interfaceId` and `column` and the view says
`not cross-checked: the artifact carries no <column> column`. That line is what keeps a later run from
reading an absent cross-check as an absent obligation — the failure mode of §2.4, one level down.

### 3.5 Adjudication — two outcomes, and neither of them is silence

A demand no relation assigns has exactly **two** admissible resolutions, and a run may not treat any third
state as a pass:

1. **Assign it** — an adjudication **naming the package** that owes it. The demand enters that package's
   `obligationUnits` and is covered for the same reason a relation-covered demand is: `T` holds by
   assignment.
2. **Exempt it** — an adjudication that the demand is **not a duty of this project**, with a ground. The
   demand leaves `U`. This is what removes `id` and `kind` from gaia's candidate set (§3.2), or a status
   vocabulary from the surface axis.

A demand neither assigned nor exempted is a demand nobody owes, and the run's verdict is **"the guarantee
is not established"**, printing every such demand by axis. The previous draft's rule — *an adjudicated
residual is covered* — is exactly the defect this plan removes, one level up, because `G`'s antecedent
cannot be discharged for a demand that names nobody.

**Where an exemption lives.** Not in the distribution ledger: that appendix is *inside a package's RFC*,
and a demand assigned to no package has no RFC to live in. The artifact already carries the right record —
measured, `GaiaSekkeiShiyousho_v32-sequences.json` holds **`exemptions` (48 rows)** of the shape
`{ "subject": "G-255", "lens": "omission", "why": "the region is a blank line 255-255: it carries no
text, so no lens can be asked of it" }` — a subject, a lens, and a `why`. The coverage exemption is a row
with that shape and a new lens, authored where the demand is discovered, which keeps the split §8.1
already states: **the rail decides whether something is a demand; the slice decides who owes it.** The
ledger's `declared-residual` kind keeps its present meaning (a unit a package holds whose object no
manifest names) and is **not** a coverage mechanism.

A workspace that has not adopted the interface mapping is therefore **not broken**: it passes by
exempting its candidate columns and assigning its operations — visible, reviewable acts, each printing
its ground. A workspace that is silent does not pass, and one that leaves a demand unowned is told the
guarantee is not established. `G` requires no less: an unstated antecedent is not a satisfied one.

### 3.6 The coverage theorem, and the two gates that establish it

One new pure module computes the partition for the whole workspace. For each axis `A` and demand `d ∈ A`:

```
assigned(d) ⟺ ∃p : d ∈ obligationUnits(p)      (by a relation, or by an adjudication that names p)
exempt(d)   ⟺ an exemptions row names d with a lens and a why, so d leaves U
T           ⟺ ∀d ∈ U : assigned(d)
```

**Gate 1 — coverage.** `T` false ⟹ the run reports **the guarantee is not established**, printing every
unassigned demand by name and axis with the repair each axis calls for. This is the gate whose absence
let 13 packages declare DONE.

**Gate 2 — the declaration bound.** A view that declares `serves` for a package whose `obligationUnits`
is empty, while its declared record is non-empty, is a failure named by package. Subsumed by Gate 1 in
outcome, kept because it separates *the declaration did not bind to this package* from *no package
serves this column* — two facts with two repairs, which this codebase already reports apart on principle
(`unit-provenance.mjs:4-8`).

Both run at STEP 3 and STEP 8 of the grill.

**Where the workspace verdict is computed.** The grill runs per package, but coverage is a property of
the workspace, so `measureCoverage` reads the workspace root — derivable from the artifact path, whose
directory holds the two manifests and whose `crates/**` holds the views — and every package's run returns
the same verdict. That is deliberate: an incomplete workspace is incomplete from every package's run, and
complete from every one of them.

### 3.7 Tier 1 — the relations are computed, in one place

One new module, `sequences-slice/lib/obligation.mjs`, pure, exporting `readDeclaredInterfaces(packageRoot,
allocateManifest)` (source precedence per §3.4, one walker, no per-project branch — **called by the
caller, never by the view**, §3.8), `collectCandidateColumns(artifact)` (§3.2's rule),
`classifyCarries(allocateManifest, packageId)` (§3.3 — a filter over `contract_registry` of the same shape
`explain-seed/lib/projection.mjs:148-158` already performs), `classifyServes(artifact, declared,
packageId)` (returning the unit plus its measured coverage), and `buildObligationUnits({ artifact,
allocateManifest }, packageId, declared)` (the union, sorted, with a stable id per unit).

One new module, `sequences-slice/lib/coverage.mjs`, pure, exporting `measureCoverage({ artifact,
allocateManifest, declarations, views })` → per axis, the three-way split of §3.6 (assigned / exempt /
unassigned), with every unassigned demand named and §3.2's 98 objects printed beside the axes. `views` is
the workspace's set of package views, read from the root §3.6 defines; `declarations` and the artifact's
`exemptions` are the two adjudication records of §3.5.

`lib/ownership.mjs` is **not** modified: it is the `owns` relation and it is correct.

### 3.8 Tier 2 — the view carries the obligation section, additively

`lib/view.mjs`:

- `buildPackageView` gains `obligationUnits` (array) and `obligationSource` (three-valued, §3.12.1),
  computed by Tier 1. **The three existing lists are not touched.**
- It stays **pure**: `view.mjs:10-11` states the projection "neither reads nor writes", and the
  declaration reader is a file reader. `run.mjs` calls it — it already reads the allocate manifest at
  `run.mjs:121` and currently discards it — and passes the parsed value plus the declared records in as
  parameters. The header stays true.
- `renderPackageViewMarkdown` gains one section, after the three, under `## Obligation` — the union of
  `serves` and `carries` units, each line carrying `relation`, `unitId`, `subject`,
  `direction`/`counterpart` where present, and §3.4's cross-check verdict.
- `renderPackageViewJson` gains the same fields. The JSON is read by PX-257 through `material.mjs:57`'s
  field list and by `check-distribution-ledger.js`; both are extended in Tier 3 (§3.9) or they would
  ignore the new array and keep passing — the silent-failure shape this plan exists to remove.
- `VIEW_SOURCE_NOTE` is unchanged. The view is still a frozen, regenerable projection.
- `lib/report.mjs` renders the workspace coverage statement beside the existing line-range statement, and
  `calibrate.mjs` prints it. `calibrate.test.mjs`'s existing assertions are kept; an assertion that pins
  the report's whole shape is extended in the same change, never relaxed.

### 3.9 Tier 3 — the grill seeds from it, and the gates refuse a silent empty

`.claude/commands/grill-me-for-rfc.md` and `.claude/scripts/grill-me-for-rfc/`:

- **STEP 1 seed.** `obligationUnits` entries seed nodes with the new prefixes: `obl-<interfaceId>` for a
  `serves` unit, `ctr-<boundaryId>` for a `carries` unit. The existing `op-`/`seq-`/`xdir-` seeding is
  unchanged, and seeding is idempotent (`carryUnitIdsToNode`'s contract: a second call adds nothing).
- **`sequences-ledger.js`.** Its upstream stage answers three ways: `proved`, `not proved`, and — new —
  `undeclared` when the view carries `obligationSource: "undeclared"`. `undeclared` is a named state, not
  a failure: it says this package's manifest declares no interface, and it prints the reason, so that
  "this workspace has not adopted the surface mapping" and "this package owes no surface" are different
  sentences. (`absent` is not a verdict at all — §3.12.1.)
- **The two gates of §3.6**, run in STEP 3 and STEP 8, from a new `check-obligation-coverage.js`.
- **`material.mjs:57`.** `VIEW_UNIT_ARRAY_FIELDS` gains `obligationUnits`. This one literal is the shared
  reader for **both** `check-distribution-ledger.js:27,47` and `sequences-ledger.js:144-150`, so a ledger
  discharging only the new units is accepted and one ignoring them is not — in both gates at once.
- **`distribution-ledger.mjs:25`.** `UNIT_KINDS` gains the kinds the new units declare. Measured present
  value: `['operation', 'sequence', 'cross-boundary-sequence', 'declared-residual']`. Without this,
  `:165-166` refuses every new row by name.

### 3.10 The unit-id vocabulary is widened, deliberately, in one place

`rfc-graph/lib/unit-ids.mjs:15` fixes `UNIT_ID_PATTERN = '^(op|seq|xdir)-.+'`, `:18` fixes
`UNIT_KINDS = ['op','seq','xdir']`, and every carrier of a unit id filters through `isUnitId`. Measured: a
new-prefix id is dropped by `unit-ids.mjs:48,79,98,129,149,171` and by `unit-provenance.mjs:27,57,68`, and
rejected by the graph's node schema. An obligation unit those layers drop never reaches a design node, a
header, a ticket or the ship layer — that is, an obligation nobody implements. The widening is **forced
by `G`**, and the previous draft's refusal to widen is the precise reason it could not establish `G`.

Widening to `^(op|seq|xdir|ctr|obl)-.+`, in these measured sites:

| site | change |
|---|---|
| `rfc-graph/lib/unit-ids.mjs:15` | the pattern admits `ctr` and `obl` |
| `rfc-graph/lib/unit-ids.mjs:18` | `UNIT_KINDS` gains `ctr`, `obl` |
| `rfc-graph/schema/node.schema.json` (`unitIds.items.pattern`) | the same pattern |
| `drill-rfc-down/verify-consistencies.js:252-258` | `collectUnitIds`' `/^(op\|seq\|xdir)-/` admits the two |
| `sequences-slice/lib/material.mjs:57` | `obligationUnits` joins the field list |
| `sequences-slice/lib/distribution-ledger.mjs:25` | the new ledger kinds |
| `tests/rfc-graph/unit-ids.test.mjs` | re-pinned to five prefixes, **keeping** its assertion that an arbitrary string is rejected |

`unit-provenance.mjs` needs no edit: it delegates to `isUnitId`. Three consequences, stated rather than
discovered later:

- **The ship layer gains rows.** `crystalize-readme` reads the graph, so a package with contract or
  surface duties carries those units into its README — intended, they are real duties — and §7.4 requires
  a test that a workspace with no obligations produces a byte-identical README.
- **Two existing gates begin to see the new units.** `verify-consistencies.js:252-258` collects unit
  nodes, and PX-258's provenance checks require each collected unit to be disclosed by the ledger,
  carried by the graph, named by a header and declared by a ticket. Before the widening they could not
  see an obligation unit at all; after it they apply to every one. That is the point — an obligation
  nobody can be held to is not an obligation — and it is why §6's re-entry is work, not a formality.
- **The pinned test changes deliberately, not weakened.** Its subject is "the vocabulary is closed and
  named", not "the vocabulary has three members"; it still rejects a sixth, unnamed prefix.

### 3.11 What the change must not do

- Must not require the surface mapping. A workspace declaring none still runs end to end, passing Gate 1
  by adjudicating its candidate columns (§3.5). The command must not fail for the absence of an opt-in;
  it must fail for an **unadjudicated** demand.
- Must not renumber, rename or retire a unit id. Ids are additive; the widening adds two prefixes and
  changes no existing one.
- Must not fail a run for an absent artifact column (§3.4).
- Must not edit `SEQUENCES.md`/`SEQUENCES.json` by hand. They are generated; `guard-edit-surface.js:34-35`
  refuses them by name and must keep doing so.
- Must not write to any project. conver is the source; projects receive the installed copy (§5), plus the
  regeneration of §6.

### 3.12 Compatibility and re-entry — the contract for C1 and C2

#### 3.12.1 The obligation source is three-valued, and `absent` is a named condition

`obligationSource` is `"declared"` (the manifest or seed declares interfaces), `"undeclared"` (the
projection ran and found no declaration), or **`"absent"`** — the view on disk carries no
`obligationUnits` key at all, which is every view projected before this change.

`absent` is not "seed as before". The previous draft's amendment said exactly that, and it is the silent
path C2 forbids. `absent` is a **named condition that requires regeneration**: the grill prints it with
its reason, and a run over an `absent` view may not treat the obligation set as satisfied. In the normal
case STEP 0 has already regenerated the view, so `absent` is observable only when regeneration itself
could not run — and then the run names *that*, which is the truthful repair.

#### 3.12.2 Regeneration is the reinforcement mechanism, and it is certain in one of two ways

STEP 0 runs `sequences-slice/run.mjs` per package, and `run.mjs` writes both view files by overwrite
(`run.mjs:129-131`). So for an old target the re-run either **writes the new section**, because the
artifact, the tree manifest, the allocate manifest and the seeds are readable — the normal case; or
**refuses with a printed reason and writes nothing** (`ProjectionRefused`, exit 0, `run.mjs:45-67`),
leaving the old view intact, and the grill then reports `absent` with that reason. There is no third
outcome, and no silent one — which is what makes C2's "certainly reinforced" true: the target ends the
run either carrying the obligation section, or carrying a named statement of why it could not. Both are
reinforcement; silence is not.

#### 3.12.3 Idempotence, and a legacy target that is not newly demanded of

Running `run.mjs` twice over the same workspace produces byte-identical views, and re-seeding an
already-seeded DesignTree adds no node — both are existing properties (`run.test.mjs:86-98` asserts the
first for the current shape; `carryUnitIdsToNode`'s contract is the second), extended to cover the
obligation section by T14.

Measured, the only other sequence artifacts on disk (the educe fixtures) have **no candidate column**
(§3.2), so their surface axis is empty and demands nothing. A legacy target with a contract registry
gains `ctr-` units for duties it already had; one with none gains none. In neither case is anything it
had removed, in neither case does the run refuse, and in both the operations axis names exactly the
operations no owner reaches — the reinforcement, not a regression.

#### 3.12.4 The relation vocabulary, named once

| relation | the requirement's term | why this plan's name |
|---|---|---|
| `owns` | `owns` | unchanged from today |
| `serves` | `serves` | as required |
| `carries` | `projects` / `participates` | `participates` is measured to be the existing `xdir-` relation (§0.3) and cannot carry the duty; the duty is read from a *contract*, so the unit prefix is `ctr-`. If the project prefers `projects`, the rename touches §3.10's table and one constant — no id in any materialised record is affected, because none exists yet |

---

## 4. Tests, written first and red before their tier

Fixtures live under `tests/sequences-slice/` and `tests/grill-me-for-rfc/`; no fixture may cite a real
project's package name, layer name or interface vocabulary.

| id | subject and assertion | red before |
|---|---|---|
| **T1** | **the boundary relation is not ownership, and reaches a package that owns nothing.** One contract between *A* and *B*; *C* owns no object and holds no side. *A* carries `ctr:<id>` with `direction: provides`, *B* the same id with `consumes`, *C* none. Give *C* a side → it gains the unit. | §3.7 |
| **T2** | **the three existing lists are byte-identical.** Project a fixture workspace with no declared interfaces, before and after; `deepStrictEqual` on all three. The regression gate for §3.1's refusal; green from Tier 1 onward. | — (guard) |
| **T3** | **an undeclared workspace gains the section and nothing else.** Same fixture: `obligationUnits` reflects only `carries`, `obligationSource` is `"undeclared"`, and `SEQUENCES.md` differs from the pre-change output **only** by the new section. | §3.8 |
| **T4** | **the declared record is read generically.** Two fixtures with different `interfaceId`/`column`/`operationSet` vocabularies and no shared spelling both project correctly, and no source file under `.claude/scripts/sequences-slice/` contains either vocabulary as a literal. | §3.7 |
| **T5** | **the candidate rule and the cross-check are decidable.** A column whose values instantiate members directly; one needing `valueJoin`; one needing the `<…>`-strip and `\|`-alternation spellings; one whose declared column the artifact lacks. The first three carry the measured counts, the fourth `not cross-checked`. | §3.8 |
| **T6** | **a spelling no operation carries is named, not dropped.** A vocabulary member carried by no operation yields a named residual and does not fail the run (`operation.unsubscribe`'s case). | §3.7 |
| **T7** | **Gate 1 fires on an uncovered operation.** An operation no owner reaches and no candidate column assigns: the run reports the guarantee is not established, naming that operation id and its axis. | §3.7 |
| **T8** | **both adjudications discharge an unadjudicated column.** A column instantiating a vocabulary that no declaration serves and no exemption covers is reported, naming the column. Then (a) an exemption row with a lens and a `why` makes it pass and prints the ground; and (b) separately, an assignment naming a package makes it pass **and** the unit appears in that package's view. | §3.5, §3.7 |
| **T9** | **Gate 2 fires.** `obligationSource: "declared"`, non-empty declared record, empty `obligationUnits`: fails naming the package. | §3.9 |
| **T10** | **the ledger's third verdict.** An `"undeclared"` view makes `sequences-ledger.js --stage=upstream` print `undeclared` and exit 0; the `/^(proved\|not proved):/` filter at `tests/grill-me-for-rfc/sequences-ledger.test.mjs:103` becomes three-verdict aware with no existing case losing its assertion. | §3.9 |
| **T11** | **the vocabulary widening is closed and named.** Each of the five prefixes is accepted by `isUnitId`, carried by a graph node, read back from a header and a ticket, and collected by `verify-consistencies.js`; a sixth, unnamed prefix is rejected at every one of those sites and by the node schema. | §3.10 |
| **T12** | **no project vocabulary in the tool.** No file under `.claude/scripts/sequences-slice/` or `.claude/scripts/grill-me-for-rfc/` contains a literal naming a real project's **package or layer**. Interface vocabulary is excluded on purpose and the exclusion is stated in the test: `lib/vocabulary.mjs:15-21` already names the pinned enumerations the artifact carries, and relocating that is not this plan's work (§9). | — (guard) |
| **T13** | **a legacy target is certainly reinforced (C2).** A fixture in the pre-change shape — a view with **no** `obligationUnits` key, no contract registry, no declared interface, an artifact with no candidate column — is run end to end. Assert: the run completes; the regenerated view carries the section with `obligationSource` set and the three lists byte-identical to the pre-change projection; the **surface axis contributes no demand** while the **operations axis names exactly the operations no owner reaches**; and when the fixture is given a candidate column with no adjudication, the run names that column too. A second variant whose regenerate cannot run (an unreadable seed) ends with `absent` and its printed reason, exit 0, old view intact. | §3.7, §3.9, §3.12 |
| **T14** | **re-entry is idempotent (C2).** `run.mjs` twice over the same workspace → byte-identical views; STEP 1's seed over an already-seeded tree adds no node and changes no existing node; a third run changes nothing. | §3.8, §3.9 |
| **T15** | **every existing capability survives (C1).** An inventory captured before the change — each script path under `.claude/scripts/grill-me-for-rfc/` and `.claude/scripts/sequences-slice/`, its usage line, its exit code on the legacy fixture, and its accepted flags — resolves after the change with a byte-identical usage line and the same exit code; the legacy fixture's gate results are unchanged except for Gate 1; `question-gate`'s byte-identity across `grill-me-for-rfc.md`, `explain-seed.md` and `drill-rfc-down.md` holds; and all five conditions of STEP 8's `gate (all 5 required)` line (`.claude/commands/grill-me-for-rfc.md:613`) are still required, with a sixth added. | §3.9 |

---

## 5. Install

```
make install-to-projects
```

Four copies, named by the Makefile (`Makefile:159-163`): `~/shyme/zasso/.claude`,
`~/shyme/zasso/crates/siprs/.claude`, `~/shyme/gaia/.claude`, `~/shyme/conver/.claude`. No copy is edited
by hand; a copy edited by hand is a fifth source of truth.

**Scope.** Every edit is under `~/shyme/zasso/tools/conver`. `~/shyme/gaia` is **read for measurement and
written only by the Makefile's copy step and by the regeneration of §6**. Nothing else in this plan edits
a file under `~/shyme/gaia`; if a step appears to require it, that step is wrong.

---

## 6. Regenerating the views, and what happens to packages already DONE

Regeneration is the intended operation — the view's note says *"Frozen input: do not edit; regenerate
instead"* — it touches no `RFC.md`, and it is C2's reinforcement mechanism (§3.12.2):

```
node .claude/scripts/sequences-slice/run.mjs <sequences-artifact> <package-dir>
```

**It is additive, and the consequence is a re-entry debt, not a corruption.** No id a package already
holds changes or disappears, so its `DesignTree.json`, `CheckList.md` and `RFC.md` remain internally
valid; it gains obligation units its design does not yet cover, so its DONE state is **no longer true**;
and the repair is the command's own re-entry loop (STEP 8a), which is what it exists for.

**Measured expectation on `~/shyme/gaia`, replacing the previous draft's:**

| population | what changes |
|---|---|
| the 13 empty packages | gain `ctr-` units — measured, in §1.5's order, 19, 9, 20, 1, 2, 3, 3, 3, 3, 1, 2, 2, 3 — and nothing from `serves`, because the workspace declares no interface mapping |
| the 13 populated packages | gain `ctr-` units for their own contract sides; **no `xbd-` units, because that relation does not exist in this plan** |
| the 3 unprojected packages | unaffected until their own runs |
| the workspace run | reports **the guarantee is not established**, naming the six candidate columns, the five ownerless sequences, every operation no owner reaches, and every other unassigned demand. This is the intended first result: the sentence that says the obligation set is not yet total |

A run that regenerates must therefore be followed by a **diff of every view**, and that diff is the work
list. The plan does not prescribe re-running the 13; it prescribes publishing the diff and the coverage
report, because the re-entry is the owner's decision and the diff is what makes it an informed one.

---

## 7. Acceptance

1. T1–T15 pass, with T1/T3/T4/T5/T6/T7/T8/T9/T10/T11/T13/T14/T15 observed red before their tier.
2. T2 and T12 green.
3. **`T` holds on a workspace whose demands are each assigned or exempted, and reports the guarantee as
   not established, naming every demand that is neither.** A fixture with no declaration runs end to end
   once its candidate columns are adjudicated, and reports otherwise.
4. A workspace with no contracts and no declared interfaces produces byte-identical
   `ownedOperationUnits`/`ownedSequenceUnits`/`crossBoundarySequenceUnits`, an `obligationSource:
   "undeclared"` view with `obligationUnits: []`, and a README unchanged by the widened vocabulary.
5. **C1.** Every command, script, flag, exit code and output reachable before is reachable after, with
   the same meaning (T15). `educe-sequences.md` and `grill-me-for-rfc.md` gain their amendments (§8) with
   no existing behaviour removed; `tests/grill-me-for-rfc/settle/command-file.test.mjs:183` is updated in
   the same change for the `gate (all 5 required)` literal (`.claude/commands/grill-me-for-rfc.md:613`)
   and for its STEP 8 sentence, with all five conditions still required; the `question-gate` block's
   byte-identity assertions across the three command documents are untouched.
6. **C2.** Re-running either command over a target that has no obligation concepts certainly reinforces
   it: the view carries the section, or the run names why it could not, and never "ran and changed
   nothing" (T13, T14). A legacy target's surface axis is empty (measured, §3.12.3), so it is not newly
   demanded of on that axis.
7. `~/shyme/gaia` is unmodified except by `make install-to-projects` and the regeneration of §6.
8. No file under `.claude/scripts/sequences-slice/` or `.claude/scripts/grill-me-for-rfc/` names a
   project's package or layer (T12).

---

## 8. The amendments to the two command documents

Both files are compressed to telegraphic style on their own track (`docs/電報文体圧縮/`). These amendments
are written in that register, are **purely additive to the control graph**, and must leave every existing
branch on its existing edge.

### 8.1 `.claude/commands/educe-sequences.md`

> **ARTIFACT COLUMNS.** Per-operation rows carry one column per interface the project declares; the rail
> emits the field list it emitted, and never a silent omission. A project declaring three interfaces gets
> three columns; a project declaring none gets none. Column ids are the project's; the rail never spells
> one.
>
> **CONSUMER CONTRACT.** The rail emits, never assigns. Package attribution, obligation and who-owes-it
> are the slice's. Do not add a package field here.
>
> **EXEMPTION.** A demand this specification imposes no duty for is an `exemptions` row: `subject`, and
> `why`. The rail rules on whether something is a demand; the slice rules on who owes it. A demand left
> with neither is not a pass — say so.

Note for the implementer: the measured gaia artifact already satisfies the first paragraph (257 of 257
operations carry `rest`, `websocket`, `cli`), so this states a contract that holds rather than asking for
new work. `tests/conventions/educe-sequences-command.test.mjs:117-121` forbids numeric "n checks / n pins
/ n briefs" phrases in this file; the amendment introduces none.

### 8.2 `.claude/commands/grill-me-for-rfc.md`

> **STEP 1 — SEED.** Seed from `obligationUnits` beside the three existing lists. `obl-` and `ctr-` are
> new id spaces. A view carrying no such section is `absent`: regenerate it, or report `absent` with the
> reason — never treat it as satisfied. Never rename, never retire an id.
>
> **LEDGER — THIRD VERDICT.** `undeclared` joins `proved` / `not proved`. `undeclared` is a named state,
> not a failure: it says this package's manifest declares no interface. Print the reason.
>
> **GATE — COVERAGE.** Every demand of every axis is assigned or exempted. Report the guarantee as not
> established, naming each demand that is neither, grouped by axis. Check in STEP 3 and STEP 8.
>
> **GATE — DECLARED AND BOUND.** A view declaring `obligationSource: "declared"` with a non-empty
> declared record and an empty `obligationUnits` is a failure, named by package. Check in STEP 3 and
> STEP 8.
>
> **INVARIANT — RE-RUN SUPPLEMENTS.** Re-running over a workspace projected by an older rail must
> succeed, require no new workspace, destroy nothing, and leave the workspace carrying the obligation
> section. An old projection is a target to bring forward, never a reason to refuse.

---

## 9. What this plan does not fix

- **The harvest.** `inventory.objects` still holds objects and not duties. This plan reads two further
  relations that do assign duty — the contract registry and the declared surface mapping — instead of
  inferring duty from the harvest. It does not make the harvest complete.
- **The adjudications themselves.** On gaia the run reports the guarantee as not established until each of
  the six candidate columns is declared with a serving package, assigned, or exempted with a ground, and
  until the five ownerless sequences and every ownerless operation is assigned or exempted. Making those
  decisions is the workspace's work, and the run's message is what commissions it.
- **The pinned vocabulary's spelling in the tool.** `lib/vocabulary.mjs:15-21` names five enumerations,
  three of them interface vocabularies. The previous draft's T8 would have forbidden that and was already
  false on existing, load-bearing code; T12 is the narrow form. Relocating that vocabulary is a separate
  change.
- **Any package's DONE state.** §6 publishes a diff and a coverage report. Re-entry is the owner's call,
  and 13 packages on `~/shyme/gaia` will need it.
- **The three unprojected packages.** They get the correct model the first time, when their own runs
  happen.

---

## 10. Outcome

*(Filled in after the change, in the manner of FIX-PLAN005 §8. Leave empty until then.)*
