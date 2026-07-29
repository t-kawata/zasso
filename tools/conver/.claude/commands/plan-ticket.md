---
description: Formulates an implementation plan for a ticket.
argument-hint: <P{phaseID}-{ticketID}>
---

# /plan-ticket

**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: Every incomplete implementation (stub, mock, placeholder, temporary implementation, by any name) **must** carry a `[::STUB::]` marker without exception. This is an absolute, inviolable law; violations are recorded as "crimes" in Malfeasance.json. In all phases of this command, read Malfeasance.json and verify there are no unresolved crimes. If you discover a violation, resolve it immediately, or add the marker and record it on the spot.

**Role**: Formulates the implementation plan for a ticket and defines the physical review method.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Position in the Workflow

The workflow flow is `make → plan → start → review`, currently executing `plan`.

- **`/make-ticket`**: Creates and details an implementation specification (spec) document.
- **`/plan-ticket`**: Detailed implementation-level planning.
- **`/start-ticket`**: Implementation.
- **`/review-ticket`**: Reviews completed tickets.

## Argument Interpretation

- `P{phaseID}-{ticketID}` format (e.g. `P0-1`, `PX-53`) → Ticket key. Required. Passed to `show-ticket-context.js`'s `--ticket-key`.
- No argument → Interrupt with error
- Numeric only → Interrupt with error
- Anything else → Interrupt with error

## Boy Scout Rule

**Include in the plan improvements to existing code that violates translatability, both inside and outside the scope.** Separately from the list of changed files, create a "Boy Scout Improvements (translatability fixes outside scope)" section specifying which files to fix and what to fix in them.

### Translatability Checks (common to all languages; select grep patterns per language)

- Grep function definitions for functions beginning with a noun
- Grep variable declarations for single-character variables or generic names (`data`, `info`, `tmp`)
- Check for hardcoded numeric literals
- Check for leftover debug output

## List of Scripts Used

Located under `.claude/scripts/tickets/`.

| Script | Arguments | Description |
|--------|-----------|-------------|
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--for-spec] [--plan]` | **Executed in Step 1**. Outputs ticket information in Markdown. With `--plan`, shows interruption message on Not Found. |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` (stdin: update JSON) | Update ticket fields |
| `verify-plan-contracts.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> --tickets=<PATH>` | **Executed in Step 4.5 (Gate P)**. Verifies all contracts have concrete test code patterns in the `planTestCode` field (set by Step 3.5). Gate M (make-ticket) verifies keyword overlap in `testUnit`; Gate P (plan-ticket) verifies actual code patterns in `planTestCode`. |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | Full-text search |
| `scan-crimes.sh` | (none) | **Executed in Step 3**. Crime scan of Malfeasance.json. |
| `review/find-all-stubs.js` | `<path>` | **Executed in Step 3**. Search for all `[::STUB::]` markers. |
| `review/run-quality-checks.js` | `<files...>` | **Executed in Step 5**. Static quality checks. |

## Workflow

### Step 1: Existence check + retrieve ticket information

```bash
node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="$ARGUMENTS" --for-spec --plan
```

If the output starts with `# {ticketKey}: Not Found` → Follow the output, respond with "The ticket does not exist, so /plan-ticket is interrupted." and exit. If Not Found is not the case, design information and methods for exploring related information are output as Markdown; use this as context.

### Step 2: Explore and understand design information, related design information, related ticket information, and source code

Understand the output of Step 1. Then, following "Usage of query.js," execute the following for every Node ID listed in "Related RFC graph NODE-IDs to check" to explore detailed design information. The AI determines how many levels deep to continuously drill. The obtained information **must be backed by actual source code analysis** and included in the implementation plan with material evidence. An implementation plan without material evidence is a hallucination and is strictly prohibited.

```bash
node .claude/scripts/rfc-graph/query.js --graph="</path/to/?-GRAPH.json>" --source="</path/to/RFC-?.md>" --dirs-tree="</path/to/?-Dirs-Tree.json>" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
```

As needed, explore information about related tickets shown in "Related Tickets." The AI determines how many levels deep to continuously drill. The obtained information **must be backed by actual source code analysis** and included in the implementation plan with material evidence. An implementation plan without material evidence is a hallucination and is strictly prohibited.

```bash
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<Ticket KEY to show (e.g. P0-1)> --for-spec --no-implementation-order
```

### Step 3: Crime and stub inspection (mandatory — First-Class Rule)

Read Malfeasance.json and check for unresolved crimes. **As a condition for plan approval**, one of the following must be satisfied:

- **Condition A**: No `open` records exist in Malfeasance.json
- **Condition B**: If `open` records exist, the implementation plan for this ticket includes concrete steps to resolve them

```bash
# Execute crime scan (auto-initializes on first run)
.claude/scripts/tickets/scan-crimes.sh
```

For Condition B, clearly specify the resolution steps for each crime in the plan.

Additionally, verify whether `[::STUB::]` markers affect the plan:

1. List stubs via `find-all-stubs.js`
2. Evaluate whether any stubs can be resolved within this ticket
3. If you find a stub without a `[::STUB::]` marker, use `insert-stub.js` to add the marker and record it as a crime via `malfeasance-create.js`. Do NOT edit source files directly.

```bash
# Insert a [::STUB::] marker (all args required, --description optional)
#   --ticket-ref: Existing ticket key in Tickets.json (e.g. P0-1, PX-77)
#   --file:       Target source file path
#   --line:       1-indexed line number to insert at
#   --tickets-path: Path to Tickets.json
node .claude/scripts/tickets/insert-stub.js \
  --file=src/example.rs --line=5 --ticket-ref=P3-1 \
  --description="Will implement in P3-1" \
  --tickets-path=Tickets.json
```
4. Include resolvable stubs in the plan's implementation scope
5. Leave unresolvable stubs in the plan as notes, clearly stating their relationship to future tickets

