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

# Target ticket is PX-152: Implement /crystalize-readme: generate usage README or RESIDUE from RFC graph

**Ticket Key**: PX-152 · **Phase**: -1

---

## Background

- 【Goal】RFC のグラフ（*-GRAPH.json）を入力として、ユーザー向け「使い方 README」を生成する。グラフ検証・OMISSIONS 残存・examples 欠落・grill 未承認などにより README を書けない場合は residues/RESIDUE-<ts>.md に理由を記録する。両系統の成果物とも末尾セクションは必ず「examples（実装サンプル）の仕様と設計」とする。
- 【Purpose】conver の内側ループで RFC → 実装 → 検証を回す過程で「実装はあるが使い方が文書化されていない」状態を解消する。グラフ由来の機械的目次＋実サンプル参照により README 生成の品質と再現性を上げ、実装漏れ・矛盾が発覚した場合は RESIDUE として可視化して将来 /drill-rfc-down でチケット化する起点とする。
- 【Motivation】siprs の RFC-ROOT-GRAPH.json は既に存在するが README.md は空（0 bytes）で、使い方ドキュメントが欠落している。手書き README はグラフと乖離しやすく、機械生成＋決定論検証により「グラフ＝実装＝ドキュメント」の整合を保つ。
- 【Constraints】(1) 決定論でできることはスクリプトに寄せ、AI は非決定論部分（目次編成・examples 仕様・本文合成）のみ担当する（設計原則 §5）。(2) 目次グリルは /grill-me-for-rfc 同様、AI 提案はチェックされ、ユーザーは Yes/No または ABC のみ回答（自由記述を要求しない）。(3) samples は examples に改名（siprs examples/ に整合）。(4) コマンド文書はまず日本語で書き、日本人ユーザー（本人）の点検後に英語へ翻訳する。

## Scope

- Create .claude/scripts/crystalize-readme/validate-graph-arg.js — validate graph argument (nodes/edges/sourceFile presence + schema)
- Create .claude/scripts/crystalize-readme/derive-output-paths.js — derive rfcDir/examplesDir/residuesDir/readmePath/residuePath from graph.sourceFile
- Create .claude/scripts/crystalize-readme/extract-toc-candidates.js — extract heading candidates from graph node hierarchy
- Create .claude/scripts/crystalize-readme/check-toc-structure.js — validate TOC (no duplicates, contiguous levels, coverage, trailing examples section)
- Create .claude/scripts/crystalize-readme/validate-examples-spec.js — validate examples spec structure/reference integrity
- Create .claude/scripts/crystalize-readme/check-readme-writable.js — (a)/(b) branch decision with recorded reasons
- Create .claude/scripts/crystalize-readme/generate-residue-filename.js — RESIDUE-<YYYYMMDDhhmmss>.md filename
- Create .claude/scripts/crystalize-readme/validate-readme-output.js — validate README output structure (trailing examples section)
- Create .claude/scripts/crystalize-readme/validate-residue-output.js — validate RESIDUE output structure
- Create .claude/scripts/crystalize-readme/update-step-status.js — step progress management (reuse rfc-graph/update-step-status.js pattern)
- Create *.test.js for each deterministic script
- Finalize .claude/commands/crystalize-readme.md (Japanese draft exists; English translation after review)
- Reference docs/DESIGN-OF-CRYSTALIZE-README.md as the spec source
- Non-change: do not modify /grill-me-for-rfc (reuse its interaction pattern only)
- Non-change: do not implement /drill-rfc-down (future work)
- Non-change: do not modify graphify-rfc / boundify-graph pipeline
- Impact: conver command system; Tickets.json pipeline; crates/siprs/RFC-ROOT-GRAPH.json as first target
- **Scope of changes (describe each change comprehensively):**
- [Path] .claude/scripts/crystalize-readme/ (new dir): validate-graph-arg.js, derive-output-paths.js, extract-toc-candidates.js, check-toc-structure.js, validate-examples-spec.js, check-readme-writable.js, generate-residue-filename.js, validate-readme-output.js, validate-residue-output.js, update-step-status.js + package.json {"type":"commonjs"}
- [Action] add — create all 10 deterministic scripts; each CommonJS with a CLI entry (process.argv + --flag) and a named export for unit testing
- [Detail] validate-graph-arg.js: --graph=<path> → resolve path (path.resolve(process.cwd(), arg)), fs.readFile, JSON.parse, ajv schema validation against .claude/scripts/rfc-graph/schema/graph.schema.json (required sourceFile/mainLanguage/nodes/edges, additionalProperties:false; node id ^N[0-9]{4}$, slug ^[a-z][a-z0-9_]*$), prints {ok:true, graph} or exits 1
- [Detail] derive-output-paths.js: --graph=<path> → {rfcDir, examplesDir, residuesDir, readmePath, residuePath} with fromHomeRelative() (.claude/scripts/lib/path-utils.js) expansion of sourceFile BEFORE path.dirname; prints JSON, exits 1 on empty/non-string sourceFile
- [Detail] extract-toc-candidates.js: --graph=<path> → heading candidates [{level:number, title:string}] from graph nodes in document order (node.title + headingRefs[].heading + kind)
- [Detail] check-toc-structure.js: reads candidate list → {ok:boolean, violations:[{type:'duplicate'|'skippedLevel'|'missingCoverage'|'missingTrailingSection', heading, detail}]}; trailing section always 'examples (implementation samples) spec and design'
- [Detail] validate-examples-spec.js: reads examples spec → pass/fail; every sample file reference must resolve under examplesDir
- [Detail] check-readme-writable.js: --graph=<path> + derived paths JSON interface → {branch:'README'|'RESIDUE', reasons:[]|[...]}; 4 conditions: (1) rfc-graph/verify.js --graph --source → uncoveredHeadings=[], isolatedNodes=[], unresolvableRefs=[]; (2) no unresolved omissions JSON (omissions-schema.json) under rfcDir/omissions/; (3) examplesDir exists and every node kind 'implementation_sample' resolves to an existing file; (4) CRYSTALIZE-Status.json records tocApproved:true && examplesApproved:true. Deterministic — no Date.now()/Math.random() inside
- [Detail] generate-residue-filename.js: --timestamp=<YYYYMMDDhhmmss> → RESIDUE-<ts>.md matching /^RESIDUE-\d{14}\.md$/
- [Detail] validate-readme-output.js: --readme=<path> or stdin → exit 0 iff last section heading is the examples section (case-insensitive) and required header fields present; else exit 1 with stderr message
- [Detail] validate-residue-output.js: --residue=<path> → exit 0 iff required header fields (対象RFC/生成グラフ/生成日時/判定理由) and a non-empty inventory with id/要求事項/現状/証拠/ステータス per entry; else exit 1
- [Detail] update-step-status.js: start-step/end-step/fail-step/reset-to-step/status subcommands + --status= flag, atomic temp-file+rename write of CRYSTALIZE-Status.json (reuse of rfc-graph/update-step-status.js pattern)
- [Before → After] before: no /crystalize-readme capability (only docs/DESIGN-OF-CRYSTALIZE-README.md + a Japanese draft command doc); after: the slash command generates README.md (branch a) or residues/RESIDUE-<ts>.md (branch b) from any *-GRAPH.json, with all mechanical work done by deterministic scripts
- [API contract] new slash command /crystalize-readme <graph-path>; 10 script CLIs as specified above; no change to existing rfc-graph script APIs (verify.js / update-step-status.js reused read-only)
- [Data schema] new CRYSTALIZE-Status.json (grill approvals tocApproved/examplesApproved + step state); consumes graph.schema.json / node.schema.json / edge.schema.json / omissions-schema.json read-only; outputs README.md / residues/RESIDUE-<ts>.md
- [Config/env] no new env vars; all paths derived from the graph sourceFile (home-relative '~/' expanded via fromHomeRelative()); no .env changes
- [Dependency] no new runtime dependency — ajv ^8.20.0 already present in .claude/scripts/rfc-graph/package.json is reused for schema validation
- **Out of scope (items intentionally excluded, with justification):**
- [Excluded] Modifying /grill-me-for-rfc itself (its validate-question-format.js / grill state files)
- [Why] /grill-me-for-rfc is a separate RFC-authoring concern; /crystalize-readme only mirrors its interaction protocol (proposal → validation → user Yes/No/ABC) to keep user burden at Yes/No or ABC
- [Excluded] Implementing /drill-rfc-down (the RESIDUE deep-dive pipeline that turns RESIDUE-*.md into Tickets.json entries)
- [Why] explicitly future work per design §11; RESIDUE-*.md is the handoff artifact for that future ticket
- [Excluded] Modifying the graphify-rfc / boundify-graph pipeline or their output schemas (graph.schema.json / node.schema.json / edge.schema.json)
- [Why] out of scope — crystalize-readme is a downstream read-only consumer of *-GRAPH.json only
- **Affected areas (components/systems impacted, even without direct modification):**
- [Component] conver slash-command system — .claude/commands/crystalize-readme.md registers the command (allowed-tools: Read, Write, Bash); .claude/scripts/crystalize-readme/ hosts the 10 scripts
- [Nature of impact] new API surface (a slash command + 10 scripts) with no performance / security / data-format change to the existing pipeline; rfc-graph schemas and verify.js are read-only
- [Corresponding response] Y — Makefile gains target test-crystalize-readme (node --test "tests/crystalize-readme/*.test.cjs"); docs/DESIGN-OF-CRYSTALIZE-README.md §6 Step 3 wording corrected to the real verify.js axes (uncoveredHeadings/isolatedNodes/unresolvableRefs); the Japanese command doc is finalized then translated to English after user review

