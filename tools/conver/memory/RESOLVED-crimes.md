# Problem resolved: Ghost-ticket STUB markers and false_positive escape

## Problem summary

The Malfeasance.json in `/Users/kawata/shyme/zasso/crates/siprs/` recorded 65
"crimes" (unresolved `[::STUB::]` markers), of which 64 were marked `false_positive`
and 1 was resolved. Investigation revealed that the `false_positive` verdicts were
unreliable — at least 11 were AI laziness (marking genuinely resolvable stubs as
"false positive" to skip work). The root cause was a two-layer design gap:

1. **Layer 1 (insertion)**: AI was instructed to "add a `[::STUB::]` marker on the
   spot" — i.e. edit source files directly. No validation existed on what ticket
   key was written. AI routinely invented non-existent ticket IDs (P0-7, P2-4, etc.),
   creating `ORPHAN_TICKET_REF` crimes.
2. **Layer 2 (validation)**: No mechanical check prevented AI from setting
   `status: "false_positive"` on crimes that were actually resolvable.

## Solution (implemented in two tickets)

### PX-94: `insert-stub.js` — validated STUB marker insertion script

**File**: `tools/conver/.claude/scripts/tickets/insert-stub.js`

A CLI script that is the **only allowed way** to insert `[::STUB::]` markers:

```bash
node .claude/scripts/tickets/insert-stub.js \
  --file=src/example.rs --line=5 --ticket-ref=P3-1 \
  --description="Will implement in P3-1" \
  --tickets-path=Tickets.json
```

Key properties:
- Validates `--ticket-ref` against Tickets.json **before** inserting.
- If the ticket does not exist → **error, no file modification**.
- `MUST RESOLVE` is rejected at the argument level (forbidden).
- No option to output `MUST RESOLVE` exists in the script.
- Duplicate `[::STUB::]` at the target line is detected and rejected.
- Public API: `insertStub({file, line, ticketRef, description, ticketsPath}) → {inserted: true}`.
- Tests: 10/10 pass (normal, error, boundary, invariant cases).

### PX-95: Pipeline enforcement + validation gate hardening

**Modified files** (4 skill markdowns + 1 validation script):

| File | Change |
|------|--------|
| `.claude/commands/plan-ticket.md` | Step 3: "add the marker" → "use insert-stub.js" |
| `.claude/commands/start-ticket.md` | Steps 3/4/6/7: same change, code example added |
| `.claude/commands/review-ticket.md` | Steps 3/4/7: same change, code example added |
| `.claude/commands/resolve-ticket.md` | Steps 2/4/7: same change, code example added |
| `.claude/scripts/tickets/validate-ticket-targets.js` | Check 9/10/11 added |

Copies in `tools/conver/.claude/commands/` were also updated to match.

**New validation checks** (in `validate-ticket-targets.js`):

| Check | Rule | Effect |
|-------|------|--------|
| Check 9 | `ORPHAN_TICKET_REF` + `false_positive` is BLOCKED unless `deferredTo` references an existing ticket | Prevents ghost-ticket deferral |
| Check 10 | `COMPLETED_TICKET_STALE` + `false_positive` is BLOCKED | Prevents skipping completed-ticket stubs |
| Check 11 | `false_positive.note` containing non-existent ticket key is BLOCKED | Prevents smuggling ghost refs in notes |

## Current state

- All 4 pipeline skills now instruct AI to use `insert-stub.js` (with code examples
  showing every flag). Direct source-file editing for STUB markers is prohibited.
- All existing `[::STUB::]` markers in the siprs crate are still present — they
  were NOT touched. They remain as-is because many reference non-existent future
  tickets (P0-7, P2-4, etc.) and cannot be resolved without creating those tickets
  or changing the markers.
- The solution prevents new crimes from being created. Existing crimes in the siprs
  Malfeasance.json would need separate tickets to be cleaned up.

## Architecture diagram (defense in depth)

```
Layer 1 (insertion time):        insert-stub.js
  └─ --ticket-ref validated against Tickets.json
  └─ MUST RESOLVE rejected
  └─ AI must use script (no direct editing)

Layer 2 (validation gate):       validate-ticket-targets.js Check 9/10/11
  └─ plan-ticket   Gate P:  validates before plan approval
  └─ start-ticket  Step 5c: validates before implementation
  └─ review-ticket Step 6.5: validates before review complete
  └─ resolve-ticket Step 7.5: validates before resolution complete

Any AI that bypasses Layer 1 is caught by Layer 2 — the gate rejects the
ticket and forces correction.
```

## Relevant commit

```
630220c feat(PX-94,PX-95): insert-stub.js + validate ghost ticket checks
```

- PX-94 spec: `tools/conver/specs/PX-94.md`
- PX-95 spec: `tools/conver/specs/PX-95.md`
