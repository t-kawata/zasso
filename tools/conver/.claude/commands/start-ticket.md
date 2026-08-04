---
description: Executes the implementation of a ticket.
argument-hint: <P{phaseID}-{ticketID}>
disable-model-invocation: true
---

# /start-ticket

**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: Every incomplete implementation (stub, mock, placeholder, temporary implementation, by any name) **must** carry a `[::STUB::]` marker without exception. This is an absolute, inviolable law; violations are recorded as "crimes" in Malfeasance.json. In all phases of this command, read Malfeasance.json and verify there are no unresolved crimes. If you discover a violation, resolve it immediately, or add the marker and record it on the spot.

**Role**: Implementation of the ticket.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Position in the Workflow

The workflow flow is `make → plan → start → review`, currently executing `start`.

- **`/make-ticket`**: Creates and details an implementation specification (spec) document.
- **`/plan-ticket`**: Detailed implementation-level planning.
- **`/start-ticket`**: Implementation.
- **`/review-ticket`**: Reviews completed tickets.

## Argument Interpretation

- `P{phaseID}-{ticketID}` format (e.g. `P0-1`, `PX-53`) → Ticket key. Required.
- No argument → Interrupt with error
- Numeric only → Interrupt with error
- Anything else → Interrupt with error

## Boy Scout Rule

If you find existing code that violates translatability during implementation, proactively fix it even if outside scope: propagate instead of swallowing errors, extract hardcoded values into constants, rename generic variables to domain names, split multi-responsibility functions. **Do it even if it was not in the plan.**

## List of Scripts Used

Located under `.claude/scripts/tickets/`.

| Script | Arguments | Description |
|--------|-----------|-------------|
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` (stdin: update JSON) | Update ticket fields and change status. Use `--append` to retain existing content and append. |
| `review/run-quality-checks.js` | `<files...>` | **Executed in Step 10**. Static quality checks. |
| `review/generate-report.js` | (via stdin) | **Executed in Step 10**. Generate quality report. |
| `scan-crimes.sh` | (none) | **Executed in Step 4, 6**. Crime scan of Malfeasance.json. |
| `review/find-all-stubs.js` | `<path>` | **Executed in Step 5**. Search for all `[::STUB::]` markers. |
| `annotate-ticket-context-by-git-diff.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--verbose]` | **Executed in Step 5a**. Injects ticket-key provenance comments into source files modified or added by this ticket. |
| `annotate-ticket-context-by-git-diff.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> --check-ambiguous` | **Executed in Step 5a (loop guard)**. Exits 0 if no `[::AMBIGUOUS::]` markers remain; exits 1 if unresolved markers exist. |
| `resolve-ambiguous-markers.js` | `--mode=list-definitions --file=<path> --ticket-key=<key>` | **Executed in Step 5a Phase 2a**. Read-only: prints Markdown with git diff -U5 context + definitions table for AI review. |
| `resolve-ambiguous-markers.js` | `--mode=inject-at --file=<path> --ticket-key=<key> --definition-line=<N1,N2,...>` | **Executed in Step 5a Phase 2b**. Inserts `[::TICKET::]` annotation(s) before the specified definition line(s). Multiple lines comma-separated (e.g. `5,14`). Inserts in descending order to prevent line shifts; deduplicates automatically. Removes all `[::AMBIGUOUS::]` markers. |

## Workflow

### Step 0: Status gate — verify ticket is ready for implementation

Before proceeding, verify that the ticket's current status in Tickets.json is `"planned"` (i.e., `/plan-ticket` has completed). If the status is not `"planned"`, the command blocks with an error message.

```bash
node .claude/scripts/tickets/check-ticket-status.js --ticket-key="$ARGUMENTS" --phase=start
```

- **Exit 0** (status is `"planned"`) → proceed to Step 1
- **Exit 1** (status mismatch or error) → follow the output message, respond with "Status gate blocked: /start-ticket cannot proceed until the ticket status is 'planned'. Run /plan-ticket first." and abort.

### Step 1: Block unless /plan-ticket was executed immediately before in the same session

If `/plan-ticket` was NOT executed immediately before in the same session, respond with "Prior execution of /plan-ticket is required. Interrupting." and abort.

### Step 2: Record implementation start date

Record the implementation start date in the `startedAt` field:

```bash
echo "{\"startedAt\":\"$(date +%Y-%m-%d)\"}" | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

