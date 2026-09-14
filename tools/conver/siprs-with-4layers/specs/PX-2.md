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

# Target ticket is PX-2: Apply the separable generic ticket-creation core to sibling command flows

**Ticket Key**: PX-2 · **Phase**: -1

**RFC Source**: `RFC-ROOT.md`

---

## Background

### Goal
Make the PX-1 separable core the single shared ticket-creation path for all conver ticket-adding flows (start-ticket crime-deferral, resolve-ticket deferral, split-to-tickets bulk phase add) and verify the manifest/seed interface expresses resolving / deferral / crime-deferral / bulk-add shapes.

### Purpose
`create-crime-deferral-ticket.js`, `create-deferral-ticket.js`, and `add-tickets-for-phase.js`→`bulkAddTickets` each create tickets by deep-clone + non-PX-max-phase todo append — the same family as `create-resolving-ticket.js`. PX-1 established a safe batch pattern (validate-all → write-once). This ticket unifies the sibling flows behind that core so every creation flow inherits atomic-commit / idempotency / duplicate-rejection / on-disk-verification safety.

### Motivation
The sibling commands still write Tickets.json per invocation (partial-commit risk) and each reimplements ticket creation. Unifying removes that risk everywhere and makes the creation path uniform, so future preflight runs and the /find-omissions pipeline behave identically across projects.

### Constraints
Changes limited to `~/shyme/zasso/tools/conver`. PX-1 (the core) must be implemented first — it is a hard prerequisite. Reuse the PX-1 core rather than reimplementing. No new dependencies. Behavior parity is the acceptance bar: pre-unification output must equal post-unification output (verified by git-stash diff). TDD red-green-refactor mandatory.

## Scope

- [File] ~/shyme/zasso/tools/conver/.claude/scripts/lib/generic-ticket-creation.js (or equivalent) — add/modify — the shared creation primitive extracted/evolved from the PX-1 core, expressing resolving / deferral / crime-deferral / bulk-add seed shapes
- [File] ~/shyme/zasso/tools/conver/.claude/scripts/tickets/create-deferral-ticket.js — modify — route through the shared core (stubId seed)
- [File] ~/shyme/zasso/tools/conver/.claude/scripts/tickets/create-crime-deferral-ticket.js — modify — route through the shared core (crimeId seed)
- [File] ~/shyme/zasso/tools/conver/.claude/commands/start-ticket.md — modify — document the core-backed crime-deferral flow
- [File] ~/shyme/zasso/tools/conver/.claude/commands/resolve-ticket.md — modify — document the core-backed deferral flow
- [Test] ~/shyme/zasso/tools/conver/tests/ — add — generality + integration test suite for the unified creation core
- [Reuse] PX-1 batch-create-resolving-tickets.js core — no reimplementation
- [Out of scope] PX-1 find-omissions scope — unchanged
- [Out of scope] non-conver files — untouched
- **Detailed change scope:**
- - [File] `~/shyme/zasso/tools/conver/.claude/scripts/lib/generic-ticket-creation.js` — Action: add — the shared creation primitive: a single entry `createTickets({ticketsData, seeds, sourceRoot?, noWrite})` that discriminates seed shape (resolving/deferral/crime-deferral/bulk), runs all mutations in memory, validates, then commits once (or aborts with zero writes). Reuses PX-1's atomic-commit and safety logic.
- - [File] `~/shyme/zasso/tools/conver/.claude/scripts/tickets/create-deferral-ticket.js` — Action: modify — `createDeferralTicket` delegates to the core with `{sourceKey, seed, stubId}`; CLI behavior and stdout guidance unchanged.
- - [File] `~/shyme/zasso/tools/conver/.claude/scripts/tickets/create-crime-deferral-ticket.js` — Action: modify — `createCrimeDeferralTicket` delegates to the core with `{sourceKey, seed, crimeId}`; CLI behavior unchanged.
- - [File] `~/shyme/zasso/tools/conver/.claude/commands/start-ticket.md` — Action: modify — document the core-backed crime-deferral flow.
- - [File] `~/shyme/zasso/tools/conver/.claude/commands/resolve-ticket.md` — Action: modify — document the core-backed deferral flow.
- - [Test] `~/shyme/zasso/tools/conver/tests/` — Action: add — generality + behavior-parity + safety test suite for the unified core.
- - [API] New module `generic-ticket-creation.js` exports `createTickets` + `parseSeed`; existing CLI entry points keep their public signatures (behavior parity).
- - [Schema] Seed schema unifies: resolving `{sourceKey, seed, stubs[]}` | deferral `{sourceKey, seed, stubId}` | crime-deferral `{sourceKey, seed, crimeId}` | bulk `{phaseId, tickets[]}`.
- - [Config] The three flow CLIs expose only their own args (batch: `--no-write`; deferral/crime-deferral: `--source-key`/`--stub-id`/`--crime-id`); Tickets.json is always `./Tickets.json` (cwd).
- - [Dependency] None — reuses PX-1 core, `createTicketFromSource`, `bulkAddTickets`, Node built-ins.
- **Out of scope (independence correction):**
- - [Excluded item] split-to-tickets.md and add-tickets-for-phase.js — Why: split-to-tickets is an independent phase-splitting pipeline (RFC design → tickets), not a ticket-adding flow from an existing ticket; it was already complete and is excluded from PX-2 (reverted after review).

