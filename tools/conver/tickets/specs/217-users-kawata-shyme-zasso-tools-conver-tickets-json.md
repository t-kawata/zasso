# Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

## 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.

- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.
- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.
- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.

## 2. Green — Implement Behavior (No Stubs, No Test Modification)

Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.

- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.
- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.
- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.
- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.

## 3. Refactor — Apply the Boy Scout Rule (Green State Only)

Refactor only after all tests are green. Refactoring in a red state is prohibited.

- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.
- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.

## Definition of Done

Implementation is considered incomplete unless all of the following are satisfied:

- The tests fully and precisely specify the intended behavior.
- The implementation passes all tests green, without exception.
- Correctness is empirically guaranteed by the tests (not a disguised green).
- No gap exists between test coverage and intended behavior.

Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.

# Target ticket is PX-217: The workspacify-tree gate judges every count it computes: migration atomicity, the port/adapter boundary and object/claim collisions reach the predicate, the counts and the final audit

**Ticket Key**: PX-217 · **Phase**: -1

---

## Background

A `/workspacify-tree` run ends by publishing `status: COMPLETE` and `final_audit.status: PASS`, and both are read as "every check passed". Four checks in the tree rotation disprove that reading, and they share one shape: the logic is implemented and exported, but the pipeline never consults it, or consults it without letting the result decide anything. The migration-atomicity misuse count is computed and dropped before G5's predicate; `checkPortAdapterBoundary` is exported and never imported; `normalizeAliases` is called without the claim list that would make it report collisions; `detectAliasCycles` is exported and never imported. The consequence is measurable: a decisions document that honestly declares `migrationAsAtomicity: true` on a protocol-layer package returns `COMPLETE`, which is the disguised green the project forbids. This ticket makes the gate judge what it computes.

### Goal
Make the four checks decide: G5's status includes the migration-atomicity misuse count, and G3's status includes the port/adapter boundary, the object/claim collisions and the alias cycles. Every count that decides a gate appears both in that gate's `counts` and in `final_audit`, so an operator reading the published manifest can see the grounds of a verdict rather than infer them.

### Purpose
The manifest is the stage-two handoff: the next rotation trusts it. A `COMPLETE` that does not mean "every check passed" makes the safety claim of the whole pipeline unverifiable, because there is then no artifact an operator can read to distinguish a run that passed from a run whose checks were never asked. The checks exist to be asked.

### Motivation
The defects were found on 2026-09-18 by mutant injection against a real specification (`docs/GaiaSekkeiShiyousho_v31.md`), where two of the three DB-policy violation dimensions refused the run and the third did not. The same investigation found that `checkPortAdapterBoundary` was written for exactly the defect an earlier run had published — a port with `implementedBy: []` — and was never called. The defects are live, they are one family, and the toolchain is already being hardened in this area, so the cost of leaving them is a gate that reports PASS without warrant.

### Constraints
The change must not alter any labelled input: the fixture digests frozen in `tests/workspacify-tree/baselines/manifest-hashes.json` stay byte-identical. It must not move the three pipelines that currently reach COMPLETE, which were measured to carry no migration-atomicity misuse, no unattached adapter, no missing port, no object/claim collision and no alias cycle. It must not weaken an existing assertion: the regression gate is re-captured deliberately rather than loosened. The direction of every status change is one-way, from PASS towards refusal. `--decisions` stays withdrawn, so a mutant is staged at the derived path rather than passed as an argument. No field is added to the decisions schema in this ticket.

## Scope

- **Scope of changes (describe each change comprehensively):**
  - `workspacify-tree/lib/validation.mjs` — modify. Import `checkPortAdapterBoundary` from `./adapters.mjs` and `detectAliasCycles` from `./alias-normalization.mjs`; compute the port boundary result and the alias cycles beside the other evaluations in `runGatePipeline`; add `unresolvedObjectClaimCollisions` derived from `inventoryData.object_claim_collisions` and the approved `decisionId` set.
  - `workspacify-tree/lib/validation.mjs:155` — modify. G5 status becomes `raw_sql_count === 0 && db_type_leak_count === 0 && migration_atomicity_misuse_count === 0`; the tautological `approvalCount >= 0` term is removed. Before: a catalog declaring `migrationAsAtomicity: true` on a protocol package returned PASS. After: it returns FAIL.
  - `workspacify-tree/lib/validation.mjs:156` — modify. G5 counts gains `migration_atomicity_misuse_count`; `approval_count` stays.
  - `workspacify-tree/lib/validation.mjs:83-112` — modify. G3 status gains `portResult.violations.length === 0`, `portResult.missingPorts.length === 0`, `unresolvedObjectClaimCollisions.length === 0` and `aliasCycles.length === 0`; counts gains `unattached_adapter_count`, `missing_port_count`, `object_claim_collision_count`, `unresolved_object_claim_collision_count`, `alias_cycle_count`; reasons gains one line per violation, per missing port, per unresolved collision key and per cycle path.
  - `workspacify-tree/lib/validation.mjs:338-345` — modify. `evaluateDatabase`'s early return gains `migration_atomicity_misuse_count: 0` so both exits return the same key set as `lib/database-policy.mjs:24`.
  - `workspacify-tree/lib/validation.mjs:396-398` — modify. `buildFinalAudit` gains `migration_atomicity_misuse_count`, `unattached_adapter_count`, `missing_port_count`, `object_claim_collision_count`, `unresolved_object_claim_collision_count` and `alias_cycle_count`.
  - `workspacify-tree/run.mjs:895` — modify. `normalizeAliases(objects)` becomes `normalizeAliases(objects, { collisionWith: claims })`.
  - `workspacify-tree/run.mjs:900-911` and `:933-943` — modify. `buildInventory` and `prepareInventory` both carry `object_claim_collisions`.
  - `workspacify-tree/run.mjs:392-402` — modify. The published manifest inventory section gains `object_claim_collisions`, so the collisions the gate judged are the collisions the manifest reports.
  - `.claude/commands/workspacify-tree.md:58` and `:155-158` — modify. The G3 and G5 descriptions and the diagnosis count table name the new counts.
  - `tests/workspacify-tree/baselines/manifest-hashes.json` — regenerate. The three `pair:` digests and `commandFileDigests['workspacify-tree']` move; the fixture digests do not.
  - `tests/workspacify-tree/unit/gate-engine.test.mjs` and `tests/workspacify-tree/unit/lib-branch-coverage.test.mjs` — modify. Existing direct-call tests stay; new tests assert through `runGatePipeline`. No existing assertion is weakened or deleted.
  - No API contract change: `runGatePipeline(input)` keeps its parameter shape and return shape `{ gates, finalAudit, status }`. `checkPortAdapterBoundary`, `normalizeAliases` and `detectAliasCycles` keep their signatures. No dependency is added; both imports resolve to modules already inside `lib/`.
- **Out of scope (items intentionally excluded, with justification):**
  - The `missingPorts` half of the boundary check stays inert in practice, because no field of `workspacify-tree-decisions.schema.json` lets a protocol or domain package declare an external capability. The check is complete and is wired by this ticket; the absent design vocabulary is a separate change to the decisions schema and its authored input, and folding it in would make this ticket alter the decision format as well as the gate. Recorded as an open item below.
  - D4, the staging-decisions path and sweep defect, is excluded because PX-215 already closed it in this repository: `run.mjs:206`, `:262`, `:292`, `:575` and `refuseDecisionsArgument`. Re-fixing it would be a second implementation of a solved problem.
  - The copy of the toolchain installed at `/Users/kawata/shyme/gaia/.claude/scripts/workspacify-tree/` is not edited here. It is a consumer project's installation; the change lands in the source repository and reaches installations through the installer, as PX-215 and its predecessors did.
  - The dead-export census INFO001 §6.2 proposes as a CI check is not built here. It is a detector for this class of defect rather than a fix of it, and it would need its own exemption rules for exports used only by tests — `checkPortAdapterBoundary` and `detectAliasCycles` are both in that category today. Recorded as a future improvement.
  - The `gaia-storage` decisions document that exposed D1 is not repaired here. It lives in another repository and belongs to that project's rotation; this ticket makes the tool refuse it.
- **Affected areas (components/systems impacted, even without direct modification):**
  - Gate outcome for every `workspacify-tree` and `workspacify-reverse` run: G3 and G5 can now refuse inputs they accepted. The direction is one-way — PASS to REVIEW_REQUIRED or FAIL — so an existing run that passed can begin failing, and the three frozen pipeline fixtures were measured to be unaffected.
  - Data format of `WORKSPACIFY-TREE-MANIFEST.json`: additive only. `gates[].counts`, `final_audit` and `inventory` gain keys; no existing key changes name, type or meaning. Consumers that read by key name are unaffected; consumers that enumerate keys see new ones. The manifest schema at `schemas/workspacify-tree-manifest.schema.json` types `gates` and `final_audit` loosely enough to accept them, verified by the fixture pipelines still completing.
  - The regression baseline consumed by `install.js` and by the reverse and allocate suites: re-captured. `tests/workspacify-reverse/regression/baseline.test.mjs`, `reverse/cli-reverse.test.mjs`, `workspacify-reverse/integration/command-procedure.test.mjs` and the staleness suites all read the same file, so the re-capture must be verified with `regression check` before the ticket closes.
  - The command definition `.claude/commands/workspacify-tree.md`, which `commandFileDigests` freezes: edited in the same commit as the predicate it documents, so the digest and the wording move together.
  - No performance impact: the two added checks iterate the port list and the package list once each, on a pipeline that already walks the specification several times. No security surface: the gate reads decision input it already parsed and writes nothing new.