### Step 3: Emergency crime resolution (highest priority — First-Class Rule)

Read Malfeasance.json. If unresolved crimes (`open`) exist, resolve them **with priority over the implementation work of this ticket**. This is the highest priority task; skipping is prohibited.

```bash
# Execute crime scan (auto-initializes on first run)
.claude/scripts/tickets/scan-crimes.sh
```

1. If unresolved crimes exist, start resolving them immediately
2. Resolution methods:
   - If the corresponding code lacks a `[::STUB::]` marker, use `insert-stub.js` to add it (do NOT edit source files directly):

```bash
# insert-stub.js: Insert [::STUB::] marker with resolve-by-ticket validation
#   --resolve-by-ticket:   Ticket key that WILL resolve this stub (e.g. P0-1).
#                          MUST already exist in Tickets.json.
#                          MUST have effective status 'todo' (missing status = 'todo').
#                          MUST NOT be a PX-{id} ticket.
#   --ticket-key:          REQUIRED current ticket key ($ARGUMENTS). Omitting it is
#                          forbidden in this command — --resolve-by-ticket must not
#                          be earlier than it.
#   --stub-reason:         Why this code is left as a stub — be specific.
#                          Must be a single line (no newlines).
#                          BAD:  "Dependency not ready"
#                          GOOD: "P1-3 blocked: User::role changed to enum, login(&str) signature incompatible"
#   --resolve-plan:        What the resolving ticket must concretely implement.
#                          Must be a single line (no newlines).
#                          BAD:  "Implement the actual logic"
#                          GOOD: "Replace Ok(()) with INSERT INTO sessions (user_id, token) VALUES (?, ?); add integration test"
#   --file:                Target source file path
#   --line:                1-indexed line number to insert at
#   --tickets-path:        Path to Tickets.json
node .claude/scripts/tickets/insert-stub.js \
  --file=src/example.rs --line=5 --resolve-by-ticket=P3-2 \
  --stub-reason="P1-3 blocked: User::role changed to enum, login(&str) signature incompatible" \
  --resolve-plan="Replace Ok(()) with INSERT INTO sessions (user_id, token) VALUES (?, ?); add integration test" \
  --tickets-path=Tickets.json \
  --ticket-key="$ARGUMENTS"
```

> **Retry until success**: If `insert-stub.js` exits non-zero, read the error (problem / blocking reason / redo instruction), fix the arguments, and re-run. Never abort this command because of an `insert-stub.js` failure.

   - After adding the marker, change `status` to `resolved` via `malfeasance-update.js`
   - If the implementation is complete but the marker remains, remove the marker to resolve
3. If technically unresolvable, change `status` to `false_positive` via `malfeasance-update.js` and record the reason in `note`
4. Do not start implementation work until all crimes are resolved (or properly classified)

### Step 4: Resolve stubs

Before starting implementation, check for resolvable stubs:

1. List stubs via `find-all-stubs.js`
2. Identify stubs that have become resolvable with this ticket (e.g., dependency tickets completed)
   ```bash
   # List done/resolved tickets to cross-reference with STUB markers
   node .claude/scripts/tickets/search-tickets.js Tickets.json done
   node .claude/scripts/tickets/review/find-stubs-with-ticket-ref.js --dir=.
   ```
3. If you find a stub without a `[::STUB::]` marker, use `insert-stub.js` to add the marker and record it as a crime via `malfeasance-create.js`. Do NOT edit source files directly.
4. Include resolvable stubs in the implementation scope, replace them with actual implementation, then remove the resolved marker via `remove-stub.js`
5. Record unresolvable stubs in the implementation summary and hand them over to subsequent tickets

```bash
# Search for stubs
node .claude/scripts/tickets/review/find-all-stubs.js .
```

**Pre-cleanup sweep** (before implementation): run the preflight classification to remove resolved-but-stale markers and surface terminal excuses:

```bash
node .claude/scripts/tickets/preflight-stub-cleanup.js
```

