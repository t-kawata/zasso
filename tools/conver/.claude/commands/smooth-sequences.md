---
description: The final mechanical acceptance gate of the design pipeline — decide whether sequences, operations and boundary contracts are complete, consistent, sufficient and safe.
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /smooth-sequences

The repair loop is the command. The script decides; the executing AI repairs. The only terminal state is a fresh run that exits 0. Frozen inputs are changed only through the regeneration transaction, never in place.

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
- Exit codes: `0` pass, `1` blocking findings, `2` misuse or a refusal (broken chain, open transaction), `3` a judgment-required regeneration.

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
| `2` | misuse or refusal; no new report | fix the cause named on stderr, then Step 0 |
| `3` | a regeneration awaits a judgment | fix the ground in staging, then verify the transaction |

### Step 1 — Repair loop (the body)

Exit 1 is an input to this loop, never an output of the command. A report that still carries findings is not completion.

Every finding carries a repair class:

| class | surfaces | action |
|---|---|---|
| `in-place` | package `RFC.md` (distribution ledger, boundary name), package view | edit the named file or re-project the view, then rerun this command |
| `regeneration` | specification-derived artifact findings and allocate decisions | never edit the live specification; copy it to a candidate, change the candidate or the decisions, then run the transaction |
| `judgment-required` | an RFC or obligation ground that no longer resolves | resolve the ground in the staging tree, then verify again |

For an `in-place` finding:

1. Open the `where` path. The fragment names the row to change.
2. Apply `fix`.
3. Run the `rerun:` command.
4. Return to Step 0.

For a `regeneration` finding:

1. Copy the specification to a candidate file. The `where` path names the evidence and is marked read-only; never edit the live specification, `WORKSPACIFY-*` or the artifact in place.
2. Apply the change to the candidate, or to `workspacify/allocate/DECISIONS.json` when that is the named surface.
3. Run `node .claude/scripts/regeneration/run.mjs open --spec=<candidate> --reason="<why>"`.
4. Follow the transaction: `derive`, the educe phase handoff, `verify`, `commit`. The transaction stages a new generation, verifies its chain and grounds, and commits atomically with rollback.
5. Return to Step 0.

A transaction that reaches `judgment-required` stops the loop with exit 3. It is not completion.

Rules:

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
| allocate decisions | `workspacify/allocate/DECISIONS.json` | the same regeneration transaction |

### Step 2 — Complete

Only a fresh exit 0 completes the command. The chain must verify, the transaction must be closed, and the findings must be empty.

- Zero findings and zero withheld: `verdict: pass`.
- Zero findings and a non-empty withheld list: list every withheld surface and end with `verdict: pass with N unproven surface(s)`. Never call such a run proved.
- Report the verdict and this boundary verbatim:

> does not guarantee: whether the enumeration is complete relative to the world; semantic prose equivalence remains a judgment.

## Reference — what each check reads

The detector runs every check family in one invocation; the console groups the results by repair route.

- **S1 enumeration integrity:** duplicate ids, unresolved step operation/sequence, a drawn sequence with no step.
- **S3 operation envelope:** initial status, transition targets, transitions out of a terminal status, finality for external dependencies, and every required interface. The terminal names come from the artifact's `vocabulary`, else from the union of statuses an active operation ends at; the interface names come from `vocabulary`, else from the allocate manifest's `declared_interfaces` columns, else from the columns the artifact pins reach. A vocabulary no record states withholds that check.
- **S4 boundary clauses:** required `stage2_contract_scope` clauses, extra clauses, provider/consumer direction and counterpart, and contribution completeness. A v3 operation must declare `registry_contribution` in `required`/`not_required`, a `not_required` must carry `registry_contribution_ground`, and the owner's distribution ledger must record an `op-<operationId>` row. The ledger `Kind` is not mapped to a contribution value.
- **S7 artifact/view/RFC consistency:** missing view, package-id mismatch, owned unit mismatch, boundary not named in the RFC.
- **S5 contract meshing (v3 only):** precondition implication, produced/consumed closure, error-set agreement, crossing-boundary resolution.
- **S6 danger:** a cycle in the operation dependency graph, an active operation no step reaches and no grounded escape covers, an orphan object fact, a repeated operation with no `loop`/`retry`/`exception` annotation, and a step that depends on a later step.

### Frozen inputs and the transaction

The specification, `WORKSPACIFY-TREE-MANIFEST.json`, `WORKSPACIFY-ALLOCATE-MANIFEST.json` and the artifact are hash-chained. Their recorded hashes must agree before the detector runs; a disagreement is `SILENT_CHANGE_DETECTED` and exit 2. A change is made by opening a regeneration transaction, deriving in a staging tree, verifying the chain and every ground, and committing with rollback. The live design files are byte-identical until commit.

### Withheld surfaces

A withheld check is named in the report and is **not** a pass. The `withheld` array carries `{layer, check, reason}`:

- `B` — the artifact is v2 and carries no typed step contract, so Layer B is withheld.
- `vocabulary:S3.terminal-status` / `vocabulary:S3.interface-mapping` — neither the artifact's `vocabulary` nor any derivable record states the corresponding list.
- `S4.contribution` — the artifact is v2 and carries no `registry_contribution`.

A v2 artifact is never rewritten or required to be v3.

## Example

```bash
cd /path/to/workspace
node .claude/scripts/smooth-sequences/run.mjs
# smooth-sequences: 1 finding(s) in 1 repair route(s); /path/to/workspace/SMOOTH-SEQUENCES.json
# route: spec.md#L20 (read-only; copy it to a candidate first) | rerun: node .claude/scripts/regeneration/run.mjs open --spec=<candidate> --reason=<reason>
#   S3.interface-mapping-missing ConsumeFact | why: no grpc mapping | fix: map grpc on the operation
# next: fix every finding above, then rerun this command. exit 0 only when this block is empty.
```

## Related

- `/educe-sequences` — produces the artifact and the 31 rail checks.
- `/grill-me-for-rfc` — resolves demands and writes the package RFC and obligation record.
- `/workspacify-allocate` — produces the allocate manifest and its decisions input.
- `/workspacify-order` — prints the implementation order the same workspace implies.
