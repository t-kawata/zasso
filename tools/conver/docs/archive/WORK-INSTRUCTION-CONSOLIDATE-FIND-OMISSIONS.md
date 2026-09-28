# Work Instruction: Complete the /consolidate-stubs → /find-omissions Seamless Pipeline

> **Handoff document** — written 2026-08-05. This file gives a fresh agent the full
> background, the completed work, and the one remaining agreed change so it can
> continue without re-deriving the session context.

---

## 1. Purpose

`conver.js` runs a two-layer development pipeline. Inside the inner loop, two
slash-commands must connect seamlessly:

- **`/consolidate-stubs`** — re-organizes existing `[::STUB::]` markers into
  ticket-sized units by normalizing resolve keys, deduping, and emitting a grouped
  manifest (`./manifests/CONSOLIDATED-MANIFEST-<ts>.json`). It never creates tickets.
- **`/find-omissions`** — consumes that manifest and creates one **resolving ticket**
  per unit that references a completed key (the re-ticketization handoff).

The remaining work is to **make `/consolidate-stubs` a hard prerequisite of
`/find-omissions`**, enforce it mechanically in the pre-flight, simplify `Step 1`,
and clean up transient artifacts when `/find-omissions` fully succeeds.

This document records: (1) the session background, (2) the five completed tickets,
(3) the current state, (4) the agreed design for the remaining change, and
(5) concrete implementation guidance for the next agent.

---

## 2. Background — why this work exists

### 2.1 The pipeline

The ticket pipeline is `make → plan → start → review` (each a separate ACP
session). Tickets live in `Tickets.json` (PX phase has ids up to 137). Specs live
in `specs/PX-###.md`. All gate scripts live under `.claude/scripts/tickets/`.

### 2.2 The contradiction review

A review of `consolidate-stubs.md` against the actual tooling found **8 doc-vs-tool
contradictions**:

| # | Issue | Fixed by |
|---|-------|----------|
| 1 | Step 5 gate `node validate-stub-format.js` (no arg) always exits 1 | PX-134 |
| 2 | `mergeTrueDuplicates` imported but never called (dedup dead) | PX-135 |
| 3 | doc claims the batch tool "runs the gates" / "already run the gates" | PX-133 |
| 4 | doc claims a "subdirectory passed as the argument" (tool rejects dir args) | PX-133 |
| 5 | derive-key note: uses only the FIRST marker's key (doc silent) | PX-133 |
| 6 | apply ordering in doc ≠ `runBatchUpdate` (rollback is written first) | PX-133 |
| 7 | empty-string `reason`/`plan` silently blanks markers | PX-135 |
| 8 | manifest handoff command concatenated multiple manifests | PX-133 |

A follow-up schema review then found **2 documentation gaps**:

| Gap | Fixed by |
|-----|----------|
| generated manifest `file` paths were absolute while `batch-create-resolving-tickets.js` documents "cwd-relative" | PX-137 |
| `find-omissions.md` handoff note pointed at a legacy-shape example | PX-137 |

Plus a **consolidation request**: Step 5's 3-command gate + fragile
`MANIFEST=$(ls -t ...)` subshell should be one callable script with an
operator-level description | **PX-136** |

---

## 3. Completed work (all tickets reviewed)

