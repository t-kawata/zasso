---
description: Build a complete *-law skill from English Markdown sources; verify with the canonical verifier; install.
argument-hint: "<skill-name>=<source-doc>... | <skill-name> <source-doc>..."
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /build-law-skill

Role: build verified `*-law` skills from English Markdown. Derive profile, registry, source set, OKF, runtime, tests, bundle, installer, integration. Canonical verifier decides completion. Never install unverified.

## Path Anchor

Run once:

```bash
printf '%s\n' "$PWD"
```

- `PWD_ROOT` = printed path (current directory).
- `CLAUDE_DIR="$PWD_ROOT/.claude"`.
- `SKILL_DIR="$PWD_ROOT/.claude/skills/<name>-law"` — fixed. No git-root `.claude`, no `DEV_ROOT`, no other project. No exception. `$CLAUDE_DIR` absent → stop.
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
- Source repository-relative. Absolute accepted only inside repository; manifest stores relative.
- Name matches `^[a-z][a-z0-9-]*-law$`.

## Invariants

- Positional only; no flag branch.
- Sources read-only; writes only under `STAGING_DIR`, `SKILL_DIR`, `LAW_OUT`.
- Canonical verifier unchanged; 11/11 `machine_verified` only pass.
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
| Self-described derived view (`derived view`, `generated from`, `summary of`, `index of`) | exclude with `DERIVED_EXCLUDED`; record path + phrase |
| Ambiguous derivation | include; record `DERIVED_AMBIGUOUS`; never silently drop |
| Source outside repository root | reject `SOURCE_OUTSIDE_ROOT` |
| Source missing | reject `SOURCE_MISSING` |
| Registry table with `ID`, `Class`, `Applicability`, `Parent`, `Source`, `Statement`, `Verification`, `Gate` | use as rule registry |
| No registry table | author `source/rule-registry.md`; include in source set |

- Sources read-only.
- Manifest: repository-relative path + `SHA-256` of LF-normalized text.
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
├── source/skill-registry.toml
├── source/rule-registry.md     # only when the sources have no registry
├── okf/{index.md, log.md, source.md, source.baseline.md, nodes/}
├── scripts/{cli.mjs, commands.mjs, ingest.mjs, lib/}
└── tests/{atom-lock, redaction, generic-boundary, skill-runtime, integration,
           bootstrap, scaffold, context-phases, render, applicability,
           pipeline-checkpoints}.test.mjs
```

## Procedure

### Step 0: Baseline

Run canonical verifier on reference:

```bash
node "$CLAUDE_DIR/scripts/amend-rfc-up/verify-law-skill.mjs" \
  --skill "$CLAUDE_DIR/skills/rust-interface-law" \
  --root "$PWD_ROOT" --source-root "$PWD_ROOT" \
  --out "$LAW_OUT/reference-verification.json"
```

Require exit 0 + 11/11 `machine_verified`. Reference fail → stop.

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

### Step 5: Source set, redaction, skill registry

- `source/manifest.toml`: `spec_version`, `source_set_sha256` (over `path\0sha256`), `redaction_sha256`, one `[[file]]` per source; paths relative, never absolute.
- `source/redaction.sha256.json`: `[{sha256, placeholder}]`.
- Redact project, product, repository, organization, user, ticket, private-host identifiers. Keep normative constants (versions, ports, protocols, technologies).
- Apply to text + heading path. Unknown proper noun → review list.
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

### Step 7: OKF

- One Atom = one node.
- Frontmatter: `type`, `id`, `phase`, `delivery`, `applies_to`, `requires`, `references`, `content_sha256`, `source`.
- `delivery=must` only for Rule, CodeBlock, ContractType, InterfaceBinding, Operation, Documentation, Conformance; structural never `must`.
- Write `index.md`, `log.md`, `source.md`, `source.baseline.md`.
- Delivered context from lock; AI never reads `okf/`.

### Step 8: Bundle and installer

- `dist/skill.mjs`: pinned esbuild, one entry, ESM, no source map; resolves `okf/` sibling.
- `install.js`: copy-only; copies `dist/skill.mjs`, `okf/`, `source/`, `templates/`; no build, judge, or target edit.

### Step 9: Test matrix

- `node --test`; optional dist/esbuild test reported, never pass.
- Required: `atom-lock`, `redaction`, `generic-boundary`, `skill-runtime`, `integration`, `bootstrap`, `scaffold`, `context-phases`, `render`, `applicability`, `pipeline-checkpoints`.
- Include determinism, performance, forbidden-token.
- Never `make test`.

### Step 10: Verify

```bash
node "$CLAUDE_DIR/scripts/amend-rfc-up/verify-law-skill.mjs" \
  --skill "$STAGING_DIR" \
  --root "$PWD_ROOT" --source-root "$PWD_ROOT" \
  --out "$LAW_OUT/<name>-verification.json"
