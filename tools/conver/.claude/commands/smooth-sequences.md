---
description: The final mechanical acceptance gate of the design pipeline — decide whether sequences, operations and boundary contracts are complete, consistent, sufficient and safe.
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /smooth-sequences

The repair loop is the command. The script decides; the executing AI repairs. The only terminal state is a fresh run that exits 0. Frozen inputs are changed only through the regeneration transaction, never in place.

`/smooth-sequences` itself never asks a question and never delegates a ground to a human. A delegated design command may ask direction questions under its own limit; that is the only human surface. The default is that the AI decides.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Position in the workflow

```
/workspacify-* → /educe-sequences → { /explain-seed → /grill-me-for-rfc (all directories in order) }
→ /smooth-sequences → { /graphify-rfc → /boundify-graph → /split-to-tickets (all directories in order) } ...
```

`/smooth-sequences` is the last gate before implementation. It reads what the earlier commands wrote and decides whether the enumeration and the contracts hold.

## Inputs

- The current working directory, which is the workspace root. It must directly hold `WORKSPACIFY-TREE-MANIFEST.json` and `WORKSPACIFY-ALLOCATE-MANIFEST.json`. It does not search parent directories, so a directory below a workspace is never promoted to that workspace.
- The single `*-sequences.json` artifact at the workspace root.
- Each package's `SEQUENCES.json` and `RFC.md`.
- `WORKSPACIFY-ALLOCATE-MANIFEST.json`'s `contract_registry` and optional `declared_interfaces`.
- The artifact's optional `vocabulary` field: `terminalStatuses` and `requiredInterfaces`. When it is absent, the detector derives the names from the active operation status graphs and the allocate manifest's `declared_interfaces`, with the artifact pins as the last source. A name no record states withholds that check; the detector never invents a default name. A malformed `vocabulary` field is misuse (exit 2), not a finding. No separate vocabulary file is read.
- The hash chain: `input.source_hash` and `integrity.manifest_hash` in the tree manifest, `input_tree_manifest` in the allocate manifest, and `artifact.spec.path` with `spec.sha256` in the artifact.

## Outputs

- `SMOOTH-SEQUENCES.json` — the complete report at `schemaVersion: 2`.
- `SMOOTH-SEQUENCES.md` — the human repair view, capped at 200 findings with an explicit `…and N more findings` line.
- Console: one `route:` header per authored surface, one finding line per finding, and a final `next:` line.
- Exit codes: `0` pass, `1` blocking findings, `2` misuse or a refusal (broken chain, open transaction), `3` an AI handoff (a ground to settle or an educe phase to run). Exit 3 is an AI handoff, not a request for a human to decide, and is not completion.

## Steps

### Step 0 — Prepare

Run once from the workspace root:

```bash
node .claude/scripts/smooth-sequences/run.mjs
```

The command judges the current directory and, before reading the design, resolves an interrupted regeneration commit, refuses while a transaction owns the workspace, and verifies the hash chain. It does not search parent directories.

| exit | meaning | next |
|---|---|---|
| `0` | no finding | Step 2 |
| `1` | findings; the report was written | Step 1 |
| `2` | misuse or refusal; no new report | read the cause named on stderr. If a transaction is open, run `node .claude/scripts/regeneration/run.mjs continue` and follow its `next:`; then Step 0 |
| `3` | an AI handoff: a ground to settle or an educe phase to run | Step 1c for a ground; for educe, run the printed command and then `continue`; then Step 0 |

An open transaction is resumed, never abandoned. The detector does not write a report while an open, derived, verified or committing transaction owns the workspace. A judgment-required transaction is read and reported, because Step 1c needs the live findings to act.

### Step 1 — Repair loop (the body)

Exit 1 is an input to this loop, never an output of the command. A report that still carries findings is not completion.

Every finding carries a repair class:

| class | surfaces | action |
|---|---|---|
| `in-place` | package `RFC.md` (distribution ledger, boundary name), package view | edit the named file or re-project the view, then rerun this command |
| `regeneration` | specification-derived artifact findings and allocate decisions | never edit the live specification; copy it to a candidate, change the candidate or the decisions, then run the transaction |
| `judgment-required` | an RFC or obligation ground that no longer resolves | Step 1c: run the owning AI command in staging, then `continue` |

