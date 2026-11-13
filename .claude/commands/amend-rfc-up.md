---
description: Amend canonical RFC/SPEC, GRAPH, Dirs-Tree, and Tickets across every affected package from material and a free instruction.
argument-hint: [<material file|directory>...]
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /amend-rfc-up

Role: generic multi-package amendment driver. Material + free instruction -> RFC/SPEC, GRAPH, Dirs-Tree, Tickets. A `*-law` skill is optional evidence, never the command's fixed authority.

## Path Anchor

Run once:

```bash
printf '%s/.claude\n' "$(git rev-parse --show-toplevel)"
```

Record the printed path as `CLAUDE_DIR`. Use that literal path below. Do not run `git rev-parse` again.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Arguments

- `[<material file|directory>...]` only. No thin flags.
- Free instruction: the invocation prose. Derive it into `$AMEND_OUT/INSTRUCTION.md`; it is evidence, not a command argument.
- Zero material: discover `FINDINGS.json`, `REVIEW.md`, or `AMEND-RFC-UP-REPORT.json`; none and no instruction -> `MATERIAL_REQUIRED`.
- One invocation may amend several packages. Package scope comes from the workspace inventory, not from an argument.

## Derivation

| Variable | Source |
|---|---|
| `PACKAGE_DIR` | invocation cwd |
| `REPO_ROOT` | git top-level of `PACKAGE_DIR` |
| `TICKETS_PATH`, `RFC_PATH`, `GRAPH_PATH`, `DIRS_TREE_PATH` | `preflight.js` from `lib/package-artifacts.js` |
| `MATERIALS` | `material.js`: `~`, absolute, invocation, package, and repo bases; sha256 per file |
| `MATERIAL_DIGEST`, `INSTRUCTION_DIGEST` | `preflight.js`: replay identity |
| `PACKAGES` | `workspace.js`: `workspace.packages` or bounded scan |
| `LAW_SKILLS` | `law-skill-verifier.js`: instruction-named `*-law` roots |
| `TICKET_KEY` | active ticket, material ticket key, or `ticket.js` amendment ticket |
| `AMEND_OUT` | `$PACKAGE_DIR/amend` |
| `LAW_OUT` | `$AMEND_OUT/law` |
| `INSTRUCTION_PATH` | `$AMEND_OUT/INSTRUCTION.md` |
| `RULE_INVENTORY`, `RULE_COVERAGE` | `rules.js`: registry IDs and covered/not_applicable ledger |
| `OBLIGATIONS`, `OBLIGATION_COVERAGE` | `obligations.js`: headings, normative prose, list items and table rows; per-obligation disposition |
| `SURFACE_COVERAGE` | `workspace.js`: every named surface has a package or a reason |
| `CHANGES`, `AMENDMENT-REQUEST` | `request.js`: `packages[]`, `changes[].package`, `crossPackageImpacts[]` |
| `REPAIR_WORKLIST` | `repair.js`: finding -> artifact writer, digest, progress |

## Steps

### Step 0 Preflight

```bash
AMEND_DIR="$CLAUDE_DIR/scripts/amend-rfc-up"
mkdir -p "$PWD/amend"
cat > "$PWD/amend/INSTRUCTION.md" <<'AMEND_INSTRUCTION'
<invocation prose, verbatim>
AMEND_INSTRUCTION
node "$AMEND_DIR/preflight.js" --invocation="$PWD" --instruction=@"$PWD/amend/INSTRUCTION.md" $ARGUMENTS
```

The heredoc body is the invocation prose verbatim; never paraphrase, summarize, or translate it.
Bind every line of `[VARIABLES]`. The command runs from the package directory; material paths may be absolute or relative to the invocation directory. Classify the canon:

```bash
node "$AMEND_DIR/preflight.js" canon --package="$PACKAGE_DIR" --repo="$REPO_ROOT"
```

