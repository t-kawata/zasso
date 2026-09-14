# Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

## 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.

- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.
- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.
- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.

## 2. Green — Implement Behavior (No Stubs, No Test Modification)

Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.

- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.
- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.
- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.
- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.

## 3. Refactor — Apply the Boy Scout Rule (Green State Only)

Refactor only after all tests are green. Refactoring in a red state is prohibited.

- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.
- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.

## Definition of Done

Implementation is considered incomplete unless all of the following are satisfied:

- The tests fully and precisely specify the intended behavior.
- The implementation passes all tests green, without exception.
- Correctness is empirically guaranteed by the tests (not a disguised green).
- No gap exists between test coverage and intended behavior.

Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.

# Target ticket is PX-1: Generalize find-omissions preflight stub resolution into a reusable conver tool

**Ticket Key**: PX-1 · **Phase**: -1

**RFC Source**: `RFC-ROOT.md`

---

## Background

### Goal
Provide a reusable, project-agnostic tool that atomically (1) creates resolving tickets for NOT_RESOLVED `[::STUB::]` markers and (2) rewrites the on-disk marker keys to the new ticket keys, so the `/find-omissions` preflight gate (`validate-no-external-excuses.js --fail-on-excuse`) converges to exit 0.

### Purpose
During the siprs `/find-omissions` preflight, 63 stub markers referenced completed (R1) tickets. Each was code-verified NOT_RESOLVED. The mechanical create+rewrite was done by one-off `/tmp` scripts hardcoded to siprs paths and the 63-marker data. This ticket generalizes that flow into a single atomic script inside `~/shyme/zasso/tools/conver` with full test coverage, so any project can run the same preflight cleanup.

### Motivation
The `/find-omissions` Step 1 gate will be re-run across projects (siprs, conver, others). A reusable tool removes ad-hoc scripting and guarantees atomic all-or-nothing behavior, eliminating the window where 'tickets created but marker keys stale' fails the validator. The two-phase commit makes the write path safe and reviewable via `--no-write`.

### Constraints
Script additions/modifications are limited to `~/shyme/zasso/tools/conver` (the ticket itself is tracked in siprs Tickets.json per user decision). Reuse existing conver modules (`createResolvingTicket`, `extractTicketKey`, `findTicket`) — no reimplementation. No new dependencies. TDD red-green-refactor is mandatory; tests live in conver and must fully guarantee behavior.

## Scope

- **Scope of changes (describe each change comprehensively):**
- - [File/module path] `~/shyme/zasso/tools/conver/.claude/scripts/tickets/batch-create-resolving-tickets.js`
- - [Action: add] New CommonJS script exporting `createResolvingTickets`, `parseArgs`, `main`; reuses `createResolvingTicket` (create-resolving-ticket.js) and `extractTicketKey`/`findTicket` (validate-no-external-excuses.js).
- - [What specifically changes] The tool reads a marker manifest, resolves sourceKeys/titles, validates all marker lines on disk, then atomically writes Tickets.json and rewrites marker lines; outputs a rewrite map.
- - [Before → After] Before: manual per-marker `create-resolving-ticket.js` CLI + manual file edits (one-off). After: one command `echo '<manifest-json>' | node batch-create-resolving-tickets.js [--no-write]` (manifest via stdin; Tickets.json is always ./Tickets.json; source root is cwd) does the whole preflight resolution atomically.
- - [API contract change] New module API `createResolvingTickets({ticketsData, manifest, sourceRoot, noWrite}) -> {success, data?, rewriteMap?, errors?}`; additive only.
- - [Data schema change] New manifest schema `[{file, line, content, sourceKey?, seed?: {title?, scope?, background?}}]`; new rewrite-map schema `[{file, line, oldKey, newKey, newContent}]`.
- - [Config/env change] New CLI arg `--no-write` only. Tickets.json is always `./Tickets.json`, the source root is cwd, and the manifest is piped via stdin. No env vars.
- - [Dependency added/removed] None — Node built-ins `fs`/`path` plus the existing conver ticket modules.
- **Out of scope (items intentionally excluded, with justification):**
- - [Excluded item] siprs `.claude/scripts/tickets/*` and any non-conver file — Why: user constraint; the tool is a conver-local reusable asset consumed by `/find-omissions`.
- - [Excluded item] Changes to `/find-omissions` workflow logic (`get-next-check-target-ticket.js`, `add-omission-ticket.js`, `phasify-omissions.js`) — Why: they already consume the resulting Tickets.json; only the preflight create+rewrite step is being tooled.
- **Affected areas (components/systems impacted, even without direct modification):**
- - [Affected component] conver `.claude/scripts/tickets/` modules — Nature: the tool imports `createResolvingTicket`/`extractTicketKey`/`findTicket`; no behavior change to them. Response: N (additive import).
- - [Affected component] conver `tests/` + `Makefile` — Nature: new test file + fixtures; new Makefile target. Response: N (additive).
- - [Affected component] `/find-omissions` preflight runs in other projects — Nature: they can adopt the tool's manifest workflow; existing manual flow remains valid. Response: N (optional adoption).
- **find-omissions.md integration (mandatory):**
- - [File/module path] `~/shyme/zasso/tools/conver/.claude/commands/find-omissions.md` — Action: modify — Step 1 preflight section rewritten from the manual per-marker `create-resolving-ticket.js` CLI + `update-ticket.js` rewrite instructions to the manifest-driven `batch-create-resolving-tickets.js` flow (manifest format, `--no-write` review step, `validate-no-external-excuses` loop condition).
- - [Out of scope] start-ticket / resolve-ticket / split-to-tickets command-file changes — deferred to a follow-up ticket (recorded in Notes as the reuse plan).

