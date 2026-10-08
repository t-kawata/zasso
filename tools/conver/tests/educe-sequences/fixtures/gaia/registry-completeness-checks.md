# Procedure Registry Completeness Checks

Status of This Memo

This document specifies the inspection that decides whether the Procedure Registry is
complete. It is the executable half of the pair: `gaia-operation/docs/procedure-registry.md`
holds the enumeration, and this document holds the test the enumeration must pass. The
registry is complete when `check-registry.mjs` exits zero; "complete" is never a claim made
in prose.

## 1. Why the test comes first

The specification is not a specification of operations. It is a description of the space
Gaia intends to produce — who relates to whom, under what evidence, toward what end. The
operations are not written down anywhere in it as a list; they must be derived, and a derived
list cannot be checked against the thing it was derived from by re-reading it. So the test is
built first, it is built to read the specification directly, and the registry is filled until
the test passes. A test that read a hand-copied vocabulary would only check the registry
against itself.

## 2. The registry, as a test target

The registry lives in `gaia-operation/docs/procedure-registry.md` inside one fenced block
whose info string is `jsonl`. One JSON object per line, no trailing commas. Field order is
fixed by this document so that diffs stay readable.

The twenty fields are the specification's own, verbatim from line 14173:

| # | field | type |
|---|---|---|
| 1 | `kind` | string, the canonical `CoreOperationKind` identifier |
| 2 | `purpose` | string, one sentence, whose purpose this serves |
| 3 | `mutates_protocol_state` | bool |
| 4 | `required_authority` | string, from the authority vocabulary in §3.4 |
| 5 | `requires_remote_time_handshake` | bool |
| 6 | `requires_session_binding` | bool |
| 7 | `required_pre_state_checkpoint` | bool |
| 8 | `required_proof_classes` | array of §22.3 claim identifiers |
| 9 | `idempotency_scope` | string |
| 10 | `initial_status` | one `OperationStatus` value |
| 11 | `allowed_status_transitions` | object: status → array of status |
| 12 | `external_dependency_class` | string, from the vocabulary in §3.5 |
| 13 | `result_object_classes` | array of canonical object type names |
| 14 | `finality_predicate` | string |
| 15 | `cancellation_rule` | string |
| 16 | `reversal_or_recovery_rule` | string |
| 17 | `rest` | object `{method, path}` |
| 18 | `websocket` | string, a §14159 method |
| 19 | `cli` | string, a §14161 command |
| 20 | `reject_code_families` | array of §22.2 code identifiers |

Two further fields are carried for the checks and are not part of the twenty:

| field | type | why |
|---|---|---|
| `disposition` | `"active"` \| `"excluded"` \| `"framework"` | a name the specification uses but that is not a state-changing operation is recorded as `excluded` with its reason, so that a correct exclusion is never indistinguishable from an omission |
| `evidence` | object `{spec_lines: [int], note: string}` | the specification lines that establish the row |

An `excluded` row still carries fields 1 and 2 and an `evidence.note` giving the reason.
Every other field may be `null` for an excluded row.

### 2.1 The three disposition values

- `active` — the operation mutates protocol state, accepts a signable object, starts or
  accepts an external result, finalizes, cancels, expires, recovers, or emits a durable
  event. It satisfies the predicate at specification line 14029 and carries all twenty fields.
- `excluded` — the specification gives this name to something that does not satisfy the
  predicate: a read, an inspection, a verification with no state change, or a step that
  belongs to an external provider's own bookkeeping rather than to Gaia. Recorded with its
  reason, never dropped.
- `framework` — the operation is part of the Core Operation machinery itself: the
  TimeHandshake stages, session revalidation, poll, watch, cancel, object get, proof verify,
  capabilities. It satisfies the predicate and carries all twenty fields, but is exempt from
  check S5, because it does not produce a Gaia state object.

## 3. Reference vocabularies, read live from the specification

The checker parses these out of `/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md` on every
run. None is copied into this repository, so a change to the specification changes the test.

### 3.1 Object inventory

Two zones, unioned:

- §3.1, specification lines 537..681 — the object type table
- §22.1, specification lines 9831..9870 — the registry of object types introduced by this
  version, plus the framework line at 9866 and the civic line at 9870

Extraction keeps backticked PascalCase identifiers. Identifiers that are formula variables
(`Q`, `A_max`, `T_actual`, `I_protocol_max`) and identifiers that are error codes are removed
by name, because §3.1's prose mentions both. This removal list is itself a checked artifact:
check S13 fails if the list names something that is not present in the specification.

### 3.2 Proof claim vocabulary

§22.3, specification lines 10439..10483. Thirty-eight claim identifiers, one per line. The
count is pinned in the checker, so a change to the specification that adds or removes a claim
fails the run instead of quietly shrinking the reference vocabulary.

### 3.3 Reject code vocabulary

§22.2, specification lines 9880..10393. Every fenced block in the range, one identifier per
line, plus the seven transport codes in the table at 10395..10403.

### 3.4 Authority vocabulary

The specification does not enumerate authority classes; it names them in place. The checker
requires `required_authority` to be one of:

- `none`
- `soul_authority`
- `soul_authority_and_lease`
- `forum_root_authority`
- `forum_issuer_authority`
- `owner_threshold`
- `ekyc_provider_authorization`
- `root_ekyc_provider_authorization`
- `bank_operator_credential`
- `payment_service_authorization`
- `civic_validator_committee`
- `validator_quorum`
- `storage_provider_authorization`

The list is closed here and yields to specification text where the text is more specific. A
row whose authority is not in this list is a check failure, not a warning.

### 3.5 External dependency vocabulary

`external_dependency_class` is named at line 14173 and enumerated nowhere. This document
closes it to: `none`, `stripe_payment`, `stripe_payout`, `stripe_connect_eligibility`,
`stripe_refund_or_dispute`, `ekyc_provider`, `storage_provider`, `bank_provider`,
`compute_provider`, `time_witness`, `discovery_provider`, `civic_validator_committee`. The
closure is a decision of this document, not a reading of the specification; see §7.

## 4. The checks

Each check prints its violations with the offending `kind` and the specification line that
justifies the expectation. The run exits non-zero if any check reports a violation.

### S1 — Sequence totality

Every step of every sequence enumerated anywhere in the specification maps to exactly one
registry row, and the row exists.

Sequences are read from:

- §8, specification lines 3885..3974 — application and payment sequences
- §10.10, specification lines 4578..4618 — payment and distribution sequences
- §13.11, specification lines 5551..5568 — implementation verification order
- §16.7, specification lines 6541..6800 — Soul Transfer
- §18.17..18.19, specification lines 8714..8951 — the three complete procedures
- §23.11..23.16, specification lines 12060..12422 — Civic need and finality
- §25.2, specification lines 13854..13885 — the thirty seam scenarios I01..I30
- §29.3, specification lines 15847..15865 — node-to-node session establishment
- the unified chapter, specification lines 14117..14126 — Remote Session Establishment

A scenario whose subject is a transport step rather than a Gaia operation is recorded in the
sequence manifest with `maps_to: null` and a reason. That manifest is
`sequence-manifest.jsonl`, beside this document, and is itself a checked artifact: S1 fails
if a scenario in the specification has no manifest entry.

### S2 — Operation positioning

Every `active` and `framework` row appears in at least one sequence manifest position, or
carries `"position": "unsequenced"` with a note explaining why no sequence reaches it. An
isolated operation is a failure.

### S3 — Freeze and health consistency

Two allowlists are read from the specification:

- §14.8 `AllowedWhenNotHealthy`, lines 6022..6035, eleven names
- §16.7.2 `TransferSafeOperation`, lines 6648..6661, thirteen names

Every name in either list must have a registry row. Every `active` row that occupies a
position in a sequence which runs while a body is frozen or unhealthy must appear in the
relevant allowlist. A name in an allowlist with no row is an omission.

### S3b — allowlist composition