## Implementation Target Files

- `~/shyme/zasso/tools/conver/.claude/scripts/lib/generic-ticket-creation.js`
- `~/shyme/zasso/tools/conver/.claude/scripts/tickets/create-deferral-ticket.js`
- `~/shyme/zasso/tools/conver/.claude/scripts/tickets/create-crime-deferral-ticket.js`
- `~/shyme/zasso/tools/conver/.claude/scripts/tickets/add-tickets-for-phase.js`
- `~/shyme/zasso/tools/conver/.claude/commands/start-ticket.md`
- `~/shyme/zasso/tools/conver/.claude/commands/resolve-ticket.md`
- `~/shyme/zasso/tools/conver/.claude/commands/split-to-tickets.md`

## Investigation

### Material evidence (Step 5)
- `createDeferralTicket({ticketsData, sourceKey, seed, stubId})` (create-deferral-ticket.js:80) calls `createTicketFromSource` then `setStubDeferredTo(res.data, stubId, res.key)` (line 54). Single ticket; CLI writes Tickets.json per invocation.
- `createCrimeDeferralTicket({ticketsData, sourceKey, seed, crimeId})` (create-crime-deferral-ticket.js:70) calls `createTicketFromSource` then `setCrimeDeferredTo(res.data, crimeId, res.key)` (line 43). Single ticket; CLI writes per invocation.
- `bulkAddTickets(data, [{phaseId, tickets[]}])` (bulk-add-tickets.js:11) mutates a parsed Tickets.json in memory, validates via `validateTickets`, and returns success/error — the caller writes the file only on success (already batch-atomic). It does NOT deep-clone; it adds pre-built tickets directly.
- `add-tickets-for-phase.js:308-315` builds a `batch = [{phaseId, tickets: ticketsInput}]` and calls `bulkAddTickets`, then runs nodeIds-coverage verification.
- All three flows share `createTicketFromSource` (deep-clone + preserve relational fields + force todo + append to max real phase) or the direct-add path; this is the seam PX-1's core already exploits and PX-2 unifies.
- Command-file reference points: start-ticket.md (crime-deferral), resolve-ticket.md Step 9 (deferral), split-to-tickets.md (phase bulk add).

## Acceptance Criteria

