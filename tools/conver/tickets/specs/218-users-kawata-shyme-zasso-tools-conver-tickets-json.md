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

# Target ticket is PX-218: The stage-2 WIG requires only what stage 1 declared: a proof verifier is demanded where the boundary scope declares one, and the forbidden layer rules are read as the pairs they are

**Ticket Key**: PX-218 · **Phase**: -1

---

## Background

- [Goal] Make the stage-2 workspace integration graph satisfiable for a manifest that stage 1 certified. The proof-verifier requirement is read from the boundary's declared `stage2_contract_scope` and from nothing else, and `forbidden_layer_rules` is evaluated on the declared pairs rather than on reachability, so a certified workspace reaches `G5:PASS` and is publishable.
- [Purpose] Both defects live in one file and are one function each, so the correction is small. What it restores is the property that a gate rejects only what the design forbids: an unsatisfiable predicate rejects every payload including every correct one, and a gate that rejects everything catches nothing.
- [Motivation] A 28-package workspace with 31 spec segments, 82 normal edges, 82 boundaries, 11 waves and 1,301 owned inventory items was authored, passed G0 through G4, and stopped at G5 on two checks no authored payload can satisfy. `proof_lifecycle_break` demands a `proof_verification` clause for a boundary whose declared scope does not contain it, while the contract validator refuses that clause as out of scope in the very same run; `forbidden_semantic_flow_path` reads the policy's layer *pairs* as reachability, so the canonical `interfaces -> core -> protocol` composition is a violation even though stage 1 audits the same table pair by pair and certified the manifest with `layer_violation_count: 0`. The convergence cost of the payload is already paid and it must not be re-authored.
- [Constraints] The manifest, the specification, the seeds and the contracts are locked inputs and are not touched. The clause vocabulary already separates `signature` from `proof_verification`, so the repair stops inferring one from the other rather than widening the vocabulary. Both violation classes keep their names, their detail strings and their triggers for the cases the design does forbid. Neither an allow-list, an environment flag nor a `--skip` option may route around either check.

## Scope

- - `.claude/scripts/workspacify-allocate/lib/wig.mjs` | modify | `declaresClause` (lines 133-138): the second disjunct `(clause === 'proof_verification' && scope.includes('signature'))` is removed, so the boundary's declared scope is the whole requirement. It was a rule the scope table does not express and `validateContractEdge` refuses (`contract-model.mjs:118` -> `outOfScopeClauses` -> `seed-local-checks.mjs:84` -> G3), which made the predicate unsatisfiable for the one `typed_protocol_input` boundary | before: `return scope.includes(clause) || (clause === 'proof_verification' && scope.includes('signature'));` | after: `return scope.includes(clause);` | api: none, module-private function | schema: none | config: none | dep: none
- - `.claude/scripts/workspacify-allocate/lib/wig.mjs` | modify | `findForbiddenFlows` (lines 181-215): the consumer->provider adjacency walk is replaced by a direct evaluation of each declared rule against each edge's two endpoint layers. `forbidden_layer_rules` declares pairs (`workspace-model.mjs:24`: "Layer pairs forbidden by 11.2 (target layer per source layer)"), and stage 1 audits the same table pair by pair (`dag.mjs:96-113` -> `violatesLayerRule` at `dag.mjs:192`, which compares the two endpoints' layers and nothing else). Reading it as reachability flags every composition that routes a higher layer through its mediator | before: `nodeById` + `adjacency` + a `stack`/`visited` DFS returning the first reachable path | after: a filter over `graph.edges` comparing `layerByPackage.get(consumer_package)` to `rule.from_layer` and `layerByPackage.get(provider_package)` to `rule.forbidden_to`, pushing the two-element pair, still `slice(0, 1)`, so the caller at `wig.mjs:107-109` is unchanged | api: none | schema: none | config: none | dep: none
- - `.claude/scripts/workspacify-allocate/lib/wig.mjs` | modify | the doc comment above `findForbiddenFlows` states the rule and the reason, so the next reader does not restore the walk. `declaresClause`'s comment likewise gains the why | before: `/** A reachable path from a forbidden source to a forbidden target. */` and `/** Whether stage 1 declared this clause for the contract's boundary. */` | after: comments naming `forbidden_layer_rules` as declared pairs, naming the mediated composition a reachability reading would wrongly reject, and naming the validator that refuses the inferred clause | api: none | schema: none | config: none | dep: none
- - `.claude/scripts/workspacify-allocate/lib/wig.mjs` | modify | the provenance annotation gains PX-218 beside PX-194 and PX-196, applied by `annotate-ticket-context-by-git-diff.js` rather than by hand, because the annotator attributes the branch's changes and `--verify` reads the line directly above each definition | before: `// [::TICKET::] PX-194, PX-196 changes. ...` | after: the same line with PX-218 added | api: none | schema: none | config: none | dep: none
- - `tests/workspacify-allocate/unit/wig.test.mjs` | modify | the D1 cases are added: a `typed_protocol_input` boundary whose contract carries exactly `buildBoundaryContractScope('typed_protocol_input')` yields no violation (RED today: `proof_lifecycle_break`); the same boundary with a `proof_verification` clause added yields no `proof_lifecycle_break` while `validateContractEdge` for that edge returns `outOfScopeClauses === ['proof_verification']`, which is the two halves of the contradiction asserted together; a boundary whose scope names `proof_verification` with the clause omitted still fails, and with it present still passes; a scope naming `tests` with the clause empty still raises `missing_test_obligation`; and the real `boundary-036` scope array from the defect report is encoded literally as one more fixture | before: the file covers `missing_test_obligation` and the proof obligation only for a scope that already names `proof_verification` | after: the declared-scope rule and both halves of the contradiction are covered | api: none | schema: none | config: none | dep: none
- - `tests/workspacify-allocate/unit/wig.test.mjs` | modify | the D2 cases are added: nodes `i` (interfaces), `c` (core), `p` (protocol) with edges `i->c`, `c->p` and the `interfaces` rule yield `ok === true` (RED today: `forbidden_semantic_flow_path`); the same nodes plus a direct `i->p` edge still fail; the same mediated fixture with `forbidden_layer_rules` empty passes; `c->a` with `a` an adapter under the `core` rule fails with both `layer_violation` and `forbidden_semantic_flow_path`; and the pre-existing `px194-branch-coverage.test.mjs` fixture (`protocol` forbidding `protocol` over the default edge) still fires, because that edge is itself a direct forbidden pair | before: no test named `forbidden_semantic_flow_path` in `wig.test.mjs`; the only coverage is one incidental direct pair in `px194-branch-coverage.test.mjs:120-123` | after: mediated, direct, empty-rule and dual-class cases are covered | api: none | schema: none | config: none | dep: none
- - `tests/workspacify-allocate/unit/wig.test.mjs` | modify | the file annotation line gains PX-218 beside PX-194 | before: `// [::TICKET::] PX-194 changes. ...` | after: the same line with PX-218 added, applied by the annotator | api: none | schema: none | config: none | dep: none
- - `/Users/kawata/shyme/gaia/.claude` | resync | the installed copy carries the repaired `workspacify-allocate/lib/wig.mjs`. `install.js` is the sanctioned propagation mechanism (digest-based; a file the user changed is preserved and named, a file that differs only because conver moved on is updated — and the copy is byte-identical to the pre-repair source, so it is the latter). Without this the end-to-end run reproduces the documented failure unchanged | before: `wig.mjs` sha256 `edc3ac78...` in the installed copy | after: the repaired revision, equal to the source of record | api: none | schema: none | config: none | dep: none
- - `.claude/scripts/workspacify-tree/lib/contract-clauses.mjs` | NOT changed | the `typed_protocol_input` row keeps `signature` without `proof_verification`. The alternative repair (defect report 4.8) would add `proof_verification` here, but that widens the clause vocabulary for a boundary that does not verify a proof, and it forces stage 1 to be re-gated and the 7.8 MB manifest re-hashed, invalidating the certified record the authored payload is pinned to. The scope table already expresses the distinction the check needs, so the check is what is wrong | why: the vocabulary is the design's own statement of what a boundary must say; changing it to satisfy a checker inverts the dependency | api: none | schema: none | config: none | dep: none
- - `.claude/scripts/workspacify-allocate/lib/contract-model.mjs` | NOT changed | `validateContractEdge`'s `outOfScopeClauses` refusal and the five core clauses stay exactly as they are. The repair's whole point is that the scope decides, not that a check disappears: the refusal is the half of the contradiction that is correct | why: weakening it would make the WIG's inferred clause satisfiable and hide the defect instead of fixing it | api: none | schema: none | config: none | dep: none
- - `/Users/kawata/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json` and `/Users/kawata/shyme/gaia/workspacify/allocate/DECISIONS.json` | NOT changed | the locked stage-1 record (self-hashed, `final_audit` certified) and the 2.3 MB authored payload of 28 seeds and 164 contract sides are inputs to the verification, never targets of it. Editing the manifest breaks G0's self-hash and destroys the provenance of every seed; the payload is the only complete copy and is never moved, only copied when a backup is needed | why: the defect is in the checker, so the checked artefact must stay exactly as the failing run had it — otherwise the repair is unproven | api: none | schema: none | config: none | dep: none
- - `/workspacify-allocate` gate and finalize | downstream consumer | the G5 verdict and everything after it. A workspace that stopped at `{"status":"FAIL","gateId":"G5"}` now reaches `{"status":"COMPLETE", gateSummary "G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS semantic:APPROVED"}` and `finalize` publishes. `contract-bilateral` (G4) is untouched; the WIG's published summary keeps the same shape (`node_count`, `edge_count`, `by_connection_kind`, `by_layer`) and the same hash construction | nature: the gate's rejection set narrows by exactly the two unsatisfiable predicates and by nothing else | response: no change needed in any downstream stage; the published allocate manifest already records `wig.violations` as an empty list
- - the stage-1 contract vocabulary and the compiled layer table | upstream contract | `CONTRACT_CLAUSES`, `CORE_CONTRACT_CLAUSES`, `CLAUSES_BY_CONNECTION_KIND`, `LAYER_FORBIDDEN_TARGETS` and `PRODUCTION_KINDS` are read by the repaired code and are not modified by it. The repaired `declaresClause` reads `stage2_contract_scope` directly; the repaired `findForbiddenFlows` reads `forbidden_layer_rules` from the manifest, so both stay manifest-driven and neither hardcodes a layer name or a clause name | nature: read-only dependency, widened by nothing | response: none

