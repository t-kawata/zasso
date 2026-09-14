# P22 handoff — how the 22 tickets fit together

The implementation loop runs **one ticket per session**, and `/make-ticket`, `/plan-ticket`,
`/start-ticket` and `/review-ticket` each get a fresh context. Nothing about ticket *n−1* survives
into ticket *n* unless it is written down inside ticket *n*. This document and the handoff block
repeated in every ticket are that written-down part; both are generated from one table, so they
cannot drift apart.

## The arc

`1 regression gate · 2 experiment design (holdout + answer key) · 3 spike · 4 R0-R2 scope and structure · 5 R3-R3.5 semantics and ledger · 6 R4-R5.5 history, gaps, oracle · 7 R6-R6.5 Red plan and falsification · 8 R7-R8 serving and origin spec · 9 command and zg · 10 forward schemas · 11 workspacify-tree reverse · 12 workspacify-allocate reverse · 13 grill reverse · 14 graphify reverse · 15 boundify reverse · 16 split-to-tickets reverse · 17 omission and RESIDUE return · 18 dynamic analysis · 19 Red execution · 20 logical/physical two-layer · 21 staleness into drill · 22 security lane`

## What each ticket consumes and produces

### P22-1 — Forward-rotation regression gate and the environment entry point: freeze baseline manifest hashes, digest the command files, and make a single command bring a conver project fully up

- **Related tickets**: P22-2 (provides to: the regression gate every later ticket runs after its own step), P22-4 (provides to: the environment declaration its analysis toolchain is added to)
- **Consumes**: Nothing. This is the first ticket. It reads only the existing fixtures under `tests/workspacify-tree/fixtures/` (21 entries), the nine command files under `.claude/commands/`, and the existing installer `tools/conver/install.js` + `install-deps.cjs`, which it extends rather than replaces.
- **Produces**: `tests/workspacify-tree/baselines/manifest-hashes.json` shaped `{fixtures[], manifestHashes{}, commandFileDigests{}}`; `tests/workspacify-allocate/fixtures/`; the `regression capture|check` subcommand on `run.mjs`. **And the environment entry point**: `ENV-DEPS.json` (the single declaration of every npm root and external tool, each tagged with which rotation needs it and which ticket provides it), `setup.sh` + `setup.cmd`, the extended `install.js` / `install-deps.cjs`, `env-manifest.cjs`, and `ENV-MANIFEST.json`. **Every ticket from P22-2 to P22-22 runs this gate**; `digestCommandFiles()` is the check that P22-11 through P22-17 and P22-21 must leave unchanged. **P22-4 adds its analysis toolchain to `ENV-DEPS.json` and needs no change to the mechanism** — that is the point of `providedBy` and `requiredFor`.
- **Step 0, before writing anything**: `node .claude/scripts/workspacify-reverse/run.mjs regression check` — if this command does not yet exist, you are on P22-1 and must build it; if it exists, it must exit 0 before you start. **Then run the environment entry point with no arguments and read its report.** If it does not yet exist you must build it; if it does, the report must show the forward rotation ready and must name anything still missing together with the command that would provide it. Two measured facts from 2026-09-10 tell you whether the report is telling the truth: `.claude` declares `sql.js` and has no `sql.js` in `node_modules`, and `zg`, `tree-sitter`, `codeql` and `joern` are absent — the last four being the reverse-rotation toolchain, whose absence is expected at this point in the phase and is not a failure.

### P22-2 — Experiment design: a frozen holdout for generality, and the paired-tree answer key that makes the analysis falsifiable

- **Related tickets**: P22-1 (depends on: shares run.mjs), P22-3 (provides to: the protocol and the answer key the spike runs against), P22-8 (related: the analysis exit whose output the answer key measures)
- **Consumes**: `siprs-with-4layers` (the answer key, described below) and `siprs-for-reverse` (the question), both of which are present and untouched; P22-1's `run.mjs`.
- **Produces**: `tests/workspacify-reverse/holdout/` and the holdout ledger; `docs/HOLDOUT-PROTOCOL.md`; `tests/workspacify-reverse/oracle/` holding the frozen answer-key bundle, **the known structural delta between the trees**, and the reconciliation harness; `run.mjs holdout` and `run.mjs oracle compare`. **P22-3, P22-5, P22-6, P22-8, P22-11, P22-14, P22-15 and P22-16 each measure their own output against this oracle.**
- **Step 0, before writing anything**: Confirm `siprs-with-4layers/RFC-ROOT-GRAPH.json`, `RFC-ROOT-Dirs-Tree.json`, `Tickets.json` and `omissions/` all exist and that `git status --porcelain -- siprs-with-4layers` is empty. A modified answer key invalidates every measurement taken against it. **Also record the known delta described in this ticket** — without it the first reconciliation reports eleven phantom disagreements that are known and intentional, and a human will waste the classification pass on them.

