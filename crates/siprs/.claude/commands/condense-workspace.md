---
description: Condense every package a workspace manifest declares, including the workspace-root package whose path is ".".
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /condense-workspace

Role: condense every manifest package in one mechanical run; root package `path: "."` included.
Scope: one workspacify workspace = current directory. Package-only → `/condense-tickets`.

Invariants:
- policy: default `merge-status=todo`; only an all-todo contiguous group merges; `done`, `reviewed`, `R<n>`, `made`, `planned`, `remanded` and unknown statuses are barriers; non-todo authored fields stay byte-identical.
- argument: none. Non-empty `$ARGUMENTS` → refuse before any write. `--plan` / `--apply` / `--gate` / `--workspace` / `--merge-status` are script flags, never command arguments.
- targets: `workspace.packages[].path` is authoritative; `path: "."` = root package; rows deduped, manifest order.
- fallback: filesystem walk only when `WORKSPACIFY-TREE-MANIFEST.json` is absent.
- skip: no `Tickets.json` → `skipped:unsplit`; absent directory → `skipped:missing-directory`; never write.
- unlisted: `Tickets.json` outside the manifest → report, never condense. Root aggregate without graph + Dirs-Tree is not unlisted.
- failure: one package failure restores its archive, does not abort remaining targets, exit 1 after every target is attempted.
- order: workspace implementation order written once after the loop, only when ≥1 package changed.
- identity: every non-excluded package ends dense `1..N`; history keeps its old keys with a generation and `identity.aliases` resolves them. A package that was already gapped is repaired by the same renumber path, so the workspace is dense after one mechanical run. The PX phase stays excluded.
- judgment: none. Failing gate → restore that package's archive. Pre-existing structural defect → fix separately; never relax a gate.

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
- none. The workspace is the current directory; the mode is fixed by this document.
- a non-empty argument list is refused, because the manifest determines every target and the command fixes its own mode.

Preflight (runs before any write):

```bash
if [ -n "$ARGUMENTS" ]; then
  echo "[ERROR] UNEXPECTED_ARGUMENT: /condense-workspace takes no argument"
  echo "Cause: the command reads ./WORKSPACIFY-TREE-MANIFEST.json and fixes its own mode"
  echo "Action: run /condense-workspace from the workspace root"
  exit 1
fi

if [ ! -f "WORKSPACIFY-TREE-MANIFEST.json" ]; then
  echo "[ERROR] MISSING_TREE_MANIFEST: ./WORKSPACIFY-TREE-MANIFEST.json not found"
  echo "Cause: /condense-workspace condenses the packages this manifest declares"
  echo "Action: run it from a workspacify workspace root"
  exit 1
fi
```

## Procedure

1. Plan read-only for every manifest package; visible before any write:
   ```bash
   node "$CLAUDE_DIR/scripts/tickets/condense-tickets.js" --plan --workspace="$PWD"
   ```
2. Apply the same plan to every package: per-package archive → merge → phase-floor merge → remap → recompute → atomic write → gates. The phase-floor merge is the same pass `/condense-tickets` runs; it repairs an existing package whose split left one-ticket phases, in evolve mode too. Failing package restores its archive; remaining packages still run; every failure reported; exit 1. After the loop, workspace implementation order regenerated once when ≥1 package changed.
   ```bash
   node "$CLAUDE_DIR/scripts/tickets/condense-tickets.js" --apply --workspace="$PWD" --merge-status=todo
   ```
3. Re-run → `NO_CHANGE` for every package; zero bytes written.

## Report

```text
workspace <root>: source=manifest targets=N skipped=S unlisted=U
condense <pkg>: before -> after [NO_CHANGE]
FAILED <pkg> <CODE>: <message>
skipped <pkg>: unsplit|missing-directory
unlisted <pkg>
workspace summary: applied=A noChange=C failed=F skipped=S unlisted=U
```

- `skipped:unsplit` — manifest package without `Tickets.json`; never created.
- `skipped:missing-directory` — manifest row whose directory is absent.
- `unlisted` — `Tickets.json` below the root that no manifest row names (e.g. working copy); reported, never condensed.

## Done

- discovery printed with source, targets, skipped, unlisted.
- every target attempted; failures listed; exit 1 iff any failure.
- crystal root `10 → 9`; second run all `NO_CHANGE`.
- no command argument consumed; no gate relaxed.

**Amendment route (never stop):** every amendment to SPEC, RFC.md, RFC-GRAPH.json, RFC-Dirs-Tree.json or
Tickets.json goes through `design-amendment.js`; preserve `## Design Amendments` on every re-render.
absent artifact = skip, exit 0, never a block.