| Ticket | Title | Deliverable |
|--------|-------|-------------|
| **PX-133** | consolidate-stubs.md: align documented workflow with the actual batch tooling | doc corrections (#3/#4/#5/#6/#8) + `tests/consolidate-stubs-doc.test.cjs` |
| **PX-134** | validate-stub-format.js: add tree-scan mode so the Step 5 format gate is runnable | `--scan <dir>` mode; gate command fixed (#1) |
| **PX-135** | batch-update-stub.js: wire mergeTrueDuplicates + reject empty reason/plan | dedup in the apply pipeline; rollback `{edited, removed}`; empty-string rejection (#2/#7); `stripUnitTag` `/g` fix |
| **PX-136** | consolidate the Step 5 blocking gate into a single shell script + trim noise | `consolidate-stubs-gate.sh`; Step 5 = one `bash ...gate.sh` line; operator-level description |
| **PX-137** | consolidated manifest: emit cwd-relative file paths + fix the find-omissions grouped-shape example | `runPrinter` relativizes `stubs[].file`; find-omissions handoff shows a real grouped JSON example |

**Commits** (all pushed to `master`, working tree clean except one doc fix — see §4):

```
05c66f4e fix(conver): emit cwd-relative consolidated manifest paths + fix the find-omissions grouped-shape example (PX-137)
a4b75e3b feat(conver): consolidate the consolidate-stubs Step 5 gate into a single shell script (PX-136)
8c28a4b8 feat(conver): resolve consolidate-stubs doc-vs-tool contradictions (PX-133/134/135)
```

**E2E proof** (run in a temp workspace, repo untouched): a 2-marker unit →
`batch-update-stub.js` → relative-path manifest → `consolidate-stubs-gate.sh`
exit 0 → `batch-create-resolving-tickets.js` **real commit** created a new
resolving ticket (`P4-2` → `P4-3`) and rewrote the on-disk marker key.

**Test state**: 93 tests green across `print-manifest`, `batch-update-stub`,
`batch-create`, `consolidate-stubs-gate`, `consolidate-stubs-doc`,
`validate-stub-format`, `update-stub`, `find-all-stubs`.

---

## 4. Current state (before the remaining change)

- **Tickets**: PX-133/134/135/136/137 all `reviewed`.
- **Uncommitted**: one doc fix in `.claude/commands/consolidate-stubs.md` line ~157 —
  the manifest deliverable sentence was qualified:
  > "…which creates one resolving ticket per unit **that references a completed key**
  > (a unit whose resolve key is an active future todo is already tracked and is skipped)."
  This is a Tiny Change (doc-only, single file) and is intentionally left uncommitted.
- **Key files** (all under `tools/conver/`):
  - `.claude/commands/consolidate-stubs.md` — the consolidate workflow
  - `.claude/commands/find-omissions.md` — the find workflow (next edit target)
  - `.claude/scripts/tickets/consolidate-stubs-gate.sh` — Step 5 gate
  - `.claude/scripts/tickets/print-manifest-for-find-omissions.js` — manifest generator
  - `.claude/scripts/tickets/batch-create-resolving-tickets.js` — manifest consumer
  - `.claude/scripts/tickets/batch-update-stub.js` — apply + rollback
  - `Tickets.json`, `specs/PX-###.md`, `tests/*.test.cjs`

---

## 5. Remaining work — make `/consolidate-stubs` mandatory for `/find-omissions`

### 5.1 Agreed design decisions

Three questions were raised and answered (2026-08-05):

**Q1 — Should the manifest-existence check live inside `validate-graph-arg.js`?**
→ **No.** `validate-graph-arg.js` is narrowly "validate the GRAPH argument"
(name + purpose). Embedding a pipeline-prerequisite check would misname it and
couple two distinct pre-flight concerns. Instead: create a **small dedicated,
testable script** `require-consolidated-manifest.js` (exit 0 if
`./manifests/CONSOLIDATED-MANIFEST-*.json` exists, exit 2 with a stderr message
otherwise) and call it alongside `validate-graph-arg.js` in the pre-flight.

**Q2 — Should `./manifests/CONSOLIDATED-MANIFEST-*.json` be deleted when
`/find-omissions` fully succeeds?**
→ **Yes, but only on FULL success** (all find-omissions steps pass), not after
Step 1. The manifest is a transient handoff artifact; once consumed (tickets
created, markers rewritten) it is debris. Accumulation must not be left to the
`ls -t | head -1` selector. Re-running after deletion is safe because each
`/find-omissions` requires a fresh `/consolidate-stubs` (the mandatory model).

**Q3 — Should the consolidate rollback backups also be deleted at that point?**
→ **Yes, same timing.** `ROLLBACK-*.json` exists to undo a *wrong* consolidation.
`/find-omissions` consuming the manifest and creating tickets is the confirmation
of the consolidation; after that, restoring the rollback would desync markers from
the created tickets (they reference post-consolidation keys). Keeping it would be a
misleading "restore" affordance. Delete both `CONSOLIDATED-MANIFEST-*.json` and
`ROLLBACK-*.json` (and `manifests/` itself if empty) on full success, via a
dedicated testable script `clean-consolidation-artifacts.js`.

### 5.2 Concrete change list (for the ticket the next agent creates)

Follow the `make → plan → start → review` pipeline. Create a new PX ticket
(e.g. `PX-138`) with this scope:

**A. `find-omissions.md` — Pre-flight (L11-17)** add a second mandatory check:
```bash
node .claude/scripts/tickets/validate-graph-arg.js "$ARGUMENTS" || exit 2
node .claude/scripts/tickets/require-consolidated-manifest.js || exit 2
```
`require-consolidated-manifest.js` prints to stderr and exits 2 when no
`./manifests/CONSOLIDATED-MANIFEST-*.json` exists, with a cause/action message
("run /consolidate-stubs first (Steps 1-5), then re-run /find-omissions").

**B. `find-omissions.md` — Step 1 (L103-151) simplification.** Because a passing
consolidate gate already guarantees: no orphan keys (forbidden-keys table rejects
MUST RESOLVE / PX / non-existent), no terminal excuses (the `--for-consolidate`
gate fails them), all markers re-pointed to valid keys, and a complete unit
manifest emitted — the elaborate 4-class table (`resolvedCandidates` /
`pendingObligations` / `orphans` / `excuses`) and the manual manifest-authoring
guidance can be replaced by a manifest-driven flow:
```bash
MANIFEST=$(ls -t manifests/CONSOLIDATED-MANIFEST-*.json | head -1)
cat "$MANIFEST" | node .claude/scripts/tickets/batch-create-resolving-tickets.js --no-write   # review
cat "$MANIFEST" | node .claude/scripts/tickets/batch-create-resolving-tickets.js               # commit
```
Keep a **residual safety net**: one `preflight-stub-cleanup.js` run after the
commit to catch markers the consolidation did not cover (e.g. added after
consolidate, or left UNASSIGNED). Decide (with the user or by judgment) whether to
(a) remove the 4-class handling entirely or (b) keep it as a reduced
residual-check note. Option (b) is the recommended default (thoroughness).

**C. `find-omissions.md` — final success cleanup.** Add a last step (after all
find-omissions steps pass) that runs `clean-consolidation-artifacts.js`, which
removes `manifests/CONSOLIDATED-MANIFEST-*.json`, `manifests/ROLLBACK-*.json`,
and `manifests/` if empty. Idempotent (exit 0 when nothing to remove).

**D. `consolidate-stubs.md` L157** — the manifest deliverable sentence already
carries the completed-key qualification; extend it (or the find-omissions handoff
note) to state that `/find-omissions` **consumes and removes** the manifest on
success.

**E. Tests** — add `tests/require-consolidated-manifest.test.cjs` and
`tests/clean-consolidation-artifacts.test.cjs` (or extend an existing suite):
- manifest check: exit 0 with a manifest present; exit 2 + stderr with none.
- cleanup: removes CONSOLIDATED-MANIFEST-*/ROLLBACK-* and the dir when empty;
  leaves other files in `manifests/` untouched; idempotent.
- keep `tests/print-manifest-for-find-omissions.test.cjs` C003 green (the handoff
  note must still show the grouped JSON example and the pipe command).

### 5.3 Verification commands (for the ticket's start/review phases)

```bash
node --test tests/require-consolidated-manifest.test.cjs tests/clean-consolidation-artifacts.test.cjs \
  tests/print-manifest-for-find-omissions.test.cjs tests/consolidate-stubs-doc.test.cjs
node .claude/scripts/tickets/verify-red-coverage.js --ticket-key=<NEW_KEY>
node .claude/scripts/tickets/validate-ticket-targets.js --ticket-key=<NEW_KEY> --tickets=Tickets.json
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```

E2E smoke test (temp workspace, never the repo):
1. consolidate → manifest written
2. gate passes
3. `require-consolidated-manifest.js` exit 0
4. `batch-create --no-write` then real commit → new resolving ticket + marker rewrite
5. `clean-consolidation-artifacts.js` → `manifests/` gone, tree clean

---

## 6. Conventions & rules the next agent MUST follow

- **Supreme law — TDD Red-Green-Refactor**: write failing tests first, then the
  minimal implementation, then refactor. Never modify tests to make them pass.
  Never ship a stubbed/boxed-in implementation. 100% contract coverage in the Red
  phase (see `verify-make-contracts.js` / `verify-plan-contracts.js` /
  `verify-final-contracts.js` gates).
- **`[::STUB::]` marker is an absolute obligation**: every incomplete implementation
  must carry `[::STUB::] <ticket-id>: <how it will be resolved>`. Unmarked
  incomplete code is a "crime" recorded in Malfeasance.json.
- **No-external-excuse rule**: every blocker is an internal AI work item; terminal
  excuses ("awaiting approval", "blocked on external") are forbidden.
- **Language protocol**: chat/proposals/explanations in Japanese when addressing the
  user; design docs, plans, tasks, code comments, and logs in English.
- **Git workflow**: conventional commits (`feat|fix|refactor|test|chore(scope)`),
  scope = ticket key, no push unless explicitly requested; attribution is disabled
  globally (no Co-Authored-By).
- **Pipeline gates**: each phase (make/plan/start/review) has mandatory gate
  scripts; do not skip them. Deferral is forbidden in principle.
- **Docs under `docs/`** are English and use the `UPPER-CASE-NAME.md` convention.
