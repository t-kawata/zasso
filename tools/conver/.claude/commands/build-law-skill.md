---
description: Build a complete *-law skill from English Markdown sources; verify with the canonical verifier in dev and installed modes; install.
argument-hint: "<skill-name>=<source-doc>... | <skill-name> <source-doc>..."
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /build-law-skill

Role: build verified `*-law` skills from English Markdown. Derive profile, registry, source set, aliases, ledgers, OKF, runtime, tests, bundle, installer, integration. Canonical verifier decides completion in dev and installed modes. Never install unverified.

## Path Anchor

Run once:

```bash
printf '%s\n' "$PWD"
```

- `PWD_ROOT` = printed path (current directory).
- `CLAUDE_DIR="$PWD_ROOT/.claude"`.
- `SKILL_DIR="$PWD_ROOT/.claude/skills/<name>-law"` — fixed. No git-root `.claude`, no `DEV_ROOT`, no other project. No exception. `$CLAUDE_DIR` absent → stop.
- `ALIAS_PATH="$PWD_ROOT/.claude/skills/<name>-law.path-alias.json"` — outside the skill tree.
- `STAGING_DIR="$PWD_ROOT/target/law-build/<name>"`; `LAW_OUT="$PWD_ROOT/target/law"`.
- `REPO_ROOT="$(git rev-parse --show-toplevel)"` for repository-relative source paths only; never for `SKILL_DIR`.
- No second `git rev-parse`.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Arguments

- `<skill-name> <source-doc> [<source-doc> ...]` — one skill; every remaining argument is a source.
- `<skill-name>=<source-doc> [<skill-name>=<source-doc> ...]` — one or more skills; repeated name adds a source.
- Mixing forms → rejected as `INVALID_ARGUMENT`. Empty argument → `INVALID_ARGUMENT`.
- No flags. Hyphen-leading argument → `INVALID_ARGUMENT`.
- Source repository-relative. Absolute accepted only inside repository; manifest stores alias.
- Name matches `^[a-z][a-z0-9-]*-law$`.

## Invariants

- Positional only; no flag branch.
- Sources read-only; writes only under `STAGING_DIR`, `SKILL_DIR`, `ALIAS_PATH`, `LAW_OUT`.
- Canonical verifier unchanged; 18/18 `machine_verified` in dev mode is the only pass.
- Generated skill carries input ledger, alias map, redaction review, normative inventory, delivery coverage, node body hash, `source.md`, `source.baseline.md`.
- No install before verification; failed verification leaves existing skill untouched.
- Exact generated-skill CLI only in `SKILL.md`.
- Identical inputs → identical lock, coverage, OKF, bundle.
- `node --test` for impact set; never `make test`.

## Input Contract

| Condition | Decision |
|---|---|
| English UTF-8 Markdown with headings, tables, or fenced code | accept |
| Markdown with no headings | accept as one root document |
| Non-Markdown, binary, or NUL-containing file | reject `SOURCE_NOT_MARKDOWN` |
| CJK text | reject `SOURCE_NOT_ENGLISH` |
| CRLF or CR line endings | normalize to LF before hashing |
| Empty file, or no normative statement | reject `RULE_ZERO` after measurement |
| Self-described derived view (`derived view`, `generated from`, `summary of`, `index of`) | exclude with `DERIVED_EXCLUDED`; record alias + phrase |
| Ambiguous derivation | include; record `DERIVED_AMBIGUOUS`; never silently drop |
| Source outside repository root | reject `SOURCE_OUTSIDE_ROOT` |
| Source missing | reject `SOURCE_MISSING` |
| Registry table with `ID`, `Class`, `Applicability`, `Parent`, `Source`, `Statement`, `Verification`, `Gate` | use as rule registry |
| No registry table | author `source/rule-registry.md`; include in source set |

- Sources read-only.
- Manifest: alias path + `SHA-256` of LF-normalized text.
- CJK anywhere → reject whole build; no silent translation.

## Generated Skill Layout

```text
<name>-law/
├── SKILL.md
├── DESIGN.md
├── IMPLEMENTATION-LEFTOVERS.md
├── install.js
├── atoms.lock.json
├── coverage.json
├── coverage.md
├── dist/skill.mjs
├── source/manifest.toml
├── source/redaction.sha256.json
├── source/input-ledger.json
├── source/redaction.review.json
├── source/normative-inventory.json
├── source/delivery.json
├── source/skill-registry.toml
├── source/rule-registry.md     # only when the sources have no registry
├── okf/index.md
├── okf/log.md
├── okf/source.md
├── okf/source.baseline.md
├── okf/nodes/
├── scripts/{cli.mjs, commands.mjs, ingest.mjs, lib/}
├── tests/{atom-lock, redaction, generic-boundary, skill-runtime, integration,
│          bootstrap, scaffold, context-phases, render, applicability,
│          pipeline-checkpoints, source-rederivation, installed-parity,
│          verifier-negative}.test.mjs
└── tests/fixtures/runtime/runtime.json
```