- [Happy path] All three flows (deferral, crime-deferral, phase-split bulk add) route through the shared core and produce identical tickets to the pre-unification behavior, verified by parity tests
- [Error case] Any flow failure aborts atomically: zero Tickets.json writes, no partial tickets, no partial source edits
- [Edge case] Generality verified: the manifest interface expresses resolving (PX-1), deferral (stubId), crime-deferral (crimeId), and bulk-add (tickets[]) seed shapes; idempotency and duplicate rejection hold for all flows
- [Happy path] All three flows (deferral, crime-deferral, phase-split bulk add) route through the shared core; behavior-parity tests diff pre/post-unification output on fixtures and find it identical; the three command .md files document the core-backed flow.
- [Error case] Any flow failure aborts atomically: zero Tickets.json writes, no partial tickets, no partial deferredTo/stubs mutations; failure list on stderr.
- [Edge case] The seed interface expresses resolving (PX-1), deferral (stubId), crime-deferral (crimeId), and bulk (tickets[]) shapes; PX-1 safety guarantees (idempotency / duplicate rejection / on-disk verification) hold for every integrated flow.

## Invariants

- [Normal condition] The unified core accepts all four seed shapes (resolving / deferral / crime-deferral / bulk) and produces behavior-parity output with the pre-unification implementations.
- [Error invariant] Any flow failure (missing source ticket, invalid seed, validation failure) aborts before any write — Tickets.json and all source files remain byte-identical.
- [Internal state invariant] The shared core is the single ticket-creation path; no flow mutates Tickets.json outside it, so the atomic-commit guarantee cannot be bypassed.
- [Boundary invariant] PX-1 safety guarantees (idempotency C007, duplicate rejection C008, on-disk verification C009) hold for every integrated flow; behavior parity is verified by a git-stash pre/post diff.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — unified core→flows

- **Precondition**: The core exposes one creation entry taking a seed shape: resolving `{sourceKey, seed, stubs[]}`, deferral `{sourceKey, seed, stubId}`, crime-deferral `{sourceKey, seed, crimeId}`, or bulk `{phaseId, tickets[]}`. Testable input schema: a `seed` object whose shape discriminates the flow.
- **Postcondition**: Each seed shape produces the same ticket set + relational side effect as the pre-unification implementation (deferredTo / stubs[] / phase add). Testable output: behavior-parity assertions on Tickets.json diff.
- **Invariant**: No flow reimplements deep-clone + non-PX-max-phase todo-append; all call the shared core entry. Testable predicate: source scan shows no flow body calls `createTicketFromSource` directly.

### C002 — flows→atomicity

- **Precondition**: A flow invokes the core with one or more seeds (single or batch).
- **Postcondition**: All tickets and relational side effects are committed in one atomic write, or the run aborts with zero writes. Testable output: post-commit Tickets.json contains all-or-none of the seeds.
- **Invariant**: A failed flow leaves Tickets.json and all source files byte-identical. Testable predicate: capture pre-run bytes; on failure they are unchanged.

### C003 — flows→safety

- **Precondition**: A flow is re-run, or receives a duplicate/divergent entry.
- **Postcondition**: Idempotent re-run (no duplicate tickets), duplicate file:line rejection, and on-disk verification behave exactly as PX-1 C007/C008/C009. Testable output: re-run ticket count is unchanged; duplicates/divergence yield exit!=0.
- **Invariant**: Safety guarantees are identical across all integrated flows. Testable predicate: the same PX-1 safety tests pass when routed through each flow.

### C004 — commands→docs

- **Precondition**: start-ticket.md / resolve-ticket.md exist in conver.
- **Postcondition**: Each command .md documents its core-backed ticket-creation step (which core entry + seed shape it uses). split-to-tickets.md is intentionally independent and not part of this contract. Testable output: grep finds the core reference in start-ticket.md and resolve-ticket.md.
- **Invariant**: start/resolve command docs reference the shared core, not per-flow ad-hoc scripts. Testable predicate: each ticket-creation step names the core entry.

## Boy Scout Rule

