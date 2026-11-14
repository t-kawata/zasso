---
description: Build a complete *-okf wiki skill from English Markdown sources on the Open Knowledge Format v0.2 model; verify in dev and installed modes; install.
argument-hint: "<skill-name>=<source-doc>... | <skill-name> <source-doc>..."
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /build-okf-skill

Role: build a verified `*-okf` wiki skill from English Markdown. The skill is an Open Knowledge Format v0.2 bundle plus a deterministic CLI. It exposes navigation, reachability, trust, freshness, sources, and context. It is not a law gate.

## Path Anchor

Run once:

```bash
printf '%s/.claude\n' "$(git rev-parse --show-toplevel)"
```

Record the printed path as `CLAUDE_DIR`. Use that literal path below. Do not run `git rev-parse` again.

- `REPO_ROOT="${CLAUDE_DIR%/.claude}"`.
- `SKILL_DIR="$CLAUDE_DIR/skills/<name>-okf"` — fixed.
- `ALIAS_PATH="$CLAUDE_DIR/skills/<name>-okf.path-alias.json"` — outside the skill tree.
- `STAGING_DIR="$REPO_ROOT/target/okf-build/<name>"`.
- `OKF_OUT="$REPO_ROOT/target/okf"`.

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
- Canonical verifier: `check_set_version` from `okf-verify/checks.json`; every check named there is `machine_verified` in dev mode.
- `okf/` is the bundle root. Every non-reserved `.md` has parseable frontmatter with a non-empty `type`.
- Concept ID is the bundle-relative path without `.md`. No synthetic identity.
- `index.md` is a heading plus a linked list. `log.md` uses `YYYY-MM-DD` headings, newest first.
- Body Markdown links are the graph. There is no frontmatter `links`.
- The bundle contains no source view; `source/source-view.md` and `source/source.baseline.md` live outside `okf/`.
- A stale or deprecated concept is never presented as current.
- A required closure is complete or `BUDGET_EXCEEDED`; never truncate.
- Generated `SKILL.md` is a traversal manual: 13 sections and at least 10 scenarios.
- No forced edits to `CLAUDE.md` or the make/plan/start/review/resolve commands.
- Generated skill contains no ticket id, project name, original absolute path, or CJK.
- Identical inputs → identical lock, OKF, and bundle.
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
| Claim registry table | optional; when absent, derive title and description from each section |
| Duplicate source basename | reject `SOURCE_ALIAS_DUPLICATE` |

- Sources read-only.
- Manifest: alias path + SHA-256 of LF-normalized text.
- CJK anywhere → reject the whole build; no silent translation.

## Generated Skill Layout

```text
<name>-okf/
├── SKILL.md
├── DESIGN.md
├── IMPLEMENTATION-LEFTOVERS.md
├── install.js
├── atoms.lock.json
├── package.json
├── THIRD_PARTY_NOTICES.md
├── okf/
│   ├── index.md
│   ├── log.md
│   └── pages/
│       └── <source>/<section>.md
├── okf-core/
│   ├── index.mjs
│   ├── cli.mjs
│   ├── adapters/
│   ├── authoring/
│   ├── bundle/
│   ├── context/
│   ├── graph/
│   ├── metadata/
│   ├── parsing/
│   ├── paths/
│   └── validation/
├── scripts/cli.mjs
├── dist/skill.mjs
├── source/
│   ├── manifest.toml
│   ├── input-ledger.json
│   ├── concept-inventory.json
│   ├── coverage.json
│   ├── okf-profile.toml
│   ├── okf-log.json
│   ├── source-view.md
│   ├── source.baseline.md
│   └── shared-engine.json
└── tests/{smoke.test.mjs, fixtures/runtime/runtime.json}
```

Sibling: `<name>-okf.path-alias.json` — outside the skill tree; holds `input_roots` and alias → original path.

## OKF Bundle

Every concept file starts with frontmatter. The required key is a non-empty `type`.

```yaml
type: Page
title: Authentication
description: Tokens expire after 15 minutes.
sources:
  - resource: sources/auth.md
    id: auth-1
    title: Authentication
generated:
  by: build-okf-skill
  at: "2026-11-13"
verified:
  - by: machine
    at: "2026-11-13"
status: stable
stale_after: "2027-11-13"
x-topic: auth
x-source-span: "1-20"
x-content-sha256: "<sha256>"
```

- `type`, `title`, `description`, `sources` are required for every generated concept.
- `sources[]` is an object list; `id` is the footnote label in the body.
- `generated` and `verified` are trust metadata. `status` is `draft`, `stable`, or `deprecated`.
- `stale_after` is an ISO instant. `x-` keys are extensions and are preserved.
- No `id`, no `links`, no `topic`, no `summary` keys. Identity is the path.