Sibling: `<name>-law.path-alias.json` — outside the skill tree; holds `input_roots` and alias → original path.

## Procedure

### Step 0: Baseline

Run canonical verifier on the reference in dev mode:

```bash
node "$CLAUDE_DIR/scripts/amend-rfc-up/verify-law-skill.mjs" \
  --skill "$CLAUDE_DIR/skills/rust-interface-law" \
  --root "$PWD_ROOT" --mode dev \
  --source-root "$PWD_ROOT" \
  --path-alias "$CLAUDE_DIR/skills/rust-interface-law.path-alias.json" \
  --out "$LAW_OUT/reference-verification.json"
```

Require exit 0, `check_set_version: 2`, 18/18 `machine_verified`, closure recorded. Reference fail → stop.

### Step 1: Parse

- Absolute source → repository-relative.
- Reject empty, hyphen-leading, bad name, mixed forms.
- Write `$LAW_OUT/build-units.json`; no skill write before all units pass.

### Step 2: Measure

- Per source: read bytes; reject NUL/non-Markdown; normalize LF; reject CJK; hash; measure lines, headings, fences, table rows, normative statements.
- Derived-view phrase → exclude + record; ambiguous → include + `DERIVED_AMBIGUOUS`.
- Zero normative → `RULE_ZERO`; never invent a rule.
- Write `$STAGING_DIR/source/measurements.json`; re-read → hash unchanged.

### Step 3: Profile

Derive `law-profile.toml`; never copy Rust values.

| Field | Derivation |
|---|---|
| `domain` | level-1 title, slugged; fall back to first source path |
| `surfaces` | level-2 headings, slugged, ordered; max 16 |
| `roles` | `core`, `operation`, `adapter`, `conformance`, `docs` + every surface |
| `phases` | `scope`, every surface, `review`; source order |
| `rule_prefixes` | uppercase first alphabetic segment per phase; numeric suffix on collision |
| `canonical_roles` | role → project path glob; map to discovered units |
| `discovery` | manifest names, source roots, globs; generic scan, never Rust-only |
| `detectors` | `todo`, `unimplemented`, `panic`, task markers (`todo`, `fixme`, `hack`, `xxx`), secrets; domain detector only with positive + negative fixture |
| `templates` | optional catalog; empty valid |
| `gate_levels` | V1 process, V2 structural, V3 command, V4 attestation |
| `language` | `en` |

Write with stable sort. Profile is data: source heading change → profile change, no script edit.

### Step 4: Registry

No registry table → write `source/rule-registry.md` with `ID | Class | Applicability | Parent | Source | Statement | Verification | Gate`.

| Rule | Requirement |
|---|---|
| ID grammar | `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$`; multi-segment valid |
| Granularity | one normative statement per row; no multi-rule cell |
| Allocation | source order, heading order, `01`, `02`, … per prefix |
| Stability | keep ID on statement change; append new; retire without reuse |
| Provenance | `Source` = document + heading; `Statement` self-contained |
| Verification | `V1`, `V2`, `V3`, `V4`; `Gate` = stage |
| Bijection | Rule Atoms ↔ registry rows: equal count, equal ID set |

Untestable statement → refine before extraction.

### Step 5: Source set, redaction, alias, input ledger

- `source/manifest.toml`: `spec_version`, `source_set_sha256` (over alias `path\0sha256`), `redaction_sha256`, one `[[file]]` per source; alias only, never original path.
- `source/redaction.sha256.json`: `[{sha256, placeholder}]`; hash-only, injective placeholder.
- Redact project, product, repository, organization, user, ticket, private-host identifiers. Keep normative constants (versions, ports, protocols, technologies).
- Apply to text + heading path. Unknown proper noun → review list.
- `source/redaction.review.json`: every candidate (capitalized token, or token already in the map) → `redacted` / `allowlist` / `generic`; `redacted` requires a category; over-redacted normative constant fails.
- `<name>-law.path-alias.json`: `law-path-alias/v1`; `input_roots` + alias → original; placed outside the skill tree; every distributable path is an alias.
- `source/input-ledger.json`: `law-input-ledger/v1`; every input under the declared roots → `included` or `excluded` + reason + source phrase; included ↔ manifest.
- `source/skill-registry.toml`: invariants + runnable verification.

