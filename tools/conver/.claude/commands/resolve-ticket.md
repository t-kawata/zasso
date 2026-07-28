---
description: Resolves warnings, errors, stubs, and crimes under a directory.
---

# /resolve-ticket

**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: Every incomplete implementation (stub, mock, placeholder, temporary implementation, by any name) **must** carry a `[::STUB::]` marker without exception. This is an absolute, inviolable law; violations are recorded as "crimes" in Malfeasance.json. In all phases of this command, read Malfeasance.json and verify there are no unresolved crimes. If you discover a violation, resolve it immediately, or add the marker and record it on the spot.

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

- `P{phaseID}-{ticketID}` format (e.g. `P0-1`, `PX-53`) → Optional ticket key. When provided, Step 7.5a (enumerate) and Step 7.5b (validate) execute against this ticket. When omitted, they are skipped and the command runs its default workflow (Steps 1-8, excluding enumerate/validate).
- No argument → Default mode, skips Step 7.5a/7.5b (backward compatibility)
- Numeric only → Interrupt with error
- Anything else → Interrupt with error

## List of Scripts Used

Located under `.claude/scripts/tickets/`.

| Script | Arguments | Description |
|--------|-----------|-------------|
| `review/find-all-stubs.js` | `<directory>` | List all stubs |
| `scan-crimes.sh` | `[directory]` (when specified, shows only crimes under that directory) | Execute crime scan |
| `malfeasance-create.js` | `<file> <line> <description> [note]` | Record a new crime |
| `malfeasance-update.js` | `<id> <key> <val>` | Update a crime record (resolve, etc.) |
| `review/run-quality-checks.js` | `<files...>` | Static quality check |
| `review/generate-report.js` | (via stdin) | Generate quality report |

## Workflow

### Step 1: Run cargo check / cargo test and capture warnings and errors

Run `cargo check` and `cargo test` in the current directory, and capture all warnings and errors.

```bash
cargo check 2>&1

cargo test 2>&1
```

**Note**: If a Makefile exists in the target directory with an appropriate target, using `make` is also acceptable, but use `cargo` directly when raw output is needed.

### Step 2: Resolve warnings and errors

Resolve all captured warnings and errors. Resolution methods:

1. **Immediately resolvable**: Fix the code to eliminate the warning/error
2. **Should be resolved by a subsequent ticket**: Add a `[::STUB::]` marker with the planned resolution ticket ID at the relevant location, and suppress the warning/error using appropriate mechanisms such as `#[allow(...)]`
3. **Suppression and marker consistency**: Verify that there is no suppression without `[::STUB::]`, and no `[::STUB::]` without suppression

**Do not proceed to the next step until all warnings and errors are resolved.**

### Step 3: List stubs (directory-scoped)

Pass the current directory to `find-all-stubs.js` to list only stubs under the current directory.

```bash
node .claude/scripts/tickets/review/find-all-stubs.js "."
```

Parse the output and verify whether each stub's `[::STUB::]` marker specifies a ticket ID.

### Step 4: Register unresolved stubs as crimes

For stubs under the current directory that should have been resolved by past tickets but remain unresolved, register all of them as crimes via `malfeasance-create.js`. Crimes are recorded in the current directory's `Malfeasance.json`, so ensure the working directory is correct before executing.

```bash
node .claude/scripts/tickets/malfeasance-create.js "<file>" <line> "<description>"
```

**Judgment criteria**:
- If the marker specifies a planned resolution ticket ID → If that ticket is `done`, it should have been resolved → unresolved is a crime
- If the marker has no ticket ID → Evaluate in subsequent steps

### Step 5: Allocate unresolvable stubs to subsequent tickets

For stubs that do not specify a resolution in a subsequent ticket, take the following actions:

1. **Attempt to resolve**: If the current codebase state allows replacement with actual implementation, resolve on the spot
2. **Unresolvable**: If the following reasons apply, specify the ticket ID for the timing of resolution in the `[::STUB::]` marker
   - Cannot be resolved until a subsequent ticket is implemented
   - Should not be addressed now (out of scope, too risky, etc.)

**Remove the `[::STUB::]` marker from resolved stubs.**

### Step 6: List crimes (directory-scoped)

Pass the current directory to `scan-crimes.sh` to list only crimes under the current directory.

```bash
.claude/scripts/tickets/scan-crimes.sh "."
```

### Step 7: Resolve all crimes

If crimes exist, resolve all of them. **It is absolutely unacceptable for crimes to remain unresolved, deferred, or left pending at this point.**

Resolution methods:
1. If the corresponding code is already implemented, remove the `[::STUB::]` marker and change `status` to `resolved` via `malfeasance-update.js`
2. If no `[::STUB::]` marker is attached, add the marker and change `status` to `resolved` via `malfeasance-update.js`
3. Only if technically unresolvable, change to `false_positive` and record the reason in `note`. However, this is limited to cases that are truly unresolvable.

```bash
# Resolve a crime (against the target directory's Malfeasance.json)
node .claude/scripts/tickets/malfeasance-update.js "<id>" "status" "resolved"

# Re-verify (directory-scoped)
.claude/scripts/tickets/scan-crimes.sh "."
```

**Do not declare this command complete until all crimes have been confirmed as resolved.**

### Step 7.5: Full scan (mandatory — C003)

Before final verification, enumerate and validate STUBs at the directory scope (not per-ticket).
This catches STUBs that ticket-scoped phases may have missed.

**Conditional execution**: Step 7.5a and 7.5b below execute **only when `$ARGUMENTS` is non-empty** (a ticket key was provided). When `$ARGUMENTS` is empty (no arguments), proceed directly to Step 7.5c. This preserves backward compatibility with the default no-args mode.

**Step 7.5a — Enumerate remaining STUBs:**

Run only when `$ARGUMENTS` is non-empty:
```bash
if [ -n "$ARGUMENTS" ]; then
  node .claude/scripts/tickets/enumerate-ticket-targets.js \
    --dir=. --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
fi
```

**Step 7.5b — Validate targets:**

Run only when `$ARGUMENTS` is non-empty:
```bash
if [ -n "$ARGUMENTS" ]; then
  node .claude/scripts/tickets/validate-ticket-targets.js \
    --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
fi
```

**Step 7.5c — Directory-scoped scans:**

```bash
node .claude/scripts/tickets/review/find-all-stubs.js .
.claude/scripts/tickets/scan-crimes.sh
```

**Escape hatch — new ticket for truly unresolvable STUBs**: If a STUB genuinely cannot be resolved in this session (e.g., blocked on external dependency, awaiting another team), the AI MUST (requires `$ARGUMENTS` to be set):
1. Create a new ticket via `/make-ticket` with full justification in background and scope
2. Update the STUB's `deferredTo` field to the new ticket key
3. Re-run Step 7.5a and 7.5b to confirm validation passes (re-run with `$ARGUMENTS` set)
4. Record the deferred STUBs and their new ticket keys in the implementation summary

**Convergence loop**: If Step 7.5b or 7.5c report issues, resolve them and re-run from Step 7.5a. **Loop until both validate-ticket-targets and scan-crimes.sh report zero remaining STUBs/crimes, OR all unresolvable items are deferred to new tickets, before proceeding to Step 8.** When `$ARGUMENTS` is empty, the loop runs Step 7.5c only (no enumerate/validate).

### Step 8: Final verification

After resolution, re-run compilation and tests to confirm everything passes.

```bash
cargo check 2>&1
cargo test 2>&1
```

Once verified, present a summary of the resolved items and report to the user.
