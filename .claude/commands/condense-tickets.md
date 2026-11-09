---
description: Condense the Tickets.json in the current package to the deterministic contiguous partition minimum.
disable-model-invocation: true
---

# /condense-tickets

Role: reduce the `Tickets.json` in the current package to the minimum contiguous partition of its implementation-ordered tickets under the version-3 work budget, without re-running `/split-to-tickets`.

This command takes no argument. The package is the current directory; the mode is fixed by this document. The script's `--plan`, `--apply`, `--gate` and `--workspace` flags are internal implementation details, not user-facing command arguments.

## Path anchor

```bash
printf '%s/.claude\n' "$(git rev-parse --show-toplevel)"
```

Use the printed absolute path as `CLAUDE_DIR` in every later block.

## Preflight

```bash
if [ -n "$ARGUMENTS" ]; then
  echo "[ERROR] UNEXPECTED_ARGUMENT: /condense-tickets takes no argument"
  echo "Cause: the command reads ./Tickets.json and fixes its own mode"
  echo "Action: run /condense-tickets from the package directory that holds Tickets.json"
  exit 1
fi

if [ ! -f "Tickets.json" ]; then
  echo "[ERROR] MISSING_TICKETS: ./Tickets.json not found"
  echo "Cause: /condense-tickets condenses the package in the current directory"
  echo "Action: run it from a package directory that holds Tickets.json"
  exit 1
fi
```

## Procedure

1. Print the read-only plan so the merge is visible before any write:
   ```bash
   node "$CLAUDE_DIR/scripts/tickets/condense-tickets.js" --plan --tickets=Tickets.json
   ```
2. Apply the same plan. The script archives `Tickets.pre-condense-<stamp>.json`, merges contiguous groups, remaps absorbed ticket keys, recomputes contracts, formulas, prerequisites and related ids, writes atomically, and runs coverage, closure, chain and implementation-order gates. A failing gate restores the archive and exits 1.
   ```bash
   node "$CLAUDE_DIR/scripts/tickets/condense-tickets.js" --apply --tickets=Tickets.json
   ```
3. When the package belongs to a workspacify workspace, regenerate the workspace implementation order once:
   ```bash
   WORKSPACE_ROOT="$(node -e "const p=require('$CLAUDE_DIR/scripts/lib/package-artifacts').findAllocateManifest(process.argv[1]);process.stdout.write(p?require('path').dirname(p):'')" "$PWD")"
   if [ -n "$WORKSPACE_ROOT" ]; then
     node "$CLAUDE_DIR/scripts/sequences-slice/verify-implementation-order.mjs" --workspace="$WORKSPACE_ROOT" --write
   fi
   ```
4. A second run prints `NO_CHANGE` and writes no bytes.

## Invariants

- The command accepts no argument. A non-empty `$ARGUMENTS` is refused before any write; the script's flags are never exposed as command arguments.
- Prose is preserved, not authored: each absorbed ticket's `background`, `notes`, `invariants` and `scope` remain under `### From <key>: <title>`.
- The survivor keeps its key and id; absorbed keys are recorded in `condensedFrom`. No ticket is renumbered.
- Distribution records are merged from the split-time per-ticket records, not re-derived from a possibly newer sequence view. Only absorbed ticket keys are remapped.
- Only a `budget`-proven boundary or a proven `ownership-boundary` may remain in a version-3 phase. Legacy `cohesion`/`tdd-order` reasons are replaced by the partition.
- No derived field is copied from an absorbed ticket without remapping; the package gates prove the result.
- The command performs no AI judgment. A failing gate restores the archive. A pre-existing structural defect outside condensation must be fixed separately, never by relaxing a gate.