### Step 6: Engine TDD

Red first: failing tests per library.

| Library | Responsibility | Red test |
|---|---|---|
| `atoms` | block parse, Atom identity, classification | registry row is Rule Atom; identity survives line shift |
| `markdown` | headings, tables, fences, lists | fenced block and table are typed Atoms |
| `coverage` | line partition | every line attributed or excluded |
| `redact` | hash-only mapping | map has only `sha256` and `placeholder` |
| `registry` | ID grammar and bijection | duplicate or malformed ID fails |
| `path-alias` | alias → original resolution | unmapped alias fails |
| `redaction-review` | candidate completeness | undecided candidate fails |
| `normative-inventory` | normative coverage | orphan normative atom fails |
| `delivery` | fact-bearing coverage | silent reference fails |
| `closure` | manifest and delivery | only planned phases + `must` nodes delivered |
| `okf` | frontmatter and node render | structural Atom never `must` |
| `context` | phase delivery and ledger | out-of-order phase fails |
| `gate` | statuses and findings | `unverifiable`, `not_run`, `failed` never pass |
| `attest` | phase rows | `unset` blocks completion |
| `render-ai` | Markdown output | deterministic |
| `autoconfig` | profile-driven discovery | renamed unit changes manifest, no script edit |
| `units` | profile roles and path match | unrelated path exits 3 |
| `commands` | CLI dispatch | unknown command exits 2 |

- Green: behavior, not literal test wording.
- Refactor: remove duplicated path resolution, hardcoded values, false comments, untested branches; check Green before/after; rollback break.
- Generalize reference fixed values: interface list, Cargo discovery, role list, phase map, source-file list, single-directory `basename`.
- Generated `scripts/`: no Rust token, no example literal.

### Step 6.5: Normative inventory and delivery coverage

- `source/normative-inventory.json`: `law-normative-inventory/v1`; every normative Atom → Rule ID or `non-rule` + explicit reason. No orphan normative statement.
- `source/delivery.json`: `law-delivery/v1`; defaults + every normative or fact-bearing Atom → `must` or explicit `reference` with a specific reason and `delivered_by`. No silent delivery omission.
- Fact-bearing: `Rule`; normative `Paragraph`/`List`; non-empty `CodeBlock`; `Table` whose header carries a fact column.
- A fact-bearing `Table`/`Paragraph`/`List` left `reference` requires `delivered_by` IDs that exist in the lock.
- Inventory and delivery are deterministic and reproducible from the source set.

### Step 7: OKF

- One Atom = one node.
- Frontmatter: `type`, `id`, `phase`, `delivery`, `applies_to`, `requires`, `references`, `content_sha256`, `source`.
- `delivery=must` only for Rule, CodeBlock, ContractType, InterfaceBinding, Operation, Documentation, Conformance; structural never `must`.
- Node body = Atom text + one trailing newline; SHA-256 of the body after removing that newline equals `content_sha256`.
- Write `okf/index.md`, `okf/log.md`, `okf/source.md`, `okf/source.baseline.md`.
- `okf/source.md` = manifest order, `# Source: <alias>` headers, redacted source text; `okf/source.baseline.md` byte-identical.
- Delivered context from lock; AI never reads `okf/`.

### Step 8: Bundle and installer

- `dist/skill.mjs`: pinned esbuild, one entry, ESM, no source map; resolves `okf/` sibling; `absWorkingDir` pinned to the skill root; atomic write.
- `install.js`: copy-only; copies `dist/skill.mjs`, `okf/`, `source/`, `templates/`, `tests/fixtures/runtime/runtime.json`; no build, judge, or target edit.

### Step 9: Test matrix

- `node --test`; optional dist/esbuild test reported, never pass.
- Required: `atom-lock`, `redaction`, `generic-boundary`, `skill-runtime`, `integration`, `bootstrap`, `scaffold`, `context-phases`, `render`, `applicability`, `pipeline-checkpoints`, `source-rederivation`, `installed-parity`, `verifier-negative`.
- Include determinism, performance, forbidden-token, leak, coverage, style: `STYLE_NOT_ENGLISH`, `STYLE_NOT_TELEGRAPHIC`, `STYLE_LOW_DENSITY`, `STYLE_REDUNDANT`.
- Never `make test`.

### Step 10: Verify

Dev mode:

```bash
node "$CLAUDE_DIR/scripts/amend-rfc-up/verify-law-skill.mjs" \
  --skill "$STAGING_DIR" \
  --root "$PWD_ROOT" --mode dev \
  --source-root "$PWD_ROOT" \
  --path-alias "$ALIAS_PATH" \
  --out "$LAW_OUT/<name>-dev-verification.json"
```