### P22-3 — Minimal spike: one thin vertical slice through R0.5, R3.5 and R7, with a measurement report

- **Related tickets**: P22-1 (depends on: regression gate), P22-2 (depends on: the oracle and the protocol), P22-4 (provides to: the R0.5 implementation this spike promotes), P22-5 (provides to: the ledger and card shapes)
- **Consumes**: P22-2's reconciliation harness and frozen oracle; P22-1's gate; `siprs-for-reverse` as the spike subject.
- **Produces**: `docs/SPIKE-REPORT.md` carrying the measured claim count, card count, unresolved rate, decision time and human interventions, **plus the first measured disagreement list against the answer key**; thin `scope.mjs`, `claim-ledger.mjs`, `packet.mjs` promoted by P22-4, P22-5 and P22-8.
- **Step 0, before writing anything**: `node .claude/scripts/workspacify-reverse/run.mjs regression check` exits 0, and P22-2's oracle bundle is present and frozen.

### P22-4 — /workspacify-reverse R0 to R2: scope fixation, structural measurement, and measurement of dependencies and the execution surface

- **Related tickets**: P22-1 (depends on: regression gate), P22-3 (depends on: the spike R0.5 this ticket promotes), P22-5 (provides to: the dependency graph it extracts from)
- **Consumes**: P22-3's thin `scope.mjs`; the measured tree of `siprs-for-reverse` (150 `.rs` files, 51,221 lines outside `target/`, single crate, top-level `src/ tests/ examples/ docker/ vendor/ build.rs wrapper.h watcher-config.json`).
- **Produces**: `ANALYSIS-SCOPE.json` (target commit, exclusions, permissions, external-transmission policy) and `SCOPE-BOUNDARY.json` with the three-valued coverage state; `structure.mjs`, `dependencies.mjs`, `execution-surface.mjs`; the `analyze` subcommand; **and `docs/P22-ANALYSIS-TECH.md`, the recorded source-analysis technology decision — covering all six target languages — that P22-5, P22-6 and P22-7 must read rather than re-decide**. That document carries the architecture, the **per-language capability matrix** (six languages × E1–E16, each cell one of success / partial / not attempted / failed / unsupported in principle), the **`analysis_attempt` ledger** shape and the adapter output contract (`analysis_mode`, `coverage`, `limitations[]`), and the tool manifest. P22-5 through P22-9 consume this output, and P22-20 builds the two-layer model on the R1 and R2 measurements.
- **Step 0, before writing anything**: Confirm `siprs-for-reverse` still measures 150 `.rs` files outside `target/` and that `run.mjs regression check` exits 0. If the file count differs, the tree has changed and every measurement downstream shifts. **You own the source-analysis technology decision** — see shared premise 10. Read `docs/ABOUT-ANALYSIS-TECH.md` first: it is the consultation sent to experts, it states the full extraction requirement (E1-E16), **and it now carries the expert answer together with a request-side verification record in its §7.** Read the answer, not only the request. Three of its findings must shape your decision: (a) no single stack semantic-analyses six languages at equal depth, so the expected shape is an architecture with declared capabilities rather than one tool, and a capability gap is published as a property of the instrument rather than hidden; (b) C/C++ has a hard quality boundary at `compile_commands.json` — with it the configuration is replayable, without it the AST is an approximation the analyser chose, and the run must say which; (c) two claims in the original candidate table were wrong, and §7 records both — **CodeQL does support Rust** (GA October 2025, with Rust and C/C++ build-free scanning, its measured limits being macro-heavy code, async/await and false positives inside guarded `unsafe`), and **Joern has no Rust frontend**, so it can only be an auxiliary candidate-discovery backend and never the six-language semantic layer. SCIP is an exchange format rather than an analyser. Do not rest the decision on any claim §7 lists as unverified. Then evaluate the candidates against the six languages, choose, and record the decision and its rationale in `docs/P22-ANALYSIS-TECH.md` **before writing any analysis code**, because three later sessions will read that file instead of choosing for themselves. A choice that only handles the first target is the overfitting this phase is forbidden to produce.