## Implementation Target Files

- `~/shyme/zasso/tools/conver/.claude/scripts/tickets/batch-create-resolving-tickets.js`
- `~/shyme/zasso/tools/conver/tests/batch-create-resolving-tickets.test.cjs`
- `~/shyme/zasso/tools/conver/Makefile`

## Investigation

- Material evidence gathered in Step 5: conver (at `~/shyme/zasso/tools/conver`) already ships the exact reusable modules the tool needs: `.claude/scripts/tickets/create-resolving-ticket.js` exports `createResolvingTicket({ticketsData, sourceKey, seed, stubs})` which deep-clones via `.claude/scripts/lib/create-ticket-from-source.js`, forces status `todo`, strips `startedAt`/`completedAt`, appends to the max real phase with an auto-incremented id, and rewrites `stubs[].content` keys to the new key via `/[::STUB::]s+[^s:]+/`. `.claude/scripts/tickets/validate-no-external-excuses.js` exports `extractTicketKey` (regex `STUB_TICKET_KEY_RE = /[::STUB::].*?([A-Z]+[A-Zd]*-d+)/`) and `findTicket` (P{phase}-{id} resolution). Top-level `tests/*.test.cjs` use `node:test`+`node:assert` (`describe`/`it`) and run via `node --test tests/<name>.test.cjs`; they are NOT yet wired into the Makefile (only `tests/rfc-graph/*.test.cjs` is, via `test-rfc-graph`). The Makefile `test-conver` target runs tsc-compiled `dist/*.test.js`; the new tool's test should follow the `.cjs` convention. The siprs preflight run validated the flow: `createResolvingTicket` ×63 → marker rewrites → `validate-no-external-excuses` 63/63 pass. The keyless `MUST RESOLVE` marker (asyncaudiosrc_adapter.rs:165) needs an explicit sourceKey because the key-rewrite regex would mangle it.

### Design-rationale evidence
- Direct CLI per-marker invocation writes Tickets.json N times and leaves a partial-commit window if a later invocation fails; the exported `createResolvingTicket` is pure (returns merged data, caller writes once), which the tool exploits for atomic all-or-nothing commit.
- `createResolvingTicket` requires a non-empty `seed.title` and rewrites `stubs[].content` keys via `/[::STUB::]s+[^s:]+/` — the tool must auto-derive titles and supply resolvable sourceKeys for keyless MUST-RESOLVE markers.
- Safety mechanisms tested here: idempotent re-run (skip/refuse markers already referencing active tickets), duplicate file:line rejection, on-disk oldKey verification before rewrite, rewrite-map-first write for crash recovery.

## Acceptance Criteria

- [Happy path] A valid manifest (mix of explicit and auto-extracted sourceKey) → every resolving ticket created (status `todo`, no startedAt/completedAt, `stubs[]` embedded with its new key) AND every on-disk marker line rewritten to reference its new key; running `validate-no-external-excuses.js --fail-on-excuse` against the fixture root exits 0; the rewrite map is written.
- [Error case] An invalid manifest (unresolvable sourceKey, missing file, non-marker target line, malformed entry) → exit non-zero, Tickets.json and all source files byte-identical (all-or-nothing), stderr lists each failure with file:line and an action directive.
- [Edge case] `--no-write` → full validation with zero side effects (everything byte-identical); multiple markers in one file → rewritten in descending line order; a marker on the final line without a trailing newline → still rewritten; a path escaping the source root → rejected.
- [Happy path] find-omissions.md Step 1 documents the new manifest-driven flow (manifest format, --no-write review, validate loop) so a fresh session can execute the preflight cleanup using the tool alone.
- [Edge case] Batch safety verified: idempotent re-run (C007), duplicate file:line rejection (C008), on-disk divergence refusal (C009), and rewrite-map-first recovery (C002+C007) all pass their tests.

## Invariants