A body can be frozen and unhealthy at once. §14.8's health gate and §16.7.2's freeze gate are
then both in force, and the specification states neither how they compose nor that they agree.
They do not agree: four operations are freeze-only (`InspectTransferState`,
`SubmitTransferDispute`, `SubmitTransferResolutionEvidence`, `FinalizeTransferWhenAuthorized`)
and two are health-only (`SubmitRecoveryProof`, `ReadBankDataRequiredForRecovery`).

S3b computes the symmetric difference itself, from the specification, and requires every name
in it to be claimed by an `emergent` manifest row through its `allowlist_disagreement` array.
A name permitted by one gate and not the other, unclaimed, fails the run.

The check exists because the disagreement was found by reading, and finding it by reading once
is not a guarantee of finding it again. Once the pattern is named, the machine can hold it: the
symmetric difference is computation, not judgment, so the machine now detects this class on its
own and a future composition rule shows up as a manifest row gaining a resolution.

The check was verified by withdrawing the manifest claim and confirming that all six names are
reported, then restoring it. A check that has never fired is an untested check.

### S3c — gate self-consistency

No name may appear in both the freeze allowlist and the freeze-forbidden list. The two lists
are read from the specification and intersected.

### S4 — Reachability

The union of all sequence manifests, read as a directed graph over registry rows, must be
connected from the initial states. Every `active` row must be reachable. A row reachable only
through a row that is itself unreachable is reported with the chain.

### S5 — Object type coverage

Every object type in the inventory of §3.1 has at least one `active` row whose
`result_object_classes` contains it, or an `excluded` row naming it with the reason that it
is externally produced, derived, or a projection. An object type with no producer is the
failure this check exists to catch.

### S6 — State machine closure

For every `active` row:

- `initial_status` is one of the fifteen `OperationStatus` values at line 14097
- every key and every value of `allowed_status_transitions` is one of the fifteen
- `finalized`, `rejected`, `cancelled`, `expired`, `failed`, `reversed`, `recovered` have no
  outgoing transition where the specification calls them terminal
- every non-terminal status in the map is reachable from `initial_status` by walking the map
- every status in the map is either the initial status, a target of some transition, or a
  terminal status

### S7 — Authority totality

Every row with `mutates_protocol_state` true has a `required_authority` other than `none`, and
the value is in the vocabulary of §3.4. This is the check the specification demands at line
14147 step 4 and line 14029.

### S8 — Interface totality

Every `active` and `framework` row has all three of `rest`, `websocket`, `cli`, non-null and
non-empty. The `websocket` value is one of the ten methods at line 14159. The `rest.path` is
one of the eight at line 14157, or `POST /v1/operations/{operation-kind}` with the kind
carried in the body's `operation_kind`. This is the completeness requirement at line 14169:
no state-changing procedure may be completable through only one interface.

### S9 — Proof closure

Every entry of `required_proof_classes` is one of the thirty-eight claims of §22.3. Where line 10485
imposes a dependency on a claim, the row's proof set includes it:

- a row requiring any of the six `civic_*` claims requires `civic_vote_validity` or
  `civic_vote_tally_validity` as applicable, and its `required_authority` is
  `validator_quorum` or `civic_validator_committee`
- a row requiring `soul_transfer_*` or `forum_root_succession_validity` requires the
  agreement, freeze, reservation, finalization and trust-epoch dependency closure
- a row requiring `lineage_royalty_*` requires the `PaymentSettlement` and
  `PayoutEntitlement` reference integrity proofs named at 10485
- a row requiring `cross_forum_asset_access_validity` requires exactly one active
  `GaiaAssetAccessPolicy`
- a row requiring `time_witness_quorum_validity` has `external_dependency_class` of
  `time_witness`

### S10 — Conservation

Every row whose `result_object_classes` includes an object that moves value —
`PaymentSettlement`, `PayoutEntitlement`, `ForumRevenuePoolDistribution`,
`ForumPoolContributionRecord`, `LineageRoyaltySettlement`, `PayoutAggregation`,
`GaiaServiceCreditGrant`, `RefundSettlement`, `PayoutRecoveryAction`,
`ForumPoolUndistributedForfeiture`, `PayoutEntitlementExpiration` — must carry a
`finality_predicate` that names the conservation law it satisfies, by specification section:

- `C4`, line 76, for any row that adds to an `A_max` proportional sum
- §7.17.1, line 2399, for pool contributions
- §18.20, line 8952, for payment and settlement
- §23.17, line 12423, for Civic need scores

A value-moving row whose predicate names no law fails.

### S11 — Reject code closure

Every entry of `reject_code_families` is one of the codes of §22.2. Every code of §22.2 is
either used by at least one row or listed in `code-exemptions.jsonl` beside this document
with a reason. An unused code with no exemption is reported; the exemption file is itself
checked, and an exemption naming a code that does not exist fails.

### S12 — Idempotency totality

Every `active` and `framework` row has a non-empty `idempotency_scope`. Where line 14181 gives
an example scope for a named operation, the row's scope must be that scope. Where the
specification states a scope in the operation's own section, that statement governs and is
cited in `evidence.spec_lines`.

### S13 — Checker self-consistency

The removal lists, exemption files and closed vocabularies named in this document are checked
against the specification:

- every name in the §3.1 removal list appears in the specification
- every code in `code-exemptions.jsonl` exists in §22.2
- every row's `evidence.spec_lines` lie within 1..15971, and the row's `kind`, where the
  specification names it, appears within six lines of a cited line
- the row count and the per-disposition counts are printed, so that a silent deletion is
  visible as a count change

S13 exists because the first harvest produced five rows whose quoted line was verbatim but did
not contain the claimed name. A quote being verbatim and a line establishing a name are
different facts.

### S14 — Emergent sequences

S1..S13 inspect sequences the specification *enumerates*. They cannot see a sequence the
described space *requires* and no chapter defines, because nothing enumerates it. That class
is found by reading, and S14 is how a reading enters the machine-checked structure instead of
staying in prose.

Every manifest row carries `kind`:

- `specified` — the specification enumerates this scenario. The thirty seam scenarios of
  §25.2 are `specified`.
- `emergent` — judgment surfaced this situation at a crossing of two or more dimensions
  drawn from different chapters. Nothing in the specification enumerates it.

S14 requires of every `emergent` row exactly one of:

- `maps_to` naming one or more registry rows that handle the situation — the reading found
  the handling, and the named rows must exist
- `reason`, a non-empty account of why no operation handles it — the reading found a gap

A row with neither fails. The run prints `emergentOpen`, the count of `emergent` rows still
carrying a reason rather than a resolution, and names each one. **That count is the honest
measure of how much of the space is known to be unclosed.** It is not zero, and a run that
reported it as zero without a reading behind it would be lying.

S14 cannot check that the readings are right — only that each one is present, that a claimed
resolution resolves, and that none is silently dropped. Whether an `emergent` row's `reason`
correctly identifies a gap is reviewed as a reading and cited by line, exactly like any other
claim in this project.

### S15 — Dimension closure

The lattice of §5 of the design note is built from dimensions, and a missing dimension makes
the lattice blind along one axis. S15 therefore requires every closed enumeration the
specification contains to be either a declared dimension or listed in
`dimension-exclusions.jsonl` with a reason. The enumeration list is read from the
specification the same way S13 reads its vocabularies, so a newly added enumeration in a
future version of the specification appears as an unclassified enumeration rather than as
silence.

### S17 — The manifest is a complete enumeration of the specification's sequences

S1 checks that every scenario the manifest lists reaches a registry row. That test is
**self-referential**: it cannot see a sequence nobody wrote into the manifest. S17 closes the
hole by finding the sequences in the specification itself.

A procedure list is a maximal run of three or more consecutive numbered items inside one
section — the form every ordered procedure in the body takes. **The specification contains
seventy such runs.** Each must have a manifest entry whose line range overlaps it. Before S17
existed the manifest covered one of the seventy, because eight coarse chapter zones had been
written where seventy runs belonged.

### S18 — Bullet-form sequences, measured rather than assumed

The body also expresses procedures as bullet lists. **131 of its 430 sections carry three or
more bullets with fewer than three numbered items.** Most are invariant lists, prohibition
lists or role lists rather than sequences — §24.20 alone has 217 bullets, all invariants — and
telling a sequence from an invariant is a reading, not a computation.

