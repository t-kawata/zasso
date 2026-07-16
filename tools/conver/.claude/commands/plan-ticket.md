---
description: Formulates an implementation plan for a ticket.
argument-hint: <P{phaseID}-{ticketID}>
---

# /plan-ticket

**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: Every incomplete implementation (stub, mock, placeholder, temporary implementation, by any name) **must** carry a `[::STUB::]` marker without exception. This is an absolute, inviolable law; violations are recorded as "crimes" in Malfeasance.json. In all phases of this command, read Malfeasance.json and verify there are no unresolved crimes. If you discover a violation, resolve it immediately, or add the marker and record it on the spot.

**Role**: Formulates the implementation plan for a ticket and defines the physical review method.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Position in the Workflow

The workflow flow is `make → plan → start → review`, currently executing `plan`.

- **`/make-ticket`**: Creates and details an implementation specification (spec) document.
- **`/plan-ticket`**: Detailed implementation-level planning.
- **`/start-ticket`**: Implementation.
- **`/review-ticket`**: Reviews completed tickets.

## Argument Interpretation

- `P{phaseID}-{ticketID}` format (e.g. `P0-1`, `PX-53`) → Ticket key. Required. Passed to `show-ticket-context.js`'s `--ticket-key`.
- No argument → Interrupt with error
- Numeric only → Interrupt with error
- Anything else → Interrupt with error

## Boy Scout Rule

**Include in the plan improvements to existing code that violates translatability, both inside and outside the scope.** Separately from the list of changed files, create a "Boy Scout Improvements (translatability fixes outside scope)" section specifying which files to fix and what to fix in them.

### Translatability Checks (common to all languages; select grep patterns per language)

- Grep function definitions for functions beginning with a noun
- Grep variable declarations for single-character variables or generic names (`data`, `info`, `tmp`)
- Check for hardcoded numeric literals
- Check for leftover debug output

## List of Scripts Used

Located under `.claude/scripts/tickets/`.

| Script | Arguments | Description |
|--------|-----------|-------------|
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--for-spec] [--plan]` | **Executed in Step 1**. Outputs ticket information in Markdown. With `--plan`, shows interruption message on Not Found. |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` (stdin: update JSON) | Update ticket fields |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | Full-text search |
| `scan-crimes.sh` | (none) | **Executed in Step 4**. Crime scan of Malfeasance.json. |
| `review/find-all-stubs.js` | `<path>` | **Executed in Step 4**. Search for all `[::STUB::]` markers. |
| `review/run-quality-checks.js` | `<files...>` | **Executed in Step 5**. Static quality checks. |

## Workflow

### Step 1: Existence check + retrieve ticket information

```bash
node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="$ARGUMENTS" --for-spec --plan
```

If the output starts with `# {ticketKey}: Not Found` → Follow the output, respond with "The ticket does not exist, so /plan-ticket is interrupted." and exit. If Not Found is not the case, design information and methods for exploring related information are output as Markdown; use this as context.

### Step 2: Explore and understand design information, related design information, related ticket information, and source code

Understand the output of Step 1. Then, following "Usage of query.js," execute the following for every Node ID listed in "Related RFC graph NODE-IDs to check" to explore detailed design information. The AI determines how many levels deep to continuously drill. The obtained information **must be backed by actual source code analysis** and included in the implementation plan with material evidence. An implementation plan without material evidence is a hallucination and is strictly prohibited.

```bash
node .claude/scripts/rfc-graph/query.js --graph="</path/to/?-GRAPH.json>" --source="</path/to/RFC-?.md>" --dirs-tree="</path/to/?-Dirs-Tree.json>" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
```

As needed, explore information about related tickets shown in "Related Tickets." The AI determines how many levels deep to continuously drill. The obtained information **must be backed by actual source code analysis** and included in the implementation plan with material evidence. An implementation plan without material evidence is a hallucination and is strictly prohibited.

```bash
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<Ticket KEY to show (e.g. P0-1)> --for-spec --no-test-rules
```

### Step 3: Crime and stub inspection (mandatory — First-Class Rule)

