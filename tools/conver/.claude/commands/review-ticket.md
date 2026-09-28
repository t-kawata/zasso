---
description: Executes quality review of completed tickets.
argument-hint: <P{phaseID}-{ticketID}>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /review-ticket

**First-Class Rule — [::STUB::]**: every incomplete implementation (stub/mock/placeholder/temp-impl, any name) carries a marker, no exception. violation = crime in Malfeasance.json.
cmd: read Malfeasance.json every phase of this command; verify zero unresolved crimes.
fail → resolve immediately, or add marker + record on the spot.

Role: quality verification of `done` tickets.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Position in the Workflow

make → plan → start → **review** (this command)
- make-ticket: produces implementation spec doc
- plan-ticket: produces implementation-level plan
- start-ticket: produces implementation; sets ticket status "done"
- review-ticket: verifies "done" tickets

## In

- arg: `P{phaseID}-{ticketID}` (e.g. `P0-1`, `PX-53`) → ticket key → `show-ticket-context.js --ticket-key`
- missing / numeric-only / other → stop (error)

## Criteria — Boy Scout Rule (advisory, detect via grep, all noun-phrase fail patterns)

| id | check | fail pattern |
|---|---|---|
| A | improvement evidence in existing code | no error-propagation fix / no constant extraction / no function split |
| B | function naming | non-verb-phrase function name |
| C | variable naming | new single-char or generic var name |
| D | numeric literals | hardcoded magic number |
| E | debug output | leftover debug print |
| F | comment quality | what-comment instead of why-comment |

judge: evaluate against source, not cached summaries.

## Scripts (`.claude/scripts/tickets/`)

| Script | Arguments | Used in |
|--------|-----------|---------|
| `show-ticket-context.js` | `--ticket-key=<key> --for-spec --review` | Step 1; `--review` interrupts on Not Found |
| `update-ticket.js` | `<Tickets.json path> <key>` (stdin: update JSON) | update fields/status; `--append` = retain+append |
| `scan-crimes.sh` | none | Step 3, 4; auto-inits on first run |
| `review/find-all-stubs.js` | `<path>` | Step 3; find all `[::STUB::]` |
| `review/run-quality-checks.js` | `<files...>` | Step 8; static checks |
| `review/generate-report.js` | stdin | Step 8; report gen |
| `annotate-ticket-context-by-git-diff.js` | `--ticket-key=<key> [--verify]` | Step 5; verify annotation on changed files |
| `annotate-ticket-context-by-git-diff.js` | `--ticket-key=<key> --check-ambiguous` | Step 5; exit0 = no `[::AMBIGUOUS::]`, exit1 = unresolved |
| `resolve-ambiguous-markers.js` | `--mode=list-definitions --file=<path> --ticket-key=<key>` | Step 5; read-only, prints diff -U5 + definitions table |
| `resolve-ambiguous-markers.js` | `--mode=inject-at --file=<path> --ticket-key=<key> --definition-line=<N1,N2,...>` | Step 5; inserts `[::TICKET::]` before given line(s), descending order, auto-dedup, removes all `[::AMBIGUOUS::]` |

## Workflow

### Step 0
G0 status: `node .claude/scripts/tickets/check-ticket-status.js --ticket-key="$ARGUMENTS" --phase=review`
- exit0 → G1
- exit1 → stop; out: "Status gate blocked: /review-ticket cannot proceed until the ticket status is 'done'. Run /start-ticket first."

### Step 1
G1 existence: `node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="$ARGUMENTS" --for-spec --review`
- output starts `# {ticketKey}: Not Found` → stop; out: "The ticket does not exist, so /review-ticket is interrupted."
- else → Markdown design info + related-info exploration methods = context → G2

### Step 2 (common, no formal gate)
cmd, per Node-ID in "Related RFC graph NODE-IDs to check":
`node .claude/scripts/rfc-graph/query.js --graph=<GRAPH.json> --source=<RFC-?.md> --dirs-tree=<Dirs-Tree.json> --id=Nxxxx --hops=<N>` (hops: 1=direct edges, 2+=grandchildren+)
judge: AI decides drill depth.
invariant: every claim backed by actual source-code analysis. review without material evidence = hallucination = prohibited.
also, as needed: explore "Related Tickets" listed in Step 1 output, same drill-depth judgment, same evidence invariant.
cmd (supplementary context): `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<key> --for-spec --no-implementation-order`

### Step 3
Heal-loop crime (priority: max, unbounded until clear; skip = prohibited):
check: `.claude/scripts/tickets/scan-crimes.sh` (auto-inits on first run)
open crimes found → resolve before continuing review
judge: follow crime-resolution procedure (role: "Emergency crime resolution" procedure defined for the implementation phase; contract: resolves open Malfeasance.json entries — see start-ticket.md)

