---
description: Resolves warnings, errors, stubs, and crimes under a directory.
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /resolve-ticket

**First-Class Rule — [::STUB::]**: every incomplete implementation (stub/mock/placeholder/temp-impl, any name) carries a marker, no exception. violation = crime in Malfeasance.json.
cmd: read Malfeasance.json every phase of this command; verify zero unresolved crimes.
fail → resolve immediately, or add marker + record on the spot.

invariant [No-External-Excuse, absolute]: no "external" and no "awaiting approval" — every blocker is an AI-executable work item.
enforced at: creation (`insert-stub.js` rejects terminal-excuse plans) / preflight (Step 4) / convergence (Step 9c validator).
never abort on failure — loop validate → fix → revalidate until zero excuses remain.

Role: batch resolution of warnings, errors, stubs, and crimes under a directory.

prohibition (absolute): this command must NEVER change the status of any ticket in Tickets.json. must NOT call `update-ticket.js` or execute `echo '{"status":...}'`.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## In

- arg (optional): `P{phaseID}-{ticketID}` (e.g. `P0-1`, `PX-53`) → present: enables Step 9a (enumerate) + Step 9b (validate) against this ticket. absent: skip 9a/9b, default mode (Steps 1–10 minus enumerate/validate) — backward compatible.
- numeric-only / other (non-empty, non-matching) → stop (error).

## Scripts (`.claude/scripts/tickets/`)

| Script | Arguments | Used in |
|--------|-----------|---------|
| `review/find-all-stubs.js` | `<directory>` | list all stubs |
| `preflight-stub-cleanup.js` | (run from Tickets.json dir) | Step 4; 4-class STUB classification |
| `validate-no-external-excuses.js` | `[--fail-on-excuse]` | Steps 4/9c/10; no-excuse validator |
| `scan-crimes.sh` | `[directory]` (scopes output when given) | crime scan |
| `malfeasance-create.js` | `<file> <line> <description> [note]` | record new crime |
| `malfeasance-update.js` | `<id> <key> <val>` | update crime record (resolve, etc.) |
| `review/run-quality-checks.js` | `<files...>` | static quality check |
| `review/generate-report.js` | stdin | report generation |
| `create-deferral-ticket.js` | `--source-key=<KEY> [--deferred-to=<KEY>]` (stdin: ticket JSON) | Step 9 escape hatch; deep-clones source, appends non-PX max-phase todo |

## Workflow

### Step 1
G1 capture: judge Makefile has `check`-family target → prefer `make`; else language-appropriate tool (`cargo check`, `go build`, `tsc --noEmit`, `npm run build`, etc.), suitable flags as needed.
judge Makefile has `test` target → prefer `make test`; else language-appropriate runner (`cargo test`, `go test`, `npm test`, `pytest`, etc.).
```bash
(cd "$(git rev-parse --show-toplevel)" && make check-be)
cargo check --all-targets 2>&1
```
out: all captured warnings/errors → Step 2.

### Step 2
Heal-loop resolve (hard gate: no proceed until zero unresolved):
1. immediately resolvable → fix code, eliminate warning/error
2. defer to subsequent ticket → `insert-stub.js --resolve-by-ticket=<EXISTING_TICKET_KEY>` (must pre-exist in Tickets.json) + suppress via `#[allow(...)]`; never hand-type ticket ID in source
```bash
# insert-stub.js: Insert [::STUB::] marker with resolve-by-ticket validation
#   --resolve-by-ticket:   Ticket key that WILL resolve this stub (e.g. P0-1).
#                          MUST already exist in Tickets.json.
#                          MUST have effective status 'todo' (missing status = 'todo').
#                          MUST NOT be a PX-{id} ticket.
#   --stub-reason:         Why this code is left as a stub — be specific.
#                          Must be a single line (no newlines).
#                          BAD:  "Dependency not ready"
#                          GOOD: "P1-3 blocked: User::role changed to enum, login(&str) signature incompatible"
#   --resolve-plan:        What the resolving ticket must concretely implement.
#                          Must be a single line (no newlines).
#                          BAD:  "Implement the actual logic"
#                          GOOD: "Replace Ok(()) with INSERT INTO sessions (user_id, token) VALUES (?, ?); add integration test"
#   --file:                Target source file path
#   --line:                1-indexed line number to insert at
#   --tickets-path:        Path to Tickets.json
node .claude/scripts/tickets/insert-stub.js \
  --file=src/example.rs --line=5 --resolve-by-ticket=P3-2 \
  --stub-reason="P1-3 blocked: User::role changed to enum, login(&str) signature incompatible" \
  --resolve-plan="Replace Ok(()) with INSERT INTO sessions (user_id, token) VALUES (?, ?); add integration test" \
  --tickets-path=Tickets.json
```
retry: exit≠0 → read error (problem/blocking-reason/redo-instruction); fix args; re-run. never abort on this failure.
no-excuse rejection: `insert-stub.js` rejects `--resolve-plan` that is a terminal excuse ("requires external ...", "awaiting approval ...") without an imperative work item → rewrite as AI-executable item (e.g. "Vendor and build PJSIP in build.rs"); re-run.
3. consistency check: no suppression without `[::STUB::]`; no `[::STUB::]` without suppression.
gate: do not proceed to Step 3 until all warnings/errors resolved.