#### Step 1a — In-place repair

1. Open the `where` path. The fragment names the row to change.
2. Apply `fix`.
3. Run the `rerun:` command.
4. Return to Step 0.

#### Step 1b — Regeneration

Only a finding whose `repairClass` is `regeneration` opens a transaction. An `in-place` finding never opens one. The specification, the tree manifest, the allocate manifest and the artifact are never edited in place.

| finding surface | candidate | open flag |
|---|---|---|
| specification-derived (`spec.md#Lnn`) | `regeneration/candidates/<id>.md` | `--spec=<candidate>` |
| allocate decisions (`workspacify/allocate/DECISIONS.json#...`) | `regeneration/candidates/<id>-ALLOCATE.json` | `--allocate-decisions=<candidate>` |
| tree decisions (a derive failure names a tree decision) | `regeneration/candidates/<id>-TREE.json` | `--tree-decisions=<candidate>` |
| both | both candidates | both flags |

A candidate is a complete copy with the intended change, not a patch. At least one candidate must differ from its live counterpart; otherwise `open` returns `NO_CHANGE`.

Preconditions:

- `pwd` is the workspace root.
- `node .claude/scripts/smooth-sequences/run.mjs` exits 0 or 1. Exit 2 names a broken chain or an open transaction; resolve that first.
- No transaction is active. `status` shows `state: none` or a terminal state.

Write the candidate outside the frozen files, then drive the transaction:

```bash
# 1. Write the candidate.
mkdir -p regeneration/candidates
cp "$(node -e "const t=require('./WORKSPACIFY-TREE-MANIFEST.json');process.stdout.write(t.input.spec_path)")" regeneration/candidates/<id>.md
$EDITOR regeneration/candidates/<id>.md

# 2. Open the transaction.
node .claude/scripts/regeneration/run.mjs open \
  --spec=regeneration/candidates/<id>.md \
  --reason="<checkId>: <evidence and why the change is correct>"

# 3. Read the state and the staging specification path.
node .claude/scripts/regeneration/run.mjs status

# 4. Drive derive, verify and commit in one command.
node .claude/scripts/regeneration/run.mjs continue
```

`continue` prints `id`, `state`, `staging`, `spec` and the exact `next:` command. It stops only at a handoff:

| printed state | meaning | exact next command |
|---|---|---|
| `educe-pending` | the artifact does not record the staged specification | run `.claude/commands/educe-sequences.md` with the printed `spec:`, then `node .claude/scripts/regeneration/run.mjs continue` |
| `derived` / `verified` | the transaction advanced but has not finished; this is not expected from `continue` | `node .claude/scripts/regeneration/run.mjs continue` |
| `judgment-required` | a ground the mechanical gates cannot settle | Step 1c, then `continue` |
| `unverified` | the chain or the detector refused | fix the named `link:` or `finding:`, then `continue` |
| `derive-failed` | a producer refused | `node .claude/scripts/regeneration/run.mjs abort`, fix the candidate, then `open` again |
| `commit-failed` | the live tree was restored | inspect the archive, then open a new transaction |
| `committed` | the generation is live | Step 0 |
| `aborted` | the staging tree was discarded | open a new transaction |

The individual commands remain available for recovery and inspection:

```bash
node .claude/scripts/regeneration/run.mjs open ...      # stage a candidate
node .claude/scripts/regeneration/run.mjs status        # id, state, staging, spec, next
node .claude/scripts/regeneration/run.mjs continue      # derive -> verify -> commit, or one handoff
node .claude/scripts/regeneration/run.mjs derive        # one derive step
node .claude/scripts/regeneration/run.mjs verify        # chain, grounds and detector
node .claude/scripts/regeneration/run.mjs commit        # the only live write
node .claude/scripts/regeneration/run.mjs abort         # discard staging
node .claude/scripts/regeneration/run.mjs recover       # resolve an interrupted commit
```

The educe handoff is part of this step. `derive` advances the educe rail through every deterministic phase with `phase.mjs through` and stops at the first phase a reader must perform. When the artifact still does not record the staged specification, `continue` prints `state: educe-pending` and the staging spec path. Execute `.claude/commands/educe-sequences.md` with that spec as its single argument, in order, through every gate; the artifact must appear beside the spec. Then run `continue` again: it resumes without rerunning the setup.

