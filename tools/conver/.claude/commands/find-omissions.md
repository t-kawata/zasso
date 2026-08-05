---
description: Inspect reviewed tickets for contract-to-test gaps and record omissions.
argument-hint: </path/to/*-GRAPH.json>
disable-model-invocation: true
---

# /find-omissions

Inspect every reviewed ticket to verify that its contracts are fully and accurately translated into test code. When gaps are found, record them as structured omission tickets for the subsequent implementation loop.

## Pre-flight — argument + consolidation prerequisite validation (mandatory)

Before any other step, validate the argument and the consolidation prerequisite. `/find-omissions` requires a completed `/consolidate-stubs` run so a complete grouped unit manifest exists:

```bash
node .claude/scripts/tickets/validate-graph-arg.js "$ARGUMENTS" || exit 2
node .claude/scripts/tickets/require-consolidated-manifest.js || exit 2
```

`require-consolidated-manifest.js` exits 0 when `./manifests/CONSOLIDATED-MANIFEST-*.json` exists and exits 2 (with a cause/action message) otherwise — run `/consolidate-stubs` first, then re-run `/find-omissions`.

## Overview

```
Step 1 (re-ticketize, before inspection): a marker needing a new resolving ticket → batch-create-resolving-tickets.js (auto, never ask the human)

Inspection loop — one command, repeated per ticket:

  node get-next-check-target-ticket.js
    │
    ├─ [first run only] auto-creates _tmp-omissions-*.json if missing
    ├─ [first run only] auto-creates _tmp-check-target-tickets-cmds-*.json if missing
    │
    ├─ pops the next unchecked ticket (done:true, status→remanded)
    ├─ displays ticket context
    └─ repeat the same command for the next ticket

  ↓  when a gap is found:

  echo '<foundOmissions JSON>' | node add-omission-ticket.js --ticket-key=<KEY>
    └─ appends to _tmp-omissions-*.json
```

## How the Script Works

Each time you run `get-next-check-target-ticket.js`, it:

1. **Auto-creates tmp files** if they don't exist:
   - `_tmp-omissions-<timestamp>.json` — holds omission tickets you record
   - `_tmp-check-target-tickets-cmds-<timestamp>.json` — queue of all reviewed/remanded tickets

2. **Pops the next unchecked ticket** from the cmds queue:
   - Marks the entry `done: true` (persisted to disk)
   - Changes the ticket's `status` to `"remanded"` in Tickets.json
   - The `[!]` symbol in `list-phases-and-tickets.js` shows remanded tickets

3. **Displays the ticket context**:
   - Prefix: `Total N tickets to inspect. Inspecting ticket M/N.`
   - Followed by the full output of `show-ticket-context.js --for-spec --no-implementation-order`

4. **Waits for you** to analyze and act. The script exits after outputting the context.

## ABC Inspection Criteria

These are the three criteria you **MUST** evaluate for EVERY ticket by analyzing the actual source code — do NOT rely solely on the show-ticket-context.js output, which may be stale.

### Criterion A — Contract Translation

**Question**: Are all contracts (Precondition / Postcondition / Invariant) accurately translated into test code?

Check each contract defined in the ticket's `Contracts` section:
- **Precondition** → Is there a test that sets up the exact input condition?
- **Postcondition** → Is there a test that asserts the exact output/state?
- **Invariant** → Is there a test or assertion that verifies the invariant holds?

**Pass example**: Contract says "Precondition: input is a valid email" → test has `let input = "user@example.com";`

**Fail example**: Contract says "Postcondition: returns Ok with user object" → test only checks `result.is_ok()` but never checks the user object fields.

### Criterion B — Violation Detection

**Question**: Can every contract violation be detected by an existing test assertion?

Check whether the tests would **fail** if a violation were introduced:
- If a precondition check were removed, would a test catch it?
- If a postcondition were violated, would an assertion fail?
- If an invariant were broken, would a test detect it?

**Pass example**: Removing input validation → test with invalid input would fail.

**Fail example**: A contract says "must not overflow" but the only test uses values far below the boundary.

### Criterion C — Test Precision

**Question**: Are tests precise and unambiguous, or are they loose/sloppy?

Check for:
- **Too-broad assertions**: `assert!(result.is_ok())` when specific field checks are needed
- **Missing negative tests**: Only testing happy path, no error/edge cases
- **Stale or commented tests**: Tests that don't actually test current behavior
- **Circular reasoning**: Test that uses the same logic being tested
- **Low coverage masking**: `unwrap()` without error context, `#[allow(...)]` without justification

## Step-by-Step Inspection Procedure

### Step 1 — Re-ticketize the consolidated units (mandatory)

The `/consolidate-stubs` Step 5 gate has already guaranteed the marker tree is clean: no orphan keys, no terminal excuses, every marker re-pointed to a valid key, and a complete grouped unit manifest emitted. Step 1 consumes that manifest: pipe it into `batch-create-resolving-tickets.js`, which creates **one resolving ticket per (sourceKey, unit) group** and atomically rewrites every on-disk marker key. **Never pause to ask the human** — this is the AI's work item, per the no-external-excuse rule.

Run from the directory containing Tickets.json (the source root is cwd):

```bash
MANIFEST=$(ls -t manifests/CONSOLIDATED-MANIFEST-*.json | head -1)
cat "$MANIFEST" | node .claude/scripts/tickets/batch-create-resolving-tickets.js --no-write   # review (zero side effects)
cat "$MANIFEST" | node .claude/scripts/tickets/batch-create-resolving-tickets.js               # commit
```

**What to expect**:
- **review first (`--no-write`)**: validates the whole manifest with zero side effects; stdout prints `{ createdTickets, skipped, rewrittenMarkers, dryRun: true }`.
- **commit**: on success stdout prints `{ createdTickets, skipped, rewrittenMarkers, dryRun: false }` — Tickets.json gained one `todo` ticket per non-skipped entry, and every on-disk marker line of a created unit now references its new key (C007-skipped markers — already referencing an active ticket — are left untouched).
- **re-run is safe**: markers already referencing an active ticket are skipped, so re-running never duplicates tickets.
- **on failure nothing is written**: stderr lists each failure with its file:line and an Action-directive; fix the reported marker and re-run.

> **`/consolidate-stubs` handoff**: `/consolidate-stubs` Step 5 writes the grouped manifest to `./manifests/CONSOLIDATED-MANIFEST-<ts>.json` — one `{ sourceKey, stubs: [{ file, line, content }] }` entry per unit, with `file` cwd-relative:
> ```json
> [{ "sourceKey": "P4-2", "stubs": [{ "file": "src/a.rs", "line": 4, "content": "// [::STUB::] P4-2: reason -- Implement" }] }]
> ```
> Pipe it straight into the tool with `MANIFEST=$(ls -t manifests/CONSOLIDATED-MANIFEST-*.json | head -1) && cat "$MANIFEST" | node .claude/scripts/tickets/batch-create-resolving-tickets.js --no-write` — one ticket per (sourceKey, unit) group.

**Post-creation content rewrite (mandatory)**: each new resolving ticket carries the SOURCE ticket's **OLD content** (it is a deep-clone). Rewrite each one into the NEW work item **one field at a time (max 3 fields per `update-ticket.js` call)**, in this order: `title` → `background` → `scope` → `acceptanceCriteria` → `invariants` → `testUnit` → `testIntegration` → `testExceptions` → `contracts` → `investigation` → `boyScoutPlan` → `instrumentation` → `notes`. **PRESERVE** `nodeIds`/`relatedTicketIds`/`referenceSection`/`referenceUrls`/`sourcePaths`/`rfcDiscrepancies` — they are already correct from the clone; add to arrays, never overwrite.

**Residual safety net (after the commit)** — sweep for markers the consolidation did not cover (added after consolidate, or left UNASSIGNED), then run the no-excuse validator as the loop condition:

```bash
node .claude/scripts/tickets/preflight-stub-cleanup.js
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```

- **exit 0** → zero failures, proceed to Step 2.
- **exit 1** → read each `[validate-no-external-excuses] FAIL <file>:<line> -- <check> -- Action:` line, fix the marker (remove / rewrite the plan / rewrite the key), and re-run the gate. **Loop until exit 0.** A round that makes no progress is a hard-stop diagnostic — do not proceed with unresolved excuses.

> **Why a completed-key marker can fail here**: this validator runs in normal mode (`--fail-on-excuse`), where Check C rejects a marker referencing a **completed** ticket — unlike `/consolidate-stubs`'s Step 5 gate, which accepts completed keys via `--for-consolidate`. That gate covers only the *grouped* markers; completed-key leftovers (left `UNASSIGNED`, or added after the consolidate apply) are this safety net's job. `preflight-stub-cleanup.js` classifies them and prints the `remove-stub.js` / `create-resolving-ticket.js` commands — resolve each, then re-run the validator.

**Output message convention**: every stdout/stderr line from these scripts is English, self-contained, and Action-directive. A fresh session must be able to act on a message alone.

### Step 2 — Run the script

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js
```

Output:
```
Total 133 tickets to inspect. Inspecting ticket 4/133.

# Target ticket is P0-4: Error Design — ...
...
```

### Step 3 — Understand the ticket

Read the entire output carefully. Key sections to extract:

| Section | What to look for |
|---------|-----------------|
| `## Contracts` | The exact Precondition/Postcondition/Invariant to verify |
| `## Acceptance Criteria` | What behavior was supposed to be implemented |
| `## Test Plan` | What tests were planned (testUnit / testIntegration / testExceptions) |
| `## Scope` | Which modules and files are in scope |
| `### Implementation Target File Paths` | Concrete file paths to read first — always listed under Scope as `default_files`. Start here, but never be bound by them. |
| `## Investigation` | Evidence from the original investigation |
| `## Invariants` | Invariant conditions the system must always satisfy |
| `## Notes` | Known risks, caveats, open items |

### Step 4 — Analyze source code (core of the pipeline)

This is the **most critical step**. The quality of the entire pipeline depends on the rigor of this analysis. Superficial analysis produces sloppy omissions, which cause the implementation loop to diverge rather than converge.

**Start from `Implementation Target File Paths` — but NEVER be bound by them.** Use them as entry points, then follow the code trail wherever it leads:

1. Read every implementation file listed in `Implementation Target File Paths`
2. For each function referenced in Contracts, trace its full call chain
3. Find the **actual test files** — do NOT limit yourself to the test plans in the ticket. The spec may list planned tests, but you must read whatever test files exist on disk. Search for test modules, integration test files, and any test helper/fixture files that exercise the relevant code.
4. When you encounter a type, trait, or module you haven't read yet — read it
5. When a test imports a helper or fixture — read that too
6. Continue until you have traced every contract element to its actual code

**Fundamental rules:**

- **No speculation**: Every claim in your evaluation must cite a specific file and the surrounding source code. "I think" or "probably" is forbidden.
- **No assumptions from names**: A function named `validate_email` may not actually validate anything. Read its body.
- **No trust in comments**: Comments lie. The code is the only truth.
- **Follow the trail**: If a contract says "input must be non-empty" but you don't see a check in the listed files, search the entire crate for where that check might live. It may be in a parent caller, a validation trait, or a type system constraint.
- **Check test boundaries**: A passing test doesn't mean the contract is covered. Check whether the test inputs actually exercise the precondition boundary, whether the assertions actually verify the postcondition, and whether the invariant is ever asserted outside the implementation itself.
- **No shortcuts**: "This looks correct" is not an evaluation. You must confirm that a violation WOULD be caught by an existing test (Criterion B).

Your deliverable is not a summary of the code — it is a **verification** that each contract is enforced by test code, with specific source code evidence (file + codes).

### Step 5 — Evaluate and record (per-contract, per-criterion, immediately)

For EACH contract defined in the ticket, evaluate ALL three criteria (A, B, C).  
**Only record when you confirm a contract violation** — that is, when `passed = false` for any of A/B/C on any contract.  
**Record it the moment you confirm it** — do not batch, do not rely on memory.  
**Do NOT record vague unease, style preferences, or observations unrelated to the three criteria.**

#### Evaluation procedure (per criterion, not per contract)

Do NOT bundle multiple criteria into one evaluation block. **Evaluate and record one criterion at a time.**

**Step 5a — Evaluate one criterion**

Pick one contract and one criterion (A, B, or C). Trace the code. Determine `passed`.

```
Example thought process for Criterion B on Contract C001:

  Contract says "input must be non-empty."
  Code at src/validation.rs:25 has: if input.is_empty() { return Err(...) }
  Test at tests/validation.rs:44 tests with input = "John Doe" (valid, 8 chars)
  No test anywhere passes input = "".
  If line 25 were removed, no test would fail.
  → PASSED = false
```

**Step 5b — If `passed = false`, record immediately**

```bash
# Step 5b execution — no delay, no further analysis first
echo '[{"evaluations":[{
  "criterion": "B",
  "passed": false,
  "reason": "Contract C001 precondition: input must be non-empty. Code check exists at src/validation.rs:25 but no test exercises empty input. If the check were removed, no test would fail.",
  "evidence": [
    {"file": "src/validation.rs", "line": 25},
    {"file": "tests/validation.rs", "line": 44}
  ]
}]}]' | node .claude/scripts/tickets/add-omission-ticket.js \
  --ticket-key=P0-4
```

**Step 5c — Continue with the next criterion**

After recording, move to the next criterion (or next contract). Do not batch.

```
Criterion C on same contract:
  Same test at tests/validation.rs:52 uses assert_eq!(result, Err(ValidationError::EmptyInput)).
  This is precise — it checks the exact error variant, not just is_err().
  → PASSED = true  (no recording needed)
```

**Rules for the evaluation (applies to each individual criterion):**

- `passed` must be a **boolean**. `true` = no issue found. `false` = omission found.
- `reason` must cite **specific file + surrounding code** evidence. "The code looks correct" is forbidden.
- `evidence` must be an array of `{file: string, line: number}` objects — no free text, no code snippets.
- If `passed = false`, the `reason` must explain **what is missing** and **what should exist**, in a self-contained way.
- **Do NOT construct a single JSON with multiple evaluations** unless you discovered them simultaneously and they share the same `severity`/`recommendation`. When in doubt, make separate calls.

### Step 6 — Record an omission (execute the moment a gap is found)

As soon as you confirm a `passed = false`, construct the foundOmissions entry and pipe it.

#### Example: first omission found for contract C001, criterion B

```bash
echo '[{
  "evaluations": [{
    "criterion": "B",
    "passed": false,
    "reason": "No test passes an empty string to verify the non-empty precondition. The check exists at src/validation.rs:25 but no test would catch its removal. A test with input=\"\" should assert Err(ValidationError::EmptyInput).",
    "evidence": [
      {"file": "src/validation.rs", "line": 25},
      {"file": "tests/validation.rs", "line": 44},
      {"file": "tests/validation.rs", "line": 60}
    ]
  }]
}]' | node .claude/scripts/tickets/add-omission-ticket.js \
  --ticket-key=P0-4
```

#### Multiple evaluations in one call (for multiple criteria on the same contract)

When you find gaps in multiple criteria at once, include them all:

```bash
echo '[{
  "severity": "critical",
  "recommendation": "Add boundary tests for empty input, max-length input, and verify exact error assertions",
  "evaluations": [
    {
      "criterion": "A",
      "passed": false,
      "reason": "Precondition 'input must be non-empty' is checked in code (src/validation.rs:25) but no test exercises an empty string. The precondition boundary is not tested at all.",
      "evidence": [
        {"file": "src/validation.rs", "line": 25},
        {"file": "tests/validation.rs", "line": 44}
      ]
    },
    {
      "criterion": "B",
      "passed": false,
      "reason": "If the empty-string check at src/validation.rs:25 were removed, no existing test would fail. All tests pass valid inputs only.",
      "evidence": [
        {"file": "src/validation.rs", "line": 25},
        {"file": "tests/validation.rs", "line": 44},
        {"file": "tests/validation.rs", "line": 60}
      ]
    }
  ]
}]' | node .claude/scripts/tickets/add-omission-ticket.js \
  --ticket-key=P0-4
```

**Key principles:**

| Principle | Why |
|-----------|-----|
| **Record the moment you find it** | Your analysis context is fresh. Delaying risks losing detail. The script handles deduplication via `originalTicketKey`. |
| **One finding = one `evaluations[]` entry** | Each evaluation is a single criterion on a single contract. If you find two gaps, include two evaluations. |
| **`passed = false` is an omission** | The merge pipeline uses this to determine which tickets need re-implementation. |
| **`evidence[]` must be exhaustive** | List every file:line you inspected for this evaluation. The next implementer will trace your steps. |
| **`reason` must be self-contained** | It should make sense without reading the original ticket. Include the contract text, what you found, and what is missing. |
| **`severity` is optional but helpful** | Use `"critical"` for missing entire contract coverage, `"major"` for partial coverage, `"minor"` for imprecise assertions. |

### Step 7 — Repeat

Run Step 2 again to get the next ticket. Continue until you see:

```
All tickets inspected.
```

### Step 8 — Clean up

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js --with-clean-trash
```

Removes both `_tmp-omissions-*.json` and `_tmp-check-target-tickets-cmds-*.json`.  
Before deleting, the script copies `_tmp-omissions-*.json` to `OMISSIONS-<timestamp>.json` as the deliverable of `/find-omissions`.

# Step 9 — Merge into Tickets.json

```bash
node .claude/scripts/rfc-graph/phasify-omissions.js --graph="$ARGUMENTS"
```

This computes optimal phase/ticket boundaries from the omissions found in Steps 2-7 and merges them mechanically into Tickets.json. Because the merge is algorithmic, phase names are generic (P6, P7, ...). The stdout lists each phase's node titles and ticket info, followed by the exact `rename-phases.js` commands to assign meaningful names. You **must** follow those instructions in Step 10.

**STUB key rewrite (built into phasify)**: when a cloned ticket carries `stubs[]` from a marker that referenced an OLD ticket key, phasify rewrites every marker key to the clone's new key (`P{newPhase}-{newId}`). The actual source marker lines are always rewritten relative to the current directory (the Tickets.json root). The merge is REJECTED (exit non-zero) if any stub still carries a terminal excuse — run Step 1 again and clear all excuses before re-running.

# Step 10 — Rename phases

Run the `rename-phases.js` commands printed in Step 9's stdout. Each re-implementation phase name **must** start with the prefix `"Omissions: "` to clearly mark it as omission-derived. Example:

```bash
node .claude/scripts/tickets/rename-phases.js --phase=6 --name="Omissions: Storage & Connection Layer"
node .claude/scripts/tickets/rename-phases.js --phase=7 --name="Omissions: Migration Runner"
```

# Step 11 — Clean up transient consolidation artifacts (full success only)

After ALL of the above steps pass (tickets created, markers rewritten, omissions merged and renamed), remove the transient consolidation artifacts the pipeline no longer needs:

```bash
node .claude/scripts/tickets/clean-consolidation-artifacts.js
```

This removes `manifests/CONSOLIDATED-MANIFEST-*.json` and `manifests/ROLLBACK-*.json`, and `manifests/` itself iff empty. Idempotent — exit 0 when nothing to remove. The rollback backup only exists to undo a *wrong* consolidation; once `/find-omissions` has consumed the manifest and created tickets, restoring the rollback would desync markers from the created tickets, so it is removed at the same time. Re-running `/find-omissions` requires a fresh `/consolidate-stubs` (the mandatory model).