- `materialized-fresh` or `materialized-stale` -> continue.
- `standalone` or `partial` -> `CANON_NOT_AMENDABLE`; execute `/grill-me-for-rfc` non-interactively from the same material and instruction, then rerun this command. Never ask a human.
- `PREFLIGHT_*`, `MATERIAL_REQUIRED`, `TICKET_REQUIRED` after ticket creation -> stop; no write.
- No active ticket and no material ticket key -> `ticket.js` creates a planned amendment ticket through the ticket CRUD tools.

### Step 1 Material, Rules, Law, Surfaces

For each material path, classify `law-skill` or `ordinary`. Bind `SKILL_DIR` from `LAW_SKILLS[i].skillPath`; a `law-skill` material path is also a `SKILL_DIR`.

- `law-skill` -> resolve the canonical verifier and run it:

```bash
node "$AMEND_DIR/verify-law-skill.mjs" --skill="$SKILL_DIR" --root="$REPO_ROOT" --out="$LAW_OUT/law-skill-verification.json"
```

- Any check not `machine_verified` -> `LAW_SKILL_INVALID`; stop. Never use the skill.
- An instruction that names a `*-law` skill is resolved by `resolveLawSkills`; a missing or ambiguous skill is a named stop.
- Verified skill: `applies` exit 3 -> `LAW_NOT_APPLICABLE`; exclude it for this package. Exit 0 -> `resolve` -> `deriveLawPhases` -> `context`; use only `context`, never `okf/`.

Build the material rule inventory and the surface list:

```bash
node "$AMEND_DIR/rules.js" inventory --materials="$MATERIALS" --out="$AMEND_OUT/RULE-INVENTORY.json"
node "$AMEND_DIR/rules.js" init --inventory="$AMEND_OUT/RULE-INVENTORY.json" --out="$AMEND_OUT/RULE-COVERAGE.json"
printf '%s\n' "$MATERIAL_PATHS" > "$AMEND_OUT/MATERIALS.json"
node "$AMEND_DIR/obligations.js" inventory --materials=@"$AMEND_OUT/MATERIALS.json" --out="$AMEND_OUT/OBLIGATIONS.json"
node "$AMEND_DIR/obligations.js" init --inventory=@"$AMEND_OUT/OBLIGATIONS.json" --out="$AMEND_OUT/OBLIGATION-COVERAGE.json"
```

- Every registry ID is present; an inline-only ID is flagged `registered:false`.
- Every heading, normative sentence, list item, and normative table row is a semantic obligation; fenced examples are excluded.
- A directory material contributes every text file beneath it; binary files are skipped.
- The inventory is an attempt at semantic completeness, never a claim that completeness is proved.
- A zero count over prose material is an extraction gap: read the material and add every normative statement the extractor missed to `OBLIGATIONS.json`, with its source line.
- The inventory and coverage are deterministic and sorted.
- Extract the surfaces from the instruction and material:

```bash
node "$AMEND_DIR/workspace.js" surfaces --instruction=@"$INSTRUCTION_PATH" \
  --materials="$MATERIALS" --out="$AMEND_OUT/SURFACES.json"
```

- No surface name is hardcoded.
- A surface without a package or a reason is `SURFACE_TARGET_MISSING`; route a missing design to `/grill-me-for-rfc` or record `not_applicable` with a reason.

### Step 2 Amendment Request

1. Split the free instruction into clauses. One clause = one intent.
2. Author `packages[]`, `changes[]`, `ruleCoverage[]`, `obligationCoverage[]`, `surfaceCoverage[]`, and `crossPackageImpacts[]`.
3. Every change has `package`, `artifact`, `operation`, `evidence`, and a claim or owner reason.
4. Every rule has `covered` (with change ids) or `not_applicable` (with a reason). No `unset` remains.
5. Every surface has a package assignment or a reason.
6. Every semantic obligation has `covered` (change ids + a claim quote), `not_applicable` (reason + material basis), or `judged` (rationale + material basis).
   No `unset` remains. The basis quote must occur at the cited material line or in the named change's claim.
   A covered quote must share a content token with the obligation; a heading without one is `judged`.
