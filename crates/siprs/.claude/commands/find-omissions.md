---
description: Inspect reviewed tickets for contract-to-test gaps and record omissions.
argument-hint: </path/to/*-GRAPH.json>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /find-omissions

Role: inspect every reviewed ticket — verify its contracts are fully and accurately translated into test code. gaps → record as structured omission tickets for the next implementation loop.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Pre-flight — argument + consolidation prerequisite validation (mandatory)

Gate:
```bash
node .claude/scripts/tickets/validate-graph-arg.js "$ARGUMENTS" || exit 2
node .claude/scripts/tickets/require-consolidated-manifest.js || exit 2
```
`require-consolidated-manifest.js`:
- exit0 — `./manifests/CONSOLIDATED-MANIFEST-*.json` exists, **or** stub scan finds 0 stubs (0-stub tree legitimately has no manifest). 0-stub case: prints PASS on stdout instructing **SKIP Step 1**, proceed to **Step 2**.
- exit2 — stubs exist without a manifest (cause/action message printed) → stop; consolidation prerequisite unmet.

## Overview

flow: Step 1 re-ticketize (auto; never ask) → inspection loop: `get-next-check-target-ticket.js` → inspect → on gap: `add-omission-ticket.js` appends to `_tmp-omissions-*.json` → repeat.

## How the Script Works

Each `get-next-check-target-ticket.js` run:
1. auto-creates `_tmp-omissions-<ts>.json` (holds recorded omissions) and `_tmp-check-target-tickets-cmds-<ts>.json` (queue of reviewed/remanded tickets) if missing.
2. pops next unchecked ticket: marks `done:true` (persisted), sets ticket `status:"remanded"` in Tickets.json (`[!]` symbol shows in `list-phases-and-tickets.js`).
3. displays: `Total N tickets to inspect. Inspecting ticket M/N.` + full `show-ticket-context.js --for-spec --no-implementation-order` output.
4. exits; waits for AI to analyze and act.

## ABC Inspection Criteria

invariant: evaluate all 3 for EVERY ticket via actual source code — never rely solely on `show-ticket-context.js` output (may be stale).

### Criterion A — Contract Translation

Question: are all contracts (Precondition/Postcondition/Invariant) accurately translated into test code?
check per `Contracts` entry — Precondition: test sets up exact input condition? Postcondition: test asserts exact output/state? Invariant: test/assertion verifies it holds?

Pass example: Contract says "Precondition: input is a valid email" → test has `let input = "user@example.com";`
Fail example: Contract says "Postcondition: returns Ok with user object" → test only checks `result.is_ok()`, never the user object fields.

### Criterion B — Violation Detection

Question: would every contract violation be caught by an existing test assertion?
check: precondition-check removed → caught? postcondition violated → assertion fails? invariant broken → detected?

Pass example: removing input validation → invalid-input test would fail.
Fail example: contract says "must not overflow" but the only test uses values far below the boundary.

### Criterion C — Test Precision

Question: are tests precise/unambiguous, or loose/sloppy?
check for: too-broad assertions (`assert!(result.is_ok())` when field checks are needed) / missing negative tests (happy-path only) / stale or commented-out tests / circular reasoning (test uses the logic being tested) / low-coverage masking (`unwrap()` without error context, unjustified `#[allow(...)]`).

## Step-by-Step Inspection Procedure

### Step 1 — Re-ticketize the consolidated units (mandatory)

invariant: the consolidation Step 5 gate (`consolidate-stubs-gate.sh`) already guarantees a clean marker tree (no orphan keys, no terminal excuses, every marker re-pointed, a complete grouped-unit manifest emitted). Step 1 consumes that manifest via `batch-create-resolving-tickets.js` — one resolving ticket per (sourceKey, unit) group, atomic on-disk marker-key rewrite. auto; never ask the human — this is the AI's work item per the no-external-excuse rule.

cwd = Tickets.json root (source root).
```bash
MANIFEST=$(ls -t manifests/CONSOLIDATED-MANIFEST-*.json | head -1)
cat "$MANIFEST" | node .claude/scripts/tickets/batch-create-resolving-tickets.js --no-write   # review (zero side effects)
cat "$MANIFEST" | node .claude/scripts/tickets/batch-create-resolving-tickets.js               # commit
```
out: review (`--no-write`) prints `{ createdTickets, skipped, rewrittenMarkers, dryRun: true }`; commit prints the same with `dryRun: false` — Tickets.json gains one `todo` ticket per non-skipped entry, on-disk marker lines re-point to the new key (C007-skipped markers, already referencing an active ticket, untouched).
invariant: re-run-safe (already-active-referencing markers skipped, never duplicates). on failure: nothing written; stderr lists each failure (file:line + Action-directive) — fix and re-run.

**Manifest handoff**: consolidation Step 5 wrote `./manifests/CONSOLIDATED-MANIFEST-<ts>.json` — one `{ sourceKey, stubs: [{ file, line, content }] }` entry per unit, `file` cwd-relative.

```json
[{ "sourceKey": "P4-2", "stubs": [{ "file": "src/a.rs", "line": 4, "content": "// [::STUB::] P4-2: reason -- Implement" }] }]
```
pipe: `MANIFEST=$(ls -t manifests/CONSOLIDATED-MANIFEST-*.json | head -1) && cat "$MANIFEST" | node .claude/scripts/tickets/batch-create-resolving-tickets.js --no-write` — one ticket per (sourceKey, unit) group.

Post-creation content rewrite (mandatory): each new resolving ticket is a deep-clone carrying the SOURCE's OLD content.
```
Batch-write ticket (post-creation rewrite):
  order: title → background → scope → acceptanceCriteria → invariants → testUnit → testIntegration → testExceptions → contracts → investigation → boyScoutPlan → instrumentation → notes
  max-per-call: 3
  preserve (append-only, never overwrite): nodeIds, relatedTicketIds, referenceSection, referenceUrls, sourcePaths, rfcDiscrepancies
```

Residual safety net (after commit) — sweep markers the consolidation didn't cover (added after consolidate, or left UNASSIGNED):
```bash
node .claude/scripts/tickets/preflight-stub-cleanup.js
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```
- exit0 → Step 2.
- exit1 → judge: parse each `[validate-no-external-excuses] FAIL <file>:<line> -- <check> -- Action:` line; fix marker (remove/rewrite plan/rewrite key); re-run. loop until exit0. round with no progress = hard-stop diagnostic.

judge: why a completed-key marker can fail here — this validator runs in normal mode (`--fail-on-excuse`), where Check C rejects a marker referencing a **completed** ticket, unlike the consolidation gate (which accepts completed keys via `--for-consolidate`). this safety net catches completed-key leftovers (`UNASSIGNED`, or added post-apply); `preflight-stub-cleanup.js` classifies and prints the `remove-stub.js`/`create-resolving-ticket.js` fix commands.

invariant: every stdout/stderr line from these scripts is English, self-contained, Action-directive — a fresh session must be able to act on the message alone.

### Step 2 — Run the script

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js
```
out:
```
Total 133 tickets to inspect. Inspecting ticket 4/133.

# Target ticket is P0-4: Error Design — ...
...
```

### Step 3 — Understand the ticket

Read carefully; extract:

| Section | What to look for |
|---------|-----------------|
| `## Contracts` | exact Precondition/Postcondition/Invariant to verify |
| `## Acceptance Criteria` | behavior supposed to be implemented |
| `## Test Plan` | planned tests (testUnit/testIntegration/testExceptions) |
| `## Scope` | modules/files in scope |
| `### Implementation Target File Paths` | concrete file paths (under Scope, `default_files`) — start here, never be bound by them |
| `## Investigation` | evidence from original investigation |
| `## Invariants` | conditions the system must always satisfy |
| `## Notes` | known risks, caveats, open items |

### Step 4 — Analyze source code (core of the pipeline)

invariant: this is the most critical step — pipeline quality depends on its rigor. superficial analysis → sloppy omissions → implementation loop diverges.

Start from `Implementation Target File Paths` as entry points only — never be bound by them; follow the trail:
1. read every listed implementation file
2. for each Contracts-referenced function, trace its full call chain
3. find the **actual** test files on disk — do not limit to the ticket's test plan; search test modules, integration tests, helper/fixture files
4. read every unread type/trait/module encountered
5. read every helper/fixture a test imports
6. continue until every contract element is traced to its actual code

Rules:
- no speculation — every claim cites a specific file + surrounding code; "I think"/"probably" forbidden
- no assumptions from names — `validate_email` may not validate anything; read its body
- no trust in comments — comments lie; code is the only truth
- follow the trail — contract check not in the listed files → search the whole crate (parent caller, validation trait, type constraint)
- check test boundaries — a passing test ≠ contract covered; verify inputs exercise the precondition boundary, assertions verify the postcondition, invariant is asserted outside the implementation
- no shortcuts — "looks correct" is not an evaluation; confirm a violation WOULD be caught (Criterion B)

deliverable = verification that each contract is enforced by test code, with source evidence (file + code) — not a summary.

### Step 5 — Evaluate and record (per-contract, per-criterion, immediately)

#### Evaluation procedure (per criterion, not per contract)

For EACH contract, evaluate all 3 criteria (A/B/C).
rule: record only when `passed=false` for any criterion. record the moment confirmed — no batching, no memory-reliance. never record vague unease/style preferences/off-criteria observations.

judge: evaluate one criterion at a time (never bundle criteria into one block).

Step 5a — evaluate one criterion:
```
Example thought process for Criterion B on Contract C001:

  Contract says "input must be non-empty."
  Code at src/validation.rs:25 has: if input.is_empty() { return Err(...) }
  Test at tests/validation.rs:44 tests with input = "John Doe" (valid, 8 chars)
  No test anywhere passes input = "".
  If line 25 were removed, no test would fail.
  → PASSED = false
```

Step 5b — if `passed=false`, record immediately:
```bash
echo '[{"evaluations":[{
  "criterion": "B",
  "passed": false,
  "reason": "Contract C001 precondition: input must be non-empty. Code check exists at src/validation.rs:25 but no test exercises empty input. If the check were removed, no test would fail.",
  "evidence": [
    {"file": "src/validation.rs", "line": 25},
    {"file": "tests/validation.rs", "line": 44}
  ]
}]}]' | node .claude/scripts/tickets/add-omission-ticket.js \
  --ticket-key=P0-4
```

Step 5c — continue with the next criterion:
```
Criterion C on same contract:
  Same test at tests/validation.rs:52 uses assert_eq!(result, Err(ValidationError::EmptyInput)).
  This is precise — checks the exact error variant, not just is_err().
  → PASSED = true  (no recording needed)
```

Rules per criterion:
- `passed` must be boolean. `true`=no issue, `false`=omission.
- `reason` cites specific file+code evidence — "the code looks correct" forbidden.
- `evidence` = array of `{file: string, line: number}` — no free text, no snippets.
- `passed=false` → `reason` explains what is missing and what should exist, self-contained.
- do NOT construct one JSON with multiple evaluations unless discovered simultaneously and sharing `severity`/`recommendation`. when in doubt, separate calls.

### Step 6 — Record an omission (execute the moment a gap is found)

The moment a `passed=false` is confirmed, construct the `foundOmissions` entry and pipe it.

#### Example: first omission found for contract C001, criterion B
```bash
echo '[{
  "evaluations": [{
    "criterion": "B",
    "passed": false,
    "reason": "No test passes an empty string to verify the non-empty precondition. The check exists at src/validation.rs:25 but no test would catch its removal. A test with input=\"\" should assert Err(ValidationError::EmptyInput).",
    "evidence": [
      {"file": "src/validation.rs", "line": 25},
      {"file": "tests/validation.rs", "line": 44},
      {"file": "tests/validation.rs", "line": 60}
    ]
  }]
}]' | node .claude/scripts/tickets/add-omission-ticket.js \
  --ticket-key=P0-4
```

#### Multiple evaluations in one call (for multiple criteria on the same contract)
```bash
echo '[{
  "severity": "critical",
  "recommendation": "Add boundary tests for empty input, max-length input, and verify exact error assertions",
  "evaluations": [
    {
      "criterion": "A",
      "passed": false,
      "reason": "Precondition 'input must be non-empty' is checked in code (src/validation.rs:25) but no test exercises an empty string. The precondition boundary is not tested at all.",
      "evidence": [
        {"file": "src/validation.rs", "line": 25},
        {"file": "tests/validation.rs", "line": 44}
      ]
    },
    {
      "criterion": "B",
      "passed": false,
      "reason": "If the empty-string check at src/validation.rs:25 were removed, no existing test would fail. All tests pass valid inputs only.",
      "evidence": [
        {"file": "src/validation.rs", "line": 25},
        {"file": "tests/validation.rs", "line": 44},
        {"file": "tests/validation.rs", "line": 60}
      ]
    }
  ]
}]' | node .claude/scripts/tickets/add-omission-ticket.js \
  --ticket-key=P0-4
```

Key principles:

| Principle | Why |
|-----------|-----|
| record the moment you find it | analysis context is fresh; delay risks losing detail. script dedups via `originalTicketKey` |
| one finding = one `evaluations[]` entry | each evaluation = one criterion on one contract |
| `passed=false` is an omission | merge pipeline uses this to pick tickets needing re-implementation |
| `evidence[]` must be exhaustive | list every file:line inspected — the next implementer retraces your steps |
| `reason` must be self-contained | must make sense without reading the original ticket |
| `severity` optional but helpful | `"critical"`=missing entire contract coverage, `"major"`=partial, `"minor"`=imprecise assertions |

### Step 7 — Repeat

re-run Step 2 until: `All tickets inspected.`

### Step 8 — Clean up

```bash
node .claude/scripts/tickets/get-next-check-target-ticket.js --with-clean-trash
```
removes both `_tmp-omissions-*.json` and `_tmp-check-target-tickets-cmds-*.json`. before deleting, copies `_tmp-omissions-*.json` to `OMISSIONS-<ts>.json` — the deliverable of this command.

# Step 9 — Merge into Tickets.json

```bash
node .claude/scripts/rfc-graph/phasify-omissions.js --graph="$ARGUMENTS"
```
computes optimal phase/ticket boundaries from Steps 2–7's omissions, merges mechanically into Tickets.json. mechanical merge → generic phase names (P6, P7, ...); stdout lists each phase's node titles/ticket info + the exact `rename-phases.js` commands (follow in Step 10).
invariant: built-in STUB key rewrite — cloned ticket's `stubs[]` referencing an OLD key gets every marker key rewritten to the clone's new key (`P{newPhase}-{newId}`), relative to the current directory (the Tickets.json root).
gate: merge REJECTED (exit≠0) if any stub still carries a terminal excuse → back to Step 1, clear all excuses, re-run.

# Step 10 — Rename phases

Run the `rename-phases.js` commands from Step 9's stdout. each re-implementation phase name **must** start with `"Omissions: "`.
```bash
node .claude/scripts/tickets/rename-phases.js --phase=6 --name="Omissions: Storage & Connection Layer"
node .claude/scripts/tickets/rename-phases.js --phase=7 --name="Omissions: Migration Runner"
```

# Step 11 — Clean up transient consolidation artifacts (full success only)

After ALL prior steps pass (tickets created, markers rewritten, omissions merged and renamed):
```bash
node .claude/scripts/tickets/clean-consolidation-artifacts.js
```
removes `manifests/CONSOLIDATED-MANIFEST-*.json` and `manifests/ROLLBACK-*.json`, and `manifests/` itself iff empty. idempotent (exit0 when nothing to remove).
rationale: the rollback backup exists only to undo a *wrong* consolidation; once the manifest is consumed and tickets created, restoring it would desync markers from created tickets — remove both together. re-running requires a fresh consolidation.

## Reverse rotation only — the return path from an omission to its uncertainty
**Rotation gate** — this section runs only when `return-refs-reverse-mode` holds. `return-refs.js` is invoked with `--mode=reverse`; without the flag the artefact is returned itself and no return reference is written, so this section cannot fire in a forward run.

Mode: forward | reverse
  detect: `return-refs-reverse-mode` holds / `--mode=reverse` passed. without it, this section cannot fire — the artefact returns itself, no return reference written.

forward: an omission recorded during forward rotation carries exactly the fields it carried before this section existed (no change).

reverse: an omission names the uncertainty it descends from — the claims it affects, the residuals that produced it (not "not enough tests").
1. judge: resolve `affected_claim_ids` against `CLAIM-LEDGER.json` and `origin_residual_ids` against `RESIDUAL-REGISTRY.json`. prohibition: an unresolvable reference is reported, never written — a pointer to nothing reads as a chain that exists, which is worse than no pointer.
```bash
node .claude/scripts/tickets/lib/return-refs.js \
  --kind=omission \
  --claim-ledger="<path to CLAIM-LEDGER.json>" \
  --residual-registry="<path to RESIDUAL-REGISTRY.json>" \
  < "<the omission as the analysis recorded it>.json"
```
2. out: the omission returns carrying only the references that resolved, plus a finding for each that did not.
3. pass only the resolved omission to Step 6's `add-omission-ticket.js`. prohibition: unresolved findings are reported to the human in plain English, in the order found — never silently dropped, never turned into an invented field value.
4. an omission with no originating uncertainty carries no new fields and remains valid — an empty `affected_claim_ids` would be a *different, false* claim (a chain followed and found empty), not the same as omitting the field.

exit: `return-refs.js` exits 0 regardless of resolution — the report is the output, the judgment is the human's (out, not ask;stop — processing continues without waiting). pass the printed artefact, not the input, to Step 6.

Invariants:
- forward output byte-identical to its pre-change form — no required field added; a consumer unaware of `affected_claim_ids`/`origin_residual_ids` continues to work unchanged
- P22-1 regression gate's command-file digest runs before and after every edit to this file