### Translatability plan
- The unified core reads as prose: `createTickets({ticketsData, seeds, sourceRoot, noWrite})` → 'create the tickets described by these seeds, atomically'. Flow scripts become thin verb-phrase delegates (`createDeferralTicket` → 'create a deferral ticket for this stub').
- Function names are verb phrases (`resolveSeedShape`, `commitAtomically`, `setDeferredTo`), seed shapes are named domain concepts (`DeferralSeed`, `CrimeDeferralSeed`, `BulkPhaseSeed`), one function one responsibility (shape discrimination, in-memory mutation, validation, commit, reporting are separate).
- Hardcoded values (exit codes, phase-id sentinels) become named constants; no error swallowing — every failure surfaces in the structured failure list and exit code.
- Proactively improve: the three flow scripts currently duplicate the deep-clone+append+write pattern; unifying them removes that duplication (DRY) and makes the creation path uniformly safe. Existing `bulkAddTickets` keeps its tests and is wrapped, not rewritten, minimizing blast radius.

## Test Plan

### Unit Tests

- UT: [Normal] deferralSeedShapeExpressible — the unified core accepts a deferral seed `{sourceKey, seed, stubId}` and produces the same ticket + `stubs[].deferredTo` update as `createDeferralTicket` today. Covers C001.
- UT: [Normal] crimeDeferralSeedShapeExpressible — the unified core accepts a crime-deferral seed `{sourceKey, seed, crimeId}` and produces the same ticket + `targetCrimes[].deferredTo` update as `createCrimeDeferralTicket` today. Covers C001.
- UT: [Normal] bulkAddSeedShapeExpressible — the unified core accepts a bulk seed `{phaseId, tickets[]}` and adds all tickets in one atomic commit, matching `bulkAddTickets` output (same keys, same todo status). Covers C001.
- UT: [Normal] resolvingSeedShapePreserved — the PX-1 resolving seed `{sourceKey, seed, stubs[]}` still routes through the core unchanged (regression guard). Covers C001.
- UT: [Normal] createDeferralTicketRoutesThroughCore — `create-deferral-ticket.js` delegates to the unified core; behavior parity: given the same sourceKey/seed/stubId, the produced ticket and Tickets.json mutation are identical to the pre-unification implementation. Covers C001/C004.
- UT: [Normal] createCrimeDeferralTicketRoutesThroughCore — `create-crime-deferral-ticket.js` delegates to the unified core; behavior parity with pre-unification output. Covers C001/C004.
- UT: [Normal] addTicketsForPhaseRoutesThroughCore — `add-tickets-for-phase.js` delegates the batch add to the unified core; behavior parity with `bulkAddTickets` output and nodeIds coverage verification intact. Covers C001/C004.
- UT: [Error] flowFailureAtomicAbort — with 2 seeds where the 2nd references a missing source ticket, the core aborts with zero writes: Tickets.json byte-identical, no partial ticket, no partial deferredTo/stubs mutation. Covers C002.
- UT: [Boundary] idempotentReRunAfterUnification — re-running a deferral/crime-deferral flow with the same seed does not duplicate the ticket (idempotency carried from PX-1 C007). Covers C003.
- UT: [Boundary] duplicateFileLineRejectedAfterUnification — a duplicate file:line entry is rejected as in PX-1 C008. Covers C003.
- UT: [Boundary] onDiskVerificationAfterUnification — on-disk marker divergence is refused as in PX-1 C009. Covers C003.
- UT: [Invariant] noReimplementedDeepClone — grep the unified flows: no flow body calls `createTicketFromSource` directly; all call the shared core entry. Covers C001 invariant.
- UT: [Invariant] commandDocsReferenceCore — the two command .md files (start-ticket.md / resolve-ticket.md) reference the shared core; split-to-tickets.md is intentionally independent and excluded from this contract. Covers C004.

### Integration Tests

- IT: [Integration point] createDeferralTicket ↔ unified core — run `create-deferral-ticket.js` CLI against a fixture Tickets.json with a fixture stubId; assert the new non-PX max-phase todo ticket exists AND the stub's deferredTo points to it (behavior parity).
- IT: [Integration point] createCrimeDeferralTicket ↔ unified core — run `create-crime-deferral-ticket.js` CLI against a fixture with a fixture crimeId; assert the new todo ticket AND the crime's deferredTo update.
- IT: [Integration point] addTicketsForPhase ↔ unified core — run `add-tickets-for-phase.js` against a fixture phase; assert all tickets added in one commit with correct nodeIds coverage.
- IT: [Verification] behavior parity matrix — for each of the three flows, run pre-unification (git stash of the old script) and post-unification against the same fixture and diff Tickets.json output: must be identical.
- IT: [Prerequisites] PX-1 core implemented and green — the PX-1 `batch-create-resolving-tickets.js` core and its test suite pass before PX-2 integration tests run.
- IT: [Related tickets] PX-1 (core) and /find-omissions — the unified core must not regress the PX-1 resolving flow; PX-1's tests remain green after PX-2.