S18 therefore does not pretend to classify them. It enforces the claim where a claim is made: a
bullet section that a manifest entry covers must be classified as a sequence or explained. Where
no claim is made, it **reports the count**.

### S19 — Ordered-procedure regions that no manifest entry spans

S17 finds numbered runs; S18 measures bullet sections. Neither reaches a procedure written as an
arrow chain inside a fenced block, nor a guarded transition table stated as such. **An enumeration
cannot certify its own totality**, so S19 does not try to: it finds every region of the body that
carries an order marker and that no manifest entry spans, and requires each to be adjudicated —
either spanned by an entry, or named in `ADJUDICATED_UNSPANNED` with the reason it is not a Core
Operation sequence.

The detector is mechanical; the adjudication list is judgment and is reviewed as such. What is
mechanical is that a region appearing in neither fails the run. Eight regions are adjudicated, all
of them arrow-as-return-type API signatures, field-to-effect mapping tables, or the gaia-network
transport diagrams excluded from Core Operations by 14029, 14179 and 14258.

S19 was written because the first version of the manifest spanned the heat state machine diagram
but not its guard table: `B-5170` ended at 5183 and `A-5198` began at 5198, so the fourteen lines
between them — the definitions of `WatchCondition`, `WarmCondition` and `HotCondition` and the six
guarded transitions — were spanned by nothing. `A-5198`'s own prose *cited* lines 5190-5197. **A
citation inside an entry's prose is not a span**, and nothing was measuring the difference.

In its first run S19 found a second, larger hole the ad-hoc reading had missed: lines 11707-11888,
the whole of §23.3's rules and all of §23.4-23.6, covered by no entry. The manifest had entered
`B-11690` for §23.3's heading and schema and stopped at 11706.

### S20 — every section is accounted for, by a span or by an adjudication

S17, S18 and S19 all test *within* a region. None can see a section the manifest never entered at
all, and that was the largest hole in this apparatus: of the 430 sections at heading level three or
deeper, 95 were spanned completely, 186 partially, and **149 not at all**.

S20 closes it by requiring a claim about every section. A section is accounted for when either

- a manifest entry **begins** inside it — the reader judged it carries a sequence and named the
  lines that matter; or
- it has a row in `section-adjudications.jsonl` — the reader judged it carries no sequence, and
  said which kind of non-sequence it is.

"It begins inside it" is deliberate. An entry that merely overlaps from a parent section has said
nothing about this one. And the two claims fail differently — an unspanned sequence is a coverage
gap, an unadjudicated section is an unread section — so both must be explicit rather than inferred
from the other.

The census is still printed, because the shape of the answer is worth seeing:

```
sectionCoverage sections=430 fullySpanned=277 partiallySpanned=72 notSpanned=81 unadjudicated=0
```

`notSpanned` is not a backlog. Each section it counts is one a reader read and judged to carry no
Core Operation sequence — type tables, error-code tables, formulas, invariant lists, schema blocks,
role definitions. The count moves when a reader corrects an entry's `spec_lines` to the true extent
of its procedure, and it moved from 146 to 81 exactly that way: **no new section was read to
produce that fall**, so it is not progress and must not be quoted as such. The binding number is
**`unadjudicated`**, and it must be 0.

Categories, and what each asserts:

| category | asserts |
|---|---|
| `type_table`, `schema_block`, `parameter_table`, `object_inventory`, `error_code_table` | a structure, not a procedure |
| `formula`, `worked_example` | a computation, not an order |
| `invariant_list`, `prohibition_list`, `role_definition` | a constraint on objects |
| `glossary`, `non_sequence_prose` | neither |
| `excluded_sequence` | **a real sequence that the specification's own exclusions (14029, 14179, 14258) keep out of the Core Operation set** |

`excluded_sequence` exists because filing chapter 28's `Network::set_tags` and `find` procedures as
"non-sequence prose" would assert something false. They are sequences. They are simply not Core
Operations, and the difference matters: an unlisted sequence is a coverage gap, an excluded one is
a deliberate boundary that someone else owns.

### S21 — a sequence may not name an operation the registry excludes

`excluded` asserts "this is not a Core Operation at all": an alias, a transport procedure, a schema
heading, a value derivation. A manifest entry naming an excluded row as the operation that realizes
it contradicts that assertion, and the contradiction is invisible unless something compares the two
lists. S21 compares them.

It found nine real ones. Six were sequences naming an alias — `EmitStorageReceipt` for
`IssueStorageReceipt`, `RotateContentKeyAndReissueKeyEnvelope` for `RotateKeyEnvelope` — or naming a
non-kind, `operation.submit`, which is the dispatcher's entry point rather than a kind.

Three were a different error, and a worse one: `VerifyObjects` and
`VerifyCommunicationHealthAttachment` had been excluded for being **read-only**. But read-only is
exactly what the framework set *is* — `OBJECT_GET`, `PROOF_VERIFY`, `OPERATION_WATCH` and
`OPERATION_POLL` are all read-only and all framework. `excluded` had been doing double duty for
"not a Core Operation" and "does not change state", and the two are not the same claim. Both rows
were promoted to `framework`, and the check now holds the line: an operation that is read-only
belongs to the framework set; an operation that is *not an operation* is excluded.

One sequence legitimately names no target: the thirteen-step pipeline at 14147 is the dispatcher
every state-changing operation passes through, so it is realized by no single kind. Its entry
carries a `reason` instead of a `maps_to`, which is the form the manifest uses for a claim that is
true without a target.

### S22 — an open gap must carry a decision, not a deferral

The specification is a description of the space Gaia wants, not a specification of operations. A
place where it does not state what happens is therefore the **normal** condition, not an error: it
is the material the designer reads and decides. Writing "the implementing package must decide" and
recording that as a disposition moves the author's own work to someone else and calls it done.

Every open gap carries a `decision` of the settle form:

| field | what it holds |
|---|---|
| `rule` | the outcome decided |
| `grounds` | the specification lines the rule rests on |
| `why` | why those lines support the rule |
| `override` | the fact that would overturn it |

A decision without an `override` is not a decision — it is an assumption that cannot be revised.
The `rule` is prose because a judgment is read; the `grounds` are line numbers because they are
checked.

S22's first version also required every ground to lie inside a manifest entry's span, and reported
18 violations against correct decisions. That was wrong: a decision may rest on a line in a section
that carries no sequence at all, which is the ordinary case for a rule about composition. S20
already guarantees every section is spanned or adjudicated, so the coverage test was redundant as
well as wrong. **A check that fails correct work is a defect in the check**, and it was fixed rather
than worked around.

All nineteen were decided, each with its grounds. Three examples:

- **`E-freeze-health-gate-composition`** — a frozen unhealthy body's permitted set is the
  **intersection** of the two allowlists. Both are stated as allowlists ("許可されるのは次の操作だけである"),
  so membership is a necessary condition, and two necessary conditions compose by conjunction. The
  union reading would let a frozen body submit a recovery proof while frozen.
- **`E-health-gate-unplaced-in-execution-order`** — the health gate sits inside step (4) of the
  14147 order, **before** the transfer-freeze check. 6018 bars every state-advancing operation for
  an unhealthy body while freeze bars a named family; a bar on everything is evaluated before a bar
  on a subset, or the reject would name the narrower cause.
- **`E-joint-385`** — "the target forum" at 385 is the **parent** forum. The child forum has no
  members, no checkpoint and no health history at the moment of its own genesis, so no health
  predicate can be evaluated against it.

### S23 — the reverse direction: every closed enumeration must be reached by some operation

S6, S7, S9 and S11 all check the **forward** direction: that an operation's own field is inside the
vocabulary. That catches an invented name and cannot catch a missing operation — a registry with one
row would pass every one of them. S5 already did the reverse for object types (every object type
needs a producing operation or an excluded row with a reason); S23 extends the same question to the
four other closed enumerations the specification supplies.

It found 20 gaps on its first run:

| axis | found | disposition |
|---|---|---|
| proof claims | 14 | bound to the operations that need them, grounded in the §22.3 domain grouping |
| authority classes | 4 | **two different errors, see below** |
| OperationStatus | 2 | `recovered` was a real missing edge; `draft` is exempted |

The four authority classes divided cleanly, and only the reverse question could tell them apart.
`forum_issuer_authority`, `root_ekyc_provider_authorization` and `bank_operator_credential` appear
in **no line of the specification** (grep: 0 hits each) and are demanded by no operation: invented
as plausible classes rather than derived. They were removed — a vocabulary carrying values nothing
uses reads as coverage while measuring nothing. `civic_validator_committee` was the opposite: no
operation *demanded* it as authority, because nineteen civic operations use it as their
**external dependency** — civic finality waits on a committee that is not Gaia. It was in the wrong
list, and it moved to `EXTERNAL_DEPENDENCY`.

`recovered` was a genuine state-model defect: eleven operations reach `recovery_pending` and none
reached `recovered`, so a recovery could begin in the model and never finish. The missing edge was
added. `draft` is different: line 14097 introduces `OperationStatus` with 少なくとも — the list is a
**minimum**, not a closed set — and `draft` is the position a request occupies *before* submission,
so no operation begins there by construction. It is recorded in `totality-exemptions.jsonl` with
that reason rather than silently dropped.

### S24 — every sequence is realized by operations, or adjudicated as not a procedure

**This is the check the apparatus exists for.** A sequence is an ordered bundle of operations, so
the guarantee that the operation set is complete is exactly: for every sequence the specification
states, the operations it needs are defined. Measured without it, that is a claim; measured with it,
it is a fact that fails the run when it stops holding.

An entry is sequence-shaped when it is not an emergent row, not a `B-` bullet section, **or carries a
step decomposition whatever its id says**. The test used to be the spelling of the id, and a spelling
test is not a shape test: `I01`..`I30`, the thirty seam scenarios of §25.2, carry no hyphen and sat
outside the check written for exactly their case, while twelve `B-`/`H-` entries carrying 145 steps
were excluded on the ground that a bullet section is not a sequence — true of the section, not of the
entry.

It is realized when it names operations, every one is a registry row, **and a reader has confirmed by
opening its lines that the entry states an ordered procedure**; or when another entry over the same
lines names them **and cites a line inside this entry's span**; or when
`sequence-adjudications.jsonl` records that it is not a procedure, **with the reader who confirmed it
and the reader who was sent to break it**.

It found **43 bare entries**, and they are the reason the check matters. `R-` comes from a
numbered-**list** detector, and a numbered list is not a procedure: invariant lists, property lists,
mapping tables and transport internals all fire it. Those entries carried a `reason` and looked
recorded — but nobody had asked whether they were sequences at all. **A reason is not an
adjudication.** Six turned out to be genuine procedures and were given their operations
(`A-262` → normal and lost-body succession, `A-1010` → `SoulTransferFinalize`, `A-12661` →
`FinalizeLineageRoyaltySettlement`, `A-12931` → `ForumRootSuccession`, `A-13265` →
`RequestTimeAttestation`, `A-2308` → `SetAssetPublicationIncentivePolicy`).

**The remaining 41 were then tested.** That is a different act from recording them. Each was put to
a reader with one question — does this region state two or more acts, in an order, by named actors —
and each came back confirmed, with the line that shows why: invariant lists (13), excluded transport
sequences (7), property definitions (4), computations (4), prohibitions (3), transition statements
(3), schema blocks (2), mapping tables (2), and one each of requirement, non-sequence prose and
approved process. **All 41 stood.** The audit is now part of the record: `audit: {date, confirmed,
line}`, and the check fails an excuse that carries no audit or whose confirming line is a blank
line or a fence marker. An untested excuse is a claim about the specification, and a claim about the
specification is what this apparatus exists to test.

The file also carried three rows the reading campaign had overtaken. `R-12934`, `R-5555` and
`A-985` are now covered by neighbours whose spans contain theirs, so their adjudication no longer
states the entry's disposition. They are marked `superseded` rather than deleted, and the check
requires exactly one of the two: an entry realized by a neighbour must be marked superseded, and an
entry still naming nothing must not be. **A judgment that is retracted is a different record from a
judgment that was never made.**

### The two clauses nobody had tested

The third clause above — "or when `sequence-adjudications.jsonl` records what it actually is" — was
in exactly that state once. Forty-one rows carried a category and a reason and no one had asked
whether they were true. They were audited, all forty-one stood, and the audit became part of the
record. **The first two clauses were never put to that test at all.** Naming an operation is not
stating a procedure, and a neighbour whose span reaches from its first line to its last has not
thereby read anything in between.

Both were then put to readers, and the yield was not small. Of 132 entries the apparatus had
accepted as sequences, **60 were not sequences**, and the test that caught them was the entry-level
reading each accepted entry now carries:

- **`maps_to` is not evidence of a procedure.** `S-soul-transfer` is §16.7's nine schemas and a
  `CanFinalizeSoulTransfer` conjunction; the agreement → freeze → reservation → finalization chain
  is the sequence of *states a record passes through*, and the acts that cause the transitions are
  elsewhere. `S-civic-need-and-finality` is object schemas, need-lifecycle transitions and BFT quorum
  rules. Both are zones — `S-`, the ids that looked most sequence-shaped of all.
- **A neighbour's span is where it was assigned, not where it went.** `A-9731` cites six of
  `R-9733`'s lines, one per step, and reads them; `A-9727`'s span covers the same entry and cites
  none of them. Coverage realised both. A dozen further pairs were like `A-9727`.
- **The same error was in the worklist that catches it.** The reader of `R-9733` was given `A-9727`
  — the first entry whose span covers it — and answered, correctly, that it had read nothing. The
  entry was re-asked with the neighbour that cites its lines and confirmed.

### Every ruling is attacked before it is recorded

A ruling that an entry is not a procedure is a claim about the specification, and this apparatus does
not record such a claim untested. Each was put a second time to a reader **whose instruction was to
break it** — to find, in the entry's own lines, the ordered procedure the first reader said was not
there. Of 132 rulings, 5 fell and 127 stood.

The five that fell are the pass's most useful yield, because each named a line:

| entry | line | what the first reader had not weighed |
|---|---|---|
| `A-5672` | 5777 | the peer confirms the handshake hash and then signs the unsigned projection, an order 5775's no-self-hash rule makes mandatory |
| `A-5866` | 5868 | `まず…埋めなければならない`, then a gated retry — two acts by a named actor in a required order |
| `A-1332` | 1329 | *(reversed — see below)* |
| `A-15916` | 15916 | *(reversed — see below)* |
| `R-15773` | 15773 | *(reversed — see below)* |

**Three of the overturns were themselves wrong, and each was reversed on a ground taken from the
lines rather than from a preference between readers.** `A-1332`'s own line 1325 opens the section
with 本節が定義するobject — *the objects this section defines* — and 1327..1330 are one bullet per
object; the overturn read the bullets as an ordered handover, and that order was inferred from their
sequence. `A-15916` is a contract on a retry in the section 不確実な結果とエラー境界, and the same
reader upheld `A-15882`, a poll contract of the same shape, as not a sequence. `R-15773` found a real
order under the header 実装順序 — audit ledger, config validation, connection pool, correctness tests
— and it is an order of *building* the layer: line 14029 admits a procedure here only when it changes
state, accepts a signed object, starts or receives an external call, finalizes, cancels, expires,
recovers or emits a durable event, and none of the ten does.

`A-1708` and `A-3310` were reversed on the same ground, and the registry had already recorded it:
§7.7's interval evaluation and §7.18.5's `largest_remainder_v1` are ordered — compute, compare,
withhold, raise precision, reject; compare, prefer, tie-break, add — and both compute a number.

**The falsifier's instruction is a prompt to attack, not a standard of proof.** An overturn that
cannot name the line carrying the order, or that finds order in acts the predicate excludes, is a
claim like any other and is read like one.

### The same treatment for the rulings that were already written

