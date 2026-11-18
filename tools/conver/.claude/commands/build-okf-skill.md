---
description: Build or update a complete *-okf wiki skill from English Markdown sources on the Open Knowledge Format v0.2 model; verify in dev and installed modes; install.
argument-hint: "<skill-name> <source-doc>... | <skill-name>=<source-doc>... | update <skill-name> <revision-doc>"
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

## Reference Exemplars

The repository installs `natenv-okf` at `.claude/skills/natenv-okf`.
It is the reference quality bar for every generated `*-okf` skill. Read its
`SKILL.md`, `okf/`, `source/` ledgers, `dist/skill.mjs`, and verification
reports before Step 0. Reproduce its structure and evidence discipline; do not
copy its concepts, source text, or acceptance set.

The exemplar proves these properties, and this command must reproduce them:

- 13 traversal sections and at least 10 scenarios in `SKILL.md`;
- a prerequisite graph where `required --entry <last concept>` returns a
  transitive closure, not a flat single node;
- coverage counts with zero unmapped headings, preamble, and lines;
- `PRE-OKF-ORIGINAL.md` keeps the build input beside the OKF form;
- an acceptance record whose `check_set_version` matches the current verifier.

The exemplar is never a source, fixture, or acceptance target. The acceptance
set remains the invocation's source set.

## Arguments

- `<skill-name> <source-doc> [<source-doc> ...]` — one skill; every remaining argument is a source.
- `<skill-name>=<source-doc> [<skill-name>=<source-doc> ...]` — one or more skills; repeated name adds a source.
- `update <skill-name> <revision-doc>` — opt-in update subroute; the document is the update input and the installed skill is the baseline. The update form is exclusive; no flags.
- Mixing forms → `INVALID_ARGUMENT`. Empty argument → `INVALID_ARGUMENT`.
- No flags. Hyphen-leading argument → `INVALID_ARGUMENT`.
- Source repository-relative. Absolute accepted only inside the repository; the manifest stores an alias.
- Name matches `^[a-z][a-z0-9-]*-okf$`.
- Optional free-form block: the first blank line ends the source list; the remaining text describes the asset set and exclusions. At most one skill per invocation when the block is present.
- Asset roots are discovered from the manifest, the bundle directory, the specification, the validated semantic proposal, or content signals. Do not require a fixed directory name.

## Invariants