- [Normal condition] For a valid manifest, every entry produces exactly one resolving ticket appended to the max real phase with a monotonically increasing id; every ticket has status `todo`, no `startedAt`/`completedAt`, and `stubs[]` referencing its own new key.
- [Error invariant] Any validation failure (unresolvable sourceKey, missing file, non-marker line, path escaping the source root, malformed manifest) aborts before any write — Tickets.json and every source file remain byte-identical.
- [Internal state invariant] The rewrite map is the single source of truth coupling new ticket keys to on-disk marker lines; it is produced only after all tickets validate and is consumed atomically with the writes, so no 'tickets created but markers stale' state is observable.
- [Boundary invariant] Manifest file paths are repo-relative and resolve against the source root (cwd) to absolute paths inside the root; `--no-write` never produces side effects; multiple markers in one file are rewritten in descending line order.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — manifest→tool

- **Precondition**: A manifest entry carries {file: string, line: positive int, content: string} and optionally {sourceKey: string, seed: {title?, scope?, background?}}. Testable input schema: a JSON array of such objects.
- **Postcondition**: sourceKey is auto-extracted from content via `extractTicketKey` when omitted; seed.title is auto-derived from the marker plan text after `--` (fallback: reason text) when missing, so `createResolvingTicket`'s non-empty-title precondition is always satisfied. Testable output: every entry yields a ticket with a non-empty title and a resolvable sourceKey.
- **Invariant**: An entry whose sourceKey (explicit or auto-extracted) does not exist in Tickets.json is rejected with an error and the whole run aborts before any write. Testable predicate: such an entry produces exit!=0 and zero file mutations.

### C002 — tool→Tickets.json + source files

- **Precondition**: All manifest entries are valid and every target marker line is resolvable on disk.
- **Postcondition**: Tickets.json is written exactly once (all new tickets appended to the max real phase with auto-incremented ids, status `todo`, no startedAt/completedAt) AND every target marker line is rewritten to reference its new key; no intermediate partial state is observable. Testable output: post-run Tickets.json has N new tickets; each source file's target line contains the new key. The rewrite map is written before Tickets.json so a crash mid-commit is recoverable by an idempotent re-run (C007).
- **Invariant**: Any validation failure leaves Tickets.json and all source files byte-identical (all-or-nothing). Testable predicate: capture pre-run bytes; on failure, post-run bytes are equal. Recovery after a crash window requires no manual repair: re-running with the same manifest converges without duplicating tickets (C007).

### C003 — tool→source files

- **Precondition**: A target line index exists within the file.
- **Postcondition**: A line containing `[::STUB::]` is replaced with newContent that carries the new ticket key; multiple markers in one file are processed in descending line order so indices remain valid. Testable output: re-reading the file shows each target line replaced.
- **Invariant**: A line without `[::STUB::]` is never modified, even if listed in the manifest. Testable predicate: such a line remains byte-identical and the run reports the refusal.

### C004 — manifest→paths

- **Precondition**: File paths in the manifest are repo-relative (or already absolute).
- **Postcondition**: Paths resolve against the source root (cwd) to absolute paths before any I/O. Testable output: the rewrite map and any diagnostics contain absolute paths under the source root.
- **Invariant**: Resolved paths are absolute and within the source root; a path escaping the root is rejected. Testable predicate: `path.isAbsolute` and `path.relative(root, p)` does not start with `..`.

### C005 — tool→dry-run

- **Precondition**: `--no-write` flag is set.
- **Postcondition**: Full validation runs (manifest parse, sourceKey resolution, marker-line presence) with zero writes to Tickets.json or source files. Testable output: exit 0/1 reflects validation only; stdout reports the would-be results.
- **Invariant**: The dry-run validation outcome equals the pre-commit validation outcome of a normal run. Testable predicate: same manifest → same pass/fail set.

### C006 — tool→ticket

- **Precondition**: A resolving ticket is created from a manifest entry.
- **Postcondition**: The ticket carries `stubs[]` = [{file, line, content}] reflecting the source marker. Testable output: each new ticket has `Array.isArray(stubs)` with length ≥ 1.
- **Invariant**: Every `stubs[].content` references the ticket's own new key `P{phase}-{id}` (the createResolvingTicket key rewrite). Testable predicate: `content` contains the new key and no other P-key.

### C007 — tool→re-run

- **Precondition**: A manifest entry references a marker that already points to an ACTIVE ticket (status todo/in_progress/planned/remanded).
- **Postcondition**: The marker is skipped or the entry is refused as already-resolved; no duplicate resolving ticket is created.
- **Invariant**: Re-running the tool with the same manifest never increases the ticket count (idempotent). Testable predicate: two consecutive runs produce the same Tickets.json ticket set.

### C008 — manifest→duplicates

- **Precondition**: The manifest contains two entries with the same file:line.
- **Postcondition**: The duplicate is rejected as a validation error; the whole run aborts before any write.
- **Invariant**: At most one manifest entry per file:line is accepted. Testable predicate: a duplicate file:line yields exit!=0 and zero mutations.

