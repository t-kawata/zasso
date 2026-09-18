---
description: Formulates an implementation plan for a ticket.
argument-hint: <P{phaseID}-{ticketID}>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /plan-ticket

## First-Class Rule — [::STUB::] Marker is an Absolute Obligation

Invariant:
- Every incomplete implementation—stub, mock, placeholder, temporary implementation, any equivalent—has `[::STUB::]`; no exception.
- Violations are crimes in `Malfeasance.json`.
- In every phase: read `Malfeasance.json`; verify no unresolved crime.
- Discover violation → resolve immediately, or add marker and record crime immediately.

Role: Formulate a ticket implementation plan and physical review method.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Position in the Workflow

Flow: `make → plan → start → review`. Current: `plan`.

| Stage | Role |
|---|---|
| `make` | Create/detail implementation spec |
| `plan` | Detailed implementation-level planning |
| `start` | Implementation |
| `review` | Review completed tickets |

Upstream contract: spec-creation process supplies a ticket whose status is `made`, its spec fields, and related design context.
Downstream contract: implementation process consumes an evidence-backed, TDD-ordered plan and concrete Contract test-code patterns.
Done: spec re-exported from current `Tickets.json`; ticket status `planned`; full plan reported to user.

## Argument Interpretation

In:
- `$ARGUMENTS`: required `P{phaseID}-{ticketID}`; e.g. `P0-1`, `PX-53`
- pass unchanged to `show-ticket-context.js --ticket-key`
- missing, numeric-only, or other format → error; stop

## Boy Scout Rule

Plan translatability improvements in and outside scope. Add separate section `Boy Scout Improvements (translatability fixes outside scope)`: file + required fix.

### Translatability Checks

Select language-appropriate grep patterns; check:
- function definitions beginning with noun
- single-character/generic variables: `data`, `info`, `tmp`
- hardcoded numeric literals
- leftover debug output

## List of Scripts Used

Root: `.claude/scripts/tickets/`.

| Script | Arguments / contract |
|---|---|
| `check-ticket-status.js` | `--ticket-key=<key> --phase=plan`; Step 0; status gate |
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--for-spec] [--plan] [--no-implementation-order]`; Step 1; emits ticket Markdown; `--plan` emits Not Found interruption |
| `update-ticket.js` | `<Tickets.json path> P{phaseID}-{ticketID}`; stdin update JSON; updates ticket fields |
| `verify-plan-contracts.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> --tickets=<path>`; Step 4.5 Gate P; verifies Contracts have concrete `planTestCode`; Gate M checks `testUnit` keyword overlap, Gate P checks actual code patterns |
| `search-tickets.js` | `<Tickets.json path> <query>`; full-text search |
| `scan-crimes.sh` | no args; Step 3; scans `Malfeasance.json` |
| `review/find-all-stubs.js` | `<path>`; Step 3; finds `[::STUB::]` |
| `review/run-quality-checks.js` | `<files...>`; Step 5; static quality checks |

## Workflow

Invariants:
- Later gate never PASS unless every earlier gate PASSes.
- All design claims in the plan require material source-code evidence; unsupported plan content is hallucination and prohibited.
- TDD order: Red → Green → Refactor; no skip, reorder, or parallel execution.
- Step 5 requires both Gate P checks PASS.

### Step 0: Status gate — verify ticket is ready for planning

```bash
node .claude/scripts/tickets/check-ticket-status.js --ticket-key="$ARGUMENTS" --phase=plan
```

- exit 0; status `made` → Step 1
- exit 1; status mismatch/error → follow output; reply exactly: `Status gate blocked: /plan-ticket cannot proceed until the ticket status is 'made'. Run /make-ticket first.`; stop

### Step 1: Existence check + retrieve ticket information

```bash
node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="$ARGUMENTS" --for-spec --plan
```

- output starts `# {ticketKey}: Not Found` → follow output; reply exactly: `The ticket does not exist, so /plan-ticket is interrupted.`; stop
- otherwise: retain emitted design information and related-information exploration methods as context; Step 2