- Positional only; no flag branch.
- Sources read-only; writes only under `STAGING_DIR`, `SKILL_DIR`, `ALIAS_PATH`, `OKF_OUT`.
- Canonical verifier: `check_set_version` from `okf-verify/checks.json`; every check named there is `machine_verified` in dev mode.
- `okf/` is the bundle root. Every non-reserved `.md` has parseable frontmatter with a non-empty `type`.
- Concept ID is the bundle-relative path without `.md`. No synthetic identity.
- `index.md` is a heading plus a linked list. `log.md` uses `YYYY-MM-DD` headings, newest first.
- Body Markdown links are the graph. There is no frontmatter `links`.
- Multi-concept bundles declare a prerequisite chain: every non-preamble concept carries `x-requires` to an existing concept. `required --entry <last concept>` returns a transitive closure; a flat single-node closure is a defect.
- Generated skill carries `PRE-OKF-ORIGINAL.md` at its root and `source/pre-okf-original.json`. The original is the LF-normalized primary build input (the first source, or the concatenation of all sources in manifest order with `<!-- pre-okf-source: <alias> -->` separators). The ledger records the source or ordered sources, `sha256`, and `bytes`.
- `PRE-OKF-ORIGINAL.md` is the unredacted build input. It is outside `okf/` and `source/`, is never a manifest file, and is exempt from redaction and boundary scans.
- `$OKF_OUT/okf-builds.json` records one build per skill with the current `check_set_version`, dev/installed status and counts, closures, source hash, lines, concepts, and zero unmapped counts.
- The bundle contains no source view; `source/source-view.md` and `source/source.baseline.md` live outside `okf/`.
- A stale or deprecated concept is never presented as current.
- A required closure is complete or `BUDGET_EXCEEDED`; never truncate.
- Generated `SKILL.md` is a traversal manual: 13 sections and at least 10 scenarios.
- No forced edits to `CLAUDE.md` or the make/plan/start/review/resolve commands.
- Generated skill contains no ticket id, project name, original absolute path, or CJK.
- Assets are first-class: every selected asset has one concept with exact text, `x-asset-sha256`, `x-source-span`, and a governing `x-requires`; every asset root is shipped by `install.js`; zero assets are represented by zero-count ledgers and no asset concepts.
- Asset discovery is name-agnostic. Strong signals cannot be silently dropped; weak signals do not create assets; the AI semantic proposal is machine-validated before it becomes the discovery decision.
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
| Non-Markdown text asset | classify as `Procedure` or `Reference`; index or exclude by policy |
| Binary asset | index path, SHA-256, and bytes; ship raw when allowed; `ASSET_BINARY_INDEXED` |
| CJK asset | `ASSET_NOT_ENGLISH`; no install unless explicitly excluded |
| Secret-bearing asset | `ASSET_SECRET_EXCLUDED`; never ship |
| Oversized asset | `ASSET_SIZE_EXCLUDED`; metadata-only concept or explicit exclusion |
| Asset outside the declared root | `ASSET_OUTSIDE_ROOT` |
| Duplicate asset concept id | `ASSET_ALIAS_DUPLICATE` |
| Missing strong asset reference | `ASSET_REFERENCE_MISSING`; no install |

- Sources read-only.
- Manifest: alias path + SHA-256 of LF-normalized text.
- CJK anywhere in a source → reject the whole build; no silent translation.
- Assets are measured separately: text is LF-normalized; binary is hashed as bytes; every included asset has a code, line span, and SHA-256. The asset ledgers are `source/asset-manifest.toml`, `source/asset-inventory.json`, and `source/asset-coverage.json`.

## Generated Skill Layout

```text
<name>-okf/
├── SKILL.md
├── PRE-OKF-ORIGINAL.md
├── DESIGN.md
├── IMPLEMENTATION-LEFTOVERS.md
├── install.js
├── atoms.lock.json
├── package.json
├── THIRD_PARTY_NOTICES.md
├── <asset-root>/           # supplied execution assets; name is declared or discovered
├── okf/
│   ├── index.md
│   ├── log.md
│   └── pages/
│       ├── <source>/<section>.md
│       └── assets/<asset>.md
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
│   ├── pre-okf-original.json
│   ├── input-ledger.json
│   ├── concept-inventory.json
│   ├── coverage.json
│   ├── okf-profile.toml
│   ├── okf-log.json
│   ├── source-view.md
│   ├── source.baseline.md
│   ├── asset-manifest.toml
│   ├── asset-inventory.json
│   ├── asset-coverage.json
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

The AI-facing view is Markdown with four fixed sections: Page, Coverage, Frontier, and Decision, each with a one-line description. It is lossless: every frontier entry, the full body, and every command appear, and nothing is truncated. The JSON envelope is the verification contract: tests and verifiers pass `--format json`; the generated `SKILL.md` does not name a JSON output mode.

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
| `## Execution Assets` | Discover, cite, verify, and copy the provided asset set; state when none exists |
| `## Failure Modes` | `UNKNOWN_CONCEPT`, `blocked`, lint-only broken links |

## Execution Assets

Assets are first-class inputs, not side files. A source document may be
accompanied by scripts, Dockerfile or Containerfile recipes, Compose files,
configuration, fixtures, VM/bootstrap files, and templates. The command must
discover them without assuming a directory name, index each selected file as
an OKF concept with its exact text and SHA-256, link it to the governing source
section, and ship every asset root through `install.js`.

Discovery precedence, highest first:

1. explicit `okf-input.toml` or `okf-input.json` manifest (`assets.roots`);
2. bundle-directory input (the primary Markdown plus the remaining text files);
3. specification references and asset-map table rows;
4. an AI-authored `asset-plan.proposal.json` validated by the machine;
5. content heuristics (shebang, `FROM`, Compose `services:`, Containerfile);
6. none.

A conventional asset-directory name is one possible root name, never a
contract. Use the declared or discovered root name. A strong signal cannot be silently dropped; a weak
signal (extension alone, unrelated README/JSON) does not turn a document-only
build into an asset build. Every included asset has one concept under
`okf/pages/assets/` with `x-asset-path`, `x-asset-sha256`, `x-source-span`,
`x-content-sha256`, and `x-requires` to the governing source concept. Binary
assets are indexed as metadata and shipped raw. The ledgers are
`source/asset-manifest.toml`, `source/asset-inventory.json`, and
`source/asset-coverage.json`; `source/input-ledger.json` includes the asset
entries.

No execution assets were provided is a normal outcome: emit zero-count asset
ledgers, no asset concepts, and a `SKILL.md` section that states the absence.
Do not fail because an asset directory is absent. Fail only when a strong
signal is missing, outside the root, secret-bearing, non-English, oversized,
or duplicated.

The semantic route is machine-validated. The AI writes
`asset-plan.proposal.json` with `include`, `exclude`, `roots`, `governing`,
`quote`, and `confidence`; the validator checks path existence, containment,
policy, omission of strong signals, and link resolution. An AI proposal cannot
override a missing path, a secret/CJK/binary policy, or a strong-signal
omission.

Policy is data. The manifest `[assets]` may set `max_file_bytes`,
`max_total_bytes`, `max_candidates`, `include_binary`, and `low_confidence`;
the profile `[limits]` may set the `asset_`-prefixed variants. Defaults live in
`okf-asset/constants.mjs`; a caller must not repeat them.

## Procedure

### Step 0: Baseline

- Require `$CLAUDE_DIR/scripts/amend-rfc-up/verify-okf-skill.mjs`.
- Require `$CLAUDE_DIR/scripts/amend-rfc-up/okf-verify/checks.json`; require its `check_set_version` and the named checks with `both` / `dev` modes.
- Require `$CLAUDE_DIR/scripts/amend-rfc-up/okf-core/index.mjs` and `okf-core/cli.mjs`.
- Require `$CLAUDE_DIR/scripts/amend-rfc-up/okf-asset/index.mjs`; it owns discovery, measurement, semantic validation, rendering, ledgers, and asset verification.
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

### Step 2.5: Pre-OKF original

- Primary input = the first accepted source. Multiple sources → concatenate in manifest order, each block preceded by `<!-- pre-okf-source: <alias> -->`.
- Copy the LF-normalized text to `$STAGING_DIR/PRE-OKF-ORIGINAL.md`.
- Write `$STAGING_DIR/source/pre-okf-original.json`: `schema: pre-okf-original/v1`, `source` or `sources`, `sha256`, `bytes`.
- The file stays outside `okf/` and `source/`; never add it to the manifest, input ledger, coverage ledger, or redaction map. Missing or hash drift → `PRE_OKF_ORIGINAL_MISSING` / `PRE_OKF_ORIGINAL_DRIFT`.

### Step 2.6: Discover and measure assets