Require exit 0, `check_set_version: 2`, 18/18 `machine_verified`, closure recorded.

Installed mode:

```bash
INSTALL_TARGET="$(mktemp -d)"
node "$STAGING_DIR/install.js" "$INSTALL_TARGET"
node "$CLAUDE_DIR/scripts/amend-rfc-up/verify-law-skill.mjs" \
  --skill "$INSTALL_TARGET/.claude/skills/<name>-law" \
  --root "$PWD_ROOT" --mode installed \
  --path-alias "$ALIAS_PATH" \
  --out "$LAW_OUT/<name>-installed-verification.json"
```

Require exit 0, 8/8 installed required checks `machine_verified`, source/installed SHA match. Then `check lint`, `check graph`, `check coverage --lock`, `check audit --lock`; `rebuild` byte-identical; forbidden-token scan; runtime scan. Any failure → no install.

### Step 11: Install

- Copy staging tree atomically → `SKILL_DIR`; existing `SKILL_DIR` → backup under `LAW_OUT/backup/`.
- Copy/post-check fail → rollback backup; `INSTALL_BLOCKED`.
- Copy `ALIAS_PATH` beside `SKILL_DIR`; never inside it.
- Installed `dist` resolves sibling `okf/`; installed mode passes; `applies` 0 on target, 3 unrelated.

### Step 12: Integrate

- Per skill: conditional block in `"$CLAUDE_DIR/CLAUDE.md"`: trigger, `applies`, invoke, completion (`gate` 0 + `attest` ok), v2 dev + installed closure.
- Add `## Integration Checkpoints`.
- Write only to `$PWD_ROOT/.claude`; never mirror the skill into a git-root or another project `.claude/skills`.

### Step 13: Acceptance

- Sources: `## Acceptance Fixtures`.
- Per build: run end to end; record source hashes, lines, Atom/Rule counts, gaps, overlaps, mode, `check_set_version`, closure, installed SHA in `law-builds.json`; run `tests/build-law-skill/acceptance/verify-law-builds.mjs`.
- Producer proof: `tests/build-law-skill/acceptance/fixtures/mini/` is a synthetic mini law skill verified in dev and installed modes; the three-document build remains first-use acceptance.
- Mutation matrix:

| Mutation | Required result |
|---|---|
| Rename directory or file | Atom IDs + content hashes unchanged after path normalization |
| Reorder sources | rule set + coverage unchanged |
| Combine sources into one skill | gaps 0, overlaps 0 |
| Remove registry | registry authored; bijection holds |
| `MUST`→`SHALL`, `Never`→`Prohibited` | classification adapts via profile vocabulary |
| Inject CRLF | LF-normalized; hashes stable |
| Duplicate heading | Atom IDs unique |
| Remove all headings | one root heading path |
| Add derived-view document | excluded with recorded phrase |
| Add no-normative document | `RULE_ZERO`; no install |
| Inject forbidden token | redaction test fails until mapped |
| Remove input ledger | `ARTIFACT_MISSING`; no install |
| Remove alias map | `PATH_ALIAS_MISSING`; no install |
| Inject unmapped candidate | `REDACTION_CANDIDATE_UNRESOLVED` |
| Add normative paragraph without inventory | `NORMATIVE_ORPHAN` |
| Fact-bearing table without `delivered_by` | `DELIVERY_OMISSION` |
| Tamper node body | `LOCK_BODY_HASH_MISMATCH` |
| Tamper `source.md` | `SOURCE_VIEW_DRIFT` |
| Tamper installed copy | `INSTALLED_SHA_MISMATCH` |
| Run from another cwd | same output |
| Expand to 2.5k Atoms | performance budget met |

Scan generated tree for example literals + Rust tokens. Only this section may name fixtures.

### Step 14: Report

- Report per skill: name, sources, profile hash, source count, lines, Atom count, Rule count, gaps, overlaps, ledger counts, `check_set_version`, dev closure, installed closure, installed SHA parity, install path, leftovers.
- Report mutation results + adoption gaps.
- Completion: every skill `machine_verified` in dev and installed, `rebuild` byte-identical, install verified, acceptance record pass.

## Verification Gates

