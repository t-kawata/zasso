---
description: Creates and details an implementation specification (spec) document.
argument-hint: <P{phaseID}-{ticketID}>
---

# /make-ticket

**Role**: Creates and details an implementation specification (spec) document.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Position in the Workflow

The workflow flow is `make → plan → start → review`, currently executing `make`.

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

When creating a new spec, the spec's "Boy Scout Rule — Translatability Plan" section must always include: function names as verb phrases, variable names as domain concepts, one function one responsibility, hardcoded values as named constants, no error swallowing. **Include a plan to proactively improve existing code that violates translatability, both inside and outside the scope.**

## List of Scripts Used

Located under `.claude/scripts/tickets/`.

| Script | Arguments | Description |
|--------|-----------|-------------|
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--for-spec] [--plan] [--no-implementation-order]` | **Executed in Step 1 / Step 6**. Outputs ticket information in Markdown. In Step 6, uses `--for-spec` to write out the spec file. |
| `ensure-ticket.js` | `--ticket-key=... --title="..." [--background=...] [--scope='["..."]'] [--test-unit='["..."]'] [--test-integration='["..."]'] [--test-exceptions='["..."]'] [--default-files='["..."]'] [--acceptance-criteria='["..."]'] [--notes=...]` | **Executed in Step 2 Case B**. Sequentially calls add-ticket.js → show-ticket-context.js. Only derives the spec path; does not create the file. |
| `insert-field-template.js` | `<Tickets.json> P{phaseID}-{ticketID}` | **Executed in Step 3**. Inserts template merge markers into 11 fields. Also sets `created_at`/`updated_at` simultaneously. |
| `list-remaining-stubs.js` | `<Tickets.json> P{phaseID}-{ticketID}` | **Executed in Step 5b loop**. Lists remaining `[::TEMPLATE-STUB::]` markers in natural language. exit 0 = all replacements complete. |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` (stdin: update JSON) | **Executed in Step 5b / Step 6**. Updates fields (overwrite). Automatically handles string/array distinction. |
| `add-ticket.js` | `<PATH of Tickets.json> P{phaseID}` (stdin: ticket JSON) | Adds a ticket (called internally by ensure-ticket.js). |

## Workflow

**Important**: show-ticket-context.js outputs Markdown. In subsequent Steps, read the paths and keys displayed in that Markdown and use them to supply concrete values in commands.

### Step 1: Display context (show-ticket-context.js)

Execute show-ticket-context.js and retrieve the ticket state in Markdown.

```bash
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=$ARGUMENTS
```

The output Markdown includes all fields that have values in the ticket (no display if empty):

| Section | Content |
|---------|---------|
| `# {ticketKey}: {title} [{status}]` | H1 heading + status badge |
| `## RFC Reference` | Reference to sections in the RFC document |
| `## Background` | Background and purpose |
| `## Scope` | Bullet list of implementation scope |
| `## Implementation Target Files` | List of implementation target files |
| `## To show related RFC graph details` | Usage of query.js and NODE-IDs (only when pipelineAvailable). Investigation entry point referenced first in Step 4a |
| `## Investigation` | Material evidence obtained from investigation |
| `## Acceptance Criteria` | Pass conditions (Happy path / Error case / Edge case) |
| `## Invariants` | Invariant conditions (normal establishment / on error / internal state / boundary values) |
| `## Boy Scout Rule` | Translatability improvement plan |
| `## Test Plan` | Unit Tests / Integration Tests / Exceptions |
| `## Related Tickets` | List of related tickets |
| `## Notes` | Supplementary information |
| `## Pipeline Context` | Table listing all resource paths and their existence status (normal mode only) |

If the ticket does not exist, a Not Found message is displayed.

### Step 2: Decision branching

Branch based on the output of Step 1.

#### Case A: Ticket exists

Keep the Markdown displayed in Step 1 as context and **proceed to Step 3**. No interaction required.

#### Case B: Ticket does not exist + prior conversation exists

If you have already conversed with the user and reached agreement on this ticket's content, execute the following command.

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
  [--notes="(supplementary information)"]
