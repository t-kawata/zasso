---
description: Creates and details an implementation specification (spec) document.
argument-hint: <P{phaseID}-{ticketID}>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /make-ticket

Role: Creates and details an implementation specification (spec) document.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Position in the Workflow

Flow: `make → plan → start → review`. Current: `make`.

| Stage | Role |
|---|---|
| `make` | Create/detail implementation spec |
| `plan` | Detailed implementation-level planning |
| `start` | Implementation |
| `review` | Review completed ticket |

Upstream contract: ticket-definition process provides a ticket key and, if present, ticket metadata.
Downstream contract: implementation-planning process consumes a schema-valid spec.
Done: validated `Tickets.json` ticket, `specs/<ticketKey>.md`, status `made`.

## Argument Interpretation

In:
- `$ARGUMENTS`: required `P{phaseID}-{ticketID}`; e.g. `P0-1`, `PX-53`
- pass unchanged to `show-ticket-context.js --ticket-key`
- missing, numeric-only, or other format → error; stop
- Run from the package directory that holds the target ticket's `Tickets.json`. Steps 0 and 1 resolve that file relative to the current directory, so a same-keyed ticket in another directory is not the target.

## Boy Scout Rule

Every new spec `Boy Scout Rule — Translatability Plan` includes:
- function names: verb phrases
- variable names: domain concepts
- one function: one responsibility
- hardcoded values: named constants
- no swallowed errors
- proactive improvement of violating existing code, inside and outside scope

## List of Scripts Used

Root: `.claude/scripts/tickets/`.

| Script | Arguments / contract |
|---|---|
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--for-spec] [--plan] [--no-implementation-order]`; Step 1/9; emits ticket Markdown; Step 9 `--for-spec` emits spec content |
| `check-ticket-prerequisites.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--tickets=<path>] [--workspace=<root>]`; Step 0; exit 0 = pass or skip, exit 1 = named `PREREQUISITE_*` failure |
| `verify-make-distribution.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--tickets=<path>] [--spec=<path>]`; Step 9.5 (post-write); always run; `skipped:no-distribution` exits 0 |
| `ensure-ticket.js` | `--ticket-key=... --title="..." [--background=...] [--scope='["..."]'] [--test-unit='["..."]'] [--test-integration='["..."]'] [--test-exceptions='["..."]'] [--default-files='["..."]'] [--acceptance-criteria='["..."]'] [--contracts='[{...}]'] [--notes=...]`; Step 2B; internally `add-ticket.js → show-ticket-context.js`; derives spec path only; does not create it |
| `insert-field-template.js` | `<Tickets.json> P{phaseID}-{ticketID}`; Step 3; inserts markers in 11 fields; simultaneously sets `created_at`/`updated_at` |
| `list-remaining-stubs.js` | `<Tickets.json> P{phaseID}-{ticketID}`; Step 6; lists remaining `[::TEMPLATE-STUB::]` in natural language; exit 0: all replaced |
| `update-ticket.js` | `<Tickets.json path> P{phaseID}-{ticketID}`; stdin update JSON; Step 6/10; overwrites fields; handles string/array distinction |
| `verify-make-contracts.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> --tickets=<Tickets.json>`; Step 7; checks each Contract pre/post/invariant in `testUnit` or `testIntegration`, justified `testExceptions`, nonempty contracts; exit 0 pass, 1 fail |
| `add-ticket.js` | `<Tickets.json path> P{phaseID}`; stdin ticket JSON; called internally by `ensure-ticket.js` |

## Workflow

Invariants:
- Step 1 Markdown is the source of concrete paths and keys for later commands.
- Never write spec before Steps 7 and 8 pass.
- Implementation order: Red → Green → Refactor; no skip, reorder, or parallel execution.

### Step 0: Implementation-prerequisite gate (conditional)

```bash
node .claude/scripts/tickets/check-ticket-prerequisites.js --ticket-key=$ARGUMENTS
```

- exit 0 → Step 1.
  - `skipped:no-prerequisites` → the ticket carries no distribution prerequisites (Case B or a pre-split ticket); Step 1 continues unchanged.
  - `skipped:ticket-not-found` → Step 1 will create the ticket in Case B/C; continue.
- exit 1 with `PREREQUISITE_NOT_DONE`, `PREREQUISITE_TICKET_MISSING` or `PREREQUISITE_TICKETS_MISSING` → stop. The named ticket or package must reach `done` or `reviewed` before this ticket may enter make → plan → start → review.
- The gate re-derives the prerequisite set and placement from the graph, artifact, contract registry and tree manifest, compares them with `ticket.prerequisites`, and rejects a stale or edited field with `PREREQUISITE_SET_MISMATCH` or `PREREQUISITE_NOT_BEFORE`. It never invents an owner or a prerequisite.
- The same gate runs at the start of `/plan-ticket`, `/start-ticket` and `/review-ticket`, so a direct entry cannot bypass the make-stage check.

### Step 1: Display context (show-ticket-context.js)

```bash
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=$ARGUMENTS
```

Output: every nonempty ticket field:

| Section | Content |
|---|---|
| `# {ticketKey}: {title} [{status}]` | H1/status |
| `## RFC Reference` | RFC-section references |
| `## Background` | background/purpose |
| `## Scope` | implementation-scope bullets |
| `## Implementation Target Files` | target files |
| `## To show related RFC graph details` | `query.js` usage and NODE-IDs; only if `pipelineAvailable`; Step 5 first investigation entry |
| `## Investigation` | material investigation evidence |
| `## Acceptance Criteria` | happy/error/edge pass conditions |
| `## Invariants` | normal/error/internal/boundary conditions |
| `## Contracts — mandatory 100% test coverage in TDD Red phase` | only nonempty edge and boundary contracts; each Precondition/Postcondition/Invariant |
| `## Operation-Boundary Contracts — mandatory 100% test coverage in TDD Red phase` | only nonempty step contracts; each step's Precondition/Postcondition/Invariant, the four axes and contract prose |
| `## Boy Scout Rule` | translatability plan |
| `## Test Plan` | unit/integration/exceptions |
| `## Related Tickets` | related tickets |
| `## Notes` | supplementary information |
| `## Distribution Obligations` / `### Work Share` | only when the ticket carries distribution units; own/shared/foreign step owners, each step's generated contract id and the ctr boundary contracts |
| `## Implementation Prerequisites` | only when the ticket carries prerequisites; each prerequisite ticket or package with its status, source and boundary |
| `## Pipeline Context` | normal mode only: resource paths/existence status |

