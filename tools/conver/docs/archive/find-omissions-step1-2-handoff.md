# find-omissions Pipeline — Implementation Handoff

> Created: 2026-07-30
> Status: All 4 pipeline scripts implemented and reviewed (PX-97, PX-98, PX-100, PX-101)

## Architecture Change

The find-omissions pipeline has been redesigned from a 6-step process to a **unified single-step process** (Integrated Step 1) with optional post-processing.

### Old Design (6 steps)

```
Step 1: create-tmp-omissions.js       ← manual
Step 2: create-check-target-tickets-cmds.js ← manual
Step 3: AI inspection (per-ticket)    ← manual loop
Step 4: Group by phase                ← manual
Step 5: Reassign IDs                  ← manual
Step 6: Merge into Tickets.json       ← manual
```

### New Design (Single Integrated Step 1 + Post)

```
Integrated Step 1: get-next-check-target-ticket.js  ← one command
  ├─ Auto-runs create-tmp-omissions.js if needed
  ├─ Auto-runs create-check-target-tickets-cmds.js if needed
  ├─ Pops next unchecked ticket, marks done, displays context
  └─ Repeat per invocation

Post-processing (manual, separate tickets):
  ├─ Step 4: Group omission tickets by phase
  ├─ Step 5: Reassign ticket IDs
  ├─ Step 6: Merge into Tickets.json
  └─ Step 7: Clean up _tmp-* files
```

## Scripts

| Script | Path | Status | Ticket |
|--------|------|--------|--------|
| `create-tmp-omissions.js` | `.claude/scripts/tickets/create-tmp-omissions.js` | ✅ reviewed | PX-97 |
| `create-check-target-tickets-cmds.js` | `.claude/scripts/tickets/create-check-target-tickets-cmds.js` | ✅ reviewed | PX-98 |
| `add-omission-ticket.js` | `.claude/scripts/tickets/add-omission-ticket.js` | ✅ done | PX-100 |
| `get-next-check-target-ticket.js` | `.claude/scripts/tickets/get-next-check-target-ticket.js` | ✅ done | PX-101 |

## Ticket Details

### PX-97: `create-tmp-omissions.js`

Collects STUB markers and non-reviewed tickets into `_tmp-omissions-<timestamp>.json`.

**Tests**: 47 tests (contracts C001-C005)
**Output**: Phased JSON matching Tickets.json schema with `fromStub` and `stubs` fields.

### PX-98: `create-check-target-tickets-cmds.js`

Collects all reviewed ticket keys and generates a command list as `_tmp-check-target-tickets-cmds-<timestamp>.json`.

**Tests**: 30 tests (contracts C001-C003) — PX-99 added 11 more (41 total)
**Output**: `[{done: false, cmd: "node ...show-ticket-context.js --ticket-key=KEY --for-spec --no-implementation-order"}]`

### PX-99: Fix existing scripts

Minor fixes applied during pipeline implementation:
- `create-check-target-tickets-cmds.js`: Added `--no-implementation-order` flag to command template
- `list-phases-and-tickets.js`: Added `remanded: '[!]'` status symbol

### PX-100: `add-omission-ticket.js`

Appends a validated omission ticket to `_tmp-omissions-*.json` via stdin pipe. Validates 6 required fields (title, background, scope, testUnit, acceptanceCriteria, invariants) before writing. Creates the tmp file from Tickets.json template if it does not exist.

**Tests**: 34 tests (C001-C002 contracts + edge cases)
**Usage**: `echo '{...ticket}' | node add-omission-ticket.js [--tmp-omissions=<path>] [--tickets=<Tickets.json>]`

### PX-101: `get-next-check-target-ticket.js`

Unified orchestrator that ties the pipeline together. Auto-creates missing tmp files, pops the next unchecked entry, executes show-ticket-context.js, and outputs with a progress prefix.

**Tests**: 24 tests (pure functions: popNextEntry, setTicketRemanded, buildPrefixMessage)
**Usage**: `node get-next-check-target-ticket.js [--tickets=<path>] [--with-clean-trash]`

Also includes:
- `.claude/commands/find-omissions.md` — slash command documentation
- This handoff document (updated)

## Post-processing Remaining (not yet implemented)

| Step | Description | Status |
|------|-------------|--------|
| 4 | Group omission tickets by phase in `_tmp-omissions-*.json` | 🔴 Not implemented |
| 5 | Reassign ticket IDs sequentially | 🔴 Not implemented |
| 6 | Merge grouped tickets into Tickets.json | 🔴 Not implemented |
| 7 | Clean up `_tmp-*` temporary files | 🔴 Built into PX-101 (`--with-clean-trash`) |

## Usage

### Inspect the next ticket

```bash
# Run from tools/conver/ directory
node .claude/scripts/tickets/get-next-check-target-ticket.js
```

### Record an omission

```bash
echo '{"title":"Found gap in X","background":"...","scope":["..."],"testUnit":["..."],"acceptanceCriteria":["..."],"invariants":"..."}' | \
  node .claude/scripts/tickets/add-omission-ticket.js
```

### Run all pipeline tests

```bash
node .claude/scripts/tickets/tests/create-tmp-omissions.test.js
node .claude/scripts/tickets/tests/create-check-target-tickets-cmds.test.js
node .claude/scripts/tickets/tests/get-next-check-target-ticket.test.js
node .claude/scripts/tickets/tests/add-omission-ticket.test.js
```

## Tickets.json Stats (2026-07-30)

- Total tickets: 135 → 139 (PX-97, PX-98, PX-99, PX-100, PX-101 added)
- Reviewed: 133
- Non-reviewed (todo/made/planned/done): 6 (PX-97..PX-101 in various states)