Failure handling:

- `CANDIDATE_CHANGED`: the staged specification or decisions no longer match the candidate recorded at open. Abort, edit the candidate, open again.
- `STAGING_CHANGED`: the staging tree changed after verify. Abort, open again, verify the new generation.
- `SILENT_CHANGE_DETECTED`: the live chain is broken. Do not thaw; restore the generation from the archive or repair the frozen input outside the workspace.
- `TRANSACTION_OPEN`: finish or abort the current transaction before opening another; run `continue`.
- `TRANSACTION_TERMINAL`: the named transaction is committed or aborted; it is a record, not an edit surface. Open a new transaction.
- `UNVERIFIED_GENERATION`: run `continue` or `verify` before `commit`.
- `BASELINE_CHANGED`: a live design file changed since open. Abort and open from the current baseline.

Interrupted commit: the detector calls `recover` before it reads. To do it by hand, run `node .claude/scripts/regeneration/run.mjs recover`. A `prepared` or `applying` journal is rolled back; a `verifying` journal whose live chain is valid is completed. Never delete `regeneration/GENERATIONS.json` or `regeneration/COMMIT-JOURNAL.json`.

Forbidden in this step:

- Edit the live specification, `WORKSPACIFY-*`, the artifact or the live decisions.
- Edit the staged specification or decisions after open (`CANDIDATE_CHANGED`).
- Edit the staging tree after verify (`STAGING_CHANGED`).
- Delete the ledger, the journal or the archive.
- Pass `--force`, `--hash` or `--source-hash`; the chain is computed by the transaction.

#### Step 1c — judgment-required is an AI repair, not a stop

A `judgment-required` state names a ground the mechanical gates cannot settle. The AI runs the owning command on the staging tree:

- `/grill-me-for-rfc` for an RFC or obligation ground;
- `/explain-seed` for an RFC seed.

Those commands settle every point they can from the specification, code and documents. They may ask only direction questions under their own limits (three questions per round, five rounds). That is the only human surface; `/smooth-sequences` never asks and never delegates the ground itself.

After the owning command settles the ground, run `node .claude/scripts/regeneration/run.mjs continue`. The state is a repair route, not a terminal stop and not completion. If the owning command cannot settle the ground, the ground or the specification is defective: abort, amend the candidate, and open a new transaction; never hand the ground to a human. Editing the staged candidate in place is refused with `CANDIDATE_CHANGED`.

Rules for the whole loop:

- **Never hand-edit a generated file.** `SEQUENCES.json`, `*-sequences.json` and `WORKSPACIFY-*` are written by their producers. A finding about one is repaired by editing its authored input and rerunning the producer.
- **`persisted` means the previous repair did not address the finding.** Diagnose before repeating the same edit.
- **The loop has no iteration cap.** It ends only when a fresh run exits 0.

Editable surfaces:

| surface | authored file | producer |
|---|---|---|
| package RFC | `<package>/RFC.md` | `node .claude/scripts/smooth-sequences/run.mjs` (edit only) |
| package obligation | `<package>/OBLIGATION.json` | `node .claude/scripts/sequences-slice/run.mjs <artifact> <package>` |
| package view | `<package>/SEQUENCES.json` (generated) | `node .claude/scripts/sequences-slice/run.mjs <artifact> <package>` |
| specification (candidate) | `regeneration/candidates/<id>.md` | `node .claude/scripts/regeneration/run.mjs open --spec=<candidate> --reason=...` |
| allocate decisions (candidate) | `regeneration/candidates/<id>-ALLOCATE.json` | `node .claude/scripts/regeneration/run.mjs open --allocate-decisions=<candidate> --reason=...` |
| tree decisions (candidate) | `regeneration/candidates/<id>-TREE.json` | `node .claude/scripts/regeneration/run.mjs open --tree-decisions=<candidate> --reason=...` |

### Step 2 — Complete

Only a fresh exit 0 completes the command. The chain must verify, the transaction must be closed, and the findings must be empty.