### P22-5 — /workspacify-reverse R3 to R3.5: extraction of semantic material, the claim ledger, and evidence independence

- **Related tickets**: P22-4 (depends on: the R2 dependency graph), P22-7 (provides to: the claims it plans falsification for), P22-13 (provides to: the unresolved claims it asks about), P22-22 (provides to: the high-risk claims it classifies)
- **Consumes**: P22-4's R2 dependency graph; `docs/P22-ANALYSIS-TECH.md`, which fixes the source-analysis technology so this session does not choose its own; P22-2's oracle, against which the reconstructed contract candidates are compared.
- **Produces**: `CLAIM-LEDGER.json` shaped `{claim_id, statement, scope, falsification, provenance, evidence: [{evidence_id, evidence_mode, source_span, lineage_edges[], independence_assessment}], independence_policy}`; `semantics.mjs` and `evidence-independence.mjs`. **The two field names here are deliberate and must not be collapsed back.** `evidence_mode` exists because `observed` may only mean a fact read from source or its syntax tree — runtime behaviour, dynamic dispatch targets and generated code need `build_semantic` or `runtime_dynamic` evidence. `lineage_edges` plus a stored `independence_policy` replace the single `derivation_group` identifier, because whether two artefacts descend from one human design decision is not computable from file contents, and `independence_assessment: "unknown"` is a legal value (shared premise 12). **P22-6 through P22-17 all read this ledger**, and P22-21 reads its `ref_hashes` for staleness. Measured against the oracle's 232 `@verifies` annotations.
- **Step 0, before writing anything**: Confirm P22-4 produced `SCOPE-BOUNDARY.json` and that `run.mjs regression check` exits 0. Then run `run.mjs oracle compare --stage r3` and read the disagreement list before writing code — it tells you which contract families the forward rotation actually had.

### P22-6 — /workspacify-reverse R4 to R5.5: archaeology of intent, gaps and contradictions, and oracle validity

- **Related tickets**: P22-5 (depends on: the claim ledger), P22-7 (provides to: the oracle gap it plans against), P22-16 (provides to: the absent-Red findings it turns into tickets), P22-20 (provides to: the mismatches it adjudicates)
- **Consumes**: P22-5's `CLAIM-LEDGER.json`; `docs/P22-ANALYSIS-TECH.md` for the mutation and normalisation technology, fixing the trivial-compiler-equivalence approach that R-2 requires; the git history of `siprs-for-reverse`; the oracle's `omissions/OMISSIONS-*.json` (8 files) for comparison. **TCE means trivial / syntactic / compiler-normalisation equivalence — it does not mean semantic equivalence, and the name is not shorthand for it.** An AST-normalised match proves syntactic equivalence under a named configuration and nothing more; general program equivalence is undecidable, `i < n` and `i <= n - 1` are not interchangeable once overflow, types, side effects or undefined behaviour are considered, and each discarded mutant therefore records the ladder step at which it was discarded. This also corrects an earlier error in this ticket: **`rustc` has no official source printer**, and the available `syn` + `prettyplease` pair is a third-party printer over `syn`'s AST that can drop comments — which matters, because comment-borne evidence is part of what this project reasons about.
- **Produces**: `GAPS.json` and `ORACLE-GAP.json` with survivor-cause classification; `history.mjs`, `gaps.mjs`, `oracle-gap.mjs`. Consumed by P22-7, P22-16 and P22-20. Gap recall is measured against the oracle's 8 omission files.
- **Step 0, before writing anything**: Confirm `CLAIM-LEDGER.json` exists and that `git log` in the target returns history. Then run `run.mjs oracle compare --stage r5` and read the disagreement list.

### P22-7 — /workspacify-reverse R6 to R6.5: the Red reconstruction plan, active falsification, and automatic property-based test generation