- Run `discoverAssets` from `okf-asset/discover.mjs` with the source paths, source root, free-form block, and any manifest. It selects the mode and records included, excluded, and ambiguous entries.
- If the free-form block or source prose describes assets, write `$OKF_OUT/asset-plan.proposal.json` with evidence and confidence; run `validateSemanticProposal` before accepting it. The proposal cannot invent a path, omit a strong signal, or override policy.
- Measure each included asset with `measureAsset`; classify with `classifyAsset`. Write `$STAGING_DIR/source/asset-discovery.json` with mode, roots, included, excluded, ambiguous, and counts.
- `asset_mode: none` is valid: emit zero-count ledgers and no asset concepts.

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
- `source/asset-manifest.toml`: `okf-asset-manifest/v1`; one `[[file]]` per included asset with path, SHA-256, bytes, lines, concept, and type.
- `source/asset-inventory.json`: `okf-asset-inventory/v1`; every asset path, concept id, hash, and line count.
- `source/asset-coverage.json`: `okf-asset-coverage/v1`; `asset_roots`, per-root records, and `counts` with zero `unmappedFiles` and `unmappedLines`. Zero assets write `asset_roots: []` and zero counts.
- `source/input-ledger.json` includes every asset as `included` or `excluded` with a reason.

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
- Declare `x-requires` on every non-preamble concept, in source order or by an explicit dependency edge. The last concept's `required --entry` closure must be transitive; a flat bundle is `PREREQUISITE_GRAPH_FLAT`.
- Write `okf/index.md` and one `index.md` per directory as linked lists.
- Write `okf/log.md` from `source/okf-log.json`; newest date first.
- Write `source/source-view.md` and `source/source.baseline.md` outside the bundle.
- Render one asset concept per included asset under `okf/pages/assets/` using `renderAssetConcept`; the body carries the exact text, the asset hash, the line span, and a footnote. Add the asset rows to `okf/pages/assets/index.md`.
- Binary assets get a metadata concept and are shipped raw; they are not embedded in a text fence.
- Delivered context from `okf-core`; the AI uses the CLI, not raw grep.

### Step 8: Bundle and installer

- `dist/skill.mjs`: pinned esbuild, one entry, ESM, no source map, `createRequire` banner for CommonJS dependencies; resolves `okf-core/` as a sibling; `absWorkingDir` pinned to the skill root; atomic write.
- `install.js`: copy-only; copies `dist/skill.mjs`, `okf-core/`, `scripts/`, `okf/`, `source/`, `PRE-OKF-ORIGINAL.md`, `atoms.lock.json`, `package.json`, `THIRD_PARTY_NOTICES.md`, `SKILL.md`, `DESIGN.md`, `IMPLEMENTATION-LEFTOVERS.md`, `tests/fixtures/runtime/runtime.json`, and every root listed in `source/asset-coverage.json` `asset_roots`. The installer reads the ledger; it does not hardcode a directory name. Missing or extra asset files are `ASSET_INSTALL_MISSING` / `ASSET_HASH_MISMATCH`.

### Step 9: Test matrix

- `node --test` on explicit files; never a directory; never `make test`.
- Required: `frontmatter`, `markdown`, `paths`, `bundle`, `graph`, `metadata`, `validation`, `context`, `authoring`, `cli`, `coverage`, `verifier-negative`, `installed-parity`, `source-rederivation`, `style`, `performance`, `assets`, `asset-installed-parity`.
- Asset tests cover discovery precedence, arbitrary names, strong/weak signals, semantic proposal validation, policy refusal, exact content/hash/span, zero-count zero-asset ledgers, dynamic installer roots, and installed parity.
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
- Per build: run end to end; record source hashes, lines, concept counts, coverage counts, asset modes, asset roots, asset file/concept counts, zero unmapped asset counts, asset tree SHA, semantic additions/exclusions/omissions, mode, `check_set_version`, closure, installed SHA in `$OKF_OUT/okf-builds.json`.
- Asset mutations: remove an asset concept → `ASSET_COVERAGE_GAP`; tamper an asset → `ASSET_HASH_MISMATCH`; remove the asset manifest → `ASSET_MANIFEST_MISSING`; remove an asset root → `ASSET_INSTALL_MISSING`; omit a strong signal → `ASSET_SEMANTIC_OMISSION`; invent a path → `ASSET_SEMANTIC_PATH_MISSING`; add a secret → `ASSET_SECRET_EXCLUDED`; add CJK → `ASSET_NOT_ENGLISH`; add a binary → `ASSET_BINARY_INDEXED`; add an oversized file → `ASSET_SIZE_EXCLUDED`; weak signal only → mode none; rename the root → same concept set and asset tree digest.
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

