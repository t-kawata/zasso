---
description: Build a complete *-okf wiki skill from English Markdown sources; verify with the canonical OKF verifier in dev and installed modes; install.
argument-hint: "<skill-name>=<source-doc>... | <skill-name> <source-doc>..."
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /build-okf-skill

Role: build verified `*-okf` wiki skills from English Markdown. A generated skill turns a frozen source set into an OKF knowledge wiki and exposes deterministic retrieval, citation, freshness, conflict, and answer-verification commands. It is a knowledge delivery system, not a gate. Canonical verification decides completion in dev and installed modes. Never install unverified.

## Path Anchor

Run once:

```bash
printf '%s/.claude\n' "$(git rev-parse --show-toplevel)"
```

Record the printed path as `CLAUDE_DIR`. Use that literal path below. Do not run `git rev-parse` again.

- `REPO_ROOT="${CLAUDE_DIR%/.claude}"`.
- `SKILL_DIR="$CLAUDE_DIR/skills/<name>-okf"` — fixed. No other project `.claude`.
- `ALIAS_PATH="$CLAUDE_DIR/skills/<name>-okf.path-alias.json"` — outside the skill tree.
- `STAGING_DIR="$REPO_ROOT/target/okf-build/<name>"`; `OKF_OUT="$REPO_ROOT/target/okf"`.

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
- Mixing forms → `INVALID_ARGUMENT`. Empty argument → `INVALID_ARGUMENT`.
- No flags. Hyphen-leading argument → `INVALID_ARGUMENT`.
- Source repository-relative. Absolute accepted only inside the repository; the manifest stores an alias.
- Name matches `^[a-z][a-z0-9-]*-okf$`.

## Invariants

- Positional only; no flag branch.
- Sources read-only; writes only under `STAGING_DIR`, `SKILL_DIR`, `ALIAS_PATH`, `OKF_OUT`.
- Canonical verifier: `check_set_version: 1`; 19 checks `machine_verified` in dev mode is the only pass.
- Every Claim node carries `source`, `span`, `source_sha256`, and `content_sha256`.
- Every node appears once in `okf/index.md`; every `links` target exists.
- A stale node is never presented as current by ask, context, or page.
- A one-sided conflict is `CONFLICT_ASYMMETRIC`; no automatic deletion or silent winner.
- Generated `SKILL.md` is a complete usage manual: scenarios, recipes, citation rules, freshness, conflicts, update, authoring, failures, and at least two examples.
- No forced edits to `CLAUDE.md` or the make/plan/start/review/resolve commands.
- Generated skill contains no ticket id, project name, original absolute path, or CJK.
- Identical inputs → identical lock, coverage, OKF, bundle.
- Shared engine modules are copied at build time and guarded by a SHA-256 drift test.
- `node --test` for the impact set; never `make test`.

## Input Contract

| Condition | Decision |
|---|---|
| English UTF-8 Markdown with headings, paragraphs, tables, or fenced code | accept |
| Markdown with no headings | accept as one root document |
| Non-Markdown, binary, or NUL-containing file | reject `SOURCE_NOT_MARKDOWN` |
| CJK text | reject `SOURCE_NOT_ENGLISH` |
| CRLF or CR line endings | normalize to LF before hashing |
| No claim-bearing block (paragraph, list, code, table) | reject `INFORMATION_ZERO` |
| Self-described derived view (`derived view`, `generated from`, `summary of`, `index of`) | exclude with `DERIVED_EXCLUDED`; record alias + phrase |
| Ambiguous derivation | include; record `DERIVED_AMBIGUOUS`; never silently drop |
| Source outside repository root | reject `SOURCE_OUTSIDE_ROOT` |
| Source missing | reject `SOURCE_MISSING` |
| Claim registry table | optional; when absent, derive topic and claim from each block |
| Duplicate source basename | reject `SOURCE_ALIAS_DUPLICATE` |

- Sources read-only.
- Manifest: alias path + `SHA-256` of LF-normalized text.
- CJK anywhere → reject the whole build; no silent translation.

## Generated Skill Layout

```text
<name>-okf/
├── SKILL.md
├── DESIGN.md
├── IMPLEMENTATION-LEFTOVERS.md
├── install.js
├── atoms.lock.json
├── okf/index.md
├── okf/log.md
├── okf/source.md
├── okf/source.baseline.md
├── okf/nodes/
├── source/manifest.toml
├── source/redaction.sha256.json
├── source/input-ledger.json
├── source/redaction.review.json
├── source/claim-inventory.json
├── source/claim-registry.json
├── source/knowledge-coverage.json
├── source/line-coverage.json
├── source/shared-engine.json
├── source/okf-profile.toml
├── scripts/{cli.mjs, commands.mjs, ingest.mjs, lib/}
├── dist/skill.mjs
└── tests/{smoke.test.mjs, fixtures/runtime/runtime.json}
```