Missing ticket → Not Found.

### Step 1.5: Distribution brief (conditional)

Run only when Step 1 output contains `## Distribution Obligations` or `## Implementation Prerequisites`. If it does not, skip to Step 2; Case B and a pre-split ticket keep their old workflow.

Treat the section as authoritative machine output. Read it in this order:

1. **Own work** — units whose `obligation.mode` is `implement`, `steps`, `flow` or `obligation`. Implement every local step in the order shown; do not aggregate or reorder it. The Work Share `contract` column carries the generated contract id (for example `C500`); name that id in the test plan because Gate S scans the Red tests for `@verifies <id>`.
2. **Shared work** — `### Work Share` step owners that are another ticket key (`P{phaseID}-{ticketID}` or `PX-{id}`) or a package id (`package pkg-*`). Do not reimplement a shared step; the counterpart is an integration dependency and the boundary contract is the interface. A foreign step is an interface only when it crosses a boundary or exchanges a `consumes`/`produces` fact with a local step; other foreign steps are informational.
3. **Reference work** — units whose `obligation.mode` is `reference`; consume the provider, never reimplement it. Name the `implementer ticket` key or `provider packages` in `testIntegration` (or `testUnit` for a unit-level consumption assertion). A note alone does not satisfy the gate.
4. **Boundary contracts** — each `ctr-*` unit's `direction` and `counterpart`, and its precondition, postcondition and invariant. These are the shared invariant the two sides must agree on. The registry contract id is `contract-<boundary_id>`; the Gate S/R annotation uses that exact id.
5. **Implementation prerequisites** — `## Implementation Prerequisites` lists every ticket or package that must reach `done` or `reviewed` before this ticket may be implemented. Read the named provider ticket's spec and implementation as integration context; never reimplement it. The list is derived by the split; never edit it by hand.

If the package view is unreadable, the brief prints `other steps: not available`; do not invent an owner or a contract. Investigate the source named in Step 1 before filling the field.

### Step 2: Decision branching

Branch on Step 1.

**Case A: Ticket exists**

Keep Step 1 Markdown; continue Step 3. auto; never ask.

**Case B: Ticket missing + prior conversation agreement**

Use all agreed conversation information:

```bash
node .claude/scripts/tickets/ensure-ticket.js \
  --ticket-key=$ARGUMENTS \
  --title="(title confirmed from conversation)" \
  [--background="(background explanation from conversation)"] \
  [--scope='["item1","item2"]'] \
  [--test-unit='["UT: test item 1","UT: test item 2"]'] \
  [--test-integration='["IT: module A+B integration test"]'] \
  [--test-exceptions='["Cannot be unit-tested due to integration dependency"]'] \
  [--default-files='["src/main.rs"]'] \
  [--acceptance-criteria='["Happy path: ...","Error case: ...","Edge case: ..."]'] \
  [--contracts='[{"id":"C001","sourceEdge":"...","precondition":"...","postcondition":"...","invariant":"..."}]'] \
  [--notes="(supplementary information)"]
```

