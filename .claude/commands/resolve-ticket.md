---
description: Resolves warnings, errors, stubs, and crimes under a directory.
disable-model-invocation: true
---

# /resolve-ticket

**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: Every incomplete implementation (stub, mock, placeholder, temporary implementation, by any name) **must** carry a `[::STUB::]` marker without exception. This is an absolute, inviolable law; violations are recorded as "crimes" in Malfeasance.json. In all phases of this command, read Malfeasance.json and verify there are no unresolved crimes. If you discover a violation, resolve it immediately, or add the marker and record it on the spot.

**No-External-Excuse Rule**: There is no "external" and no "awaiting approval". Every blocker is an AI-executable work item. A terminal-excuse resolution plan is rejected at creation (insert-stub.js), swept at preflight (Step 4), and fails the validator in the convergence loop (Step 9c). The command must never abort on failures — it loops validate → fix → revalidate until zero excuses remain.

**Role**: Batch resolution of warnings, errors, stubs, and crimes under a directory.

**Prohibition**: This command must NEVER change the status of any ticket in Tickets.json. You must NOT call `update-ticket.js` or execute `echo '{"status":...}'`.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Argument Interpretation

- `P{phaseID}-{ticketID}` format (e.g. `P0-1`, `PX-53`) → Optional ticket key. When provided, Step 9a (enumerate) and Step 9b (validate) execute against this ticket. When omitted, they are skipped and the command runs its default workflow (Steps 1-10, excluding enumerate/validate).
- No argument → Default mode, skips Step 9a/9b (backward compatibility)
- Numeric only → Interrupt with error
- Anything else → Interrupt with error

## List of Scripts Used

Located under `.claude/scripts/tickets/`.

| Script | Arguments | Description |
|--------|-----------|-------------|
| `review/find-all-stubs.js` | `<directory>` | List all stubs |
| `preflight-stub-cleanup.js` | (run from the Tickets.json dir) | 4-class STUB classification (Step 4) |
| `validate-no-external-excuses.js` | `[--fail-on-excuse]` | No-excuse validator (Steps 4/9c/10) |
| `scan-crimes.sh` | `[directory]` (when specified, shows only crimes under that directory) | Execute crime scan |
| `malfeasance-create.js` | `<file> <line> <description> [note]` | Record a new crime |
| `malfeasance-update.js` | `<id> <key> <val>` | Update a crime record (resolve, etc.) |
| `review/run-quality-checks.js` | `<files...>` | Static quality check |
| `review/generate-report.js` | (via stdin) | Generate quality report |

## Workflow

### Step 1: Run compilation check and tests, capture warnings and errors

Run compilation check and tests in the appropriate directory. The AI determines the approach based on the situation:

- **Compilation check**: If a Makefile exists in the selected directory with `check`-family targets defined, prefer `make`. If no Makefile exists or no relevant target is defined, use the language-appropriate tool (`cargo check`, `go build`, `tsc --noEmit`, `npm run build`, etc.). Add suitable flags as needed.
- **Test execution**: Similarly, if a Makefile has a `test` target defined, prefer `make test`; otherwise use the language-appropriate test runner (`cargo test`, `go test`, `npm test`, `pytest`, etc.).
- Capture all warnings and errors for resolution in the subsequent steps.

```bash
# Example: compilation check via Makefile
(cd "$(git rev-parse --show-toplevel)" && make check-be)

# Example: compilation check via language tool
cargo check --all-targets 2>&1
```

### Step 2: Resolve warnings and errors

Resolve all captured warnings and errors. Resolution methods:

1. **Immediately resolvable**: Fix the code to eliminate the warning/error
2. **Should be resolved by a subsequent ticket**: Use `insert-stub.js --resolve-by-ticket=<EXISTING_TICKET_KEY>` to add the marker referencing an existing ticket, and suppress the warning/error using appropriate mechanisms such as `#[allow(...)]`. The ticket referenced in `--resolve-by-ticket` MUST already exist in Tickets.json. Do NOT write ticket IDs directly in source files.

