---
description: Inspect reviewed tickets for contract-to-test gaps and record omissions.
argument-hint: </path/to/*-GRAPH.json>
---

# /find-omissions

Inspect every reviewed ticket to verify that its contracts are fully and accurately translated into test code. When gaps are found, record them as structured omission tickets for the subsequent implementation loop.

## Pre-flight — argument validation (mandatory)

Before any other step, validate the argument:

```bash
node .claude/scripts/tickets/validate-graph-arg.js "$ARGUMENTS" || exit 2
```

## Overview

```
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

  add-omission-ticket.js --ticket-key=<KEY> < foundOmissions.json
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

### Step 1 — Run the script

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js
```

Output:
```
Total 133 tickets to inspect. Inspecting ticket 4/133.

# Target ticket is P0-4: Error Design — ...
...
```

### Step 2 — Understand the ticket

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

### Step 3 — Analyze source code (core of the pipeline)

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

### Step 4 — Evaluate and record (per-contract, per-criterion, immediately)

For EACH contract defined in the ticket, evaluate ALL three criteria (A, B, C).  
**Only record when you confirm a contract violation** — that is, when `passed = false` for any of A/B/C on any contract.  
**Record it the moment you confirm it** — do not batch, do not rely on memory.  
**Do NOT record vague unease, style preferences, or observations unrelated to the three criteria.**

#### Evaluation procedure (per criterion, not per contract)

Do NOT bundle multiple criteria into one evaluation block. **Evaluate and record one criterion at a time.**

**Step 4a — Evaluate one criterion**

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

**Step 4b — If `passed = false`, record immediately**

```bash
# Step 4b execution — no delay, no further analysis first
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

**Step 4c — Continue with the next criterion**

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

### Step 5 — Record an omission (execute the moment a gap is found)

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

### Step 6 — Repeat

Run Step 1 again to get the next ticket. Continue until you see:

```
All tickets inspected.
```

### Step 7 — Clean up

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js --with-clean-trash
```

Removes both `_tmp-omissions-*.json` and `_tmp-check-target-tickets-cmds-*.json`.  
Before deleting, the script copies `_tmp-omissions-*.json` to `OMISSIONS-<timestamp>.json` as the deliverable of `/find-omissions`.

# Step 8 — Merge into Tickets.json

```bash
node .claude/scripts/rfc-graph/phasify-omissions.js --graph="$ARGUMENTS"
```

This computes optimal phase/ticket boundaries from the omissions found in Steps 1-6 and merges them mechanically into Tickets.json. Because the merge is algorithmic, phase names are generic (P6, P7, ...). The stdout lists each phase's node titles and ticket info, followed by the exact `rename-phases.js` commands to assign meaningful names. You **must** follow those instructions in Step 9.

# Step 9 — Rename phases

Run the `rename-phases.js` commands printed in Step 8's stdout. Each re-implementation phase name **must** start with the prefix `"Omissions: "` to clearly mark it as omission-derived. Example:

```bash
node .claude/scripts/tickets/rename-phases.js --phase=6 --name="Omissions: Storage & Connection Layer"
node .claude/scripts/tickets/rename-phases.js --phase=7 --name="Omissions: Migration Runner"
```