```

Require exit 0, 11/11, closure. Then `check lint`, `check graph`, `check coverage --lock`, `check audit --lock`; `rebuild` byte-identical; forbidden-token scan. Any failure → no install.

### Step 11: Install

- Copy staging tree atomically → `SKILL_DIR`; existing `SKILL_DIR` → backup under `LAW_OUT/backup/`.
- Copy/post-check fail → rollback backup; `INSTALL_BLOCKED`.
- Installed `dist` resolves sibling `okf/`; `applies` 0 on target, 3 unrelated.

### Step 12: Integrate

- Per skill: conditional block in `"$CLAUDE_DIR/CLAUDE.md"`: trigger, `applies`, invoke, completion (`gate` 0 + `attest` ok).
- Add `## Integration Checkpoints`.
- Write only to `$PWD_ROOT/.claude`; never mirror the skill into a git-root or another project `.claude/skills`.

### Step 13: Acceptance

- Sources: `## Acceptance Fixtures`.
- Per build: run end to end; record source hashes, lines, Atom/Rule counts, gaps, overlaps, closure in `law-builds.json`; run `tests/build-law-skill/acceptance/verify-law-builds.mjs`.
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
| Run from another cwd | same output |
| Expand to 2.5k Atoms | performance budget met |

Scan generated tree for example literals + Rust tokens. Only this section may name fixtures.

### Step 14: Report

- Report per skill: name, sources, profile hash, source count, lines, Atom count, Rule count, gaps, overlaps, closure, install path, leftovers.
- Report mutation results + adoption gaps.
- Completion: every skill `machine_verified`, `rebuild` byte-identical, install verified, acceptance record pass.

## Verification Gates

| Gate | Pass |
|---|---|
| Canonical verifier | `verify-law-skill.mjs` exit 0; 11 checks `machine_verified`; closure recorded |
| Bundle lint | `check lint` exit 0 |
| Graph | `check graph` exit 0 |
| Coverage | `check coverage --lock` exit 0 |
| Audit | `check audit --lock` exit 0 |
| Reproduction | `rebuild` prints byte-identical |
| Boundary | forbidden-token scan zero |
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
| `DERIVED_EXCLUDED` | self-described derived view | record path + phrase; continue |
| `RULE_ZERO` | no normative statement | stop before profile |
| `COVERAGE_GAP` | gap, overlap, attribution mismatch | re-extract; never hand-edit lock |
| `REGISTRY_MISMATCH` | Rule Atoms ≠ registry rows | repair IDs; reclassify |
| `NON_DETERMINISTIC` | rebuild drift | remove timestamps, unordered iteration, absolute paths |
| `VERIFIER_FAILED` | any check not `machine_verified` | repair; re-verify; no install |
| `INSTALL_BLOCKED` | copy or post-check fail | restore backup; report |

## Integration Checkpoints

- `make-ticket`: invoke each built law skill; record `Law:` scope.
- `plan-ticket`: read `Law:`; plan phases; `SKILL.md` owns exact CLI.
- `start-ticket`: re-run applicability; resolve; deliver context; gate; attest.
- `review-ticket`: regenerate manifest; gate; attest; state V1-only honesty.
- `resolve-ticket`: repair gate findings; fill attestation; no status change.

## Acceptance Fixtures

| Fixture | Path |
|---|---|
| WAN/NAT laboratory handbook | `docs/NATLAB/Implementation-Handbook.md` |
| Apple-Silicon local FFI runbook | `docs/BUILDENV/Apple-Silicon-Local-Rust-FFI-Runbook.md` |
| PJSIP native build guide | `docs/BUILDENV/PJSIP-BUILD-GUIDE.md` |

- Strict acceptance: all three parse, hash, measure, derive distinct profiles, allocate unique rule candidates; full build passes canonical verifier.
- Generality mutations use copies; originals unchanged.

## Completion

- Every built skill: canonical verifier pass, `rebuild` byte-identical, forbidden-token scan zero, installed bundle resolves `okf/`, acceptance record pass, integration mirror byte-identical.
- Report adoption gaps; never claim V1 as rule-level proof.
