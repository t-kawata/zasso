# Implementation Summary: PX-106 & PX-107

> Generated: 2026-07-30
> Session: phasify-omissions.js + sentinel idempotency — complete make/plan/start/review pipeline

---

## Overview

Two tickets implemented to create an omission re-implementation pipeline:

| Ticket | Title | Status |
|--------|-------|--------|
| PX-106 | Inspection Sentinel Idempotency | `reviewed` |
| PX-107 | phasify-omissions.js — graph-based omission re-phasing | `reviewed` |

Both committed to `tools/conver` master under commit chain `9ffc7e8..fbe2fa4`.

---

## PX-106: Inspection Sentinel Idempotency

### Problem

`create-tmp-omissions.js` and `add-omission-ticket.js` unconditionally prepend inspection warning prefixes (`REJECTION_WARNING` and `ABC_INSPECTION_PREFIX`) to ticket backgrounds. After N find-omissions cycles, backgrounds accumulate N copies of each prefix.

### Solution

Introduced `[::INSPECTION_FLAGGED::]` sentinel string for idempotent prefix handling.

### Files Modified

| File | Changes |
|------|---------|
| `.claude/scripts/tickets/add-omission-ticket.js` | Added `INSPECTION_SENTINEL`, `countInspectionSentinels()`, `repairDuplicateSentinels()`. Modified `appendTicket()` with startsWith guard. Exported sentinel + helpers. Prepended sentinel to `ABC_INSPECTION_PREFIX`. |
| `.claude/scripts/tickets/create-tmp-omissions.js` | Added `require` of sentinel from `add-omission-ticket.js` with fallback. Prepended sentinel to `REJECTION_WARNING`. Modified `enrichTickets()` with startsWith guard. |
| `.claude/tests/tickets/scripts.test.js` | 24 new tests for sentinel functions. `assertOk()` helper added. `@verifies C106`. |

### Ancillary Fixes

| File | Change |
|------|--------|
| `validate-tickets.js` (conver + siprs) | Added `"remanded"` to `ALLOWED` status enum |
| `tickets-schema.json` (conver + siprs) | Added `"made"`, `"planned"`, `"remanded"` to status enum |

### Verification

- 149 tests passed (24 new), 0 failed
- @verifies C106 confirmed in test file
- 0 AMBIGUOUS markers remaining

---

## PX-107: phasify-omissions.js

### Problem

OMISSIONS-*.json files retain the original Tickets.json phase structure which was designed for initial implementation, not for re-implementation of a subset of nodes. Re-implementation tickets must be re-ordered based on actual graph dependencies.

### Solution

Created `phasify-omissions.js` (~830 lines) that applies the identical 5-phase mathematical pipeline from `phasify-graph-and-dirs-files-tree.js` to omission ticket sets.

### Architecture

```
Input: OMISSIONS-*.json + RFC-ROOT-GRAPH.json + Tickets.json
          │
          ▼
  ① extractOmissionSubgraph() — O_NODES from tickets, filter edges
  ② dedupTickets() — PX clones → actionTickets, originals → referenceTickets
  ③ autoMinSize() — adaptive min nodes per phase
  ④ Phase 1-4: tarjanSCC → kahnTopologicalSort → mergePhases
     → enforceHardConstraints → consolidatePhases → reassignPhaseIds
  ⑤ reassignPhaseIdsWithOffset() — offset = max(Tickets.json phase id) + 1
  ⑥ assignTicketsToPhases() — earliest-phase assignment
  ⑦ consolidatePhasesByTicketCount() — min 3 tickets/phase (Step 5-3)
  ⑧ repairInspectionPrefixes() — defense-in-depth sentinel repair
  ⑨ validatePhasedOmissions() — coverage + hard constraint check
  ⑩ buildOutput() — filter empty phases, normalize IDs
  ⑪ OMISSIONS-phasified-{ts}.json
```

### Pure Functions (all exported, all tested)

