---
description: Merge _tmp-omissions-*.json omission tickets into Tickets.json.
---

# /merge-omissions

Merge omission tickets recorded during `/find-omissions` inspection into the main Tickets.json.

## Usage

```bash
node .claude/scripts/tickets/merge-omissions-to-tickets.js [--tickets=<Tickets.json>] [--omissions=<_tmp-omissions.json>]
```

If `--omissions` is not specified, the script auto-detects the latest `_tmp-omissions-*.json` in the current directory.

## What It Does

1. **Validates** — Checks that all tickets in the omissions file have valid `foundOmissions` (if present). Backward compatible with omissions files that lack `foundOmissions`.
2. **Groups** — Sorts omission tickets by their target `phaseId` (e.g., tickets targeting P0 go to phase 0).
3. **IDs** — Assigns sequential ticket IDs starting from `max(existing phase ID) + 1`, avoiding conflicts.
4. **Merges** — Appends the renumbered tickets into the corresponding phases in Tickets.json. Creates phases that do not yet exist.
5. **Writes** — Saves the updated Tickets.json.

## Invariants

- Existing Tickets.json tickets are never overwritten — only appended.
- The `_tmp-omissions-*.json` file is not modified by this script.
- Omission tickets with empty `foundOmissions` array are still merged (backward compat).

## Error Handling

- If Tickets.json is not found, exits 1 with error.
- If `_tmp-omissions-*.json` is not found (and not specified), exits 1.
- If validation fails (invalid `foundOmissions`), exits 1 without modifying Tickets.json.