also-check: unmarked incomplete implementation in this ticket's code.
found →
1. add marker (do NOT edit source directly):
```bash
# insert-stub.js: Insert [::STUB::] marker with resolve-by-ticket validation
#   --resolve-by-ticket:   Ticket key that WILL resolve this stub (e.g. P0-1).
#                          MUST already exist in Tickets.json.
#                          MUST have effective status 'todo' (missing status = 'todo').
#                          MUST NOT be a PX-{id} ticket.
#   --ticket-key:          REQUIRED current ticket key ($ARGUMENTS). Omitting it is
#                          forbidden in this command — --resolve-by-ticket must not
#                          be earlier than it.
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
  --tickets-path=Tickets.json \
  --ticket-key="$ARGUMENTS"
```
retry: exit≠0 → read error (problem/blocking-reason/redo-instruction); fix args; re-run. never abort this command on this failure.
2. record crime via `malfeasance-create.js`
3. resolve (complete implementation or add marker)

### Step 4
cmd: `node .claude/scripts/tickets/review/find-all-stubs.js .`
G no-excuse: `node .claude/scripts/tickets/validate-no-external-excuses.js --fail-on-excuse`
exit≠0 → report failures; return ticket for re-implementation

Criteria (stub classification, exactly one applies per stub):
| id | class | action |
|---|---|---|
| 1 | resolvable (deps done) | auto; never ask — implement on the spot; `node .claude/scripts/tickets/remove-stub.js --file=<path> --line=<N>` |
| 2 | needs a new ticket | auto; never ask — decide/act per non-interactive mandate; out: recommendation recorded in final report (not a live approval-wait) |
| 3 | correctly deferred | auto; never ask; out: reason + resolution-ticket-ID in final report |

unmarked stub found → `insert-stub.js` (add marker, do NOT edit source directly) + record crime via `malfeasance-create.js` → classify per table above
out: stub evaluation results → review report

### Step 5 (mandatory, no skip)
cmd: `git diff --name-only "$(git merge-base HEAD origin/master)"`
cmd: `git diff "$(git merge-base HEAD origin/master)"`

Criteria (8, exhaustive scan of changed code; all must be `[::STUB::]`-marked or clean):
| id | pattern | check |
|---|---|---|
| 1 | `todo!()` / `unimplemented!()` / `panic!()` | has `[::STUB::]`? |
| 2 | empty function body | left as placeholder? |
| 3 | `return Ok(())` / `return None` | error handling incomplete? |
| 4 | commented-out code | debris left behind? |
| 5 | `TODO`/`FIXME`/`HACK`/`XXX` | has `[::STUB::]`? |
| 6 | mock/fake object | has `[::STUB::]`? |
| 7 | `#[allow(...)]` | suppression reason has `[::STUB::]`? |
| 8 | ticket-key provenance annotation | every changed source file annotated? |