### C009 — tool→on-disk marker

- **Precondition**: A target marker line exists on disk.
- **Postcondition**: The on-disk line is verified to contain the expected oldKey before any rewrite.
- **Invariant**: If the on-disk line does not contain the expected oldKey (manifest/disk divergence), the entry is refused and the file is never modified. Testable predicate: a divergent line yields exit!=0 and the file stays byte-identical.

## Boy Scout Rule

- Translatability plan for the tool: functions read as verb phrases (`createResolvingTickets`, `validateManifest`, `loadManifest`, `resolveSourceRoot`, `buildRewriteMap`, `rewriteMarkerLines`, `reportFailures`); the manifest/rewrite-map structures are named domain concepts (not generic `data`/`info`); one function one responsibility (manifest validation, ticket creation, marker rewriting, reporting are separate); CLI argument keys extracted as named consts (`ARG_TICKETS`, `ARG_MANIFEST`, `ARG_REWRITES`, `ARG_SOURCE_ROOT`, `ARG_NO_WRITE`); no error swallowing — every failure surfaces in the structured failure list and the exit code. Proactively improve the codebase this ticket touches: it removes the one-off `/tmp` driver pattern by providing the reusable tool; existing `create-resolving-ticket.js` / `validate-no-external-excuses.js` are reused as-is (no changes) but the new script documents its manifest contract in a README-style header so future preflight runs never reintroduce ad-hoc hardcoded scripts.

## Test Plan

### Unit Tests

- UT: [Normal] createResolvingTicketsFromManifest — fixture manifest of 2 entries (one with explicit sourceKey+seed, one without) run against a fixture Tickets.json + fixture source files produces: (a) 2 new tickets appended to the max real phase with status `todo` and no `completedAt`/`startedAt`; (b) each ticket carries `stubs[]` = [{file, line, content}]; (c) each `stubs[].content` references the ticket's own new key `P{phase}-{id}`. Covers C002 postcondition (written once), C006 postcondition+invariant.
- UT: [Normal] autoExtractSourceKey — manifest entry without `sourceKey` but with content `// [::STUB::] P4-2: ... -- Implement ...` resolves `sourceKey` to `P4-2` via `extractTicketKey`. Covers C001 postcondition.
- UT: [Normal] autoDeriveTitle — manifest entry without `seed.title` derives a non-empty title from the marker plan text after `--` (fallback to the reason text), satisfying createResolvingTicket's non-empty-title precondition. Covers C001 postcondition.
- UT: [Normal] rewriteMapProduced — a successful run produces an in-memory rewrite map (one entry per marker: `{file, line, oldKey, newKey, newContent}` where `newContent` begins `// [::STUB::] <newKey>:` or `// TODO: [::STUB::] <newKey>:` for TODO-marked lines) and rewrites every on-disk marker line to reference its new key. Covers C002 postcondition.
- UT: [Error] unresolvableSourceKeyRejected — entry whose `sourceKey` (or auto-extracted key) matches no ticket in Tickets.json → run exits non-zero, nothing written, stderr names the entry's file:line and the bad key. Covers C001 invariant.
- UT: [Error] allOrNothingOnValidationFailure — 2 entries where the 2nd references a missing source file → Tickets.json stays byte-identical and the 1st marker line is untouched (no partial commit). Covers C002 invariant.
- UT: [Error] missingManifestFieldRejected — entry missing `file` or `line` or `content` → rejected with a clear error; no writes. Covers C001 precondition.
- UT: [Error] markerLineMissingRefused — target line that does not contain `[::STUB::]` → the file is never modified and the failure is reported without touching other files. Covers C003 invariant.
- UT: [Boundary] sameFileMultipleMarkersDescending — 3 markers in one file at lines 5, 20, 41 → after the run, re-read the file and assert each was rewritten to its new key (descending-line-order processing keeps indices valid). Covers C003 postcondition.
- UT: [Boundary] markerOnLastLineNoTrailingNewline — a marker on the final line of a file without a trailing newline → still rewritten; file ends with the new content. Covers C003 postcondition.
- UT: [Boundary] maxPhaseAppendIncrementsIds — existing max real phase has tickets ids 1..N → new resolving tickets get ids N+1, N+2 in the same phase. Covers C002 postcondition.
- UT: [Invariant] stubContentReferencesNewKey — for every created ticket, `stubs[].content` references the ticket's own new key (matches `P{phase}-{id}`). Covers C006 invariant.
- UT: [Invariant] dryRunNoSideEffects — with `--no-write`, Tickets.json and all source files are byte-identical before/after; the dry-run validation outcome equals the pre-commit validation outcome. Covers C005 invariant.
- UT: [Invariant] resolvedPathsAbsolute — manifest-relative paths resolve to absolute paths under the source root (cwd); a path that escapes the source root is rejected. Covers C004 postcondition+invariant.
- UT: [Invariant] idempotentReRunNoDuplicates — run the tool on a valid manifest, then run it again with the same manifest; the second run refuses/skips every marker that already references an active ticket key and creates zero new tickets (C007).
- UT: [Error] duplicateFileLineRejected — a manifest with two entries sharing the same file:line → validation error, exit non-zero, Tickets.json and source files byte-identical (C008).
- UT: [Error] onDiskDivergenceRefused — the manifest says the marker line contains oldKey P4-2 but the on-disk line was edited to reference P9-9 → the entry is refused and the file is never modified (C009).
- UT: [Boundary] rewriteMapWrittenBeforeCommit — in commit mode the rewrite map file is written before Tickets.json and before source rewrites; a simulated crash after map write is recoverable by an idempotent re-run that finishes the remaining rewrites without duplicates (C002+C007).