- Report per skill: name, sources, profile hash, source count, lines, concept count, preamble count, `unmappedHeadings`, `unmappedPreamble`, `unmappedLines`, asset mode, asset roots, asset files, asset concepts, asset bytes, asset unmapped counts, semantic additions/exclusions/omissions, ledger counts, `check_set_version`, dev closure, installed closure, installed SHA parity, asset tree parity, install path, leftovers.
- Report mutation results + adoption gaps.
- Completion: every skill `machine_verified` in dev and installed, `rebuild` byte-identical, install verified, acceptance record pass.

## Update Subroute

The default path remains build mode. The update subroute is opt-in and runs only with the `update` token or `update: true` / `revision: true`. It does not change the build steps, check-set v3, or build outputs.

- O0 Mode and role: infer `okf-reference` or `okf-update`; reject a law role.
- O1 Baseline: verify the installed skill and adopt its inventory, lock, coverage, and log.
- O2 Document: measure the reference or update document; keep raw non-English text only in the original.
- O3 Plan: add-source, update-source, reference-only, concept operations, and coherence.
- O4 Coverage: every heading, preamble block, code block, and line has a disposition or interpretation.
- O5 Bundle: copy the baseline skill tree to staging; apply source and concept operations to `okf/`; rewrite links; recompute requires and indexes; keep the runtime (`dist/`, `okf-core/`, `scripts/`) byte-identical to the baseline.
- O6 Freshness: set generated, verified, and stale-after metadata; append the dated log.
- O7 Assets: reconcile asset roots, concepts, and ledgers.
- O8 Verify: run the canonical verifier in `--kind update --mode dev`; every required v4 check must be `machine_verified`.
- O9 Install: atomic replace with backup and rollback. Run `--kind update --mode installed`; source/installed SHA must match.
- O10 Report: record the role, version, concept counts, coverage, asset parity, closures, and install path.

Execution: call `applyOkfRevision` from `okf-revision/apply.mjs` with `{baselineSkill, role, plan, documentMap, context, outDir, sourceText, sourceAlias, sourceRoot, revisionPath, aliasPath}`. It copies the baseline tree, writes changed concepts under `okf/`, rebuilds `atoms.lock.json`, `source/concept-inventory.json`, `source/coverage.json`, the combined `source/source.baseline.md`, the manifest, the indexes, and the log. Verify dev with `verify-okf-skill.mjs --kind update --mode dev --source-root <root> --path-alias <staging alias>`. Install with `installWithRollback` from `revision/install.mjs`. Verify installed with `--kind update --mode installed` and compare `sha256Tree` source/installed.

## Verification Gates