G-annotate: `node .claude/scripts/tickets/annotate-ticket-context-by-git-diff.js --ticket-key="$ARGUMENTS" --verify`
- file lacks annotation → defect (implementer skipped start-ticket.md's annotation step) → out: review finding + request re-run
- all changed files non-source → script reports no source files → ok, no action
- file has `[::AMBIGUOUS::]` → Heal-loop ambiguous below, then re-verify

Heal-loop ambiguous (hard gate: zero remaining before Step 6):
check: `node .claude/scripts/tickets/annotate-ticket-context-by-git-diff.js --ticket-key="$ARGUMENTS" --check-ambiguous`
- exit0 → next
- exit1 → for each reported file:
  phase1 (read-only): `node .claude/scripts/tickets/resolve-ambiguous-markers.js --mode=list-definitions --file="<file-path>" --ticket-key="$ARGUMENTS"`
  judge: read JSON (line/name/kind + `[::AMBIGUOUS::]` line); pick correct definition line(s)
  phase2 (write): `node .claude/scripts/tickets/resolve-ambiguous-markers.js --mode=inject-at --file="<file-path>" --ticket-key="$ARGUMENTS" --definition-line=<N1,N2,...>`
  invariant: annotation format always via `buildAnnotation()`; never hand-typed. multi-line comma-separated (e.g. `5,14`); descending-order insert; auto-dedup.
  re-run check
rule: reaching Step 6 with unresolved `[::AMBIGUOUS::]` = defect

incomplete implementation found (criteria 1–7) →
1. no `[::STUB::]` → add marker on the spot
2. record crime: `node .claude/scripts/tickets/malfeasance-create.js "<file>" <line> "<description>"`
3. resolve immediately; unresolvable → set `false_positive` + reason in `note`
then: re-run `.claude/scripts/tickets/scan-crimes.sh` → verify reflected in Malfeasance.json

### Step 6
Heal-loop build:
judge: working dir per change-scope; if `cd` needed, use subshell `(cd <dir> && <cmd>)`
judge: Makefile has `check` target → prefer `make`; else `cargo check`
judge: Makefile has `test` target → prefer `make test`; else `cargo test`; scope = impact range of changes
```bash
(cd "$(git rev-parse --show-toplevel)" && make check-be)
(cd crates/voiput && cargo check --all-targets)
```
checks: compile, then Step-1 Test Plan coverage + execution
- fail (compile) → fix before proceeding
- fail (test missing/failing) → fix before proceeding; only spec-declared "exceptions (unit-testable items)" may remain untested

invariant: complete warning/error resolution — zero unresolved from `cargo check`/`cargo test` (or `make`); proceeding with any unresolved item = prohibited; proceeding with any failing test = prohibited.
exception-path: warning/error unavoidable (e.g. deferred to another ticket) → `insert-stub.js --resolve-by-ticket=<EXISTING_TICKET_KEY>` (must pre-exist in Tickets.json) + suppress via `#[allow(...)]`/`#[cfg(test)]`; must not block other tickets' build/test.
insufficient suppression blocking downstream builds/tests → bug.

Heal-loop suppression-consistency (after compile passes):
check: every `#[allow(...)]` site has matching `[::STUB::]` + resolution-ticket-ID at same location
- no-STUB found → `insert-stub.js --resolve-by-ticket=<EXISTING_TICKET_KEY>` (never hand-type ticket ID in source)
- STUB-without-suppression → error present? add `#[allow(...)]` : no error? suppression unneeded (deliberate design stub)
→ re-run compile verification

### Step 7
G6 completeness: judge design (Step 1) + exploration (Step 2) + source vs implementation.
judge: actively search 4 categories — risk, omission, contradiction, deficiency. tenacious, exhaustive.
pass condition (sole, all required): Step-1 design fully satisfied AND all tests pass AND zero errors AND zero warnings → G7
fail → back to relevant earlier step (re-explore/re-implement)

### Step 8
cmd: `node ".claude/scripts/tickets/review/run-quality-checks.js" src/file1.rs src/file2.rs | node ".claude/scripts/tickets/review/generate-report.js"`

### Step 9
cmd: re-execute all grep commands defined by the translatability-check definitions from the plan phase (role: `/plan-ticket`'s grep-pattern set; contract: same patterns, same scope)

### Step 10
Artifacts:
- staging: `specs/$ARGUMENTS.md` (regenerated snapshot; overwritten each run, not itself the record)
- published: Tickets.json fields `instrumentation`, `rfcDiscrepancies`, `notes` (the record)

```bash
echo '{
  "instrumentation": "Static quality check: passed\nTranslatability: no issues\nTests: all xx tests passed",
  "rfcDiscrepancies": [],
  "notes": "Review report:\n- Static quality check: passed\n- Translatability: no issues\n- Dependencies: consistency verified\n- Issues found and fixes applied: ..."
}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS" --append
```
then (re-export spec, final snapshot):
```bash
mkdir -p specs && \
node .claude/scripts/tickets/show-ticket-context.js \
  --ticket-key="$ARGUMENTS" --for-spec > "specs/$ARGUMENTS.md"
```

### Step 10b
G7 contracts: `node .claude/scripts/tickets/verify-final-contracts.js --ticket-key="$ARGUMENTS" --tickets="Tickets.json"`
G7b targets: `node .claude/scripts/tickets/validate-ticket-targets.js --ticket-key="$ARGUMENTS" --tickets="Tickets.json"`

Heal-loop contracts+targets:
either exits 1 → fix reported violations (resolve remaining stubs, update statuses); re-run
both pass → Step 11
rule: loop until both G7 and G7b pass before proceeding

### Step 11
publish:
```bash
echo "{\"status\":\"reviewed\",\"completedAt\":\"$(date +%Y-%m-%d)\"}" | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

### Step 12 (commit only, no push)
stop (absolute, no exception): never `git push` in this step. combined with push = critical pipeline defect.
```bash
git status
git diff --cached --stat
```
judge: craft commit message —
- scope: ticket key (e.g. `P0-1`)
- type: `feat`/`fix`/`refactor`/`test`/`chore`
- subject: core change summary
- body: file-by-file what/why; reference ticket key
```
<type>(<scope>): <imperative subject line>

- <file1>: <what changed and why>
- <file2>: <what changed and why>
...

Ticket: <ticketKey>
```
judge: retrieve ticket title via `show-ticket-context.js`; review via `git diff --stat`/`git diff`; compose per repo commit-convention rules (role: git-workflow conventions; contract: conventional-commit format as templated above — see .claude/rules/common/git-workflow.md)
```bash
node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="$ARGUMENTS" --no-implementation-order 2>/dev/null | head -20
git add -A
git commit -m "<type>(<scope>): <subject line>

<body lines...>

Ticket: $ARGUMENTS"
```
verify: `git log -1 --oneline`

## Done
- ticket status = `reviewed`, `completedAt` set
- Tickets.json `notes`/`instrumentation`/`rfcDiscrepancies` recorded
- `specs/$ARGUMENTS.md` re-exported (post-fix snapshot)
- zero open crimes; zero unclassified `[::STUB::]`; zero `[::AMBIGUOUS::]`
- compile + tests clean, zero warnings/errors
- exactly one commit created; NOT pushed