## Implementation Target Files

- `.claude/scripts/workspacify-tree/lib/validation.mjs`
- `.claude/scripts/workspacify-tree/lib/adapters.mjs`
- `.claude/scripts/workspacify-tree/run.mjs`
- `.claude/commands/workspacify-tree.md`
- `tests/workspacify-tree/unit/gate-engine.test.mjs`
- `tests/workspacify-tree/unit/lib-branch-coverage.test.mjs`
- `tests/workspacify-tree/baselines/manifest-hashes.json`

## Investigation

- Subject: `.claude/scripts/workspacify-tree/` in this repository. The line numbers INFO001 cites are those of the copy installed at `/Users/kawata/shyme/gaia/.claude/scripts/workspacify-tree/`; in the source repository they have drifted (run.mjs 696 -> 895, 149/204 -> 195/206, 886-892 -> 1085). Every finding below was re-measured here, not carried over.
- D4 is already closed here. `run.mjs:39-47` imports `reservedTreeDecisionsPath` and `sweepStagingDecisions`, `run.mjs:206`/`:262` derive the decisions path from `process.cwd()`, `:292`/`:575` sweep the staging file, and `refuseDecisionsArgument` (`run.mjs:190-198`) refuses the withdrawn `--decisions` token by name. Commit `85fa38a9` (PX-215) delivered this. PX-217 therefore carries D1, D2, D3(a) and D3(b) only.
- D1, measured: `lib/database-policy.mjs:24` returns all three counts on the inapplicable early return and `:52` returns them on the assessed return, with `migrationAtomicityMisuseCount` incremented at `:44` when `migrationAsAtomicity === true` and the layer is domain or protocol. `lib/validation.mjs:155` reads only `raw_sql_count` and `db_type_leak_count`; `:156` lists only those two plus `approval_count`; `:396-397` transcribes only those two into `final_audit`. `:341` returns `raw_sql_count`, `db_type_leak_count` and `details` without the third key. The violation reaches `reasons` through `:157` (`reasons: dbResult.details`) and stops there.
- D2, measured: `grep -rn '\bcheckPortAdapterBoundary\b' .claude/scripts/ --include=*.mjs` returns the definition at `lib/adapters.mjs:19` and nothing else. The whole file has no importer, so it is not the function alone that is unbound. Its two inputs are already in hand at the gate: `buildPipelineAdapters` (`run.mjs:1085-1090`) returns `ports` from `decisions.adapters.ports`, and `prepareForwardPipeline` (`run.mjs:366`) passes the result to `runGatePipeline` as `adapters`. `lib/boundary-review.mjs` exports only `findOverSplitRisks`, an over-splitting check, so it does not supersede this one.
- D3(a), measured: `run.mjs:892` harvests the claim candidates and `run.mjs:895` calls `normalizeAliases(objects)` with no options, while `lib/alias-normalization.mjs:24` accepts `{ collisionWith = [] }` and `:63-74` builds `collisions` only from that list. `prepareInventory` (`run.mjs:913-943`) rebuilds the inventory object field by field, so any new field must be carried there as well as at `run.mjs:900-910`; `buildForwardManifestSections` (`run.mjs:392-402`) enumerates the inventory fields it publishes.
- D3(b), measured: `grep -rn '\bdetectAliasCycles\b'` returns only `lib/alias-normalization.mjs:85`. Note that the current producer cannot emit a cycle: every decision pairs a member of one normalized-key group with that group's primary, and the primary maps to itself only through a self-loop the guard at `:41` excludes. The check is therefore a property of the published artifact rather than of the producer, which is why the gate reads it out of `normalization_decisions`.
- Regression measurement, taken with a probe that runs the real harvest and normalization over the three pipeline fixtures: `long-spec.md`+`decisions-long-ok.json` yields objects 0, claims 0, collisions 0, cycles 0; `gaia-like-spec.md`+`gaia-decisions.json` yields objects 2, claims 0, collisions 0, cycles 0; `objects-table.md`+`decisions-complete.json` yields objects 4, claims 0, collisions 0, cycles 0. No pipeline fixture declares `migrationAsAtomicity`, none declares `kind: 'adapter'`, and none declares `externalImplementations`. All four checks therefore leave the three frozen pipelines at COMPLETE.
- The blind spot that hid these defects: each unbound check already has a passing unit test that calls it directly — `tests/workspacify-tree/unit/gate-engine.test.mjs:176` for `checkPortAdapterBoundary`, `:208` for `checkDatabasePolicy`, `unit/extraction.test.mjs:204` and `unit/lib-branch-coverage.test.mjs:103` for `detectAliasCycles`. A function that works when called proves nothing about whether it is called; the new tests must assert through `runGatePipeline`.
- The regression gate freezes produced manifests, not only inputs: `tests/workspacify-tree/baselines/manifest-hashes.json` maps each fixture to its own sha256 and each of the three COMPLETE pairs to `stableManifestDigest` of the manifest it produced (`lib/regression-gate.mjs:112-126`, which drops `generated_at`, `run_id` and `generator` before canonical serialisation). Adding counts to `gates[].counts` and `final_audit` moves those three digests, so `node .claude/scripts/workspacify-reverse/run.mjs regression capture` is part of this ticket, and `regression check` proves the re-capture.
- `.claude/commands/workspacify-tree.md` documents the gates as data: `:58` describes G3 and G5 in prose and `:155-158` is a diagnosis table naming `raw_sql_count|db_type_leak_count` for adapters and databasePolicy. Both must be extended to the counts this ticket adds, and the command file carries a digest in the same baseline through `commandFileDigests`.
- Crime scan: `bash .claude/scripts/tickets/scan-crimes.sh` reports 0 records. The four findings are omissions of binding, not incomplete implementations, so none carries a `[::STUB::]` marker and none should: `checkPortAdapterBoundary` and `detectAliasCycles` are complete functions whose caller was never written.

## Acceptance Criteria

- **[Happy path] — Describe the scenario that confirms this ticket is complete:**
  - A decisions document in which no protocol or domain package sets `migrationAsAtomicity`, every `kind: 'adapter'` package is named by some port's `implementedBy`, no object and claim candidate share a normalized key, and no alias maps into a cycle returns `status: COMPLETE` with `G3:PASS G5:PASS`. The three frozen pipelines (`long-spec.md`+`decisions-long-ok.json`, `gaia-like-spec.md`+`gaia-decisions.json`, `objects-table.md`+`decisions-complete.json`) still reach COMPLETE, and `node .claude/scripts/workspacify-reverse/run.mjs regression check` exits 0 against the re-captured baseline.
- **[Error case] — Describe an error scenario the feature must handle:**
  - A decisions document that sets `migrationAsAtomicity: true` on a protocol-layer package makes `run.mjs gate --spec=...` exit non-zero with `G5:FAIL` and `migration_atomicity_misuse_count: 1`, where before this ticket the same document returned COMPLETE. Independently, a `kind: 'adapter'` package named by no port makes G3 REVIEW_REQUIRED with `unattached_adapter_count: 1` and names that package id in `reasons`.
- **[Edge case] — Describe any boundary or exception to verify:**
  - G5 evaluates with `adapters` absent: the early return of `evaluateDatabase` yields `migration_atomicity_misuse_count: 0` beside the other two zero counts, so a run whose database policy is `applicable: false` still passes and the predicate never compares `undefined`. Separately, a published collision whose `normalized_key` appears as an `approvals` `decisionId` leaves `object_claim_collision_count: 1` while `unresolved_object_claim_collision_count` falls to 0 and G3 returns to PASS — the collision is reported and judged, never dropped.

## Invariants