7. For every package named by `changes[].package` without `ticketKey`, ensure an amendment ticket and record the returned key:

```bash
node "$AMEND_DIR/ticket.js" ensure --package="$PKG_DIR" --tickets="$PKG_DIR/Tickets.json" \
  --material-digest="$MATERIAL_DIGEST" --instruction-digest="$INSTRUCTION_DIGEST"
```

8. Write `$AMEND_OUT/PACKAGES.json`, `$AMEND_OUT/RULE-INVENTORY.json`, `$AMEND_OUT/RULE-COVERAGE.json`,
   `$AMEND_OUT/OBLIGATIONS.json`, `$AMEND_OUT/OBLIGATION-COVERAGE.json`, `$AMEND_OUT/SURFACES.json`,
   `$AMEND_OUT/SURFACE-COVERAGE.json`, `$AMEND_OUT/IMPACTS.json`, and `$AMEND_OUT/CHANGES.json`.
9. Build and validate the request:

```bash
node "$AMEND_DIR/request.js" --instruction=@"$INSTRUCTION_PATH" --changes=@"$AMEND_OUT/CHANGES.json" \
  --packages=@"$AMEND_OUT/PACKAGES.json" --rules=@"$AMEND_OUT/RULE-INVENTORY.json" \
  --rule-coverage=@"$AMEND_OUT/RULE-COVERAGE.json" --materials=@"$AMEND_OUT/MATERIALS.json" \
  --obligations=@"$AMEND_OUT/OBLIGATIONS.json" --obligation-coverage=@"$AMEND_OUT/OBLIGATION-COVERAGE.json" \
  --surfaces=@"$AMEND_OUT/SURFACES.json" --surface-coverage=@"$AMEND_OUT/SURFACE-COVERAGE.json" \
  --impacts=@"$AMEND_OUT/IMPACTS.json" > "$AMEND_OUT/AMENDMENT-REQUEST.json"
```

- `REQUEST_CLAUSE_UNCOVERED` -> an instruction clause is unanswered.
- `RULE_COVERAGE_INVALID` / `REQUEST_RULE_UNCOVERED` -> a rule is unset, unknown, duplicate, or names an unknown change.
- `OBLIGATION_INPUT_REQUIRED` -> the obligation inventory or coverage was not passed.
- `OBLIGATION_INVENTORY_STALE` -> the inventory does not match the material; rerun `obligations.js inventory` on the same material.
- `REQUEST_OBLIGATION_UNCOVERED` -> an obligation has no disposition.
- `OBLIGATION_COVERAGE_INVALID` -> duplicate or unknown obligation, unknown change, or missing reason/rationale.
- `OBLIGATION_BASIS_UNGROUNDED` -> a not_applicable/judged material quote, or a covered claim quote, is not found at its named source.
- `SURFACE_TARGET_MISSING` / `SURFACE_COVERAGE_INVALID` -> a surface is unassigned or malformed.
- `CHANGE_INVALID` -> artifact, operation, owner, package, evidence, impact, or claim is invalid.
- `CHANGE_DAG_CYCLE` -> change dependencies are cyclic.
- Artifact order: `rfc` -> `spec` -> `graph` -> `dirs-tree` -> `tickets`.

### Step 3 Dry-Run

For every change in dependency order, derive `CHANGE_PACKAGE_DIR` and `CHANGE_TICKET_KEY` from `PACKAGES[]` where `id === change.package`:

```bash
node "$AMEND_DIR/dispatch.js" dry-run --package="$CHANGE_PACKAGE_DIR" --ticket-key="$CHANGE_TICKET_KEY" \
  --change=@"$AMEND_OUT/CHANGES.json" --change-id="$CHANGE_ID"
```