- JSON arrays: `scope`, `test-unit`, `test-integration`, `test-exceptions`, `default-files`, `acceptance-criteria`, `contracts`.
- Strings: `background`, `notes`.
- `test-unit`: automated `UT:` tests; `test-integration`: automated `IT:` tests; `test-exceptions`: supplement, not substitute.
- Keep emitted Markdown; continue Step 3.

**Case C: Ticket missing + no prior conversation**

Reply exactly: `No prior information available to create ticket & spec, so /make-ticket is interrupted.` Stop.

### Step 3: Insert template markers

```bash
node ".claude/scripts/tickets/insert-field-template.js" "Tickets.json" "$ARGUMENTS"
```

Markers: `[::TEMPLATE-STUB::<field-name>::]` in 11 fields.

### Step 4: Full understanding of Universal Implementation Order

Apply during Step 5 investigation and Step 6 test-field completion.

#### Reference — Implementation Order (TDD Red-Green-Refactor)

**1. Red — Fully Implement Failing Tests**

Before any implementation code, write failing tests covering 100% of Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants.

- Contract first: translate every Precondition/Postcondition/Invariant to input schemas, output assertions, invariant predicates; then concrete tests.
- Cover all observable behavior, edge cases, failure modes, invariants. Uncovered behavior is undefined; review fails.
- Deterministic yet fundamentally untestable → architectural defect; redesign before implementation.
- Confirm failures are due to absent implementation. Accidental Green, including meaningless assertions, is invalid.

**2. Green — Implement Behavior (No Stubs, No Test Modification)**

Implement the specified generalized behavior. Tests verify correctness; passing tests is not the end.

- No hardcoding, input-specific branching, stubbed returns, or disguised Green.
- If tests cannot distinguish genuine behavior from disguised Green, add tests before implementation.
- Never modify, delete, or weaken tests to pass.
- Unprovable correctness is invalid; restructure design or implementation until provable.

**3. Refactor — Apply the Boy Scout Rule (Green State Only)**

Refactor only after all tests are Green.

- In touched code, remove `unwrap()`, hardcoded values, false comments, untested code; readability = translatability.
- Verify Green before and after each refactor. Break Green → rollback immediately.

**Definition of Done**

All required:
- tests fully and precisely specify intended behavior
- all tests pass Green
- tests empirically guarantee correctness; no disguised Green
- no gap between intended behavior and test coverage

Green without Red, test-modified Green, or stub Green → incomplete.

#### Test Field Reference

| Field | Requirement | Format |
|---|---|---|
| `testUnit` | automated individual function/module tests; normal/edge/failure | `UT:` |
| `testIntegration` | automated multi-module tests; identify integrated tickets/modules | `IT:` |
| `testExceptions` | untestable item; technical reason; why not deterministic-but-fundamentally-untestable | free text |

`UT:` + `IT:` must verify all implementation correctness. `testExceptions` supplements; never substitutes.

### Step 5: Design and source code investigation

- `pipelineAvailable=true`: use Step 1 `query.js` instructions; query every `Related RFC graph NODE-ID`; obtain all design information; then investigate concrete source.
- `pipelineAvailable=false`: spot-investigate using prior conversation plus direct source grep/read.
- Step 1.5 ran: also read the counterpart ticket(s) in the same `Tickets.json` and the counterpart package's `SEQUENCES.json`/`Tickets.json` when visible. A shared step's interface is its boundary contract; a reference unit's provider is the owner that must exist before this ticket's tests can run.

### Step 6: Replace template markers

Replace all markers in all 11 fields from investigation evidence.

Quality: materially evidenced, high-density, substantially more concrete, detailed, and longer than Step 1/2 output. Enumerate type signatures, paths, data structures, error types. Placeholder content fails.

**Phase 1 — Test first (TDD)**

Fill `testUnit`, `testIntegration`, `testExceptions` first. Do not fill other fields until test plan is solid.

**Phase 1.5 — Contracts definition and expansion (mandatory)**

Before remaining fields:
- existing Contracts → expand using investigation; missing Contracts → define from investigation and RFC graph analysis
- Precondition → concrete input schemas/type definitions/valid-invalid inputs
- Postcondition → concrete output assertions/state-transition predicates
- Invariant → assertable predicates, e.g. `assert!()`, `debug_assert!()`, property-based invariants
- every translated element maps to at least one `testUnit`
- untestable Contract element → Step 5; refine Contract; retry