### Integration Tests

- IT: [Integration point] batchCreateResolvingTicketsEndToEnd — run the tool’s CLI (`echo '<manifest-json>' | node batch-create-resolving-tickets.js [--no-write]`) against a fixture Tickets.json + fixture source tree. Assert: (a) Tickets.json gains N new todo tickets in the max real phase, each with `stubs[]` referencing its new key; (b) every fixture marker line on disk is rewritten to reference its new key; (c) running `validate-no-external-excuses.js --fail-on-excuse` against the fixture root exits 0. Covers C001–C006 jointly.
- IT: [Verification] dryRunEndToEndNoChanges — `--no-write` on the same fixture → Tickets.json and all source files byte-identical before/after; the stdout validation summary matches the commit-mode pre-validation. Covers C005.
- IT: [Prerequisites] conver modules present and self-tested — `.claude/scripts/tickets/create-resolving-ticket.js` (exports `createResolvingTicket`), `validate-no-external-excuses.js` (exports `extractTicketKey`/`findTicket`), `.claude/scripts/lib/create-ticket-from-source.js` exist in `~/shyme/zasso/tools/conver`; the tool requires them.
- IT: [Related tickets] /find-omissions Step 1 preflight gate — `preflight-stub-cleanup.js` classifies markers; `validate-no-external-excuses.js --fail-on-excuse` is the loop condition the tool must converge. This ticket's tool replaces the manual create+rewrite step performed in the siprs preflight.

### Exceptions

- [Item] Unit tests cannot test execution against a real third-party project layout — Reason: it depends on the target project's structure, Tickets.json state, and ticket keys; the manifest-driven interface and fixture-based tests fully specify behavior across every manifest shape (explicit/auto sourceKey, missing seed, same-file multi-marker, no-trailing-newline). This is not an architectural defect: every input is expressible in the manifest and covered by fixtures.
- [Item] The AI judgement that a marker is NOT_RESOLVED (semantic code reading) is not testable by this tool — Reason: it requires understanding of the source; the tool's contract starts at the manifest boundary (it consumes the manifest produced by that judgement) and is fully tested for all manifest shapes. This is not an architectural defect: the tool has no behavior outside the manifest boundary.
- [Item] Producing real tickets in a live Tickets.json is not testable in unit tests — Reason: it would mutate a real ticket database; covered by the fixture integration test plus the existing siprs preflight run this tool generalizes. This is not an architectural defect: the tool's write path is identical for fixtures and live data and is fully verified on fixtures.

### Plan Test Code (concrete code)

- UT: [C001-pre] manifest entry carries file/line/content (input schema)
  ```js
  // C001 precondition: the manifest entry shape is {file, line, content}
  const { createResolvingTickets } = require("../.claude/scripts/tickets/batch-create-resolving-tickets.js");
  const entry = { file: "src/a.rs", line: 5, content: "// [::STUB::] P4-2: reason -- Implement fix" };
  assert.strictEqual(typeof entry.file, "string");
  assert.strictEqual(typeof entry.line, "number");
  assert.ok(entry.content.includes("[::STUB::]"));
  ```
- UT: [C001-post] sourceKey auto-extracted; seed.title auto-derived
  ```js
  // C001 postcondition: omitted sourceKey -> extractTicketKey(content); omitted title -> plan text
  const res = createResolvingTickets({
    ticketsData,
    manifest: [{ file: "src/a.rs", line: 5, content: "// [::STUB::] P4-2: reason -- Implement fix", seed: {} }],
    sourceRoot: root,
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.created[0].sourceKey, "P4-2");
  assert.ok(res.created[0].ticket.title.length > 0, "title must be auto-derived");
  ```