`index.md`:

```markdown
# Knowledge

- [Rules](./rules/index.md)
- [Authentication](./pages/auth/authentication.md)
```

`log.md`:

```markdown
# Knowledge Log

## 2026-11-13
- Built 24 concepts.
```

The build date is explicit (`--date` or `source/okf-log.json`). The clock is never read.

## Traversal Manual

The generated `SKILL.md` must contain these sections and at least 10 `### Scenario` recipes:

| Section | Must teach |
|---|---|
| `## Traversal Contract` | Envelope fields, `coverage.missing`, and the `stop|expand|back` table with `stop_when`, `must_run`, and `if_back`; generated from `okf-core/traversal-protocol.md` |
| `## Start Here` | The one entry command and the one question it answers |
| `## Directory Traversal` | `list --path /` then `list --path <directory>` |
| `## Concept Page` | `show <concept-id>` returns body, outgoing, incoming, sources, trust, freshness |
| `## Outgoing and Incoming` | Both directions, and `neighbors` |
| `## Multi-Hop Reach` | Repeated `outgoing` on returned ids; stop at the required set |
| `## Required Context` | `required --entry` and `context --entry --budget` |
| `## Zero Results` | An empty search is an answer; widen or list the directory |
| `## Budget Exceeded` | Narrow the entry set; never expect a truncated context |
| `## Trust and Freshness` | `trustTier`, `status`, `stale`, `staleAfter` |
| `## Sources and Citation` | `sources <id>`; cite a concept id and a source id |
| `## Authoring and Update` | Add a concept, rebuild index/log, validate conformance |
| `## Failure Modes` | `UNKNOWN_CONCEPT`, `blocked`, lint-only broken links |

## Procedure

### Step 0: Baseline

- Require `$CLAUDE_DIR/scripts/amend-rfc-up/verify-okf-skill.mjs`.
- Require `$CLAUDE_DIR/scripts/amend-rfc-up/okf-verify/checks.json`; require its `check_set_version` and the named checks with `both` / `dev` modes.
- Require `$CLAUDE_DIR/scripts/amend-rfc-up/okf-core/index.mjs` and `okf-core/cli.mjs`.
- Missing or mismatched → stop before any write. Never copy, patch, or replace the canonical verifier.

### Step 1: Parse

- Absolute source → repository-relative.
- Reject empty, hyphen-leading, bad name, mixed forms.
- Write `$OKF_OUT/build-units.json`; no skill write before all units pass.

### Step 2: Measure

- Per source: read bytes; reject NUL/non-Markdown; normalize LF; reject CJK; hash; measure lines and sections.
- Derived-view phrase → exclude + record; ambiguous → include + `DERIVED_AMBIGUOUS`.
- No claim-bearing block → `INFORMATION_ZERO`; never invent a concept.
- Write `$STAGING_DIR/source/measurements.json`; re-read → hash unchanged.

### Step 3: Profile

Derive `source/okf-profile.toml`; never copy another project's values.

| Field | Derivation |
|---|---|
| `domain` | level-1 title, slugged; fall back to first source path |
| `types` | `Page`, `Claim`, `Entity`, `Procedure`, `Reference` |
| `discovery` | manifest names, source roots, globs |
| `detectors` | `todo`, `fixme`, `hack`, `xxx`, secrets |
| `language` | `en` |
| `limits` | `max_answer_nodes=20`, `node_budget=2500`, `context_budget_bytes=1000000` |

Write with stable sort. Profile is data: a source heading change → profile change, no script edit.

### Step 4: Concept extraction

- One concept per level-2 section; a document without level-2 is one root concept.
- Preamble rule: non-empty text between the document H1 and the first H2 becomes a root preamble concept `pages/<source-slug>/preamble.md`. Its `x-source-span` starts at the H1 line and ends at the line before the first H2. No preamble text is left unowned.
- Every non-blank source line belongs to exactly one concept span: the preamble span or a section span. A line in two spans or no span is `COVERAGE_GAP`.
- Concept path: `pages/<source-slug>/<section-slug>.md`.
- `title` = section heading; `description` = first paragraph, at most 200 characters.
- Body = the original section Markdown, including links and footnotes.
- `sources` = one object per section: `{resource, id, title}`. Add a footnote if the section has none.
- `x-topic` = source slug; `x-source-span` = section line span; `x-content-sha256` = body hash.
- No synthetic ids. The path is the id.

### Step 5: Source set, redaction, alias, input ledger

