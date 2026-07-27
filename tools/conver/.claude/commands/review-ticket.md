---
description: Executes quality review of completed tickets.
argument-hint: <P{phaseID}-{ticketID}>
---

# /review-ticket

**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: Every incomplete implementation (stub, mock, placeholder, temporary implementation, by any name) **must** carry a `[::STUB::]` marker without exception. This is an absolute, inviolable law; violations are recorded as "crimes" in Malfeasance.json. In all phases of this command, read Malfeasance.json and verify there are no unresolved crimes. If you discover a violation, resolve it immediately, or add the marker and record it on the spot.

**Role**: Quality verification of `done` tickets.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Position in the Workflow

The workflow flow is `make → plan → start → review`, currently executing `review`.

- **`/make-ticket`**: Creates and details an implementation specification (spec) document.
- **`/plan-ticket`**: Detailed implementation-level planning.
- **`/start-ticket`**: Implementation.
- **`/review-ticket`**: Reviews completed tickets.

## Argument Interpretation

- `P{phaseID}-{ticketID}` format (e.g. `P0-1`, `PX-53`) → Ticket key. Required. Passed to `show-ticket-context.js`'s `--ticket-key`.
- No argument → Interrupt with error
- Numeric only → Interrupt with error
- Anything else → Interrupt with error

## Boy Scout Rule — Review Perspective

**Verify whether the implementer made improvements to existing code.** Check not only the quality of new code, but also evidence of improvements to existing code (error propagation fixes, constant extraction, function splitting, etc.). Translatability checks (select grep patterns per language):

- Grep function definitions for function names that are not verb phrases
- Grep variable declarations for newly added single-character variables or generic names
- Check for hardcoded magic numbers
- Check for leftover debug output
- Comments should only explain "why" (the "what" should be conveyed by the code itself)

## List of Scripts Used

Located under `.claude/scripts/tickets/`.

| Script | Arguments | Description |
|--------|-----------|-------------|
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> --for-spec --review` | **Executed in Step 1**. Outputs ticket information in Markdown. With `--review`, interrupts on Not Found. |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` (stdin: update JSON) | Update ticket fields and change status. Use `--append` to retain existing content and append. |
| `scan-crimes.sh` | (none) | **Executed in Step 3, 4**. Crime scan of Malfeasance.json. |
| `review/find-all-stubs.js` | `<path>` | **Executed in Step 3**. Search for all `[::STUB::]` markers. |
| `review/run-quality-checks.js` | `<files...>` | **Executed in Step 5**. Static quality checks. |
| `review/generate-report.js` | (via stdin) | **Executed in Step 5**. Generate quality report. |
| `annotate-ticket-context-by-git-diff.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--verify]` | **Executed in Step 5 (annotation check)**. Verifies that ticket-key annotations exist on all changed source files. |
| `annotate-ticket-context-by-git-diff.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> --check-ambiguous` | **Executed in Step 5 (loop guard)**. Exits 0 if no `[::AMBIGUOUS::]` markers remain; exits 1 if unresolved markers exist. |
| `resolve-ambiguous-markers.js` | `--mode=list-definitions --file=<path> --ticket-key=<key>` | **Executed in Step 5 (AMBIGUOUS resolution)**. Read-only: prints Markdown with git diff -U5 context + definitions table for AI review. |
| `resolve-ambiguous-markers.js` | `--mode=inject-at --file=<path> --ticket-key=<key> --definition-line=<N1,N2,...>` | **Executed in Step 5 (AMBIGUOUS resolution)**. Inserts `[::TICKET::]` annotation(s) before the specified definition line(s). Multiple lines comma-separated (e.g. `5,14`). Inserts in descending order to prevent line shifts; deduplicates automatically. Removes all `[::AMBIGUOUS::]` markers. |

## Workflow

### Step 1: Existence check + retrieve ticket information

```bash
node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="$ARGUMENTS" --for-spec --review
```

If the output starts with `# {ticketKey}: Not Found` → Follow the output, respond with "The ticket does not exist, so /review-ticket is interrupted." and exit. If Not Found is not the case, design information and methods for exploring related information are output as Markdown; use this as context.

### Step 2: Explore and understand design information, related design information, related ticket information, and source code

Understand the output of Step 1. Then, following "Usage of query.js," execute the following for every Node ID listed in "Related RFC graph NODE-IDs to check" to explore detailed design information. The AI determines how many levels deep to continuously drill. The obtained information **must be backed by actual source code analysis**, and the review must be conducted with material evidence regarding the implementation status. A review without material evidence is a hallucination and is strictly prohibited.

