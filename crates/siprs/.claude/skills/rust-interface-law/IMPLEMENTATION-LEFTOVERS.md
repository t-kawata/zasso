# `*-law` Skill Development Guide

Reference implementation: `rust-interface-law`.
Purpose: build a law skill whose rule corpus is too large for `SKILL.md`, yet whose retrieval, delivery, applicability, gating, and completion are script-enforced.
Invariant: zero prior user preparation; zero rule text in `SKILL.md`; zero direct `okf/` reads; zero uncontrolled delivery.

## 1. Definition

A `*-law` skill is:

| Layer | Content |
|---|---|
| `SKILL.md` | procedure, path anchor, CLI contract, judgment boundary |
| `okf/` | one Atom = one node; normative rule text |
| `atoms.lock.json` | immutable extracted Atom set |
| `coverage.json` / `coverage.md` | line partition proof |
| `source/` | manifest, redaction map, skill registry |
| `scripts/` | ingestion + runtime |
| `dist/skill.mjs` | deterministic bundled entry |
| `install.js` | copy-only installer |
| `tests/` | lock, redaction, runtime, bootstrap, scaffold, delivery |

Law skill = executable policy. Not documentation.

### 1.1 Domain neutrality

This guide defines a **domain-neutral law engine**. Rust terms are examples, not constraints.

| Generic | Rust example | Other examples |
|---|---|---|
| surface | rest, websocket, cli, grpc, mcp, a2a | page, component, layout, form, api, job, pipeline, doc |
| unit | crate | package, workspace, module, directory |
| phase | contract, core, operation, adapter, docs, conformance | tokens, primitives, components, accessibility, motion, performance |
| rule prefix | REST, WS, CLI | TOKEN, A11Y, PERF, API, SEC |
| discovery adapter | Cargo.toml + `crates/**/src` | package.json workspaces, pyproject, go.mod, custom glob |

`law-profile.toml` parameterizes the engine:

| Field | Content |
|---|---|
| `domain` | law subject |
| `surfaces[]` | applicable surfaces |
| `roles[]` | unit roles |
| `phases[]` | ordered phases |
| `rule_prefixes[]` | prefix → phase, surface |
| `canonical_roles{}` | canonical role → project role |
| `discovery` | manifest names, source roots, globs |
| `detectors[]` | scan ids, levels |
| `templates[]` | catalog paths |
| `gate_levels[]` | V1..V4 policy |
| `language` | `en` |

No law may hard-code Rust. §5/§6/§7 tables are profile examples.

## 2. Non-negotiable invariants

| ID | Invariant |
|---|---|
| L1 | Rule text lives only in `okf/`; `SKILL.md` holds procedure only |
| L2 | AI reads delivered `context` only; never `okf/`; never greps rule IDs |
| L3 | Zero hand-authored profile, map, manifest, or config |
| L4 | Unrelated work skips all law commands |
| L5 | Only planned phases are delivered |
| L6 | `machine_verified` is the only machine pass |
| L7 | `human_attested` requires `approval_ref` |
| L8 | `unverifiable` / `not_run` / `failed` never pass |
| L9 | Completion forbidden while `gate` or `attest` fails |
| L10 | Skill tree contains no concrete project name, ticket ID, or placeholder leak |
| L11 | Identical input → identical lock, coverage, OKF, dist |
| L12 | Installer copies; never builds; never judges |

### 2.1 Mechanization principle

Rule: if a step is deterministic, it must be a script. Prose instruction is a defect.

| Step | Mechanized | AI judgment |
|---|---|---|
| discovery | manifest/source-root scan | none |
| applicability | `applies` path match | none |
| closure | `resolve` phase/surface filter | none |
| information reach | `context` delivery + hash | none |
| inspection | detectors, `gate` | detector selection |
| template | `scaffold` plan execution | plan content, open design |
| correction | gate findings + fix text | semantic fix |
| completion | `gate` exit + `attest` | human approval |
| distribution | installer copy | integration policy |

AI output is constrained by fixed-schema JSON; script validates, applies, rolls back.
Never let AI hand-edit generated artifacts, lockfiles, gate reports, or ledgers.

### 2.2 Document style

All skill Markdown: English only; heavy technical terminology; telegraphic; high compression; high density; no summarization; zero information loss; minimal characters.

| Rule | Requirement |
|---|---|
| Language | English; no CJK in skill files or runtime output |
| Form | tables, bullets, short clauses |
| Compression | one fact per line; no filler, no restatement |
| Loss | every normative fact preserved; examples explicit |
| Characters | minimum consistent with zero loss |
| Runtime | Markdown for AI; JSON to `--out` |
| Chat | user language only; never inside skill artifacts |

## 3. Asset ingestion

### 3.1 Manifest

`source/manifest.toml`:

| Field | Meaning |
|---|---|
| `spec_version` | source law version |
| `source_set_sha256` | hash over `path\0sha256` lines |
| `redaction_sha256` | hash of redaction map |
| `[[file]] path` | repo-relative source path |
| `[[file]] sha256` | LF-normalized source hash |

Never use absolute paths: they embed machine and project names.

### 3.2 Extract

Atom fields:

| Field | Rule |
|---|---|
| `id` | Rule = rule ID; other = `<type>/<heading-slug>/<ordinal>/<hash12>` |
| `type` | `Rule`, `Heading`, `Paragraph`, `List`, `Table`, `TableRow`, `TableHeader`, `CodeBlock`, `Blank` |
| `source` | manifest path |
| `heading_path` | redacted heading stack |
| `ordinal` | per type + heading path; Rule = registry row |
| `source_sha256` | LF-normalized source span |
| `content_sha256` | redacted delivered text |
| `span` | 1-indexed inclusive lines |
| `classification` | `normative`, `non_normative`, `structural` |
| `reason` | deterministic classification reason |
| `text` | redacted delivered text |