**Phase 1.6 — Distribution-driven tests and contracts (conditional)**

Run only when Step 1.5 ran. For every distribution unit:

- `implement` unit → at least one `testUnit` or `testIntegration` entry names the unit id or operation id. Every non-empty contract-bearing field in `Distribution Obligations` (`finalityPredicate`, `idempotencyScope`, `allowedStatusTransitions`, `initialStatus`, `cancellationRule`, `reversalOrRecoveryRule`, `rejectCodeFamilies`, `registryContribution`, `boundaryEffects`, `requiredAuthority`, `requiredPreStateCheckpoint`, `requiredProofClasses`, `requiresRemoteTimeHandshake`, `requiresSessionBinding`, `externalDependencyClass`, `resultObjectClasses`) and every non-empty surface field (`rest`, `websocket`, `cli`) is named in `testUnit`/`testIntegration` or in a justified `testException`. `verify-make-distribution` reports `OPERATION_OBLIGATION_UNPLANNED` by field name.
- local sequence step → its generated contract id, its precondition, postcondition and invariant, plus `consumes`, `produces`, `errors` and `crosses` when present, appear in the test plan (`testUnit` or `testIntegration`) in artifact order. Each non-empty axis fact is named in the test plan; `verify-make-distribution` reports `STEP_CONTRACT_UNTESTED` by contract id and `STEP_AXIS_NOT_DELIVERED` by step and axis.
- shared sequence step that is interface-relevant (crosses a boundary, or exchanges a `consumes`/`produces` fact with a local step) → a `testIntegration` entry names the owner (counterpart ticket key or package id), the step id, and the crossed boundary id when present. Other foreign steps need no entry. Do not add an implementation test for a foreign step. `verify-make-distribution` reports `SHARED_STEP_INTEGRATION_MISSING` or `SHARED_STEP_OWNER_UNKNOWN`.
- `reference` unit → a consumption test naming the `implementer ticket` or provider package in `testUnit`/`testIntegration`; a note alone is `SHARED_WORK_UNDECLARED`. Never implement the provider.
- `ctr-*` unit → a test asserts its precondition, postcondition and invariant; keep the projected contract in `contracts` unchanged. The contract id is `contract-<boundary_id>` and the test carries `@verifies contract-<boundary_id>`. The id must also appear in `testUnit` or `testIntegration`; `verify-make-distribution` reports `BOUNDARY_CONTRACT_UNTESTED` when it does not.
- A sequence unit is checked against the package `SEQUENCES.json`; an unreadable view is `DISTRIBUTION_VIEW_MISSING`, not a silent skip of the foreign-step check.
- A machine-projected step or boundary contract is never removed, shortened or re-derived by hand. If it is wrong, fix the producer and re-split; do not edit the ticket around it.

**Phase 2 — All remaining fields**

Fill `investigation`, `boyScoutPlan`, `scope`, `invariants`, `background`, `instrumentation`, `notes`, `acceptanceCriteria`.

| Field | Type | Markers | Required content |
|---|---|---:|---|
| `invariants` | string | 4 | normal establishment/error/internal/boundary |
| `background` | string | 4 | goal/purpose/motivation/constraints |
| `scope` | array | 13 | change path/action/detail/before-after/api/schema/config/dep; non-change item/why; impact component/nature/response |
| `testUnit` | array | 4 + Contracts | normal/error/boundary/invariant; Contract pre→input, post→output, invariant→predicate |
| `testIntegration` | array | 4 | integration point/verification/prerequisites/related tickets |
| `testExceptions` | array | 3 | item/reason/alternative verification |
| `instrumentation` | string | 4 | logging/metrics/error tracking/health check |
| `notes` | string | 5 | implementation steps/risks/caveats/open items/future improvements |
| `acceptanceCriteria` | array | 3 | happy/error/edge |
| `investigation` | string | 1 | source-investigation evidence |
| `boyScoutPlan` | string | 1 | translatability improvement plan |
| `contracts` | array | 5 | `C000` ID/source edge/precondition/postcondition/invariant; each maps to `testUnit` |

String: replace whole string per marker line. Array: replace marker elements.