- `resolvedCandidates` → verify in code, then `remove-stub.js`
- `pendingObligations` → leave (legitimate active-key work)
- `orphans` / `excuses` → fix before implementation (rewrite the plan / rewrite the key / remove)

### Step 5: Implementation

Begin implementation based on the plan from the immediately preceding `/plan-ticket` execution.
Comply with the **Implementation Order** below and the following supreme laws:

#### **Reference — Implementation Order (TDD Red-Green-Refactor)**

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

#### **No-Justification Rule**

Code must justify itself. If you need a paragraph-long comment to explain why a workaround is acceptable, the code is wrong — fix the code, do not document the workaround. A long explanatory comment is an admission that the code is broken. Refactor instead.

#### **MANDATORY STUB RESOLUTION**

If you encounter a `[::STUB::]` marker whose dependencies have been resolved during implementation, **resolve it immediately (replace with real implementation) even if it was not in the plan**. If resolution is impossible, leave the `[::STUB::]` marker with the reason and record it in the implementation summary.

After replacing the stub code, remove the resolved marker by running `node .claude/scripts/tickets/remove-stub.js --file=<path> --line=<N>` (or `--lines=<N1,N2,...>` for multiple). Do NOT delete the marker line by hand — let `remove-stub.js` verify and remove it.

#### **ABSOLUTE PROHIBITION — NEVER DELETE OR EDIT THE `Initial Design Artifact` HEADER**

Files generated by `/boundify-graph` carry a header beginning with `Initial Design Artifact — RFC-driven Implementation`. That header is the heart of design traceability and the bloodstream of provenance information — it encodes the link between every implementation file and its originating RFC graph node. You must NEVER delete, alter, or comment out this header under any circumstances. Violation of this rule severs the traceability chain and is a critical defect.

### Step 5a: Annotate generated code with ticket-key provenance

After completing the implementation but before the incomplete-implementation scan, inject the ticket-key annotation comment into source files modified or added by this ticket. This comment provides a traceable link from each implementation file back to its originating ticket and RFC design node.

**Phase 1 — Inject annotations:**

```bash
node .claude/scripts/tickets/annotate-ticket-context-by-git-diff.js \
  --ticket-key="$ARGUMENTS" --verbose
```

If git diff shows no changes (e.g., config-only ticket), the script exits silently with no modifications.

**Phase 2 — Resolve `[::AMBIGUOUS::]` markers (deterministic script flow):**

Some files may contain syntax patterns the annotation script cannot parse. In that case it inserts a `[::AMBIGUOUS::]` marker as a fallback. Resolve every such marker using the two-phase deterministic script:

```bash
# Check for unresolved AMBIGUOUS markers
node .claude/scripts/tickets/annotate-ticket-context-by-git-diff.js \
  --ticket-key="$ARGUMENTS" --check-ambiguous
```

If the `--check-ambiguous` command exits with code 1 (unresolved markers found), resolve each file as follows.

**Phase 2a — AI reviews available definitions (script is read-only, mechanical):**

```bash
node .claude/scripts/tickets/resolve-ambiguous-markers.js \
  --mode=list-definitions --file="<file-path>" --ticket-key="$ARGUMENTS"
```

This outputs JSON with every definition's line number, name, and kind, plus the `[::AMBIGUOUS::]` line content. **AI reviews the output and decides which definition line is correct.**

**Phase 2b — Script injects `[::TICKET::]` annotation(s) (format guaranteed by `buildAnnotation()`):**

```bash
node .claude/scripts/tickets/resolve-ambiguous-markers.js \
  --mode=inject-at --file="<file-path>" --ticket-key="$ARGUMENTS" \
  --definition-line=<AI-chosen-line-number(s)>
```

Single line: `--definition-line=5`
Multiple lines (comma-separated): `--definition-line=5,14`

This inserts `[::TICKET::]` annotation(s) before the specified definition(s) and removes all `[::AMBIGUOUS::]` markers. The annotation format is always generated by `buildAnnotation()` — **never hand-typed by AI**. When multiple lines are specified, the script processes them in **descending order** (largest line number first) to prevent line position shifts, and **deduplicates** automatically.