- `rfc`/`spec` -> `design-amendment.js` dry-run; no artifact write and no claim under the package.
- `graph`/`dirs-tree`/`tickets` -> an owner plan with `owner`, `command`, `beforeDigest`, and expected artifacts. `OWNER_REQUIRED` is not a stop.
- `GATE_FINDING` or `DESIGN_AMENDMENT_FAILED` -> repair the claim (`text`, `target`, `predicate`, `requiredTest`) and rerun dry-run; no apply until clean.
  The same key twice -> escalate to a design amendment that supplies the missing basis. Never stop.

### Step 4 Apply

For every dry-run-clean change:

```bash
node "$AMEND_DIR/dispatch.js" apply --package="$CHANGE_PACKAGE_DIR" --ticket-key="$CHANGE_TICKET_KEY" \
  --change=@"$AMEND_OUT/CHANGES.json" --change-id="$CHANGE_ID"
```

- `rfc`/`spec`: the design amendment transaction is the only writer. Append-only; `## Design Amendments`; failed gate -> `rolled-back`.
- `graph`/`dirs-tree`/`tickets`: run the owner plan command, then derive the receipt from the current artifact:

```bash
node "$AMEND_DIR/dispatch.js" receipt --package="$CHANGE_PACKAGE_DIR" --owner=<owner> \
  --before-digest="<plan beforeDigest>" --exit=0 > "$AMEND_OUT/receipt-$CHANGE_ID.json"
node "$AMEND_DIR/dispatch.js" apply --package="$CHANGE_PACKAGE_DIR" --ticket-key="$CHANGE_TICKET_KEY" \
  --change=@"$AMEND_OUT/CHANGES.json" --change-id="$CHANGE_ID" --receipt=@"$AMEND_OUT/receipt-$CHANGE_ID.json"
```

- `OWNER_RECEIPT_INVALID` -> re-derive the receipt from the current artifact; never hand-edit it.
- `OWNER_NO_DELTA` -> rerun the owner with corrected input, or convert the change to a no-op with a reason; rerun.
- A rolled-back amendment leaves the artifact bytes unchanged and no ledger.

### Step 5 Owner Rederive

```bash
node "$AMEND_DIR/dispatch.js" owners --package="$PACKAGE_DIR"
```

Run, in order, for every package in `PACKAGES[]` whose artifact changed:

```text
/graphify-rfc -> /boundify-graph -> /split-to-tickets
```

After each owner command, derive its receipt:

```bash
node "$AMEND_DIR/dispatch.js" receipt --package="$PKG_DIR" --owner=<owner> \
  --before-digest="<owner plan beforeDigest>" --exit=0
```

Write the three receipts for one package to `$AMEND_OUT/rederive-$PKG_ID.json`:

```json
[{"owner":"graphify","beforeDigest":"...","afterDigest":"...","statusFile":"RFC-GRAPHIFY-Status.json","exit":0}]
```

`rederive` re-reads each artifact and rejects a receipt whose digest, status, or exit no longer matches.

```bash
node "$AMEND_DIR/dispatch.js" rederive --package="$PKG_DIR" --receipts=@"$AMEND_OUT/rederive-$PKG_ID.json"
```

- Owner failure is `REDERIVE_PENDING`; the committed amendment remains. Repair the named cause, run the owner command, re-derive the receipt, and rerun; never stop on a design finding.
- A downstream owner that legitimately produces identical bytes is accepted when its status file reports a finished run; `OWNER_NO_DELTA` applies only to a directly applied artifact change.

### Step 6 Verify

For every package in `PACKAGES[]` that has a change, bind `PKG_ID`, `PKG_DIR`, `PKG_TICKET_KEY`,
`PKG_RFC=$PKG_DIR/RFC.md`, `PKG_GRAPH=$PKG_DIR/RFC-GRAPH.json`, `PKG_DIRS_TREE=$PKG_DIR/RFC-Dirs-Tree.json`,
and `PKG_TICKETS=$PKG_DIR/Tickets.json`:

```bash
node "$AMEND_DIR/verify.js" amendment --ticket-key="$PKG_TICKET_KEY" --package="$PKG_DIR" > "$AMEND_OUT/verify-1-$PKG_ID.json"
node "$AMEND_DIR/verify.js" cross-artifact --rfc="$PKG_RFC" --graph="$PKG_GRAPH" --dirs-tree="$PKG_DIRS_TREE" \
  --src="$PKG_DIR/src" --tickets="$PKG_TICKETS" --session-dir="$AMEND_OUT/verify-session-$PKG_ID" \
  --workspace="$REPO_ROOT" > "$AMEND_OUT/cross-1-$PKG_ID.json"

```

Classify both verification chains before any convergence claim:

```bash
node "$AMEND_DIR/repair.js" plan --package="$PKG_DIR" --report=@"$AMEND_OUT/verify-1-$PKG_ID.json" \
  --out="$AMEND_OUT/repair-amendment-1-$PKG_ID.json"
node "$AMEND_DIR/repair.js" plan --package="$PKG_DIR" --report=@"$AMEND_OUT/cross-1-$PKG_ID.json" \
  --out="$AMEND_OUT/repair-1-$PKG_ID.json"
```

#### Repair Loop

Findings are loop input, never a terminal state. Repair in artifact order
`rfc` -> `spec` -> `graph` -> `dirs-tree` -> `tickets` -> `law`:

| class | writer | action |
|---|---|---|
| `rfc` / `spec` | `design-amendment.js` | append a claim that states the missing or contradictory design; dry-run first |
| `graph` | `/graphify-rfc` | re-derive the graph from the amended RFC; attach the owner receipt |
| `dirs-tree` | `/boundify-graph` | re-map every graph node and source file; attach the owner receipt |
| `tickets` | `/split-to-tickets` | re-derive the ticket set; attach the owner receipt |
| `law` | the verified `*-law` skill | repair the named rule site, then `gate` and `attest` |
| `evidence` | the finding's `action` | restore the named producer; never mark it verified |

After each round, rerun both verification chains into the next pair and classify again:

```bash
node "$AMEND_DIR/verify.js" amendment --ticket-key="$PKG_TICKET_KEY" --package="$PKG_DIR" > "$AMEND_OUT/verify-2-$PKG_ID.json"
node "$AMEND_DIR/repair.js" plan --package="$PKG_DIR" --report=@"$AMEND_OUT/verify-2-$PKG_ID.json" \
  --out="$AMEND_OUT/repair-amendment-2-$PKG_ID.json"
node "$AMEND_DIR/repair.js" progress --previous=@"$AMEND_OUT/repair-amendment-1-$PKG_ID.json" \
  --current=@"$AMEND_OUT/repair-amendment-2-$PKG_ID.json"
node "$AMEND_DIR/verify.js" cross-artifact --rfc="$PKG_RFC" --graph="$PKG_GRAPH" --dirs-tree="$PKG_DIRS_TREE" \
  --src="$PKG_DIR/src" --tickets="$PKG_TICKETS" --session-dir="$AMEND_OUT/verify-session-$PKG_ID" \
  --workspace="$REPO_ROOT" > "$AMEND_OUT/cross-2-$PKG_ID.json"
node "$AMEND_DIR/repair.js" plan --package="$PKG_DIR" --report=@"$AMEND_OUT/cross-2-$PKG_ID.json" \
  --out="$AMEND_OUT/repair-2-$PKG_ID.json"
node "$AMEND_DIR/repair.js" progress --previous=@"$AMEND_OUT/repair-1-$PKG_ID.json" \
  --current=@"$AMEND_OUT/repair-2-$PKG_ID.json"
```

- `clean` -> converge only when both the amendment worklist and the cross worklist are empty; two consecutive clean runs with the same digest -> done.
- `progressing` -> rotate `repair-2` into `repair-1` and rerun the loop.
- `regressed` -> roll back the last repair, take the next escalation route, rerun.
- `stalled` -> escalate one step upstream (`dirs-tree` -> `graph` -> `rfc`; `tickets` -> `dirs-tree`; `law` -> `rfc`), rerun.
- Every route exhausted and the artifact is unwritable -> `BLOCKED` with the exact unresolved keys. A design finding alone never selects `BLOCKED`.