Rule ID grammar: `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$`.
Order: source file order, span start, ordinal.

### 3.3 Coverage

Partition: every source line → exactly one leaf Atom or explicit exclusion.

| Gate | Pass |
|---|---|
| `gaps` | 0 |
| `overlaps` | 0 |
| `attributed` | `lines` |
| Structural exclusion | `Heading`, `Blank`, `TableHeader` |

Semantic coverage: partition alone is not delivery.

| Artifact | Content | Gate |
|---|---|---|
| `source/input-ledger.json` | every input under the declared roots; `included` or `excluded` + reason + source phrase; hash-only | every input decided; included ↔ manifest |
| `source/normative-inventory.json` | every normative Atom → Rule ID or explicit `non-rule` reason | no orphan normative statement |
| `source/delivery.json` | defaults + every normative or fact-bearing Atom → `must` or `reference` + reason + `delivered_by` | no silent delivery omission |
| Fact-bearing Atom | `Rule`; normative `Paragraph`/`List`; non-empty `CodeBlock`; `Table` whose header carries a fact column | `must` or recorded `reference` |

`reference` on a fact-bearing `Table`/`Paragraph`/`List` requires `delivered_by` names that exist in the lock. A generic reason (`n/a`, `reference`, `not needed`) fails.

### 3.4 Registry bijection

Rule Atoms ↔ rule-registry rows. Count equality and ID equality.
Multi-segment prefixes (`OP-AUTH-01`) valid. Reject regex that assumes one prefix segment.

### 3.5 Redaction

Hash-only map: `[{sha256, placeholder}]`.
Token: `[A-Za-z][A-Za-z0-9_]*`; lowercase; SHA-256; map hit → placeholder.
Apply to `text` and `heading_path`. Unknown proper noun → fail `15`.
Skill tree scan: zero forbidden literal.

Review completeness:

| Artifact | Content | Gate |
|---|---|---|
| `source/redaction.review.json` | every candidate → `redacted` / `allowlist` / `generic`; hash-only | no undecided candidate |
| Candidate | capitalized token, or any token already in the map | every candidate has a decision |
| `redacted` entry | `category` required; normative constant redaction fails | over-redaction fails |
| Placeholder | unique per hash | injective |

Path alias:

| Artifact | Content | Gate |
|---|---|---|
| `<skill>.path-alias.json` | `{schema, skill, input_roots, aliases}`; original paths; outside the skill tree | every distributable path is an alias |
| Alias | `sources/<basename>` | grammar valid; target unique; inside an input root |
| Distributable artifacts | `manifest.toml`, lock `source`, `coverage.json`, node frontmatter, `source.md`, `coverage.md` | alias only; zero original path |

### 3.6 Determinism

LF normalize CRLF/CR. Stable sort. Atomic writes. `classify` repeat → byte-identical.
`verify` re-extracts and compares lock, coverage, report.

## 4. OKF bundle

One Atom = one node under `okf/nodes/`.
Frontmatter:

```yaml
type: Rule
id: REST-01
phase: adapter
delivery: must
applies_to: rest
requires: []
references: []
content_sha256: <hex>
source: docs/.../rule-registry.md
```

| Field | Rule |
|---|---|
| `delivery` | `must` for Rule / CodeBlock / ContractType / InterfaceBinding / Operation / Documentation / Conformance; else `reference` |
| `phase` | from rule prefix or source doc |
| `applies_to` | `all` or interface role |
| `requires` | node closure dependencies |
| `references` | informational links |

Also: `index.md`, `log.md`, `source.md`, `source.baseline.md`.

| Artifact | Rule |
|---|---|
| Node body | Atom text + one trailing newline; SHA-256 of the body after removing that newline equals `content_sha256` |
| `source.md` | Manifest order; `# Source: <alias>` headers; redacted source text; no original path |
| `source.baseline.md` | Byte-identical to `source.md` |
| `source/delivery.json` | Authority for normative and fact-bearing delivery; node `delivery` must equal the ledger decision |

Never render structural Atoms as `must`. Never force `delivery=must` in `buildManifest`; preserve OKF delivery.

## 5. Phase model

Canonical order:

`scope → contract → core → operation → adapter → docs → conformance → review`

| Unit role | Phases |
|---|---|
| `rest|websocket|cli|grpc|mcp|a2a` | `contract, core, operation, adapter, docs, conformance` |
| `operation` | `contract, core, operation` |
| `adapter` | `contract, core, operation, adapter` |
| `conformance` | `contract, core, conformance` |
| `core` | `contract, core` |

Rule prefix → phase:

| Prefix | Phase |
|---|---|
| `AUTH|OPS|OP|SEC|AUTHZ|SSO|ID|IDN|ERR|IF|OBS` | `operation` |
| `REST|WS|CLI|GRPC|MCP|A2A` | `adapter` |
| `DOC|VAL|BP` | `docs` |
| `CONF` | `conformance` |
| `ARC|CORE` | `core` |
| `APP` | `scope` |
| `MIG` | `review` |

Cross-cutting rules (`ARC`, `CORE`, `DOC`, `VAL`, `BP`, `CONF`) are relevant to interface units. Omitting `core` / `docs` from interface phases under-delivers.

## 6. Surface scoping

Profile defines prefix → `applies_to`. Rust example:

| Prefix | Surface |
|---|---|
| `REST|WS|CLI|GRPC|MCP|A2A` | `rest|websocket|cli|grpc|mcp|a2a` |
| all others | `all` |

Canonical roles → project roles are profile-defined. Rust example:

| Canonical | Project role |
|---|---|
| `identity-core` | core crate (prefer `identity`/`core`; shortest match) |
| `operation-contract` | operation crate |
| `interface-contract` | ports / contract / types / protocol crate |
| `contract-macros` | macro crate |

Never inject canonical names into target code. Reject scaffold content that references a canonical placeholder not present as a workspace member; suggest the mapped project role.

## 7. Zero-preparation bootstrap

Profile supplies a discovery adapter. Rust example:

| Evidence | Extraction |
|---|---|
| `Cargo.toml` with `[package]` | crate name, directory |
| `crates/**/src/` | crate when manifest absent |
| path/name suffix | surface role |
| path/name role words | operation, adapter, conformance, else core |
| git diff | changed paths |

| Ecosystem | Manifest | Source root |
|---|---|---|
| Rust | `Cargo.toml` | `crates/**/src` |
| TS/JS | `package.json` workspaces | `src/**`, `packages/*/src` |
| Python | `pyproject.toml` | `src/**`, `packages/*` |
| Go | `go.mod` | `.` |
| Custom | profile-declared | profile globs |

Write auto profile/map next to manifest. Never write to source tree.
Override `--profile` / `--map` optional for nonstandard layouts; never required.

## 8. CLI contract

Path anchor:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
SKILL_DIR="$REPO_ROOT/.claude/skills/<name>-law"
LAW="$SKILL_DIR/dist/skill.mjs"
[ -f "$LAW" ] || LAW="$SKILL_DIR/scripts/cli.mjs"
LAW_OUT="$REPO_ROOT/target/law"
```

| Command | Contract |
|---|---|
| `applies` | `--root --paths`; exit 0 APPLIES, exit 3 SKIP |
| `resolve` | `--root --paths --out`; auto profile/map; attach V1 process verify |
| `context` | `--manifest --phase|--phases --ledger`; manifest order; predecessor ledger; `--replay`; `--format raw` |
| `explain` | `--rule --root`; requirement + canonical examples + dependency check |
| `scaffold` | `--plan --root [--write]`; fixed-schema plan; dry-run default |
| `gate` | `--manifest [--verify] [--scans] --out`; exit 0 pass, 50 blocked |
| `attest` | `--manifest --phase --init --out` or `--rows`; `unset` blocks |
| `scan` | `--id`; builtin process scans |
| `exception` | `--exceptions --rules`; expiry + approval |
| `should-run` | hook path predicate |
| `check` | `lint|graph|coverage|audit` |
| `package` | render `source.md` |
| `rebuild` | byte-identical reproduction |

Output: Markdown for AI; JSON to `--out` for machines.
Never print raw node markers by default.

Exit codes: `0` pass; `3` skip (`applies`); `10` source/extract; `11` classify; `12` coverage; `13` registry; `14` determinism; `15` generic boundary; `50` gate blocked; `60` scan failed.

`context` prints per-phase Markdown plus delivery hash; `--replay` reproduces the same nodes and hash; `--format raw` prints node markers.
`should-run` is a legacy hook predicate; prefer `applies` for zero-preparation scope checks.

Trust: CI uses the pinned bundle hash as authority; local Stop hook is a self-check only.

## 9. Gate model

Statuses:

| Status | Meaning |
|---|---|
| `machine_verified` | only machine pass |
| `human_attested` | `approval_ref` required |
| `unverifiable` | no evidence |
| `not_run` | zero-selected or insufficient cases |
| `failed` | evidence contradicts |

V1 process gate:

- unmarked `todo!` / `unimplemented!` / `panic!`
- unmarked `TODO` / `FIXME` / `HACK` / `XXX`
- secret patterns
- `[::STUB::]` same or previous line exempts
- empty changed paths → `no-changed-paths` fail closed

Gate report:

`PASS (V1 process only)` when all nodes process-verified.
`Rule-level (V2+)` count proves semantic coverage.
Never claim rule-level correctness from V1.

Optional `[[verify]]` overlay:

```toml
[[verify]]
rule = "AUTH-01"
level = "V3"
cmd = ["node", "check-auth.mjs"]
expected_cases = 3
```

`cmd` prints `{"selected":N,"failed":M}`.
Modes: `cmd` | `scan` | `review` | `process`.
Rows outside closure ignored.

## 9.1 Attestation and exceptions

| Status | Required |
|---|---|
| `applied` | `evidence` |
| `human_attested` | `approval_ref` |
| `exception` | `exception_ref` |
| `unset` | blocks completion |

Exception row: `rule`, `scope`, `expires`, `approval_ref`, `approved_by`.
Fail on expiry, empty approval, or scope mismatch.
Exception is not a pass; it records approval.

## 10. Scaffold

AI writes fixed-schema plan after structural reasoning. Script executes.

```json
{
  "schema": "<name>-law.scaffold/v1",
  "package": "crates/app-rest",
  "interface": "rest",
  "unit": "app-rest",
  "files": [
    { "path": "crates/app-rest/src/state.rs", "mode": "create", "rules": ["REST-01"], "content": "// RULE: REST-01\n..." },
    { "path": "crates/app-rest/src/lib.rs", "mode": "append", "marker": "// [::LAW-SCAFFOLD::] modules", "rules": ["REST-01"], "content": "pub mod state; // RULE: REST-01\n" }
  ]
}
```

Safety:

| Check | Rule |
|---|---|
| package | basename ends `-<interface>` |
| path | relative; inside package; no `..` |
| `create` | target absent; exclusive write |
| `append` | target exists; marker exactly once |
| rules | non-empty; known; `RULE: <id>` present in content |
| incomplete | `[::STUB::]` required |
| secret | reject |
| canonical placeholder | reject unless workspace member; suggest mapped crate |
| failure | rollback creates; restore backups |
| audit | `target/law/scaffold-manifest.json` |

Dry-run default. `--write` explicit. No existing-file overwrite.

## 11. Explain

Rule → source document mapping by prefix:

| Prefix | Document |
|---|---|
| `REST|WS|CLI|GRPC|MCP|A2A` | interface document |
| `AUTH|AUTHZ|SSO|ID|IDN` | identity |
| `OP|OPS` | operation |
| `CONF` | conformance |
| `DOC` | documentation |
| `VAL` | validation |
| `BP` | blueprint |

Output:

- requirement, class, surface, verification, enforcement
- canonical code examples (patterns, not patches)
- dependency check: `workspace member`, `declared dependency`, `mapped to <crate>`, `MISSING`
- relevant example first; dependency example last
- warn before verbatim copy

## 12. Distribution

### 12.1 Installer

`install.js`:

- copies `dist/skill.mjs` to `<target>/.claude/skills/<name>-law/dist/skill.mjs`
- copies `okf/`, `source/`
- preserves `dist/` layout: bundle resolves `okf/` as sibling
- never builds; never judges; never edits target code

`make install-to-projects` target (per project):

```make
node <installer> -y -t <project>/.claude
```

### 12.2 CLAUDE.md propagation

Critical: the installer publishes `<project>/.claude/CLAUDE.md` to `<project>/CLAUDE.md`.
Editing only `<project>/CLAUDE.md` is overwritten on next install.
Maintain the law block in `.claude/CLAUDE.md` (publish source) and root `CLAUDE.md` (local load).

Minimal block:

```markdown
### <name>-law (conditional)