**Loop**: Repeat for each reported file until `--check-ambiguous` exits with code 0. Proceeding to Step 6 with unresolved `[::AMBIGUOUS::]` markers is a defect.

### Step 5b: Verify Red contract coverage

Before proceeding to Green (implementation), verify all contract IDs have @verifies annotations in test files.

```bash
# Verify all contract IDs have @verifies in test files
node .claude/scripts/tickets/verify-red-coverage.js --ticket-key="$ARGUMENTS"
```

If BLOCKed: return to Step 5 (Red) and add missing @verifies annotations, then re-run.

### Step 5c: Validate target resolution (mandatory)

After all crimes and stubs are resolved in Steps 3-5, validate that targetStubs/targetCrimes are clean and all contracts pass. This gate ensures the crime-first principle is enforced before proceeding to active implementation.

**Step 5c-1 — Crime-first confirmation**: Verify in Tickets.json that all targetCrimes have `status: "resolved"` or `status: "false_positive"`. If any targetCrime remains `"pending"`, return to Step 3 (Emergency crime resolution) and resolve it first.

**Step 5c-2 — Validate targets:**

```bash
node .claude/scripts/tickets/validate-ticket-targets.js \
  --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
```

**Convergence loop**: If Step 5c-2 exits 1, fix the reported violations (resolve remaining crimes/stubs, update contracts), then re-run the Gate. **Loop until it passes before proceeding to Step 6.** The crime-first invariant is absolute: targetCrimes must be resolved before targetStubs are addressed. If a targetCrime genuinely cannot be resolved (blocked on external dependency, awaiting another team), the AI MUST create a new ticket via `/make-ticket` with full justification and record the deferral — the original ticket must not proceed with unresolved crimes.

> **Note**: Final contract fulfillment is verified by `/review-ticket` Step 10b (`verify-final-contracts.js`), where the ticket is already `done`. Running it at Step 5c would fail because the ticket is still `planned` and the implementation is not yet complete.

### Step 6: Active search for incomplete implementations (mandatory)

After completing the implementation, **scrutinize all code you changed** before declaring completion, and check for mixed-in incomplete implementations. This is an **active step to discover omissions that automated scripts cannot detect**; skipping is prohibited.

```bash
# View the list of changed files
git diff "$(git merge-base HEAD origin/master)" --name-only

# After confirming, scrutinize the changed lines of each file
```

**Verification criteria** — Check line by line whether the following patterns are present in the changed code:

1. `todo!()`, `unimplemented!()`, `panic!()` — Does it have a `[::STUB::]` marker?
2. Empty function bodies (`fn foo() {}`) — Is it left as a placeholder?
3. `return Ok(())` / `return None` / `return Default::default()` — Is error handling incomplete?
4. Commented-out implementation code — Is debris left behind?
5. `TODO` / `FIXME` / `HACK` / `XXX` — Is it accompanied by a `[::STUB::]` marker?
6. Mock / Fake objects — Does it have a `[::STUB::]` marker?
7. `#[allow(...)]` — Does the suppression reason include a `[::STUB::]` marker?

If an incomplete implementation is found:
1. If no `[::STUB::]` marker → Use `insert-stub.js` to add the marker (do NOT edit source files directly)
2. Record it as a crime via `malfeasance-create.js`
3. Resolve it immediately (complete implementation, add marker, etc.). If unresolvable, change `status` to `false_positive` via `malfeasance-update.js` and record the reason in `note`

```bash
# Record a crime
node .claude/scripts/tickets/malfeasance-create.js "<file>" <line> "<description>"
```

After recording, re-run `scan-crimes.sh` to verify the crime has been correctly reflected in Malfeasance.json:

```bash
.claude/scripts/tickets/scan-crimes.sh
```

### Step 7: Compilation verification and testing

Run compilation verification and tests on the implemented content. Follow the guidelines below;
the AI determines the approach based on the situation:

