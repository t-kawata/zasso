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

No arguments accepted. If any are provided, interrupt with an error.

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

Run `cargo check` and `cargo test` with the directory specified in the argument as the current directory, and capture all warnings and errors.

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

Pass the directory specified in the argument to `find-all-stubs.js` to list only stubs under that directory.

```bash
node .claude/scripts/tickets/review/find-all-stubs.js "."
```

Parse the output and verify whether each stub's `[::STUB::]` marker specifies a ticket ID.

### Step 4: Register unresolved stubs as crimes

For stubs under the specified directory that should have been resolved by past tickets but remain unresolved, register all of them as crimes via `malfeasance-create.js`. Crimes are recorded in the target directory's `Malfeasance.json`, so `cd` into it before executing.

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

Pass the directory specified in the argument to `scan-crimes.sh` to list only crimes under that directory.

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

### Step 8: Final verification

After resolution, re-run compilation and tests to confirm everything passes.

```bash
cargo check 2>2>&1)1
cargo test 2>2>&1)1
```

Once verified, present a summary of the resolved items and report to the user.