## Implementation Target Files

- `.claude/scripts/workspacify-allocate/lib/wig.mjs`
- `tests/workspacify-allocate/unit/wig.test.mjs`

## Investigation

Read and confirmed against this working tree; every SHA-256 the defect report records for its five cited files matches, so the report describes this exact revision.

D1, `proof_lifecycle_break` (unsatisfiable). `wig.mjs:137` reads `return scope.includes(clause) || (clause === 'proof_verification' && scope.includes('signature'));` - an implication the scope table does not express. `contract-clauses.mjs:46-54` gives `typed_protocol_input` the scope `['errors','canonicalization','signature','tests']` on top of the five core clauses (`CORE_CONTRACT_CLAUSES` at `contract-clauses.mjs:34-40`: input, output, preconditions, postconditions, invariants), and gives `proof_verification` both `signature` and `proof_verification`. The validator refuses the inferred clause: `contract-model.mjs:118` computes `outOfScopeClauses = clauseNames.filter((clause) => CONTRACT_CLAUSES.includes(clause) && !declaredScope.includes(clause))`, `validateContractEdge` folds it into `ok` (contract-model.mjs:150-156), `validateSeedContractEdges` turns it into the message `declares the out-of-scope clause "proof_verification"` (contract-model.mjs:187-189), and `seed-local-checks.mjs:79-84` pushes it into the seed's errors, which G3 reports. Boundary-036 is the workspace's only `typed_protocol_input` edge, so omitting the clause fails G5 and adding it fails G3. The existing coverage in `tests/workspacify-allocate/unit/wig.test.mjs:84-116` only exercises a scope that already names `proof_verification`, so it never reaches the contradiction and stays green under the repair.

D2, `forbidden_semantic_flow_path` (reachability where pairs are declared). `wig.mjs:181-215` builds consumer->provider adjacency and runs a DFS from each package whose layer equals `rule.from_layer` to any package whose layer is in `rule.forbidden_to`, returning the first reachable path. The manifest's field declares pairs: `workspace-model.mjs:24` carries the doc comment `Layer pairs forbidden by 11.2 (target layer per source layer)` over `LAYER_FORBIDDEN_TARGETS`, and stage 1 audits the same table edge by edge in `dag.mjs:96-113`, calling `violatesLayerRule(fromPackage, toPackage)` at `dag.mjs:192-201`, which compares the two endpoints' layers and nothing else. A manifest certified with `layer_violation_count: 0` can therefore still be rejected by stage 2. In the reported workspace the `interfaces` row is the only one with transitive hits (all three interface packages, each via `core -> protocol`), because `interfaces -> core` and `core -> protocol` are both permitted pairs; the mediated composition is the design's normal shape, not a violation.

Existing coverage that the repair must not break: `tests/workspacify-allocate/unit/px194-branch-coverage.test.mjs:120-123` sets `forbidden_layer_rules: [{from_layer:'protocol', forbidden_to:['protocol']}]` over the default `pkg-b -> pkg-a` edge. That edge is itself a direct forbidden pair (both endpoints are layer `protocol`), so it still fires under the pair reading; the test needs no modification. `grep -rn forbidden_layer_rules tests/` finds no other non-empty rule list in the allocate suite.

Test surface: `tests/workspacify-allocate/run-tests.mjs` collects `*.test.mjs` under the suite root via `../lib/test-discovery.mjs` and runs them with `node --test`; `make test-workspacify` runs that plus the tree runner. Baseline measured in this tree before any change: 268 passing, 4 failing, all four in `unit/self-grill.test.mjs` and all about sentences of `.claude/commands/workspacify-allocate.md` that the file no longer contains. Fixture helpers available and reused: `buildValidManifest`, `makeDecisions`, `defaultClausesForScope`, `contractEdgesForPackage` and `materializeSeedFixture` in `tests/workspacify-allocate/helpers/build-valid-manifest.mjs`, plus `buildContractEdge` and `validateContractEdge` in the module under test.

External inputs for the end-to-end verification, confirmed present: `/Users/kawata/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json` (7,801,956 bytes), `/Users/kawata/shyme/gaia/workspacify/allocate/DECISIONS.json` (2,359,583 bytes) and the installed copy at `/Users/kawata/shyme/gaia/.claude/scripts/workspacify-allocate/lib/wig.mjs`, whose sha256 equals the source of record's (`edc3ac78...`) - which is why the repair must be propagated before the run, and why the installer will classify it as moved-on rather than locally modified.


Plan-stage measurement (2026-09-18). Both predicates were measured rather than assumed before the plan was committed. A repaired copy of the module was built outside the tree with exactly the two edits the plan specifies, and every planned fixture was run against both the current module and that repaired copy, comparing the observed classes with the classes the plan predicts. Result: D1.1 and D2.1 are red today (proof_lifecycle_break on the nine-clause typed_protocol_input scope; forbidden_semantic_flow_path on i -> c -> p) and green under the repair. D1.3, D2.2, D2.4 and the PX-194 protocol -> protocol fixture are green on both sides, so they are regression guards rather than Red tests. D1.4 moves from two classes to exactly one (missing_test_obligation). D2.3 is unchanged. The literal boundary-036 scope array deep-equals buildBoundaryContractScope('typed_protocol_input'), which is what makes the fixture the real shape and what repair path 4.8 would break. The measurement found and corrected one plan defect: contractEdgesForPackage derives a contract's clauses FROM the declared scope, so a case needing the scope to declare a clause while the contract omits it is vacuous unless the clause is deleted explicitly - D1.3 and C001's invariant fixture both needed an omitClauses deletion, and without it D1.3 passed on both sides and proved nothing.

## Acceptance Criteria

- Happy path: the repaired `runGraphViolations` returns `ok === true` for a boundary whose declared `stage2_contract_scope` is `buildBoundaryContractScope('typed_protocol_input')` with a contract carrying exactly that scope, and for the mediated `i -> c -> p` fixture under the `interfaces` rule - the two cases that were red. Verified by `node tests/workspacify-allocate/run-tests.mjs` with the new cases green.
- Error case: `ok === false` is still returned, with the class name and detail unchanged, for a boundary whose scope names `proof_verification` while the contract omits it (`proof_lifecycle_break`), for a contract leaving a declared `tests` clause empty (`missing_test_obligation`), for a direct `i -> p` edge under the `interfaces` rule (`forbidden_semantic_flow_path`), and for a `c -> a` edge under the `core` rule (`layer_violation` and `forbidden_semantic_flow_path`). No class loses its trigger.
- Edge case: the locked inputs are provably untouched and the gate is provably unblocked on the real workspace. `validate` on `/Users/kawata/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json` still returns `PASS` with `manifestHash 166ec8ab...`, then `gate` returns `{"status":"COMPLETE", gateSummary "G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS semantic:APPROVED"}` in place of the recorded `{"status":"FAIL","gateId":"G5"}`, and `finalize` publishes 37 directories, 28 seeds and 82 contracts with `wig.violations` empty, `segmentCoverage 29/31` and `source_coverage.uncovered` empty.