```bash
node .claude/scripts/rfc-graph/query.js --graph="</path/to/?-GRAPH.json>" --source="</path/to/RFC-?.md>" --dirs-tree="</path/to/?-Dirs-Tree.json>" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
```

As needed, explore information about related tickets shown in "Related Tickets." The AI determines how many levels deep to continuously drill. The obtained information **must be backed by actual source code analysis**, and the review must be conducted with material evidence regarding the implementation status. A review without material evidence is a hallucination and is strictly prohibited.

```bash
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<Ticket KEY to show (e.g. P0-1)> --for-spec --no-implementation-order
```

### Step 3: Emergency crime resolution (highest priority — First-Class Rule)

Read Malfeasance.json. If unresolved crimes (`open`) exist, resolve them **with priority over the review process**. This is the highest priority task; skipping is prohibited.

```bash
# Execute crime scan (auto-initializes on first run)
.claude/scripts/tickets/scan-crimes.sh
```

Follow the crime resolution procedure in start-ticket.md's "Emergency crime resolution." Do not proceed with the review until all crimes are resolved.

Also verify that there are no new crimes in the implementation code of this ticket (incomplete implementations without `[::STUB::]` markers). If found:
1. Add a `[::STUB::]` marker on the spot
2. Record it as a crime via `malfeasance-create.js`
3. Resolve the crime (complete implementation or add marker)

### Step 4: List and evaluate [::STUB::] markers

Extract all stubs via `find-all-stubs.js` and evaluate them in the following 3 categories:

```bash
# List all stubs
node .claude/scripts/tickets/review/find-all-stubs.js .
```

**Classification criteria**:

1. **Resolvable stubs** — Dependency tickets are complete, and can now be replaced with actual implementation
   → **Implement on the spot and remove the `[::STUB::]` marker**

2. **Stubs requiring a separate ticket** — Resolution requires a new ticket
   → **Propose creating a new ticket to the user**

3. **Stubs that are correctly deferred** — Scheduled for resolution in a future ticket, currently correct as stubs
   → **Clarify the reason, verify the planned resolution ticket ID, and report to the user**

**When an unmarked stub is found**: If code content clearly indicates a stub but no `[::STUB::]` marker is attached, **add the marker on the spot and record it as a crime via `malfeasance-create.js`**. Then evaluate according to the classification above.

The results of the stub evaluation must be recorded in the review report.

### Step 5: Active search for incomplete implementations (mandatory)

Before entering compilation verification, **scrutinize the entire changed code** of the review target and check for mixed-in incomplete implementations. This is an **active step to discover omissions that automated scripts cannot detect**; skipping is prohibited.

```bash
# View the list of changed files
git diff --name-only "$(git merge-base HEAD origin/master)"

# Confirm changed lines of each file
git diff "$(git merge-base HEAD origin/master)"
```

**Verification criteria (7 patterns)**:
1. `todo!()`, `unimplemented!()`, `panic!()` — Does it have a `[::STUB::]` marker?
2. Empty function bodies — Is it left as a placeholder?
3. `return Ok(())` / `return None` — Is error handling incomplete?
4. Commented-out code — Is debris left behind?
5. `TODO` / `FIXME` / `HACK` / `XXX` — Is it accompanied by a `[::STUB::]` marker?
6. Mock / Fake objects — Does it have a `[::STUB::]` marker?
7. `#[allow(...)]` — Does the suppression reason include a `[::STUB::]` marker?

**8. Ticket-key annotation check — Verify that every changed source file has the correct ticket-key provenance annotation:**

```bash
node .claude/scripts/tickets/annotate-ticket-context-by-git-diff.js \
  --ticket-key="$ARGUMENTS" --verify
```

- If a file lacks an annotation, this is a defect in the implementation — the implementer skipped Step 5a of start-ticket.md. Report it in the review findings and request re-execution of the annotation step.
- If a file contains a `[::AMBIGUOUS::]` marker, the AI must resolve it using the two-phase deterministic script below, then re-verify.
- If all changed files are non-source (config, docs, etc.), the annotation script will report no source files — this is acceptable and requires no action.

**AMBIGUOUS marker resolution (deterministic script flow, mandatory before proceeding):**

```bash
# Check if any AMBIGUOUS markers remain
node .claude/scripts/tickets/annotate-ticket-context-by-git-diff.js \
  --ticket-key="$ARGUMENTS" --check-ambiguous
```