- **Related tickets**: P22-6 (depends on: the oracle gap), P22-19 (provides to: the plans it executes, and the ticket that therefore owns the sandbox dependency), P22-16 (provides to: the counterexample_plan_id each reconstruction ticket carries)
- **Consumes**: P22-6's `ORACLE-GAP.json`, P22-5's ledger, and `docs/P22-ANALYSIS-TECH.md`. **This ticket plans and does not execute**: the sandbox from P22-18 is required by P22-19, not here, and deliberately so — P22-18 converges later in the sequence and a planning ticket must not depend on a later one. A plan that cannot execute in the current environment is recorded with that reason, which is the honest outcome while no sandbox exists.
- **Produces**: `RED-RECONSTRUCTION-PLAN.json` shaped `{claim_id, technique, target, side_effects, reset, oracle, expected_red, counterexample_plan_id}`; `red-reconstruction.mjs`, `counterexample.mjs`, `property-tests.mjs`. **P22-16 embeds the `counterexample_plan_id` into every generated reconstruction ticket**, and P22-19 executes the plans.
- **Step 0, before writing anything**: Confirm `ORACLE-GAP.json` exists and that `run.mjs regression check` exits 0. Do not wait for P22-18: this ticket produces plans, and execution is P22-19.

### P22-8 — /workspacify-reverse R7 to R8: serving, the capability profile, and emission of ORIGIN-LONG-SPEC

- **Related tickets**: P22-4 (depends on: the analysis stages it renders), P22-9 (provides to: the command that invokes it), P22-11 (provides to: the origin spec the reverse commands read), P22-2 (related: the answer key its output is measured against)
- **Consumes**: The outputs of P22-4 through P22-7; P22-2's oracle for the final comparison.
- **Produces**: `ORIGIN-LONG-SPEC.md` with its JSON sidecar, `CAPABILITY-PROFILE.json` in five dimensions with no eligibility verdict; `origin-spec.mjs`, `packet.mjs`, `capability-profile.mjs`. Consumed by P22-9 and every command ticket from P22-11 onward. **This is the last stage at which the whole analysis can be compared against the answer key**, so the disagreement list emitted here is the one a human reads.
- **Step 0, before writing anything**: Confirm the ledger and gap outputs exist and `run.mjs regression check` exits 0. Confirm the capability profile emits no `eligible` key before you extend it.

### P22-9 — Integrating /workspacify-reverse and embedding zg: creating the command definition and the serving layer

- **Related tickets**: P22-8 (depends on: the stages it integrates), P22-11 (provides to: the command every reverse command ticket invokes)
- **Consumes**: P22-4 through P22-8 in series; the nine existing command files as the format model for the new one.
- **Produces**: `.claude/commands/workspacify-reverse.md` (a **new file**, not an edit); `lib/zg-probe.mjs`; the integrated pipeline on `run.mjs`. **P22-11 through P22-17 and P22-21 all invoke this command.**
- **Step 0, before writing anything**: Confirm P22-4 through P22-8 are complete and that the nine existing command digests still match P22-1's baseline — you are about to create a tenth file beside them.

### P22-10 — Extending the forward schemas for reverse rotation: residual, RFC-SEED section 1, omission, RESIDUE and Tickets

- **Related tickets**: P22-1 (depends on: the regression gate, mandatory before and after), P22-11 (provides to: the reverse fields the tree gates read)
- **Consumes**: The forward fixtures and their frozen hashes from P22-1; `SEED_REQUIRED_SECTIONS` from `workspacify-allocate/lib/seed-model.mjs`.
- **Produces**: Optional reverse-only fields on residual, RFC-SEED section 1, omission, RESIDUE and Tickets; `forward-extensions.mjs`. **P22-11 through P22-17 and P22-21 read these fields.** This is the only ticket in P22 that touches the forward rotation.
- **Step 0, before writing anything**: Run `run.mjs regression check` and confirm exit 0. Then, after your change, run it again — before and after, not only after.

### P22-11 — /workspacify-tree reverse mode: the T1 to T6 gates that preserve the existing directory structure, and the command edit

- **Related tickets**: P22-1 (depends on: regression gate and command digest), P22-9 (depends on: the analysis it partitions), P22-10 (depends on: the reverse fields), P22-12 (provides to: the manifest it allocates from), P22-20 (provides to: the architecture delta it elaborates)
- **Consumes**: P22-9's origin spec; P22-10's reverse fields; the measured directory tree of `siprs-for-reverse`.
- **Produces**: The reverse-mode TREE-MANIFEST and `ARCHITECTURE-DELTA.json` from `structure-parity.mjs` and `architecture-delta.mjs`. Consumed by P22-12 and P22-20. Package-set agreement is measured against the oracle's `RFC-ROOT-Dirs-Tree.json`.
- **Step 0, before writing anything**: Confirm P22-9 and P22-10 are complete, that the origin spec exists, and that `run.mjs regression check` exits 0. Then read `.claude/commands/workspacify-tree.md` (25,997 B) before editing it — append only.