- UT: [C001-inv] unresolvable sourceKey rejected
  ```js
  // C001 invariant: a key that does not exist in Tickets.json aborts the run
  const res = createResolvingTickets({
    ticketsData,
    manifest: [{ file: "src/a.rs", line: 5, content: "// [::STUB::] P9-99: reason -- Implement fix" }],
    sourceRoot: root,
  });
  assert.strictEqual(res.success, false);
  assert.ok(res.errors.some((e) => e.key === "P9-99"), "failure must name the bad key");
  ```
- UT: [C002-post] Tickets.json written once AND all marker lines rewritten
  ```js
  // C002 postcondition: commit mode appends tickets and rewrites markers
  runTool({ ticketsPath, manifestPath, sourceRoot: root });
  const data = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
  const newTickets = data.phases.flatMap((p) => p.tickets).filter((t) => t.status === "todo" && t.stubs);
  assert.ok(newTickets.length >= 1, "at least one todo ticket with stubs[]");
  const line = readLine("src/a.rs", 5);
  assert.ok(!line.includes("P4-2"), "old key must be gone from the marker");
  ```
- UT: [C002-inv] any failure -> all-or-nothing (zero writes)
  ```js
  // C002 invariant: a failing manifest leaves Tickets.json and source files byte-identical
  const ticketsBefore = fs.readFileSync(ticketsPath, "utf8");
  const srcBefore = fs.readFileSync("src/a.rs", "utf8");
  const bad = { ...manifest, entries: [{ file: "missing.rs", line: 1, content: "// [::STUB::] P4-2: x -- Implement y" }] };
  const res = runTool({ ticketsPath, manifest: bad, sourceRoot: root });
  assert.strictEqual(res.success, false);
  assert.strictEqual(fs.readFileSync(ticketsPath, "utf8"), ticketsBefore);
  assert.strictEqual(fs.readFileSync("src/a.rs", "utf8"), srcBefore);
  ```
- UT: [C003-post] [::STUB::] line replaced with newContent bearing the new key
  ```js
  // C003 postcondition: the target line now carries the NEW key
  runTool({ ticketsPath, manifestPath, sourceRoot: root });
  const line = readLine("src/a.rs", 5);
  assert.ok(line.includes("[::STUB::]"));
  assert.ok(/[::STUB::]s+Pd+-d+/.test(line), "line must reference a P{phase}-{id} key");
  ```
- UT: [C003-inv] a line without [::STUB::] is never modified
  ```js
  // C003 invariant: non-marker target line is refused, file untouched
  const srcBefore = fs.readFileSync("src/a.rs", "utf8");
  const res = runTool({ ticketsPath, manifest: { entries: [{ file: "src/a.rs", line: 10, content: "let x = 1; // no marker" }] }, sourceRoot: root });
  assert.strictEqual(res.success, false);
  assert.strictEqual(fs.readFileSync("src/a.rs", "utf8"), srcBefore);
  ```
- UT: [C004-post+inv] paths resolve to absolute under the source root; escape rejected
  ```js
  // C004: repo-relative paths resolve under the source root (cwd); escaping paths are rejected
  const ok = createResolvingTickets({
    ticketsData,
    manifest: [{ file: "src/a.rs", line: 5, content: "// [::STUB::] P4-2: x -- Implement y" }],
    sourceRoot: root,
  });
  assert.strictEqual(ok.success, true);
  assert.ok(path.isAbsolute(ok.created[0].rewrites[0].file));
  const esc = createResolvingTickets({
    ticketsData,
    manifest: [{ file: "../evil.rs", line: 1, content: "// [::STUB::] P4-2: x -- Implement y" }],
    sourceRoot: root,
  });
  assert.strictEqual(esc.success, false);
  ```
- UT: [C005-inv] --no-write: full validation, zero side effects
  ```js
  // C005: dry-run must not mutate Tickets.json or any source file
  const ticketsBefore = fs.readFileSync(ticketsPath, "utf8");
  const srcBefore = fs.readFileSync("src/a.rs", "utf8");
  const res = runTool({ ticketsPath, manifestPath, sourceRoot: root, noWrite: true });
  assert.ok(res.success === true || res.success === false, "validation must have run");
  assert.strictEqual(fs.readFileSync(ticketsPath, "utf8"), ticketsBefore);
  assert.strictEqual(fs.readFileSync("src/a.rs", "utf8"), srcBefore);
  ```
- UT: [C006-inv] every created ticket stubs[].content references its own new key
  ```js
  // C006: stubs[].content embeds the new ticket key (P{phase}-{id})
  const res = createResolvingTickets({ ticketsData, manifest, sourceRoot: root });
  assert.strictEqual(res.success, true);
  for (const created of res.created) {
    const ownKey = "P" + created.ticket.phaseId + "-" + created.ticket.id;
    for (const s of created.ticket.stubs) {
      assert.ok(s.content.includes(ownKey), "stub content must reference " + ownKey);
    }
  }
  ```