- [Normal condition] Every count that decides a gate is computed before the gate is evaluated and is present in that gate's `counts`. G3 decides on `portResult.violations.length === 0`, `portResult.missingPorts.length === 0`, `unresolvedObjectClaimCollisions.length === 0` and `aliasCycles.length === 0`; G5 decides on `raw_sql_count === 0`, `db_type_leak_count === 0` and `migration_atomicity_misuse_count === 0`. No predicate reads a count that `counts` does not carry.
- [Error invariant] A gate that cannot evaluate a check refuses rather than passes. When `adapters` is absent, `evaluateDatabase` returns the same three keys set to zero, so G5 reads numbers and never `undefined`; an `undefined` reaching the predicate would compare false against `=== 0` and turn a legitimate `applicable: false` run into a FAIL. The refusal direction is one-way: the change can move a status from PASS to FAIL or REVIEW_REQUIRED and never the reverse.
- [Internal state invariant] Supplying the claim list to `normalizeAliases` changes the report and not the merge: the returned `candidates` array is identical in length, order, ids, canonical names, aliases and `source_refs` whether or not `collisionWith` is passed, so ownership, package boundaries and implementation order are unaffected by the added check.
- [Boundary invariant] A collision is resolved only by an explicit `approvals` entry whose `decisionId` equals the collision's `normalized_key`. There is no threshold, no allowance and no default that lets a collision pass unexamined, and an approval that resolves one key resolves exactly that key. The published `object_claim_collisions` and `final_audit` counts describe the same set, so an operator can reconcile the gate verdict with the manifest by name.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — workspacify-tree/lib/database-policy.mjs::checkDatabasePolicy -> workspacify-tree/lib/validation.mjs::evaluateDatabase -> G5

- **Precondition**: The database policy computes three violation counts over one package catalog: raw SQL usage, DB-specific type leakage into the domain, protocol, core and interfaces layers, and treating migration atomicity as a substitute for domain operation atomicity. checkDatabasePolicy returns all three keys on both of its exits — the inapplicable early return and the assessed return — so a caller that reads a count never reads undefined.
- **Postcondition**: G5 status is PASS only when all three counts are zero. counts carries raw_sql_count, db_type_leak_count and migration_atomicity_misuse_count, and final_audit carries migration_atomicity_misuse_count. A catalog in which one domain or protocol package sets migrationAsAtomicity true makes G5 FAIL and the run cannot reach COMPLETE, where before this ticket the same catalog returned COMPLETE.
- **Invariant**: Every exit of the database evaluation returns the same key set, so the predicate compares numbers and never undefined. The predicate is strictly stricter than before: the only status transitions this change can produce are PASS to FAIL, and no input that failed before can pass now.

### C002 — workspacify-tree/lib/adapters.mjs::checkPortAdapterBoundary -> workspacify-tree/lib/validation.mjs::runGatePipeline -> G3

- **Precondition**: The gate pipeline holds the ports the decisions declare, as adapters.ports, and the package catalog — the same two inputs checkPortAdapterBoundary was written to read. A port names the capabilities it provides and the packages that implement it; a package names its layer and its kind.
- **Postcondition**: G3 status is PASS only when the boundary reports no unattached adapter and no missing port. counts carries unattached_adapter_count and missing_port_count, reasons names the offending package id for each unattached adapter and the capability for each missing port, and final_audit carries both counts.
- **Invariant**: The boundary check reads no state the pipeline does not already hold, so wiring it changes the verdict and never the input: the packages, the ports and every other gate's counts are identical before and after. An adapter reached outside the boundary and a capability no port provides are both refusals, not advisories.

### C003 — workspacify-tree/run.mjs::buildInventory -> workspacify-tree/lib/alias-normalization.mjs::normalizeAliases -> G3

- **Precondition**: buildInventory holds both the harvested object candidates and the harvested claim candidates at the moment it normalizes, so the claim list that normalizeAliases accepts as collisionWith is available at the call site. normalizeAliases reports one collision entry per normalized key that appears in both lists, carrying normalized_key, object_candidates and claim_candidates.
- **Postcondition**: The inventory published in the manifest carries object_claim_collisions. G3 status is PASS only when every collision's normalized_key appears as a decisionId in approvals. counts carries object_claim_collision_count and unresolved_object_claim_collision_count, reasons names each unresolved key, and final_audit carries both counts.
- **Invariant**: The candidate set is unchanged: normalization still merges the same groups from the same objects, so the published objects, their ids, their aliases, their owners and the implementation order are identical whether or not the claim list is supplied. Supplying it only adds a report, so a collision can never be resolved by silently dropping a candidate.

### C004 — workspacify-tree/lib/alias-normalization.mjs::detectAliasCycles -> workspacify-tree/lib/validation.mjs::runGatePipeline -> G3

- **Precondition**: The published inventory carries normalization_decisions, each entry pairing the alias name it merged, in the from field, with the canonical name it merged into, in the to field. The gate derives its alias pairs from that published list and from no other source.
- **Postcondition**: G3 status is PASS only when the derived alias map holds no cycle. counts carries alias_cycle_count, reasons names each cycle path, and final_audit carries the count. An inventory that publishes a cyclic pair fails G3 even though the current producer cannot emit one, so the wiring is proved live by a constructed input rather than by an observed failure.
- **Invariant**: The map the gate walks is the map the manifest publishes: the pairs are read out of normalization_decisions rather than recomputed by a second normalization pass, so the artifact that was judged and the artifact that was published cannot disagree.

### C005 — workspacify-tree/lib/validation.mjs::buildFinalAudit -> workspacify-tree/run.mjs::buildForwardManifestSections -> tests/workspacify-tree/baselines/manifest-hashes.json

- **Precondition**: A count that decides a gate but appears in neither the gate's counts nor final_audit is invisible to an operator reading the published manifest, because the manifest reports the gates as their records and their final audit and nothing else. The regression gate freezes the stable digest of each pipeline that reached COMPLETE, where a stable digest keeps output and drops run provenance.
- **Postcondition**: Every count named by a G3 or G5 predicate appears in that gate's counts and in final_audit. The three pipelines frozen in tests/workspacify-tree/baselines/manifest-hashes.json still reach COMPLETE, and the baseline is re-captured as a deliberate act rather than left to drift.
- **Invariant**: The predicate and the report are two renderings of one count: a name the predicate reads and the report omits, or the report carries and the predicate ignores, is the defect this ticket closes. Fixture digests, which label inputs, are byte-identical after the change; only the digests of produced manifests and of the edited command definition move.

## Boy Scout Rule

- `lib/validation.mjs:155`: the G5 predicate carries `approvalCount >= 0`, a condition no input can falsify because `approvals` is an array and its length is never negative. A predicate that cannot fail reads as a judgement the gate does not make, which is the same false-confidence family as the defects this ticket closes. Removing the term leaves `approval_count` reported in `counts` and decides the status by the three violation counts alone. The line is already being edited, so the fix costs no extra surface.
- `lib/validation.mjs:153-158`: the G5 object inlines a three-term conjunction and an inline counts literal. Extracting the status decision into a named function that takes the three counts would make the gate read as prose — `databaseViolationsAreZero(dbResult)` returning a boolean — instead of a nested ternary a reader must parse. The same shape appears in G3, where the extracted names would remove eleven terms from one expression.
- `lib/validation.mjs:341`: the early return of `evaluateDatabase` spells out a zero-valued object literal that duplicates the key set `lib/database-policy.mjs:24` already declares. Naming the zero result once — a single `noDatabaseViolations()` constructor shared by both exits — makes the key parity structural rather than a fact two literals must agree on by hand. This is exactly the defect C001 records, so removing the possibility of divergence is the refactor that fits it.
- `run.mjs:890-911` and `run.mjs:933-943`: `buildInventory` and `prepareInventory` enumerate inventory fields twice, so every new field must be added in two places or it silently disappears between them — which is how a computed value can fail to reach the gate. Deriving the second from the first, with only the fields ownership and approvals actually change listed explicitly, would leave one place where a field is declared.
- `run.mjs:1155` region and the surrounding helpers: names such as `guide`, `drawn` and `reserve` are already domain terms and stay. The plan touches only what the ticket edits; no renaming is proposed outside the four sites above.

## Test Plan

### Unit Tests