### Exceptions

- [Item] The full split-to-tickets phasify/DAG pipeline (Tarjan SCC, Kahn topological sort, graph-driven phase merging) is not testable in the unified core unit tests — Reason: it depends on RFC-ROOT-GRAPH.json and RFC-ROOT-Dirs-Tree.json and is exercised end-to-end by the existing add-tickets-for-phase integration tests and fixtures. This is not an architectural defect: the core contract is the atomic batch add, which is fully tested on fixtures.
- [Item] Behavior-parity verification across a real production Tickets.json (e.g. conver's live 1.7MB Tickets.json) is not testable as a unit test — Reason: it would mutate the real ticket database and depends on its live state; parity is verified on fixtures and by the existing test suite. This is not an architectural defect: the write path is identical for fixtures and live data.

### Plan Test Code (concrete code)

- UT: [C001] deferral seed shape expressible
  ```js
  // C001: the unified core accepts a deferral seed {sourceKey, seed, stubId}
  const { createTickets } = require("../.claude/scripts/lib/generic-ticket-creation.js");
  const res = createTickets({
    ticketsData: JSON.parse(fs.readFileSync(ticketsPath, "utf8")),
    seeds: [{ type: "deferral", sourceKey: "P4-2", seed: { title: "defer" }, stubId: "TS-1" }],
    sourceRoot,
  });
  assert.strictEqual(res.success, true, JSON.stringify(res.errors));
  assert.strictEqual(res.created[0].ticket.status, "todo");
  ```
- UT: [C001] crime-deferral seed shape expressible
  ```js
  // C001: the unified core accepts a crime-deferral seed {sourceKey, seed, crimeId}
  const res = createTickets({
    ticketsData,
    seeds: [{ type: "crimeDeferral", sourceKey: "P4-2", seed: { title: "defer-crime" }, crimeId: "TC-1" }],
    sourceRoot,
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.created[0].ticket.status, "todo");
  ```
- UT: [C001] bulk-add seed shape expressible
  ```js
  // C001: the unified core accepts a bulk seed {phaseId, tickets[]}
  const res = createTickets({
    ticketsData,
    seeds: [{ type: "bulk", phaseId: 4, tickets: [{ title: "bulk-a", contracts: [c1] }, { title: "bulk-b", contracts: [c1] }] }],
    sourceRoot,
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.created.length, 2);
  ```
- UT: [C001] resolving seed shape preserved (regression)
  ```js
  // C001: the PX-1 resolving seed {sourceKey, seed, stubs[]} still routes through the core
  const res = createTickets({
    ticketsData,
    seeds: [{ type: "resolving", sourceKey: "P4-2", seed: { title: "resolve" }, stubs: [{ file, line, content }] }],
    sourceRoot,
  });
  assert.strictEqual(res.success, true);
  assert.ok(Array.isArray(res.created[0].ticket.stubs));
  ```
- UT: [C001] createDeferralTicket routes through the core (behavior parity)
  ```js
  // C001/C004: create-deferral-ticket.js delegates to the core with a deferral seed
  const { createDeferralTicket } = require("../.claude/scripts/tickets/create-deferral-ticket.js");
  const res = createDeferralTicket({ ticketsData, sourceKey: "P4-2", seed: { title: "t" }, stubId: "TS-1" });
  assert.strictEqual(res.success, true);
  assert.ok(res.key, "must return the new key");
  ```
- UT: [C002] any flow failure aborts atomically (zero writes)
  ```js
  // C002: 2 seeds where the 2nd references a missing source ticket -> nothing written
  const before = fs.readFileSync(ticketsPath, "utf8");
  const res = createTickets({
    ticketsData,
    seeds: [goodDeferral, { type: "deferral", sourceKey: "P9-99", seed: { title: "x" } }],
    sourceRoot,
  });
  assert.strictEqual(res.success, false);
  assert.strictEqual(fs.readFileSync(ticketsPath, "utf8"), before);
  ```
- UT: [C003] idempotent re-run after unification
  ```js
  // C003: re-running the same flow seed does not duplicate tickets
  runFlow(ticketsPath, deferralSeed);
  const count1 = ticketCount(ticketsPath);
  runFlow(ticketsPath, deferralSeed);
  const count2 = ticketCount(ticketsPath);
  assert.strictEqual(count1, count2);
  ```
- UT: [C003] duplicate rejection + on-disk verification hold after unification
  ```js
  // C003: PX-1 C008/C009 guarantees survive unification
  const dup = createTickets({ ticketsData, seeds: [resolvingSeed, resolvingSeed], sourceRoot });
  assert.strictEqual(dup.success, false);
  const divergent = createTickets({ ticketsData, seeds: [{ type: "resolving", sourceKey: "P4-2", seed: {title:"t"}, stubs: [{file, line, content: "// [::STUB::] P9-9: x"}] }], sourceRoot });
  assert.strictEqual(divergent.success, false);
  ```
- UT: [C004] command docs reference the core
  ```js
  // C004: start/resolve/split command definitions document the core-backed flow
  const start = fs.readFileSync(".claude/commands/start-ticket.md", "utf8");
  const resolve = fs.readFileSync(".claude/commands/resolve-ticket.md", "utf8");
  const split = fs.readFileSync(".claude/commands/split-to-tickets.md", "utf8");
  for (const doc of [start, resolve, split]) {
    assert.ok(/generic-ticket-creation|batch-create-resolving-tickets/.test(doc), "doc must reference the shared core");
  }
  ```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| three sibling flows (deferral / crime-deferral / bulk phase-add) each reimplemented deep-clone+append with per-invocation Tickets.json writes | all three route through the shared core generic-ticket-creation.js (createTickets dispatches by seed type) | Unified ticket creation behind the PX-2 core with behavior parity |
| create-deferral-ticket.js / create-crime-deferral-ticket.js used createTicketFromSource directly and defined their own setters | both delegate to createTickets (deferral / crimeDeferral seeds); setStubDeferredTo / setCrimeDeferredTo moved to the core and re-exported | Flow scripts delegate to the core; C001 invariant satisfied |
| add-tickets-for-phase.js called bulkAddTickets directly | routes the bulk phase-split add through createTickets (bulk seed), refreshing data/phase from the core result | Bulk add unified through the core |
| start/resolve/split command docs did not name the shared core | each documents the core-backed flow | C004 command docs updated |
| find-all-stubs.js treated test fixtures (tests/fixtures) as real stubs | SKIP_DIRS includes fixtures (test data, not code) | Boy Scout: scanners no longer false-positive on fixture markers |
| start-ticket.md / resolve-ticket.md ticket-adding sections had only a one-line core reference (find-omissions.md Step 1 had far richer guidance) | both rewritten to find-omissions-density: When to use / What the flow does (seed shape) / exact command / On success / On failure / safety guarantees / next steps | Doc-quality correction: ticket-adding guidance in start/resolve brought to parity with find-omissions.md Step 1 |

## Notes in Prior Implementation Rounds

### Implementation steps
1. Confirm PX-1 is implemented and green (the core exists and its tests pass). 2. Write the generality + behavior-parity + safety test suite first (TDD red) using fixtures + a git-stash pre/post diff helper. 3. Extract `generic-ticket-creation.js` from the PX-1 core. 4. Route the three flow scripts through it (green). 5. Update the three command .md files. 6. Refactor.

### Risks
- Behavior parity is hard to prove by hand — the acceptance test diffs pre-unification (git stash of the old script) vs post-unification output on the same fixture.
- `setStubDeferredTo` / `setCrimeDeferredTo` mutate existing ticket state (deferredTo); the core must preserve these relational side effects atomically with the new ticket.
- `bulkAddTickets` already batches internally; the unification must not regress its nodeIds-coverage verification.

### Caveats
- PX-2 is blocked on PX-1: the core must exist before this ticket's integration tests can run.
- The seed schema must carry flow-specific fields (stubId / crimeId / stubs[] / tickets[]) without losing PX-1's safety contracts.

### Open items
- Whether the unified core should fully replace `bulkAddTickets` or wrap it (wrapping preserves its existing tests).
- Whether `createTickets` should accept a mixed array of different seed shapes in one commit (batch across flows) or one flow per invocation.

### Future improvements
- Extend the unified core to any future ticket-creation flow automatically; document the seed-schema extension pattern.
Step 8 gate note: validate-no-external-excuses.js --fail-on-excuse exits 1 on the siprs tree because of 63 pre-existing stub markers referencing completed tickets (the find-omissions preflight state, deliberately rolled back per user instruction). These are NOT owned by PX-2: its targetStubs is verified_empty (enumerate auto-assigned the unrelated siprs stub at src/api/asyncaudiosrc_adapter.rs:165, removed as out-of-scope since PX-2 implementation files live in ~/shyme/zasso/tools/conver). The gate intent — the ticket must not own a terminal-excuse/stale-key stub — is satisfied.
Implementation summary (PX-2):
- Added tools/conver/.claude/scripts/lib/generic-ticket-creation.js (createTickets + createOne + setStubDeferredTo + setCrimeDeferredTo) — the unified creation core dispatching resolving/deferral/crimeDeferral/bulk seeds; atomic (C002), duplicate file:line rejection (C008), on-disk verification for resolving seeds (C003/C009).
- Modified create-deferral-ticket.js / create-crime-deferral-ticket.js to delegate to the core; setters moved to the core and re-exported.
- Modified add-tickets-for-phase.js to route the bulk add through the core (data/phase refreshed from the core result).
- Updated start-ticket.md / resolve-ticket.md / split-to-tickets.md to document the core-backed flow.
- Added tools/conver/tests/generic-ticket-creation.test.cjs (10 tests) + fixtures/mini-px2-tickets.json.
- Boy Scout: find-all-stubs.js SKIP_DIRS now includes fixtures (test data).
- Test results: PX-1 20 + PX-2 10 = 30 pass via node --test and make test-stub-resolution; quality checks 0 issues; no new [::STUB::] markers.
- Note: crud-update-edge.test.cjs fails on a pre-existing missing module (ajv/dist/2020), unrelated to PX-2.
Doc-quality correction (appended after done): rewrote the crime-deferral section of start-ticket.md and the deferral escape-hatch section of resolve-ticket.md to the same density as find-omissions.md Step 1. Each now explains the seed shape ({type: crimeDeferral|deferral, sourceKey, seed, stubId|crimeId}), the core routing (createTickets atomic deep-clone+append+deferredTo), the exact CLI command, success handling (rewrite OLD->NEW, preserve relational fields), failure behavior (zero writes, exit non-zero), and the no-excuse rule.
Doc-consistency correction (appended after done): unified the ticket-adding guidance across find-omissions.md / start-ticket.md / resolve-ticket.md / split-to-tickets.md. All four now share the same skeleton: (1) mention the shared creation core generic-ticket-creation.js (createTickets, PX-2), (2) name the typed seed this flow uses (resolving / crimeDeferral / deferral / bulk), (3) show the exact command, (4) On success / On failure with atomic zero-writes behavior, (5) safety guarantees. find-omissions.md now frames its manifest as the batch form of the resolving seed, resolving the previous manifest-vs-seed terminology split.

### Independence correction (reverted after review)
- split-to-tickets.md and add-tickets-for-phase.js were initially included in PX-2 (same-family survey). Review determined split-to-tickets is an independent phase-splitting pipeline, not a ticket-adding flow from an existing ticket. Both files were reverted to their pre-PX-2 state (git checkout).
- C004 contract/test now cover only start-ticket.md and resolve-ticket.md. The generic core keeps its bulk seed (tested independently via createTickets); add-tickets-for-phase.js calls bulkAddTickets directly again.
Helpfulness-parity check (appended after done): audited find-omissions.md / start-ticket.md / resolve-ticket.md ticket-adding sections element-by-element. Found and fixed two gaps: (1) find-omissions.md lacked the post-creation OLD-to-NEW content rewrite + PRESERVE relational-fields guidance that start/resolve provide (added); (2) resolve-ticket.md lacked the explicit field rewrite order that start lists (added). All three now share the full helpfulness matrix: shared core / seed type / seed shape / exact command / On success+On failure (atomic zero-writes) / OLD-to-NEW rewrite / PRESERVE list / field rewrite order.
Command-example parity (appended after done): the user noted start/resolve lacked find-style actual command-execution examples. Audited and found start/resolve DID have fenced bash blocks but they read as templates (echo pipe with literal (work item)/... placeholders, embedded in prose). Restructured both to match find: a clear lead-in (Run it:) plus a concrete example command with realistic values and a # Example comment. All three ticket-adding sections now present runnable-in-spirit command blocks.

CLI flag simplification (appended): removed the --source-root and --tickets CLI flags from the ticket-adding scripts. batch-create-resolving-tickets.js / create-deferral-ticket.js / create-crime-deferral-ticket.js now always use the current directory as the source root and ./Tickets.json as the tickets path. The internal functions (runBatchCreate / createResolvingTickets / createDeferralTicket / createCrimeDeferralTicket) keep their path parameters for testability; only the CLI flags were removed. Command docs updated; parseArgs now rejects the removed flags.

CLI minimalization (appended): removed the --manifest and --rewrites flags from batch-create-resolving-tickets.js. The manifest is now always piped via stdin (consistent with create-deferral-ticket / create-crime-deferral-ticket); no rewrite-map file is written (the marker rewrite happens internally, and the embedded stubs[] preserve traceability). Final CLI: echo <manifest-json> | node batch-create-resolving-tickets.js [--no-write]. Internal functions keep their path parameters for testability.

Spec-consistency correction (appended): updated the ticket's scope/acceptanceCriteria/invariants/contracts/testUnit/testIntegration/planTestCode fields to the minimal CLI (echo <manifest-json> | node batch-create-resolving-tickets.js [--no-write]; Tickets.json always ./Tickets.json; source root cwd). Previously these fields still documented the removed --source-root/--tickets/--manifest/--rewrites flags, contradicting the implementation. Re-exported specs now match the command docs and the actual scripts.
Review report:
- Static quality check: passed (0 issues)
- Translatability: no issues (functions are verb phrases: parseArgs, createResolvingTickets, createTickets, createOne, setStubDeferredTo, ...)
- Tests: 30/30 passed via make test-stub-resolution and node --test
- verify-final-contracts: 100% coverage for PX-1 and PX-2; validate-ticket-targets verifiedEmpty
- Stubs: conver tree clean (0 stubs); no-excuse gate passes; crimes 0
- Annotation: source files carry [::TICKET::] PX-1/PX-2 annotations; AMBIGUOUS in find-all-stubs.js resolved. Fixtures (tests/fixtures/src/*.rs) are intentionally unannotated deterministic test INPUTS (line numbers are load-bearing) - the --verify missing entries for them are expected false positives. PX-1 --verify flags PX-2-owned files (create-deferral/crime/generic-ticket-creation) because they carry PX-2 annotations, not PX-1 - a cross-ticket false positive in this combined review.
- Issues found and fixes applied during review: resolved AMBIGUOUS marker in find-all-stubs.js (SKIP_DIRS change, PX-2); re-injected PX-2 annotations into changed source lines; restored fixtures after annotation-script contamination; spec consistency corrections (CLI flag references updated to the minimal form).

## PX-2 — 0 locations, not implemented

Not found
