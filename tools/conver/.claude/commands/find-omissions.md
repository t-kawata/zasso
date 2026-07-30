---
description: Inspect reviewed tickets for contract-to-test gaps and record omissions.
---

# /find-omissions

Inspect all reviewed tickets for gaps between contracts and their test implementations, and record findings as omission tickets.

## Pipeline Overview

The find-omissions pipeline automates the inspection of every reviewed ticket to check whether its contracts are fully and accurately translated into test code. Each omission found is recorded as a rigorously defined ticket — complete enough for the subsequent implementation loop (make → plan → start → review → resolve) to resolve it without divergence.

```
Step 1 (automated):
  ├─ Create _tmp-omissions-*.json (STUB + non-reviewed collection) ── if missing
  ├─ Create _tmp-check-target-tickets-cmds-*.json (reviewed command list) ── if missing
  └─ For each unchecked ticket:
       ├─ Pop next entry, mark done:true, set status → remanded in Tickets.json
       ├─ Execute show-ticket-context.js --for-spec --no-implementation-order
       └─ Prefix stdout with progress: Total N tickets to inspect. Inspecting ticket M/N.

Post-processing:
  └─ Run `/merge-omissions` to merge all omission tickets into Tickets.json
       (validates foundOmissions, groups by phase, assigns sequential IDs)
```

## Usage

### Inspect the next unchecked ticket

Run this command repeatedly until it prints "All tickets inspected.". Each invocation processes one ticket and outputs its spec context.

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js
```

**Output example:**

```
Total 133 tickets to inspect. Inspecting ticket 4/133.

# Target ticket is P0-4: Error Design — SipError, SipErrorKind, and M20 RuntimeCommand Error Mapping
...
```

The first line is the progress prefix. The rest is the output of `show-ticket-context.js --for-spec --no-implementation-order` for the inspected ticket. This includes design-time, planning-time, and actual implementation information, but it may be outdated. Do not take the output at face value — always analyze the current source code to determine the ground truth.

### Record an omission

When inspection reveals a contract gap, record it as an omission ticket:

```bash
echo '{"title":"...","background":"...","scope":["..."],"testUnit":["..."],"acceptanceCriteria":["..."],"invariants":"..."}' | \
  node .claude/scripts/tickets/add-omission-ticket.js [--tmp-omissions=<path>] [--tickets=<Tickets.json>]
```

The ticket JSON must include all required fields (title, background, scope, testUnit, acceptanceCriteria, invariants). The script validates these fields before appending.

### Auto-cleanup when finished

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js --with-clean-trash
```

When all entries are exhausted (`All tickets inspected.`), both tmp files are kept — the cmds file preserves the inspection history, and the omissions file holds any recorded omission tickets. Use `--with-clean-trash` to remove both tmp files when you are done.