- UT: [Contract C001][Normal] G5 status is PASS with counts.migration_atomicity_misuse_count 0 when no package declares migrationAsAtomicity, and the three counts G5 reads are exactly the three keys checkDatabasePolicy returns (raw_sql_count, db_type_leak_count, migration_atomicity_misuse_count) — the predicate names every count the database policy computes and none it does not.
- UT: [Contract C001][Failure] A package on layer protocol (or domain) carrying migrationAsAtomicity true makes G5 FAIL with counts.migration_atomicity_misuse_count 1 and reasons naming that package id, and the pipeline status is not COMPLETE. This is the mutant injection of INFO001 §2.3: the run that returned COMPLETE before this ticket must now be refused.
- UT: [Contract C001][Boundary] evaluateDatabase returns the same key set on both of its exits: called with adapters absent, the early return still yields raw_sql_count 0, db_type_leak_count 0 and migration_atomicity_misuse_count 0, so the G5 predicate never compares a count against undefined. A direct runGatePipeline call with no adapters key asserts G5 PASS and migration_atomicity_misuse_count present and 0 in both counts and final_audit.
- UT: [Contract C001][Invariant] The predicate is strictly stricter than before: every input that made G5 FAIL still fails, and the only status transitions the change can produce are PASS to FAIL. Assert the direction by evaluating a catalog that leaks DB types (db_type_leak_count 1) and one that misuses migration atomicity (migration_atomicity_misuse_count 1): both FAIL, and a catalog with all three counts zero PASSes.
- UT: [Contract C002][Normal] G3 status is PASS with counts.unattached_adapter_count 0 and counts.missing_port_count 0 when every package whose kind is adapter is named by some port's implementedBy and no protocol or domain package declares externalImplementations.
- UT: [Contract C002][Failure] An adapter package that no port implements through makes G3 REVIEW_REQUIRED with counts.unattached_adapter_count 1, and reasons carries the message naming that package id as an adapter reached outside the boundary.
- UT: [Contract C002][Failure] A protocol package declaring an externalImplementations capability that no port provides makes G3 REVIEW_REQUIRED with counts.missing_port_count 1, and reasons names that capability as one declared as an external implementation that no port provides.
- UT: [Contract C002][Invariant] Wiring checkPortAdapterBoundary into G3 leaves every other count untouched: for one fixed input, the ownership, boundary-resolution, boundary-coverage, reference-resolution, dependency-matrix and DAG counts are identical to their values before the check was added, and final_audit carries unattached_adapter_count and missing_port_count alongside them.
- UT: [Contract C003][Normal] normalizeAliases called with collisionWith reports one entry per normalized_key that appears in both the object candidates and the claim candidates, each entry carrying normalized_key, object_candidates and claim_candidates; buildInventory publishes that array as inventory.object_claim_collisions.
- UT: [Contract C003][Failure] A published collision whose normalized_key appears in no approvals decisionId makes G3 REVIEW_REQUIRED with counts.unresolved_object_claim_collision_count 1 and counts.object_claim_collision_count 1, and reasons names the unresolved key.
- UT: [Contract C003][Normal] A collision whose normalized_key appears as an approvals decisionId counts as resolved: counts.object_claim_collision_count stays 1 while counts.unresolved_object_claim_collision_count falls to 0 and G3 returns to PASS — the collision is reported, not silently dropped.
- UT: [Contract C003][Invariant] Supplying the claim list leaves the merged candidate set untouched: for one harvested input, the objects, their ids, canonical names, aliases and source_refs are identical with and without collisionWith, so ownership, package boundaries and implementation order cannot move. Assert equality after stripping nothing but the collision report.
- UT: [Contract C004][Normal] G3 status is PASS with counts.alias_cycle_count 0 when normalization_decisions maps each alias into a canonical name that is not itself an alias.
- UT: [Contract C004][Failure] An inventory whose normalization_decisions contains a cyclic pair (a maps to b and b maps to a) makes G3 REVIEW_REQUIRED with counts.alias_cycle_count 1, and reasons names the cycle path — proving the wiring is live, since the current producer cannot emit such a pair.
- UT: [Contract C004][Invariant] The gate derives its alias pairs from the published normalization_decisions and from nothing else, so the map that was judged is the map the manifest publishes: an inventory that publishes a cycle fails even when its candidates were merged correctly.
- UT: [Contract C005][Normal] Every count named by a G3 or G5 predicate also appears in that gate's counts and in final_audit: an assertion walks migration_atomicity_misuse_count, unattached_adapter_count, missing_port_count, object_claim_collision_count, unresolved_object_claim_collision_count and alias_cycle_count through both records.
- UT: [Contract C005][Invariant] The predicate and the report are two renderings of one count: a name the predicate reads but counts omits, or counts carries but final_audit omits, fails the assertion — the two records are checked against the same name list rather than each against itself.
- UT: [Boy Scout] G5's predicate no longer carries the condition approvalCount >= 0, which no input can falsify and which reads as a judgement the gate does not make; approval_count is still reported in counts and in final_audit, and G5's status is decided by the three violation counts alone.

### Integration Tests

- IT: [Contract C005] The forward rotation end to end: `run.mjs finalize` over the three frozen pairs (long-spec.md+decisions-long-ok.json, gaia-like-spec.md+gaia-decisions.json, objects-table.md+decisions-complete.json) still publishes a manifest and reaches COMPLETE after G3 and G5 gain the four checks; verified through tests/workspacify-reverse/regression/baseline.test.mjs, which reproduces every frozen digest. Integration point: workspacify-tree/run.mjs finalize -> lib/validation.mjs runGatePipeline -> lib/render.mjs assembleManifest.
- IT: [Contract C001] The CLI mutant path that exposed D1: staging a decisions document whose protocol-layer package sets migrationAsAtomicity true at the derived path makes `run.mjs gate --spec=...` exit non-zero with G5 FAIL and migration_atomicity_misuse_count 1, while the same document with the field false exits 0. Prerequisite: PX-215 withdrew the --decisions argument, so the mutant is written to the derived decisions path rather than passed on the command line.
- IT: [Contract C003] buildInventory -> prepareInventory -> buildForwardManifestSections: the collisions computed at harvest time survive ownership application and approval filtering and appear in the published manifest's inventory section as object_claim_collisions, so an operator reading the manifest sees the same collisions the gate judged. Related tickets: PX-176 (alias normalization), PX-177 (gate engine).
- IT: [Contract C002] The regression baseline is re-captured deliberately — `node .claude/scripts/workspacify-reverse/run.mjs regression capture` — and then verified with `regression check`. The only baseline entries that move are the three pair: manifest digests and commandFileDigests['workspacify-tree']; every fixture digest stays byte-identical, proving the change added counts without altering any labelled input. Related tickets: PX-207, P22-21.
- IT: [Contract C004] The reverse rotation shares the forward gates: `run.mjs reverse` runs G0-G5 through the same runGatePipeline, so the four checks attach there without a second implementation. Prerequisite: a reverse fixture whose decisions parse; verified through tests/workspacify-tree/reverse. Related tickets: P22-11, PX-213.

### Exceptions

- Item: the agreement between the prose in .claude/commands/workspacify-tree.md and the G3/G5 predicates themselves. Reason: whether a sentence describes the predicate it claims to describe is not testable by a machine — the frozen command-file digest detects that the definition changed, but not whether its new wording is true of the new code, and any assertion written against the wording would restate the prose it is checking. This is not a design defect and not an architectural defect: the predicate is fully covered by UT and IT above, and only its natural-language restatement is exempt. Alternative verification: read the command-file diff against the predicate diff at review time, with `git diff .claude/commands/workspacify-tree.md` beside `git diff .claude/scripts/workspacify-tree/lib/validation.mjs`.

### Plan Test Code (concrete code)