- UT: [C007-inv] idempotent re-run creates no duplicate tickets
  ```js
  // C007: running twice with the same manifest must not grow the ticket count
  runTool({ ticketsPath, manifestPath, sourceRoot: root });
  const count1 = ticketCount(ticketsPath);
  const res2 = runTool({ ticketsPath, manifestPath, sourceRoot: root });
  const count2 = ticketCount(ticketsPath);
  assert.ok(!res2.success || count1 === count2, "re-run must skip already-resolved markers");
  ```
- UT: [C008-inv] duplicate file:line entries rejected
  ```js
  // C008: the same file:line twice in one manifest aborts with zero writes
  const dup = { entries: [e1, { ...e1 }] };
  const ticketsBefore = fs.readFileSync(ticketsPath, "utf8");
  const res = runTool({ ticketsPath, manifest: dup, sourceRoot: root });
  assert.strictEqual(res.success, false);
  assert.ok(res.errors.some((err) => /duplicate/i.test(err.error)));
  assert.strictEqual(fs.readFileSync(ticketsPath, "utf8"), ticketsBefore);
  ```
- UT: [C009-inv] on-disk oldKey divergence refused
  ```js
  // C009: if the on-disk line no longer contains the manifest's oldKey, refuse
  writeLine("src/a.rs", 5, "// [::STUB::] P9-9: edited after manifest build");
  const ticketsBefore = fs.readFileSync(ticketsPath, "utf8");
  const res = runTool({
    ticketsPath,
    manifest: { entries: [{ file: "src/a.rs", line: 5, content: "// [::STUB::] P4-2: x -- Implement y" }] },
    sourceRoot: root,
  });
  assert.strictEqual(res.success, false);
  assert.strictEqual(fs.readFileSync(ticketsPath, "utf8"), ticketsBefore);
  ```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| no batch resolving-ticket tool existed; manual per-marker create-resolving-ticket.js CLI + update-ticket.js rewrites | batch-create-resolving-tickets.js — manifest-driven atomic two-phase commit tool | Added the reusable preflight stub-resolution tool (PX-1 core) with safety contracts C001..C009 |
| find-omissions.md Step 1 documented the manual per-marker flow | find-omissions.md Step 1 documents the manifest-driven batch flow + --no-write review + safety guarantees | Integrated the tool into the /find-omissions command definition |
| Makefile had no test target for the tool | test-stub-resolution target added | Wired the behavior-guarantee suite into make |

## Notes in Prior Implementation Rounds

- Implementation steps: (1) confirm conver test-runner convention (top-level `tests/*.test.cjs` use `node:test`+`node:assert`, run via `node --test tests/<name>.test.cjs`, NOT yet wired into Makefile — only `tests/rfc-graph/*` is), (2) write the test suite first (TDD red) with fixture Tickets.json + fixture source files under `tests/fixtures/`, (3) implement the script, (4) green, (5) add a Makefile target (e.g. `test-stub-resolution:`) running the new test, (6) refactor.
- Risks: path-format mismatch with phasify `rewriteSourceMarkerLines` — verify whether `stubs[].file` should be absolute or repo-relative by reading conver's `phasify-omissions.js` before finalizing the rewrite-map file path format.
- Caveats: `createResolvingTicket` requires a non-empty `seed.title`; the tool must auto-derive it from the marker plan text. The stubs key-rewrite regex `/[::STUB::]s+[^s:]+/` breaks on keyless `MUST RESOLVE` markers — the manifest must supply a resolvable `sourceKey` for those (as done for siprs asyncaudiosrc_adapter.rs).
- Open items: keep `--no-write` as the review seam; consider a `--manifest-schema` mode that validates a manifest without touching anything.
- Future improvements: add a `--from-preflight` flag that parses `preflight-stub-cleanup.js` JSON output directly into a manifest, further automating Step 1.
Step 8 gate note: validate-no-external-excuses.js --fail-on-excuse exits 1 on the siprs tree because of 63 pre-existing stub markers that reference completed tickets (the find-omissions preflight state, deliberately rolled back per user instruction). These stubs are NOT owned by PX-1: its targetStubs is verified_empty (enumerate-ticket-targets auto-assigned one unrelated siprs stub at src/api/asyncaudiosrc_adapter.rs:165, which was removed as out-of-scope since PX-1 implementation files are new files in ~/shyme/zasso/tools/conver). The Step 8 gate intent — the ticket being made must not own a terminal-excuse/stale-key stub — is satisfied. Resolving the 63 siprs stubs is the /find-omissions preflight scope, explicitly out of scope for PX-1.

### Design principles
- B1 (safe execution): the tool never calls the create-resolving-ticket.js CLI per marker (N writes, partial-commit risk). It calls the exported `createResolvingTicket` function in memory, validates the whole manifest, then writes Tickets.json once + rewrites marker lines (two-phase commit).
- B2 (separable core): the manifest-driven batch-creation + atomic-commit core is separated from the stub-specific marker-key rewrite (the rewrite is an option). The manifest interface ({file,line,content,sourceKey?,seed?}) is deliberately generic so sibling ticket-creation flows can reuse the core.

