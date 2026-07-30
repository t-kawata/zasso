---
description: Inspect reviewed tickets for contract-to-test gaps and record omissions.
---

# /find-omissions

Inspect every reviewed ticket to verify that its contracts are fully and accurately translated into test code. When gaps are found, record them as structured omission tickets for the subsequent implementation loop.

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

- **No speculation**: Every claim in your evaluation must cite a specific file and line number. "I think" or "probably" is forbidden.
- **No assumptions from names**: A function named `validate_email` may not actually validate anything. Read its body.
- **No trust in comments**: Comments lie. The code is the only truth.
- **Follow the trail**: If a contract says "input must be non-empty" but you don't see a check in the listed files, search the entire crate for where that check might live. It may be in a parent caller, a validation trait, or a type system constraint.
- **Check test boundaries**: A passing test doesn't mean the contract is covered. Check whether the test inputs actually exercise the precondition boundary, whether the assertions actually verify the postcondition, and whether the invariant is ever asserted outside the implementation itself.
- **No shortcuts**: "This looks correct" is not an evaluation. You must confirm that a violation WOULD be caught by an existing test (Criterion B).

Your deliverable is not a summary of the code — it is a **verification** that each contract is enforced by test code, with specific file:line evidence.

### Step 4 — Evaluate and decide

For each contract, record your evaluation:

| Found | Action |
|-------|--------|
| No issues (A+B+C all pass) | Do nothing. Move to next ticket. |
| Gap found (any of A/B/C fails) | Record an omission (see Step 5). |

### Step 5 — Record an omission (when a gap is found)

When you find a contract gap, record it using `add-omission-ticket.js --ticket-key`:

```bash
# 5a: Prepare the foundOmissions JSON
cat > /tmp/omission.json << 'EOF'
[
  {
    "contractId": "C001",
    "criterion": "A",
    "description": "Precondition for positive rate is not tested: the function accepts values 0..100 but tests only use 50.",
    "codeLocation": "src/rate.rs:88-92",
    "expectedBehavior": "Test should include boundary values (0, 1, 99, 100) to verify precondition",
    "actualBehavior": "Only middle-range value (50) is tested; precondition enforcement is untested"
  }
]
EOF

# 5b: Pipe it to add-omission-ticket.js with the ticket key
node .claude/scripts/tickets/add-omission-ticket.js \
  --ticket-key=P0-4 \
  --tmp-omissions=_tmp-omissions-<timestamp>.json \
  --tickets=Tickets.json < /tmp/omission.json
```

This does the following:
1. Looks up the original ticket `P0-4` in Tickets.json
2. Deep-clones ALL its fields (title, background, scope, contracts, testUnit, etc.)
3. Attaches the `foundOmissions` array to the cloned ticket
4. Appends it to `_tmp-omissions-*.json` under the PX phase (phaseId=-1)
5. The original ticket in Tickets.json is NOT modified

**Why deep-clone the original ticket?** So that the omission ticket carries the full context — the next implementer sees not just "what's wrong" but the entire original ticket context, making re-implementation faster and more accurate.

### Step 6 — Repeat

Run Step 1 again to get the next ticket. Continue until you see:

```
All tickets inspected.
```

### Step 7 — Finalize (after all tickets are inspected)

Merge all omission tickets into Tickets.json:

```bash
node .claude/scripts/tickets/merge-omissions-to-tickets.js
```

This:
1. Reads `_tmp-omissions-*.json`
2. Validates all `foundOmissions` arrays
3. Groups tickets by their target `phaseId`
4. Assigns sequential ticket IDs (no conflicts with existing)
5. Appends them into Tickets.json
6. Creates any missing phases automatically

### Step 8 — Clean up (optional)

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js --with-clean-trash
```

Removes both `_tmp-omissions-*.json` and `_tmp-check-target-tickets-cmds-*.json`.

## foundOmissions Schema Reference

```typescript
interface FoundOmission {
  contractId: string;     // (required) Which contract, e.g. "C001"
  criterion: "A"|"B"|"C";// (required) Which criterion failed
  description: string;    // (required) What is wrong, specifically
  codeLocation: string;   // (required) File:line of the issue
  expectedBehavior?: string; // (optional) What should happen
  actualBehavior?: string;   // (optional) What actually happens
}
```

The `add-omission-ticket.js --ticket-key` validates that all 4 required fields are present and non-empty before writing.

## Error Handling

| Scenario | What happens |
|----------|-------------|
| No reviewed tickets in Tickets.json | Script exits 1 with "No reviewed or remanded tickets found" |
| All tickets already inspected | Prints "All tickets inspected." and exits 0 |
| Tickets.json not found | Exits 1 with error |
| Child process fails (create-tmp-omissions, etc.) | Exits 1 with child process stderr |
| Invalid foundOmissions (missing fields) | add-omission-ticket.js exits 1 with specific field error |
| Invalid _tmp-omissions format | merge-omissions-to-tickets.js exits 1 with validation error |

## How remanded Status Affects Re-inspection

When a ticket is inspected, its status changes to `remanded`. The cmds file includes BOTH `reviewed` AND `remanded` tickets. This means:

- **First pass**: All `reviewed` tickets are inspected → become `remanded`
- **Second pass**: `remanded` tickets are inspected again (if you re-generate the cmds file)
- **Idempotency**: Re-running the pipeline re-inspects previously inspected tickets, allowing you to verify that past omissions have been fixed

If you need to re-inspect only new `reviewed` tickets, delete the existing cmds file and let it be re-created from the current Tickets.json state.

## Dependencies

| Script | Ticket | Purpose |
|--------|--------|---------|
| `create-tmp-omissions.js` | PX-97 | Collect STUB + non-reviewed tickets |
| `create-check-target-tickets-cmds.js` | PX-98 | Build reviewed/remanded command list |
| `add-omission-ticket.js` | PX-100 | Append validated omission tickets |
| `get-next-check-target-ticket.js` | PX-101 | Orchestrate the inspection loop |
| `merge-omissions-to-tickets.js` | PX-102 | Merge omissions into Tickets.json |