If exit code 1, resolve each reported file as follows.

**Phase 1 — AI reviews available definitions (script is read-only, mechanical):**

```bash
node .claude/scripts/tickets/resolve-ambiguous-markers.js \
  --mode=list-definitions --file="<file-path>" --ticket-key="$ARGUMENTS"
```

This outputs JSON with every definition's line number, name, and kind, plus the `[::AMBIGUOUS::]` line. **AI reviews the output and decides which definition line is correct.**

**Phase 2 — Script injects `[::TICKET::]` annotation(s) (format guaranteed by `buildAnnotation()`):**

```bash
node .claude/scripts/tickets/resolve-ambiguous-markers.js \
  --mode=inject-at --file="<file-path>" --ticket-key="$ARGUMENTS" \
  --definition-line=<AI-chosen-line-number(s)>
```

Single line: `--definition-line=5`
Multiple lines (comma-separated): `--definition-line=5,14`

This inserts `[::TICKET::]` annotation(s) before the specified definition(s) and removes all `[::AMBIGUOUS::]` markers. The annotation format is always generated by `buildAnnotation()` — **never hand-typed by AI**. When multiple lines are specified, the script inserts in descending order to prevent line shifts and deduplicates automatically.

Repeat for each reported file until `--check-ambiguous` exits with code 0.

**Zero AMBIGUOUS markers is a hard gate.** Proceeding to Step 6 with unresolved markers is a defect.

If an incomplete implementation is found:
1. If no `[::STUB::]` marker → Add the marker on the spot
2. Record it as a crime via `malfeasance-create.js`
3. Resolve it immediately. If unresolvable, change to `false_positive` and record the reason in `note`

```bash
node .claude/scripts/tickets/malfeasance-create.js "<file>" <line> "<description>"
```

After recording, re-run `scan-crimes.sh` to verify the crime has been correctly reflected in Malfeasance.json:

```bash
.claude/scripts/tickets/scan-crimes.sh
```

### Step 6: Compilation verification and unit test verification

First, run compilation verification. Follow the guidelines below; the AI determines the approach based on the situation:

- **Working directory**: Execute in the appropriate directory depending on the scope of changes. If `cd` is needed, use a **subshell** `(cd <dir> && <command>)` to avoid affecting subsequent commands.
- **Compilation verification**: If a Makefile exists in the selected directory with `check`-family targets defined, prefer `make`; otherwise use `cargo check`.
- **Test execution**: Similarly, if a Makefile has a `test` target defined, prefer `make test`; otherwise use `cargo test`. Determine the test scope based on the impact range of the changes.

```bash
# Example: Using the project root Makefile
(cd "$(git rev-parse --show-toplevel)" && make check-be)

# Example: Using cargo directly in a specific crate
(cd crates/voiput && cargo check --all-targets)
```

If compilation does not pass, fix before proceeding.

Next, verify that all tests defined in the Test Plan obtained in Step 1 are implemented, then run the tests. The execution guidelines are the same as for compilation verification:

If tests do not exist or any fail → Fix before proceeding.
Only items explicitly stated in the spec as "exceptions (unit-testable items)" are allowed to remain untested.

**Principle of complete warning/error resolution**:
- Warnings and errors detected by `cargo check`, `cargo test` (or via `make` commands) **must be resolved without exception**. Proceeding to the next step with unresolved items is prohibited.
- Proceeding to the next step when **even one `cargo test` (or `make test`) fails** is prohibited. Fix until all tests pass.
- If warnings or errors must unavoidably remain (e.g., scheduled for resolution in another ticket), you must **add a `[::STUB::]` marker with a comment stating "which ticket (ticket ID) will resolve it and how," and suppress the warning/error using appropriate mechanisms such as `#[allow(...)]` or `#[cfg(test)]`, ensuring that other tickets' compilation and tests are not blocked**.
- If the suppression is insufficient and blocks subsequent builds or tests, it is considered a bug.

**Suppression and `[::STUB::]` consistency verification**:
- After `cargo check` (or `make check-*`) passes, extract all locations where suppression mechanisms such as `#[allow(...)]` are used, and verify that each has a corresponding `[::STUB::]` marker and planned resolution ticket ID clearly stated at the same location
- **Suppression without `[::STUB::]`** → Add the marker and write the planned resolution ticket ID and resolution method in a comment
- **`[::STUB::]` without suppression** → Check whether compilation verification produces an error. If there is an error, add `#[allow(...)]`; if there is no error, suppression is unnecessary (it can be considered a deliberate design stub)
- After consistency verification, **re-run compilation verification**

