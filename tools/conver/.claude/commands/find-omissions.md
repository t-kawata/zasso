---
description: Inspect reviewed tickets for contract-to-test gaps and record omissions (find-omissions pipeline).
---

# /find-omissions

Inspect all reviewed tickets for gaps between contracts and their test implementations, and record findings as omission tickets.

## Pipeline Overview

The find-omissions pipeline automates the inspection of every reviewed ticket to check whether its contracts are fully and accurately translated into test code. It runs in a single integrated step (Steps 1-3), followed by optional post-processing (Steps 4-7).

```
Integrated Step 1 (automated):
  ├─ Create _tmp-omissions-*.json (STUB + non-reviewed collection) ── if missing
  ├─ Create _tmp-check-target-tickets-cmds-*.json (reviewed command list) ── if missing
  └─ For each unchecked ticket:
       ├─ Pop next entry, mark done:true, set status → remanded in Tickets.json
       ├─ Execute show-ticket-context.js --for-spec --no-implementation-order
       └─ Prefix stdout with progress: Total N tickets to inspect. Inspecting ticket M/N.

Post-processing (manual / separate tickets):
  ├─ Step 4: Group omission tickets by phase in _tmp-omissions-*.json
  ├─ Step 5: Reassign ticket IDs
  ├─ Step 6: Merge into Tickets.json
  └─ Step 7: Clean up _tmp-* temporary files
```

## Usage

### Inspect the next unchecked ticket

Run this command repeatedly. Each invocation processes one ticket and outputs its spec context.

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js [--tickets=<Tickets.json>]
```

**Output format:**

```
Total 133 tickets to inspect. Inspecting ticket 4/133.
# P3-2: Ticket Title [remanded]
...
```

The first line is the progress prefix. The rest is the output of `show-ticket-context.js --for-spec --no-implementation-order` for the inspected ticket.

### Auto-cleanup when finished

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js --with-clean-trash
```

When all entries are exhausted (`All tickets inspected.`), the `--with-clean-trash` flag removes both `_tmp-omissions-*.json` and `_tmp-check-target-tickets-cmds-*.json`.

### Record an omission

When inspection reveals a contract gap, record it as an omission ticket:

```bash
echo '{"title":"...","background":"...","scope":["..."],"testUnit":["..."],"acceptanceCriteria":["..."],"invariants":"..."}' | \
  node .claude/scripts/tickets/add-omission-ticket.js [--tmp-omissions=<path>] [--tickets=<Tickets.json>]
```

The ticket JSON must include all required fields (title, background, scope, testUnit, acceptanceCriteria, invariants). The script validates these fields before appending.

## Pipeline Steps (Reference)

### Integrated Step 1 — Automated inspection loop

The orchestrator script `get-next-check-target-ticket.js` performs the following automatically:

1. **Pre-condition check**: If `_tmp-omissions-*.json` does not exist, runs `create-tmp-omissions.js` to collect STUB markers and non-reviewed tickets.
2. **Command list preparation**: If `_tmp-check-target-tickets-cmds-*.json` does not exist, runs `create-check-target-tickets-cmds.js` to build the list of reviewed tickets.
3. **Process next ticket**: Reads the cmds file, finds the first entry with `done: false`, marks it `done: true`, and sets the ticket status to `remanded` in Tickets.json.
4. **Display context**: Executes `show-ticket-context.js --ticket-key=KEY --for-spec --no-implementation-order` and prefixes the output with the progress message.
5. **AI inspection**: The operator (AI or human) reads the ticket context and evaluates:
   - **A**: Are all contracts accurately translated into test code?
   - **B**: Are all contract violations detectable by test assertions?
   - **C**: Are tests precise and unambiguous?

When issues are found, the operator uses `add-omission-ticket.js` to record them in `_tmp-omissions-*.json`.

### Post-processing (Step 4 onward)

After all tickets have been inspected, the accumulated omission tickets in `_tmp-omissions-*.json` can be:

- **Step 4**: Grouped by phase for structured organization
- **Step 5**: Assigned sequential ticket IDs
- **Step 6**: Merged into the main Tickets.json
- **Step 7**: Temporary files cleaned up

## Error Handling

- If `create-tmp-omissions.js` or `create-check-target-tickets-cmds.js` fails, the script exits immediately with the child process error message.
- If `Tickets.json` is not found, exits with a file-not-found error.
- If all cmds entries are already `done: true`, prints `All tickets inspected.` and exits 0.
- If `--tickets=<path>` points to a non-existent file, exits with error.

## Dependencies

| Script | Ticket | Purpose |
|--------|--------|---------|
| `create-tmp-omissions.js` | PX-97 | Collect STUB + non-reviewed tickets |
| `create-check-target-tickets-cmds.js` | PX-98 | Build reviewed-ticket command list |
| `add-omission-ticket.js` | PX-100 | Append validated omission tickets |
| `get-next-check-target-ticket.js` | PX-101 | Orchestrate the inspection loop |