Sibling: `<name>-okf.path-alias.json` — outside the skill tree; holds `input_roots` and alias → original path.

## Procedure

### Step 0: Baseline

- Require `$CLAUDE_DIR/scripts/amend-rfc-up/verify-okf-skill.mjs`.
- Require `$CLAUDE_DIR/scripts/amend-rfc-up/okf-verify/checks.json`; require `check_set_version: 1` and 19 named checks with `both` / `dev` modes.
- Require `$CLAUDE_DIR/scripts/amend-rfc-up/okf-engine/scripts/cli.mjs` and `okf-engine/scripts/lib/claims.mjs`.
- Missing or mismatched → stop before any write. Never copy, patch, or replace the canonical verifier.

### Step 1: Parse

- Absolute source → repository-relative.
- Reject empty, hyphen-leading, bad name, mixed forms.
- Write `$OKF_OUT/build-units.json`; no skill write before all units pass.

### Step 2: Measure

- Per source: read bytes; reject NUL/non-Markdown; normalize LF; reject CJK; hash; measure lines and blocks.
- Derived-view phrase → exclude + record; ambiguous → include + `DERIVED_AMBIGUOUS`.
- No claim-bearing block → `INFORMATION_ZERO`; never invent a claim.
- Write `$STAGING_DIR/source/measurements.json`; re-read → hash unchanged.

### Step 3: Profile

Derive `source/okf-profile.toml`; never copy another project's values.

| Field | Derivation |
|---|---|
| `domain` | level-1 title, slugged; fall back to first source path |
| `topics` | level-2 headings, slugged, ordered; max 64 |
| `roles` | `page`, `claim`, `entity`, `procedure`, `reference` |
| `discovery` | manifest names, source roots, globs |
| `detectors` | `todo`, `fixme`, `hack`, `xxx`, secrets |
| `language` | `en` |
| `limits` | `max_answer_nodes=20`, `node_budget=2500` |

Write with stable sort. Profile is data: a source heading change → profile change, no script edit.

### Step 4: Claim registry

- One Claim node per claim-bearing block.
- Registry columns: `ID | Topic | Claim | Evidence | Source | Freshness | Confidence`.
- ID grammar: `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$`.
- Bijection: Claim Atoms ↔ registry rows; equal count, equal ID set.
- Every row carries a source alias and a line span.
- Unsourced claim → `CLAIM_UNSOURCED`; never promote it to `must`.

### Step 5: Source set, redaction, alias, input ledger

- `source/manifest.toml`: `spec_version`, `source_set_sha256`, one `[[file]]` per source; alias only.
- `source/redaction.sha256.json`: hash-only, injective placeholder.
- Redact project, product, repository, organization, user, ticket, and private-host identifiers. Keep normative constants.
- `source/redaction.review.json`: every candidate → `redacted` / `allowlist` / `generic`.
- `<name>-okf.path-alias.json`: `okf-path-alias/v1`; `input_roots` + alias → original; outside the skill tree.
- `source/input-ledger.json`: `okf-input-ledger/v1`; every input under the declared roots → `included` or `excluded` + reason.
- `source/shared-engine.json`: `okf-shared-engine/v1`; every copied shared module with its SHA-256.

### Step 6: Engine TDD

Red first: failing tests per library.

| Library | Responsibility | Red test |
|---|---|---|
| `markdown` | headings, tables, fences, lists | fenced block and table are typed blocks |
| `redact` | hash-only mapping | map has only `sha256` and `placeholder` |
| `toml` | manifest/profile parse | quoted value survives |
| `path-alias` | alias → original | unmapped alias fails |
| `okf` | frontmatter parse | node body and fields separated |
| `coverage` | line partition | every line attributed or excluded |
| `atoms` | Claim extraction | empty source yields `INFORMATION_ZERO` |
| `claims` | registry bijection | missing row fails |
| `manifest` | lock and ledger render | rebuild byte-identical |
| `render-okf` | node/index/log/source render | index row per node |
| `retrieval` | deterministic rank | same query same bytes |
| `freshness` | source hash compare | stale node reported |
| `conflicts` | symmetric pair | one-sided pair fails |
| `answer-verify` | citation and uncited detection | uncited assertion fails |
| `usage` | manual completeness | missing section fails |
| `drift` | shared module hash | drift fails |
| `commands` | CLI dispatch | unknown command exits 2 |