### P22-12 — /workspacify-allocate reverse mode: inverting the safety guarantee, the A1 to A6 gates, and the command edit

- **Related tickets**: P22-1 (depends on: regression gate and command digest), P22-11 (depends on: the tree manifest), P22-13 (provides to: the RFC-SEED the grill reads)
- **Consumes**: P22-11's manifest; the existing tree of `siprs-for-reverse`; `seed-parity.mjs` and `path-safety.mjs` for reuse.
- **Produces**: One `RFC-SEED.md` per package, a 14-heading seed carrying the reverse index in section 1, and the extended authoring packet. **P22-13 reads the seed**, and the seed's structural agreement is measured against the oracle's `RFC-ROOT-Dirs-Tree.json`.
- **Step 0, before writing anything**: Confirm the tree manifest exists, `run.mjs regression check` exits 0, and `SEED_REQUIRED_SECTIONS.length === 14`. Read `.claude/commands/workspacify-allocate.md` (34,204 B) before editing it — append only.

### P22-13 — /grill-me-for-rfc reverse correspondence: mechanically generated questions that prevent ratification, and a record of normative choices

- **Related tickets**: P22-12 (depends on: the RFC-SEED), P22-10 (depends on: the residual normative_context field), P22-14 (provides to: the canonical RFC it grounds), P22-22 (provides to: the authority records the security lane requires)
- **Consumes**: P22-12's seeds; P22-10's residual fields; P22-5's `grill_question` on every unresolved claim.
- **Produces**: The canonical RFC and the recorded `normative_decision` and `normative_authority` values. Consumed by P22-14 and P22-22. **Contract coverage is measured against the oracle's 232 `@verifies` annotations** — a reconstructed contract that matches a real one is recovered ground truth; one that matches nothing is either a discovery or a false positive, and only a human can say which.
- **Step 0, before writing anything**: Confirm the RFC-SEED exists with 14 headings, the residual `normative_context` field is present, and `run.mjs regression check` exits 0. Read `.claude/commands/grill-me-for-rfc.md` (13,686 B) before editing it — append only.

### P22-14 — /graphify-rfc reverse correspondence: verifying that nodes resolve to real files, and reconciling contracts

- **Related tickets**: P22-13 (depends on: the canonical RFC), P22-15 (provides to: the grounded graph it derives the tree from), P22-16 (provides to: the contract differences it turns into tickets)
- **Consumes**: P22-13's RFC; P22-5's contract candidates; the existing `rfc-graph/` machinery.
- **Produces**: The grounded graph and the recorded contract differences. Consumed by P22-15 and P22-16. Node grounding is measured against the oracle's `RFC-ROOT-GRAPH.json` (113 nodes, 153 edges).
- **Step 0, before writing anything**: Confirm the RFC exists and `run.mjs regression check` exits 0. Read `.claude/commands/graphify-rfc.md` (31,848 B) before editing it — append only.

### P22-15 — /boundify-graph reverse correspondence: preserving the existing structure and attaching headers only

- **Related tickets**: P22-14 (depends on: the grounded graph), P22-16 (provides to: the Dirs-Tree it splits), P22-20 (provides to: the structure it adjudicates)
- **Consumes**: P22-14's grounded graph; the header convention already used by `refresh-file-headers.js`.
- **Produces**: The reverse Dirs-Tree and the correspondence table, with header-only diffs. Consumed by P22-16 and P22-20. **Header placement is measured against the oracle's 143 `Initial Design Artifact` files.**
- **Step 0, before writing anything**: Confirm the graph is grounded and `run.mjs regression check` exits 0. Read `.claude/commands/boundify-graph.md` (16,091 B) before editing it — append only.

### P22-16 — /split-to-tickets reverse correspondence: mapping existing tests, detecting absent Red, and generating reconstruction tickets