```bash
# insert-stub.js: Insert [::STUB::] marker with resolve-by-ticket validation
#   --resolve-by-ticket:   Ticket key that WILL resolve this stub (e.g. P0-1).
#                          MUST already exist in Tickets.json.
#                          MUST have effective status 'todo' (missing status = 'todo').
#                          MUST NOT be a PX-{id} ticket.
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
  --tickets-path=Tickets.json
```
> **Retry until success**: If `insert-stub.js` exits non-zero, read the error (problem / blocking reason / redo instruction), fix the arguments, and re-run. Never abort this command because of an `insert-stub.js` failure.
> **No-excuse rejection**: `insert-stub.js` now rejects a `--resolve-plan` that is a terminal excuse ("requires external ...", "awaiting approval ...") without an imperative work item. If it exits non-zero for this reason, rewrite the plan as an AI-executable work item (e.g. "Vendor and build PJSIP in build.rs") and re-run.

3. **Suppression and marker consistency**: Verify that there is no suppression without `[::STUB::]`, and no `[::STUB::]` without suppression

**Do not proceed to the next step until all warnings and errors are resolved.**

### Step 3: List stubs (directory-scoped)

Pass the current directory to `find-all-stubs.js` to list only stubs under the current directory.

```bash
node .claude/scripts/tickets/review/find-all-stubs.js "."
```

Parse the output and verify whether each stub's `[::STUB::]` marker specifies a ticket ID.

### Step 4: Pre-cleanup gate (preflight)

Sweep resolved-but-stale markers and surface terminal excuses before any crime registration. Run the preflight classification:

```bash
node .claude/scripts/tickets/preflight-stub-cleanup.js
```

Classify the four classes and act on each:

| Class | Meaning | Action |
|-------|---------|--------|
| `resolvedCandidates` | Marker key references a COMPLETED ticket (reviewed/done/R<round>) | Verify in code that the defect is resolved, then `remove-stub.js --file=<path> --line=<N>` |
| `pendingObligations` | Marker key references an ACTIVE ticket (todo/in_progress/planned/remanded) | Legitimate pending work — leave for the phasify key rewrite |
| `orphans` | No key (MUST RESOLVE) or key references a non-existent ticket | Create the resolving ticket and rewrite the marker key, or remove if dead |
| `excuses` | Terminal-excuse language without a work item | Convert the resolution plan to an AI-executable work item, or remove |

Then run the validator as the loop condition:

```bash
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```

- **exit 0** → zero failures, proceed to Step 5.
- **exit 1** → read each `[validate-no-external-excuses] FAIL <file>:<line> -- <check> -- Action:` line, fix the marker (remove / rewrite the plan / rewrite the key), and re-run. **Loop until exit 0.** A round that makes no progress is a hard-stop diagnostic — do not proceed with unresolved excuses.

### Step 5: Register unresolved stubs as crimes

For stubs under the current directory that should have been resolved by past tickets but remain unresolved:
1. First, use `insert-stub.js` to add a proper `[::STUB::]` marker referencing an existing ticket (if one is missing)
2. Then register all of them as crimes via `malfeasance-create.js`
Crimes are recorded in the current directory's `Malfeasance.json`, so ensure the working directory is correct before executing.

```bash
node .claude/scripts/tickets/malfeasance-create.js "<file>" <line> "<description>"
```

**Judgment criteria**:
- If the marker specifies a planned resolution ticket ID → If that ticket is `done`, it should have been resolved → unresolved is a crime
- If the marker has no ticket ID → Evaluate in subsequent steps

### Step 6: Allocate unresolvable stubs to subsequent tickets

For stubs that do not specify a resolution in a subsequent ticket, take the following actions:

1. **Attempt to resolve**: If the current codebase state allows replacement with actual implementation, resolve on the spot
2. **Defer with a no-excuse work item**: If the stub cannot be resolved until a subsequent ticket is implemented, use `insert-stub.js --resolve-by-ticket=<EXISTING_TICKET_KEY>` to add the marker. The `--resolve-plan` MUST be an AI-executable work item (insert-stub.js rejects terminal-excuse plans). "Cannot be resolved" and "out of scope" are NOT acceptable plans — rewrite them as concrete implementation work.

**Remove the `[::STUB::]` marker from resolved stubs by running `node .claude/scripts/tickets/remove-stub.js --file=<path> --line=<N>` (or `--lines=<N1,N2,...>` for multiple). Do NOT edit source files directly.**

### Step 7: List crimes (directory-scoped)

Pass the current directory to `scan-crimes.sh` to list only crimes under the current directory.

```bash
.claude/scripts/tickets/scan-crimes.sh "."
```