## Invariants

- [Normal establishment] For every graph edge E and every clause name c, the WIG requires c of E only when the boundary that declares E names c in `stage2_contract_scope`. The set of clauses the WIG demands is therefore a subset of the set `validateContractEdge` permits, so no edge can be required to carry a clause and refused for carrying it in the same run.
- [Invariant on error] A violation is reported for exactly the pairs the manifest forbids and the scopes the manifest declares. Removing a report never removes a class: `layer_violation`, `missing_test_obligation`, `forbidden_edge`, `undeclared_edge`, `reverse_edge`, `self_loop`, `unknown_package`, `duplicate_contract_id`, `cycle`, `owner_collision`, `state_mutation_conflict` and `side_effect_race` keep their triggers, their names and their detail shape.
- [Internal state invariant] Both repaired functions are pure: they read `graph.nodes`, `graph.edges` and `manifest`, and mutate none of them. `runGraphViolations` stays a single pass over the edges in the same order, so the violation list and the canonical graph hash remain deterministic for one input.
- [Boundary condition] With `forbidden_layer_rules` empty the forbidden-flow check reports nothing under either reading. With a boundary scope naming neither `signature` nor `proof_verification` the proof check stays silent. A scope that names `proof_verification` while the contract omits it still fails.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — INFO002 section 4.7 - wig.mjs declaresClause (lines 133-138), consumed by runGraphViolations at wig.mjs:88 (G5 proof_lifecycle_break)

- **Precondition**: A boundary B declares `stage2_contract_scope` S, an array of clause names drawn from `CONTRACT_CLAUSES`. A graph edge E carries `contract_id` equal to `'contract-' + B.id` and a clause map C whose keys are clause names and whose values are non-empty strings or non-empty arrays. `runGraphViolations` is called with `{graph, manifest}` where graph.edges contains E and manifest.dependencies.boundaries contains B.
- **Postcondition**: `runGraphViolations({graph, manifest}).violations` contains an entry `{class: 'proof_lifecycle_break', contract_id: E.contract_id}` if and only if `'proof_verification'` is in S and C has no non-empty `proof_verification` entry. The entry's `detail` is `the contract requires proof semantics but names no verifier`.
- **Invariant**: For every E, the set of clause names the WIG requires of E is a subset of the scope S that B declares. No requirement may be derived from a clause name that S does not contain. Equivalently: `validateContractEdge(E, B).outOfScopeClauses` is empty for every E that the WIG accepts.

### C002 — INFO002 section 4.7 rationale 2 and 3 - the obligation the check is named for stays enforced (regression half of C001)

- **Precondition**: A boundary B declares S such that `'proof_verification'` is in S, and edge E carries C with no non-empty `proof_verification` entry. Separately, a boundary B2 declares S2 containing `'tests'`, and edge E2 carries C2 whose `tests` entry is absent or the empty array.
- **Postcondition**: `proof_lifecycle_break` is reported for E, and `missing_test_obligation` is reported for E2. Both entries keep their `contract_id` and `boundary_id` fields and their existing detail strings.
- **Invariant**: The two obligations are reported for exactly those boundaries whose declared scope names them. The count of boundaries whose scope names `proof_verification` is unchanged by the repair, and no boundary whose scope omits it is reported.

### C003 — INFO002 section 5.5 - wig.mjs findForbiddenFlows (lines 181-215), consumed by runGraphViolations at wig.mjs:107-109 (G5 forbidden_semantic_flow_path)

- **Precondition**: `manifest.dependencies.forbidden_layer_rules` is a list of objects `{from_layer, forbidden_to: string[]}`. `graph.nodes` carries `{package_id, layer}` per package and `graph.edges` carries `{consumer_package, provider_package}` per edge. Every node referenced by an edge is in `graph.nodes`.
- **Postcondition**: For each rule r and each edge `(u, v)` with `layer(u) === r.from_layer` and `layer(v)` in `r.forbidden_to`, a violation is produced with `class: 'forbidden_semantic_flow_path'`, `package_id: u` and `detail` beginning `forbidden semantic flow: u -> v`. The result is truncated by the existing `slice(0, 1)`, so at most one such violation is reported.
- **Invariant**: Reachability does not decide the report. A path `u -> m -> v` with `layer(u) === r.from_layer`, `layer(v)` in `r.forbidden_to` and `layer(m)` not in `r.forbidden_to` for u produces no violation. Conversely, removing an intermediate package from such a path does not suppress a report that the pair itself warrants.

### C004 — INFO002 section 5.6 - what must still fail after the fix, and section 5.5's rejected alternative (delete the check and rely on layer_violation)

- **Precondition**: An edge `(u, v)` exists whose two endpoint layers are a declared forbidden pair, either through `forbidden_layer_rules` or through the compiled `LAYER_FORBIDDEN_TARGETS` (`workspace-model.mjs:25-32`), or whose consumer kind is in `PRODUCTION_KINDS` while its provider kind is `conformance`.
- **Postcondition**: `ok === false`. `forbidden_semantic_flow_path` is present whenever the manifest declares the pair; `layer_violation` is present whenever the compiled table or the production-to-conformance ban forbids it; both are present when both hold. Neither class is removed or renamed.
- **Invariant**: No violation class loses its trigger: `unknown_package`, `self_loop`, `duplicate_contract_id`, `undeclared_edge`, `reverse_edge`, `forbidden_edge`, `layer_violation`, `cycle`, `owner_collision`, `state_mutation_conflict`, `side_effect_race`, `missing_test_obligation` and `proof_lifecycle_break` each keep at least one triggering fixture in the suite, and the module's `summary` and `hash` outputs keep their shape and construction.

## Boy Scout Rule

- `declaresClause` reads today as an OR of two unrelated rules, and the second disjunct is exactly what makes the requirement unsatisfiable. The repair removes it and leaves a one-line predicate whose doc comment states the whole rule and the reason; the function name already says what it does, so the comment carries only the why - that the validator refuses in the same run what the disjunct demanded.
- `findForbiddenFlows` carried four locals (`nodeById`, `adjacency`, `stack`, `visited`) and a DFS whose purpose was not visible from its name: `flows` reads as reachability, but the manifest declares pairs. The repair deletes the bookkeeping and leaves a filter over the declared rules, so the function reads as its name reads - find the flows the rules forbid - and translates line by line into prose.
- Both are private helpers whose doc comments described a mechanism rather than a rule. Both comments are rewritten to state the rule and the reason, per Everything as Code: the code says what, the comment says why.
- The repaired code names domain concepts (`layerByPackage`, `forbidden_to`, `consumer_package`, `provider_package`, `rule`, `edge`); no generic `tmp`/`data`/`info` is introduced, no layer name or clause name is hardcoded, and no error is swallowed - the functions return lists and the caller raises the violation.
- The tests reuse `buildValidManifest`, `contractEdgesForPackage`, `defaultClausesForScope`, `buildBoundaryContractScope` and `buildContractEdge` rather than restating a fixture shape, so a fixture cannot drift from the real manifest shape, and the new cases are named for the behaviour under test rather than for the ticket.
- Nothing outside the two functions and their test file is touched; the existing 121-line module stays a module, and the test file stays well under the 800-line limit.

## Test Plan

### Unit Tests