- `source/manifest.toml`: `spec_version`, `source_set_sha256`, one `[[file]]` per source; alias only.
- `source/input-ledger.json`: `okf-input-ledger/v1`; every input under the declared roots → `included` or `excluded` + reason.
- `source/concept-inventory.json`: `okf-concept-inventory/v1`; every concept id, path, and source alias.
- `source/coverage.json`: `okf-source-coverage/v1`; one record per source with `lines`, `concepts`, `unmappedHeadings`, `unmappedPreamble`, `unmappedLines`; `counts` sums them. Each unmapped field must be 0. The verifier reads this ledger, not the inventory alone.
- `source/okf-log.json`: `okf-log/v1`; explicit dated entries.
- Redact project, product, repository, organization, user, ticket, and private-host identifiers. Keep normative constants.
- `<name>-okf.path-alias.json`: `okf-path-alias/v1`; `input_roots` + alias → original; outside the skill tree.
- `source/shared-engine.json`: `okf-shared-engine/v1`; every copied module with its SHA-256.

### Step 6: Engine TDD

Red first: failing tests per module.

| Module | Responsibility | Red test |
|---|---|---|
| `frontmatter` | YAML parse and unknown-key preservation | missing frontmatter and empty type fail |
| `markdown` | mdast links, footnotes, code blocks | a fenced link is not an edge |
| `paths` | link resolution and containment | root escape is `blocked` |
| `bundle` | scan, classify, load | ids are paths and reserved files are not concepts |
| `graph` | outgoing, incoming, backlinks | both directions agree |
| `metadata` | trust, status, staleness, sources | human/machine/unverified |
| `validation` | conformance, lint, profile | broken links pass conformance |
| `context` | closure, budget | over budget throws `BUDGET_EXCEEDED` |
| `authoring` | concept, index, log writers | rebuild is byte-identical |
| `cli` | command dispatch | unknown command exits 2 |

- Green: behavior, not literal test wording.
- Refactor: remove duplicated path resolution, hardcoded values, false comments, untested branches; check Green before/after; rollback a break.
- Generated `okf-core/` carries no ticket id, project name, or example literal.

### Step 7: OKF bundle

- Write `okf/pages/**/*.md` with the frontmatter schema above.
- Write `okf/index.md` and one `index.md` per directory as linked lists.
- Write `okf/log.md` from `source/okf-log.json`; newest date first.
- Write `source/source-view.md` and `source/source.baseline.md` outside the bundle.
- Delivered context from `okf-core`; the AI uses the CLI, not raw grep.

### Step 8: Bundle and installer

- `dist/skill.mjs`: pinned esbuild, one entry, ESM, no source map, `createRequire` banner for CommonJS dependencies; resolves `okf-core/` as a sibling; `absWorkingDir` pinned to the skill root; atomic write.
- `install.js`: copy-only; copies `dist/skill.mjs`, `okf-core/`, `scripts/`, `okf/`, `source/`, `atoms.lock.json`, `package.json`, `THIRD_PARTY_NOTICES.md`, `SKILL.md`, `DESIGN.md`, `IMPLEMENTATION-LEFTOVERS.md`, `tests/fixtures/runtime/runtime.json`; no build, judge, or target edit.

### Step 9: Test matrix

- `node --test` on explicit files; never a directory; never `make test`.
- Required: `frontmatter`, `markdown`, `paths`, `bundle`, `graph`, `metadata`, `validation`, `context`, `authoring`, `cli`, `coverage`, `verifier-negative`, `installed-parity`, `source-rederivation`, `style`, `performance`.
- Include determinism, forbidden-token, leak, coverage, and style checks.

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

Require exit 0, `check_set_version` from `checks.json`, every dev-required check `machine_verified`, closure recorded.

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

Require exit 0, every installed-required check `machine_verified`, source/installed SHA match. Any failure → no install.

### Step 11: Install

- Copy staging tree atomically → `SKILL_DIR`; existing `SKILL_DIR` → backup under `OKF_OUT/backup/`.
- Copy/post-check fail → rollback backup; `INSTALL_BLOCKED`.
- Copy `ALIAS_PATH` beside `SKILL_DIR`; never inside it.
- Installed `dist` resolves sibling `okf/`; installed mode passes.

### Step 12: Acceptance

- Acceptance set = the invocation's source set. No fixed external fixture, document name, or path.
- Per build: run end to end; record source hashes, lines, concept counts, coverage counts, mode, `check_set_version`, closure, installed SHA in `$OKF_OUT/okf-builds.json`.
- Producer proof: a synthetic mini wiki verified in dev and installed modes.
- Mutation matrix:

| Mutation | Required result |
|---|---|
| Rename directory or file | concept id changes; source hash unchanged |
| Reorder sources | concept set and coverage unchanged |
| Remove a concept source | `CLAIM_UNSOURCED`; no install |
| Remove the preamble concept | `COVERAGE_GAP` from the coverage check; no install |
| Remove `source/coverage.json` | `COVERAGE_MISSING`; no install |
| Set `unmappedLines` to 1 | `COVERAGE_GAP`; no install |
| Remove a body link target | conformance passes; lint `LINK_BROKEN`; no install |
| Remove an index row | lint `INDEX_ORPHAN`; no install |
| Edit a source | `STALE_NODE`; no current presentation |
| Unknown type / unknown key | conformance passes; lint reports |
| Over-budget context | `BUDGET_EXCEEDED`; no truncation |
| Drift a shared module | `ENGINE_DRIFT`; no install |
| Tamper installed copy | `INSTALLED_SHA_MISMATCH`; no completion |
| Inject CRLF | LF-normalized; hashes stable |
| Expand to 2.5k concepts | performance budget met |

Scan the generated tree for example literals, original paths, ticket ids, and CJK. The command body names no fixture.

### Step 13: Report

- Report per skill: name, sources, profile hash, source count, lines, concept count, preamble count, `unmappedHeadings`, `unmappedPreamble`, `unmappedLines`, ledger counts, `check_set_version`, dev closure, installed closure, installed SHA parity, install path, leftovers.
- Report mutation results + adoption gaps.
- Completion: every skill `machine_verified` in dev and installed, `rebuild` byte-identical, install verified, acceptance record pass.

## Verification Gates

| Gate | Pass |
|---|---|
| Canonical verifier dev | exit 0; `check_set_version` from `checks.json`; every dev check `machine_verified`; closure recorded |
| Canonical verifier installed | installed tree; every installed check `machine_verified`; source/installed SHA match |
| Conformance | three official conditions only |
| Lint | broken link, missing index, orphan, unknown type/key, stale, source mismatch |
| Profile | required types/concepts/rules, closure |
| Coverage | `source/coverage.json` present; `unmappedHeadings`, `unmappedPreamble`, `unmappedLines` all 0 |
| Graph | outgoing, incoming, backlinks, index coverage |
| Context | required closure; `BUDGET_EXCEEDED` over budget |
| Navigation | `show` returns body, outgoing, incoming, sources, trust, freshness |
| Usage | 13 sections + 10 scenarios |
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
| `CLAIM_UNSOURCED` | a concept lacks source or hash | repair provenance; no install |
| `COVERAGE_MISSING` | `source/coverage.json` is absent | write the ledger; re-verify; no install |
| `COVERAGE_SCHEMA` | ledger schema is not `okf-source-coverage/v1` | rewrite the ledger; re-verify; no install |
| `COVERAGE_GAP` | concept or line without a decision | re-extract; never hand-edit the lock |
| `LINK_BROKEN` | a body link target does not exist | fix the link or add the concept; lint-only |
| `INDEX_ORPHAN` | a concept is absent from its directory index | re-render; no hand edit |
| `STALE_NODE` | source hash changed after the build | rebuild from the current source |
| `BUDGET_EXCEEDED` | required context over budget | narrow the entry set; never truncate |
| `UNKNOWN_TYPE` | type outside the profile | add the type or fix the source |
| `UNKNOWN_KEY` | key outside the profile | use `x-` or add the key |
| `CONFORMANCE_FAILED` | one of the three official conditions fails | fix frontmatter, type, index, or log |
| `PROFILE_FAILED` | required type/concept/rule absent | add the required concept |
| `USAGE_INCOMPLETE` | a traversal section or scenario is missing | complete `SKILL.md`; no install |
| `ENGINE_DRIFT` | a shared module differs from its recorded hash | restore the byte-identical copy; no install |
| `INSTALLED_SHA_MISMATCH` | source and installed differ | reinstall; no completion |
| `NON_DETERMINISTIC` | rebuild drift | remove timestamps, unordered iteration, absolute paths |
| `VERIFIER_FAILED` | any required check not `machine_verified` | repair; re-verify; no install |
| `INSTALL_BLOCKED` | copy or post-check fail | restore backup; report |

## Completion

- Every built skill: canonical verifier dev and installed `machine_verified`, `rebuild` byte-identical, forbidden-token scan zero, installed bundle resolves `okf/`, source/installed SHA match, acceptance record pass.
- No write to `CLAUDE.md` or the make/plan/start/review/resolve commands.
- Report adoption gaps; never claim V1 as rule-level proof.