### Step 8: Resolve all crimes

If crimes exist, resolve all of them. **It is absolutely unacceptable for crimes to remain unresolved, deferred, or left pending at this point.**

Resolution methods:
1. If the corresponding code is already implemented, remove the `[::STUB::]` marker and change `status` to `resolved` via `malfeasance-update.js`
2. If no `[::STUB::]` marker is attached, use `insert-stub.js` to add the marker (do NOT edit source files directly) and change `status` to `resolved` via `malfeasance-update.js`
3. Only if technically unresolvable, change to `false_positive` and record the reason in `note`. However, this is limited to cases that are truly unresolvable — a terminal excuse is not a valid reason.

```bash
# Resolve a crime (against the target directory's Malfeasance.json)
node .claude/scripts/tickets/malfeasance-update.js "<id>" "status" "resolved"

# Re-verify (directory-scoped)
.claude/scripts/tickets/scan-crimes.sh "."
```

**Do not declare this command complete until all crimes have been confirmed as resolved.**

### Step 9: Full scan + no-excuse gate (mandatory)

Before final verification, enumerate and validate STUBs at the directory scope (not per-ticket) and confirm zero excuses.
This catches STUBs that ticket-scoped phases may have missed.

**Conditional execution**: Step 9a and 9b below execute **only when `$ARGUMENTS` is non-empty** (a ticket key was provided). When `$ARGUMENTS` is empty (no arguments), proceed directly to Step 9c. This preserves backward compatibility with the default no-args mode.

**Step 9a — Enumerate remaining STUBs:**

Run only when `$ARGUMENTS` is non-empty:
```bash
if [ -n "$ARGUMENTS" ]; then
  node .claude/scripts/tickets/enumerate-ticket-targets.js \
    --dir=. --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
fi
```

**Step 9b — Validate targets:**

Run only when `$ARGUMENTS` is non-empty:
```bash
if [ -n "$ARGUMENTS" ]; then
  node .claude/scripts/tickets/validate-ticket-targets.js \
    --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
fi
```

**Step 9c — Directory-scoped scans + no-excuse validator:**

```bash
node .claude/scripts/tickets/review/find-all-stubs.js .
.claude/scripts/tickets/scan-crimes.sh
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```

**Escape hatch — no-excuse conditional deferral**: If a STUB cannot be resolved in this session, the AI MAY defer it ONLY when the deferral passes the no-excuse gate (requires `$ARGUMENTS` to be set):
1. **Convert the blocker into an AI-executable work item (Check B)** — the new ticket's scope must contain the internal implementation work (e.g. "Vendor and build PJSIP in build.rs", "Add cpal as an optional dependency"). Terminal-excuse language ("blocked on external dependency", "awaiting another team") is FORBIDDEN as a justification — every blocker is internal AI work.
2. Create a new ticket via `/make-ticket` with that work item in background and scope. **The new deferral ticket MUST be a non-PX ticket in the max phase** — `insert-stub.js` rejects `PX-*` resolve targets and non-todo targets, so a PX or past-phase ticket could never receive the deferred STUB.
3. Rewrite the marker key to the new ticket and update the STUB's `deferredTo` field to the new ticket key.
4. Re-run Step 9a and 9b (with `$ARGUMENTS` set) and the Step 9c validator — Check C (active key) must pass.
5. Record the deferred STUBs and their new ticket keys in the implementation summary.

**Convergence loop**: If Step 9b or 9c report issues, resolve them and re-run the Gate. **Loop until stub count, crime count, AND excuse count are all zero before proceeding to Step 10.** When `$ARGUMENTS` is empty, the loop runs Step 9c only (no enumerate/validate). The command never aborts on failures — each round fixes (remove / rewrite the plan / rewrite the key) and revalidates. A round that makes no progress is a hard-stop diagnostic.

### Step 10: Final verification

After resolution, re-run compilation and tests to confirm everything passes. Follow the same guidelines as Step 1 (Makefile priority, language-appropriate tool fallback). Additionally, the no-excuse validator must exit 0:

```bash
# Re-run compilation check
(cd "$(git rev-parse --show-toplevel)" && make check-be)

# Re-run tests
(cd "$(git rev-parse --show-toplevel)" && make test)

# No-excuse gate — must exit 0
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```

Once compile/test pass AND the validator exits 0, present a summary of the resolved items and report to the user.