| Gate | Pass |
|---|---|
| Canonical verifier dev | `verify-law-skill.mjs` exit 0; `check_set_version: 2`; 18 checks `machine_verified`; closure recorded |
| Canonical verifier installed | installed tree; 8 required checks `machine_verified`; source/installed SHA match |
| Check set | `layer`, `manifest`, `lock`, `coverage`, `registry`, `genericBoundary`, `delivery`, `runtime`, `reproduction`, `tests`, `installer`, `determinism`, `redaction`, `coverageSemantics`, `inputLedger`, `pathAlias`, `installedLeak`, `style` |
| Bundle lint | `check lint` exit 0 |
| Graph | `check graph` exit 0 |
| Coverage | `check coverage --lock` exit 0 |
| Audit | `check audit --lock` exit 0 |
| Reproduction | `rebuild` prints byte-identical |
| Boundary | forbidden-token scan zero; alias map outside the skill tree |
| Applicability | `applies` 0 on target, 3 unrelated |
| Install | installed `dist/skill.mjs` resolves sibling `okf/` |
| Acceptance | strict record + generality mutations pass |

## Failure Modes

| Code | Cause | Action |
|---|---|---|
| `INVALID_ARGUMENT` | empty, hyphen-leading, bad name, or mixed forms | print grammar; write nothing |
| `SOURCE_MISSING` | source absent | print path; write nothing |
| `SOURCE_OUTSIDE_ROOT` | source outside repository | print resolved path; write nothing |
| `SOURCE_NOT_ENGLISH` | CJK detected | print line; write nothing |
| `SOURCE_NOT_MARKDOWN` | binary, NUL, unsupported extension | print detection; write nothing |
| `DERIVED_EXCLUDED` | self-described derived view | record alias + phrase; continue |
| `RULE_ZERO` | no normative statement | stop before profile |
| `ARTIFACT_MISSING` | a v2 artifact is absent | write the artifact; re-verify |
| `LEAK_DETECTED` | forbidden token or original path | map the candidate; no install |
| `PATH_ALIAS_MISSING` | alias absent or map inside the tree | write the sibling map; re-verify |
| `NORMATIVE_ORPHAN` | normative Atom without inventory decision | add the decision; re-verify |
| `DELIVERY_OMISSION` | fact-bearing Atom without delivery | add the ledger entry; re-verify |
| `COVERAGE_GAP` | gap, overlap, attribution mismatch | re-extract; never hand-edit lock |
| `REGISTRY_MISMATCH` | Rule Atoms ≠ registry rows | repair IDs; reclassify |
| `NON_DETERMINISTIC` | rebuild drift | remove timestamps, unordered iteration, absolute paths |
| `VERIFIER_FAILED` | any check not `machine_verified` | repair; re-verify; no install |
| `VERIFIER_V2_FAILED` | v2 check contract not satisfied | repair the artifact; re-run dev and installed |
| `INSTALLED_SHA_MISMATCH` | source and installed differ | reinstall; no completion |
| `CHECKPOINT_INVALID` | checkpoint over 5 lines or carries exact CLI | rewrite the checkpoint |
| `INSTALL_BLOCKED` | copy or post-check fail | restore backup; report |

## Integration Checkpoints

- `make-ticket`: invoke each built law skill; record `Law:` scope; law skill built/changed → record v2 `dev` and `installed` closure, every required check `machine_verified`.
- `plan-ticket`: read `Law:`; plan phases; `SKILL.md` owns exact CLI; plan v2 `dev` + `installed`; check set is 18.
- `start-ticket`: re-run applicability; resolve; deliver context; gate; attest; before completion run v2 `dev` + `installed`; every required check `machine_verified`.
- `review-ticket`: regenerate manifest; gate; attest; re-run v2 `dev` + `installed`; compare `closure`; state V1-only honesty.
- `resolve-ticket`: repair gate findings; fill attestation; no status change; repair until v2 `dev` + `installed` pass.

## Acceptance Fixtures

| Fixture | Path |
|---|---|
| WAN/NAT laboratory handbook | `docs/NATLAB/Implementation-Handbook.md` |
| Apple-Silicon local FFI runbook | `docs/BUILDENV/Apple-Silicon-Local-Rust-FFI-Runbook.md` |
| PJSIP native build guide | `docs/BUILDENV/PJSIP-BUILD-GUIDE.md` |

- Strict acceptance: all three parse, hash, measure, derive distinct profiles, allocate unique rule candidates; full build passes canonical verifier.
- Generality mutations use copies; originals unchanged.

## Completion

- Every built skill: canonical verifier dev 18/18 and installed 8/8 `machine_verified`, `rebuild` byte-identical, forbidden-token scan zero, installed bundle resolves `okf/`, source/installed SHA match, acceptance record pass, integration mirror byte-identical.
- Report adoption gaps; never claim V1 as rule-level proof.