### Step 7: Thoroughly inspect implementation completeness

Using the design information obtained in Step 1, the exploration information obtained in Step 2, and the source code analysis, inspect whether the implementation fully satisfies everything described in the design information from Step 1.

Actively search through the design information from Step 1 in 4 categories: **risks, omissions, contradictions, deficiencies**. Focus on discovering risks, omissions, contradictions, and deficiencies — demonstrate tenacity in not overlooking anything.

The sole condition for proceeding to Step 8 is: the design information from Step 1 is fully satisfied, all tests pass, and there are zero errors and zero warnings.

### Step 8: Static quality check

```bash
node ".claude/scripts/tickets/review/run-quality-checks.js" src/file1.rs src/file2.rs | node ".claude/scripts/tickets/review/generate-report.js"
```

### Step 9: Translatability check

Re-execute all grep commands defined in `/plan-ticket`.

### Step 10: Save review report

After all checks pass, save the review results to the ticket's JSON fields via `update-ticket.js`:

```bash
echo '{
  "instrumentation": "Static quality check: passed\nTranslatability: no issues\nTests: all xx tests passed",
  "rfcDiscrepancies": [],
  "notes": "Review report:\n- Static quality check: passed\n- Translatability: no issues\n- Dependencies: consistency verified\n- Issues found and fixes applied: ..."
}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS" --append
```

This makes it possible to trace "how the review was conducted and quality assured" when checking the ticket later.

#### Re-export spec file (final snapshot)

Re-export the spec file to reflect any fixes applied during review (crimes resolved, AMBIGUOUS markers resolved, quality fixes):

```bash
mkdir -p specs && \
node .claude/scripts/tickets/show-ticket-context.js \
  --ticket-key="$ARGUMENTS" --for-spec > "specs/$ARGUMENTS.md"
```

### Step 10b: Verify final contract fulfillment

Before transitioning to reviewed, verify that all prerequisites (graph contracts annotated,
ticket contracts merged, test plan covers contracts, @verifies present) have been completed
and that all contracts are fulfilled.

```bash
# Verify all ticket contracts are fulfilled
node .claude/scripts/tickets/verify-final-contracts.js --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
```

If BLOCKed: review the contract fulfillment report and fix the uncovered contracts before re-running.

### Step 11: Transition to reviewed

After all checks pass, update the status together with the review completion date:

```bash
echo "{\"status\":\"reviewed\",\"completedAt\":\"$(date +%Y-%m-%d)\"}" | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

### Step 12: Commit the pipeline changes (no push)

After all review steps pass and the ticket is marked as reviewed, commit the accumulated changes from the entire `make → plan → start → review` pipeline.

**IMPORTANT — NEVER PUSH**. This step stages and commits only. Pushing is a separate operation performed deliberately by the user.

First, verify the working tree state:

```bash
# Show working tree state
git status

# Show staged changes (if any pre-existing staged content exists)
git diff --cached --stat
```

Then, craft an appropriate commit message:

- **Scope**: Use the ticket key (e.g. `P0-1`) as the scope
- **Type**: Use `feat` for feature implementation, `fix` for bug fixes, `refactor` for refactoring, `test` for test additions, `chore` for infrastructure changes
- **Subject**: Summarize the core change of this ticket
- **Body**: List the files changed and what was done in each. Reference the ticket key.

```
<type>(<scope>): <imperative subject line>

- <file1>: <what changed and why>
- <file2>: <what changed and why>
...

Ticket: <ticketKey>
```

**Composing the commit message**:
1. Retrieve the ticket title via `show-ticket-context.js` to understand what this ticket was about
2. Use `git diff --stat` and `git diff` to review the actual changes made
3. Compose a conventional commit message following [git-workflow.md](.claude/rules/common/git-workflow.md)

```bash
# Retrieve ticket info for the commit message
node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="$ARGUMENTS" --no-implementation-order 2>/dev/null | head -20
```

Stage and commit:

```bash
# Stage all changed files
git add -A

# Commit with a crafted message
git commit -m "<type>(<scope>): <subject line>

<body lines...>

Ticket: $ARGUMENTS"
```

**DO NOT run `git push` under any circumstances.** If this step is combined with push, it is considered a critical defect in the pipeline execution.

Verification: After committing, confirm the commit was created correctly:

```bash
# Show the latest commit
git log -1 --oneline
```