Forty adjudications predate the falsifying pass. Each had been confirmed by a reader who agreed with
it, and a reader who agrees is not a test, so all forty were put to a falsifying reader too. All
forty stood. Eighteen of them cite a line two to five lines *above* the entry's span — the sentence
that introduces the list ("the verifier confirms the following"), which is precisely the line that
shows the list is a list of predicates. Those are kept as the readers gave them, each marked
`lead_in` with the span it introduces. Moving a reader's evidence inward to satisfy a rule would
replace it with a worse line.

### S25 — every operation is placed in a sequence or accounted for as single-step

S2 asks whether an unsequenced operation carries a note. S25 asks the harder question the note was
standing in for: **on what is the operation's existence based?**

The 16 unsequenced operations are exactly the 16 that rested on a declaration, and reading their
sections showed why they are in no ordered flow: §23.8 defines the `NeedSubmission` object, its
canonical key derivation and the `InvalidNeedSubmission` rejection, which *is* `SubmitNeed`'s whole
procedure. They are single-step operations, not types with no act. Each now names its defining
section, and S25 fails an operation whose section is absent from the specification — which is how it
caught `VerifyObjects` and `VerifyCommunicationHealthAttachment`, promoted from `excluded` in S21,
whose `position` field had been left `undefined` rather than updated.

### S26 — every sequence is an ordered step decomposition bound one-to-one to operations

S24 establishes that a sequence names operations that exist. **That is an index of a sequence, not
the sequence.** `maps_to` is an unordered set: it never said which operation performs which step, in
what order, or on whose behalf. The claim "satisfied by neither too many nor too few operations" is
unstatable against an index, because there is no step to check against.

`sequence-steps.jsonl` gives, for each of the 61 realized sequences, an ordered decomposition in
which every step carries a **subject** (who acts), a **predicate** (what they do), an **object**
(what they act on) and a **contract** (the rule, condition or rejection that governs the step), cites
the specification line that states it, and binds one operation. S26 enforces:

- steps numbered 1..n with no gap;
- all four of subject, predicate, object and contract non-empty;
- `spec_line` a real line inside the sequence's range;
- **a bijection** — every operation the sequence names appears in exactly one step, and every
  operation a step binds is one the sequence names.

**The bijection is a consistency invariant, and it is no longer a measure of completeness.**

It was the whole of this check's value: an operation the sequence needs but no step performs failed
the run, and so did a step performing an operation the sequence never needed. The repair pass then
derived `maps_to` **from** the steps, because two fields assigned independently diverge in the same
direction — `position` and `maps_to` agreed on all 174 rows and had both been read from the same
window, so their agreement proved nothing. Deriving one from the other closed that class
structurally, and it also made this clause unable to fail: measured over all 61 decomposed entries,
`maps_to` equals the set of operations their steps bind in every one. The clause is kept because it
still stops the two files drifting apart — a later edit that touches one and not the other fails the
run — and that is all it now does.

**Completeness of the reading is not measured by any check in this apparatus.** An operation a
sequence needs and nobody bound is invisible to a bijection between two products of the same
reading. A candidate replacement was built and measured: report an operation name occurring inside an
entry's span that none of its steps binds. It fires on 5 of 109 entries and **all five are false** —
two are substring matches (`AdvertisementDeliveryPolicy` for `AdvertisementDelivery`,
`CanPublishAsset` for `PublishAsset`) and three are a state or a chain named as a precondition. A
name appearing near a region is the signal that produced the fabrications; a check built on it
inherits their error. What completeness rests on is the entry-level reading each sequence now
carries, required by S24, and the reader who is asked whether the sequence's acts are all there.

A step may carry **no** operation, and then it is a **sub-step**: a stage of the specification's own
numbered procedure that no registered operation performs. Those are kept rather than flattened — the
specification's granularity is preserved, and the sub-step still carries its contract, so what happens
inside an operation is written down instead of lost. There are 423. A sequence of nothing but
sub-steps fails, because a sub-step elaborates an operation and cannot replace one.

Two granularities arrived from the readers and both are accepted, because the check is on the
bijection and not on the step count: some sequences fold the specification's sub-stages into the
governing operation's step, others keep them as sub-steps. What the check refuses is an operation
left unbound and an operation invented.

### S27 — a step is stated by prose, not by a table

S26 checks a shape, and a shape can be produced without reading. The first `sequence-steps.jsonl`
was exactly that. Each operation of an entry's `maps_to` was matched to whichever line of the
entry's window mentioned its result object, and a plausible subject and predicate were written
around the match.

`A-525` — citation issuance, section 3.1 — is the case that exposed it. Its recorded span was
`[525,549]`: seven lines of citation procedure followed by the 「通常証明書以外のオブジェクト」
table, one row per object type. Twenty-five operations were bound, and twenty-one of the
twenty-five steps cited a row of that table — `PaymentReceipt` at 544, `MaturityBond` at 545,
`SeedAllocation` at 548 — each stating that the Payment-Service performs the operation that
produces it. Every step cited a line inside the entry's span. Every step carried all four
required fields. Both directions of the bijection held. The sequence was fiction, and the only
thing wrong with it was *where the lines were*.

So this check tests the one thing a shape cannot: whether the cited line states a step. A
procedure step is stated by a sentence an implementer executes; a table row is a cell of an
inventory and states what a thing **is**, never what anyone **does**. A step whose line is a
Markdown table row has taken its operation from the entry's index rather than from its text.

The rule is about the shape of the **cited line** and about nothing else, and that narrowness was
arrived at by measurement, twice.

- The first form fired when the cited line lay in a section the census adjudicated as one of the
  twelve non-procedure categories. It fired 20 times against correct work: a state-machine
  transition table and a prohibition-list section are both legitimately cited by the steps that
  read them.
- The second form kept only `object_inventory` and `type_table`. It still fired 6 times against
  correct work, and the case shows why a section-level rule cannot be made precise: §19.2 is
  adjudicated `type_table` because it contains the `PaymentState` and `FulfillmentState`
  enumerations, and the same section states at 9451 that the Payment-Service processes payment and
  the service provider signs the fulfilment. A step citing 9451 is reading the specification, not
  its index, and no section-level category can tell the two apart.

Against the twenty-five fabricated steps of `A-525` the surviving rule fires 21 times. Against the
1436 steps re-read from the specification it fires zero. **A rule that fails correct work is a
defect in the rule**, and this one was narrowed twice rather than excused once.

### S28 — a gap the specification does not close is closed in the design

Nineteen emergent entries survived two whole-specification searches, each run on the instruction to
falsify the claim that no line governs them. Each carries a `decision`: the rule this design
adopts, the lines it rests on, why those lines support it, and the fact that would overturn it.

Until this check existed, that decision lived only in `sequence-manifest.jsonl` — the record of a
**finding**. An implementer reading the registry, which is the record of the **design**, would never
have seen it. So the rules are also written into the registry, in §4.1, and this check holds the two
copies to each other field for field: `rule`, `why`, `override` as strings, `grounds` as an
ordered list. Neither record can drift from the other without the run failing.

Its second clause caught a defect while it was being written. **Every ground a decision rests on must
be a line a reader can open.** Of the 133 recorded grounds, eight were not: three were fence markers
and five were blank lines. Three `why` clauses cited a line number one line above the line they
were arguing from — the blank separator. A decision grounded on a blank line is a decision grounded
on nothing, and the citation is the only part of a decision a machine can check. All eight grounds
and all three citations were corrected, and the check now fails any that are not lines.

Open is not a hole left in the deliverable. **It is a place where the design decides, and the
decision is written down and checked.**


#### The rule was widened to the whole inventory class, and the scope was widened with it

The table-row rule caught one member of a class. An **inventory line** is any line that states what a
thing IS: a Markdown table row, the opening line of a type or schema declaration (`StorageAvailabilityProof {`),
a bare identifier inside a code block, a field declaration inside a code block, a fence marker, a
blank line. Eleven steps cited such a line, each because the line names the object the act produces.