- **Working directory**: Execute in the appropriate directory depending on the scope of changes (project root, relevant crate directory, etc.). If `cd` navigation is needed, use a **subshell** `(cd <dir> && <command>)` to avoid affecting the current directory of subsequent commands.
- **Compilation verification**: If a Makefile exists in the selected directory with `check`-family targets (`check`, `check-be`, `check-all`, etc.), prefer using `make`. If no Makefile exists or no relevant target is defined, use `cargo check`. Add appropriate flags such as `--all-targets` or `--workspace` as needed.
- **Test execution**: Similarly, if a Makefile has a `test` target defined, prefer `make test`; otherwise use `cargo test`. Determine the test scope (crate-specific, whole workspace, etc.) based on the impact range of the changes.

```bash
# Example: Using Makefile's check-be at the project root
(cd "$(git rev-parse --show-toplevel)" && make check-be)

# Example: No Makefile in a specific crate
(cd crates/voiput && cargo check --all-targets)
```

**Principle of complete warning/error resolution**:
- Warnings and errors detected by `cargo check`, `cargo test` (or via `make` commands) **must be resolved without exception**. Proceeding to the next step with unresolved items is prohibited.
- Proceeding to the next step when **even one `cargo test` (or `make test`) fails** is prohibited. Fix until all tests pass.
- If warnings or errors must unavoidably remain (e.g., scheduled for resolution in another ticket), you must **use `insert-stub.js --resolve-by-ticket=<EXISTING_TICKET_KEY>` to add a `[::STUB::]` marker referencing an existing ticket, and suppress the warning/error using appropriate mechanisms such as `#[allow(...)]` or `#[cfg(test)]`, ensuring that other tickets' compilation and tests are not blocked**. The ticket referenced in `--resolve-by-ticket` MUST already exist in Tickets.json. Creating new non-existent tickets or using MUST RESOLVE to defer is forbidden.
- If the suppression is insufficient and blocks subsequent builds or tests, it is considered a bug.

**Suppression and `[::STUB::]` consistency verification**:
- After `cargo check` (or `make check-*`) passes, extract all locations where suppression mechanisms such as `#[allow(...)]` are used, and verify that each has a corresponding `[::STUB::]` marker and planned resolution ticket ID clearly stated at the same location
- **Suppression without `[::STUB::]`** → Use `insert-stub.js --resolve-by-ticket=<EXISTING_TICKET_KEY>` to add the marker with an existing ticket reference. Do NOT write ticket IDs directly in source files.
- **`[::STUB::]` without suppression** → Check whether compilation verification produces an error. If there is an error, add `#[allow(...)]`; if there is no error, suppression is unnecessary (it can be considered a deliberate design stub)
- After consistency verification, **re-run compilation verification**

### Step 8: Quality check

After implementation, enumerate the changed files and execute:

```bash
node ".claude/scripts/tickets/review/run-quality-checks.js" src/file1.rs src/file2.rs
```

Generate a report via pipe:

```bash
node ".claude/scripts/tickets/review/run-quality-checks.js" src/file1.rs | node ".claude/scripts/tickets/review/generate-report.js"
```

### Step 9: Save implementation results

After passing compilation verification, tests, and quality checks, save a summary of the implementation content to the ticket's JSON fields via `update-ticket.js`:

```bash
echo '{
  "changes": [{"before":"old state","after":"new state","description":"change description"}],
  "notes": "Implementation summary:\n- Changed files: a.rs, b.rs\n- Key changes: ...\n- Test results: all xx tests passed"
}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS" --append
```

This makes it possible to trace "how the implementation was done" when checking the ticket later.

#### Re-export spec file with implementation locations

Re-export the spec file to reflect the newly added `[::TICKET::]` annotations as implementation locations:

```bash
mkdir -p specs && \
node .claude/scripts/tickets/show-ticket-context.js \
  --ticket-key="$ARGUMENTS" --for-spec > "specs/$ARGUMENTS.md"
```

### Step 10: Transition to done

After passing compilation verification, tests, and quality checks, run the **no-excuse gate** — a ticket must not be marked `done` while a terminal-excuse stub referencing it survives:

```bash
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```

If it exits non-zero, fix each reported marker (remove / rewrite the plan / rewrite the key) and re-run until exit 0. Then:

```bash
echo '{"status":"done"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

If there are quality issues, fix them before transitioning to `done`.
