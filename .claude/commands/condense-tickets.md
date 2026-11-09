---
description: Condense the current package's Tickets.json to the deterministic contiguous partition minimum.
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /condense-tickets

Role: condense `./Tickets.json` to the version-3 contiguous partition minimum; no re-split.
Scope: one package = current directory. Workspace-wide → `/condense-workspace`.

Invariants:
- argument: none. Non-empty `$ARGUMENTS` → refuse before any write. `--plan` / `--apply` / `--gate` / `--workspace` are script flags, never command arguments.
- target: current directory; requires `./Tickets.json`.
- prose: preserved, not authored. Absorbed ticket → `### From <key>: <title>` under `background` / `notes` / `invariants` / `scope`.
- identity: survivor keeps key and id; absorbed keys → `condensedFrom`; no renumbering.
- distribution: merged from split-time per-ticket records, never re-derived from a newer view; only absorbed keys remapped.
- boundary: only `budget`-proven or proven `ownership-boundary` survives in a v3 phase; legacy `cohesion` / `tdd-order` replaced by the partition.
- derived fields: never copied without remap; package gates prove the result.
- judgment: none. Failing gate → restore archive. Pre-existing structural defect → fix separately; never relax a gate.

**Path anchor (mandatory — resolve once).**

Run this once at the start of the command:

```bash
printf '%s/.claude\n' "$(git rev-parse --show-toplevel)"
```

Record the printed absolute path as `CLAUDE_DIR`. In every later bash block, use that literal path: substitute it into `node "$CLAUDE_DIR/scripts/..."`, or assign `CLAUDE_DIR="<the printed path>"` at the top of the block. Do not run `git rev-parse` again, and do not assume the current directory is the repository root.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Arguments

In:
- none. The package is the current directory; the mode is fixed by this document.
- a non-empty argument list is refused, because the command derives both its target and its mode internally.

Preflight (runs before any write):

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

1. Plan read-only; visible before any write:
   ```bash
   node "$CLAUDE_DIR/scripts/tickets/condense-tickets.js" --plan --tickets=Tickets.json
   ```
2. Apply the same plan: archive → merge contiguous groups → remap absorbed keys → recompute contracts / formulas / prerequisites / related ids → atomic write → coverage, closure, chain, implementation-order gates. Failing gate restores the archive; exit 1.
   ```bash
   node "$CLAUDE_DIR/scripts/tickets/condense-tickets.js" --apply --tickets=Tickets.json
   ```
3. Package in a workspacify workspace → regenerate the workspace order once:
   ```bash
   WORKSPACE_ROOT="$(node -e "const p=require('$CLAUDE_DIR/scripts/lib/package-artifacts').findAllocateManifest(process.argv[1]);process.stdout.write(p?require('path').dirname(p):'')" "$PWD")"
   if [ -n "$WORKSPACE_ROOT" ]; then
     node "$CLAUDE_DIR/scripts/sequences-slice/verify-implementation-order.mjs" --workspace="$WORKSPACE_ROOT" --write
   fi
   ```
4. Re-run → `NO_CHANGE`; zero bytes written.

## Done

- plan printed before write; apply passes or the archive is restored.
- second run `NO_CHANGE`.
- no command argument consumed; no gate relaxed.

**Amendment route (never stop):** every amendment to SPEC, RFC.md, RFC-GRAPH.json, RFC-Dirs-Tree.json or
Tickets.json goes through `design-amendment.js`; preserve `## Design Amendments` on every re-render.
absent artifact = skip, exit 0, never a block.