The predicates were measured against the whole specification before they were adopted, because a
rule that fails correct work is a defect in the rule. `isTypeDeclaration` matches 78 lines and every
one of them is inside a fence. `isBareIdentifier` matches 16 prose lines and 1265 fenced ones, so it
applies only inside a fence.

**Widening the rule forced widening the scope, and that is where the check paid for itself.** S24,
S26 and S27 all decided what a sequence is by the **spelling of the entry's id** — an `S-`, `R-`, `M-`,
`P-`, `I-` or `A-` prefix. A spelling test is not a shape test, and it hid two classes:

- `I01`..`I30`, the thirty seam scenarios of §25.2, carry **no hyphen**. Thirty entries that name no
  operation and are adjudicated nowhere sat outside the very check written for that case. Each one
  anchors on a Markdown table row — the §25.2 fixture table, one row per scenario — and each carried
  a bare `reason` that no one had tested. All thirty are now adjudicated `conformance_scenario`, with
  the line that shows why, and the mechanical part is checked: every one of the thirty anchors on a
  table row.
- Twelve `B-`/`H-` entries carry ordered step decompositions covering **145 steps**, and no check examined
  them, on the ground that a bullet section is not a sequence — true of the section, not of the
  entry. Widening the scope found four more inventory citations in them immediately.

The test is now what the entry IS: an emergent row is governed by the emergence rules, a bullet
section by its section adjudication, every other entry is a sequence entry — and an entry carrying a
step decomposition is one whatever its id says. `stepGrounding examined` went from 1462 to 1603. (The
acceptance pass then withdrew eighty decompositions, so the count now stands at 614: the rule widened
the scope, and the count follows the artifact rather than the rule.)

### S29 — every step carries the verdict of the reader who asked whether its line states it

S27 checks three things a machine can see: the cited line is inside the entry, it is not an
inventory line, and the quote is a substring of it. Those are necessary and they are not the
question. **The question is whether the line STATES the step, and that is a reading.**

It has now been read. All 1603 steps then in the artifact were put to a reader with one question — does this cited line
state this actor performing this act — and the answer is recorded on the step as `grounding`. The set
has since shrunk to 614 steps, and every one of those carries the same verdict; a step that does not
fails the check.

The verdicts are `stated`, and four ways of not being stated: `inventory` (a schema, a field list, a
formula, an endpoint list), `condition` (a rule, a prohibition or a boundary), `scope` (what a section
governs), `elsewhere` (a different act), and `duplicate` (the step restates another step of the
same sequence).

`duplicate` is the one this check refuses. **A step counted twice is a step that does not exist**, and
both renderings were numbered as steps, which is why S26 — which checks the numbering — could not
see them. They are removed, and the check fails if one comes back.

The other four are printed on every run. They are the honest size of a backlog, not a pass. A step
whose line does not state it is a step the specification does not state, and repairing one means
re-citing it to the line that does, folding it into the contract of the operation it elaborates, or
dropping it — each of which is a reading this check does not perform.

### S30 — every row carries the verdict of the reader who asked whether its line defines it

S13 checks that a row's evidence lines are in range. That is not the question either. The question
is whether the cited line **defines** the operation, and a spot check found it wrong at a high rate:
of the 35 operations that had lost their position, **15 were grounded on a line that merely mentioned
them** — one that forbids the operation, lists it in an allowlist, or cites it in a conformance
matrix. **A prohibition is not a definition.** A line saying "this operation may not be performed
while frozen" tells you the operation exists, never what it is.

All 257 rows were then put to readers on exactly that question. The verdicts:

| verdict | n | meaning |
|---|---|---|
| `definition` | 162 | the cited line states the act; the line stands |
| `mention` | 35 | the line only mentioned it; the row was re-grounded on the line that states the act |
| `interface_inventory` | 12 | a transport frame, whose definition IS the interface surface inventory |
| `not_an_operation` | 5 | a read, or a representation rule — not an act anyone performs |
| `no_producer` | 35 | an object type the specification registers and no operation produces |
| `designer_supplied` | 8 | the specification names the act and never states it; the design supplies the procedure and section 4.2 records the decision (S31) |

**The trap that made the first pass fail is worth stating plainly: the registry invents most of its
operation names.** Only 38 of the 254 names appear literally in the specification. So a search for
the NAME proves nothing — an operation whose act the specification states in prose, without ever
writing the name, looks undefined to a name-searcher. Eight rows came back "no defining line" from a
name search; re-searched by the act, seven of the twenty had a defining line after all.

The eight that survived both searches are now decided rather than left open: the design supplies
each procedure and section 4.2 of the registry records the decision, with S31 holding the two
records to each other. They are the `designer_supplied` class in the table above, and they are the
subject of the next section.

The check enforces the shape of the record and that a re-grounded row actually cites the line it was
re-grounded on. The eight unresolved rows are flagged and counted on every run — a backlog that is
printed rather than hidden.

### The coverage numbers, printed on every run

```
rows=257 active=177 excluded=72 framework=8
objectTypes=156 proofClaims=38 rejectCodes=454
sequences specified=375 emergent=110 emergentOpen=19 emergentDecided=19 codeExemptions=0
sequenceCoverage numberedRuns=70 bulletSections=131 bulletSectionsUnclassified=0
sectionCoverage sections=430 fullySpanned=121 partiallySpanned=167 notSpanned=142 unadjudicated=0
sequenceRealization direct=61 viaNeighbour=9 adjudicatedNonSequence=174 adjudicationsSuperseded=2 entryReadings=72
totalityReached claims=38 rejectFamilies=13 authorities=9 statuses=14 exempted=1
operationsPositioned=67 operationsSingleStep=86 operationsWithSuppliedRule=32 of 185
sequenceSteps decomposed=61 steps=614 subSteps=423
stepGrounding examined=614 groundedInProse=614
silentGaps open=19 rulesRecorded=19
stepAudit examined=614 stated=614 inventory=0 condition=0 scope=0 elsewhere=0 duplicate=0 duplicate_operation=0
evidenceGrounding definition=146 mention=23 interface_inventory=10 no_producer=35 not_an_operation=10 designer_supplied=33 unresolved=0
unnamedActs rows=33 rulesRecorded=33 aliases=1
stepPredicates prohibitionSteps=0
foldedSentences sentences=63 badSourceLines=0
stepOwnership entries=61 orphans=0
OK: every check passed
```

This block is the output of the acceptance-pass run of 2026-10-08. It is quoted, not authored: the
run prints it on every invocation, so where the two disagree the run is the record. It is dated
because a reading pass moves these numbers — withdrawing a decomposition lowers `decomposed`,
`steps` and `examined` together — and a quoted block that does not say when it was quoted is the
drift this document exists to catch.

Every line of this block was, at some point in this program, a number that had stopped moving
because nobody had read the thing it counts. The first five lines are coverage. The rest are the
audits, and **each audit is paired with the repair it produced** — an audit that is only printed is
a backlog, and a backlog that never reaches zero is not a measure of anything.

| audit line | what it counts | the repair it produced |
|---|---|---|
| `stepAudit` | does each step's cited line state it | 553 unstated steps folded, re-cited or dropped; 43 entries then withdrawn as non-sequences |
| `stepPredicates` | is each step's predicate an act, not a prohibition | 18 folded into the contracts they qualified |
| `foldedSentences` | did each folded sentence come from a line that states a rule | 1 of 303 was a formula opener and was re-cited |
| `evidenceGrounding` | does each row's cited line define the operation | 28 re-grounded, 10 withdrawn as reads or frames, 30 given a rule at 4.2 |
| `unnamedActs` | acts the specification names and never states | each carries a decision, held to its row by S31 |
| `stepOwnership` | does every decomposition still belong to a sequence | guards the cascade the withdrawals create |
| `silentGaps` | gaps the specification does not close | each carries a rule at 4.1, held to the manifest by S28 |

`stepAudit examined=614 stated=614` is the closure of that audit: every step of every remaining
decomposition is stated by the line it cites. It is not the closure of the work. The sections that
were never read are still counted by `sectionCoverage`, and `notSpanned=142` is the honest size of
that — a number this program has never managed to move, and has twice managed to move dishonestly.