| Gate | Pass |
|---|---|
| Canonical verifier dev | exit 0; `check_set_version` from `checks.json`; every dev check `machine_verified`; closure recorded |
| Canonical verifier installed | installed tree; every installed check `machine_verified`; source/installed SHA match |
| Canonical verifier update | `verify-okf-skill.mjs --kind update`; `check_set_version: 4`; dev and installed required checks `machine_verified`; adapter output is a full installable skill; source/installed SHA match |
| Conformance | three official conditions only |
| Lint | broken link, missing index, orphan, unknown type/key, stale, source mismatch |
| Profile | required types/concepts/rules, closure |
| Coverage | `source/coverage.json` present; `unmappedHeadings`, `unmappedPreamble`, `unmappedLines` all 0 |
| Graph | outgoing, incoming, backlinks, index coverage |
| Prerequisite closure | every non-preamble concept declares `x-requires`; `required --entry <last concept>` returns a transitive multi-node closure |
| Context | required closure; `BUDGET_EXCEEDED` over budget |
| Navigation | `show` returns body, outgoing, incoming, sources, trust, freshness |
| Usage | 13 sections + 10 scenarios |
| Determinism | `rebuild` prints byte-identical |
| Distribution | shared module hashes match; alias map outside the skill tree |
| Pre-OKF original | `PRE-OKF-ORIGINAL.md` + `source/pre-okf-original.json` present; local hash/bytes match the ledger; dev re-hash matches the source; installed copy present |
| Install | installed `dist/skill.mjs` resolves sibling `okf/` |
| Acceptance record | `$OKF_OUT/okf-builds.json` matches the current `check_set_version` and carries a build entry with dev/installed counts and closures |
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
| `PRE_OKF_ORIGINAL_MISSING` | `PRE-OKF-ORIGINAL.md` or `source/pre-okf-original.json` absent | write both; re-verify; no install |
| `PRE_OKF_ORIGINAL_DRIFT` | local hash/bytes or dev source re-hash differs from the ledger | re-copy the original; re-verify; no install |
| `PREREQUISITE_GRAPH_FLAT` | a multi-concept bundle lacks `x-requires` or the closure is a single node | add the prerequisite chain; re-verify; no install |
| `ACCEPTANCE_RECORD_STALE` | `$OKF_OUT/okf-builds.json` lacks the current check set or a build entry | regenerate the record; re-verify |
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
| `ASSET_REFERENCE_MISSING` | a strong source reference does not resolve | add the asset or record an explicit exclusion; no install |
| `ASSET_ROOT_MISSING` | a declared asset root is absent | fix the manifest or the tree; no install |
| `ASSET_OUTSIDE_ROOT` | an asset resolves outside the declared root | keep the asset inside the root; no install |
| `ASSET_SECRET_EXCLUDED` | an asset is secret-bearing | exclude it; never ship it |
| `ASSET_NOT_ENGLISH` | an asset contains CJK | exclude or translate explicitly; no install |
| `ASSET_SIZE_EXCLUDED` | an asset exceeds the size limit | metadata-only concept or explicit exclusion |
| `ASSET_BINARY_INDEXED` | a binary asset is indexed | ship the raw file; no text fence |
| `ASSET_ALIAS_DUPLICATE` | two assets map to one concept id | rename or disambiguate; no install |
| `ASSET_SEMANTIC_OMISSION` | the AI proposal omits a strong signal | include or explicitly exclude it; no install |
| `ASSET_SEMANTIC_PATH_MISSING` | the AI proposal invents a path | remove the path; no install |
| `ASSET_SEMANTIC_POLICY_VIOLATION` | the AI proposal selects a refused asset | policy wins; no install |
| `ASSET_COVERAGE_GAP` | assets and concepts or ledgers disagree | repair the ledger or concept set; no install |
| `ASSET_MANIFEST_MISSING` | the asset manifest is absent | write it; re-verify |
| `ASSET_HASH_MISMATCH` | a copied asset differs from staging | reinstall; no completion |
| `ASSET_INSTALL_MISSING` | an installed asset root or file is absent | copy the asset root; no completion |
| `INSTALL_BLOCKED` | copy or post-check fail | restore backup; report |

## Completion

- Every built skill: canonical verifier dev and installed `machine_verified`, `rebuild` byte-identical, forbidden-token scan zero, installed bundle resolves `okf/`, source/installed SHA match, acceptance record pass.
- Every built skill carries `PRE-OKF-ORIGINAL.md` and `source/pre-okf-original.json`; multi-concept bundles have a transitive prerequisite closure; `$OKF_OUT/okf-builds.json` matches the current check set.
- No write to `CLAUDE.md` or the make/plan/start/review/resolve commands.
- Assets: every provided strong-signal asset is included or explicitly excluded; every included asset has one concept and one ledger entry; `asset-coverage` is zero-unmapped; `install.js` copies every asset root; zero assets is a valid zero-count build.
- Report adoption gaps; never claim V1 as rule-level proof.