- Green: behavior, not literal test wording.
- Refactor: remove duplicated path resolution, hardcoded values, false comments, untested branches; check Green before/after; rollback a break.
- Generated `scripts/` carries no ticket id, project name, or example literal.

### Step 6.5: Claim inventory and knowledge coverage

- `source/claim-inventory.json`: `okf-claim-inventory/v1`; every Claim or CodeBlock Atom → one entry with source, span, and hash.
- `source/knowledge-coverage.json`: `okf-knowledge-coverage/v1`; every node → `must` with source.
- `source/line-coverage.json`: `okf-line-coverage/v1`; every source line attributed or listed as a gap; a gap blocks the build.
- No orphan inventory row; no node without a decision.
- Inventory and coverage are deterministic and reproducible from the source set.

### Step 7: OKF

- One Atom = one node.
- Frontmatter: `type`, `id`, `topic`, `summary`, `sources`, `source_sha256`, `span`, `links`, `conflicts`, `supersedes`, `content_sha256`.
- Node body = Atom text + one trailing newline; SHA-256 of the body after removing that newline equals `content_sha256`.
- Write `okf/index.md`, `okf/log.md`, `okf/source.md`, `okf/source.baseline.md`.
- `okf/source.md` = manifest order, `# Source: <alias>` headers, redacted source text; `okf/source.baseline.md` byte-identical.
- Delivered context from the lock; the AI never reads `okf/` directly.

### Step 8: Bundle and installer

- `dist/skill.mjs`: pinned esbuild, one entry, ESM, no source map; resolves `okf/` as a sibling; `absWorkingDir` pinned to the skill root; atomic write.
- `install.js`: copy-only; copies `dist/skill.mjs`, `scripts/`, `okf/`, `source/`, `atoms.lock.json`, `SKILL.md`, `DESIGN.md`, `IMPLEMENTATION-LEFTOVERS.md`, `tests/fixtures/runtime/runtime.json`; no build, judge, or target edit.

### Step 9: Test matrix

- `node --test`; optional dist/esbuild test reported, never pass.
- Required: `atom`, `claim`, `retrieval`, `freshness`, `conflict`, `answer`, `usage`, `drift`, `verifier-negative`, `installed-parity`, `source-rederivation`, `style`.
- Include determinism, performance, forbidden-token, leak, coverage, style: `STYLE_NOT_ENGLISH`, `STYLE_LOW_DENSITY`, `STYLE_REDUNDANT`.
- Never `make test`.

### Step 10: Verify

Dev mode:

```bash
node "$CLAUDE_DIR/scripts/amend-rfc-up/verify-okf-skill.mjs" \
  --skill "$STAGING_DIR" \
  --root "$REPO_ROOT" --mode dev \
  --source-root "$REPO_ROOT" \
  --path-alias "$ALIAS_PATH" \
  --out "$OKF_OUT/<name>-dev-verification.json"
```

Require exit 0, `check_set_version: 1`, 19/19 `machine_verified`, closure recorded.

Installed mode:

```bash
INSTALL_TARGET="$(mktemp -d)"
node "$STAGING_DIR/install.js" "$INSTALL_TARGET"
node "$CLAUDE_DIR/scripts/amend-rfc-up/verify-okf-skill.mjs" \
  --skill "$INSTALL_TARGET/.claude/skills/<name>-okf" \
  --root "$REPO_ROOT" --mode installed \
  --path-alias "$ALIAS_PATH" \
  --out "$OKF_OUT/<name>-installed-verification.json"
```

Require exit 0, 8/8 installed required checks `machine_verified`, source/installed SHA match. Then `check lint`, `check graph`, `check coverage`, `check provenance`, `check citation`, `check usage`, `check conflicts`; `rebuild` byte-identical; forbidden-token scan. Any failure → no install.

### Step 11: Install

- Copy staging tree atomically → `SKILL_DIR`; existing `SKILL_DIR` → backup under `OKF_OUT/backup/`.
- Copy/post-check fail → rollback backup; `INSTALL_BLOCKED`.
- Copy `ALIAS_PATH` beside `SKILL_DIR`; never inside it.
- Installed `dist` resolves sibling `okf/`; installed mode passes; `applies` is advisory and never blocks.

### Step 12: Acceptance

- Acceptance set = the invocation's source set. No fixed external fixture, document name, or path.
- Per build: run end to end; record source hashes, lines, Atom/Claim counts, gaps, overlaps, mode, `check_set_version`, closure, installed SHA in `$OKF_OUT/okf-builds.json`.
- Producer proof: a synthetic mini wiki verified in dev and installed modes.
- Mutation matrix:

| Mutation | Required result |
|---|---|
| Rename directory or file | Atom IDs + content hashes unchanged after path normalization |
| Reorder sources | claim set + coverage unchanged |
| Remove a claim source | `CLAIM_UNSOURCED`; no install |
| Remove a links target | `LINK_UNRESOLVED`; no install |
| Remove an index row | `INDEX_ORPHAN`; no install |
| Edit a source | `STALE_NODE`; no current presentation |
| Declare one-sided conflict | `CONFLICT_ASYMMETRIC`; no install |
| Remove a usage section | `USAGE_INCOMPLETE`; no install |
| Drift a shared module | `ENGINE_DRIFT`; no install |
| Tamper installed copy | `INSTALLED_SHA_MISMATCH`; no completion |
| Inject CRLF | LF-normalized; hashes stable |
| Duplicate heading | Atom IDs unique |
| Expand to 2.5k nodes | performance budget met |

Scan the generated tree for example literals, original paths, ticket ids, and CJK. The command body names no fixture.

### Step 13: Report

- Report per skill: name, sources, profile hash, source count, lines, Atom count, Claim count, gaps, overlaps, ledger counts, `check_set_version`, dev closure, installed closure, installed SHA parity, install path, leftovers.
- Report mutation results + adoption gaps.
- Completion: every skill `machine_verified` in dev and installed, `rebuild` byte-identical, install verified, acceptance record pass.

## Verification Gates

| Gate | Pass |
|---|---|
| Canonical verifier dev | `verify-okf-skill.mjs` exit 0; `check_set_version: 1`; 19 checks `machine_verified`; closure recorded |
| Canonical verifier installed | installed tree; 8 required checks `machine_verified`; source/installed SHA match |
| Check set | `layer`, `manifest`, `lock`, `coverage`, `registry`, `boundary`, `provenance`, `citation`, `graph`, `freshness`, `conflicts`, `retrieval`, `usage`, `runtime`, `tests`, `installer`, `determinism`, `distribution`, `style` |
| Bundle | `check lint` exit 0 |
| Graph | `check graph` exit 0 |
| Coverage | `check coverage` exit 0 |
| Provenance | `check provenance` exit 0 |
| Citation | `check citation` exit 0 |
| Usage | `check usage` exit 0 |
| Determinism | `rebuild` prints byte-identical |
| Distribution | shared module hashes match; alias map outside the skill tree |
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
| `SOURCE_ALIAS_DUPLICATE` | two sources share a basename | rename or reject; write nothing |
| `DERIVED_EXCLUDED` | self-described derived view | record alias + phrase; continue |
| `INFORMATION_ZERO` | no claim-bearing block | stop before profile |
| `ARTIFACT_MISSING` | a required artifact is absent | write the artifact; re-verify |
| `CLAIM_UNSOURCED` | a Claim lacks source, span, or hash | repair provenance; no install |
| `REGISTRY_MISMATCH` | Claim Atoms ≠ registry rows | repair IDs; reclassify |
| `COVERAGE_GAP` | node or line without a decision | re-extract; never hand-edit the lock |
| `LINK_UNRESOLVED` | a links target does not exist | add the node or remove the link |
| `INDEX_ORPHAN` | a node is absent from the index | re-render; no hand edit |
| `STALE_NODE` | source hash changed after the build | rebuild from the current source |
| `CONFLICT_ASYMMETRIC` | a conflict is declared on one side only | declare both sides or remove it |
| `USAGE_INCOMPLETE` | a required scenario section or example is missing | complete `SKILL.md`; no install |
| `ENGINE_DRIFT` | a shared module differs from its recorded hash | restore the byte-identical copy; no install |
| `INSTALLED_SHA_MISMATCH` | source and installed differ | reinstall; no completion |
| `NON_DETERMINISTIC` | rebuild drift | remove timestamps, unordered iteration, absolute paths |
| `VERIFIER_FAILED` | any check not `machine_verified` | repair; re-verify; no install |
| `INSTALL_BLOCKED` | copy or post-check fail | restore backup; report |

## Completion

- Every built skill: canonical verifier dev 19/19 and installed 8/8 `machine_verified`, `rebuild` byte-identical, forbidden-token scan zero, installed bundle resolves `okf/`, source/installed SHA match, acceptance record pass.
- No write to `CLAUDE.md` or the make/plan/start/review/resolve commands.
- Report adoption gaps; never claim V1 as rule-level proof.