### Step 2: Explore and understand design information, related design information, related ticket information, and source code

Read Step 1 context. For every `Related RFC graph NODE-ID to check`, use its `Usage of query.js`; judge required drill depth. Source-code analysis must substantiate every obtained design fact included in the plan.

```bash
node .claude/scripts/rfc-graph/query.js --graph="</path/to/?-GRAPH.json>" --source="</path/to/RFC-?.md>" --dirs-tree="</path/to/?-Dirs-Tree.json>" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
```

As needed, explore `Related Tickets`; judge required drill depth; substantiate included facts with actual source-code analysis.

```bash
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<Ticket KEY to show (e.g. P0-1)> --for-spec --no-implementation-order
```

Then Step 3.

### Step 3: Crime and stub inspection (mandatory — First-Class Rule)

Read `Malfeasance.json`; inspect unresolved crimes. Plan approval requires either:

| Condition | Requirement |
|---|---|
| A | no `open` record in `Malfeasance.json` |
| B | every `open` record has concrete resolution steps in this ticket plan |

```bash
# Execute crime scan (auto-initializes on first run)
.claude/scripts/tickets/scan-crimes.sh
```

Condition B: state resolution steps for each crime clearly in the plan.

Inspect plan-relevant `[::STUB::]`:
1. list all stubs with `find-all-stubs.js`
2. judge which are resolvable in this ticket
3. unmarked stub → use `insert-stub.js`; record crime with `malfeasance-create.js`; never edit source directly
4. resolvable stub → include in implementation scope
5. unresolvable stub → retain as plan note; state relation to future ticket

`insert-stub.js` contract:
- `--resolve-by-ticket`: existing `Tickets.json` ticket that will resolve stub; effective status `todo` (missing status = `todo`); never `PX-{id}`
- `--ticket-key`: required current ticket `$ARGUMENTS`; omission forbidden; `--resolve-by-ticket` must not precede it
- `--stub-reason`: specific, one line, no newline; not generic dependency prose
- `--resolve-plan`: concrete resolver implementation, one line, no newline; not generic implementation prose
- `--file`: target source path
- `--line`: 1-indexed insertion line
- `--tickets-path`: `Tickets.json` path

```bash
node .claude/scripts/tickets/insert-stub.js \
  --file=src/example.rs --line=5 --resolve-by-ticket=P3-2 \
  --stub-reason="P1-3 blocked: User::role changed to enum, login(&str) signature incompatible" \
  --resolve-plan="Replace Ok(()) with INSERT INTO sessions (user_id, token) VALUES (?, ?); add integration test" \
  --tickets-path=Tickets.json \
  --ticket-key="$ARGUMENTS"
```

Heal-loop insert-stub:
- nonzero → read problem/blocking reason/redo instruction; fix arguments; re-run
- never abort command because `insert-stub.js` failed

```bash
node .claude/scripts/tickets/review/find-all-stubs.js .
```

Active exploration: in plan-targeted source, find incomplete implementations. Missing `[::STUB::]` → `insert-stub.js` + `malfeasance-create.js`; never edit source directly. Reflect results in plan `Risks` or `Boy Scout Improvements`.

```bash
node .claude/scripts/tickets/scan-incomplete-implementations.js --dir=.
```

Then Step 3.5.

### Step 3.5 — Phase 1.5: Contract-to-test-code translation (mandatory)

Before plan formulation, translate every Contract Precondition/Postcondition/Invariant into concrete test code; persist in dedicated `planTestCode`, not spec-level-only `testUnit`.

| Contract element | Required actual code |
|---|---|
| Precondition | test input setup: bindings, literals, schema instantiation |
| Postcondition | assertions: `assert_eq!`, `expect(...).to...`, `should` |
| Invariant | predicate checks: `assert!`, `debug_assert!`, property-based predicates |

```bash
echo '{"planTestCode":["UT: [Normal] Input validation test\n  ```rust\n  let input = \"valid@example.com\";\n  let result = validate(&input);\n  assert!(result.is_ok());\n  ```"]}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