Read Malfeasance.json and check for unresolved crimes. **As a condition for plan approval**, one of the following must be satisfied:

- **Condition A**: No `open` records exist in Malfeasance.json
- **Condition B**: If `open` records exist, the implementation plan for this ticket includes concrete steps to resolve them

```bash
# Execute crime scan (auto-initializes on first run)
.claude/scripts/tickets/scan-crimes.sh
```

For Condition B, clearly specify the resolution steps for each crime in the plan.

Additionally, verify whether `[::STUB::]` markers affect the plan:

1. List stubs via `find-all-stubs.js`
2. Evaluate whether any stubs can be resolved within this ticket
3. If you find a stub without a `[::STUB::]` marker, add the marker and record it as a crime via `malfeasance-create.js`
4. Include resolvable stubs in the plan's implementation scope
5. Leave unresolvable stubs in the plan as notes, clearly stating their relationship to future tickets

```bash
# Search for stubs
node .claude/scripts/tickets/review/find-all-stubs.js .
```

**Active code exploration**: In the source tree targeted by the plan, grep to check whether incomplete implementations exist in the existing code. If found, add a `[::STUB::]` marker and record it as a crime via `malfeasance-create.js`. Reflect the results of this exploration in the "Risks" or "Boy Scout Improvements" section of the plan.

```bash
# Grep for incomplete implementation patterns
grep -rE "todo!\(\)|unimplemented!\(\)|panic!\(" . --include="*.rs" --include="*.ts" --include="*.vue" | grep -v "\[::STUB::\]" || true
grep -rE "TODO|FIXME|HACK|XXX" . --include="*.rs" --include="*.ts" --include="*.vue" | grep -v "\[::STUB::\]" || true
grep -rE "#\[allow" . --include="*.rs" --include="*.ts" --include="*.vue" | grep -v "\[::STUB::\]" || true
```

### Step 4: Formulate the plan

Based on the information obtained from Step 1, Step 2, and Step 3, formulate the implementation plan.
The plan **must comply with the Universal Testing Rules as the supreme law**.
The plan must safely incorporate the information obtained from Step 1, Step 2, and Step 3, and must output the same items as the output of show-ticket-context.js from Step 1. However, if the following conditions are not met, proceeding to Step 5 is prohibited. If not met, return to Step 2 and redo. If met, proceed to Step 5.

**Conditions for proceeding to Step 5**
1. **Universal Testing Rules** are fully complied with, and comprehensive behavioral verification through exhaustive unit and integration test code is planned
2. The plan is **significantly more concrete**, **significantly more detailed**, **based on material evidence**, and **high-density information** compared to the show-ticket-context.js output
3. The plan includes code snippets covering implementation to the extent that there are near-zero unknowns at implementation time

**Universal Testing Rules**

Write all code under the following non-negotiable rules:

1. Tests must be comprehensive and exhaustive for all observable behavior, including edge cases, failure modes, and invariants. Any behavior not covered by tests is considered undefined and unacceptable.

2. Do not write or accept any implementation whose correctness cannot be fully validated through tests. If correctness cannot be proven via tests, the implementation is invalid and must be redesigned.

3. If a feature cannot be completely and deterministically tested, treat this as a design failure. Refactor the architecture until full testability is achieved.

4. Tests are not a scoreboard and must never be treated as a goal in themselves. Passing tests does not imply correctness unless the tests fully capture the intended behavior.

5. It is strictly forbidden to modify or weaken tests to make an implementation pass. The implementation must conform to the tests, not the other way around.

6. Implementation is considered complete only when:
   - The tests fully and precisely specify the intended behavior.
   - The implementation passes all tests without exception.
   - The implementation's correctness is demonstrably guaranteed by those tests.

7. Any gap between test coverage and intended behavior is a critical defect. Resolve such gaps before considering the work complete.

### Step 5: Update status and report plan completion

Update the status.

```bash
echo '{"status":"planned"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

Report the full plan formulated in Step 4 to the user in Markdown format, and conclude with the following message.
```
Planning is complete. You can start the implementation by running: `/start-ticket $ARGUMENTS`
```