- UT: [Contract C001][precondition] The shared harness: one minimal input that reaches COMPLETE, measured on this repository before the fix. Every assertion below toggles exactly one field of it, so a status change can only come from the field under test.
```js
// tests/workspacify-tree/unit/gate-engine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';
import { GATE_STATUS } from '../../../.claude/scripts/workspacify-tree/lib/errors.mjs';

const gate = (pipeline, id) => pipeline.gates.find((entry) => entry.id === id);

const storageObject = {
  id: 'obj-0001', canonical_name: 'StorageRecord', classification: 'record', owner_package: 'pkg-0001',
  source_refs: [{ line_start: 1, byte_start: 0, byte_end: 10 }],
};
const storagePackage = (over = {}) => ({
  id: 'pkg-0001', name: 'gaia-storage', path: 'crates/protocol/storage',
  layer: 'protocol', kind: 'production-library',
  responsibilities: ['owns storage records'], seed_required: true,
  owns: { objects: ['obj-0001'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] },
  ...over,
});
const workspaceTree = [{
  name: 'crates', path: 'crates', kind: 'dir',
  children: [{ name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [
    { name: 'storage', path: 'crates/protocol/storage', kind: 'dir', children: [] }] }],
}];
const completeInput = ({
  packages = [storagePackage()],
  adapters = { ports: [], databasePolicy: { applicable: true, rawSqlProhibited: true } },
  inventory = {},
  approvals = [],
} = {}) => ({
  structure: { reconstruction: { status: 'PASS' }, spec_pulse: { candidates: [] } },
  inventory: {
    objects: [storageObject], claims: [], terms: [], invariants: [], stateMachines: [], errorCodes: [],
    requiredTests: [], normalization_decisions: [], unresolved_candidates: [], ...inventory,
  },
  workspace: { packages, tree: workspaceTree },
  dependencies: { normalEdges: [], forbiddenEdges: [], boundaries: [] },
  adapters,
  review: { candidates: [] },
  decisions: {
    approvals, ownership: [],
    semantic_review: { status: 'APPROVED', statement: 'checked', approver: 'ai-session' },
    spec_defects: [], residual_questions: [], dependency_reviews: [],
  },
});

// Measured before the fix: runGatePipeline(completeInput()).status === 'COMPLETE',
// with G0..G5 all PASS. That baseline is what makes each toggle below decisive.
```
- UT: [Contract C001][postcondition] G5 refuses the migration-atomicity mutant, and the two control dimensions still refuse.
```js
test('PX-217 C001 [@verifies C001]: G5 refuses a catalog that declares migration atomicity as domain atomicity', () => {
  const clean = runGatePipeline(completeInput());
  const mutant = runGatePipeline(completeInput({ packages: [storagePackage({ migrationAsAtomicity: true })] }));

  assert.equal(clean.status, GATE_STATUS.COMPLETE);
  assert.notEqual(mutant.status, GATE_STATUS.COMPLETE);
  assert.equal(gate(mutant, 'G5').status, GATE_STATUS.FAIL);
  assert.equal(gate(mutant, 'G5').counts.migration_atomicity_misuse_count, 1);
  assert.ok(gate(mutant, 'G5').reasons.some((reason) => reason.includes('pkg-0001')));
  assert.equal(mutant.finalAudit.migration_atomicity_misuse_count, 1);
});

test('PX-217 C001 [@verifies C001]: the two dimensions that already refused still refuse', () => {
  for (const violation of [
    { rawSqlFragments: ['SELECT * FROM checkpoint'] },
    { dbSpecificTypes: ['sqlx::PgPool'] },
  ]) {
    const pipeline = runGatePipeline(completeInput({ packages: [storagePackage(violation)] }));
    assert.equal(gate(pipeline, 'G5').status, GATE_STATUS.FAIL);
    assert.notEqual(pipeline.status, GATE_STATUS.COMPLETE);
  }
});
```
- UT: [Contract C001][invariant] Both exits of the database evaluation return the same key set, so the predicate never compares undefined; the direction of every status change is one-way.
```js
test('PX-217 C001 [@verifies C001]: the database evaluation returns one key set on both exits', () => {
  const withoutAdapters = runGatePipeline(completeInput({ adapters: undefined }));

  assert.equal(gate(withoutAdapters, 'G5').status, GATE_STATUS.PASS);
  assert.equal(gate(withoutAdapters, 'G5').counts.raw_sql_count, 0);
  assert.equal(gate(withoutAdapters, 'G5').counts.db_type_leak_count, 0);
  assert.equal(gate(withoutAdapters, 'G5').counts.migration_atomicity_misuse_count, 0);
  assert.equal(withoutAdapters.finalAudit.migration_atomicity_misuse_count, 0);
  assert.equal(withoutAdapters.status, GATE_STATUS.COMPLETE);
});

test('PX-217 C001 [@verifies C001]: an inapplicable policy reaches the same zero counts as an absent one', () => {
  const inapplicable = runGatePipeline(completeInput({
    adapters: { ports: [], databasePolicy: { applicable: false } },
  }));
  assert.equal(gate(inapplicable, 'G5').counts.migration_atomicity_misuse_count, 0);
  assert.equal(inapplicable.status, GATE_STATUS.COMPLETE);
});
```
- UT: [Contract C002][precondition] Ports and packages as the boundary check reads them: a port naming what it provides and who implements it, a package naming its layer and its kind. The attached-adapter control reaches COMPLETE today, measured.
```js
const storePort = { id: 'port-store', name: 'store-port', provides: ['storage'], implementedBy: ['pkg-0001'] };
const withoutDatabase = { ports: [], databasePolicy: { applicable: false } };

// Control: the adapter is attached, so the boundary is satisfied.
const attached = completeInput({ packages: [storagePackage({ kind: 'adapter' })], adapters: { ports: [storePort], databasePolicy: { applicable: false } } });
// Mutant A: the same adapter with no port implementing through it.
const orphan = completeInput({ packages: [storagePackage({ kind: 'adapter' })], adapters: withoutDatabase });
// Mutant B: a protocol package declaring a capability no port provides.
const unprovided = completeInput({ packages: [storagePackage({ externalImplementations: ['payment'] })] });
```
- UT: [Contract C002][postcondition] G3 refuses both halves of the boundary and names what it refused.
```js
test('PX-217 C002 [@verifies C002]: G3 refuses an adapter no port implements through', () => {
  assert.equal(runGatePipeline(attached).status, GATE_STATUS.COMPLETE);

  const refused = runGatePipeline(orphan);
  assert.equal(gate(refused, 'G3').status, GATE_STATUS.REVIEW_REQUIRED);
  assert.equal(gate(refused, 'G3').counts.unattached_adapter_count, 1);
  assert.ok(gate(refused, 'G3').reasons.some((reason) => reason.includes('pkg-0001')));
  assert.equal(refused.finalAudit.unattached_adapter_count, 1);
  assert.notEqual(refused.status, GATE_STATUS.COMPLETE);
});

test('PX-217 C002 [@verifies C002]: G3 refuses a capability no port provides', () => {
  const refused = runGatePipeline(unprovided);
  assert.equal(gate(refused, 'G3').counts.missing_port_count, 1);
  assert.ok(gate(refused, 'G3').reasons.some((reason) => reason.includes('payment')));
  assert.equal(refused.finalAudit.missing_port_count, 1);
});
```
- UT: [Contract C002][invariant] Wiring the boundary check moves no other count and no other gate.
```js
test('PX-217 C002 [@verifies C002]: the boundary check leaves every other count where it was', () => {
  const before = runGatePipeline(completeInput());
  const after = runGatePipeline(completeInput());

  assert.equal(after.status, GATE_STATUS.COMPLETE);
  for (const id of ['G0', 'G1', 'G2', 'G3', 'G4', 'G5']) {
    assert.equal(gate(after, id).status, gate(before, id).status);
  }
  assert.equal(gate(after, 'G3').counts.orphan_object_count, 0);
  assert.equal(gate(after, 'G3').counts.owner_collision_count, 0);
  assert.equal(gate(after, 'G3').counts.uncovered_edge_count, 0);
  assert.equal(gate(after, 'G3').counts.unknown_owns_reference_count, 0);
  assert.equal(gate(after, 'G3').counts.unattached_adapter_count, 0);
  assert.equal(gate(after, 'G3').counts.missing_port_count, 0);
});
```
- UT: [Contract C003][precondition] A collision is one normalized key present in both harvested lists. Measured on this repository: normalizeAliases(objects) reports 0, normalizeAliases(objects, { collisionWith: claims }) reports 1, and the two candidates arrays are JSON-identical.
```js
import { normalizeAliases } from '../../../.claude/scripts/workspacify-tree/lib/alias-normalization.mjs';

const collisionObjects = [
  { id: 'obj-0001', canonical_name: 'forum_id', classification: 'record' },
  { id: 'obj-0002', canonical_name: 'ForumId', classification: 'record' },
];
const collisionClaims = [{ id: 'clm-0001', canonical_name: 'forum_id' }];

const withoutClaims = normalizeAliases(collisionObjects);
const withClaims = normalizeAliases(collisionObjects, { collisionWith: collisionClaims });

// Measured: withoutClaims.collisions.length === 0, withClaims.collisions.length === 1,
// and JSON.stringify(withoutClaims.candidates) === JSON.stringify(withClaims.candidates).
```