### Step 3
cmd: `node .claude/scripts/tickets/review/find-all-stubs.js "."` (directory-scoped)
judge: each stub's `[::STUB::]` marker specifies a ticket ID?

### Step 4
cmd (preflight): `node .claude/scripts/tickets/preflight-stub-cleanup.js`

Criteria (4-class, act on each):
| class | meaning | action |
|---|---|---|
| `resolvedCandidates` | key references a COMPLETED ticket (reviewed/done/R<round>) | verify defect resolved in code, then `remove-stub.js --file=<path> --line=<N>` |
| `pendingObligations` | key references an ACTIVE ticket (todo/in_progress/planned/remanded) | legitimate pending — leave for phasify key rewrite |
| `orphans` | no key (MUST RESOLVE) or key references non-existent ticket | create resolving ticket + rewrite marker key, or remove if dead |
| `excuses` | terminal-excuse language, no work item | convert resolution plan to AI-executable work item, or remove |

Heal-loop preflight (hard-stop diagnostic on no-progress round):
check: `node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse`
- exit0 → Step 5
- exit1 → judge: parse each `[validate-no-external-excuses] FAIL <file>:<line> -- <check> -- Action:` line; fix marker (remove / rewrite plan / rewrite key); re-run. loop until exit0. round with no progress = hard-stop.

### Step 5
judge (per unresolved stub under current directory): resolution-ticket-ID present AND that ticket `done` → unresolved = crime. no ID → defer to Step 6.
cmd: first `insert-stub.js` (add proper marker referencing existing ticket, if missing), then:
```bash
node .claude/scripts/tickets/malfeasance-create.js "<file>" <line> "<description>"
```
invariant: crimes recorded in current directory's Malfeasance.json — verify working directory before executing.

### Step 6
For stubs with no resolution in a subsequent ticket:
1. resolve on the spot if codebase state allows actual implementation
2. else defer: `insert-stub.js --resolve-by-ticket=<EXISTING_TICKET_KEY>`; `--resolve-plan` MUST be AI-executable (script rejects terminal-excuse plans). "Cannot be resolved" / "out of scope" = not acceptable — rewrite as concrete work.
cmd: `remove-stub.js --file=<path> --line=<N>` (or `--lines=<N1,N2,...>` for multiple) on resolved stubs. never edit source directly.

### Step 7
cmd: `.claude/scripts/tickets/scan-crimes.sh "."` (directory-scoped)

### Step 8
Heal-loop crimes (absolute: none may remain unresolved/deferred/pending):
1. code already implemented → remove marker + `malfeasance-update.js "<id>" "status" "resolved"`
2. no marker → `insert-stub.js` (add marker, never edit source directly) + status=resolved
3. truly unresolvable only → status=`false_positive` + reason in `note` (terminal excuse ≠ valid reason)
```bash
node .claude/scripts/tickets/malfeasance-update.js "<id>" "status" "resolved"
.claude/scripts/tickets/scan-crimes.sh "."
```
gate: do not declare command complete until all crimes confirmed resolved.

### Step 9 (mandatory)
Step 9a (enumerate) + Step 9b (validate) — run only if `$ARGUMENTS` non-empty:
```bash
if [ -n "$ARGUMENTS" ]; then
  node .claude/scripts/tickets/enumerate-ticket-targets.js \
    --dir=. --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
fi
if [ -n "$ARGUMENTS" ]; then
  node .claude/scripts/tickets/validate-ticket-targets.js \
    --ticket-key="$ARGUMENTS" --tickets="Tickets.json"
fi
```
absent `$ARGUMENTS` → skip directly to Step 9c (default-mode backward compatibility).