- **Related tickets**: P22-15 (depends on: the Dirs-Tree), P22-5 (depends on: the claim ledger), P22-7 (depends on: the counterexample plan ids), P22-19 (provides to: the reconstruction tickets it executes)
- **Consumes**: P22-15's Dirs-Tree; P22-5's ledger; P22-7's plan identifiers; P22-2's oracle for the absent-Red comparison.
- **Produces**: The test-to-ticket mapping and one reconstruction ticket per absent-Red contract, each carrying a `counterexample_plan_id`. Consumed by P22-19. **Absent-Red detection is measured against the oracle: the answer key holds ten `verify_spec_<phase>_<ticket>.rs` files — `p0_1`, `p7_3`, `p8_2`, `p8_3`, `p8_7`, `p9_1`, `p9_2`, `p9_3`, `p9_5`, `p10_1` — whose names state exactly which ticket produced them, plus 379 files carrying `[::TICKET::]`. That is the ground truth for which tests were derived from the design rather than from a Red, and the reverse rotation should reconstruct that mapping from content rather than read the names.**
- **Step 0, before writing anything**: Confirm the Dirs-Tree and ledger exist, and that `run.mjs regression check` exits 0. Read `.claude/commands/split-to-tickets.md` (30,720 B) before editing it — append only.

### P22-17 — /find-omissions and /crystalize-readme: references that return an omission to its originating uncertainty

- **Related tickets**: P22-10 (depends on: the reverse fields), P22-21 (provides to: the return chain it propagates staleness along)
- **Consumes**: P22-10's reverse fields; the existing omission and RESIDUE structures.
- **Produces**: `affected_claim_ids` and `origin_residual_ids` on omissions, `scenario_ref` and `next_route` on RESIDUE, via `return-refs.mjs`. Consumed by P22-21. **Omission recall is measured against the oracle's 8 omission files.**
- **Step 0, before writing anything**: Confirm P22-10 is complete and `run.mjs regression check` exits 0. Read both `.claude/commands/find-omissions.md` (21,407 B) and `.claude/commands/crystalize-readme.md` (17,408 B) before editing — append only, and this is the only ticket that edits two command files.

### P22-18 — Dynamic-analysis infrastructure: sandbox, record-replay, an isolated database and a reset procedure

- **Related tickets**: P22-1 (depends on: regression gate), P22-7 (provides to: the environment its falsification plans execute in), P22-19 (provides to: the isolation discipline its worktree path follows)
- **Consumes**: The target's build inputs: `build.rs`, `Cargo.toml`, `docker/`, `docker-compose.yml`, `watcher-config.json`.
- **Produces**: `sandbox.mjs` and `record-replay.mjs`, with a reset procedure proven before any destructive transition runs. Consumed by P22-7 and P22-19. **The oracle is not a sandbox input**: it must stay outside the target root so the executor cannot read it.
- **Step 0, before writing anything**: Confirm `run.mjs regression check` exits 0 and that `siprs-for-reverse` still builds. Establish the reset before the first destructive transition, not after.

### P22-19 — Execution path for Red reconstruction: worktree isolation and its integration into the implementation loop

- **Related tickets**: P22-16 (depends on: the reconstruction tickets), P22-18 (depends on: the isolation discipline), P22-7 (depends on: the plans they carry)
- **Consumes**: P22-16's reconstruction tickets with their `counterexample_plan_id` values; P22-18's sandbox discipline.
- **Produces**: `worktree-isolation.mjs` and recorded Red evidence per reconstruction ticket. Consumed by the implementation loop. **The main tree must be byte-identical afterwards**, and the oracle must remain untouched — a worktree that reached it would contaminate the answer key permanently.
- **Step 0, before writing anything**: Confirm reconstruction tickets exist, P22-18's sandbox works, and `run.mjs regression check` exits 0. Confirm `git status --porcelain -- siprs-with-4layers` is empty before and after.

### P22-20 — Separating the logical from the physical: card-driven Reflexion and the 2-Pass Hybrid

- **Related tickets**: P22-11 (depends on: the tree and the architecture delta), P22-4 (depends on: the R1 and R2 measurements), P22-1 (depends on: regression gate), P22-21 (provides to: the deltas it propagates)
- **Consumes**: P22-11's `ARCHITECTURE-DELTA.json`; P22-4's structure and dependency measurements; the existing `mappedNodeIds` chain.
- **Produces**: Mechanically generated candidate models, adjudication cards, and the recorded deltas. Consumed by P22-21. **The candidate set is measured against the oracle's `RFC-ROOT-Dirs-Tree.json`: the forward rotation made one particular partitioning choice, and how the candidates relate to it is exactly the material a human adjudicates.**
- **Step 0, before writing anything**: Confirm the tree manifest and the R1/R2 measurements exist, and that `run.mjs regression check` exits 0.