Trigger: changed/target path matches a `crates/**` unit with role `<roles>`; shared
`<shared roles>` only when ticket declares scope.

Precheck: `node "$(git rev-parse --show-toplevel)/.claude/skills/<name>-law/dist/skill.mjs" applies --root "$(git rev-parse --show-toplevel)" --paths "<paths>"`.

Exit 3 → skip law. Exit 0 → invoke `<name>-law`; completion requires `gate` exit 0 and `attest` ok.
```

### 12.3 Command checkpoints

Install law checkpoints in pipeline commands.
Keep only trigger, binding, completion:

| Command | Checkpoint |
|---|---|
| `make-*` | invoke skill; `applies`; record `Law:` scope; add `gate`/`verify` tests |
| `plan-*` | invoke skill; read scope; plan phases; plan `context --phases` |
| `start-*` | invoke skill; re-run `applies`; `resolve`; `context --phases`; `gate`/`attest` |
| `review-*` | invoke skill; regenerate manifest; `gate`; `attest`; V1-only honesty |
| `resolve-*` | invoke skill; `gate` repair class; fill `attest`; no status change |

Rules:

- explicit `invoke <name>-law` in every command
- exact CLI only in `SKILL.md`; never duplicate
- checkpoint ≤5 lines
- binding values: paths, phases, shared flag
- completion: `gate` exit 0; `attest` ok

### 12.4 Over / under trigger avoidance

| Control | Effect |
|---|---|
| `applies` exit 3 | unrelated work zero cost |
| default interface roles only | core bug fix does not trigger |
| `--include-shared` | operation / contract / identity included only when declared |
| `--phases` | planned subset only |
| ledger predecessor | deliver once; no re-delivery |
| `explain` / `scaffold` | on demand only |
| `gate` / `attest` | only after APPLIES |

Phase cost reference (interface unit, full closure): contract 25, core 26, operation 168, adapter 38, docs 75, conformance 68; ~400 must nodes.
Planned subset reduces delivery; ledger prevents repeat.

## 13. Testing

TDD mandatory.

| Test file | Scope |
|---|---|
| `atom-lock` | coverage partition; registry bijection; identity; determinism |
| `redaction` | hash-only map; skill-tree forbidden scan |
| `generic-boundary` | no project name; `SKILL.md` no rule text |
| `skill-runtime` | closure; delivery; gate statuses; attest; scans; trust; dist |
| `integration` | 18-doc verify; hash mismatch; install layout; gate overlay; attest document |
| `bootstrap` | auto-discovery; process scan; zero-config resolve; closure inclusion |
| `scaffold` | dry-run; create; append/backup; rejection matrix; explain |
| `context-phases` | subset delivery; order; predecessor failure |
| `render` | Markdown context/gate/attest |
| `applicability` | APPLIES / SKIP; shared flag; phases |
| `source-rederivation` | source → lock → coverage → OKF → report bytes match |
| `installed-parity` | install to temp target; installed skill passes the verifier; source/installed SHA parity |
| `verifier-negative` | one mutated fixture per verifier check; each fails the named check |
| `path-alias` | alias grammar; resolution; map outside the skill; zero original path |
| `redaction-review` | candidate completeness; map bijection; placeholder injectivity |
| `normative-inventory` | every normative Atom has a Rule or explicit non-rule decision |
| `delivery-coverage` | every fact-bearing Atom is `must` or explicit `reference` with `delivered_by` |

Run: `node --test tests/*.test.mjs`.
Artifact checks: `ingest verify`, `rebuild` byte-identical, `check audit`, forbidden-name scan, installed-copy verifier.
Every check in section 30 has a mutated fixture that fails. A check without one is unproven and must not be `machine_verified`.
Command impact set: pipeline baseline, distribution convention, command integration, registry delivery mirror.

## 14. Anti-patterns

| Anti-pattern | Defect |
|---|---|
| Rule text in `SKILL.md`; full CLI in commands | duplication, drift |
| AI reads `okf/` or greps rule IDs | uncontrolled bypass |
| Required human profile/map; root `CLAUDE.md` only | unusable / overwritten |
| All phases or all rules every ticket | token waste, noise |
| Canonical crate copied verbatim | nonexistent dependency |
| V1 PASS claimed as rule-level proof | false assurance |
| Structural Atom `must`; interface rule `applies_to: all` | noise, contamination |
| Append without marker; overwrite existing file | corruption, data loss |
| Non-deterministic dist | install/repro mismatch |
| Project name/ticket ID; absolute source path | noise, leak |
| Check reads only a generated summary | consistency, not artifact proof |
| Keyword-overlap or annotation-only gate | vacuous pass |
| Verifier skips the installed copy | source/install drift |
| No mutated fixture per check | unproven checker |
| Heuristic scanner as blocking gate | noise, deferral |

## 15. New `*-law` checklist

1. Define domain, absolute invariants, rule ID grammar.
2. Select authoritative source docs; exclude derived views.
3. Author manifest; relative paths only.
4. Build extract; atom identity; classification.
5. Build coverage partition; gaps 0, overlaps 0.
6. Build rule registry; assert bijection.
7. Build hash-only redaction; scan skill tree.
8. Render OKF; one Atom = one node; correct `delivery`.
9. Define phases, interface roles, prefix maps, phase-per-role.
10. Define canonical roles → project role mapping.
11. Implement `applies`, `resolve`, `context`, `gate`, `attest`.
12. Implement `explain`, `scaffold`, `exception`, `should-run`, `check`, `package`, `rebuild`.
13. Implement auto-discovery from build manifests and `crates/**/src`.
14. Implement V1 process gate; optional `verify` overlay.
15. Implement Markdown renderers; JSON to `--out`.
16. Build deterministic `dist/skill.mjs`; copy-only `install.js`.
17. Write test matrix; Red → Green → Refactor; add one mutated fixture per verifier check.
18. Validate `ingest verify`, `rebuild` byte-identical, `check audit`, forbidden scans, node-body hashes.
19. Install to targets; verify installed `dist` resolves `okf/`; run the canonical verifier on the installed copy; compare source/installed SHA.
20. Write `.claude/CLAUDE.md` publish block.
21. Add command checkpoints to make/plan/start/review/resolve.
22. Reinstall; verify target `CLAUDE.md` and commands.
23. Test APPLIES / SKIP on real target paths.
24. Test planned-phase delivery and ledger.
25. Document leftovers below.

## 16. Parameterization

| Keep | Change |
|---|---|
| Atom model | rule IDs |
| coverage partition | source docs |
| hash-only redaction | phases |
| phase engine | interface roles |
| gate statuses | prefix maps |
| scaffold safety | canonical roles |
| installer layout | detectors |
| Markdown output | templates |
| zero-prep bootstrap | command names |

## 17. Known leftovers

| Leftover | Status | Required work |
|---|---|---|
| `lawScope` validator | deferred | required ticket field; cross-check `applies`; fail make/plan/start on mismatch |
| Auto phase planner | deferred | target path → phase subset; avoid AI guess |
| Rule-level detectors | resolved | `implementation-scan` executes registered detectors; V2 source proof |
| Dependency validation | resolved | `implementation-metadata` checks required and forbidden edges |
| Nonstandard layout discovery | deferred | workspace members outside `crates/`; names without role suffix |
| Template catalog | resolved | `templates/<interface>/` plus `template` plan and scaffold reconciliation |
| Per-rule examples | resolved | `explain` shows effective pin, template, detector, and test |
| Gate level policy | resolved | V1 process, V2 implementation, V3 project compile/test, V4 attestation |
| Repo-wide ledger policy | deferred | invalidation on manifest change; phase re-delivery rules |
| CI pinning | deferred | pinned bundle hash authority; local Stop hook self-check |
| Verifier depth | resolved | v2 modes, source re-derivation, node-body hash, registry bijection, installed parity, test non-vacuity, mutated fixture per check (section 30) |

## 18. Definition of done

A `*-law` skill is complete when all hold:

- `applies` exits 3 for unrelated paths, 0 for relevant paths.
- `resolve` runs with zero hand-authored config.
- `context --phases` delivers only planned phases; order enforced.
- `gate` exits 0/50; `attest` blocks `unset`.
- `scaffold` dry-run default; no overwrite; rollback on failure.
- `explain` returns requirement + canonical examples + dependency status.
- `ingest verify` re-derives lock, coverage, and report from the source files; bytes match.
- `rebuild` byte-identical; node-body hashes match `content_sha256`; `check audit` passes.
- Rule Atoms and registry rows are bijective by count and ID set.
- Skill tree has zero concrete project names, ticket IDs, Japanese text.
- Installer preserves `dist/`; installed skill resolves `okf/`; installed copy passes installed mode; source/installed SHA match.
- Required core test files exist; the suite reports tests and assertions; optional tests are not counted as pass.
- Every verifier check has a mutated fixture that fails.
- `source/input-ledger.json` decides every input; included entries equal the manifest.
- `source/redaction.review.json` decides every candidate; the map is hash-only and injective.
- `source/normative-inventory.json` covers every normative Atom; no orphan.
- `source/delivery.json` covers every fact-bearing Atom; no silent `reference`.
- The path alias map is outside the skill; every distributable path is an alias.
- The skill passes installed mode; source/installed SHA match.
- One canonical verifier only; the caller consumes the shared check contract; no divergent copy.
- `.claude/CLAUDE.md` carries the conditional law block.
- Five pipeline commands invoke the skill explicitly; exact CLI only in `SKILL.md`.
- Command checkpoints ≤5 lines; binding + completion only.
- Test matrix passes; command impact tests pass.
- Leftovers table updated.

## 19. Exhaustive placement

```text
<name>-law/
├── SKILL.md · DESIGN.md · IMPLEMENTATION-LEFTOVERS.md
├── install.js · dist/skill.mjs
├── atoms.lock.json · coverage.json · coverage.md
├── source/{manifest.toml, redaction.sha256.json, skill-registry.toml}
├── okf/{index.md, log.md, source.md, source.baseline.md, nodes/*.md}
├── scripts/{cli.mjs, commands.mjs, ingest.mjs, lib/*.mjs}
└── tests/{*.test.mjs, fixtures/}
```

| Group | Files | Responsibility |
|---|---|---|
| root docs | `SKILL.md`, `DESIGN.md` | procedure, decisions, Atom model, invariants |
| installer | `install.js` | copy-only; preserve `dist/` sibling layout |
| bundle | `dist/skill.mjs` | deterministic esbuild bundle; single entry |
| source | `source/manifest.toml`, `redaction.sha256.json`, `skill-registry.toml` | paths, hashes, SK invariants |
| lock | `atoms.lock.json`, `coverage.json`, `coverage.md` | Atom set, attribution, gaps/overlaps |
| OKF | `okf/nodes/*.md`, `index.md`, `log.md`, `source.md`, `source.baseline.md` | one Atom per node; provenance; redacted source; baseline |
| entry | `scripts/cli.mjs`, `commands.mjs`, `ingest.mjs` | dispatch, commands, manifest/extract/classify/verify |
| ingestion libs | `atoms`, `markdown`, `coverage`, `redact`, `registry`, `report`, `toml` | parse, partition, hash, registry, report |
| closure libs | `units`, `closure`, `okf`, `context` | profile/map, manifest, frontmatter, delivery |
| verification libs | `gate`, `attest`, `exception`, `scan`, `process-scan` | statuses, approval, expiry, scans |
| config libs | `autoconfig`, `dist`, `trust`, `should-run` | discovery, bundle, pinned hash, hook |
| AI/template libs | `render-ai`, `explain`, `scaffold` | Markdown, examples, plan execution |

Minimum viable set: atoms, markdown, coverage, redact, registry, closure, okf, context, gate, attest, render-ai, autoconfig, cli, commands.
Optional: explain, scaffold, exception, should-run, trust, package, rebuild.

## 20. Artifact schemas

| Artifact | Shape |
|---|---|
| `manifest.json` | `{spec_version, units[{id,crate,role,interfaces}], phases[], nodes[{id,type,phase,delivery,applies_to,requires,references,content_sha256,source,body,verify}], omitted[], closure_sha256, root, changed[], roles{}}` |
| `ledger.json` | `{phases[]}`; add `manifest_sha256` to invalidate on law change |
| `gate-report.json` | `{statuses[{rule,status,evidence,modes}], machinePass, ok}` |
| `attestation.json` | `{phase, rows[{rule,status,evidence,approval_ref,exception_ref}]}` |
| `scaffold-manifest.json` | `{schema, package, interface, unit, plan_sha256, applied[], backups[]}` |
| `atoms.lock.json` | `{spec_version, source_manifest_sha256, redaction_sha256, atoms[]}` |
| `coverage.json` | `{files[{path,sha256,lines,attributed,excluded,gaps[],overlaps[]}], gaps[], overlaps[]}` |
| auto config | generated profile/map; explicit input wins |

## 21. Source authoring contract

| Rule | Requirement |
|---|---|
| Granularity | one normative statement per rule row |
| ID | stable, unique, registry-visible |
| Columns | id, class, surface, prefix, spec, rule, verification, enforcement |
| Headings | stable hierarchy; unique path per document |
| Code block | one concept; language tag; compile-valid or `text` |
| Normativity | MUST/SHOULD/MAY; examples separate |
| Duplication | none; cross-reference by rule ID |
| Derived views | excluded from source set |
| Language | English |
| Secrets | none; PII none |
| Tables | one rule per row; no multi-rule cells |
| Line endings | LF |

## 22. Retrieval design

| Mechanism | Purpose |
|---|---|
| Rule registry | O(1) ID lookup; bijection proof |
| Heading path | stable atom key; redacted |
| `resolve` | prefilter by unit phase + `applies_to`; build manifest |
| `context` | phase/subset filter; no OKF read |
| `requires` | closure expansion |
| `references` | cross-link reachability |
| `explain` | prefix → source document; canonical examples |
| `index.md` | human TOC |
| `log.md` | provenance |
| delivery hash | replay stability |
| `--phases` | token budget per ticket |
| ledger | deliver once per phase |

Never search by grep. Never read `okf/` directly. Never deliver `reference`/`omitted` nodes.

## 23. Detector and gate recipe

Detector: `{id: scan/<name>, level: V1|V2|V3|V4, applies_to, input: {text,path,before,after,project}, output: {ok, findings:[{path,line,kind,message,fix}]}}`. Deterministic; no network; no target execution.
Registration: `scans.toml` maps `id` to detector metadata.
Rule binding: `[[verify]] rule, level, scan|cmd|review`.
Levels:

| Level | Proof |
|---|---|
| V1 | process/static scan |
| V2 | structural/AST/import/config |
| V3 | test command with selected/failed counts |
| V4 | human review with `approval_ref` |

Detector authoring:

1. one rule per detector; no multi-rule heuristic.
2. line-anchored finding; exact fix message.
3. fixture positive and negative.
4. false-positive budget zero for normative rules.
5. fail closed on missing input.
6. gate reports `PASS (V1 process only)` when only V1.

## 24. Template catalog

Optional catalog for package-level generation.

```text
templates/<interface>/{manifest.json, state.rs.tmpl, handler.rs.tmpl, tests.rs.tmpl}
```

Placeholders: `{{crate}}`, `{{type}}`, `{{operation}}`, `{{interface}}`.
Every template carries `RULE:` annotations and `[::STUB::]` for project decisions.
Mapping: catalog `manifest.json` → target path; no path traversal.
Generation:

1. AI writes scaffold plan from catalog or reasoning.
2. `scaffold` validates; dry-run; `--write`.
3. Optional compile/test command; report only; rollback on failure.
4. Manifest records plan hash and backups.

Template catalog is optional. AI-authored plan is the minimum safe path.

## 25. Security and threat model

| Threat | Control |
|---|---|
| Source injection; secret/PII leak | source as data; no execution; secret scan; hash-only redaction |
| Path traversal; symlink escape; unsafe source path | relative path; inside package; reject `..`; real path; no absolute manifest |
| Overwrite/data loss; installer clobber | exclusive create; marker append; backup; rollback; publish source |
| Gate bypass; ledger tampering; manifest drift | pinned hash; CI authority; manifest hash in ledger; `rebuild`; `verify` |
| Detector false positive; non-English output | fixtures; narrow rules; English renderer; language scan |
| Supply chain | pinned esbuild; no runtime network; lockfile |
| Concurrent agents | atomic writes; per-target lock |
| Token DoS | `applies`; `--phases`; per-phase budget |
| Project-name leak | hash-only map; forbidden-token test |

## 26. Operational runbook

Law update:

```text
source change → manifest → extract → classify → coverage verify → render OKF → check audit → rebuild → tests → dist → install → command impact tests
```

| Step | Command |
|---|---|
| manifest | `ingest.mjs manifest` |
| classify | `ingest.mjs classify` |
| verify | `ingest.mjs verify` |
| OKF | `cli.mjs render` |
| audit | `cli.mjs check audit --lock atoms.lock.json` |
| rebuild | `cli.mjs rebuild` |
| dist | test suite builds `dist/skill.mjs` |
| install | copy-only installer |

Versioning: bump `spec_version`; regenerate manifest/lock/coverage/OKF/dist; rerun tests.
Drift: `rebuild` fail → reclassify; never hand-edit lock.
Rollback: git revert; reinstall pinned dist.
Consumer migration: install; `applies`; `resolve`; `context --phases`.

## 27. Domain profiles

| Axis | Rust interface | TS UI | API service | Data pipeline | Docs law |
|---|---|---|---|---|---|
| Surfaces | rest/ws/cli/grpc/mcp/a2a | page/component/layout/form | endpoint/resource | stage/stream | section/page |
| Phases | contract→core→operation→adapter→docs→conformance | tokens→primitives→components→a11y→motion→performance | contract→auth→handler→errors→docs→conformance | ingest→validate→transform→publish→observe | outline→content→links→render |
| Prefixes | REST/WS/AUTH | TOKEN/A11Y/PERF | API/SEC/ERR | PIPE/SCHEMA | DOC/LINK |
| Detectors | todo/panic/secret | raw hex/missing alt/`any`/`!`/focus trap | auth/idempotency/error schema | lineage/schema/null | broken link/orphan/heading order |
| Templates | state/handler/test | component/story/test/style | route/handler/test | job/schema/test | page/toc |
| Gate | cargo test/check | typecheck/lint/a11y/visual/perf | contract/openapi/error | schema/data quality | link/lint |

Rust row is the reference profile. Every other domain uses the same contracts with profile values. Replace Rust tokens (`todo!`, `panic!`, `cargo`) with domain detectors. `explain` maps prefix → domain spec section. `scaffold` package = domain unit directory.

## 28. Performance budgets

| Operation | Budget |
|---|---:|
| `applies` / `resolve` | <200ms / <1s for 2.5k atoms |
| `context` / `gate` / `attest` | <500ms / <5s / <1s |
| `rebuild` / memory / network | <5s / <256MB / zero |

Measure in tests. Reject linear scans over full source at delivery time.

## 29. Contradiction resolutions

| Apparent contradiction | Resolution |
|---|---|
| Rule text only in OKF vs lock text; one Atom vs reference nodes | lock is machine source; AI reads delivered context; only `must` delivered |
| Zero preparation vs maintained CLAUDE/commands; root vs `.claude/CLAUDE.md` | development-time integration; installer publishes `.claude/CLAUDE.md` |
| Two installers; `should-run` vs `applies` | skill installer copies `dist/okf/source`; workspace installer mirrors `.claude`; `applies` authoritative |
| V1 PASS vs rule compliance | V1 process only; V2+ verify required |
| `context --phases` subset vs predecessor | predecessor must be in ledger; deliver once |
| Scaffold AI plan vs template catalog | catalog optional; AI plan minimum safe path |
| Canonical crate names vs project crates | role mapping; reject placeholder unless member |

## 30. Generic `*-law` skill verifier

One verifier for every `*-law` skill. Canonical script:
`.claude/scripts/amend-rfc-up/verify-law-skill.mjs`.

Purpose: prove a skill was developed by this guide before another skill or
command uses it. The verifier is the single source for `*-law` creation,
development, and adoption. Do not implement a second checker.

CLI:

```bash
node .claude/scripts/amend-rfc-up/verify-law-skill.mjs \
  --skill <skill-dir> --root <project-root> \
  [--mode dev|installed] [--source-root <source-root>] \
  [--path-alias <map>] --out <law-skill-verification.json>
```

Output: `law-skill-verification/v1`.

| Field | Content |
|---|---|
| `schema` | `law-skill-verification/v1` |
| `mode` | `dev` or `installed` |
| `check_set_version` | `2` |
| `skill` | resolved skill path |
| `root` | project root |
| `source_root` | resolved source root, or null in installed mode |
| `path_alias` | resolved alias map path |
| `required_checks` | checks applicable to the mode |
| `checks` | one entry per check |
| `closure_sha256` | hash over mode + check set version + check names + statuses |

Check status: `machine_verified` only pass; `failed`, `unverifiable`,
`not_run` never pass. A skill with any required non-pass check is
`LAW_SKILL_INVALID`. `assertMachineVerified` consumes `required_checks`; the
caller does not keep a second list.

Modes:

| Mode | Input | Proves |
|---|---|---|
| `dev` | `--source-root` plus skill tree | source → lock → coverage → OKF → report → dist |
| `installed` | skill tree only | installed-tree invariants and runtime |

A `dev` check without `--source-root` is `unverifiable`, never pass. Installed
mode never claims source re-derivation; it verifies node-body integrity and the
installed runtime. The alias map default is
`<skills-root>/<skill-name>.path-alias.json`; it stays outside the skill.

| Check | Mode | Pass |
|---|---|---|
| `layer` | both | dev: SKILL.md, DESIGN.md, IMPLEMENTATION-LEFTOVERS.md, okf/index.md, okf/log.md, okf/source.md, okf/source.baseline.md, okf/nodes, atoms.lock.json, coverage.json, coverage.md, source/manifest.toml, source/redaction.sha256.json, source/input-ledger.json, source/redaction.review.json, source/normative-inventory.json, source/delivery.json, scripts, dist/skill.mjs, install.js, tests. installed: dist/skill.mjs, okf/*, source/*, tests/fixtures/runtime/runtime.json |
| `manifest` | dev | spec_version/source_set_sha256/redaction_sha256; every `[[file]]` path is an alias resolved by the map; its SHA-256 is recomputed from the actual LF-normalized source bytes; source_set_sha256 recomputes from those bytes |
| `lock` | both | dev: atoms.lock.json ↔ okf/nodes; one Atom = one node; every node body hash recomputes to `content_sha256`; every Rule Atom carries `source` and `span`. installed: every node body hash recomputes to its frontmatter `content_sha256` |
| `coverage` | dev | lock spans re-partition every source line; coverage.json and coverage.md match; gaps=0, overlaps=0, attributed=lines |
| `registry` | dev | Rule Atom IDs and registry rows are bijective by count and ID set; grammar valid; unique; non-empty |
| `genericBoundary` | both | hash-only redaction; zero forbidden token; dev adds SKILL.md `## Procedure` and no `## Rule` |
| `delivery` | both | structural Atom never `must`; `must` only for allowed types |
| `runtime` | both | `applies` exits 0 on the applicable fixture and 3 on the unrelated fixture; `context --phases` enforces predecessor order; `gate` exits 0/50 with a valid report; `attest` rejects `unset`; `check lint/graph` exit 0; dev adds `check coverage/audit --lock` |
| `reproduction` | dev | `ingest verify` exits 0; `rebuild` is byte-identical; `source.md` regenerates and `source.baseline.md` equals it |
| `tests` | dev | every required test file exists; each carries a test and an assertion; the core suite reports tests>0, pass>0, fail=0; meta tests are existence-checked only |
| `installer` | both | dev: install.js copies only and no build command; temp install; installed mode passes; installed layering is exact; source/installed SHA match. installed: layering is exact; installed `dist` resolves sibling `okf/` |
| `determinism` | dev | `classify` twice is byte-identical; committed lock/coverage/report match; `rebuild` is byte-identical; in-memory esbuild output equals committed `dist/skill.mjs` |
| `redaction` | dev | every candidate (capitalized token, or token already in the map) has a decision; map ↔ `redacted` entries; placeholders are injective; a redacted normative constant fails |
| `coverageSemantics` | dev | every normative Atom has an inventory decision; every fact-bearing Atom is `must` or explicit `reference` with a specific reason and `delivered_by`; node delivery matches the ledger |
| `inputLedger` | dev | every file under `input_roots` has an alias and a ledger entry; hashes match; included ↔ manifest; excluded has a reason and a source phrase; zero original path in the ledger |
| `pathAlias` | dev | map is outside the skill; every manifest/lock/coverage/node path is a mapped alias; targets are unique and inside an input root; zero original path or input root in the tree |
| `installedLeak` | both | zero absolute machine path; zero forbidden token; zero original path; no alias map inside the tree; runtime Markdown is clean |
| `style` | both | `STYLE_NOT_ENGLISH`, `STYLE_NOT_TELEGRAPHIC`, `STYLE_LOW_DENSITY`, `STYLE_REDUNDANT` separately; authored root Markdown in dev, `okf/index.md` and `okf/log.md` in installed; verbatim node bodies excluded |

Rules:

- A check reads artifacts, not generated summaries. A consistency-only check is
  `advisory`; it cannot be the only proof of an artifact fact.
- Every `machine_verified` check executes a fail-closed proof and has a mutated
  fixture that fails. A check without a fixture is unproven; the verifier's own
  suite lives under `tests/amend-rfc-up/` and its fixtures under
  `tests/amend-rfc-up/fixtures/verifier/<check>/`.
- Report mode is not a gate. The gate enforces the strongest form: contract ID
  plus contract-specific code, not keyword overlap; test assertions, not
  annotation presence.
- The verifier never reads `okf/` rule text as a substitute for the skill's
  delivered `context`.
- The verifier verifies the installed copy in installed mode; it does not claim
  source re-derivation there.
- A `*-law` skill is used only after `machine_verified` for every check in the
  mode that applies.
- `tests` runs the dependency-free core suite; a test file that imports the
  optional dist/esbuild chain is reported as `unverifiable`, not as pass.
- The verifier is domain-neutral; no Rust-specific path or rule ID is assumed.
- The verifier is the same script used by `/amend-rfc-up` and by future
  `*-law` creation/development skills. Divergent copies are a defect.
- The reference implementation `rust-interface-law` MUST pass in dev mode; each
  check MUST have a mutated fixture that fails.

Tests: `tests/amend-rfc-up/verify-law-skill.test.mjs` and
`tests/amend-rfc-up/verify-law-skill-negative.test.mjs`.