- Every Contract element: at least one `testUnit` entry containing actual code, not prose.
- Element not expressible as concrete code → Step 2; refine investigation/Contract; retry.

Then Step 4.

### Step 4: Formulate the plan

Use Step 1/2/3/3.5 information. Output the same items as Step 1 `show-ticket-context.js`; incorporate all information safely. Step 3.5 test code is Red-phase plan basis. Implementation Order is supreme law.

Step 4.5 entry requires all:
- Implementation Order compliance; exhaustive unit/integration behavioral verification planned
- plan materially evidenced, high-density, and substantially more concrete/detailed than Step 1 context
- implementation snippets reduce implementation-time unknowns to near zero
- Step 3.5 complete: plan references its concrete test code; `Tickets.json.planTestCode` holds code patterns, not prose

Any missing → Step 2; redo. All met → Step 4.5.

#### Reference — Implementation Order (TDD Red-Green-Refactor)

**1. Red — Fully Implement Failing Tests**

Before implementation code, write failing tests with 100% coverage of Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, Invariants.

- Contract first: translate every Precondition/Postcondition/Invariant to testable input schemas, output assertions, invariant predicates; then implement concrete tests.
- Cover all observable behavior, edges, failures, invariants. Uncovered behavior is undefined; review fails.
- Deterministic but fundamentally untestable → architectural defect; redesign before implementation.
- Confirm failures arise from absent implementation. Accidental Green/meaningless assertions are invalid.

**2. Green — Implement Behavior (No Stubs, No Test Modification)**

Implement generalized specified behavior; tests verify correctness, not the goal.

- No hardcoding, input-specific branches, stub returns, or disguised Green.
- If genuine behavior cannot be distinguished from disguised Green, add tests before implementation.
- Never modify/delete/weaken tests to pass.
- Unprovable correctness is invalid; restructure design or implementation until provable.

**3. Refactor — Apply the Boy Scout Rule (Green State Only)**

Refactor only after all tests Green.

- Improve touched code: remove `unwrap()`, hardcoded values, false comments, untested code; readability = translatability.
- Verify Green before and after every refactor. Break Green → immediate rollback.

**Definition of Done**

All required:
- tests fully and precisely specify intended behavior
- all tests Green, no exception
- tests empirically guarantee correctness; no disguised Green
- no gap between test coverage and intended behavior

Green without Red, test-modified Green, or stub Green → violation and incomplete work.

### Step 4.5 — Gate P: Verify contract-to-test-code translation

Gate P-1: every Contract has actual, non-prose test-code patterns in dedicated `planTestCode`.

```bash
node .claude/scripts/tickets/verify-plan-contracts.js \
  --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
```

- exit 0 → Gate P-2
- exit 1 → Step 3.5; add reported concrete test code; re-run Gate P

Gate P-2: every `targetStub` has complete code-level `resolutionPlan`.

```bash
node .claude/scripts/tickets/validate-ticket-targets.js \
  --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
```

- exit 1 → Step 3.5; add concrete code-level `resolutionPlan` for each reported `targetStub`; re-run Gate P
- both Gate P-1/P-2 pass → Step 5

### Step 5: Spec re-export → status update → report plan completion

Prerequisite: Gate P PASS.

Order:
1. Re-export spec from latest `Tickets.json`, including Step 3.5 `planTestCode`.
2. Update status.
3. Report full Step 4 plan in Markdown; conclude with fixed message.

#### 5-1: Re-export spec file

```bash
mkdir -p specs && \
node .claude/scripts/tickets/show-ticket-context.js \
  --ticket-key="$ARGUMENTS" --for-spec > "specs/$ARGUMENTS.md"
```

#### 5-2: Update ticket status

```bash
echo '{"status":"planned"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

Reply with the full Step 4 plan in Markdown. Conclude exactly:

```
Planning is complete. You can start the implementation by running: `/start-ticket $ARGUMENTS`
```