Escalation routes:

- unmapped graph node -> `/boundify-graph`; persists -> `/graphify-rfc`; persists -> `design-amendment`.
- uncovered RFC heading -> `/graphify-rfc`; persists -> `design-amendment`.
- undeclared source file -> `/boundify-graph`.
- ticket or contract gap -> `/split-to-tickets`; persists -> `/boundify-graph`.
- law rule -> law skill repair; persists -> `design-amendment`.

After the loop reports `clean`, run two fresh verification pairs and converge the two clean runs (never the pre-repair run):

```bash
node "$AMEND_DIR/verify.js" amendment --ticket-key="$PKG_TICKET_KEY" --package="$PKG_DIR" > "$AMEND_OUT/verify-final-1-$PKG_ID.json"
node "$AMEND_DIR/verify.js" cross-artifact --rfc="$PKG_RFC" --graph="$PKG_GRAPH" --dirs-tree="$PKG_DIRS_TREE" \
  --src="$PKG_DIR/src" --tickets="$PKG_TICKETS" --session-dir="$AMEND_OUT/verify-session-$PKG_ID" \
  --workspace="$REPO_ROOT" > "$AMEND_OUT/cross-final-1-$PKG_ID.json"
node "$AMEND_DIR/verify.js" amendment --ticket-key="$PKG_TICKET_KEY" --package="$PKG_DIR" > "$AMEND_OUT/verify-final-2-$PKG_ID.json"
node "$AMEND_DIR/verify.js" cross-artifact --rfc="$PKG_RFC" --graph="$PKG_GRAPH" --dirs-tree="$PKG_DIRS_TREE" \
  --src="$PKG_DIR/src" --tickets="$PKG_TICKETS" --session-dir="$AMEND_OUT/verify-session-$PKG_ID" \
  --workspace="$REPO_ROOT" > "$AMEND_OUT/cross-final-2-$PKG_ID.json"
node "$AMEND_DIR/verify.js" converge --first=@"$AMEND_OUT/verify-final-1-$PKG_ID.json" --second=@"$AMEND_OUT/verify-final-2-$PKG_ID.json"
node "$AMEND_DIR/verify.js" converge --first=@"$AMEND_OUT/cross-final-1-$PKG_ID.json" --second=@"$AMEND_OUT/cross-final-2-$PKG_ID.json"
```

Workspace verification checks every `crossPackageImpacts[]` target and reference; its findings enter the same repair loop:

```bash
node "$AMEND_DIR/verify.js" workspace --packages=@"$AMEND_OUT/PACKAGES.json" \
  --impacts=@"$AMEND_OUT/AMENDMENT-REQUEST.json" > "$AMEND_OUT/workspace-1.json"
node "$AMEND_DIR/repair.js" plan --package="$REPO_ROOT" --report=@"$AMEND_OUT/workspace-1.json" \
  --out="$AMEND_OUT/repair-workspace-1.json"
```

- `IMPACT_TARGET_MISSING` / `IMPACT_REFERENCE_MISSING` -> cross-package finding; repair the request's `crossPackageImpacts[]` or the target design, then rerun the package loop and workspace verify.
- A workspace finding is loop input, never terminal.
- Complete only when the workspace worklist is empty and two fresh workspace runs converge:

```bash
node "$AMEND_DIR/verify.js" workspace --packages=@"$AMEND_OUT/PACKAGES.json" \
  --impacts=@"$AMEND_OUT/AMENDMENT-REQUEST.json" > "$AMEND_OUT/workspace-2.json"
node "$AMEND_DIR/repair.js" plan --package="$REPO_ROOT" --report=@"$AMEND_OUT/workspace-2.json" \
  --out="$AMEND_OUT/repair-workspace-2.json"
node "$AMEND_DIR/repair.js" progress --previous=@"$AMEND_OUT/repair-workspace-1.json" \
  --current=@"$AMEND_OUT/repair-workspace-2.json"
node "$AMEND_DIR/verify.js" converge --first=@"$AMEND_OUT/workspace-1.json" --second=@"$AMEND_OUT/workspace-2.json"
```