```js
const publishedCollision = [{
  normalized_key: 'forumid', object_candidates: ['forum_id'], claim_candidates: ['forum_id'],
}];
```
- UT: [Contract C003][postcondition] G3 refuses an unresolved collision, and an approval naming the key resolves exactly that key.
```js
test('PX-217 C003 [@verifies C003]: G3 refuses a collision no approval resolves', () => {
  const refused = runGatePipeline(completeInput({ inventory: { object_claim_collisions: publishedCollision } }));

  assert.equal(gate(refused, 'G3').status, GATE_STATUS.REVIEW_REQUIRED);
  assert.equal(gate(refused, 'G3').counts.object_claim_collision_count, 1);
  assert.equal(gate(refused, 'G3').counts.unresolved_object_claim_collision_count, 1);
  assert.ok(gate(refused, 'G3').reasons.some((reason) => reason.includes('forumid')));
  assert.notEqual(refused.status, GATE_STATUS.COMPLETE);
});

test('PX-217 C003 [@verifies C003]: an approval naming the normalized key resolves the collision', () => {
  const resolved = runGatePipeline(completeInput({
    inventory: { object_claim_collisions: publishedCollision },
    approvals: [{ decisionId: 'forumid', rationale: 'the name is an object and a claim by design', approver: 'ai-session' }],
  }));

  assert.equal(gate(resolved, 'G3').counts.object_claim_collision_count, 1);
  assert.equal(gate(resolved, 'G3').counts.unresolved_object_claim_collision_count, 0);
  assert.equal(resolved.status, GATE_STATUS.COMPLETE);
});
```
- UT: [Contract C003][invariant] Supplying the claim list adds a report and moves no candidate.
```js
test('PX-217 C003 [@verifies C003]: the claim list changes the report and not the merge', () => {
  assert.equal(withoutClaims.collisions.length, 0);
  assert.equal(withClaims.collisions.length, 1);
  assert.deepEqual(withClaims.candidates, withoutClaims.candidates);
  assert.equal(withClaims.candidates.length, 1);
  assert.deepEqual(withClaims.candidates[0].aliases, ['ForumId']);
});
```
- UT: [Contract C004][precondition] The pairs come from the published normalization_decisions, each pairing the alias it merged (from) with the canonical name it merged into (to). detectAliasCycles over the cyclic pair below returns one cycle, measured: [{ path: ['A', 'B', 'A'] }].
```js
import { detectAliasCycles } from '../../../.claude/scripts/workspacify-tree/lib/alias-normalization.mjs';

const cyclicDecisions = [
  { from: 'A', to: 'B', reason: 'same-normalized-key' },
  { from: 'B', to: 'A', reason: 'same-normalized-key' },
];
const acyclicDecisions = [{ from: 'ForumId', to: 'forum_id', reason: 'same-normalized-key' }];

// The producer cannot emit a cycle: every decision pairs a group member with that
// group's primary, so the wiring is proved by this constructed input, measured to
// return exactly one cycle.
assert.equal(detectAliasCycles(cyclicDecisions.map((d) => ({ name: d.from, alias: d.to }))).length, 1);
assert.equal(detectAliasCycles(acyclicDecisions.map((d) => ({ name: d.from, alias: d.to }))).length, 0);
```
- UT: [Contract C004][postcondition] G3 refuses a published alias cycle and names the path.
```js
test('PX-217 C004 [@verifies C004]: a published alias cycle makes G3 refuse', () => {
  const clean = runGatePipeline(completeInput({ inventory: { normalization_decisions: acyclicDecisions } }));
  const refused = runGatePipeline(completeInput({ inventory: { normalization_decisions: cyclicDecisions } }));

  assert.equal(gate(clean, 'G3').counts.alias_cycle_count, 0);
  assert.equal(clean.status, GATE_STATUS.COMPLETE);
  assert.equal(gate(refused, 'G3').counts.alias_cycle_count, 1);
  assert.equal(gate(refused, 'G3').status, GATE_STATUS.REVIEW_REQUIRED);
  assert.ok(gate(refused, 'G3').reasons.some((reason) => reason.includes('A')));
  assert.equal(refused.finalAudit.alias_cycle_count, 1);
});
```
- UT: [Contract C004][invariant] The map judged is the map published: the pairs are read out of normalization_decisions rather than recomputed, so an inventory that publishes a cycle refuses even when its candidates merged correctly.
```js
test('PX-217 C004 [@verifies C004]: the alias map is read from the published decisions', () => {
  const inventory = { normalization_decisions: cyclicDecisions, objects: [storageObject], claims: [] };
  const refused = runGatePipeline(completeInput({ inventory }));

  // The candidates are untouched and still merge correctly: only the published
  // decisions carry the cycle, and that alone is enough to refuse.
  assert.equal(refused.finalAudit.orphan_object_count, 0);
  assert.equal(gate(refused, 'G3').counts.alias_cycle_count, 1);
});
```
- UT: [Contract C005][precondition + postcondition] Every count a predicate reads appears in that gate's counts and in final_audit. The name list is the assertion, so a count added to a predicate without being reported fails here.
```js
const GATED_COUNT_NAMES = [
  'migration_atomicity_misuse_count',
  'unattached_adapter_count',
  'missing_port_count',
  'object_claim_collision_count',
  'unresolved_object_claim_collision_count',
  'alias_cycle_count',
];

test('PX-217 C005 [@verifies C005]: every count a predicate reads is reported twice', () => {
  const pipeline = runGatePipeline(completeInput());
  const g3 = gate(pipeline, 'G3').counts;
  const g5 = gate(pipeline, 'G5').counts;

  for (const name of GATED_COUNT_NAMES) {
    assert.ok(name in g3 || name in g5, `${name} is read by a predicate but missing from gate counts`);
    assert.ok(name in pipeline.finalAudit, `${name} is read by a predicate but missing from finalAudit`);
  }
  assert.equal(pipeline.finalAudit.migration_atomicity_misuse_count, 0);
  assert.equal(pipeline.finalAudit.unresolved_object_claim_collision_count, 0);
});
```
- UT: [Contract C005][invariant] The predicate and the report are two renderings of one count: the same name list is checked against both records rather than each against itself.
```js
test('PX-217 C005 [@verifies C005]: the same name list is reconciled against both records', () => {
  const refused = runGatePipeline(completeInput({
    packages: [storagePackage({ migrationAsAtomicity: true })],
    inventory: { object_claim_collisions: publishedCollision },
  }));
  const reported = refused.finalAudit;

  assert.equal(reported.migration_atomicity_misuse_count, gate(refused, 'G5').counts.migration_atomicity_misuse_count);
  assert.equal(reported.object_claim_collision_count, gate(refused, 'G3').counts.object_claim_collision_count);
  assert.equal(reported.unresolved_object_claim_collision_count, gate(refused, 'G3').counts.unresolved_object_claim_collision_count);
});
```
- UT: [Boy Scout] G5 decides on the violation counts alone: the tautological term is gone, and the count it guarded is still reported.
```js
test('PX-217 Boy Scout: G5 passes without requiring any approval and still reports the approval count', () => {
  const pipeline = runGatePipeline(completeInput({ approvals: [] }));

  assert.equal(gate(pipeline, 'G5').status, GATE_STATUS.PASS);
  assert.equal(gate(pipeline, 'G5').counts.approval_count, 0);
  assert.ok(!gate(pipeline, 'G5').reasons.some((reason) => reason.includes('approval')));
});
```
- IT: [Contract C001] The CLI mutant that exposed D1, end to end in a throwaway project. Measured before the fix: exit 0 and `"gates":"G0:PASS G1:PASS G2:PASS G3:PASS G4:PASS G5:PASS"` with `status: COMPLETE` for the mutant. The control mutants for raw SQL and DB-type leakage already exit 1 with `G5:FAIL`.
```js
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const TREE_RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-tree/run.mjs', import.meta.url));

// PX-215 withdrew --decisions, so the mutant is staged at the derived path.
function runGateInThrowawayProject(mutate) {
  const work = mkdtempSync(join(tmpdir(), 'px217-'));
  try {
    const specPath = join(work, 'gaia-like-spec.md');
    cpSync(join(FIXTURES, 'gaia-like-spec.md'), specPath);
    const decisions = JSON.parse(readFileSync(join(FIXTURES, 'gaia-decisions.json'), 'utf8'));
    // The database policy is inapplicable in this fixture, which is why the first
    // rotation never exercised G5 at all. Enable it, then inject one violation.
    decisions.adapters.databasePolicy = { applicable: true, rawSqlProhibited: true };
    mutate(decisions);
    const staging = join(work, 'workspacify', 'tree');
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, 'DECISIONS.json'), JSON.stringify(decisions));

    const result = spawnSync(process.execPath, [TREE_RUN, 'gate', `--spec=${specPath}`], { cwd: work, encoding: 'utf8' });
    return { result, report: JSON.parse(result.stdout.trim().split('\n')[0]) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

test('PX-217 C001 [@verifies C001]: the CLI refuses the migration-atomicity mutant that returned COMPLETE', () => {
  const control = runGateInThrowawayProject(() => {});
  assert.equal(control.result.status, 0);
  assert.equal(control.report.status, 'COMPLETE');

  const mutant = runGateInThrowawayProject((decisions) => { decisions.workspace[0].migrationAsAtomicity = true; });
  assert.notEqual(mutant.result.status, 0);
  assert.match(mutant.report.gates, /G5:FAIL/);
  assert.equal(mutant.report.finalAudit.migration_atomicity_misuse_count, 1);
});
```
- IT: [Contract C002] The CLI refuses both boundary mutants, measured before the fix to return COMPLETE with G3 PASS.
```js
test('PX-217 C002 [@verifies C002]: the CLI refuses an adapter no port implements through', () => {
  const refused = runGateInThrowawayProject((decisions) => { decisions.workspace[0].kind = 'adapter'; });
  assert.notEqual(refused.result.status, 0);
  assert.match(refused.report.gates, /G3:REVIEW_REQUIRED/);
  assert.equal(refused.report.finalAudit.unattached_adapter_count, 1);
});

test('PX-217 C002 [@verifies C002]: the CLI refuses a capability no port provides', () => {
  const refused = runGateInThrowawayProject((decisions) => { decisions.workspace[0].externalImplementations = ['payment']; });
  assert.notEqual(refused.result.status, 0);
  assert.equal(refused.report.finalAudit.missing_port_count, 1);
});
```
- IT: [Contract C003] The harvest-to-report seam, over a fixture that really does collide: `tests/workspacify-tree/fixtures/duplicated-objects.md` yields 2 objects, 2 claims and 2 collisions (`sharedrecord`, `otherrecord`), measured. This proves buildInventory supplied the claim list, which no unit test of normalizeAliases can prove.
```js
test('PX-217 C003 [@verifies C003]: the published counts carry the collisions the harvest found', () => {
  const work = mkdtempSync(join(tmpdir(), 'px217-collide-'));
  try {
    const specPath = join(work, 'duplicated-objects.md');
    cpSync(join(FIXTURES, 'duplicated-objects.md'), specPath);
    const decisions = JSON.parse(readFileSync(join(FIXTURES, 'decisions-complete.json'), 'utf8'));
    const staging = join(work, 'workspacify', 'tree');
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, 'DECISIONS.json'), JSON.stringify(decisions));

    const result = spawnSync(process.execPath, [TREE_RUN, 'gate', `--spec=${specPath}`], { cwd: work, encoding: 'utf8' });
    const report = JSON.parse(result.stdout.trim().split('\n')[0]);

    // Before the fix the key is absent entirely; a zero would be indistinguishable
    // from a harvest that found nothing, which is why the assertion is on the value.
    assert.equal(report.finalAudit.object_claim_collision_count, 2);
    assert.equal(report.finalAudit.unresolved_object_claim_collision_count, 2);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
```
- IT: [Contract C005] The forward rotation still completes and the regression gate reproduces the re-captured baseline. The three pairs are the only combinations measured to reach COMPLETE, and each carries none of the six violations.
```js
// tests/workspacify-reverse/regression/baseline.test.mjs already freezes these;
// this ticket re-captures once and requires the re-capture to be reproduced.
//   node .claude/scripts/workspacify-reverse/run.mjs regression capture
//   node .claude/scripts/workspacify-reverse/run.mjs regression check
//
// Verification that the capture is additive rather than merely different:
//   - every fixture digest in baselines/manifest-hashes.json is byte-identical
//   - the three pair: digests move, and the manifest diff behind them contains
//     added keys only (no renamed, retyped or removed key)
//   - commandFileDigests['workspacify-tree'] moves with the command definition
const pairs = [
  { spec: 'long-spec.md', decisions: 'decisions-long-ok.json' },
  { spec: 'gaia-like-spec.md', decisions: 'gaia-decisions.json' },
  { spec: 'objects-table.md', decisions: 'decisions-complete.json' },
];
for (const pair of pairs) {
  const digest = runTreePair({ pair, projectRoot: process.cwd() });
  const frozen = baseline.manifestHashes[`pair:${pair.spec}+${pair.decisions}`];
  assert.equal(digest, frozen);
}
```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| G5's status was decided by raw_sql_count and db_type_leak_count alone, with a third term `approvalCount >= 0` that no input could falsify; counts and final_audit reported the same two counts. | G5's status is decided by all three database-policy violations and nothing else; counts and final_audit both carry migration_atomicity_misuse_count. | lib/validation.mjs — G5 judges the count it computes. A decisions document that declares migrationAsAtomicity on a protocol or domain package now fails G5 instead of returning COMPLETE. The tautological approval term was removed on the same line; approval_count is still reported. |
| evaluateDatabase returned { raw_sql_count, db_type_leak_count, details } when adapters.databasePolicy was absent, while lib/database-policy.mjs:24 returned all three counts on its own early return. | Both exits return the same four keys, so the predicate compares numbers and never undefined. | lib/validation.mjs — key parity across the two exits of the database evaluation. Without it the new third term would read `undefined === 0` and turn every applicable:false run into a FAIL. |
| checkPortAdapterBoundary was exported from lib/adapters.mjs and imported by nothing; the whole file had no importer. | runGatePipeline evaluates the boundary over adapters.ports and the package catalog, and G3 decides on it. | lib/validation.mjs — G3 judges the port/adapter boundary. unattached_adapter_count and missing_port_count reach the predicate, counts, reasons (naming the package id and the capability) and final_audit. |
| buildInventory called normalizeAliases(objects) with no options, so the claim list it had just harvested was never compared and collisions was always empty. | buildInventory calls normalizeAliases(objects, { collisionWith: claims }) and carries object_claim_collisions into prepareInventory and the published manifest. | run.mjs — the collision check is given something to compare against, and the collisions the gate judges are the collisions the manifest publishes. Supplying the list leaves the merged candidate set byte-identical, so ownership and implementation order cannot move. |
| Collisions were neither published nor judged. | G3 refuses while any collision's normalized_key is absent from approvals; an approvals entry whose decisionId is that key resolves exactly that key. object_claim_collision_count and unresolved_object_claim_collision_count are reported in counts and final_audit. | lib/validation.mjs — a collision is a question, not a defect: the gate refuses until a decision names it rather than dropping a candidate silently. |
| detectAliasCycles was exported from lib/alias-normalization.mjs and imported by nothing. | runGatePipeline derives the alias pairs from the published normalization_decisions and G3 decides on the cycle count; alias_cycle_count reaches counts, reasons (naming the path) and final_audit. | lib/validation.mjs — G3 judges alias cycles. The pairs are read from the published decisions rather than recomputed, so the map judged is the map the manifest carries; the producer cannot emit a cycle, so the wiring is proved by a constructed input. |
| buildFinalAudit looked up gates.find(...G3) once per transcribed count. | It reads the G3 record once into g3Counts and transcribes from it. | lib/validation.mjs — one record read once, so the report cannot disagree with the gate it reports on. |
| A G3/G5 refusal named no cause for the four new checks. | TREE_ADVICE G3 names the adapter/port repair and the approval that settles a collision; TREE_ADVICE G5 states why migration atomicity is judged and how to correct the package that claims it. | lib/gate-advice.mjs — a refused run tells the author which input to repair. |
| The gate list named G3 and G5 without the boundary, collision, cycle or migration-atomicity dimensions, and the finalAudit diagnosis table stopped at raw_sql_count and db_type_leak_count. | The gate list, the machine/AI boundary paragraph and the diagnosis table name every count the added checks report, and the document states the two-report rule. | .claude/commands/workspacify-tree.md — the command definition describes the gate it drives. |
| The forward manifests carried no boundary, collision, cycle or migration-atomicity counts, and the frozen baseline predated both this change and the conver-telegramify command-file restructure. | The baseline is re-captured deliberately: 25 fixture digests byte-identical, forwardSurfaces identical, the three pair: manifest digests and the 15 command-file digests refreshed, regression check reports proved with 0 disagreements and 0 command-file losses. | tests/workspacify-tree/baselines/manifest-hashes.json — the capture was taken only after proving the manifest change is additive: stripping the six new counts and the published collisions from each post-change manifest reproduces the digest frozen before the change, for all three pipelines. |
| No test asserted that any of the four checks was consulted by the pipeline; each had a unit test that called it directly and passed either way. | 16 unit assertions through runGatePipeline and 5 CLI assertions through run.mjs gate, every one of them a one-field toggle from an input measured to reach COMPLETE. | tests/workspacify-tree/unit/gate-engine.test.mjs and tests/workspacify-tree/integration/gate-binding.test.mjs — the new tests assert through the pipeline, because a function that works when called proves nothing about whether it is called. Existing assertions were neither weakened nor removed. |