```bash
# Search for stubs
node .claude/scripts/tickets/review/find-all-stubs.js .
```

**Active code exploration**: In the source tree targeted by the plan, check whether incomplete implementations exist in the existing code. If found, use `insert-stub.js` to add a `[::STUB::]` marker and record it as a crime via `malfeasance-create.js`. Do NOT edit source files directly. Reflect the results of this exploration in the "Risks" or "Boy Scout Improvements" section of the plan.

```bash
# Scan for incomplete implementations (todo!, TODO, #[allow], etc.) without [::STUB::]
node .claude/scripts/tickets/scan-incomplete-implementations.js --dir=.
```

### Step 3.5 — Phase 1.5: Contract-to-test-code translation (mandatory)

**Always execute this phase before formulating the plan.** If the ticket defines **Contracts** (Precondition/Postcondition/Invariant), translate each Contract element into concrete test code and write to the dedicated `planTestCode` field. This mirrors make-ticket's Phase 1.5 (spec-level translation to `testUnit`) but takes it one step further: from "testable form" to "actual test code" in a separate field.

For each Contract:

1. **Precondition -> test input code**: Write concrete test input setup code (variable bindings, test data literals, input schema instantiations) as code blocks in testUnit entries
2. **Postcondition -> assertion code**: Write concrete assertion code (assert_eq!, expect(...).to..., should assertions) as code blocks in testUnit entries
3. **Invariant -> predicate code**: Write concrete invariant check code (assert!, debug_assert!, property-based predicates) as code blocks in testUnit entries
4. **Write to planTestCode**: Persist the translated test code to the dedicated `planTestCode` field (not `testUnit`, which remains spec-level only):

```bash
echo '{"planTestCode":["UT: [Normal] Input validation test\n  ```rust\n  let input = \"valid@example.com\";\n  let result = validate(&input);\n  assert!(result.is_ok());\n  ```"]}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

Each Contract element must be represented by at least one testUnit entry containing **actual code** (not prose descriptions). A Contract whose element cannot be expressed as concrete test code is not yet fully specified — return to Step 2 (investigation) to refine.

### Step 4: Formulate the plan

Based on the information obtained from Step 1, Step 2, Step 3, and Step 3.5, formulate the implementation plan.
The plan **must comply with the Implementation Order as the supreme law**.
The plan must safely incorporate the information obtained from Step 1, Step 2, Step 3, and Step 3.5, and must output the same items as the output of show-ticket-context.js from Step 1. The test code from Step 3.5 serves as the concrete basis for the Red-phase implementation plan. However, if the following conditions are not met, proceeding to Step 4.5 (Gate P) is prohibited. If not met, return to Step 2 and redo. If met, proceed to Step 4.5.

**Conditions for proceeding to Step 4.5**
1. **Implementation Order** is fully complied with, and comprehensive behavioral verification through exhaustive unit and integration test code is planned
2. The plan is **significantly more concrete**, **significantly more detailed**, **based on material evidence**, and **high-density information** compared to the show-ticket-context.js output
3. The plan includes code snippets covering implementation to the extent that there are near-zero unknowns at implementation time
4. **Step 3.5 (Phase 1.5) must have been executed** — the plan must reference the concrete test code from Step 3.5, and `planTestCode` in Tickets.json must have been set with code patterns, not prose descriptions

#### Reference — Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

##### 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.

- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.
- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.
- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.

##### 2. Green — Implement Behavior (No Stubs, No Test Modification)

Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.

- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.
- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.
- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.
- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.

##### 3. Refactor — Apply the Boy Scout Rule (Green State Only)

Refactor only after all tests are green. Refactoring in a red state is prohibited.

- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.
- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.

##### Definition of Done

Implementation is considered incomplete unless all of the following are satisfied:

- The tests fully and precisely specify the intended behavior.
- The implementation passes all tests green, without exception.
- Correctness is empirically guaranteed by the tests (not a disguised green).
- No gap exists between test coverage and intended behavior.

Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.

### Step 4.5 — Gate P: Verify contract-to-test-code translation

Before updating the status, verify that all contracts have been translated into concrete test code patterns in the `planTestCode` field. This gate ensures that Step 3.5 was properly executed and that each Contract's Precondition/Postcondition/Invariant is represented by actual test code (not prose descriptions) in the dedicated `planTestCode` field.

```bash
node .claude/scripts/tickets/verify-plan-contracts.js \
  --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
```

- **Exit 0**: All contracts covered with concrete test code -> proceed to validate step below
- **Exit 1**: Missing coverage -> return to Step 3.5, add concrete test code for the reported contracts, re-run Gate P

**Additionally — validate resolutionPlan completeness (mandatory):**

```bash
node .claude/scripts/tickets/validate-ticket-targets.js \
  --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
```

If validate exits 1, return to Step 3.5 to add concrete resolutionPlan entries with code-level detail to each targetStub, then re-run Gate P. **Loop until both verify-plan-contracts and validate-ticket-targets pass before proceeding to Step 5.**

### Step 5: Spec re-export → status update → report plan completion

**Prerequisite**: Gate P (Step 4.5) must have passed before executing this step.

Run the two sub-steps in this order: (1) re-export the spec file to reflect the latest Tickets.json state (including `planTestCode` set in Step 3.5), (2) update status.

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

Report the full plan formulated in Step 4 to the user in Markdown format, and conclude with the following message.
```
Planning is complete. You can start the implementation by running: `/start-ticket $ARGUMENTS`
```