- UT: [Normal] C001 - a boundary whose `stage2_contract_scope` is `buildBoundaryContractScope('typed_protocol_input')` (the nine clauses of the defect report Appendix A.1: input, output, preconditions, postconditions, invariants, errors, canonicalization, signature, tests) and whose contract carries exactly that scope yields `runGraphViolations(...).ok === true` with no violation. RED before the repair: `proof_lifecycle_break` is raised for the boundary's contract.
- UT: [Boundary] C001 - the same boundary and scope, with the contract additionally carrying a non-empty `proof_verification` clause, yields no `proof_lifecycle_break`; and for that same edge `validateContractEdge(edge, boundary).outOfScopeClauses` deep-equals `['proof_verification']`. Asserting both halves in one test records that the two rules were mutually exclusive and that the declared scope is the resolution.
- UT: [Invariant] C001 - the required clause set is a subset of the declared scope: for every fixture, each violation of class `proof_lifecycle_break` names a `contract_id` whose boundary's `stage2_contract_scope` contains `proof_verification`. Weakening the check to silence it would fail this assertion.
- UT: [Normal] C002 - a boundary whose declared scope names `proof_verification` and whose contract omits the clause yields `ok === false` with `proof_lifecycle_break`, and the entry's `detail` is the unchanged string `the contract requires proof semantics but names no verifier`. Regression guard: the repair must not weaken the check it narrows.
- UT: [Normal] C002 - the same boundary with a non-empty `proof_verification` clause yields no `proof_lifecycle_break`. This is the pre-existing PX-194 case and it must stay green without modification.
- UT: [Error] C002 - a boundary whose declared scope names `tests` and whose contract leaves `tests` empty (`[]`) yields `ok === false` with `missing_test_obligation`. Regression guard: the sibling obligation in the same code block is untouched.
- UT: [Normal] C001 - the real `boundary-036` record of the defect report, encoded literally (consumer `pkg-0014`, provider `pkg-0001`, `dependency_reason_code` `operation-envelope`, the nine-clause scope above), with a contract carrying exactly that scope, yields no violation. This is the hermetic stand-in for the external manifest and pins the exact shape that failed.
- UT: [Normal] C003 - nodes `i` (layer `interfaces`), `c` (layer `core`), `p` (layer `protocol`), all `kind: 'production-library'`, with edges `i->c` and `c->p` and one rule `{from_layer: 'interfaces', forbidden_to: ['protocol','ports','adapters']}` yields `ok === true`. RED before the repair: the reachability walk reports `forbidden_semantic_flow_path` with the path `i -> c -> p`.
- UT: [Invariant] C003 - on that mediated fixture no violation of class `forbidden_semantic_flow_path` carries `package_id === 'i'`. Reachability through an intermediate package neither creates nor suppresses a report; a path whose endpoints are not a declared forbidden pair is not a violation.
- UT: [Normal] C004 - the same three nodes plus a direct `i->p` edge yields `ok === false` and `violations` contains `forbidden_semantic_flow_path` with `package_id === 'i'`. Regression guard: the repair narrows nothing about direct violations.
- UT: [Boundary] C003 - the mediated fixture with `forbidden_layer_rules` empty yields `ok === true`, unchanged from the pre-repair behaviour; the early return for an empty rule list is preserved.
- UT: [Error] C004 - nodes `c` (layer `core`) and `a` (layer `adapters`) with edge `c->a` and rule `{from_layer: 'core', forbidden_to: ['adapters']}` yields `ok === false` with both `layer_violation` (from the compiled `LAYER_FORBIDDEN_TARGETS`) and `forbidden_semantic_flow_path` (from the manifest's declaration). The two read different sources of truth and both are kept.
- UT: [Normal] C004 - the fixture `px194-branch-coverage.test.mjs:120-123` already uses - the default two-package workspace whose only edge is `pkg-b -> pkg-a`, with rule `{from_layer: 'protocol', forbidden_to: ['protocol']}` - still yields `forbidden_semantic_flow_path`, because that edge is itself a direct forbidden pair. Recorded here because it is the one pre-existing test that touches this path and it must not be modified.
- UT: [Invariant] C004 - no violation class is lost: across the fixtures above, `layer_violation`, `missing_test_obligation`, `forbidden_edge`, `undeclared_edge`, `reverse_edge`, `self_loop`, `unknown_package`, `duplicate_contract_id`, `cycle`, `owner_collision`, `state_mutation_conflict` and `side_effect_race` each still have at least one triggering fixture in the suite.

### Integration Tests

- IT: [integration point] the workspacify-allocate suite - `node tests/workspacify-allocate/run-tests.mjs` (equivalently `make test-workspacify`). It aggregates every `*.test.mjs` under `tests/workspacify-allocate` through `run-tests.mjs` and `lib/test-discovery.mjs`, so the extended `unit/wig.test.mjs` and the untouched `unit/px194-branch-coverage.test.mjs` run in the same process pool as `contract-model`, `contract-gate` and the branch-coverage suites.
- IT: [verification] the repaired `wig.mjs` is exercised through its real consumers, not only through direct calls: `buildIntegrationGraph` -> `buildContractIndex` -> `runBilateralSymmetry` (G4) and `deriveImplementationOrder` -> `verifyOrderAgainstStage1` (G5 order) must all still pass, so the repair cannot have moved the graph's node/edge set or its hash. The suite's failure count must be exactly the pre-existing 4 (the `self-grill.test.mjs` command-document assertions, a separate clobbered-command-file defect recorded in `notes`), and `unit/wig.test.mjs` must contribute zero failures.
- IT: [prerequisites] the installed copy at `/Users/kawata/shyme/gaia/.claude/scripts/workspacify-allocate/lib/wig.mjs` must be advanced to the repaired revision before the end-to-end run: `node install.js -t /Users/kawata/shyme/gaia/.claude`. The copy is byte-identical to the pre-repair source of record, so the installer's digest comparison classifies it as "differs because conver moved on" and updates it. The co-located specification must also still exist at `/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v31.md` and re-hash to `input.source_hash`.
- IT: [verification, external] the real manifest end-to-end: `node .claude/scripts/workspacify-allocate/run.mjs gate /Users/kawata/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json` must leave `{"status":"FAIL","gateId":"G5"}` behind and return `{"status":"COMPLETE","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS semantic:APPROVED"}`. `validate` before it must still report `{"status":"PASS", ..., "gateSummary":"G0:PASS G1:PASS"}` with `manifestHash` still `166ec8ab...`, which proves the locked inputs were not touched. `finalize` then publishes, and the published manifest must report `seedCount 28`, `contractCount 82`, `wig.violations` empty and `segmentCoverage 29/31`. `DECISIONS.json` and the tree manifest are copied to `/tmp` before `finalize`, because `finalize` sweeps the staging directory on success.
- IT: [related tickets] PX-194 (the WIG, its violation classes and its canonical summary/hash - the fixture helpers `buildValidManifest`, `contractEdgesForPackage`, `defaultClausesForScope` and `buildContractScope` are that ticket's and are reused, not restated), PX-196 (the same file's earlier revision), PX-189 (the aggregate runner and `test-discovery.mjs`), PX-217 (the stage-1 gate's own count predicates - the same class of defect one stage upstream, where a predicate did not judge what it computed).

### Exceptions

- IT: [item] the real-manifest end-to-end run of `gate` and `finalize` against `/Users/kawata/shyme/gaia` is executed by hand for this ticket. The automated suite cannot test it because it reads artefacts that live outside the repository and are not reproducible from the tree; this is not a design defect, only an unavailable input.
- IT: [reason] the artefacts are a 7.8 MB stage-1 manifest and a 2.3 MB authored payload of 28 seeds and 164 contract sides - inputs rather than source - so a suite that read them would fail on any machine but this one. This is not a design defect and not an architectural defect: the two predicates are deterministic and fully testable, and the hermetic fixtures do test them. What the suite cannot test is the availability of one particular input file, which is an environment fact rather than a property of the code.
- IT: [alternative verification] the hermetic fixtures assert the same predicates the real run exercises - they encode the nine-clause `boundary-036` scope array of the defect report Appendix A.1 and the `interfaces -> core -> protocol` layer triple, which are the two shapes that failed. `validate` is run first and its unchanged `manifestHash` proves the locked inputs were untouched, and the observed `gate` and `finalize` output is recorded verbatim in the ticket's `changes` field at review time. They cover what the suite cannot test (input availability) without exempting any behaviour from coverage, so no design defect is hidden behind this exception.

### Plan Test Code (concrete code)

- UT: [Normal] C001 - a typed_protocol_input boundary whose contract carries exactly its declared scope yields no violation (RED today: proof_lifecycle_break)
```js
// Shared by every D1 case below. The boundary keeps the default pair (pkg-b -> pkg-a)
// and overrides only the connection kind and the declared scope.
//
// `omitClauses` is load-bearing: contractEdgesForPackage derives the contract's clauses
// FROM the declared scope, so a case that needs the scope to declare a clause while the
// contract omits it must delete it here. Without it D1.3 is vacuous - the clause the
// scope declares is also the clause the contract carries, and nothing is ever reported.
function scopeFixture({ scope, connectionKind = 'value_only', extraClauses = {}, omitClauses = [] }) {
  const { manifest: base } = buildValidManifest();
  const boundaries = [{
    ...base.dependencies.boundaries[0],
    connection_kind: connectionKind,
    stage2_contract_scope: scope,
  }];
  const { manifest } = buildValidManifest({
    dependencies: { ...base.dependencies, boundaries, dag: base.dependencies.dag },
    stage2_handoff: { ...base.stage2_handoff, contract_boundaries: boundaries },
  });
  const edge = contractEdgesForPackage(manifest, 'pkg-b')[0];
  const clauses = { ...edge.clauses, ...extraClauses };
  for (const name of omitClauses) {
    delete clauses[name];
  }
  const contract = buildContractEdge({
    boundaryId: edge.boundary_id,
    sides: { consumer: { packageId: edge.consumer_package }, provider: { packageId: edge.provider_package } },
    relation: { direction: edge.direction, connectionKind: edge.connection_kind },
    content: { owners: edge.owners, clauses, sourceRefs: edge.source_refs },
  });
  const parsedByPackage = new Map([['pkg-b', { contractEdges: [contract] }]]);
  const graph = buildIntegrationGraph({ contractIndex: buildContractIndex({ parsedByPackage, manifest }), manifest });
  return { manifest, boundary: boundaries[0], graph };
}

test('C001 a boundary that declares signature without proof_verification, carrying exactly its scope', () => {
  const { manifest, graph } = scopeFixture({ scope: TYPED_PROTOCOL_SCOPE, connectionKind: 'typed_protocol_input' });
  const report = runGraphViolations({ graph, manifest });
  assert.deepEqual(report.violations, []);
  assert.equal(report.ok, true);
});
```
- UT: [Boundary] C001 - both halves of the contradiction, asserted in one test
```js
const CONTRADICTION_CLAUSE = { proof_verification: 'the verifier is named here (fixture)' };

test('C001 the WIG stops demanding the clause the validator refuses', () => {
  // Half one: the scope declares signature but not proof_verification, and the
  // contract omits the clause. The WIG must stay silent. RED before the repair:
  // declaresClause inferred proof_verification from signature and demanded it.
  const omitted = scopeFixture({ scope: TYPED_PROTOCOL_SCOPE, connectionKind: 'typed_protocol_input' });
  assert.equal(
    runGraphViolations({ graph: omitted.graph, manifest: omitted.manifest })
      .violations.some((entry) => entry.class === 'proof_lifecycle_break'),
    false,
  );

  // Half two: the very clause the pre-repair WIG demanded is refused by the
  // validator as out of scope. Together the two halves are the unsatisfiable pair.
  const carried = scopeFixture({
    scope: TYPED_PROTOCOL_SCOPE,
    connectionKind: 'typed_protocol_input',
    extraClauses: CONTRADICTION_CLAUSE,
  });
  const verdict = validateContractEdge(carried.graph.edges[0].contract, carried.boundary);
  assert.deepEqual(verdict.outOfScopeClauses, ['proof_verification']);
  assert.equal(verdict.ok, false);
});
```
- UT: [Invariant] C001 - the required clause set is a subset of the declared scope
```js
test('C001 every proof_lifecycle_break names a boundary whose scope declares proof_verification', () => {
  // The clause is declared by the scope and deleted from the contract, so exactly one
  // obligation is owed and exactly one is reported.
  const { manifest, graph } = scopeFixture({
    scope: [...TYPED_PROTOCOL_SCOPE, 'proof_verification'],
    omitClauses: ['proof_verification'],
  });
  const report = runGraphViolations({ graph, manifest });

  const breaks = report.violations.filter((entry) => entry.class === 'proof_lifecycle_break');
  assert.equal(breaks.length, 1);
  for (const entry of breaks) {
    const boundary = manifest.dependencies.boundaries.find((item) => `contract-${item.id}` === entry.contract_id);
    assert.ok(boundary, 'the violation names a declared boundary');
    assert.ok(boundary.stage2_contract_scope.includes('proof_verification'));
  }
});
```
- UT: [Normal] C002 - a declared proof obligation is still enforced, with the detail string unchanged
```js
test('C002 a scope naming proof_verification with the clause omitted still raises the obligation', () => {
  const { manifest, graph } = scopeFixture({
    scope: [...TYPED_PROTOCOL_SCOPE, 'proof_verification'],
    omitClauses: ['proof_verification'],
  });
  const report = runGraphViolations({ graph, manifest });

  const entry = report.violations.find((item) => item.class === 'proof_lifecycle_break');
  assert.ok(entry);
  assert.equal(entry.contract_id, 'contract-boundary-001');
  assert.equal(entry.boundary_id, 'boundary-001');
  assert.equal(entry.detail, 'the contract requires proof semantics but names no verifier');
  assert.equal(report.ok, false);
});
```
- UT: [Normal] C002 - the same obligation is silent once the clause is present
```js
test('C002 the same boundary with the clause present raises nothing', () => {
  const { manifest, graph } = scopeFixture({
    scope: [...TYPED_PROTOCOL_SCOPE, 'proof_verification'],
    extraClauses: CONTRADICTION_CLAUSE,
  });
  const report = runGraphViolations({ graph, manifest });
  assert.equal(report.violations.some((entry) => entry.class === 'proof_lifecycle_break'), false);
});
```
- UT: [Error] C002 - the sibling test obligation is the only thing wrong, before and after
```js
test('C002 an empty tests clause raises missing_test_obligation and nothing else', () => {
  // canonicalizeClauses drops an empty list, so the contract reaches the WIG with no
  // tests key at all - the state hasClause reports as absent. The exact-list assertion
  // is the point: before the repair the same fixture also owed a proof_verification
  // clause it could never legally carry, so two classes appeared where one is due.
  const { manifest, graph } = scopeFixture({
    scope: TYPED_PROTOCOL_SCOPE,
    connectionKind: 'typed_protocol_input',
    extraClauses: { tests: [] },
  });
  const report = runGraphViolations({ graph, manifest });
  assert.deepEqual(report.violations.map((entry) => entry.class), ['missing_test_obligation']);
  assert.equal(report.ok, false);
});
```
- UT: [Normal] C001 - the reported boundary-036 scope is exactly what the connection-kind table produces
```js
// boundary-036 of the reported workspace (`pkg-0014 gaia-operation -> pkg-0001
// gaia-foundation`, reason code `operation-envelope`), verbatim from the defect
// report Appendix A.1. Pinning it to the table is what makes the fixture the real
// shape: widening the typed_protocol_input row (repair path 4.8) breaks this line.
const BOUNDARY_036_SCOPE = [
  'input', 'output', 'preconditions', 'postconditions', 'invariants',
  'errors', 'canonicalization', 'signature', 'tests',
];
const TYPED_PROTOCOL_SCOPE = buildBoundaryContractScope('typed_protocol_input');

test('C001 the real boundary-036 scope is the typed_protocol_input scope, and passes the WIG', () => {
  assert.deepEqual(BOUNDARY_036_SCOPE, TYPED_PROTOCOL_SCOPE);

  const { manifest, graph } = scopeFixture({
    scope: BOUNDARY_036_SCOPE,
    connectionKind: 'typed_protocol_input',
  });
  assert.equal(runGraphViolations({ graph, manifest }).ok, true);
});
```
- UT: [Normal] C003 - a forbidden target reachable only through an intermediate package is not a violation (RED today: forbidden_semantic_flow_path)
```js
// Shared by every D2 case below.
const LAYER_PACKAGES = [
  { id: 'i', name: 'interfaces-pkg', path: 'crates/interfaces/i', layer: 'interfaces', kind: 'production-library', responsibilities: ['project the core operations'], seed_required: true, owns: {} },
  { id: 'c', name: 'core-pkg', path: 'crates/core/c', layer: 'core', kind: 'production-library', responsibilities: ['own the core records'], seed_required: true, owns: {} },
  { id: 'p', name: 'protocol-pkg', path: 'crates/protocol/p', layer: 'protocol', kind: 'production-library', responsibilities: ['own the protocol records'], seed_required: true, owns: {} },
  { id: 'a', name: 'adapter-pkg', path: 'crates/adapters/a', layer: 'adapters', kind: 'production-library', responsibilities: ['adapt the protocol records'], seed_required: true, owns: {} },
];
const INTERFACES_RULE = [{ from_layer: 'interfaces', forbidden_to: ['protocol', 'ports', 'adapters'] }];

function layerFixture({ edges, forbiddenLayerRules }) {
  const { manifest: base } = buildValidManifest();
  const boundaries = edges.map((edge, index) => ({
    id: `boundary-${String(index + 1).padStart(3, '0')}`,
    consumer_package: edge.from,
    provider_package: edge.to,
    dependency_reason_code: edge.reasonCode ?? 'canonical-object',
    connection_kind: 'value_only',
    stage2_contract_scope: buildBoundaryContractScope('value_only'),
  }));
  const { manifest } = buildValidManifest({
    workspace: { ...base.workspace, packages: LAYER_PACKAGES },
    dependencies: {
      ...base.dependencies,
      normal_edges: edges,
      boundaries,
      forbidden_layer_rules: forbiddenLayerRules,
      dag: runDagChecks({ packages: LAYER_PACKAGES, edges }),
    },
    stage2_handoff: { ...base.stage2_handoff, contract_boundaries: boundaries },
  });
  const parsedByPackage = new Map(LAYER_PACKAGES.map((pkg) => [pkg.id, {
    contractEdges: contractEdgesForPackage(manifest, pkg.id).map((edge) => buildContractEdge({
      boundaryId: edge.boundary_id,
      sides: { consumer: { packageId: edge.consumer_package }, provider: { packageId: edge.provider_package } },
      relation: { direction: edge.direction, connectionKind: edge.connection_kind },
      content: { owners: edge.owners, clauses: edge.clauses, sourceRefs: edge.source_refs },
    })),
  }]));
  return { manifest, graph: buildIntegrationGraph({ contractIndex: buildContractIndex({ parsedByPackage, manifest }), manifest }) };
}

test('C003 interfaces reaching protocol through core is the design composition, not a violation', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'i', to: 'c' }, { from: 'c', to: 'p' }],
    forbiddenLayerRules: INTERFACES_RULE,
  });
  const report = runGraphViolations({ graph, manifest });
  assert.deepEqual(report.violations, []);
  assert.equal(report.ok, true);
});
```
- UT: [Invariant] C003 - reachability does not decide the report
```js
test('C003 the mediated path creates no report keyed to the source package', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'i', to: 'c' }, { from: 'c', to: 'p' }],
    forbiddenLayerRules: INTERFACES_RULE,
  });
  const flows = runGraphViolations({ graph, manifest }).violations
    .filter((entry) => entry.class === 'forbidden_semantic_flow_path');
  assert.deepEqual(flows, []);
  assert.equal(flows.some((entry) => entry.package_id === 'i'), false);
  // The pair that the walk used to reach through is still permitted on its own terms.
  assert.equal(INTERFACES_RULE[0].forbidden_to.includes('core'), false);
});
```
- UT: [Normal] C004 - a direct forbidden pair is still reported
```js
test('C004 a direct interfaces -> protocol edge is reported', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'i', to: 'c' }, { from: 'c', to: 'p' }, { from: 'i', to: 'p' }],
    forbiddenLayerRules: INTERFACES_RULE,
  });
  const report = runGraphViolations({ graph, manifest });
  assert.equal(report.ok, false);
  const entry = report.violations.find((item) => item.class === 'forbidden_semantic_flow_path');
  assert.ok(entry);
  assert.equal(entry.package_id, 'i');
  assert.equal(entry.detail, 'forbidden semantic flow: i -> p');
  assert.ok(report.violations.some((item) => item.class === 'layer_violation'));
});
```
- UT: [Boundary] C003 - an empty rule list reports nothing, unchanged from before the repair
```js
test('C003 no declared rules means no forbidden flow', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'i', to: 'c' }, { from: 'c', to: 'p' }],
    forbiddenLayerRules: [],
  });
  const report = runGraphViolations({ graph, manifest });
  assert.deepEqual(report.violations, []);
  assert.equal(report.ok, true);
});
```
- UT: [Error] C004 - the compiled table and the manifest declaration both fire on core -> adapters
```js
test('C004 core -> adapters is reported by both sources of truth', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'c', to: 'a' }],
    forbiddenLayerRules: [{ from_layer: 'core', forbidden_to: ['adapters'] }],
  });
  const report = runGraphViolations({ graph, manifest });
  assert.equal(report.ok, false);
  // layer_violation reads LAYER_FORBIDDEN_TARGETS; forbidden_semantic_flow_path reads
  // the manifest's declaration. Keeping both means a manifest whose rules were
  // narrowed is still caught by the compiled table.
  assert.ok(report.violations.some((entry) => entry.class === 'layer_violation'));
  assert.ok(report.violations.some((entry) => entry.class === 'forbidden_semantic_flow_path'));
});
```
- UT: [Normal] C004 - the pre-existing PX-194 fixture is a direct forbidden pair and keeps firing without modification
```js
test('C004 the PX-194 protocol -> protocol rule still fires on the default edge', () => {
  // This replicates tests/workspacify-allocate/unit/px194-branch-coverage.test.mjs:120-123,
  // which must not be edited: its edge pkg-b -> pkg-a has layer protocol at both ends,
  // so it is itself a declared forbidden pair under either reading of the rules.
  const { manifest, index } = fixture();
  const graph = buildIntegrationGraph({ contractIndex: index, manifest });
  const flowManifest = {
    ...manifest,
    dependencies: { ...manifest.dependencies, forbidden_layer_rules: [{ from_layer: 'protocol', forbidden_to: ['protocol'] }] },
  };
  const report = runGraphViolations({ graph, manifest: flowManifest });
  assert.ok(report.violations.some((entry) => entry.class === 'forbidden_semantic_flow_path'));
  assert.equal(report.ok, false);
});
```
- UT: [Invariant] C004 - the repair narrows two classes and removes none
```js
test('C004 the four classes that share the repaired code paths all still fire', () => {
  const proof = scopeFixture({
    scope: [...TYPED_PROTOCOL_SCOPE, 'proof_verification'],
    omitClauses: ['proof_verification'],
  });
  assert.ok(runGraphViolations({ graph: proof.graph, manifest: proof.manifest })
    .violations.some((entry) => entry.class === 'proof_lifecycle_break'));

  const noTests = scopeFixture({
    scope: TYPED_PROTOCOL_SCOPE,
    connectionKind: 'typed_protocol_input',
    extraClauses: { tests: [] },
  });
  assert.ok(runGraphViolations({ graph: noTests.graph, manifest: noTests.manifest })
    .violations.some((entry) => entry.class === 'missing_test_obligation'));

  const direct = layerFixture({
    edges: [{ from: 'i', to: 'p' }],
    forbiddenLayerRules: INTERFACES_RULE,
  });
  assert.ok(runGraphViolations({ graph: direct.graph, manifest: direct.manifest })
    .violations.some((entry) => entry.class === 'forbidden_semantic_flow_path'));
  assert.ok(runGraphViolations({ graph: direct.graph, manifest: direct.manifest })
    .violations.some((entry) => entry.class === 'layer_violation'));
});
```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| declaresClause returned `scope.includes(clause) || (clause === 'proof_verification' && scope.includes('signature'))` - an inference of a proof obligation from a signature obligation that the scope table does not express and that validateContractEdge refuses as out of scope in the same run. | declaresClause returns `scope.includes(clause)`. The boundary's declared stage2_contract_scope is the whole requirement. | wig.mjs (D1). The one `typed_protocol_input` boundary in the reported workspace declares `signature` without `proof_verification`, so the old predicate demanded a clause the contract validator rejected: omitting it failed G5, writing it failed G3. It now demands exactly what the scope names, and the obligation it is named for still fires for every boundary whose scope declares `proof_verification`. |
| findForbiddenFlows built a consumer->provider adjacency and ran a DFS from each package whose layer equalled rule.from_layer, returning the first reachable path to any package whose layer was in rule.forbidden_to. | findForbiddenFlows maps package_id to layer and returns the graph edges whose two endpoints are a declared forbidden pair, still sliced to one report. | wig.mjs (D2). `forbidden_layer_rules` is generated from the compiled LAYER_FORBIDDEN_TARGETS, whose doc comment calls it "Layer pairs forbidden by 11.2 (target layer per source layer)", and stage 1 audits the same table edge by edge in dag.mjs. The reachability reading flagged `interfaces -> core -> protocol`, the design's normal composition, and was unsatisfiable for any workspace where interfaces reach core and core reaches protocol. The caller at wig.mjs:107-109 is unchanged, so the violation class, its entry shape and its detail string are unchanged. |
| `return paths.slice(0, 1);` - a bare literal capping the reported flows. | `const MAX_REPORTED_FLOWS = 1;` above the function, used as `paths.slice(0, MAX_REPORTED_FLOWS)`. | wig.mjs - the reporting cap is named. Behaviour is identical; the value now says what it is. |
| `/** A reachable path from a forbidden source to a forbidden target. */` and `/** Whether stage 1 declared this clause for the contract's boundary. */`. | Both comments state the rule and the reason: that the declared scope is the whole requirement because the validator refuses what the inference demanded, and that the manifest declares pairs because a reachability reading would reject the mediated composition the design requires. | wig.mjs - the comments described a mechanism; they now carry the why. Without this the next reader has no reason not to restore the walk. |
| tests/workspacify-allocate/unit/wig.test.mjs held 3 tests covering the default workspace, the violation classes and the proof/test obligations. | 16 tests: the 3 originals untouched plus 13 for the declared-scope rule and the pair reading, including both halves of the contradiction asserted together, the real boundary-036 scope pinned to buildBoundaryContractScope('typed_protocol_input'), the mediated i -> c -> p composition, a direct i -> p edge, core -> adapters under both sources of truth, and the PX-194 protocol -> protocol fixture replicated so its behaviour is asserted beside the others. | tests - Red first: 5 of the 13 failed for exactly the planned reasons before the repair (proof_lifecycle_break on the nine-clause scope; ['missing_test_obligation','proof_lifecycle_break'] where one class is due; forbidden_semantic_flow_path on i -> c -> p). The 8 guards were green before and after. px194-branch-coverage.test.mjs was not modified. |
| Two buildContractEdge call sites in the existing fixture() and proofFixture() had their continuation arguments indented six spaces where eight were due, and their closing `}))` at four where six were due. | Both blocks indented correctly; no token changed. | tests - Boy Scout fix in the file this ticket extends. The mis-indentation made the argument list read as if it were a sibling of `contractEdges:` rather than its continuation. |
| No PX-218 provenance in either file. | Five [::TICKET::] PX-218 annotations: wig.mjs above declaresClause and findForbiddenFlows, wig.test.mjs above fixture, scopeFixture and layerFixture. --verify reports 0 missing, 0 ambiguous. | Provenance. Each annotation sits directly above its definition, with the doc comment above the annotation. |

## RFC Discrepancies found in Prior Implementation Rounds

- D2 reverses a decision PX-194 recorded as an open item, and the plan states that explicitly rather than presenting the repair as a pure bug fix. specs/PX-194.md records under `Open items`: "whether forbidden semantic-flow reachability should use the contract graph alone or the union with the manifest's forbidden edges - decided as the union, because a path that uses only forbidden edges is still a forbidden path", and its UT list says "a path from a forbidden source class to a forbidden target class yields forbidden_semantic_flow_path". Measured: the shipped `findForbiddenFlows` uses the contract graph alone, so it does not implement the union it recorded; and the reachability reading was never exercised against a workspace with more than two packages, because PX-194's fixtures are a single `pkg-b -> pkg-a` edge. The reading is unsatisfiable for any workspace where interfaces reach core (mandated by the specification: interfaces are projections of core operations) and core reaches protocol (core consumes protocol packages). The repair therefore adopts the pair reading that `workspace-model.mjs:24` declares (`Layer pairs forbidden by 11.2`) and that stage 1 already audits edge by edge in `dag.mjs:96-113`.
- The manifest's `forbidden_layer_rules` is generated from the compiled `LAYER_FORBIDDEN_TARGETS` (`workspacify-tree/run.mjs:820-825`), so after the repair `forbidden_semantic_flow_path` overlaps `layer_violation` on direct pairs - the same rule stated in two places. PX-194's own design note asked for the layer rule to have "exactly one home" (`specs/PX-194.md`, Investigation: "Reuse LAYERS / LAYER_FORBIDDEN_TARGETS from the stage-1 workspace model rather than restating layer rules in stage 2, so the rule has exactly one home"). The overlap is kept rather than resolved, because the two read different sources of truth: `layer_violation` reads the compiled table plus the production-to-conformance ban, while `forbidden_semantic_flow_path` reads the manifest's declaration, so a manifest whose rules were narrowed is still caught. Deleting either would lose that; the recorded design note is left standing as the reason the duplication is deliberate.
- The defect report (docs/INFO002.md section 6.1) directs the new cases to `.claude/tests/lib/workspacify-wig.test.js` as a CommonJS file loaded by dynamic import. Measured against this tree: `.claude/tests/run-all.js` matches `tests/**/*.test.{js,cjs}`, which excludes `.mjs`, and `.claude/package.json` declares CommonJS - the report is correct about all of that - but the workspacify suites do not live there. They live under `tests/workspacify-allocate/` as `node:test` ESM modules aggregated by `run-tests.mjs` through `lib/test-discovery.mjs`, and the module under repair already has a test file, `tests/workspacify-allocate/unit/wig.test.mjs`. The cases go there. The report is authoritative about the defect, not about this tree's layout.

## Notes in Prior Implementation Rounds

- [Implementation steps] Red first: add the D1 and D2 cases to `tests/workspacify-allocate/unit/wig.test.mjs` reusing `buildValidManifest`, `contractEdgesForPackage`, `defaultClausesForScope`, `buildContractScope`, `buildContractEdge` and `buildContractIndex`, then run `node tests/workspacify-allocate/run-tests.mjs` and confirm the new cases fail for the reasons in the defect report (a `proof_lifecycle_break` on the nine-clause scope; a `forbidden_semantic_flow_path` on `i -> c -> p`). Then repair `declaresClause` and `findForbiddenFlows`, re-run, and confirm green. Then run `make test-workspacify` to confirm the tree suite is unaffected. Then advance the installed copy and run the end-to-end sequence on the external manifest. Refactor only while green.
- [Risks] The larger risk is over-correction: deleting either check instead of narrowing it. Both are narrowed and both keep a regression test. The second risk is that `findForbiddenFlows`'s repair is mistaken for a relaxation of the layer policy - it is not, because `layer_violation` reads the compiled `LAYER_FORBIDDEN_TARGETS` independently and still fires on a direct `interfaces -> protocol`, `core -> adapters` or production -> conformance edge. The third is the external run: `finalize` deletes `workspacify/allocate/DECISIONS.json` and the staging directories on success, so both the payload and the manifest are copied to `/tmp` before it runs, and `crates/` is recorded and moved aside first because G2.4 requires the planned paths to be absent.
- [Caveats] The defect report (`docs/INFO002.md` section 6.1) directs the new tests to `.claude/tests/lib/workspacify-wig.test.js` as a CommonJS file loaded with a dynamic import. That is not this repository's convention: `.claude/tests/` predates the surface runners and its `tests/**/*.test.{js,cjs}` glob does not match `.mjs`, while the workspacify suites live under `tests/workspacify-allocate/` as `node:test` ESM files aggregated by `run-tests.mjs`. The cases go to `unit/wig.test.mjs`, which is the module's own test file. The report is authoritative about the defect, not about this tree's layout.
- [Open items] `tests/workspacify-allocate/run-tests.mjs` has 4 pre-existing failures, all in `unit/self-grill.test.mjs`, all asserting sentences of `.claude/commands/workspacify-allocate.md` that the file no longer contains (for example `The contract is drafted before the prose`; the file now reads `drafting order - draft the contracts first, the prose after`). They are not caused by this repair and must not be chased or reduced here: the last commit to touch that command file is `b94958ad Branch conver-telegramify commit on v0.24.640`, a version bump, while the ticket that wrote the sentences (PX-215) is `reviewed`. That is the recorded class where a version bump silently reverts a past ticket's implementation. Restoring those sentences is a separate ticket.
- [Future improvements] `findForbiddenFlows` still returns `paths.slice(0, 1)`, so a workspace with several direct forbidden pairs reports only the first. That truncation predates this repair and is preserved deliberately - it is a reporting-cardinality question, not a satisfiability one - but it is worth revisiting once a workspace actually has more than one. Likewise, the mediated-path question the repair answers for `interfaces -> core -> protocol` is answered for every layer by the same pair reading; if the design ever wants to forbid a *composition* rather than a pair, it should declare that as its own rule in `forbidden_layer_rules` rather than be inferred from reachability.


Implementation summary (PX-218, 2026-09-18):
- Changed files: `.claude/scripts/workspacify-allocate/lib/wig.mjs` (declaresClause, findForbiddenFlows, MAX_REPORTED_FLOWS, two doc comments, two annotations), `tests/workspacify-allocate/unit/wig.test.mjs` (3 -> 16 tests, import list, two indentation fixes, three annotations). No other source file was touched.
- Red: 13 cases added; 5 failed for exactly the planned reasons - proof_lifecycle_break on the nine-clause typed_protocol_input scope, `['missing_test_obligation','proof_lifecycle_break']` where one class is due, and forbidden_semantic_flow_path `i -> c -> p` twice. The 8 regression guards were green before and stayed green. `px194-branch-coverage.test.mjs` was not modified and did not need to be: its `protocol -> protocol` rule sits on an edge whose two endpoints are both layer `protocol`, so it is a direct forbidden pair under either reading.
- Green: `wig.mjs` declaresClause now returns `scope.includes(clause)`; findForbiddenFlows is a filter over the declared rules and each edge's two endpoint layers.
- Test results: `node --test tests/workspacify-allocate/unit/wig.test.mjs` 16 pass / 0 fail (was 3 / 0). `node tests/workspacify-allocate/run-tests.mjs` 281 pass / 4 fail (was 268 / 4) - the same 4 pre-existing `self-grill.test.mjs` command-document failures, no new ones. `node tests/workspacify-tree/run-tests.mjs` 365 pass / 15 fail, measured with and without this change (git stash) and identical both times; the tree suite does not import `wig.mjs`, so the change cannot reach it. `make check-conventions` exit 0. `run-quality-checks.js` on both files: 0 issues. scan-crimes 0, find-all-stubs 0, preflight-stub-cleanup all empty.
- End-to-end verification on the real workspace, run to completion: the reported defect was first reproduced character for character on a faithful copy of `/Users/kawata/shyme/gaia` with the unrepaired script - `{"status":"FAIL","gateId":"G5","reason":"workspace integration graph violations: proof_lifecycle_break(contract-boundary-036): the contract requires proof semantics but names no verifier; forbidden_semantic_flow_path(pkg-0017): forbidden semantic flow: pkg-0017 -> pkg-0016 -> pkg-0013"}`. With the repaired script, `validate` returned PASS with `manifestHash 166ec8ab...` unchanged (the locked manifest and specification were not touched), and `gate` returned `{"status":"COMPLETE","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS semantic:APPROVED"}` - exactly what the defect report section 8.3 predicts. `finalize` then published: 28 RFC-SEED.md, `wig.violations` 0, `source_coverage.uncovered` empty, `segmentCoverage 29/31`, `G4:PASS G5:PASS`, `semantic APPROVED`, `seed_index` 28, `artifact_kind workspacify-allocate-manifest`, `completion_decision COMPLETE`, and the staging directory swept. Section 8.4's checks all hold.
- The end-to-end run was executed against a copy, never against `/Users/kawata/shyme/gaia` itself. The ticket's testException records why the run is not automated; running it on a copy rather than the original is the same reasoning applied to the artefact: the original is the only complete copy of the authored payload, and `finalize` deletes its staging on success.
- Finding 1 (a gap in the defect report's procedure, not a code defect): section 8.1 lists `crates/` as the only directory to move aside. Measured, `verifyDirectorySet` walks the whole workspace root and requires every directory it finds to be in the expanded plan, skipping only the reserved root `workspacify`. So `finalize` cannot complete in a workspace holding `.claude`, `docs`, `pods`, `sim` or `specs` either - it fails at G6.4 with those names. On a workspace holding only the manifest, the co-located specification and `workspacify/`, the same payload publishes. Anyone repeating section 8 on the original workspace must move every directory outside the plan aside, not only `crates/`.
- Finding 2 (same family as D1/D2, outside this ticket's scope, not fixed here): the real manifest's boundary records carry no `connection_kind` - the kind lives on `dependencies.normal_edges[].connectionKind`, and stage 1 uses it to compute the scope but does not store it on the boundary. `run.mjs:178` therefore passes `connectionKind: boundary.connection_kind`, which is undefined, and `buildContractEdge` defaults to `value_only`. The published `wig.summary.by_connection_kind` is consequently `{value_only: 82}` for a workspace the defect report Appendix A.2 describes as having ten distinct kinds. No gate depends on it, so it blocks nothing, but the published summary loses information stage 1 held. Changing the derivation would alter every authored contract's connection kind and therefore the graph hash and the published manifest, so it is a design change and needs its own ticket, not a Boy Scout fix.
- Not done, deliberately: the defect report's section 4.8 alternative (widening the typed_protocol_input row of contract-clauses.mjs) was not taken. The primary path 4.7 is implemented, and the new test asserts `BOUNDARY_036_SCOPE` deep-equals `buildBoundaryContractScope('typed_protocol_input')`, so taking 4.8 later breaks that assertion by design.
- D1.4 note: `contractEdgesForPackage` derives a contract's clauses FROM the declared scope, so a case needing the scope to declare a clause while the contract omits it must delete it explicitly. The plan-stage measurement caught this; the fixture helper carries an `omitClauses` parameter for it and the Red run would otherwise have proved nothing.
- The `notes-open` item of the make-ticket spec stands unchanged: `tests/workspacify-allocate/run-tests.mjs` still has the 4 pre-existing `self-grill.test.mjs` command-document failures caused by the `.claude/commands/workspacify-allocate.md` clobber at `b94958ad`. They were neither chased nor reduced. Restoring those sentences is a separate ticket.


Review report (PX-218, 2026-09-18):
- Static quality check: passed (0 issues, both files, re-run after the fix below).
- Translatability: no issues. Function names are verb phrases (`declaresClause`, `findForbiddenFlows`, `hasClause`, `violatesLayerRule`, `countBy`); no generic or single-character variables were added; `slice(0, 1)` in the rewritten function was extracted to `MAX_REPORTED_FLOWS`; both doc comments now state the rule and the reason rather than the mechanism; two mis-indented `buildContractEdge` argument lists in the file this ticket extends were corrected.
- Dependencies: consistency verified. `mx` is not imported by the workspacify-tree tree suite (which does import `workspacify-allocate/lib/tree-manifest-input.mjs` through `entry-parity.mjs`, so the direction was checked rather than assumed), and the tree suite measures 365 / 15 with and without this ticket's changes. `contract-clauses.mjs`, `contract-model.mjs`, `dag.mjs`, `workspace-model.mjs` and `tree-staging.mjs` were read and are unmodified.
- **Issue found and fixed in review**: the ticket's four contracts were nominally covered but not really. `verify-red-coverage.js` scans the whole repository for `@verifies <id>`, and the contract ids it counted as covered were supplied by *unrelated* tickets' files whose contract ids also happen to be C001-C004 (`tests/validate-stub-format.test.cjs` for PX-134, `tests/update-stub.test.cjs` for PX-130/PX-131, and others). `tests/workspacify-allocate/unit/wig.test.mjs` carried only PX-194's `@verifies C002`, so Gate S passed on the strength of other tickets' annotations. Fixed by adding `// PX-218 @verifies C001` through `// PX-218 @verifies C004` to the PX-218 section of the file, one id per line, which is the form the regex reads. Verified directly by scanning that file alone with the same regex: it now declares and covers all four. The header form was chosen over tagging each test name because this file's own established style (PX-194's header) is header-only and no checker enforces the in-name form.
- Stub evaluation: `find-all-stubs.js .` count 0; `validate-no-external-excuses.js --fail-on-excuse` exit 0 with 0 total. The preflight classification was empty in all four categories. No stub was found in the changed code and none was added: the two functions are complete, and nothing in the ticket is deferred to another ticket.
- Crime scan: `scan-crimes.sh` count 0. The eight records in Malfeasance.json that are not `resolved` are all `false_positive`, adjudicated earlier, and every one of them is the literal text `[::STUB::]` inside a string in a test file for the stub tooling itself.
- Completeness against the spec: Contracts C001-C004 each have at least one test and a `planTestCode` entry; the four invariants hold in the code as written (`declaresClause` reads only `stage2_contract_scope`; `findForbiddenFlows` builds a local Map and pushes local pairs, mutating neither `graph` nor `manifest`; the empty-rule early return is preserved; the reporting cap is 1 as before); the three acceptance criteria are met, the edge case on a faithful copy of the reported workspace.
- Actionable findings confirmed, each recorded in this ticket's notes rather than fixed here: (1) the defect report's section 8.1 lists only `crates/` as needing to be moved aside, but `verifyDirectorySet` requires every directory under the workspace root to be in the plan, so `.claude`, `docs`, `pods`, `sim` and `specs` block G6.4 as well; (2) the manifest's boundary records carry no `connection_kind`, so every graph edge defaults to `value_only` and the published `by_connection_kind` is `{value_only: 82}`. Both are outside this ticket's scope; the second would change the graph hash and the published manifest, so it is a design change needing its own ticket.
- Not modified and not needed: `tests/workspacify-allocate/unit/px194-branch-coverage.test.mjs`. Its `protocol -> protocol` rule sits on an edge whose endpoints are both layer `protocol`, so it is a direct forbidden pair under either reading; it was green before and after. The four pre-existing `self-grill.test.mjs` / `command-realize.test.mjs` / `argument-surface.test.mjs` failures were neither chased nor reduced; they come from `.claude/commands/workspacify-allocate.md` being clobbered at `b94958ad`, a different defect.
- Remain risks: the two findings above; the `slice(MAX_REPORTED_FLOWS)` cap still reports one flow, so a workspace with several direct forbidden pairs reports only the first; the external end-to-end is not automated (recorded as the ticket's testException) and was run against a copy rather than the original workspace.

## PX-218 — implemented at 5 locations

### .claude/scripts/workspacify-allocate/lib/wig.mjs

- Line 142
```
function declaresClause(contract, manifest, clause) {
```

- Line 202
```
function findForbiddenFlows({ graph, manifest }) {
```

### tests/workspacify-allocate/unit/wig.test.mjs

- Line 16
```
function fixture(overrides = {}) {
```

- Line 157
```
function scopeFixture({ scope, connectionKind = 'value_only', extraClauses = {}, omitClauses = [] }) {
```

- Line 292
```
function layerFixture({ edges, forbiddenLayerRules }) {
```