| Function | Purpose | Signature |
|----------|---------|-----------|
| `parseArguments` | CLI args → CliOptions | `(argv) → CliOptions` |
| `findLatestOmissions` | Auto-discover OMISSIONS-*.json in CWD | `() → string\|null` |
| `extractOmissionSubgraph` | Filter GRAPH edges to O_NODES | `(omissions, graph) → {nodes, edges, omissionNodeIds}` |
| `dedupTickets` | Split by originalTicketKey | `(allTickets) → {actionTickets, referenceTickets, actionTicketKeys}` |
| `autoMinSize` | `max(3, min(10, ceil(n/7)))` | `(totalNodes) → number` |
| `computePhaseIdOffset` | `max(id) + 1` | `(ticketsPath) → number` |
| `reassignPhaseIdsWithOffset` | Normalize + offset | `(phases, offset) → phases` |
| `assignTicketsToPhases` | Earliest-phase node→ticket mapping | `(phases, tickets, nodeOrder) → phases` |
| `consolidatePhasesByTicketCount` | Merge phases with <3 tickets (hard-edge safe) | `(phases, hardEdges) → phases` |
| `repairInspectionPrefixes` | Sentinel repair (reuses PX-106) | `(actionTickets) → void` |
| `validatePhasedOmissions` | Coverage + hard constraint + dedup | `(data, nodes, edges, omissionNodeIds) → {valid, checks}` |
| `buildOutput` | Filter empty phases, build JSON | `(phases, refs, metadata) → object` |
| `runPhasifyOmissions` | Full orchestrator | `(opts) → void` |

### CLI Interface

```bash
node .claude/scripts/rfc-graph/phasify-omissions.js \
  --graph=<PATH>                    # Required
  [--omissions=<PATH>]              # Optional: auto-discover OMISSIONS-*.json in CWD
  [--tickets=<PATH>]                # Optional: default Tickets.json in CWD
  [--min-nodes=N] [--output=PATH]   # Optional overrides
  [--dry-run] [--verbose]           # Flags
```

### Integration Test (real OMISSIONS data)

```
Input:  OMISSIONS-20260730133520.json (siprs)
        RFC-ROOT-GRAPH.json (67 nodes, 68 edges)
        Tickets.json (phases P0-P5)

Subgraph: 53 omission nodes, 46 edges (21 hard)
          5 cross-boundary depends_on (from omission)
          5 cross-boundary depends_on (to omission)

Output:
  ✅ PASS — 2 implementation phases, 0 hard constraint violations
  P6: 3 tickets (P0-3, P0-4, P0-5), 15 nodes
  P7: 2 tickets (P1-2, P5-2), 8 nodes
  Phase IDs contiguous from offset 6
  11 reference tickets preserved
  Filename: OMISSIONS-phasified-{original-ts}.json
```

### Design Decisions

1. **Subgraph extraction** filters edges to both-ends-in-O_NODES. Cross-boundary edges are logged but excluded from ordering constraints (dependencies are already satisfied by existing implementation).

2. **Earliest-phase ticket assignment** is the safe direction: dependencies flow forward.

3. **Ticket-count consolidation** (≥3 tickets/phase) mirrors `split-to-tickets.md` Step 5-3. Hard constraint guard prevents illegal merges.

4. **Phase ID offset** computed dynamically at runtime: `max(Tickets.json.phases[*].id) + 1`.

5. **Filename** derived from input OMISSIONS timestamp: `OMISSIONS-{ts}.json` → `OMISSIONS-phasified-{ts}.json`.

### Files Created/Modified

| File | Action |
|------|--------|
| `.claude/scripts/rfc-graph/phasify-omissions.js` | **NEW** (~830 lines) |
| `.claude/scripts/rfc-graph/phasify-helpers.js` | Unchanged (require only) |
| `.claude/scripts/rfc-graph/boundify-helpers.js` | Unchanged (require only) |
| `.claude/tests/tickets/scripts.test.js` | 27 new PX-107 tests, `@verifies C107` |
| `specs/PX-107.md` | Final spec snapshot |

---

## Commit History

```
fbe2fa4 fix(PX-107): re-normalize phase IDs contiguous from offset
e64d870 feat(PX-107): consolidate phases by ticket count (min 3)
99ece92 fix(PX-107): filter empty phases, update ticket phaseId
68bc8db feat(PX-107): optional --omissions/--tickets auto-discovery
47eb40a fix(PX-107): derive phasified filename from input
9ffc7e8 feat(PX-106,PX-107): initial implementation
```

---

## Prerequisites Validated

- `validate-tickets.js`: `ALLOWED` includes `"remanded"`
- `tickets-schema.json`: status enum includes `"made"`, `"planned"`, `"remanded"`
- PX phase exists in Tickets.json (id=-1)

## Next Steps

Run phasify-omissions.js on siprs OMISSIONS data:

```bash
cd ~/shyme/zasso/crates/siprs
node /path/to/tools/conver/.claude/scripts/rfc-graph/phasify-omissions.js \
  --graph=RFC-ROOT-GRAPH.json
```

Output: `OMISSIONS-phasified-20260730133520.json` — ready for merge into Tickets.json.