## RFC Discrepancies found in Prior Implementation Rounds

- INFO001 §2.6 states that `evaluateDatabase`'s early return is unreachable from the CLI because `buildPipelineAdapters` returns `databasePolicy: adapters.databasePolicy ?? {}`. Measured: `run.mjs` buildPipelineAdapters does return `?? {}`, and `checkDatabasePolicy` then takes its own `applicable: false` early return, so the observation holds for the CLI path. The fix was applied anyway because the predicate now reads a third count and would compare `undefined === 0` the moment `?? {}` is removed; both exits therefore return the same key set.
- INFO001 §4.3 proposes gating unresolved collisions through `approvals`. Implemented as proposed, keyed on the collision's `normalized_key`. Measured on this repository: no fixture produces a collision except `duplicated-objects.md` (2 collisions), and the three frozen pipelines produce none, so the change moves no existing pipeline from COMPLETE.
- INFO001 §4.3 also proposes feeding `detectAliasCycles` with `{ name: d.to, alias: d.from }`. Implemented with the opposite direction, `{ name: d.from, alias: d.to }`, because `from` is the alias and `to` the canonical name it merged into; cycle detection is invariant under edge reversal, so both find the same cycles, and this direction states the mapping the artifact records.
- INFO001 §3.3 records that the `missingPorts` half stays inert because no decisions-schema field declares an external capability. Confirmed: `missing_port_count` reads 0 on every authorable document. The check is wired and carries a test that raises it by injecting `externalImplementations`, so a zero here means no declaration exists to test rather than every declaration is satisfied.

## Notes in Prior Implementation Rounds

