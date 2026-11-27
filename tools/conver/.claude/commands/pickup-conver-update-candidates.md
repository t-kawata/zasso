---
description: Extract generalizable conver improvements from local .claude changes into a strict candidate ledger.
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END

Run to final step. No questions, approvals, options. Decide from repository evidence. Every gate failure carries Cause, Artifact, Field, Action, Verify: repair, rerun, continue. Final report only.

# /pickup-conver-update-candidates

Role: scan local `.claude` diff vs upstream. Judge every hunk. Persist qualifying hunks only.

**Path anchor (mandatory — resolve once).**

```bash
printf '%s/.claude\n' "$(git rev-parse --show-toplevel)"
```

Record as `CLAUDE_DIR`. Set `WORKSPACE=$(git rev-parse --show-toplevel)`. Reuse both literals; never re-run.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Criteria — criteriaVersion 1.0.0

Gates, all required: G1 scope under CLAUDE_DIR; G2 non-destructive; G3 no project residue; G4 real evidence; G5 testable; G6 no gate weakening.

Value category, exactly one primary: correctness, safety, efficiency, generality, density, clarity, consistency, testability, observability, evolvability.

Exclusion, never persist: X1 project-specific; X2 one-off; X3 environment; X4 duplicate; X5 cosmetic; X6 low confidence; X7 secrets/PII/identifiers; X8 gate weakening.

Completeness, all required: Symptom, Remedy, Generality, Risk, Verification. One missing fact = unspecified = not eligible.

`generalization: direct|adapt`. `adapt` requires a concrete `adaptationPlan` removing project residue.

## Steps

1. Scan.

```bash
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" scan --workspace="$WORKSPACE" --claude-dir="$CLAUDE_DIR"
```

`skipped:no-changes` → stop. `[ERROR]` → repair, rerun.

2. Inspect every file diff. Per hunk: apply G1-G6, pick one value category, apply X1-X8, state S-R-G-R-V. Excluded → stdout summary only; never create.

3. Persist each qualifying hunk as one candidate JSON.

```bash
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" create --workspace="$WORKSPACE" --candidate=<candidate.json>
```

`skipped:duplicate` → continue. `[ERROR]` → repair, rerun.

4. Render from JSON.

```bash
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" render --workspace="$WORKSPACE"
```

5. Report. Japanese. Counts: files scanned, created, duplicates, excluded with codes. Output paths. No per-candidate restatement.

## Invariants

- JSON is truth; `CONVER-UPDATE-CANDIDATES.md` is generated.
- Excluded changes never persist.
- Only paths under `CLAUDE_DIR` enter the ledger.
- Missing upstream fails closed.
- `criteriaVersion 1.0.0` is recorded in every ledger.
