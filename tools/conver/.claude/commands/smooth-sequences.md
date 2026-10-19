---
description: The final mechanical acceptance gate of the design pipeline — decide whether sequences, operations and boundary contracts are complete, consistent, sufficient and safe.
argument-hint: [workspace-root]
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/educe-sequences`, `/explain-seed`, `/grill-me-for-rfc`, `/smooth-sequences`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say "waiting," "I will report later," or equivalent. Intermediate status is not output.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete.

# /smooth-sequences

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
/workspacify-* → /educe-sequences → /explain-seed → /grill-me-for-rfc (all directories in order)
→ /smooth-sequences
```

`/smooth-sequences` is the last gate before implementation. It reads what the earlier commands wrote and decides whether the enumeration and the contracts hold. It never replaces `/educe-sequences` or `/grill-me-for-rfc`; a defect whose repair belongs upstream is reported as an upstream repair.

## Inputs

- The workspace root holding `WORKSPACIFY-TREE-MANIFEST.json` and `WORKSPACIFY-ALLOCATE-MANIFEST.json`.
- The single `*-sequences.json` artifact at the workspace root.
- Each package's `SEQUENCES.json` and `RFC.md`.
- `WORKSPACIFY-ALLOCATE-MANIFEST.json`'s `contract_registry`.

## Outputs

- `SMOOTH-SEQUENCES.json` — the complete report. No truncation.
- `SMOOTH-SEQUENCES.md` — the human view, capped at 200 findings with an explicit `…and N more findings` line.
- Exit codes: `0` pass, `1` blocking findings, `2` misuse (no report written).

## Steps

### Step 0 — Resolve the workspace

```bash
node .claude/scripts/smooth-sequences/run.mjs "$ARGUMENTS"
```

With no argument the command walks up from the current directory. With one argument the walk starts at that path. A workspace with no manifest or no artifact is misuse, not a finding.

### Step 1 — Run Layer A (structure)

The command checks, without reading prose:

- S1 enumeration integrity: duplicate ids, unresolved step operation/sequence, a drawn sequence with no step.
- S3 operation envelope: initial status, transition targets, terminal transitions, finality for external dependencies, the three interface mappings.
- S4 boundary clauses: required `stage2_contract_scope` clauses, extra clauses, provider/consumer direction and counterpart, contribution completeness.
- S7 artifact/view/RFC consistency: missing view, package-id mismatch, owned unit mismatch, boundary not named in the RFC.

### Step 2 — Run Layer B (contract meshing)

When the artifact is `schema_version: 3`, the command compares the typed step contracts:

- S5 precondition implication: a consumer precondition fact must be in the provider postcondition facts.
- S5 produced/consumed closure: a consumed fact must be produced earlier in the sequence or by the provider.
- S5 error-set agreement: a consumer expectation the provider does not declare is a finding.
- S5 crossing-boundary resolution: every `crosses` entry must resolve to a declared boundary.

When the artifact is `schema_version: 2`, Layer B is **withheld**: the report names `B (v3 step contract absent)` and the run can still exit 0 if Layer A holds. A v2 field is never rewritten or required to be v3.

### Step 3 — Run S6 (danger)

- A cycle in the operation dependency graph.
- An active operation no step reaches and no grounded escape covers.
- A produced fact no step consumes, or a consumed fact no step produces.
- A repeated operation in one sequence with no `loop`/`retry`/`exception` annotation.
- A step that consumes a fact a later step produces without an exception annotation.

### Step 4 — Report and heal-loop

The command writes both reports and exits:

- `0`: no blocking finding; proceed.
- `1`: findings. Repair them in the editable surface and re-run until 0.

Repair surface:

- **Editable:** `RFC.md`, `OBLIGATION.json`.
- **Never hand-edited:** `SEQUENCES.json`, `SEQUENCES.md`, `*-sequences.json`, `WORKSPACIFY-*`.
- A finding caused by a generated file is repaired by re-running its producer (`sequences-slice`, `/educe-sequences`, `/workspacify-*`), not by editing the generated file.

### Step 5 — Final gate

```bash
node .claude/scripts/smooth-sequences/run.mjs "$ARGUMENTS"
```

Exit 0 is the only passing verdict. The command prints the does-not-guarantee boundary beside every verdict:

> does not guarantee: whether the enumeration is complete relative to the world; semantic prose equivalence remains a judgment.

## Example

```bash
node .claude/scripts/smooth-sequences/run.mjs ~/shyme/gaia
# smooth-sequences: 0 finding(s); ~/shyme/gaia/SMOOTH-SEQUENCES.json
```

## Related

- `/educe-sequences` — produces the artifact and the 31 rail checks.
- `/grill-me-for-rfc` — resolves demands and writes the package RFC and obligation record.
- `/workspacify-order` — prints the implementation order the same workspace implies.