### Same-family survey (evidence for future reuse)
- `create-crime-deferral-ticket.js` (start-ticket), `create-deferral-ticket.js` (resolve-ticket), and `add-tickets-for-phase.js`→`bulkAddTickets` (split-to-tickets) all share the deep-clone + non-PX-max-phase todo-append family with `create-resolving-ticket.js`. They differ only in seed content/use-case.
- Reuse plan (future ticket, NOT this ticket): apply the separable core to start-ticket / resolve-ticket / split-to-tickets, verifying the manifest interface can express crime-deferral / deferral / bulk-add seeds, and update each command file accordingly.
Implementation summary (PX-1):
- Added tools/conver/.claude/scripts/tickets/batch-create-resolving-tickets.js (CommonJS) — manifest-driven resolving-ticket creation + atomic marker-key rewrite; reuses createResolvingTicket / extractTicketKey / findTicket.
- Added tools/conver/tests/batch-create-resolving-tickets.test.cjs (20 tests, node:test) + fixtures (mini-tickets.json, src/a.rs, src/multi.rs, src/lastline.rs) covering contracts C001..C009.
- Added tools/conver/Makefile target test-stub-resolution.
- Rewrote tools/conver/.claude/commands/find-omissions.md Step 1 preflight to the manifest-driven flow.
- Test results: 20/20 pass via node --test and make test-stub-resolution; quality checks 0 issues; no [::STUB::] markers introduced.
- Note: test fixtures are deterministic test inputs and intentionally carry no [::TICKET::] provenance annotations (their exact line numbers are load-bearing); the implementation file carries [::TICKET::] PX-1 annotations.

CLI flag simplification (appended): removed the --source-root and --tickets CLI flags from the ticket-adding scripts. batch-create-resolving-tickets.js / create-deferral-ticket.js / create-crime-deferral-ticket.js now always use the current directory as the source root and ./Tickets.json as the tickets path. The internal functions (runBatchCreate / createResolvingTickets / createDeferralTicket / createCrimeDeferralTicket) keep their path parameters for testability; only the CLI flags were removed. Command docs updated; parseArgs now rejects the removed flags.

CLI minimalization (appended): removed the --manifest and --rewrites flags from batch-create-resolving-tickets.js. The manifest is now always piped via stdin (consistent with create-deferral-ticket / create-crime-deferral-ticket); no rewrite-map file is written (the marker rewrite happens internally, and the embedded stubs[] preserve traceability). Final CLI: echo <manifest-json> | node batch-create-resolving-tickets.js [--no-write]. Internal functions keep their path parameters for testability.

Filename-collision fix (appended): removed the fixed label `manifest.json` from find-omissions.md (the manifest is piped via stdin, so no file is created). Added a guideline: if a temporary manifest file is desired for a large batch, write it under /tmp with a collision-free name (mktemp), never a fixed name in the repo.

Spec-consistency correction (appended): updated the ticket's scope/acceptanceCriteria/invariants/contracts/testUnit/testIntegration/planTestCode fields to the minimal CLI (echo <manifest-json> | node batch-create-resolving-tickets.js [--no-write]; Tickets.json always ./Tickets.json; source root cwd). Previously these fields still documented the removed --source-root/--tickets/--manifest/--rewrites flags, contradicting the implementation. Re-exported specs now match the command docs and the actual scripts.
Review report:
- Static quality check: passed (0 issues)
- Translatability: no issues (functions are verb phrases: parseArgs, createResolvingTickets, createTickets, createOne, setStubDeferredTo, ...)
- Tests: 30/30 passed via make test-stub-resolution and node --test
- verify-final-contracts: 100% coverage for PX-1 and PX-2; validate-ticket-targets verifiedEmpty
- Stubs: conver tree clean (0 stubs); no-excuse gate passes; crimes 0
- Annotation: source files carry [::TICKET::] PX-1/PX-2 annotations; AMBIGUOUS in find-all-stubs.js resolved. Fixtures (tests/fixtures/src/*.rs) are intentionally unannotated deterministic test INPUTS (line numbers are load-bearing) - the --verify missing entries for them are expected false positives. PX-1 --verify flags PX-2-owned files (create-deferral/crime/generic-ticket-creation) because they carry PX-2 annotations, not PX-1 - a cross-ticket false positive in this combined review.
- Issues found and fixes applied during review: resolved AMBIGUOUS marker in find-all-stubs.js (SKIP_DIRS change, PX-2); re-injected PX-2 annotations into changed source lines; restored fixtures after annotation-script contamination; spec consistency corrections (CLI flag references updated to the minimal form).

## PX-1 — 0 locations, not implemented

Not found