```

**About optional arguments**: `--scope` / `--test-unit` / `--test-integration` / `--test-exceptions` / `--default-files` are passed as JSON arrays. `--background` / `--notes` are strings. Filling in all information obtained from the conversation reduces empty sections and makes subsequent steps more efficient. `--test-unit` contains the unit test plan (`UT:` prefix), `--test-integration` contains the integration test plan (`IT:` prefix), and `--test-exceptions` contains reasons for items that cannot be tested. Both `UT:` and `IT:` are automated test code; `testExceptions` is a supplement to this, not a substitute.

This script internally executes add-ticket.js → show-ticket-context.js sequentially, finally displaying the ticket information in Markdown. Keep that output as context and **proceed to Step 3**.

#### Case C: Ticket does not exist + no prior conversation

Respond to the user with "No prior information available to create ticket & spec, so /make-ticket is interrupted." and exit.

### Step 3: Insert template markers into ticket

Each field gets markers in `[::TEMPLATE-STUB::<field-name>::]` format, making it clear which items the AI should fill in subsequent steps.

```bash
node ".claude/scripts/tickets/insert-field-template.js" "Tickets.json" "$ARGUMENTS"
```

### Step 4: Full understanding of Universal Implementation Order

As stated in the Reference — Implementation Order section below, TDD is an absolute obligation. This rule serves as the law when filling in the testUnit / testIntegration / testExceptions stubs in Step 5b. During the investigation in Step 5, you must always reason in compliance with the Implementation Order.

#### Reference — Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

##### 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

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

#### Test Field Reference

| Field | Requirement | Format |
|-------|------------|--------|
| `testUnit` | Unit tests — automated tests covering individual functions/modules | `UT:` prefix; enumerate normal/edge/failure cases |
| `testIntegration` | Integration tests — automated tests spanning multiple modules | `IT:` prefix; specify which tickets/modules are integrated |
| `testExceptions` | Items that cannot be tested, with mandatory technical justification | Free text; every item must state why it cannot be tested, **and explain why this is not a case of "deterministic yet fundamentally untestable" (which is an architectural defect, not a testing gap)** |

`UT:` and `IT:` are automated test code, not manual tests. Together they must enable verification of the correctness of all implementation code. `testExceptions` is a supplement to this, not a substitute.

### Step 5: Investigation + template filling

#### 5a: Design and source code investigation

Choose the investigation method based on the requirements of each field defined in the template.

- **pipelineAvailable is true**: Conduct investigation utilizing the output information from show-ticket-context.js and the related graph node information obtained via query.js usage. Reference all NODE-IDs in "Related RFC graph NODE-IDs to check" within the output using the script execution commands presented in "Usage of query.js," and after obtaining all design information, begin the concrete source code investigation.
- **pipelineAvailable is false**: Spot investigation (in addition to prior conversation with the user, directly grep / read source code to gather information).

#### 5b: Replace template markers

Based on the investigation results, replace all `[::TEMPLATE-STUB::<field-name>::]` markers in the 11 fields with actual content.

**Quality standards (strict compliance)**: The content written here must be **significantly more concrete**, **significantly more detailed**, **based on material evidence**, and **high-density information** compared to the show-ticket-context.js output from Step 1 or the ensure-ticket.js output from Step 2. The character count of each item should increase substantially. Simple placeholders are considered "cutting corners." Concretely enumerate type signatures, file paths, data structures, and error types.

**Phase 1 — Test first (TDD)**: Following the Implementation Order (presented in Step 4), first replace all markers in `testUnit`, `testIntegration`, and `testExceptions`. Do not start on other fields until the test plan is solidified.

**Phase 2 — All remaining fields**: Replace all remaining markers in `investigation`, `boyScoutPlan`, `scope`, `invariants`, `background`, `instrumentation`, `notes`, `acceptanceCriteria`.

The types and marker configuration for each field are as follows:

| Field | Type | Marker Count | Meaning of Each Marker |
|-------|------|-------------|----------------------|
| `invariants` | string | 4 | Normal establishment condition / Invariant on error / Internal state invariant / Boundary invariant |
| `background` | string | 4 | Goal / Purpose / Motivation / Constraints |
| `scope` | array | 13 | Changes (path/action/detail/before-after/api/schema/config/dep) / Non-change scope (item/why) / Impact scope (component/nature/response) |
| `testUnit` | array | 4 | Normal / Error / Boundary / Invariant |
| `testIntegration` | array | 4 | Integration point / Verification / Prerequisites / Related tickets |
| `testExceptions` | array | 3 | Item / Reason / Alternative verification |
| `instrumentation` | string | 4 | Logging / Metrics / Error tracking / Health check |
| `notes` | string | 5 | Implementation steps / Risks / Caveats / Open items / Future improvements |
| `acceptanceCriteria` | array | 3 | Happy path / Error case / Edge case |
| `investigation` | string | 1 | Set of evidence obtained from code investigation |
| `boyScoutPlan` | string | 1 | Translatability improvement plan |

For **string** type fields, replace the entire string per marker line. For **array** type fields, replace markers element by element:

```bash
# Example: updating a string type field
echo '{"invariants":"- 【Normal establishment】Input values must pass schema validation\n- 【Invariant on error】DB integrity is maintained even on error"}', | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"

# Example: updating an array type field
echo '{"testUnit":["UT: [Normal] Valid input returns correct result","UT: [Error] Invalid input returns an error"]}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

**Check remaining markers and loop**: After performing one or more replacements, execute the following:

```bash
node ".claude/scripts/tickets/list-remaining-stubs.js" "Tickets.json" "$ARGUMENTS"
```

As long as unfilled markers remain (exit 1), return to Step 5b and continue replacement. When all markers have been replaced (exit 0), proceed to Step 6.

### Step 6: Automatic design context transcription + ticket field transfer + status update

**About the "Design Context" block**: Design the spec being aware of the 4 sections automatically appended in this Step by dump-ticket-graph-commands.js and dump-node-context-to-spec.js.

Execute `show-ticket-context.js --for-spec` to write all fields from Tickets.json to the top of the spec file. Graph information (node details, edge relationships, file paths) is automatically included in the `--for-spec` output.

The spec file output destination **must be `specs/$ARGUMENTS.md`** (`$ARGUMENTS` is the ticket key such as `P0-1`). Do not modify this manually; use the following command as-is.

```bash
mkdir -p specs && \
node .claude/scripts/tickets/show-ticket-context.js \
  --ticket-key="$ARGUMENTS" --for-spec > "specs/$ARGUMENTS.md"
```

```bash
echo '{"status":"made"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```