### P22-21 — Staleness propagation into /drill-rfc-down: supplying the evolution loop, and the command edit

- **Related tickets**: P22-10 (depends on: the ref_hashes), P22-8 (depends on: the analysis output), P22-1 (depends on: regression gate and command digest)
- **Consumes**: P22-10's `ref_hashes` and forward references; the claim ledger; the completion state.
- **Produces**: Stale markers with their re-examination conditions, fed to the drill flow. Consumed by the evolution loop. **Staleness is measured by asking whether the answer key itself would be marked stale** — a claim whose referenced artefact changed since the forward rotation ran is a case where the canonical record and the code have genuinely diverged.
- **Step 0, before writing anything**: Confirm `ref_hashes` are recorded and `run.mjs regression check` exits 0. Read `.claude/commands/drill-rfc-down.md` (32,032 B) before editing it — append only.

### P22-22 — Security lane: authorization, tenancy, secrets, deletion and audit as a cross-cutting lane with mandatory human authority

- **Related tickets**: P22-5 (depends on: the claim ledger), P22-13 (depends on: the authority records), P22-1 (depends on: regression gate)
- **Consumes**: P22-5's ledger; P22-13's `normative_authority` values.
- **Produces**: `security-lane.mjs` and the lane classification with the mandatory authority requirement. Consumed by the release loop. **The oracle tells you which high-risk surfaces the forward rotation actually touched** — the FFI boundary, the unsafe isolation tests and the watcher configuration are all visible in it, so a lane that classifies nothing is measurable rather than merely suspicious.
- **Step 0, before writing anything**: Confirm the claim ledger exists, P22-13's authority records are present, and `run.mjs regression check` exits 0.

## The answer key

**The answer key.** `siprs-with-4layers` is the same project put through the forward rotation to RESIDUE 0, so it holds what the reverse rotation is trying to reconstruct: `RFC-ROOT-GRAPH.json` (113 nodes, 153 edges), `RFC-ROOT-Dirs-Tree.json`, `Tickets.json` (21 phases, 146 tickets), `omissions/OMISSIONS-*.json` (8 files), 232 `@verifies` annotations, 379 files carrying `[::TICKET::]`, and 143 files carrying an `Initial Design Artifact` header.
`siprs-for-reverse` is the same project with those artefacts removed (0 of each), and is the question. Comparing a reverse-rotation output against the answer key produces a list of disagreements — never a score and never a verdict. Each disagreement is a human's to classify as an analysis error, a genuine discovery, or a case where the forward rotation's own artefact was free. The oracle is held outside the target root so the executor cannot read it.

## Where the reconciliation runs

| Stage | Oracle artefact | Ticket that runs the comparison |
|---|---|---|
| R1/R2 structure and partition | `RFC-ROOT-Dirs-Tree.json` | P22-11, P22-20 |
| R3 contract candidates | 232 `@verifies` annotations | P22-5 |
| R5 gaps | 8 `omissions/OMISSIONS-*.json` files | P22-6 |
| R6 absent Red | 379 `[::TICKET::]` files, 10 `verify_spec_*.rs` | P22-16 |
| R8 claims | `RFC-ROOT.md` | P22-8 |
| Grounding | `RFC-ROOT-GRAPH.json` (113 nodes, 153 edges) | P22-14 |
| Header attachment | 143 `Initial Design Artifact` files | P22-15 |
| Ticket mapping | `Tickets.json` (21 phases, 146 tickets) | P22-16 |
| First measurement of all of the above | the frozen bundle | P22-3 |

Every comparison emits a **disagreement list**, never a score and never a verdict. Classifying a
disagreement as an analysis error, a genuine discovery, or a case where the forward rotation's own
artefact was a free choice is a human's work — that judgement is the deliverable, and mechanising it
would be the mechanical success judgement this design explicitly rejects.

## The invariants that hold across all 22

Every ticket carries the same shared-premises block at the top of its `background`, so a session that
sees only its own ticket still knows what may not be broken. The three that constrain the most are:

1. **Never break the forward rotation** — proven by a byte-identical `manifest_hash` over the forward
   fixtures, captured by P22-1 before any change and re-run by every later ticket.
2. **Never rewrite `.claude/commands/*.md`** — append or correct the minimum number of lines. P22-1's
   command digest is the check, and P22-11 through P22-17 and P22-21 each re-run it.
3. **The machine says only "proved" or "not proved"** — success is a human judgement made after the
   loop has run several times.
