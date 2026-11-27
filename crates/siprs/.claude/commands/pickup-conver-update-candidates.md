---
description: Extract generalizable conver improvements from local .claude changes into a strict candidate ledger.
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

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

## Reference — run before judging

```bash
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" schema
```

It prints every gate rule, exclusion rule, value category, required location and evidence field, enum, computed-by-create field, and update whitelist. Do not read implementation files for the schema.

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

Output: every changed file followed by its complete diff inside a fenced block. `skipped:no-changes` → stop. `[ERROR]` → repair, rerun.

2. Judge each hunk. Apply G1-G6, pick one value category, apply X1-X8, state S-R-G-R-V. Excluded → stdout summary only; never create.

3. Persist each qualifying hunk as one candidate. `schema` gives the fields; `create` assigns id, fingerprint, status, and note.

```bash
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" create --workspace="$WORKSPACE" --candidate=- --json <<'JSON'
{"location":{"file":".claude/scripts/x.js","hunkHeader":"@@ -1 +1 @@","lineStart":1,"lineEnd":1},"changeType":"modified","primaryCriterion":"safety","generalization":"direct","symptom":"...","remedy":"...","scope":"...","risk":"...","verification":"...","impact":"high","confidence":"high","riskLevel":"low","evidence":{"patch":"...","upstreamRef":"...","upstreamCommit":"...","diffStat":"...","extractCommand":"...","observedAt":"..."}}
JSON
```

`skipped:duplicate` → continue. `[ERROR]` → repair, rerun.

4. Correct and inspect.

```bash
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" list --workspace="$WORKSPACE"
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" show --workspace="$WORKSPACE" --id=CUC-0001
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" update --workspace="$WORKSPACE" --id=CUC-0001 --patch=- <<'JSON'
{"note":"..."}
JSON
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" delete --workspace="$WORKSPACE" --id=CUC-0001
```

`update` accepts only the whitelist printed by `schema`. `location` and `evidence` are immutable; delete then recreate.

5. Render from JSON.

```bash
node "$CLAUDE_DIR/scripts/pickup-conver-update-candidates/cli.js" render --workspace="$WORKSPACE"
```

6. Report. Japanese. Counts: files scanned, created, duplicates, excluded with codes. Output paths. No per-candidate restatement.

## Invariants

- JSON is truth; `CONVER-UPDATE-CANDIDATES.md` is generated.
- Excluded changes never persist.
- Only paths under `CLAUDE_DIR` enter the ledger.
- Missing upstream fails closed.
- `criteriaVersion 1.0.0` is recorded in every ledger.