## Implementation Target Files

- `.claude/scripts/crystalize-readme/`
- `.claude/commands/crystalize-readme.md`
- `docs/DESIGN-OF-CRYSTALIZE-README.md`

## Investigation

- graph.schema.json (.claude/scripts/rfc-graph/schema/graph.schema.json) requires sourceFile/mainLanguage/nodes/edges with additionalProperties:false; node.schema.json requires id/title/kind/summary/headingRefs/slug (id pattern ^N[0-9]{4}$, slug pattern ^[a-z][a-z0-9_]*$, 12 kinds: requirement/api_contract/data_model/state_machine/architecture/security/error_policy/config/test_policy/build_ci/rationale/glossary); edge.schema.json requires from/to/type/attributes/contracts.
- crates/siprs/RFC-ROOT-GRAPH.json is the first smoke-test target; its sourceFile is home-relative "~/shyme/zasso/crates/siprs/RFC-ROOT.md" → derive-output-paths.js MUST call fromHomeRelative() (.claude/scripts/lib/path-utils.js expands "~/" to $HOME via path.resolve(homedir, rel.slice(2))) before path.dirname, otherwise rfcDir would resolve to a literal "~" directory that does not exist.
- rfc-graph/verify.js (CLI: --graph=<path> --source=<path>) outputs {"ok":true} or {"ok":false,"uncoveredHeadings":[],"isolatedNodes":[],"unresolvableRefs":[]}. DESIGN-OF-CRYSTALIZE-README.md §6 Step 3 says "uncovered 行 = 0, orphan node = 0" — the ACTUAL verification axes are uncoveredHeadings/isolatedNodes(orphan)/unresolvableRefs; the spec and this ticket use the real axes, and the design doc wording is corrected when the implementation lands.
- OMISSIONS machine-readable format exists: .claude/scripts/tickets/omissions-schema.json requires parentRfcPath/generatedAt/omissions[]; each omission carries id (^O-\d{3}$), type (7 enums), severity, rfcSection, description, affectedFiles, suggestedResolution. siprs has omissions/OMISSIONS-<timestamp>.json (machine) and docs/OMISSIONS-2026-08-16.md (59KB human inventory of 12 must-have features). check-readme-writable.js condition 2 scans rfcDir/omissions/ for OMISSIONS-*.json matching the schema.
- siprs examples/ exists with account_register.rs, audio_tap.rs, client_init.rs, make_call.rs, tts_source.rs and common/ — condition 3 checks examplesDir existence plus resolution of every graph node of kind implementation_sample to an existing file.
- siprs README.md currently exists but is EMPTY (0 bytes) → the smoke test is expected to take branch (b) RESIDUE because siprs has unresolved OMISSIONS.
- conver Makefile has NO `make test` target; the rfc-graph test target is `make test-rfc-graph` (node --test "tests/rfc-graph/*.test.cjs" "tests/rfc-graph/schema/*.test.cjs"). crystalize-readme adds `make test-crystalize-readme` (node --test "tests/crystalize-readme/*.test.cjs") and a .claude/scripts/crystalize-readme/package.json {"type":"commonjs"} mirroring the rfc-graph scripts dir.
- update-step-status.js (.claude/scripts/rfc-graph/update-step-status.js) pattern: subcommands start-step/end-step/fail-step/reset-to-step/status plus cleanup/backup, --status= flag, atomic write (temp-file + rename). crystalize-readme reuses this pattern with its own CRYSTALIZE-Status.json.
- The /grill-me-for-rfc pattern (.claude/commands/grill-me-for-rfc.md) mandates: every question passes validate-question-format.js before presentation; the user answers only Yes/No or A/B/C; the Step 1 TOC grill of /crystalize-readme mirrors this (proposal → check-toc-structure.js → user Yes/No/ABC approval).
- Test convention (node.md): CommonJS; tests live under tests/<area>/*.test.cjs and run with node --test; each script dir under .claude/scripts/<name>/ gets its own package.json {"type":"commonjs"}. ajv ^8.20.0 is already a dependency of the rfc-graph package and is reused for schema validation.

## Acceptance Criteria

- Happy path (a): a valid graph with no omissions and existing examples writes README.md to rfcDir, and the last section is examples (implementation samples) spec and design
- Error case (b): a graph with unresolved omissions / missing examples / failed graph verification writes residues/RESIDUE-<ts>.md with the judgment reasons
- Edge case: an invalid graph argument exits with a clear error (exit 2); an empty graph is handled without crashing; check-readme-writable is deterministic for identical inputs
- **[Happy path] — a valid graph (clean verification, no unresolved omissions, populated examples/, grill status approved) → /crystalize-readme writes <rfcDir>/README.md** whose last section heading is 'examples (implementation samples) spec and design'; validate-readme-output.js exits 0; update-step-status.js records step4 in CRYSTALIZE-Status.json
- **[Error case] — a graph failing any branch condition (unresolvedOmissions / missingExamples / graphVerificationFailed / grillInconsistent) → writes <rfcDir>/residues/RESIDUE-<YYYYMMDDhhmmss>.md** listing each failing reason; validate-residue-output.js exits 0; the smoke target crates/siprs/RFC-ROOT-GRAPH.json is expected to take this branch (siprs has unresolved OMISSIONS)
- **[Edge case] — an invalid graph argument (non-existent path / malformed JSON / schema violation) → validate-graph-arg.js exits non-zero with a clear stderr message and NO output file is created; an empty graph (nodes:[]) is handled without crashing (branch b with missingCoverage reasons); check-readme-writable is deterministic for identical inputs (same branch + same reasons across repeated runs)

## Invariants

- 【Normal establishment】The input graph satisfies graph.schema.json (sourceFile/mainLanguage/nodes/edges present; nodes carry id/title/kind/summary/headingRefs/slug; edges carry from/to/type/attributes/contracts); sourceFile expands via fromHomeRelative() to an existing RFC document; all 5 derived paths (rfcDir/examplesDir/residuesDir/readmePath/residuePath) are absolute and non-empty.
- 【On error】Every deterministic script exits non-zero with a stderr message naming the failing input and the cause; no script silently swallows an error (no catch-and-return-Ok); no partial output file is left on a failed generation — README.md / RESIDUE-<ts>.md are written only after validate-*.js passes.
- 【Internal state】CRYSTALIZE-Status.json always reflects the latest completed step; step transitions are atomic (temp-file + rename) so the file is never observed half-written; grill approvals (tocApproved/examplesApproved) persist and are read-only inputs to check-readme-writable.
- 【Boundary】The 4 branch conditions are evaluated independently — exactly the failing conditions appear in the RESIDUE reasons list; the RESIDUE filename matches /^RESIDUE-\d{14}\.md$/ at all timestamp boundaries; the trailing README section is always 'examples (implementation samples) spec and design' regardless of graph size; an empty graph (nodes:[]) yields branch b with missingCoverage/missingExamples reasons, never a crash.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — DESIGN-OF-CRYSTALIZE-README.md §6 Step 0 (derive-output-paths.js)

- **Precondition**: graph.sourceFile is a non-empty string path; the graph has already passed validate-graph-arg schema validation against .claude/scripts/rfc-graph/schema/graph.schema.json (required: sourceFile/mainLanguage/nodes/edges); sourceFile may be home-relative ("~/...") and MUST be expanded via fromHomeRelative() from .claude/scripts/lib/path-utils.js before path.dirname
- **Postcondition**: prints JSON {rfcDir: <abs dirname(sourceFile)>, examplesDir: <rfcDir>/examples, residuesDir: <rfcDir>/residues, readmePath: <rfcDir>/README.md, residuePath: <residuesDir>/RESIDUE-<YYYYMMDDhhmmss>.md} to stdout and exits 0
- **Invariant**: examplesDir and residuesDir are always located under rfcDir — path.dirname(examplesDir)===rfcDir && path.dirname(residuesDir)===rfcDir for any nested sourceFile

### C002 — DESIGN-OF-CRYSTALIZE-README.md §6 Step 3 (check-readme-writable.js)

- **Precondition**: graph is loaded and schema-validated by validate-graph-arg; check-readme-writable receives the graph path via --graph=<path> and the derived output paths via a JSON interface {rfcDir, examplesDir, residuesDir, readmePath, residuePath}
- **Postcondition**: returns (a) {branch:'README', reasons:[]} when ALL 4 conditions hold — (1) rfc-graph/verify.js --graph=<path> --source=<sourceFile> reports uncoveredHeadings=[], isolatedNodes=[], unresolvableRefs=[]; (2) no unresolved omissions JSON (omissions-schema.json) under rfcDir/omissions/; (3) examplesDir exists and every node of kind implementation_sample resolves to an existing file under examplesDir; (4) grill status CRYSTALIZE-Status.json records tocApproved:true && examplesApproved:true. Otherwise returns (b) {branch:'RESIDUE', reasons:[graphVerificationFailed|unresolvedOmissions|missingExamples|grillInconsistent, ...]} with a non-empty reason list
- **Invariant**: identical inputs always yield the same decision (deterministic) — no Date.now()/Math.random()/process-dependent value inside the decision; the residue timestamp is injected externally as an argument

### C003 — DESIGN-OF-CRYSTALIZE-README.md §6 Step 1 (check-toc-structure.js)

- **Precondition**: TOC proposal is a list of headings with levels — input shape [{level:number, title:string}] (produced by extract-toc-candidates.js from graph nodes in document order)
- **Postcondition**: returns {ok:boolean, violations:[{type:'duplicate'|'skippedLevel'|'missingCoverage'|'missingTrailingSection', heading, detail}]}; violations is non-empty iff ok=false; on ok=true the TOC has no duplicate headings, contiguous levels (no H2→H4 skip), full coverage of top-level graph sections, and a trailing examples section
- **Invariant**: the trailing section must always be examples (implementation samples) spec and design — matched case-insensitively

### C004 — DESIGN-OF-CRYSTALIZE-README.md §7 (generate-residue-filename.js)

- **Precondition**: a valid 14-digit timestamp string YYYYMMDDhhmmss is available, injected as a CLI argument (e.g. '20260817120000')
- **Postcondition**: outputs a filename matching /^RESIDUE-\d{14}\.md$/ (e.g. RESIDUE-20260817120000.md)
- **Invariant**: filename format is fixed and collision-safe per second — identical timestamp input yields the identical filename

### C005 — DESIGN-OF-CRYSTALIZE-README.md §6 Step 4 (validate-readme-output.js)

- **Precondition**: README.md content is a non-empty string, provided via --readme=<path> or stdin
- **Postcondition**: passes (exit 0, ok:true) iff the last section heading is 'examples (implementation samples) spec and design'; otherwise fails (exit 1) with a clear stderr message naming the missing/reordered heading
- **Invariant**: every README ends with the examples spec/design section — the validator accepts no README whose last heading differs (case-insensitive)

## Boy Scout Rule

- validate-graph-arg.js / derive-output-paths.js / check-*.js: function names as verb phrases (validateGraphArgument, deriveOutputPaths, checkTocStructure, checkReadmeWritable), one responsibility per function, no error swallowing — every error path exits non-zero with a stderr message naming the failing input and the cause.
- Path derivation: extract hardcoded directory/file names into named constants — EXAMPLES_DIR_NAME='examples', RESIDUES_DIR_NAME='residues', README_FILENAME='README.md', RESIDUE_FILENAME_PREFIX='RESIDUE-', RESIDUE_FILENAME_RE=/^RESIDUE-\d{14}\.md$/ — instead of inline string literals; the trailing-section string 'examples (implementation samples) spec and design' becomes TRAILING_SECTION_TITLE.
- Boy Scout on touched existing code: (1) docs/DESIGN-OF-CRYSTALIZE-README.md §6 Step 3 wording "uncovered 行 = 0, orphan node = 0" is updated to the real verify.js axes (uncoveredHeadings / isolatedNodes / unresolvableRefs) when the implementation lands — the doc currently contradicts the code it references; (2) .claude/commands/crystalize-readme.md §3 Derived Paths uses `dirname "$sourceFile"` in bash — replace with derive-output-paths.js (--field=sourceFile) so home-relative paths are expanded consistently (same fix as the design doc); (3) rfc-graph/verify.js and rfc-graph/update-step-status.js are reused read-only — no changes needed there.
- The chicken-and-egg in the design doc (§8 "各スクリプトは *.test.js を伴う（node.md 規約: node tests/run-all.js）") is reconciled with the actual conver convention (tests/<area>/*.test.cjs + make test-rfc-graph) in this ticket's test plan — the spec records the real runner.

## Test Plan

### Unit Tests

- UT: [Normal] validate-graph-arg accepts a valid graph JSON (nodes/edges/sourceFile present) — schema-validates against .claude/scripts/rfc-graph/schema/graph.schema.json (required: sourceFile/mainLanguage/nodes/edges, additionalProperties:false, node id pattern ^N[0-9]{4}$, slug pattern ^[a-z][a-z0-9_]*$) and prints {ok:true, graph:{...}} to stdout
- UT: [Normal] validate-graph-arg resolves a relative --graph path via path.resolve(process.cwd(), arg) before fs.readFile; an absolute path passes through unchanged
- UT: [Error] validate-graph-arg rejects a non-existent --graph path — stderr includes the resolved path, process.exitCode=1
- UT: [Error] validate-graph-arg rejects malformed JSON (JSON.parse throws) — exit 1 with a clear stderr message naming the parse error
- UT: [Error] validate-graph-arg rejects schema violations — missing sourceFile / missing nodes / missing edges / empty nodes array → exit 1 listing the failing required field
- UT: [Normal] derive-output-paths derives rfcDir=dirname(sourceFile), examplesDir=rfcDir/examples, residuesDir=rfcDir/residues, readmePath=rfcDir/README.md, residuePath=residuesDir/RESIDUE-<ts>.md
- UT: [Normal] derive-output-paths expands a home-relative sourceFile (e.g. "~/shyme/zasso/crates/siprs/RFC-ROOT.md") via fromHomeRelative() from .claude/scripts/lib/path-utils.js BEFORE path.dirname — rfcDir becomes .../crates/siprs (this is the siprs RFC-ROOT-GRAPH.json case)
- UT: [Error] derive-output-paths fails with exit 1 when sourceFile is empty string, missing, or non-string (no dirname derivable)
- UT: [Normal] extract-toc-candidates extracts heading candidates from graph nodes in document order — builds [{level:number, title:string}] from node.title + node.headingRefs[].heading (the heading level) + node.kind
- UT: [Boundary] extract-toc-candidates handles an empty graph (nodes:[]) → [] and a single-node graph → exactly one candidate at its heading level
- UT: [Normal] check-toc-structure passes a valid TOC — no duplicate headings, contiguous levels (no H2→H4 skip), full coverage of top-level graph sections, trailing section 'examples (implementation samples) spec and design'
- UT: [Error] check-toc-structure flags each concrete violation as a typed object {type:'duplicate'|'skippedLevel'|'missingCoverage'|'missingTrailingSection', heading, detail}
- UT: [Normal] check-readme-writable returns branch (a) {branch:'README', reasons:[]} when ALL 4 conditions hold: (1) rfc-graph/verify.js reports uncoveredHeadings=[], isolatedNodes=[], unresolvableRefs=[]; (2) no unresolved omissions JSON (matching omissions-schema.json) under rfcDir/omissions/; (3) examplesDir exists and every graph node kind 'implementation_sample' resolves to an existing file under examplesDir; (4) grill status file CRYSTALIZE-Status.json records tocApproved:true && examplesApproved:true
- UT: [Error] check-readme-writable returns branch (b) {branch:'RESIDUE', reasons:[...]} with a non-empty reasons array when ANY of the 4 conditions fails — each reason is one of the enumerated keys graphVerificationFailed / unresolvedOmissions / missingExamples / grillInconsistent
- UT: [Invariant] check-readme-writable is deterministic — invoking twice with identical inputs (same graph file content, same omissions dir, same examplesDir, same grill status) returns the identical {branch, reasons}; the residue timestamp is INJECTED as an argument (generate-residue-filename.js is a separate step), so Date.now()/Math.random() never appears inside check-readme-writable
- UT: [Normal] generate-residue-filename produces RESIDUE-<YYYYMMDDhhmmss>.md from a fixed 14-digit timestamp argument (e.g. '20260817120000' → 'RESIDUE-20260817120000.md')
- UT: [Boundary] generate-residue-filename handles the 14-digit boundary — '00000000000000' and '99999999999999' both match /^RESIDUE-\d{14}\.md$/
- UT: [Normal] validate-readme-output passes when the last section heading is 'examples (implementation samples) spec and design' AND required header fields (title, target RFC, graph path) are present
- UT: [Error] validate-readme-output fails (exit 1) when the last section is missing or reordered, when README content is empty, or when a required header field is absent
- UT: [Boundary] validate-readme-output matches the trailing heading case-insensitively ('EXAMPLES (IMPLEMENTATION SAMPLES) SPEC AND DESIGN')
- UT: [Normal] validate-residue-output passes when RESIDUE has required header fields (対象RFC / 生成グラフ / 生成日時 / 判定理由) and at least one inventory entry carrying id / 要求事項 / 現状 / 証拠 / ステータス
- UT: [Error] validate-residue-output fails when a required header field is missing or the inventory section is empty
- UT: [Normal] validate-examples-spec passes when every sample file reference in the spec resolves to an existing file under examplesDir
- UT: [Error] validate-examples-spec fails listing each unresolvable sample file reference
- UT: [Normal] update-step-status.js start-step/end-step transitions persist step states to CRYSTALIZE-Status.json atomically (temp-file + rename) — reuse of .claude/scripts/rfc-graph/update-step-status.js pattern with --status= subcommand
- UT: [C001-Pre] derive-output-paths with a non-empty string sourceFile returns all 5 derived paths (precondition coverage)
- UT: [C001-Post] derive-output-paths outputs exactly {rfcDir, examplesDir, residuesDir, readmePath, residuePath} with the documented dirname relationships (postcondition coverage)
- UT: [C001-Inv] derive-output-paths invariant — path.dirname(examplesDir)===rfcDir && path.dirname(residuesDir)===rfcDir for arbitrary nested sourceFile (invariant coverage)
- UT: [C002-Pre] check-readme-writable consumes a graph object already schema-validated by validate-graph-arg (precondition coverage)
- UT: [C002-Post] check-readme-writable returns exactly one of branch 'README' (reasons=[]) or branch 'RESIDUE' (reasons.length>0) (postcondition coverage)
- UT: [C002-Inv] check-readme-writable determinism — same inputs, two invocations → identical branch and identical reasons list (invariant coverage)
- UT: [C003-Pre] check-toc-structure accepts the TOC input shape a list of headings with levels [{level:number, title:string}] (precondition coverage)
- UT: [C003-Post] check-toc-structure returns {ok:boolean, violations:[]} — violations is non-empty iff ok=false, listing duplicate/skippedLevel/missingCoverage/missingTrailingSection (postcondition coverage)
- UT: [C003-Inv] check-toc-structure invariant — the trailing section of any accepted TOC is always 'examples (implementation samples) spec and design' (invariant coverage)
- UT: [C004-Pre] generate-residue-filename with a valid 14-digit timestamp string returns a filename (precondition coverage)
- UT: [C004-Post] generate-residue-filename output matches /^RESIDUE-\d{14}\.md$/ (postcondition coverage)
- UT: [C004-Inv] generate-residue-filename format is fixed — identical timestamp input yields the identical filename; format stable across calls (collision-safe per second) (invariant coverage)
- UT: [C005-Pre] validate-readme-output with a non-empty README string runs without throwing (precondition coverage)
- UT: [C005-Post] validate-readme-output ok=true iff the last section heading is the examples section (postcondition coverage)
- UT: [C005-Inv] validate-readme-output invariant — every README accepted by the validator ends with the examples section; property-tested over README fixtures (invariant coverage)

### Integration Tests

- IT: End-to-end (a) branch — fixture tests/crystalize-readme/fixtures/valid-graph.json (clean verification, no omissions, populated examples/, grill status approved) → check-readme-writable exits 0 → README.md written to the fixture rfcDir → validate-readme-output passes and last section is 'examples (implementation samples) spec and design'
- IT: End-to-end (b) branch — fixture graph-with-omissions.json with omissions/OMISSIONS-*.json matching omissions-schema.json → check-readme-writable exits 1 → residues/RESIDUE-<ts>.md written with the judgment reasons → validate-residue-output passes
- IT: Step 0→4 flow with update-step-status.js — step transitions (step0→step1→step2→step3→step4) persist to CRYSTALIZE-Status.json and survive re-invocation (atomic write via temp-file + rename)
- IT: Smoke test against crates/siprs/RFC-ROOT-GRAPH.json — expected (b) RESIDUE branch because siprs has unresolved OMISSIONS (docs/OMISSIONS-2026-08-16.md + omissions/OMISSIONS-*.json); verifies fromHomeRelative() expansion of sourceFile "~/shyme/zasso/crates/siprs/RFC-ROOT.md" and that residues/RESIDUE-<ts>.md is created under crates/siprs/residues/
- IT: [Integration point] validate-graph-arg.js ↔ derive-output-paths.js — validate-graph-arg prints {ok:true, graph} to stdout; derive-output-paths consumes the same --graph file; the 5 derived paths are passed onward as a JSON interface {rfcDir, examplesDir, residuesDir, readmePath, residuePath}
- IT: [Integration point] check-readme-writable.js ↔ rfc-graph/verify.js — check-readme-writable spawns verify.js --graph=<path> --source=<sourceFile> and parses {ok, uncoveredHeadings, isolatedNodes, unresolvableRefs}; verifies the wiring to the existing rfc-graph verification
- IT: [Integration point] grill status ↔ check-readme-writable — Step 1 (TOC) and Step 2 (examples) grill write tocApproved/examplesApproved into CRYSTALIZE-Status.json; check-readme-writable reads them as condition 4; verifies the cross-step contract
- IT: [Verification] each IT asserts the actual artifact on disk (file exists, content structure validated by validate-*.js), not just exit codes; all files are written under a temp fixture dir and cleaned up after the test
- IT: [Prerequisites] fixtures under tests/crystalize-readme/fixtures/: valid-graph.json, empty-graph.json, graph-with-omissions.json, graph-with-broken-verification.json, graph-with-examples.json — each pre-validated against graph.schema.json; siprs RFC-ROOT-GRAPH.json used read-only
- IT: [Prerequisites] test runner make test-crystalize-readme runs node --test "tests/crystalize-readme/*.test.cjs" following the conver Makefile test-rfc-graph pattern; each fixture dir owns its examples/ and omissions/ subdirs so the 4 branch conditions are independently reproducible
- IT: [Related tickets] PX-152 (this ticket); depends on existing rfc-graph/verify.js + rfc-graph/update-step-status.js (used, not modified); a future /drill-rfc-down ticket consumes RESIDUE-*.md output; PX-151 (provider-agnostic session config) is unrelated

### Exceptions

- Item: Quality of AI-generated README/RESIDUE natural-language prose (TOC wording, examples spec synthesis, section body text). Reason: content synthesis is AI non-deterministic by design (determinism principle §5); the natural-language quality is not testable by an automated assertion because there is no objective correctness predicate for prose. Statement: this is NOT a design defect — the deterministic structure surrounding the prose (TOC validity, trailing examples section, RESIDUE header/inventory schema) IS asserted by validate-*.js in testUnit; only the prose itself is delegated to AI, which is the feature's explicit purpose. Alternative verification: structure validation scripts (check-toc-structure.js / validate-readme-output.js / validate-residue-output.js) + human review of the generated README during the /crystalize-readme smoke run.
- Item: Interactive user approval in the TOC grill (Yes/No/ABC response). Reason: the interaction requires a human in the loop; the step is not testable as a pure function because it waits on a human's free choice. Statement: this is not an architectural defect — the scripted proposal pipeline around it (extract-toc-candidates.js → check-toc-structure.js) IS tested deterministically, and the interactive gate is inherently human-mediated by design (mirroring /grill-me-for-rfc). Alternative verification: manual smoke during /crystalize-readme execution; the deterministic parts (candidate extraction, structure validation) are covered by testUnit.
- Item: AI's judgment in Step 2 when the graph has no examples-related nodes but examples/ has files — deciding whether to synthesize an examples spec anyway or record a RESIDUE reason. Reason: the decision requires semantic understanding of whether the implementation samples are user-facing, which is not testable by a deterministic predicate; the same input can legitimately produce different human judgments. Statement: this is not a design defect — the determinism principle (§5) explicitly delegates synthesis judgment to AI; the deterministic parts (node-kind extraction, file-existence checks, validate-examples-spec.js) ARE tested in testUnit. Alternative verification: human review during the grill; the deterministic existence checks are asserted by the check-readme-writable missingExamples condition test.

### Plan Test Code (concrete code)

- UT: [C001] derive-output-paths.js — Pre/Post/Invariant test code
```js
// C001-Pre: graph.sourceFile is a non-empty string path (possibly ~/-relative)
const graph = { sourceFile: '~/shyme/zasso/crates/siprs/RFC-ROOT.md', mainLanguage: 'rust', nodes: [], edges: [] };

// C001-Post: deriveOutputPaths expands ~/ via fromHomeRelative() BEFORE dirname
const paths = deriveOutputPaths(graph);
assert.equal(paths.rfcDir, path.dirname(path.resolve(os.homedir(), 'shyme/zasso/crates/siprs/RFC-ROOT.md')));
assert.equal(paths.examplesDir, path.join(paths.rfcDir, 'examples'));
assert.equal(paths.residuesDir, path.join(paths.rfcDir, 'residues'));
assert.equal(paths.readmePath, path.join(paths.rfcDir, 'README.md'));
assert.match(paths.residuePath, /^RESIDUE-\d{14}\.md$/);

// C001-Inv: examplesDir and residuesDir always live under rfcDir
assert.equal(path.dirname(paths.examplesDir), paths.rfcDir);
assert.equal(path.dirname(paths.residuesDir), paths.rfcDir);
```
- UT: [C002] check-readme-writable.js — Pre/Post/Invariant test code
```js
// C002-Pre: graph is schema-validated; checkReadmeWritable receives derived paths JSON
const paths = { rfcDir: '/tmp/px152-fixture', examplesDir: '/tmp/px152-fixture/examples', residuesDir: '/tmp/px152-fixture/residues', readmePath: '/tmp/px152-fixture/README.md', residuePath: '/tmp/px152-fixture/residues/RESIDUE-20260817120000.md' };

// C002-Post: returns exactly one of branch 'README' (reasons=[]) or branch 'RESIDUE' (reasons.length>0)
const decision = checkReadmeWritable(graphPath, paths);
assert.ok(decision.branch === 'README' || decision.branch === 'RESIDUE');
assert.ok(decision.branch === 'README' ? decision.reasons.length === 0 : decision.reasons.length > 0);

// C002-Inv: deterministic — identical inputs yield the identical decision (no Date.now/Math.random)
const again = checkReadmeWritable(graphPath, paths);
assert.deepStrictEqual(decision, again);
```
- UT: [C003] check-toc-structure.js — Pre/Post/Invariant test code
```js
// C003-Pre: TOC input shape is a list of headings with levels [{level:number, title:string}]
const toc = [
  { level: 1, title: 'Overview' },
  { level: 2, title: 'Usage' },
  { level: 2, title: 'Examples (implementation samples) spec and design' },
];

// C003-Post: violations is non-empty iff ok=false; typed violations for duplicates/skips
const result = checkTocStructure(toc);
assert.equal(result.ok, result.violations.length === 0);

// C003-Inv: any accepted TOC ends with the examples section (case-insensitive)
assert.match(toc[toc.length - 1].title, /examples \(implementation samples\) spec and design/i);
```
- UT: [C004] generate-residue-filename.js — Pre/Post/Invariant test code
```js
// C004-Pre: a valid 14-digit timestamp string is injected as an argument
const timestamp = '20260817120000';

// C004-Post: output filename matches /^RESIDUE-\d{14}\.md$/
const filename = generateResidueFilename(timestamp);
assert.match(filename, /^RESIDUE-\d{14}\.md$/);
assert.equal(filename, 'RESIDUE-20260817120000.md');

// C004-Inv: identical timestamp input yields the identical filename (collision-safe per second)
assert.equal(generateResidueFilename(timestamp), filename);
```
- UT: [C005] validate-readme-output.js — Pre/Post/Invariant test code
```js
// C005-Pre: README content is a non-empty string (via --readme=<path> or stdin)
const readme = [
  '# siprs README',
  '',
  '## Overview',
  '',
  '## Examples (implementation samples) spec and design',
  '',
].join('\n');
assert.ok(readme.length > 0);

// C005-Post: ok=true iff the last section heading is the examples section
const verdict = validateReadmeOutput(readme);
assert.equal(verdict.ok, true);

// C005-Inv: the trailing examples section is required, matched case-insensitively
const verdictUpper = validateReadmeOutput(readme.toUpperCase());
assert.equal(verdictUpper.ok, true);
```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| no /crystalize-readme capability existed (only DESIGN-OF-CRYSTALIZE-README.md + a Japanese command draft) | 10 deterministic scripts under .claude/scripts/crystalize-readme/ + package.json {"type":"commonjs"} | validate-graph-arg.js / derive-output-paths.js / extract-toc-candidates.js / check-toc-structure.js / validate-examples-spec.js / check-readme-writable.js / generate-residue-filename.js / validate-readme-output.js / validate-residue-output.js / update-step-status.js |
| no tests existed | 11 test files + fixtures/helpers.cjs (113 tests, node --test) | tests/crystalize-readme/*.test.cjs covering C001-C005 contracts, 4 branch conditions, CLI exit codes, e2e (a)/(b) branches, siprs read-only smoke test |
| Makefile had test-rfc-graph only | added test-crystalize-readme target | make test-crystalize-readme runs node --test tests/crystalize-readme/*.test.cjs |
| design doc §6 Step 3 said "uncovered 行 = 0, orphan node = 0" | corrected to uncoveredHeadings/isolatedNodes/unresolvableRefs (real verify.js axes) | Boy Scout spec correction in docs/DESIGN-OF-CRYSTALIZE-README.md and .claude/commands/crystalize-readme.md |
| command doc §3 used dirname on raw sourceFile | uses derive-output-paths.js --field=sourceFile (home-relative ~/ expanded) | Derived Paths consistency with fromHomeRelative() |

## Notes in Prior Implementation Rounds

- 【Implementation steps】(1) .claude/scripts/crystalize-readme/ を scaffold（package.json {"type":"commonjs"}）; (2) TDD: 各決定論スクリプトを RED→GREEN→REFACTOR（tests/crystalize-readme/*.test.cjs、node --test で実行）; (3) check-readme-writable.js を rfc-graph/verify.js と接続（spawn で --graph/--source を渡し {ok, uncoveredHeadings, isolatedNodes, unresolvableRefs} を parse）; (4) update-step-status.js パターンで CRYSTALIZE-Status.json 進行管理; (5) .claude/commands/crystalize-readme.md の日本語ドラフトを最終化; (6) 日本人ユーザー点検後、英語版を別途作成; (7) Makefile に test-crystalize-readme を追加。
- 【Risks】未解決 OMISSIONS の検出は機械可読形式（rfcDir/omissions/OMISSIONS-*.json、omissions-schema.json）に依存し、人間向け Markdown 目録（docs/OMISSIONS-2026-08-16.md）は形式不定のため検出対象にしない — この範囲は実装時に fixtures で固定する。グラフ検証は実測軸（uncoveredHeadings/isolatedNodes/unresolvableRefs）を使用する — 設計書の「uncovered 行」表現は実装時に是正する。
- 【Caveats】README/RESIDUE 本文の品質は AI 依存で、構造のみ validate-*.js で検証する。smoke ターゲット crates/siprs/RFC-ROOT-GRAPH.json は OMISSIONS 残存のため (b) RESIDUE 分岐が期待される（siprs README.md は現在空）。出力言語は対象 RFC の言語に追随（デフォルト英語）。
- 【Open items】OMISSIONS 検出の正確なスコープ（rfcDir/omissions/ の JSON のみか、親ディレクトリも走査するか）; README 出力言語の決定論的判定方法（mainLanguage フィールド由来か、本文言語由来か）; グリル状態が未確定（tocApproved/examplesApproved 未記録）の場合の check-readme-writable 分岐判定の挙動。
- 【Future improvements】RESIDUE-*.md を将来の /drill-rfc-down パイプラインに流し、Tickets.json の新チケットとして編成する（設計 §11）。
Implementation summary:
- Changed/added files: .claude/scripts/crystalize-readme/ (10 scripts + package.json), tests/crystalize-readme/ (11 test files + fixtures/helpers.cjs), Makefile, docs/DESIGN-OF-CRYSTALIZE-README.md, .claude/commands/crystalize-readme.md
- Key decisions reconciled with material evidence: (1) validate-graph-arg exit codes: arg-syntax errors=2, data errors=1; (2) empty nodes array is schema-valid and accepted (empty graph -> branch b, never a crash); (3) condition 3 redefined: graph.schema.json has no implementation_sample kind, so missingExamples = examplesDir absent/empty or examples-spec refs unresolvable; (4) residuePath in derive-output-paths is a RESIDUE-<YYYYMMDDhhmmss>.md template (timestamp injected by generate-residue-filename.js); (5) check-toc-structure input is {toc, expectedSections} so coverage is deterministic.
- Test results: make test-crystalize-readme 113/113 pass; make test-rfc-graph 932/932 pass (no regression); node --check all files OK; run-quality-checks 0 issues.
- Verified: smoke test on crates/siprs/RFC-ROOT-GRAPH.json takes branch (b) RESIDUE with unresolvedOmissions reason (read-only, no writes to the repo).
- [::TICKET::] annotations injected into all 10 scripts via annotate-ticket-context-by-git-diff.js; no [::AMBIGUOUS::] markers remain.
Review report:
- Static quality check: passed (run-quality-checks 0 issues on all scripts + test files)
- Translatability: fixed generic var data -> parsed in parseTocInput; no debug output, no magic numbers, function names are verb phrases
- Dependencies: verify.js / update-step-status.js / schema/validate.js / lib/path-utils reused read-only; no new runtime deps (ajv already in rfc-graph)
- Annotation: annotate-ticket-context-by-git-diff --verify reported 10/10 files annotated, 0 missing, 0 ambiguous; --check-ambiguous exit 0
- Crimes: 0 / Stubs: 0 / no-excuse gate exit 0
- Completeness: acceptance criteria verified via real CLI probes (exit 2 arg-syntax, exit 1 data, empty graph -> branch b no crash, siprs RESIDUE [unresolvedOmissions, grillInconsistent]); C001-C005 contracts covered (verify-red-coverage 5/5, verify-final-contracts coverage 100)
- Issues found and fixes applied during review: (1) removed stale duplicate specs/PX-152.md (canonical is tickets/specs/152-users-kawata-shyme-zasso-tools-conver-tickets-json.md per specPath); (2) renamed generic var data -> parsed in check-toc-structure.js; (3) confirmed no remaining console.log in scripts (converted to process.stdout.write during start phase)

## PX-152 — implemented at 57 locations

### .claude/scripts/crystalize-readme/check-readme-writable.js

- Line 65
```javascript
function parseArguments(args) {
```

- Line 91
```javascript
function evaluateWritableConditions(conditions) {
```

- Line 108
```javascript
function verifyGraph(graphPath, sourceFile) {
```

- Line 127
```javascript
function hasUnresolvedOmissions(rfcDir) {
```

- Line 142
```javascript
function hasExamples(examplesDir, examplesSpecPath) {
```

- Line 163
```javascript
function readGrillStatus(rfcDir) {
```

- Line 186
```javascript
function collectConditions(graphPath, examplesSpecPath) {
```

- Line 206
```javascript
function checkReadmeWritable(graphPath, examplesSpecPath) {
```

- Line 215
```javascript
function main() {
```

### .claude/scripts/crystalize-readme/check-toc-structure.js

- Line 27
```javascript
function normalize(text) {
```

- Line 39
```javascript
function parseTocInput(json) {
```

- Line 76
```javascript
function checkTocStructure({ toc, expectedSections = [] }) {
```

- Line 129
```javascript
function main() {
```

### .claude/scripts/crystalize-readme/derive-output-paths.js

- Line 49
```javascript
function parseArguments(args) {
```

- Line 79
```javascript
function deriveOutputPaths(graph) {
```

- Line 103
```javascript
function main() {
```

### .claude/scripts/crystalize-readme/extract-toc-candidates.js

- Line 27
```javascript
function parseArguments(args) {
```

- Line 46
```javascript
function extractTocCandidates(graph) {
```

- Line 62
```javascript
function main() {
```

### .claude/scripts/crystalize-readme/generate-residue-filename.js

- Line 31
```javascript
function parseArguments(args) {
```

- Line 51
```javascript
function generateResidueFilename(timestamp) {
```

- Line 62
```javascript
function main() {
```

### .claude/scripts/crystalize-readme/update-step-status.js

- Line 74
```javascript
function parseArguments(args) {
```

- Line 125
```javascript
function resolveStatusPath(parsed) {
```

- Line 139
```javascript
function createDefaultStatus(graphPath) {
```

- Line 163
```javascript
function readStatus(statusPath, graphPath) {
```

- Line 187
```javascript
function validateStepNumber(n) {
```

- Line 193
```javascript
function executeStartStep(status, n) {
```

- Line 201
```javascript
function executeEndStep(status, n) {
```

- Line 209
```javascript
function executeFailStep(status, n) {
```

- Line 216
```javascript
function executeResetToStep(status, n) {
```

- Line 226
```javascript
function executeApproveToc(status) {
```

- Line 233
```javascript
function executeApproveExamples(status) {
```

- Line 240
```javascript
function executeStatus(status) {
```

- Line 246
```javascript
function executeCleanup(status) {
```

- Line 275
```javascript
function executeBackup(status) {
```

- Line 293
```javascript
function atomicWrite(targetPath, data) {
```

- Line 307
```javascript
function exitWithError(message, reason, action) {
```

- Line 318
```javascript
function printUsage() {
```

- Line 345
```javascript
function main() {
```

### .claude/scripts/crystalize-readme/validate-examples-spec.js

- Line 28
```javascript
function parseArguments(args) {
```

- Line 58
```javascript
function parseSpec(specPath) {
```

- Line 80
```javascript
function validateExamplesSpec(spec, examplesDir) {
```

- Line 99
```javascript
function main() {
```

### .claude/scripts/crystalize-readme/validate-graph-arg.js

- Line 44
```javascript
function parseArguments(args) {
```

- Line 67
```javascript
function resolveGraphPath(arg) {
```

- Line 79
```javascript
function readGraphFile(graphPath) {
```

- Line 113
```javascript
function validateGraphSchema(graph) {
```

- Line 125
```javascript
function validateGraphArgument(graphPath) {
```

- Line 138
```javascript
function main() {
```

### .claude/scripts/crystalize-readme/validate-readme-output.js

- Line 27
```javascript
function parseArguments(args) {
```

- Line 52
```javascript
function normalize(text) {
```

- Line 63
```javascript
function validateReadmeOutput(text) {
```

- Line 97
```javascript
function main() {
```

### .claude/scripts/crystalize-readme/validate-residue-output.js

- Line 33
```javascript
function parseArguments(args) {
```

- Line 52
```javascript
function validateResidueOutput(text) {
```

- Line 105
```javascript
function main() {
```