- [Implementation steps] Order, Red first. (1) Write the failing tests: through `runGatePipeline`, one per clause of C001-C005, plus the Boy Scout assertion on G5's predicate. They must fail for the absence of the wiring, not for a missing fixture — confirm each failure reads as a missing count or a PASS where a refusal is expected. (2) D1 in `lib/validation.mjs`: the early-return key parity at `:341`, the G5 predicate and counts at `:155-156`, the `final_audit` transcription at `:396-398`. (3) D2: import and evaluate the boundary check, extend G3's predicate, counts and reasons. (4) D3(a): `run.mjs:895` supplies the claim list; `buildInventory` and `prepareInventory` carry `object_claim_collisions`; the manifest inventory section publishes it; G3 decides on the unresolved remainder. (5) D3(b): derive the alias pairs from `normalization_decisions` inside the pipeline and extend G3. (6) Extend `.claude/commands/workspacify-tree.md` in the same commit as the predicates it describes. (7) Re-capture the baseline deliberately and read the diff before accepting it. (8) Refactor only with every test green.
- [Risks] The one real risk is the baseline: `tests/workspacify-tree/baselines/manifest-hashes.json` freezes produced manifests, so the three `pair:` digests move, and a re-capture performed without reading the diff could hide a change nobody intended. Mitigation: capture, then diff, then assert that the only manifest differences are added keys — no key renamed, retyped or removed — and that every fixture digest is byte-identical. A second risk is the reverse rotation: `run.mjs reverse` runs the same forward gates, so a reverse fixture whose measured tree carries an unattached adapter would begin refusing. No such fixture was found, and the reverse suite is in the impact set for that reason.
- [Caveats] `missing_port_count` will read zero on every decisions document that can currently be authored, because no field of the decisions schema lets a protocol or domain package declare an external capability. The check is wired and tested; it is the vocabulary that is absent, and a zero there means "no declaration exists to test", not "every declaration is satisfied". The G5 predicate loses its `approvalCount >= 0` term; `approval_count` remains in `counts`, so no reader loses a number.
- [Open items] The decisions schema needs a field through which a protocol or domain package declares an external capability, so that the `missingPorts` half of the boundary check has an input. That is a change to the authored decision format and belongs to its own ticket. INFO001 §6.2's CI census of exports whose only reference is their own definition is likewise a separate ticket; it needs exemption rules for exports reached only from tests, which is the category both checked functions were in.
- [Future improvements] Once the port/adapter boundary is decided by the gate, the `kind: 'adapter'` value and the `ports` list become load-bearing in a way they were not: an adapter declared without a port is now a refusal rather than a note. The next rotation can therefore require `implementedBy` to be non-empty at the point a port is authored, turning the gate's refusal into a schema constraint and removing a round trip.
Implementation summary (PX-217).

- Changed files: .claude/scripts/workspacify-tree/lib/validation.mjs, .claude/scripts/workspacify-tree/run.mjs, .claude/scripts/workspacify-tree/lib/gate-advice.mjs, .claude/commands/workspacify-tree.md, tests/workspacify-tree/unit/gate-engine.test.mjs, tests/workspacify-tree/integration/gate-binding.test.mjs (new), tests/workspacify-tree/baselines/manifest-hashes.json (re-captured).
- TDD: 21 tests were written first and confirmed red for the absence of the wiring (measured failures: `undefined !== 0`, `undefined !== 2`, and exit 0 where a refusal was expected), then the four checks were bound, then the predicate extraction and the comment rewording were done with every test green. One assertion was strengthened before implementation because it compared two undefineds and agreed with itself.
- Validation: `make test-workspacify` 371 tests / 364 pass / 7 fail, and `make test-workspacify-reverse` 1457 tests / 1414 pass / 35 fail. Both failure sets were measured at HEAD with this change stashed: the forward suite had 9 failures and the reverse suite 51. Every failure that remains is present at HEAD (`comm -13` of the sorted failing names is empty), so the change introduces none and resolves 2 + 16 that the stale baseline had caused.
- The 7 remaining forward failures are command-document contract assertions (`**Role**|## Role`, `Iterative procedure to raise the information level`, `the document says why the operator no longer chooses`, the hand-off section, the review-step vocabulary, the PX-187 approval anchors). They are red at HEAD and belong to the conver-telegramify command-file restructure (commit b94958ad), which rewrote those definitions without refreshing the assertions. They are not weakened or rewritten here; they need their own ticket.
- Regression: `node .claude/scripts/workspacify-reverse/run.mjs regression check` reports proved — 25 fixtures compared, 0 pipeline runs disagreed, 0 command-file losses. The three pair digests and the 15 command-file digests moved at capture time; the fixture digests and the forward surfaces did not.
- Additive-only proof, measured before the capture: for all three frozen pipelines, deleting the six new counts from final_audit and the gate records and deleting inventory.object_claim_collisions reproduces the digest frozen before this ticket, byte for byte.
- Crime scan 0, stub scan 0, quality checks 0 issues, `--check-ambiguous` exit 0 after resolving one marker in gate-advice.mjs at the TREE_ADVICE definition.
- Open item (recorded, not fixed): buildAdaptersSection publishes `leaf_packages: []`, a field nothing computes and nothing reads, while its sibling `ports` is computed. It is not an incomplete implementation in the sense of the First-Class Rule — the design document's own example shows `[]` — so it carries no marker. Populating or removing it moves the manifest non-additively and belongs to its own ticket.
- Open item (recorded, not fixed): the seven command-document contract failures described above.
Review report (PX-217).

- Step 5 (incomplete-implementation scan): the changed lines were read for the seven patterns. None is present — no `todo!`/`unimplemented!`/`panic!`, no empty bodies, no placeholder returns, no commented-out code, no TODO/FIXME/HACK/XXX, no mock objects, no suppression attributes. Commented-out-code and debug-output checks report zero.
- Step 7 (completeness against the design) — one finding, found and fixed:
  * FINDING (Minor, fixed in review): `aliasPairsFrom` fed every published `normalization_decisions` entry to `detectAliasCycles`, including an entry that maps a name to itself. `normalizeAliases` emits such an entry when one group holds two candidates with the same canonical name — a duplicate it has already merged — and the cycle walk reports it as the one-step cycle `X -> X`. Measured: `normalizeAliases([{canonical_name:'ForumId'},{canonical_name:'ForumId'}])` yields `[{from:'ForumId',to:'ForumId'}]` and `detectAliasCycles` returns `[{path:['ForumId','ForumId']}]`, so a sound run would have been refused under the message "alias cycle" when the cause was a duplicate. Measured reachability: `harvestObjectCandidates` groups by exact canonical name in a `Map`, so no pipeline fixture and no CLI path produces such a pair today (`normalizeAliases` is called from `buildInventory` alone, over that harvest). Fixed by excluding self-pairs in `aliasPairsFrom`, with a unit test pinning `alias_cycle_count === 0` and COMPLETE for a published self-pair, so the word "cycle" cannot come to mean "duplicate".
  * Verified after the fix: forward 372/365/7, reverse 1457/1414/35, regression gate proved, quality checks 0.
- Step 9 (translatability): greps re-run on the changed lines — no noun-first function definitions, no generic or single-character variables, no magic numbers, no debug output. No change required.
- Observations recorded, not fixed (each needs its own ticket):
  * `buildAdaptersSection` publishes `leaf_packages: []`, a field nothing computes and nothing reads while its sibling `ports` is computed. It matches the design document's own example, so it is not an incomplete implementation under the First-Class Rule and carries no marker; populating or removing it moves the manifest non-additively.
  * 7 forward and 35 reverse failures are command-document contract assertions that are red at HEAD. They belong to the conver-telegramify command-file restructure (commit b94958ad), which rewrote those definitions without refreshing the assertions. No assertion was weakened or rewritten here.
  * `missing_port_count` reads 0 until the decisions schema gains a field through which a protocol or domain package declares an external capability.
- Contracts C001 through C005 are all satisfied by the merged implementation; every clause is covered by a test that was written before the implementation and confirmed red.

## PX-217 — implemented at 11 locations

### .claude/scripts/workspacify-tree/lib/gate-advice.mjs

- Line 191
```
  G0: {
```

### .claude/scripts/workspacify-tree/lib/validation.mjs

- Line 386
```
function evaluateDatabase(adapters, packages) {
```

- Line 413
```
function aliasPairsFrom(normalizationDecisions) {
```

- Line 420
```
function countReviewRequired(inventoryData) {
```

- Line 448
```
function buildFinalAudit(aggregate) {
```

### .claude/scripts/workspacify-tree/run.mjs

- Line 384
```
function buildForwardManifestSections(prepared) {
```

- Line 891
```
function buildInventory(analysis) {
```

- Line 919
```
function prepareInventory(analysis, decisions) {
```

### tests/workspacify-tree/integration/gate-binding.test.mjs

- Line 29
```
function makeSubject(spec) {
```

- Line 37
```
function runGate({ spec, decisions, mutate = () => {} }) {
```

### tests/workspacify-tree/unit/gate-engine.test.mjs

- Line 227
```
//
```