The three lines before those are the guarantee itself. `sequenceRealization` sums to the sequence-shaped
entry count and splits it three ways, so an entry that is neither realized nor adjudicated cannot
hide. `totalityReached` is the reverse direction on every closed enumeration the specification
gives. `operationsPositioned + operationsSingleStep` sums to the non-excluded operation count, so an
operation that is neither placed nor accounted for cannot hide either.

An earlier version printed `operationsUnpositioned` as a backlog. The 16 it counted were single-step
operations whose whole procedure is their section's validity rules. **A backlog number that never
reaches zero is not a measure of anything** — it was replaced by the pair that does reach zero and
means something.

#### What moved between the two runs, and what did not

The numbers changed when the sequence→operation binding was re-derived from the specification text
rather than from a 25-line window around each entry. Two of the changes are real and one is not.

**Real.** `groundedInProse` equal to `examined` — 1462 of 1462 when this was written, 614 of 614 now
— is the whole point: every step of every sequence cites
a line that states it and carries a verbatim quote from that line. `operationsSingleStep` rose from
16 to 48 because the re-reading withdrew 35 positions that had been assigned by proximity; the
reading of where those 35 operations are actually defined is recorded in the registry, and 15 of
them had been grounded on a line that *forbade* or merely mentioned the operation rather than
defining it.

**Not real, and worse than not real.** `fullySpanned` rose from 112 to 277 and `notSpanned` fell
from 146 to 81 — and that was not an improvement, it was damage. `spec_lines` had been set to the
min and max of every line the entry cites. An entry whose procedure sits in one section and whose
anchor sits in another — a §24.16 conformance-matrix item pointing at a §14.4 procedure, a commerce
finding anchored at 9316 and read at 3961 — acquired a span covering everything between. **Two such
entries covered 5,398 lines between them, a third of the specification.**

Those spans were currency: S20 counts lines to decide a section is spanned, and S24 accepted
"another entry over the same lines names them" on a plain intersection. So the false spans inflated
the census *and* let entries be counted as realized when their neighbour merely touched them —
twelve pairs shared fewer than five lines, and two shared exactly one.

Both were fixed. `spec_lines` is now the cluster of cited lines that holds the entry's steps, with
anything beyond a 150-line gap recorded as `cross_refs` rather than silently widening the span; and
S24's neighbour must **cover** the entry, not intersect it. The honest numbers are above:
`fullySpanned=121`, `notSpanned=142` — within a few of the 112/146 this section started with — and
`viaNeighbour` fell from 47 to 22, moving 19 entries to explicit adjudication, and fell again to 9 in
the acceptance pass, when the clause was tightened a second time: **a neighbour must cite a line
inside the entry's span, not merely cover it.** **The census never
improved. It was briefly wrong, and the fix was to make it wrong in the honest direction.**

`emergentOpen` rose from 19 to 22 and then fell back to 19, when the three procedure steps the
re-reading found — the Stripe transfer-transition append at 8895, the provider access credential at
9682, and the contribution decay on audit failure at 9744 — were each given the registry row the
specification requires, with the judgment that fixed the row recorded as the entry's `decision`.
Two of the three name an object the specification never writes down; the row says so and states the
line the object was taken from.

#### The second pass: every single-step operation is now a ruling, not a remainder

`operationsSingleStep` was 48 and every one of them was a claim nobody had tested. So each was put
to a reader, which read the section that defines it and answered one question: does this section
state an ordered procedure — two or more acts, performed in an order, by named actors?

- **37 answered no**, and the reason is now recorded on the row, beside the section that defines it.
  Policy publication, object schemas, canonical rules and single acts whose whole procedure is the
  section's validity rules are all this case, and the disposition was already right.
- **11 answered yes**, and every one of those 11 folded back into an entry the manifest already had.
  That is the result worth keeping: **the second pass found no missing sequence. It found that six
  existing decompositions were under-bound** — §16.7 held three operations the zone's reader had not
  bound, §14.3 two, §16.7.6 three, §7.9.1 two, §8.1 two, §18.18.3 one. Ten operations moved from
  single-step to placed, and 26 steps were added or upgraded from sub-step to bound.
- **1 was overruled.** `FinalizeTransferWhenAuthorized` was returned as a sequence of seven steps
  over §16.7.4 and §24.9 — but it binds one operation and every other step is a stage that operation
  performs. A sequence of one operation is not a bundle of operations; S25's single-step disposition
  is its home. The ruling and the reason it was overruled are recorded on the row.

The general lesson, which this program keeps relearning: **a right answer for the wrong reason is
not a verified answer.** Two of the 48 sections were put to a reader with the wrong `section_line` —
`CreateCivicNeedAsset` was read against §16.7.2 instead of §23.18 — and both rulings happened to be
correct. Both were re-read against the right section before being accepted, because the first
ruling was not evidence.

### What no check can reach

A sequence can be implied with no list and no order word at all. All three emergent gaps were
found that way: §14.8 announces no ordering with §16.7.2, yet a frozen unhealthy body is subject
to both; §23.16 fixes a proposer without ever saying what happens when it cannot sign. No
detector sees a requirement that two chapters never state jointly. That class is reachable only
by reading one chapter against another, and it is the reason the emergent mechanism of S14
exists.

### S16 — Gate placement in the execution order

Line 14147 fixes the order in which a state-changing CoreOperation runs its validations,
"at least" thirteen numbered steps. A gate the specification states elsewhere but does not
place in that order leaves the emitted reject code undetermined when two violations hold at
once, and the emitters are implementations rather than the specification.

The checker declares five gates, each with the token that would occur in the order text if the
specification placed it:

| gate | token | placed? |
|---|---|---|
| `session_binding` | `SessionBinding` | yes, step 3 |
| `authority_and_lease` | `DeviceIncarnation` | yes, step 4 |
| `transfer_freeze` | `transfer freeze` | yes, step 4 |
| `health_state` | `health` / `TemporalHealth` | **no** |
| `communication_health_attachment` | `CommunicationHealthAttachment` | **no** |

An unplaced gate must be claimed by an emergent manifest row through `gates_unplaced`. The
gate list is judgment and is reviewed as such; what is mechanical is the comparison of each
token against the order text and the presence of a claim. The check was verified by
withdrawing the claim and confirming that both unplaced gates are reported.

The eKYC membership gate is deliberately absent from the list. It is plausibly inside step 5's
scope and proof validation or step 8's acceptance predicate, and §17.8 has not been read
closely enough to say. Declaring it unplaced without that reading would be a guess dressed as
a check.

### S31 — an act the specification names and never defines is decided, not left open

S30 ends with eight rows whose cited line neither defines them nor mentions them in any defining
way. Every one is an act the specification **uses** — in an allowlist, in a denylist, in a
prohibition, or in a sentence that sends the reader to a procedure it never states — and no line
states it. `RequestRevalidation` and `ReceiveReinstatementProof` appear only as bare entries in the
§14.8 health allowlist and the §16.7.2 freeze allowlist. `CreateAuthorityDelegation` appears only in
prohibitions. `CLOCK_RECOVERY` is worse than that: 14128 sends a reader whose handshake proof bundle
is insufficient to "the **existing** clock recovery procedure", and 15860 sends them there again —
the specification asserts the procedure exists, four times, and never writes it down.

Those eight are not a defect in the rows. The names come from the specification and the acts are
real: a registry that dropped them would lose exactly the acts the specification refuses to let
anyone perform while a body is unhealthy or a forum is frozen. Nor is "no defining line" a licence
to invent one. **The design decides, and the decision is written down.** Section 4.2 of the registry
carries one rule per act — `act`, `rule`, `grounds`, `why`, `override` — and S31 holds the two
records to each other.

Four of the checks are there because each closes a way a decision could be a relabelling:

| what S31 requires | the way it closes |
|---|---|
| the rule names `spec_name`, and that string must occur on the `presupposition` line | a rule cannot rest on lines that never mention the thing it governs. This matters here more than anywhere: the registry invents most of its names, and the specification's own word for two of the eight is `GC` and `clock recovery` |
| the row cites one of the rule's grounds, its grounding line is among them, and the `presupposition` line is cited | the row and the rule cannot drift apart |
| the row carries **no** `defining_section` | and it did: four of the eight claimed one — "section 15.1 (CreateAuthorityDelegation)", "section 14.6 (RequestRevalidation)", "section 5.5 (FetchRecoveryMaterial)", "section 16.7.6 (SubmitTransferResolutionEvidence)". Every claim was false; each section states the keys, the states or the objects and not the act. **A row whose section does not define it may not name one.** |
| an `alias` rule must name a `covers` kind that has a `stated_here` rule | a name cannot be parked as an alias to escape the question of what the act is. `RunStorageGarbageCollection` is the one alias: it and `ExecuteStorageGarbageCollection` are one act under two names, which is a finding about the registry of the same kind as the seven steps that bound two operation kinds to one act |

Removing those four false `defining_section` claims turned S25 red immediately, and that was correct:
S25's escape for an unsequenced operation was "names a defining section", so the escape had been
resting on the false claim. S25 now accepts a §4.2 rule as the alternative and counts those rows
separately, as `operationsWithSuppliedRule`. **A rule that fails correct work is a defect in the
rule; a rule that passes on a false claim is a defect too, and this one was both.**

`unresolved` is no longer printed as a number. It is a failure. A count that used to be the honest
size of a backlog is now the statement that a row nobody has decided exists.

### S32 — a step states an act, and a prohibition is not an act

S29 asked every step one question: does the cited line state this step. That question has a blind
spot, and finding it required reading an entry that S29 had passed.

`A-197` has ten steps and every one of them cites line 197, which states what a Soul Transfer's
**legitimacy is judged by** — both parties' eKYC, signatures, Soul-Bank serialisation, old-authority
revocation, new-body binding, state commitment and settlement conditions. The steps were carved out
of that noun list: step 7 "revokes the old authority" from the fragment 旧authority失効, step 8
"binds the new Body" from 新Body束縛. This is the defect the whole campaign exists to remove,
**and S27, S29 and S26 all pass it**: every step cites a line inside the entry, every quote is a
verbatim substring, every step carries four fields, and the bijection holds.

Three of the ten took their predicate from the line's negation — "must not be expressed as a change
of `identity_pubkey`", "cannot verify sharing/copying/destruction of the private key" — and the
reader answered `stated`, **correctly**: the line does state those prohibitions. It is still not a
step. A sequence is an ordered bundle of acts, and a prohibition is a contract **on** an act, not
one of them.

So the predicate must state what an actor does. The wording is the five modals — `must not`,
`may not`, `shall not`, `cannot`, `must never` — and nothing wider, because "is forbidden" and
"not permitted" read as prohibitions to a human and fire on steps like "rejects the prohibited
actions", which is an act.

The rule was measured against the reading that produced the verdicts before it was adopted: of the
40 steps whose predicate is a modal negation, the earlier reader had already called 34 of them
`condition`. **The check agrees with that reading everywhere except the six it missed**, and those
six are the measure of what it adds.

### S33 — a folded sentence was folded from a line that states a rule

303 steps were repaired by folding: the step was not a step, and the line it cited was a condition
on an operation, so the sentence moved onto that operation's contract rather than disappearing. The
receiving step records where each sentence came from.

A fold is only as good as the line it came from, and there is one way for it to be wrong that no
reading catches reliably. **A formula opener, a schema heading, a table row and a fence marker all
sit next to the rule they introduce**, and a reader working quickly reaches for the line above the
sentence they wanted. One fold in 303 did exactly that: the seeding-basis rule — seeding capacity
comes from `A_real`, never `A_max` — was folded from `AssetScore_{realbase}(node,F)=`, the formula's
opening line, when the rule is stated two lines above it at 1764.

The rule is the one S27 applies to steps and S31 to rules: a line a reader can open, that is not an
inventory entry. One in 303 is a small rate, and the rate is the point: **the class is invisible to
every check that reads a fold's content, because the content was right.** Twenty of the folds were
also read by hand against the specification, and all twenty state a condition on the operation they
were folded onto.

### S34 — a decomposition belongs to an entry that is still a sequence

S26 checks the entries that name operations, and that is the direction that asks whether a sequence
is satisfied. It cannot see the other one. A step decomposition whose entry no longer names any
operation is checked by nothing: S26 skips it (no `maps_to`, nothing to satisfy), S24 skips it (an
entry that is not realized and carries an adjudication with an audit is excused), and S20 counts
sections, not steps. The steps simply stay there.

That began to matter the moment the withdrawals started. An entry whose every step turns out not to
be a step is not a sequence; the honest outcome is to withdraw the decomposition and adjudicate the
entry — and then the steps have to go with it, or a withdrawn reading is sitting in the deliverable
looking exactly like a live one.

The check is stated as a property of the step set rather than of the entries, so it needs no list of
which entries have been withdrawn and cannot fall out of date as more are. **It was measured before
it was added, and it found nothing**: zero entries carried steps without naming an operation at the
time it was written. That is the point — it is a guard over a class of debris the repairs create,
not a description of a defect that already existed.

### The class S32 does not cover, and why no check does

A-197 raises the entry-level question: **is this entry a sequence at all, or is it a list that was
carved into steps?** The signal looks mechanical — 175 of the 553 non-stated steps cite a line that
a sibling step of their own entry also cites, and 70 of the 110 that bind an operation do — but it
is not.

| line | steps citing it | is it a procedure? |
|---|---|---|
| 14147 | 13 of 13 | **yes** — the mandated order, written `(1) … (2) … (13)` on one line |
| 5842 | 4 of 4 | **yes** — a time-witness request fan-out, three acts in sequence |
| 5777 | 4 of 4 | **yes** — bind, sign, exchange, then state the result object |
| 9451 | 3 of 3 | **yes** — Payment-Service processes, provider signs, gaia-core verifies |
| 197 | 10 of 10 | **no** — a list of criteria a transfer is judged by |
| 166 | 6 of 6 | **no** — one append act with a four-item object list |
| 5665 | 6 of 6 | **no** — `Agreement < Freeze < … < Finalization`, a phase ordering |
| 195 | 7 of 9 | **no** — the field definition of `authority_pubkey` |

Concentration separates nothing: the four genuine procedures and the four fabrications are equally
concentrated. A threshold rule was tried against this table and fired on all eight. **A rule that
fails correct work is a defect in the rule**, so no check is added; the class is recorded here and
put to readers, which is the only thing that decides it.

## 5. Execution

```
node crates/conformance/gaia-conformance/docs/check-registry.mjs [--spec <path>] [--registry <path>]
```

Defaults are the specification path above and
`crates/protocol/gaia-operation/docs/procedure-registry.md`. Exit 0 means every check passed.
Exit 1 means at least one check reported a violation. Exit 2 means the checker could not read
its inputs. The summary line always prints the row count and the per-disposition counts.

## 6. What this document does not decide

The checks decide coverage, closure, totality and consistency. They cannot decide whether a
`purpose` sentence is true, whether a `finality_predicate` is the right predicate for its
operation, or whether a sequence manifest is the right sequence. Those are readings of the
specification and are reviewed as readings. What the checks remove is the class of failure
where a reading is right but something is simply absent.

## 7. Decisions this document makes

Three of the twenty fields have no vocabulary in the specification. Each closure below is a
decision with a stated override condition, not a reading.

| field | decision | override condition |
|---|---|---|
| `external_dependency_class` | the twelve-value list in §3.5 | the specification enumerates the field, or a package's RFC declares a value the list lacks |
| `NextRequiredAction` | not a separate field; the required next action is carried in `finality_predicate` prose, because the specification uses the type at line 14088 without defining it | the specification defines the type, or `gaia-core`'s RFC declares its variants |
| `idempotency_scope` | free text, but every row names the identity tuple the specification gives it at line 14181 or in its own section | the specification enumerates scopes, or two rows claim the same scope for operations the specification treats as distinct |

The authority vocabulary of §3.4 is a fourth decision of the same kind.