Step 9c (unconditional):
```bash
node .claude/scripts/tickets/review/find-all-stubs.js .
.claude/scripts/tickets/scan-crimes.sh
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```

Deferral policy: forbidden by default — resolve every blocker on the spot. permitted only as an extremely exceptional measure when continuing poses a clear, demonstrated danger (e.g. unrecoverable state corruption, pipeline-wide deadlock with no safe recovery). every deferral is later human-audited; a deferral judged as shirking (avoidable postponement) incurs penalty. when in doubt, resolve — do not defer.

Escape hatch (no-excuse conditional deferral; use only when the Deferral policy's clear-danger condition is met AND `$ARGUMENTS` is set):
1. convert the blocker into an AI-executable work item (Check B) — new ticket's scope must contain the internal implementation work (e.g. "Vendor and build PJSIP in build.rs", "Add cpal as an optional dependency"). terminal-excuse language ("blocked on external dependency", "awaiting another team") is FORBIDDEN as justification — every blocker is internal AI work.
2. create the deferral ticket via `create-deferral-ticket.js` (routes through shared creation core `generic-ticket-creation.js`/PX-2: `createDeferralTicket` → `createTickets` with a `deferral` seed; deep-clones the resolved ticket (`$ARGUMENTS`) via `createTicketFromSource`; appends a non-PX ticket in the max phase, status `todo`; sets the targetStub's `deferredTo` to the new key). `insert-stub.js` rejects `PX-*` and non-todo resolve targets — a PX or past-phase ticket can never receive the deferred STUB. seed shape: `{ type: "deferral", sourceKey: <resolved ticket>, seed: { title, scope, background }, stubId: <targetStub id> }`.
```bash
echo '{"title":"Vendor and build PJSIP in build.rs","scope":["build.rs","wrapper.h"],"background":"Blocked on FFI linkage; needs a dedicated implementation ticket"}' \
  | node .claude/scripts/tickets/create-deferral-ticket.js \
      --source-key="$ARGUMENTS" --stub-id="TS-1"
```
   on success: stdout prints `## Created: <new key>`; STUB's `deferredTo` already set when `--stub-id` passed — verify if omitted. new ticket carries SOURCE's OLD content — rewrite via batch-write below.
   on failure: exits non-zero, writes nothing (atomic all-or-nothing, C002) — read stderr, fix argument, re-run.
```
Batch-write ticket (post-deferral rewrite):
  order: title → background → scope → acceptanceCriteria → invariants → testUnit → testIntegration → testExceptions → contracts → investigation → boyScoutPlan → instrumentation → notes
  max-per-call: 3
  preserve (append-only, never overwrite): nodeIds, relatedTicketIds, referenceSection, referenceUrls, sourcePaths, rfcDiscrepancies
```
3. rewrite the marker key to the new ticket.
4. re-run Step 9a/9b (with `$ARGUMENTS` set) + Step 9c validator — Check C (active key) must pass.
5. record deferred STUBs + new ticket keys in the implementation summary.

Convergence loop: Step 9b or 9c reports issues → resolve, re-run the Gate. loop until stub count, crime count, AND excuse count are all zero before Step 10. `$ARGUMENTS` empty → loop runs Step 9c only. never abort on failure — each round fixes (remove/rewrite plan/rewrite key) and revalidates. round with no progress = hard-stop diagnostic.

### Step 10
G-final: re-run compilation + tests (Step 1 fallback rule) + no-excuse validator must exit0:
```bash
(cd "$(git rev-parse --show-toplevel)" && make check-be)
(cd "$(git rev-parse --show-toplevel)" && make test)
node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse
```
pass (compile+test clean AND validator exit0) → out: summary of resolved items → report to user.

## Done
- zero unresolved warnings/errors (Step 1/2/10)
- zero unclassified/unresolved `[::STUB::]` under directory
- zero unresolved crimes in Malfeasance.json (directory-scoped)
- zero excuses (`validate-no-external-excuses.js` exit0)
- if `$ARGUMENTS` set: Check C (active key) passed; any deferral tickets fully rewritten (no stale SOURCE content)
- no ticket status changed by this command