- Zero findings and zero withheld: `verdict: pass`.
- Zero findings and a non-empty withheld list: list every withheld surface and end with `verdict: pass with N unproven surface(s)`. Never call such a run proved.
- Report the verdict and this boundary verbatim:

> does not guarantee: whether the enumeration is complete relative to the world; semantic prose equivalence remains a judgment.

## Appendix A — Check families

The detector runs every check family in one invocation; the console groups the results by repair route. This appendix is diagnostic reference, not an operating step.

- **S1 enumeration integrity:** duplicate ids, unresolved step operation/sequence, a drawn sequence with no step.
- **S3 operation envelope:** initial status, transition targets, transitions out of a terminal status, finality for external dependencies, and every required interface. The terminal names come from the artifact's `vocabulary`, else from the union of statuses an active operation ends at; the interface names come from `vocabulary`, else from the allocate manifest's `declared_interfaces` columns, else from the columns the artifact pins reach. A vocabulary no record states withholds that check.
- **S4 boundary clauses:** required `stage2_contract_scope` clauses, extra clauses, provider/consumer direction and counterpart, and contribution completeness. A v3 operation must declare `registry_contribution` in `required`/`not_required`, a `not_required` must carry `registry_contribution_ground`, and the owner's distribution ledger must record an `op-<operationId>` row. The ledger `Kind` is not mapped to a contribution value.
- **S5 contract meshing (v3 only):** precondition implication, produced/consumed closure, error-set agreement, crossing-boundary resolution.
- **S6 danger:** a cycle in the operation dependency graph, an active operation no step reaches and no grounded escape covers, an orphan object fact, a repeated operation with no `loop`/`retry`/`exception` annotation, and a step that depends on a later step.
- **S7 artifact/view/RFC consistency:** missing view, package-id mismatch, owned unit mismatch, boundary not named in the RFC.

## Appendix B — Frozen inputs and the chain

The specification, `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json` and the artifact are hash-chained. Their recorded hashes must agree before the detector runs; a disagreement is `SILENT_CHANGE_DETECTED` and exit 2. A change is made by opening a regeneration transaction, deriving in a staging tree, verifying the chain and every ground, and committing with rollback. The live design files are byte-identical until commit.

## Appendix C — Withheld surfaces

A withheld check is named in the report and is **not** a pass. The `withheld` array carries `{layer, check, reason}`:

- `B` — the artifact is v2 and carries no typed step contract, so Layer B is withheld.
- `vocabulary:S3.terminal-status` / `vocabulary:S3.interface-mapping` — neither the artifact's `vocabulary` nor any derivable record states the corresponding list.
- `S4.contribution` — the artifact is v2 and carries no `registry_contribution`.

A v2 artifact is never rewritten or required to be v3.

## Appendix D — Rare states

These states are reached only through a crash, a refusal or a terminal record. They are handled by the commands in Step 1b; this table is for diagnosis.

| state | meaning |
|---|---|
| `committing` | an interrupted commit owns the live tree; `continue` calls `recover` first |
| `commit-failed` | the live tree was restored byte-identically; inspect the archive |
| `aborted` | the staging tree was discarded; open a new transaction |
| `committed` | the generation is live; rerun the detector |

## Appendix E — Example

```bash
cd /path/to/workspace
node .claude/scripts/smooth-sequences/run.mjs
# smooth-sequences: 1 finding(s) in 1 repair route(s); /path/to/workspace/SMOOTH-SEQUENCES.json
# route: spec.md#L20 (read-only; copy it to a candidate first) | rerun: node .claude/scripts/regeneration/run.mjs open --spec=<candidate> --reason=<reason>
#   S3.interface-mapping-missing ConsumeFact | why: no grpc mapping | fix: map grpc on the operation
# next: fix every finding above, then rerun this command. exit 0 only when this block is empty.

node .claude/scripts/regeneration/run.mjs open --spec=regeneration/candidates/spec.md --reason="S3.interface-mapping-missing: map grpc"
node .claude/scripts/regeneration/run.mjs continue
# state: educe-pending
# spec: /path/to/workspace.regeneration/<tx>/spec.md
# next: run .claude/commands/educe-sequences.md with /path/to/workspace.regeneration/<tx>/spec.md, then node .claude/scripts/regeneration/run.mjs continue
```
