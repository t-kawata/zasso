---
description: Executes the implementation of a ticket.
argument-hint: <P{phaseID}-{ticketID}>
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

## Workflow

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
   - If the corresponding code lacks a `[::STUB::]` marker, add the marker on the spot
   - After adding the marker, change `status` to `resolved` via `malfeasance-update.js`
   - If the implementation is complete but the marker remains, remove the marker to resolve
3. If technically unresolvable, change `status` to `false_positive` via `malfeasance-update.js` and record the reason in `note`
4. Do not start implementation work until all crimes are resolved (or properly classified)

### Step 4: Resolve stubs

Before starting implementation, check for resolvable stubs:

1. List stubs via `find-all-stubs.js`
2. Identify stubs that have become resolvable with this ticket (e.g., dependency tickets completed)
3. If you find a stub without a `[::STUB::]` marker, add the marker and record it as a crime via `malfeasance-create.js`
4. Include resolvable stubs in the implementation scope and replace them with actual implementation
5. Record unresolvable stubs in the implementation summary and hand them over to subsequent tickets

```bash
# Search for stubs
node .claude/scripts/tickets/review/find-all-stubs.js .
```

### Step 5: Implementation

Begin implementation based on the plan from the immediately preceding `/plan-ticket` execution.
Comply with the following supreme laws.

**Universal Testing Rules**
Write all code under the following non-negotiable rules:

1. Tests must be comprehensive and exhaustive for all observable behavior, including edge cases, failure modes, and invariants. Any behavior not covered by tests is considered undefined and unacceptable.

2. Do not write or accept any implementation whose correctness cannot be fully validated through tests. If correctness cannot be proven via tests, the implementation is invalid and must be redesigned.

3. If a feature cannot be completely and deterministically tested, treat this as a design failure. Refactor the architecture until full testability is achieved.

4. Tests are not a scoreboard and must never be treated as a goal in themselves. Passing tests does not imply correctness unless the tests fully capture the intended behavior.

5. It is strictly forbidden to modify or weaken tests to make an implementation pass. The implementation must conform to the tests, not the other way around.

6. Implementation is considered complete only when:
   - The tests fully and precisely specify the intended behavior.
   - The implementation passes all tests without exception.
   - The implementation's correctness is demonstrably guaranteed by those tests.

7. Any gap between test coverage and intended behavior is a critical defect. Resolve such gaps before considering the work complete.

**No-Justification Rule**: Code must justify itself. If you need a paragraph-long comment to explain why a workaround is acceptable, the code is wrong — fix the code, do not document the workaround. A long explanatory comment is an admission that the code is broken. Refactor instead.

**MANDATORY STUB RESOLUTION**: If you encounter a `[::STUB::]` marker whose dependencies have been resolved during implementation, **resolve it immediately (replace with real implementation) even if it was not in the plan**. If resolution is impossible, leave the `[::STUB::]` marker with the reason and record it in the implementation summary.

**ABSOLUTE PROHIBITION — NEVER DELETE OR EDIT THE `Initial Design Artifact` HEADER**: Files generated by `/boundify-graph-to-dirs` carry a header beginning with `Initial Design Artifact — RFC-driven Implementation`. That header is the heart of design traceability and the bloodstream of provenance information — it encodes the link between every implementation file and its originating RFC graph node. You must NEVER delete, alter, or comment out this header under any circumstances. Violation of this rule severs the traceability chain and is a critical defect.

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
1. If no `[::STUB::]` marker → Add the marker on the spot
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
- If warnings or errors must unavoidably remain (e.g., scheduled for resolution in another ticket), you must **add a `[::STUB::]` marker with a comment stating "which ticket (ticket ID) will resolve it and how," and suppress the warning/error using appropriate mechanisms such as `#[allow(...)]` or `#[cfg(test)]`, ensuring that other tickets' compilation and tests are not blocked**.
- If the suppression is insufficient and blocks subsequent builds or tests, it is considered a bug.

**Suppression and `[::STUB::]` consistency verification**:
- After `cargo check` (or `make check-*`) passes, extract all locations where suppression mechanisms such as `#[allow(...)]` are used, and verify that each has a corresponding `[::STUB::]` marker and planned resolution ticket ID clearly stated at the same location
- **Suppression without `[::STUB::]`** → Add the marker and write the planned resolution ticket ID and resolution method in a comment
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

### Step 10: Transition to done

After passing compilation verification, tests, and quality checks:

```bash
echo '{"status":"done"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

If there are quality issues, fix them before transitioning to `done`.