```bash
# string
echo '{"invariants":"- 【Normal establishment】Input values must pass schema validation\n- 【Invariant on error】DB integrity is maintained even on error"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"

# array
echo '{"testUnit":["UT: [Normal] Valid input returns correct result","UT: [Error] Invalid input returns an error"]}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

Heal-loop stubs:

```bash
node ".claude/scripts/tickets/list-remaining-stubs.js" "Tickets.json" "$ARGUMENTS"
```

- exit 1 → continue Step 6 replacements; re-run
- exit 0 → Step 7

### Step 7: Contracts verification

Order: verify Contracts → validate STUB targets → write spec after pass → update status.

```bash
node .claude/scripts/tickets/verify-make-contracts.js --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
```

- 0 → Step 8.
- 1 → Step 6; repair markers, Contract coverage, or exception justification; re-run Step 7

### Step 8: STUB enumeration and validation (mandatory)

No spec write before every gate passes.

**Step 8a — Enumerate STUBs**

```bash
node .claude/scripts/tickets/enumerate-ticket-targets.js \
  --dir=. --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
```

Enumerates source-tree `[::STUB::]` markers and validates structural tracking by `targetStubs`/`targetCrimes`.

**Step 8b — Validate targets**

```bash
node .claude/scripts/tickets/validate-ticket-targets.js \
  --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
```

**Step 8c — No-excuse gate**

```bash
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```

This ticket must own neither terminal-excuse STUB (Check A/B) nor stale-key STUB (Check C); owning one turns implementation into solving an excuse and prevents convergence.

Heal-loop targets:
- run 8a → 8b → 8c in this order
- 8a exit 1 or stderr; or 8b/8c exit 1 → read stderr; fix; re-run all three
- all exit 0 → Step 9
- no skip; declaring `made` before pass violates contract

### Step 9: Write spec file

`--for-spec` writes all `Tickets.json` fields into the spec, including graph node details, edge relationships, and file paths. Design with the four Design Context sections automatically appended by `dump-ticket-graph-commands.js` and `dump-node-context-to-spec.js`.
When the ticket carries sequence-step contracts, the spec must contain them under `## Operation-Boundary Contracts` with the generated contract id and its `@verifies` annotation, the precondition, postcondition, invariant, the four typed axes (`consumes`, `produces`, `errors`, `crosses`) and the contract prose for every step. A step contract or its id visible only in raw JSON is a spec defect, because Gate S needs the id to prove Red coverage.
When the ticket carries `prerequisites`, the spec must contain `## Implementation Prerequisites` with every prerequisite ticket or package and its source. A prerequisite visible only in raw JSON is a spec defect.
When the ticket carries a sequence or ctr unit, the spec must also contain `## Distribution Obligations` and its `### Work Share` block: the own work, the shared/foreign owners and the ctr boundary contracts. An operation-only ticket carries `## Distribution Obligations` without a Work Share block. A unit or boundary contract visible only in raw JSON is a spec defect. A ticket with no distribution units writes no such section, so Case B is unchanged.

Destination: exactly `specs/$ARGUMENTS.md`. Do not modify manually.

```bash
mkdir -p specs && \
node .claude/scripts/tickets/show-ticket-context.js \
  --ticket-key="$ARGUMENTS" --for-spec > "specs/$ARGUMENTS.md"
```

### Step 9.5: Distribution delivery gate (post-write, self-skipping)

Run this gate after every spec write. The spec must exist before this gate: the gate checks
the written spec, not a remembered plan. The script decides from the ticket, so do not skip
it on the belief that Step 1.5 did not run; a ticket with no distribution units exits 0 with
`skipped:no-distribution`, which keeps Case B and a pre-split ticket unchanged.

```bash
node .claude/scripts/tickets/verify-make-distribution.js \
  --ticket-key="$ARGUMENTS" --tickets="Tickets.json" --spec="specs/$ARGUMENTS.md"
```

- exit 0, or `skipped:no-distribution` → Step 10. The skip is the Case B path.
- exit 1 → the named `DISTRIBUTION_UNIT_UNTESTED`, `STEP_CONTRACT_NOT_DELIVERED`, `STEP_CONTRACT_UNTESTED`, `BOUNDARY_CONTRACT_NOT_DELIVERED`, `BOUNDARY_CONTRACT_UNTESTED`, `SHARED_WORK_UNDECLARED`, `SHARED_STEP_INTEGRATION_MISSING`, `SHARED_STEP_OWNER_UNKNOWN`, `STEP_AXIS_NOT_DELIVERED`, `OPERATION_OBLIGATION_UNPLANNED`, `DISTRIBUTION_VIEW_MISSING`, `DISTRIBUTION_SPEC_MISSING`, `DISTRIBUTION_SECTION_MISSING` or `WORK_SHARE_SECTION_MISSING` finding names the unit, step, field or section; repair Step 6 and re-run Step 9 to regenerate the spec (or repair Step 9 directly), then re-run Step 9.5.

### Step 10: Update ticket status

```bash
echo '{"status":"made"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```