- Any finding is loop input, never terminal. Classify, repair, and rerun; no COMPLETE while a key persists.
- `CONVERGENCE_FAILED` means the two runs disagree; do not report completion.

### Step 7 Idempotency

Before apply, compute the amendment digest and decide replay:

```bash
node "$AMEND_DIR/idempotency.js" decide --package="$PACKAGE_DIR" --material-digest="$MATERIAL_DIGEST" \
  --instruction-digest="$INSTRUCTION_DIGEST" --changes=@"$AMEND_OUT/CHANGES.json"
```

- `NO_CHANGE` -> the same material and instruction already applied; write no artifact.
- `apply` -> proceed; after success, record the returned digest:

```bash
node "$AMEND_DIR/idempotency.js" record --package="$PACKAGE_DIR" --digest="<decide digest>" \
  --ticket-key="$TICKET_KEY" --packages=@"$AMEND_OUT/PACKAGES.json"
```

- The ledger is append-only and never duplicates a digest.

### Step 8 Report

Assemble the report from the request, dispatch, owner receipts, rule coverage, obligation coverage, surface coverage, impacts, and verify outputs.

```bash
node "$AMEND_DIR/report.js" write --package="$PACKAGE_DIR" --report=@"$AMEND_OUT/report-input.json"
```

- JSON is complete; Markdown is the package × artifact matrix, capped with an explicit omitted count.
- `packages[]` records every package's ticket, artifact statuses, law verification, and owner receipts.
- `rule_coverage` records covered, not_applicable, and uncovered counts.
- `obligation_coverage` records total, covered, not_applicable, judged, and uncovered counts.
- `surface_coverage` records every named surface.
- `crossPackageImpacts` records every verified impact.
- `assertNoFalseComplete` refuses COMPLETE on findings, unverifiable items, uncovered rules, undispositioned obligations,
  uncovered surfaces, unverified impacts or receipts, a blocked artifact, or a non-machine-verified law.
- Terminal states: `DESIGN_AMENDED`, `NO_CHANGE`, `BLOCKED`.

## Safety Invariants

1. Public argument is material only. Thin flags are refused.
2. The free instruction is derived, not a command argument.
3. A `*-law` skill is used only after the canonical verifier reports `machine_verified` for every check.
4. `design-amendment.js` is the only RFC/SPEC writer. Owners write GRAPH/Dirs-Tree/Tickets. The command writes no artifact.
5. RFC/SPEC amendments are append-only under `## Design Amendments`; existing lines are never edited.
6. Every change is ticket-scoped and leaves a ledger or a verified owner receipt.
7. Dry-run precedes apply; a finding blocks apply.
8. Failure restores bytes or reports `REDERIVE_PENDING`; no partial silent write.
9. Design consistency and law evidence are separate. `not_run` and `unverifiable` are never pass.
10. No COMPLETE before package and workspace convergence, total rule coverage, total surface coverage, and verified receipts.
11. A design finding is repair-loop input, never terminal. `BLOCKED` means an external blocker only.
12. Every repair is measured: a repair that introduces a new finding is rolled back; a repair that resolves nothing escalates.
13. Every semantic obligation is dispositioned. The inventory is an attempt at completeness, never a claim that semantic completeness is proved.

## Terminal States

| State | Meaning |
|---|---|
| `DESIGN_AMENDED` | every change applied, owners rederived, rule/surface/impact coverage total, verification converged twice |
| `NO_CHANGE` | every instruction clause is a no-op or the exact amendment digest already applied |
| `BLOCKED` | an external blocker (material, canon, unwritable artifact, tool crash) stopped the run; a design finding never selects it; no false COMPLETE |
