# Revision Update Design

Status: design specification. Implementation requires the ticket pipeline.
Applies to: `/build-law-skill`, `/build-okf-skill`.
Target exemplar: `.claude/skills/rust-interface-law` version `0.3.2`.

**Build is the primary path.** The rest of this document specifies the opt-in update subroute. Build mode's inputs, steps, check-set v3, and outputs are unchanged (§4.1). Update mode is selected only by `update <skill> <doc>` or `update: true` / `revision: true`.

## 0. Decision Summary

| ID | Decision |
|---|---|
| D0 | Build is the primary function. Update is an opt-in subroute invoked by a positional `update` token or a self-describing package. Build behavior and check-set v3 remain unchanged. |
| D1 | An update document is a Markdown input supplied as the first source. It may be structured, semi-structured, or plain prose. |
| D2 | The command enters update mode on `update <skill> <doc>` or `revision: true` / `update: true` front matter. No new flags. |
| D3 | The installed skill is the baseline. It must pass the canonical verifier before use. |
| D4 | The AI authors `source/revision/plan.json` when the document is narrative or prose; the machine validates it. A structured package is parsed directly. |
| D5 | The effective rule/concept universe is recomputed from baseline plus plan. The bundle is current-only; history lives in the ledger and source view. |
| D6 | Every baseline rule/concept is preserved, updated with old/new hashes, or retired with document authorization. No silent loss. |
| D7 | The update document is the authorization artifact. Retirements, merges, splits, renames, and weakening record the document hash, the evidence line, and an optional external approval. No separate human approval gate is required. |
| D8 | Update mode uses check-set v4 revision checks. Build mode remains check-set v3. The hardcoded 486-rule check becomes baseline-driven in update mode. |
| D9 | Install remains staging, dev verify, installed verify, atomic replace, backup, rollback. Failure leaves the baseline untouched. |
| D10 | Same baseline plus same update plan produces byte-identical output. The plan is stored and hashed. A prose document alone is not sufficient for byte-identical output unless it carries stable change IDs and target IDs. |
| D11 | The update document may be any language. Only the extracted normative statements, concept bodies, and generated skill artifacts must be English. |
| D12 | Update targets are artifact classes. A law update uses the law coherence profile; an OKF update uses the OKF coherence profile. |
| D13 | Update documents have roles: `law-revision`, `okf-reference`, `okf-update`, `mixed`, `build-source`, `unclear`. The AI classifies the role and records the evidence. |
| D14 | Plain prose is accepted. Every block receives a disposition or an `interpretation` with confidence and rationale. Ambiguity does not become a human gate; the AI chooses the minimal, reversible interpretation. |
| D15 | OKF reference updates are first-class: a reference document may add or update concepts without changing law rules. The law coherence matrix does not apply to them. |

## 1. Problem

The current commands rebuild a skill from a source set but have no revision semantics.

| Gap | Consequence |
|---|---|
| No delta input | A revision document cannot update the installed skill directly. |
| Hardcoded rule preservation | `law-verify/v3.mjs` requires exactly 486 rules and named IDs; adding or retiring a rule fails. |
| No baseline comparison | The verifier cannot prove that a prior rule was preserved or intentionally retired. |
| No identity map | A heading rename silently changes an OKF concept ID; a law rule update could change its ID. |
| No change ledger | No old/new hash, evidence reference, authorization, or revision history. |
| Freshness is metadata only | `stale_after` and `STALE_NODE` detect staleness; nothing forces a rebuild. |
| Installed tree is copy-only | Editing installed files breaks source/installed parity and is not an update path. |

## 2. Goals and Non-Goals

### Goals

| ID | Goal |
|---|---|
| G1 | One document input. The user supplies a revision package; the command does the rest. |
| G2 | Safe. Every failure is fail-closed; the baseline remains installed and untouched. |
| G3 | Complete. Every normative statement in the revision has a disposition; every baseline item is preserved, updated, or retired. |
| G4 | Identity-stable. Rule IDs and concept IDs survive edits; retired IDs are never reused. |
| G5 | Deterministic and idempotent. Same inputs produce identical bytes; re-application is a no-op. |
| G6 | Works for both law and OKF with a shared revision core and two adapters. |
| G7 | Fresh. Version, dates, stale deadlines, and logs are updated by the revision. |
| G8 | Auditable. Baseline digest, evidence, authorization, and old/new hashes are recorded. |
| G9 | Language-neutral input. A Japanese, English, or mixed update document is accepted; the generated law and OKF concepts remain English. |
| G10 | Artifact-coherent. A law rule change updates every artifact class that the rule's verification and enforcement reference, or records an explicit unchanged reason. |
| G11 | Build-first. Build mode's inputs, steps, check-set v3, and outputs remain the primary contract. Update mode is an opt-in subroute. |
| G12 | Prose-tolerant. A plain prose document with no headings, tables, or change blocks is accepted; the AI records interpretations and the machine proves coverage. |
| G13 | OKF-reference-aware. A reference document updates OKF concepts without forcing law rule semantics. |
| G14 | Routine. Update is non-interactive, uses the installed skill as baseline, verifies, installs atomically, and needs no human approval gate. |

### Non-Goals

- Automatic upstream monitoring of external regulations.
- Semantic theorem proving of rule equivalence.
- Silent merge of unstructured prose without a validated plan.
- In-place editing of the installed skill tree.
- Multi-skill atomic update in one invocation (one skill per update invocation).
- Requiring a separate human approval gate before a revision can install.
- Executing two conforming implementations to prove cross-implementation agreement.
- Prescribing storage format, SQL, locking, internal representations, or implementation choices that the law leaves open.
- Making update the primary path or requiring revision artifacts for a normal build.
- Requiring a structured front matter, a `## Changes` section, or rule IDs in a prose document.
- Applying the law coherence matrix to an OKF reference update.
- Forcing a law update when a document is purely informational; such a document is `NO_NORMATIVE_CHANGE` for law and a reference source for OKF.

## 3. Definitions

| Term | Meaning |
|---|---|
| Build mode | The primary path: `<skill> <sources>` rebuilds a skill from sources under check-set v3. No baseline, plan, or revision artifacts are required. |
| Update mode | The opt-in subroute: `update <skill> <doc>` or `revision: true` / `update: true`. Uses the installed skill as baseline and check-set v4. |
| Document role | `law-revision`, `okf-reference`, `okf-update`, `mixed`, `build-source`, or `unclear`. The role selects the adapter and coherence profile. |
| Interpretation | A prose block's resolved meaning: target, operation, confidence, and rationale. It is machine-covered, not human-approved. |
| Routine update | A non-interactive update of an installed skill from a supplied document. It installs only after v4 verification. |
| OKF reference update | An OKF update that adds or refreshes concepts from a reference document; law rule semantics and the law coherence profile do not apply. |
| Coherence profile | The adapter-specific list of artifact classes a changed item must account for. Law and OKF have different profiles. |
| Baseline | The currently installed skill that the revision updates. |
| Update document | The Markdown document supplied as the first source, with `update: true` / `revision: true`, or supplied through `update <skill> <doc>` with inferred context. |
| Revision plan | `revision-plan/v1` JSON that lists every operation and its evidence. |
| Operation | One atomic change: add, update, retire, merge, split, rename, no-op, or asset change. |
| Effective registry | Baseline registry plus add/update/retire/merge/split operations. Law only. |
| Effective bundle | Baseline concepts plus revision operations. Current-only; superseded items are absent. |
| Revision ledger | Applied operations with old/new hashes, evidence, and authorizations. |
| Tombstone | A retired rule or concept ID that must never be reused. |
| Authorization | The revision package's own evidence for a destructive or weakening operation. An external approval ref is optional. |
| Evidence reference | A line number, line SHA-256, heading path, and optional English paraphrase. The raw quote remains in the exempt original package. |
| Change class | `editorial`, `rendering`, `normative`, `addition`, `retirement`, `merge`, `split`, `rename`, `asset`, `process`. |
| Revision target | An artifact class changed by the revision: `body`, `registry`, `api`, `profile`, `conformance`, `policy`, `contract`, `test`, `template`, `index`, `asset`. |
| Coherence | The requirement that a changed rule records the disposition of every target class its verification and enforcement reference. |
| Process directive | A revision instruction about how to revise (ID policy, index generation, completion criterion). It is recorded as policy, never emitted as a law rule. |
| Completion criterion | A law-level criterion the revision records and maps to a conformance rule or expectation. The tool does not execute two implementations. |
| Rendering change | A body change that rewrites links, dates, or layout without changing the normative statement. |
| Superseded | A baseline item replaced by a revision operation; absent from the current bundle, retained in the source view and ledger. |
| Statement hash | SHA-256 of the normalized normative statement, excluding rendered links and dates. |
| Body hash | SHA-256 of the rendered rule or concept body, including links. |
| Weakening | A normative change that reduces obligation strength or scope. |
| Specialization | A new statement that refines an existing rule. It updates the existing rule; it does not receive a new rule ID. |
| ID policy | The revision package's rule for allocating new IDs and for preserving or splitting existing IDs. |

## 4. Invariants and Mode Contracts

| ID | Invariant |
|---|---|
| I1 | The revision package is data. It is never executed. |
| I2 | The baseline is verified in installed mode before any read is trusted. |
| I3 | Every heading and normative statement in the revision package has at least one disposition. A statement that mixes a process directive and a normative obligation may have two dispositions with distinct clause spans. |
| I4 | Every baseline rule/concept is unchanged, updated with old/new hashes, or retired with document authorization. |
| I5 | A retired ID is recorded in the tombstone ledger and never reused. |
| I6 | Every changed item has an evidence quote at a cited line and old/new hashes. |
| I7 | Retirement, merge, split, rename, and weakening are authorized by the revision package's evidence. An external approval is optional and never blocks the build. |
| I8 | Same baseline plus same revision plan produces byte-identical lock, bundle, coverage, and dist. |
| I9 | Re-applying an already applied revision reports `NO_CHANGES` and does not install. |
| I10 | The installed tree is replaced only after dev and installed verification pass. |
| I11 | The root `PRE-OKF-ORIGINAL.md` pair records the revision package in the v1 contract the canonical verifier reads; the baseline original and its ledger stay under `source/baseline/`. |
| I12 | Check-set v4 is the only pass for update mode; build mode remains check-set v3. |

### 4.1 Build mode contract

| Item | Rule |
|---|---|
| Invocation | `<skill-name> <source-doc>...` |
| Check set | v3, unchanged |
| Inputs | Sources only; no baseline, plan, or revision artifacts are required |
| Outputs | The existing skill layout; no revision artifacts are required |
| Optional | A build may emit `source/build-identity.json` with version, source hashes, and rule/concept counts to speed a later baseline adoption. It is not part of the build acceptance. |
| Primary | Build is the default path. Adding the update subroute must not change build acceptance, outputs, or tests. |

### 4.2 Update mode contract

| Item | Rule |
|---|---|
| Invocation | `update <skill-name> <doc>` or `revision: true` / `update: true` |
| Check set | v4, update-only |
| Inputs | An installed baseline and one update document |
| Outputs | The updated skill plus `source/baseline/`, `source/revision/`, identity, ledger, coherence, and authorization artifacts |
| Non-interactive | The AI authors the plan, verifies, and installs; no human approval gate |
| Isolation | A failed update leaves the installed baseline untouched |

### 4.3 Document roles

| Role | Skill | Meaning | Adapter |
|---|---|---|---|
| `law-revision` | law | Changes rules, sections, API contracts, registry, profiles, conformance, or templates | Law coherence profile |
| `okf-update` | OKF | Updates existing concepts from a reference or instruction | OKF coherence profile |
| `okf-reference` | OKF | Adds or refreshes concepts from reference material; may not change law rules | OKF coherence profile |
| `mixed` | either | Both law and OKF changes | `UPDATE_ROLE_MIXED_UNSUPPORTED` in one invocation; run twice |
| `build-source` | either | A normal build source, not an update | Build mode |
| `unclear` | either | The AI cannot classify with evidence | `REVISION_ROLE_AMBIGUOUS`; no install |

Role detection uses the invocation, the skill type, and the document content. The role is recorded in `source/revision/context.json` and `policy.json`.

A law update with no normative change is `NO_NORMATIVE_CHANGE`; the document is a build source or an OKF reference. An OKF update with reference prose is `okf-reference`, not a law revision.

### 4.4 Prose interpretation

A prose block that does not map directly to an operation receives an `interpretation`:

```json
{
  "line": 42,
  "line_sha256": "<hash>",
  "interpretation": "the replay path must re-authorize the current caller",
  "target": "OPS-06",
  "operation": "update-rule",
  "confidence": "high|medium|low",
  "rationale": "the paragraph states the current caller, not the original executor",
  "disposition": "operation|no-op|process-directive|completion-criterion|non-normative|out-of-scope"
}
```

Rules:

| Condition | Result |
|---|---|
| A non-destructive, low-risk interpretation | Apply it; record confidence and rationale |
| A destructive interpretation without evidence | `INTERPRETATION_UNRESOLVED`; no install |
| A block with no identifiable change | `non-normative` or `out-of-scope` with a reason |
| A document with no identifiable change | `NO_NORMATIVE_CHANGE`; no install |
| Two interpretations conflict | `INTERPRETATION_CONFLICT`; no install |
| A low-confidence interpretation changes a public guarantee | `INTERPRETATION_REQUIRES_EVIDENCE`; no install |

The machine proves that every block has a disposition or interpretation. It does not prove the interpretation's semantic correctness. The interpretation ledger is `source/revision/interpretations.json`.

### 4.5 Coherence profiles

| Profile | Classes |
|---|---|
| Law | `body`, `source`, `registry`, `api`, `profile`, `conformance`, `policy`, `contract`, `test`, `template`, `index`, `asset` |
| OKF | `body`, `source`, `graph`, `index`, `log`, `freshness`, `trust`, `asset` |

The adapter selects the profile. A class that the profile does not include is not required. An OKF reference update does not require law API, registry, conformance, or template classes unless the OKF profile declares them.

## 5. Update Document Contract

### 5.1 Front matter

```yaml
---
update: true                                        # alias: revision: true
schema: revision/v1
skill: rust-interface-law
role: law-revision                                  # optional; inferred when absent
baseline_version: 0.3.2
version: 0.4.0
date: 2026-11-18
baseline_path: .claude/skills/rust-interface-law   # optional; default is SKILL_DIR
language: ja                                        # optional; package language
external_approval: <approval-ref>                   # optional; never blocks the build
stale_after_days: 365                               # optional; default from profile
id_policy: append                                   # optional; append | explicit | preserve
allow_rename_rule: false                            # optional; default false
completion_criterion: <text>                        # optional; mapped to conformance
sources:                                            # optional additional sources
  - docs/revisions/2026-11-18-add-rest-auth.md
---
```

Front matter is optional. A bare document invoked with `update <skill-name> <revision-doc>` uses the inference in §5.8. A self-describing package takes precedence.

Validation:

| Rule | Failure |
|---|---|
| `update` or `revision` is exactly `true` | `REVISION_CONTRACT_INVALID` |
| `role` is a known role or absent | `REVISION_ROLE_INVALID` |
| `schema` is `revision/v1` | `REVISION_CONTRACT_INVALID` |
| `skill` matches the invocation | `REVISION_SKILL_MISMATCH` |
| `version` is valid semver and greater than `baseline_version` | `REVISION_VERSION_INVALID` |
| version bump class matches the change classes | `REVISION_VERSION_CLASS_MISMATCH` |
| `date` is `YYYY-MM-DD` | `REVISION_DATE_INVALID` |
| `stale_after_days` is a positive integer | `REVISION_STALE_INVALID` |
| `baseline_version` equals the installed baseline version | `REVISION_BASELINE_VERSION_MISMATCH` |
| `version` is greater than the installed baseline version | `REVISION_STALE` (see §14.2 for the idempotence order) |
| `sources` are inside the declared source roots | `REVISION_SOURCE_OUTSIDE_ROOT` |
| the package is UTF-8 Markdown, no NUL, no CRLF after normalization | `REVISION_DOCUMENT_INVALID` |
| the package contains no secret | `REVISION_DOCUMENT_SECRET` |
| every plan `statement`, `title`, and `description` is English | `REVISION_STATEMENT_NOT_ENGLISH` |
| the package language is recorded; the original is exempt from the CJK boundary scan | `REVISION_LANGUAGE_INVALID` |
| `id_policy` is `append`, `explicit`, or `preserve` | `REVISION_ID_POLICY_INVALID` |
| `allow_rename_rule` is boolean | `REVISION_CONTRACT_INVALID` |
| `completion_criterion`, when present, maps to a conformance rule or expectation | `COMPLETION_CRITERION_UNMAPPED` |

Version bump classes:

| Highest change class | Required bump |
|---|---|
| `retirement`, `merge`, `split` | major |
| `addition`, `normative` | minor |
| `editorial`, `rendering`, `process`, `no-op` | patch |

### 5.2 Body

```markdown
# Revision 0.4.0

## Summary

One paragraph describing the intent. This paragraph is evidence, not a rule.

## Changes

### C-001 Update REST-01
- op: update-rule
- target: REST-01
- class: normative
- old_sha256: <optional; must match the baseline>
- evidence: "Every REST adapter MUST reject an unknown field." (line 42)
- source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md#http-rules
- weakening: false
- statement: |
    Every REST adapter MUST reject an unknown field with a 400 response.

### C-002 Add REST-34
- op: add-rule
- id: REST-34
- class: R
- parent: REST
- applicability: REST adapters
- verification: V2
- gate: adapter
- evidence: "A REST adapter MUST expose an idempotency key." (line 58)
- source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md#idempotency
- statement: |
    A REST adapter MUST accept and honor an idempotency key on POST.

### C-003 Retire REST-33
- op: retire-rule
- target: REST-33
- replacement: REST-34
- reason: replaced by REST-34
- external_approval: PX-500
- evidence: "REST-33 is superseded." (line 70)

## New Rules

| ID | Class | Applicability | Parent | Source | Statement | Verification | Gate |
|---|---|---|---|---|---|---|---|
| `REST-34` | R | REST adapters | REST | §30.4 | A REST adapter MUST accept and honor an idempotency key on POST. | V2 | adapter |

## New Concepts

### sources/30-rest/1-idempotency
- op: add-concept
- title: Idempotency
- description: A POST honors an idempotency key.
- requires: [sources/30-rest/1-http-rules]
- evidence: "Idempotency applies to every POST." (line 84)

## Assets

### C-004 Add idempotency fixture
- op: add-asset
- path: assets/fixtures/idempotency.json
- type: Reference
- evidence: "Use the supplied fixture." (line 96)
```

The body example is the unredacted user-supplied package. Generated artifacts store only the external approval hash and alias; the plaintext approval ref remains only in `PRE-OKF-ORIGINAL.md`.

### 5.3 Structured and narrative packages

| Package form | Behavior |
|---|---|
| Structured (`- op:` blocks) | The machine parses operations and coverage directly. |
| Narrative (prose only) | The AI authors `source/revision/plan.json`; the machine validates evidence quotes, targets, and coverage. |
| Mixed | The structured blocks are parsed; the narrative remainder must be covered by `no-op` or operation evidence. |

The AI must never template-generate a plan. The machine validates the plan; it does not author it. The machine proves completeness and consistency; the AI remains responsible for semantic interpretation.

Evidence is a reference, not a raw quote: `{line, line_sha256, heading_sha256, paraphrase_en}`. The raw Japanese or English text stays in the exempt original package. The English paraphrase is optional; the line hash is the machine-checkable evidence.

### 5.4 Input contract additions

| Condition | Decision |
|---|---|
| Front matter `update: true` or `revision: true` and a valid `revision/v1` schema | accept as an update package |
| Front matter `update: true` or `revision: true` with a missing or invalid schema | reject `REVISION_CONTRACT_INVALID` |
| `role: law-revision` on an OKF skill, or `role: okf-*` on a law skill | reject `UPDATE_ROLE_MISMATCH` |
| `role: mixed` in a single-skill invocation | reject `UPDATE_ROLE_MIXED_UNSUPPORTED` |
| Law skill with no normative change | `NO_NORMATIVE_CHANGE`; no install |
| Revision package in Japanese, English, or mixed language | accept; record `language`; the original is exempt from the CJK boundary scan |
| Revision package outside the repository root | reject `REVISION_SOURCE_OUTSIDE_ROOT` |
| Revision package with a secret | reject `REVISION_DOCUMENT_SECRET` |
| Revision package with NUL or a non-Markdown body | reject `REVISION_DOCUMENT_INVALID` |
| Revision package path or alias contains non-ASCII characters | alias it to `sources/REVISION-<date>.md`; record the original only in the alias map |
| Revision plan statement, title, or description with CJK | reject `REVISION_STATEMENT_NOT_ENGLISH` |
| Revision package with more than one skill in the invocation | reject `REVISION_MULTI_SKILL_UNSUPPORTED` |
| Revision package with `baseline_version` different from the installed version | reject `REVISION_BASELINE_VERSION_MISMATCH` |
| Revision package with `version` less than or equal to the installed version | reject `REVISION_STALE` |
| Build-mode source without `update: true` / `revision: true` and without the `update` token | unchanged build behavior |

The revision package front matter is stripped before section extraction. It remains part of the document hash and the `PRE-OKF-ORIGINAL.md` component.

The generated skill tree contains English statements and a line-hash map. It does not contain the raw revision text except in `PRE-OKF-ORIGINAL.md`. This keeps the law English while accepting a Japanese revision package.

### 5.5 Control sections

`## Summary`, `## Changes`, `## New Rules`, `## New Concepts`, and `## Assets` are control sections. They describe the update; they are not delivered as normative Section or concept content. The normative content is carried by the `statement`/`body` fields of the operations and the `## New Rules`/`## New Concepts` entries.

Source coverage maps every control heading and line to a `non-normative` disposition with a specific reason. Control lines are never delivered to the consumer and never become rule or concept bodies. This is a build artifact rule, not a law procedure.

### 5.6 Process directives and completion criteria

A revision package can contain instructions about how to revise, not only law content. Examples: "do not reassign existing IDs", "generate index ranges from the registry", "a new ID only for an independent obligation", "two conforming implementations must agree".

These are `process-directive` entries in `source/revision/policy.json`. They are never emitted as law rules. The machine uses them to validate the plan:

| Directive | Effect |
|---|---|
| ID preservation | Reject `rename-rule` unless the ID is invalid or collides. |
| New-ID independence | Require `id_rationale`; reject `add-rule` with `specialization_of`. |
| Generated index | Mark the index as generated; never accept a hand-edited index operation. |
| Artifact coherence | Require every referenced artifact class to have an operation or an unchanged reason. |
| Completion criterion | Map to a conformance rule or expectation; record it; do not execute two implementations. |

A `process-directive` that is also a normative obligation for implementers is added as a rule with evidence. The AI declares which it is; the machine checks that a process directive does not appear in the law bundle.

`source/revision/policy.json`:

```json
{
  "schema": "revision-policy/v1",
  "id_policy": "preserve",
  "allow_rename_rule": false,
  "directives": [
    {
      "id": "P-001",
      "directive": "do not reassign existing IDs",
      "evidence": { "line": 120, "line_sha256": "<hash>" }
    }
  ],
  "completion_criterion": {
    "text": "two conforming implementations agree on authorization, retry, commit, and client compatibility for the same input and declared profile",
    "conformance_target": "CONF-99",
    "evidence": { "line": 240, "line_sha256": "<hash>" }
  }
}
```

### 5.7 Control input and delivered source view

An update document can be a control input or a delivered reference source.

| Role | Treatment |
|---|---|
| `revision` | Control input. The delivered source view carries a pointer to the exempt original (law) or the English effective view (OKF); the raw text is never delivered. Covered by `document.map.json` and `revision/coverage.json`. Raw text only in `PRE-OKF-ORIGINAL.md`. |
| `reference` | Delivered source. Included in the source view when English. When non-English, the concepts are English and the source view includes the English concept view or excludes the raw text; the raw text stays in the exempt original. |
| `build-source` | Normal build source. Included per the build rules. |

| Artifact | Treatment |
|---|---|
| `source/manifest.toml` | Records the document with its role and original hash. |
| `source/input-ledger.json` | Records the document as `included` with its role. |
| `source/source-view.md`, `source/source.baseline.md` | Includes `reference` and `build-source`; for `revision`, includes the English effective view or a pointer, never raw non-English text. |
| `source/revision/document.map.json` | Carries the language, original hash, line count, heading hashes, and per-line hashes; no raw non-English text. |
| `source/revision/coverage.json` | Covers every control heading, statement, code block, and line for `revision`; reference coverage is in `source/coverage.json`. |
| `PRE-OKF-ORIGINAL.md` | Carries the raw document; exempt from the CJK and generic-boundary scans. |

A rule whose effective source is a `revision` document cites the document alias and line hash in `sources[]`. It does not require a Section concept, and the bundle never contains the raw control text. The generator filters `role = revision` out of the delivered source view.

The plan, ledger, coherence matrix, policy, artifact map, and authorization records are build-time audit artifacts outside `okf/`. They are not law procedures and are never delivered as rule text.

The plan, ledger, coherence matrix, policy, artifact map, and authorization records are build-time audit artifacts outside `okf/`. They are not law procedures and are never delivered as rule text.

### 5.8 Bare narrative packages

A user may supply a plain instruction document with no front matter. This is a first-class input.

Invocation:

```bash
/build-law-skill update rust-interface-law docs/revisions/2026-11-18.md
/build-okf-skill update natenv-okf docs/revisions/2026-11-18.md
```

`update` is a positional mode token, not a flag. The build grammar is unchanged.

Inference when front matter is absent:

| Field | Source |
|---|---|
| `skill` | The invocation's skill name. |
| `role` | Law skill: `law-revision` when normative content is present, otherwise `NO_NORMATIVE_CHANGE`. OKF skill: `okf-reference` by default, `okf-update` when existing concepts are explicitly updated. |
| `baseline_path` | `SKILL_DIR`. |
| `baseline_version` | The installed skill version. |
| `language` | Detected from the package. |
| `id_policy` | `append`. |
| `allow_rename_rule` | `false`. |
| `version` | The adapter's version policy. Law: patch for editorial/rendering/process, minor for addition/normative, major for retirement/merge/split. OKF: patch for editorial/reference, minor for addition/update/retire/rename. |
| `date` | An ISO date in the document's first heading or filename, the active ticket's date, or `SOURCE_DATE_EPOCH`. None -> `REVISION_DATE_REQUIRED`. |
| `external_approval` | Optional. |

A bare package may declare `version:` or `date:` in its first heading block; an explicit value overrides inference. The command writes `source/revision/context.json`:

```json
{
  "schema": "revision-context/v1",
  "skill": "rust-interface-law",
  "role": "law-revision",
  "baseline_path": ".claude/skills/rust-interface-law",
  "baseline_version": "0.3.2",
  "version": "0.4.0",
  "date": "2026-11-18",
  "language": "ja",
  "id_policy": "append",
  "allow_rename_rule": false,
  "inferences": [
    { "field": "version", "source": "change-class", "value": "0.4.0" },
    { "field": "date", "source": "active-ticket", "value": "2026-11-18" }
  ]
}
```

The AI authors the plan; the machine validates the inference. The user does not add front matter.

A self-describing package with `update: true` or `revision: true` remains supported and takes precedence over inference.

A plain reference article supplied to an OKF skill is a normal `okf-reference` update: the AI extracts or refreshes concepts and records the source. A plain prose document supplied to a law skill with no normative content is `NO_NORMATIVE_CHANGE`; no install. A law skill that needs an informational source should use build mode, not update mode.

## 6. Update Plan Schema

```json
{
  "schema": "revision-plan/v1",
  "skill": "rust-interface-law",
  "role": "law-revision",
  "adapter": "law",
  "baseline": {
    "path": ".claude/skills/rust-interface-law",
    "version": "0.3.2",
    "digest": "<sha256>"
  },
  "revision": {
    "document": "docs/revisions/2026-11-18-revision.md",
    "sha256": "<sha256>",
    "language": "ja",
    "version": "0.4.0",
    "date": "2026-11-18"
  },
  "policy": {
    "id_policy": "append",
    "allow_rename_rule": false,
    "completion_criterion": "<text>"
  },
  "operations": [],
  "interpretations": [],
  "coverage": [],
  "coherence": [],
  "authorizations": []
}
```

`coverage`, `coherence`, `interpretations`, and `authorizations` are machine-derived claims. The AI may include them; the machine recomputes and rejects a mismatch. `source/revision/document.map.json` records the original hash, language, line count, heading hashes, and per-line hashes; it contains no raw non-English text. `source/revision/plan.sha256.json` records the plan hash, bytes, and line count. `ledger_sha256` is computed over the canonical ledger serialization excluding the `ledger_sha256` field itself.

The plan is part of the reproducible input. `identical (baseline, plan) -> identical output` is the determinism invariant. A narrative document alone is not sufficient for byte-identical output unless it provides stable change IDs and rule IDs or the plan is reused.

### 6.1 Operation types

| `op` | Required fields | Meaning |
|---|---|---|
| `update-rule` | `target`, `statement`, `evidence`, `source`, `class`, `weakening`, `specialization_of` (optional) | Replace or refine a rule statement; a specialization uses the existing ID. |
| `add-rule` | `id`, `class`, `parent`, `applicability`, `statement`, `verification`, `gate`, `evidence`, `source`, `id_rationale` | Add an independent rule. |
| `retire-rule` | `target`, `reason`, `evidence`, `authorization` | Remove a rule; tombstone the ID. |
| `merge-rules` | `targets[]`, `kept_id`, `kept_class`, `reason`, `evidence`, `authorization` | Map several rules to one; preserve `kept_id` and its class. |
| `split-rule` | `target`, `kept_id`, `kept_class`, `new_rules[]`, `reason`, `evidence`, `authorization` | Split one rule; preserve `kept_id` for the direct refinement; `new_rules[]` carries `id`, `class`, `parent`, `applicability`, `statement`, `verification`, `gate`. |
| `rename-rule` | `target`, `new_id`, `rename_reason`, `evidence`, `authorization` | Rename only when the ID is invalid or collides. |
| `update-section` | `target`, `body`, `title_en`, `evidence`, `source` | Replace a section body. |
| `add-section` | `id`, `title_en`, `body`, `evidence`, `source` | Add a section concept. |
| `retire-section` | `target`, `reason`, `evidence`, `authorization` | Remove a section concept. |
| `rename-section` | `target`, `new_id`, `reason`, `evidence`, `authorization` | Rename a section concept. |
| `add-concept` | `id`, `title_en`, `description_en`, `body`, `requires[]`, `evidence`, `source` | Add an OKF concept. |
| `update-concept` | `target`, `body`, `requires[]`, `evidence`, `source` | Replace an OKF concept body. |
| `retire-concept` | `target`, `reason`, `evidence`, `authorization` | Remove an OKF concept. |
| `rename-concept` | `target`, `new_id`, `reason`, `evidence`, `authorization` | Rename an OKF concept. |
| `update-registry-row` | `target`, `class`, `parent`, `applicability`, `verification`, `gate`, `evidence` | Update rule metadata. |
| `update-api-contract` | `target`, `signature`, `guarantees`, `evidence`, `source` | Update a shared API contract. |
| `update-profile` | `target`, `profile`, `binding`, `evidence` | Update an applicability or profile declaration. |
| `update-conformance` | `target`, `expectation`, `evidence`, `source` | Update a conformance expectation. |
| `update-implementation-policy` | `target`, `value`, `evidence` | Update a policy TOML. |
| `update-implementation-contract` | `target`, `rule_id`, `template`, `detector`, `test`, `evidence` | Update an implementation contract TOML. |
| `update-implementation-test` | `target`, `driver`, `command`, `evidence` | Update an implementation test TOML. |
| `update-template` | `target`, `body`, `evidence` | Update a template or skeleton. |
| `update-generated-index` | `target`, `generator`, `evidence` | Mark an index or range as generated from the registry. |
| `add-source` | `path`, `source_alias`, `role`, `concept_prefix`, `evidence` | Ingest a new reference source as concepts. |
| `update-source` | `source_alias`, `path`, `evidence` | Re-extract an existing source and update its concepts. |
| `reference-only` | `source_alias`, `path`, `evidence` | Add a reference citation without changing current concepts. |
| `process-directive` | `id`, `directive`, `evidence` | Record a revision-process instruction in `policy.json`. |
| `completion-criterion` | `id`, `criterion_en`, `conformance_target`, `evidence` | Record a law-level completion criterion and its conformance mapping. |
| `add-asset` | `path`, `type`, `evidence`, `governing` | Add an execution asset. |
| `update-asset` | `target`, `path`, `evidence` | Replace an asset. |
| `retire-asset` | `target`, `reason`, `evidence`, `authorization` | Remove an asset. |
| `no-op` | `target`, `reason`, `evidence` | The revision restates an existing obligation. |

Destination classes are not limited to this table. A document may declare a new artifact class in `## Targets`; the machine validates that the class is declared, has a canonical path and hash, and appears in the coherence matrix.

### 6.2 Validation rules

| Rule | Failure |
|---|---|
| Section and concept IDs are ASCII path slugs | `CONCEPT_ID_INVALID` |
| Role matches the skill type and the plan adapter | `UPDATE_ROLE_MISMATCH` |
| Every prose block has a disposition or an interpretation | `INTERPRETATION_MISSING` |
| Interpretations do not conflict | `INTERPRETATION_CONFLICT` |
| A destructive interpretation has evidence | `INTERPRETATION_UNRESOLVED` |
| A low-confidence interpretation that changes a public guarantee has evidence | `INTERPRETATION_REQUIRES_EVIDENCE` |
| `add-source` and `update-source` paths are inside the declared roots | `REVISION_SOURCE_OUTSIDE_ROOT` |
| `reference-only` does not change a current concept body | `REFERENCE_ONLY_CONFLICT` |
| Target exists in the baseline for update/retire/rename | `REVISION_TARGET_MISSING` |
| Target does not exist for add | `REVISION_TARGET_EXISTS` |
| Rule ID grammar `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$` | `RULE_ID_INVALID` |
| New ID is not in the baseline or tombstones | `RULE_ID_REUSED` |
| Update does not change the rule ID | `RULE_ID_CHANGED` |
| `add-rule` carries an `id_rationale` proving independence | `ID_RATIONALE_MISSING` |
| `add-rule` is not a specialization of an existing rule | `REVISION_SPECIALIZATION_NEEDS_UPDATE` |
| `rename-rule` is allowed by `id_policy` and the ID is invalid or collides | `RULE_RENAME_PROHIBITED` |
| `split-rule` preserves the original `kept_id` by default and assigns unique `new_rules[].id` | `SPLIT_MAPPING_INVALID` |
| A different `kept_id` has a `kept_reason` naming the direct refinement | `SPLIT_MAPPING_INVALID` |
| `split-rule` and `merge-rules` declare the class for every resulting rule | `SPLIT_MAPPING_INVALID` / `MERGE_MAPPING_INVALID` |
| `merge-rules` preserves `kept_id` and records every merged ID | `MERGE_MAPPING_INVALID` |
| Evidence line hash occurs at the cited line | `REVISION_EVIDENCE_MISMATCH` |
| Every operation has an evidence reference | `REVISION_EVIDENCE_MISSING` |
| Every operation has a source inside a declared root | `REVISION_SOURCE_MISSING` / `REVISION_SOURCE_OUTSIDE_ROOT` |
| New statement is not a normalized duplicate of an existing obligation | `OBLIGATION_DUPLICATE` |
| Destructive or weakening operation has document evidence; an external approval is optional | `AUTHORIZATION_MISSING` / `WEAKENING_UNAUTHORIZED` |
| A `process-directive` does not appear as a law rule | `PROCESS_DIRECTIVE_AS_RULE` |
| A `completion-criterion` maps to a conformance rule or expectation | `COMPLETION_CRITERION_UNMAPPED` |
| A changed rule records every referenced artifact class | `REVISION_COHERENCE_GAP` |
| A generated index is not hand-edited | `GENERATED_INDEX_EDITED` |
| Operations do not contradict each other on one target | `REVISION_OPERATION_CONFLICT` |
| A `## New Rules` row agrees with its `add-rule` operation on ID, class, and statement | `REVISION_OPERATION_CONFLICT` |
| A `## New Concepts` block agrees with its `add-concept` operation on ID, title, and body | `REVISION_OPERATION_CONFLICT` |
| Operations are sorted by target identity and `op` | `REVISION_PLAN_UNSORTED` |
| Plan hash matches the serialized plan | `REVISION_PLAN_DRIFT` |

### 6.3 Coherence matrix

A law rule change is incomplete if it changes the statement but leaves a referenced artifact class stale. The plan's `coherence` array declares, per changed rule, the operation or explicit unchanged reason for every class the baseline rule references. The classes below are the **law coherence profile**. The OKF profile uses `body`, `source`, `graph`, `index`, `log`, `freshness`, `trust`, and `asset`; it does not require law API, registry, conformance, or template classes.

| Class | Baseline reference | Required disposition |
|---|---|---|
| `body` | Rule concept body | `update-rule` or `rendering` |
| `source` | Source section or span | `update-section` or unchanged reason |
| `registry` | Rule class, parent, applicability, verification, gate | `update-registry-row` or unchanged reason |
| `api` | Shared API signature or type named by the rule | `update-api-contract` or unchanged reason |
| `profile` | Applicability declaration or profile binding | `update-profile` or unchanged reason |
| `conformance` | `CONF-*` rule or expected result | `update-conformance` or unchanged reason |
| `policy` | Implementation policy TOML | `update-implementation-policy` or unchanged reason |
| `contract` | Implementation contract TOML | `update-implementation-contract` or unchanged reason |
| `test` | Implementation test TOML | `update-implementation-test` or unchanged reason |
| `template` | Template or skeleton | `update-template` or unchanged reason |
| `index` | Generated index or range | `update-generated-index` or unchanged reason |
| `asset` | Fixture, schema, script | `add/update/retire-asset` or unchanged reason |

The machine derives the required classes from the baseline rule concept frontmatter (`x-verification`, `x-enforcement`, `x-applies-to`), the registry row, the implementation contract TOMLs, and any named API/type. A missing class is `REVISION_COHERENCE_GAP`. An unchanged reason must name the evidence and why the class is unaffected.

A template or implementation contract is updated only when the rule's observable guarantees require it. An unchanged reason may cite the law's implementation-discretion clause; the revision must not turn an internal choice into a normative requirement merely to satisfy the coherence matrix.

A class value may be one disposition or an array of dispositions. The machine requires a disposition for every referenced artifact, not merely one per class. A rule that names two APIs, a profile, and two conformance expectations needs four dispositions.

This is the mechanism that lets a revision say "align the body, shared API, registry, profile, and conformance expectation in the same change" without hardcoding any one document's wording.

`source/revision/coherence.json`:

```json
{
  "schema": "revision-coherence/v1",
  "rules": {
    "OPS-02": {
      "body": { "op": "C-001" },
      "registry": { "op": "C-002" },
      "api": { "op": "C-003" },
      "profile": { "op": "C-004" },
      "conformance": { "op": "C-005" },
      "template": { "unchanged": "the template is interface-neutral", "evidence": { "line": 42, "line_sha256": "<hash>" } }
    }
  },
  "gaps": []
}
```

## 7. Baseline Model

### 7.1 Law baseline artifacts

| Artifact | Use |
|---|---|
| `source/rule-concepts.json` | Rule ID to concept ID, source alias, span, phase, requires. |
| `atoms.lock.json` | Rule statement hashes, body hashes, and spans. |
| `source/manifest.toml` | Baseline source aliases and hashes. |
| `source/coverage-v3.json` | Baseline heading and rule-row coverage. |
| `source/baseline/rule-concepts.json` | Copy of the baseline map for the update. |
| `source/baseline/registry.json` | Parsed baseline registry rows: ID, class, applicability, parent, source, statement, verification, gate. |
| `source/baseline/atoms.lock.json` | Copy of the baseline lock, including `statement_sha256` and `content_sha256`. |
| `source/baseline/coverage-v3.json` | Copy of the baseline coverage. |

The baseline universe is the key set of `source/baseline/rule-concepts.json`. `registry.json` supplies the row fields. A package-only rule that is absent from the 8-column table is synthesized from its rule concept frontmatter. Entries in `source/package-aliases.json` are aliases, not separate canonical rules.

### 7.2 OKF baseline artifacts

| Artifact | Use |
|---|---|
| `okf/` | Baseline concept bodies, front matter, links, indexes. |
| `source/concept-inventory.json` | Concept ID to path and source alias. |
| `atoms.lock.json` | Concept body hashes. |
| `source/coverage.json` | Baseline heading, preamble, and line coverage. |
| `source/okf-log.json` | Baseline log entries. |
| `source/baseline/concept-inventory.json` | Copy of the baseline inventory. |
| `source/baseline/atoms.lock.json` | Copy of the baseline lock. |
| `source/baseline/coverage.json` | Copy of the baseline coverage. |
| `source/baseline.json` | Baseline skill identity, version, digest, and origin. |
| `source/revision/` | Document map, plan, policy, coverage, coherence, artifact map, ledger, tombstones, aliases, authorizations, and log. |

### 7.3 Baseline descriptor

`source/baseline.json`:

```json
{
  "schema": "revision-baseline/v1",
  "skill": "rust-interface-law",
  "version": "0.3.2",
  "origin": "installed",
  "digest": "<sha256>",
  "artifacts": {
    "rule_concepts": "source/baseline/rule-concepts.json",
    "registry": "source/baseline/registry.json",
    "lock": "source/baseline/atoms.lock.json",
    "coverage": "source/baseline/coverage-v3.json"
  }
}
```

`digest` is SHA-256 over the sorted `path\0sha256` lines of the baseline artifacts plus the baseline manifest. It identifies the exact state the revision applies to.

Baseline and revision artifacts are generated evidence, not inputs. They are excluded from `source/input-ledger.json` with a `generated` reason and are not added to the manifest.

### 7.4 Baseline verification

Before reading any baseline artifact:

1. Run the canonical verifier in installed mode on `BASELINE_SKILL`.
2. Require `machine_verified`.
3. If the original sources and alias map are available, run the `manifest` check in dev mode against the baseline source root. A hash mismatch is `BASELINE_SOURCE_DRIFT`; the baseline is stale and must be rebuilt before the revision.
4. Recompute `baseline.digest` from the installed skill's actual artifacts. Do not trust the installed `source/baseline.json` as the new baseline; it describes the state that skill was built from.
5. Compare the installed version with the revision package's `baseline_version`. A mismatch is `REVISION_BASELINE_VERSION_MISMATCH`.
6. Create a fresh `source/baseline.json` for this update with `origin: installed`. Copy the installed artifacts into `source/baseline/`.
7. Copy the installed `source/revision/revision-log.json` entries if present; otherwise start an empty log with `origin: adopted`. This is the first-update migration.

## 8. Identity Model

### 8.1 Law

| Identity | Rule |
|---|---|
| Rule ID | Stable across updates. A new obligation gets a new ID. A retired ID is tombstoned forever. |
| Rule concept ID | `rules/<class-lower>/<rule-id-lower>`. Derived from the ID; never re-derived from source order. |
| Section concept ID | `sources/<document-slug>/<heading-slug>`. A heading rename requires `rename-section`; the old ID is aliased. |
| Statement hash | SHA-256 of the normalized rule statement. Recorded in the lock and used for preservation; it does not change when links or dates are re-rendered. |
| Body hash | SHA-256 of the rendered rule body, including links. Recorded in the lock and the revision ledger; a rendering-only change updates this hash without a normative operation. |
| Source span | The effective source line span. For an updated rule, the span is in the revision package; the baseline span is recorded in the ledger. |

`rename-rule`, `merge-rules`, and `split-rule` rewrite every reference in effective statements, `x-requires`, and section links. The old ID is tombstoned; the new IDs are aliased; the operation requires document authorization. A reference that cannot be rewritten deterministically is `RULE_REFERENCE_UNRESOLVED`.

An `update-rule` that changes the rule class moves the concept path (`rules/<new-class>/<id>.md`) while preserving the rule ID. The old path is aliased; the lock records the move.

### 8.2 OKF

| Identity | Rule |
|---|---|
| Concept ID | Bundle-relative path without `.md`. A heading rename changes the path; it requires `rename-concept` and an alias from the old ID to the new ID. |
| Body hash | SHA-256 of the normalized concept body. |
| Source span | The effective source span. The baseline span is recorded in the ledger. |
| Prerequisite edge | `x-requires` is recomputed from body links plus explicit `requires[]`. A removed edge requires a change record. |

### 8.3 Tombstones and aliases

`source/revision/tombstones.json`:

```json
{
  "schema": "revision-tombstones/v1",
  "rules": [
    { "id": "REST-33", "retired_by": "C-003", "replacement": "REST-34", "authorization_alias": "authorization-001" }
  ],
  "concepts": [
    { "id": "sources/30-rest/1-http-rules", "retired_by": "C-010", "replacement": "sources/30-rest/1-http-contract", "authorization_alias": "authorization-001" }
  ]
}
```

`source/revision/aliases.json`:

```json
{
  "schema": "revision-aliases/v1",
  "rules": { "OLD-ID": "NEW-ID" },
  "concepts": { "old/concept/id": "new/concept/id" }
}
```

A tombstoned ID cannot appear as an add target. An alias target must exist in the new universe. An alias source must not exist in the new universe.

Approval refs are project identifiers. The skill tree stores only `external_approval_sha256` and an opaque alias. The plaintext approval ref lives in `PRE-OKF-ORIGINAL.md` (exempt from the generic-boundary scan) or in an external approval record. A plaintext approval ref in `source/revision/plan.json` or `authorizations.json` is `APPROVAL_LEAK`.

### 8.4 Authorizations

`source/revision/authorizations.json`:

```json
{
  "schema": "revision-authorizations/v1",
  "authorizations": [
    {
      "operation": "C-003",
      "kind": "retirement",
      "target": "REST-33",
      "source": "revision-document",
      "document_sha256": "<document hash>",
      "evidence": { "line": 70, "line_sha256": "<line hash>" },
      "external_approval_sha256": null
    }
  ]
}
```

The revision document is the authorization. The ledger records the document hash and the evidence line. An external approval is optional and never blocks the build. The generated skill tree stores only hashes and aliases, never a plaintext approval or project identifier.

### 8.5 Revision log

`source/revision/revision-log.json`:

```json
{
  "schema": "revision-log/v1",
  "entries": [
    {
      "version": "0.4.0",
      "date": "2026-11-18",
      "baseline_version": "0.3.2",
      "status": "installed",
      "added": 1,
      "updated": 1,
      "retired": 1,
      "rendered": 0,
      "approvals": ["approval-001"]
    }
  ]
}
```

### 8.6 Concept identity

`source/concept-identity.json`:

```json
{
  "schema": "okf-concept-identity/v1",
  "concepts": {
    "sources/30-rest/1-http-rules": {
      "path": "sources/30-rest/1-http-rules.md",
      "status": "unchanged|updated|retired|renamed|added",
      "old_body_sha256": "<hash>",
      "new_body_sha256": "<hash>",
      "operation": "C-010"
    }
  }
}
```

## 9. Law Update Pipeline

### 9.1 Step L0: Mode detection

1. A first positional token `update` -> update mode.
2. Otherwise read the first source and parse YAML front matter.
3. `update: true` or `revision: true` -> update mode.
4. No `update` token and neither key -> build mode, unchanged.
5. Update mode with more than one skill -> `REVISION_MULTI_SKILL_UNSUPPORTED`.
6. In update mode, absent front matter uses the inference in §5.8; present front matter takes precedence.
7. Classify the role. A law skill with normative content -> `law-revision`. A law skill with no normative content -> `NO_NORMATIVE_CHANGE`; no install. An OKF skill with reference material -> `okf-reference`. An OKF skill with explicit concept updates -> `okf-update`. A mixed role -> `UPDATE_ROLE_MIXED_UNSUPPORTED`.
8. Role and inference are recorded in `source/revision/context.json`; a self-describing role takes precedence.

### 9.2 Step L1: Baseline

1. Resolve `BASELINE_SKILL` from `baseline_path` or `SKILL_DIR`.
2. `BASELINE_SKILL` absent -> `REVISION_BASELINE_MISSING`.
3. Verify installed mode; any failure -> `REVISION_BASELINE_INVALID`.
4. Load and copy the baseline artifacts into `$STAGING_DIR/source/baseline/`.
5. Compute `baseline.digest`.
6. Write `$STAGING_DIR/source/baseline.json`.

### 9.3 Step L2: Measure the revision package

1. Read bytes; reject NUL, non-Markdown, binary.
2. Normalize LF; record the language; reject secrets.
3. Measure lines, headings, fenced blocks, and normative statements on the original.
4. Write `$STAGING_DIR/source/revision/document.map.json` with the original hash, language, line count, heading hashes, and per-line hashes. English heading labels are authored in the plan; no raw non-English heading text enters the skill tree.
5. Record the original hash in `source/pre-okf-original.json`; the manifest and `source-view.md` hashes use the original source, as in the current build.
6. The AI authors the plan from the original package but writes English statements, titles, descriptions, and optional English paraphrases. The line hash is the evidence; the raw quote stays in the exempt original.

### 9.4 Step L3: Plan

1. If the package is structured, parse `- op:` blocks into operations. Structured operation blocks must carry stable `change-id`s.
2. If the package is narrative or plain prose, the AI authors `$STAGING_DIR/source/revision/plan.json` from the original package. The plan carries English normative statements and line-hash evidence.
3. For prose blocks that do not map directly to an operation, author an `interpretation` with target, operation, confidence, rationale, and evidence. Write `source/revision/interpretations.json`.
4. A non-destructive low-risk interpretation is applied. A destructive interpretation without evidence is `INTERPRETATION_UNRESOLVED`. A law document with no identifiable normative change is `NO_NORMATIVE_CHANGE`.
5. Extract process directives into `source/revision/policy.json`; do not turn them into law rules.
6. Extract completion criteria and map each to a conformance rule or expectation.
7. Run `revision/validate-plan.mjs` with the plan, baseline, document map, policy, and source roots.
8. Any validation failure -> stop before generation.

### 9.5 Step L4: Revision coverage

1. Inventory every H2/H3 under `## Changes`, every normative paragraph, list item, table row, and non-empty code block.
2. Require every item to map to an operation, an `interpretation`, a `no-op`, a `process-directive`, or a `completion-criterion`. A paragraph that mixes a process directive and a normative obligation may have two dispositions with distinct clause spans; the union must cover the paragraph.
3. Treat code blocks as normative unless the package explicitly marks them `non-normative` with a reason. A signature block is normative; an illustrative example is not.
4. For every baseline section removed from the current bundle, record a `superseded` disposition that references the revision operation and the replacement concept.
5. For every baseline rule retired or merged, record the tombstone reference.
6. Build the coherence matrix from the baseline rule references and require a disposition per class.
7. Write `$STAGING_DIR/source/revision/coverage.json`:

```json
{
  "schema": "revision-coverage/v1",
  "document": "sources/REVISION-2026-11-18.md",
  "items": [
    {
      "kind": "heading|paragraph|list-item|table-row|code-block|line",
      "line": 42,
      "line_sha256": "<hash>",
      "dispositions": [
        { "kind": "operation|interpretation|no-op|process-directive|completion-criterion|non-normative|out-of-scope", "ref": "C-001" }
      ]
    }
  ],
  "counts": { "items": 120, "unmapped": 0, "unaccountedBaseline": 0, "coherenceGaps": 0, "interpretations": 4 }
}
```

8. A zero count over prose -> `REVISION_COVERAGE_GAP`.

### 9.6 Step L5: Effective registry

1. Load the baseline universe from the keys of `source/baseline/rule-concepts.json`. Load the row fields from `source/baseline/registry.json`; synthesize a row from the rule concept frontmatter when the table has no row. Aliases in `source/package-aliases.json` do not add canonical rules.
2. Apply operations in sorted order:
   - `update-rule`: replace statement, class, parent, applicability, verification, gate, source.
   - `update-registry-row`: replace metadata without changing the statement.
   - `retire-rule`: remove; add to tombstones.
   - `add-rule`: append with the declared ID and record `id_rationale`.
   - `merge-rules`: remove targets; keep `kept_id` and `kept_class`; alias the merged IDs.
   - `split-rule`: keep `kept_id` and `kept_class` for the direct refinement; add `new_rules[]` with their classes; tombstone/alias the removed part.
   - `rename-rule`: allowed only by `id_policy`; add an alias; tombstone the old ID.
3. Validate bijection: effective registry rows equal effective rule IDs; `kept_id` and `new_ids` are disjoint; every merged/split ID is accounted for.
4. Apply artifact-class operations (`update-api-contract`, `update-profile`, `update-conformance`, `update-implementation-*`, `update-template`, `update-generated-index`) to their canonical artifacts.
5. Write `$STAGING_DIR/source/revision/effective-registry.md` in the 8-column registry format and `$STAGING_DIR/source/revision/artifact-map.json` with the changed artifact paths and hashes.

### 9.7 Step L6: Effective documents and sections

1. Baseline source aliases from the baseline manifest.
2. Add the revision package alias `sources/REVISION-<date>.md`.
3. Add any `sources` from the front matter.
4. For `update-section` and `rename-section`, the revision section replaces the baseline section in the effective bundle. The baseline section is retired or aliased.
5. For rules, the effective source span is the revision package span for updated rules; the baseline span is recorded in the ledger.
6. Map the revision package's control headings and lines to `non-normative` dispositions with a reason. They are counted in source coverage but never become Section concepts or delivered text.
7. A revision package whose normative content is entirely in operation `statement`/`body` fields may contribute no Section concepts; the rule concepts carry the text.
8. Write `$STAGING_DIR/source/revision/effective-sources.json`.

### 9.8 Step L7: Identity

1. Map each baseline rule ID to its baseline concept ID.
2. Preserve the concept ID for updates and no-ops.
3. Derive the concept ID from the class and ID for adds. Record the `id_rationale` that proves the obligation is independent. Reject an add with `specialization_of`.
4. Apply merge/split/rename mappings. `merge-rules` and `split-rule` keep `kept_id` for the direct refinement; all other IDs are aliases or tombstones.
5. Record `statement_sha256` and `content_sha256` for every effective rule:
   - unchanged statement -> `statement_sha256` equals the baseline; a changed body is `rendering`.
   - changed statement -> `statement_sha256` differs; the ledger requires the operation and old/new hashes.
6. Validate: no duplicate concept IDs; every alias target exists; every tombstone is absent from the new universe.
7. Write `$STAGING_DIR/source/rule-identity.json`:

```json
{
  "schema": "law-rule-identity/v1",
  "rules": {
    "REST-01": {
      "concept_id": "rules/r/rest-01",
      "statement_sha256": "<hash>",
      "content_sha256": "<hash>",
      "status": "unchanged|updated|retired|merged|split|added",
      "operation": "C-001"
    }
  }
}
```

### 9.9 Step L8: Generate

1. Call `generateLawBundleRevision({ baseline, effectiveRegistry, documents, plan, outDir, sourceDir, date, version })`.
2. The generator uses the effective registry as the authority; it does not allocate IDs from source order.
3. The generator writes:
   - `okf/rules/<class>/<id>.md`
   - `okf/sources/<doc>/<section>.md` for current sections only
   - `okf/index.md`, `okf/log.md`
   - `atoms.lock.json`
   - `source/rule-concepts.json`
   - `source/coverage-v3.json`
   - `source/delivery.json`
   - `source/normative-inventory.json`
   - `source/source-view.md`, `source/source.baseline.md`
   - `source/law-bundle.json`
   - `source/revision/artifact-map.json` for API, profile, conformance, policy, contract, test, template, and index artifacts
4. The generator regenerates indexes and ranges from the registry. It never accepts a hand-edited index.
5. Superseded baseline sections are absent from the bundle; the source view keeps them for audit.
6. The rule body cites the effective source. The ledger records the baseline span.

### 9.10 Step L9: Revision ledger

1. For every baseline rule:
   - unchanged -> `{status: "unchanged", statement_sha256, body_sha256}`.
   - rendering-only -> `{status: "rendering", statement_sha256, old_body_sha256, new_body_sha256}`.
   - updated -> `{status: "updated", old_statement_sha256, new_statement_sha256, old_body_sha256, new_body_sha256, op, evidence}`.
   - retired -> `{status: "retired", old_statement_sha256, old_body_sha256, op, authorization}`.
   - merged/split -> `{status: "merged|split", old_statement_sha256, targets[], op, authorization}`.
2. For every new rule -> `{status: "added", new_statement_sha256, new_body_sha256, op, evidence}`.
3. For every section/concept -> the same shape, with `body_sha256` and `superseded` where applicable.
4. Record the baseline digest, revision digest, effective source-set digest, plan hash, version, date.
5. Unchanged items may be summarized by count and digest; changed, retired, superseded, merged, split, and added items are listed explicitly. The verifier expands the baseline universe and checks that every item is accounted for.
6. Write `$STAGING_DIR/source/revision/ledger.json` with a `ledger_sha256` over the canonical serialization.
7. Write `$STAGING_DIR/source/revision/authorizations.json`, `coherence.json`, `artifact-map.json`, and `policy.json`.
8. Write `$STAGING_DIR/source/revision/revision-log.json` with the counts and authorization aliases.

### 9.11 Step L10: Pre-OKF original and baseline preservation

The root pair is the update input in the v1 shape the canonical verifier reads:

```text
PRE-OKF-ORIGINAL.md        # raw revision package (exempt from boundary and CJK scans)
source/pre-okf-original.json
{
  "schema": "pre-okf-original/v1",
  "source": "sources/REVISION-2026-11-18.md",
  "sha256": "<revision hash>",
  "bytes": 8400
}
```

The baseline original and its ledger are copied beside the baseline ledgers:

```text
source/baseline/PRE-OKF-ORIGINAL.md
source/baseline/pre-okf-original.json
source/baseline/rule-concepts.json
source/baseline/registry.json
source/baseline/atoms.lock.json
```

This keeps both inputs auditable without changing the v3 verifier's v1 contract. A v2 combined ledger at the root would fail `checkManifest`; it is therefore not written.

The unredacted revision text lives only in the root `PRE-OKF-ORIGINAL.md`. `source/revision/document.map.json` carries the language, original hash, line count, and per-line hashes; it contains no raw non-English text. The delivered `source/source-view.md` and `source/source.baseline.md` contain the English effective view: the raw document when it is English, otherwise the plan's English bodies plus a pointer to the raw original. They never contain raw non-English text.

### 9.12 Step L11: Version and freshness

1. `spec_version` = revision `version`.
2. `package.json` version = revision `version`.
3. `DESIGN.md` version line updated.
4. `okf-log.json` appends `{date, text: "Revision <version>: added A, changed C, retired R."}`.
5. `okf/log.md` regenerated newest first.
6. `generated.at` and `verified.at` = revision `date`.
7. `stale_after` = `date + stale_after_days` for law concepts when the profile enables it.
8. No clock read. A missing date -> `REVISION_DATE_INVALID`.

### 9.13 Step L12: Verify

Dev mode:

```bash
node "$CLAUDE_DIR/scripts/amend-rfc-up/verify-law-skill.mjs" \
  --skill "$STAGING_DIR" \
  --root "$REPO_ROOT" --mode dev \
  --source-root "$REPO_ROOT" \
  --path-alias "$ALIAS_PATH" \
  --baseline "$BASELINE_SKILL" \
  --kind update \
  --check-set 4 \
  --out "$LAW_OUT/<name>-dev-verification.json"
```

Installed mode: install to a temporary target, then verify with `--mode installed --kind update --baseline "$BASELINE_SKILL" --check-set 4`. The installed tree also carries `source/baseline/`, so the verifier can read the baseline without the flag; the flag is retained for explicit provenance.

Require all v4 required checks `machine_verified`, including revision checks.

### 9.14 Step L13: Install

Unchanged from the current command:

1. Back up the existing `SKILL_DIR` under `LAW_OUT/backup/<name>-<timestamp>`.
2. Atomic replace with the staging tree.
3. Post-check fails -> restore the backup; `REVISION_INSTALL_BLOCKED`.
4. Copy the alias map outside the skill tree.

### 9.15 Step L14: Integration and acceptance

1. Re-run integration write/check if the applicability instruction or version changed.
2. Acceptance mutations (see §17).
3. Report baseline version, new version, added/changed/retired counts, coverage, coherence gaps, authorizations, closures, installed SHA, install path.

## 10. OKF Update Pipeline

The OKF pipeline treats the input as an **update document**, not a law revision. `revision` in artifact names is the internal schema prefix. An `okf-reference` update adds or refreshes knowledge concepts and does not use law rule semantics.

### 10.1 Step O0: Mode detection

Same as L0: a positional `update` token or `update: true` / `revision: true` front matter enters update mode; absent front matter uses the inference in §5.8. For an OKF skill, the default role is `okf-reference`; an explicit concept update role is `okf-update`. A law-only role on an OKF skill is `UPDATE_ROLE_MISMATCH`.

### 10.2 Step O1: Baseline

1. Resolve and verify the baseline skill in installed mode.
2. Copy `source/concept-inventory.json`, `atoms.lock.json`, `source/coverage.json`, and `source/okf-log.json` into `source/baseline/`.
3. Compute the baseline digest.
4. Write `source/baseline.json`.

### 10.3 Step O2: Measure

Same input contract as the law package, plus:
- Claim-bearing blocks: paragraphs, lists, code blocks, tables.
- No claim-bearing block -> `INFORMATION_ZERO`.
- Duplicate source basename -> `SOURCE_ALIAS_DUPLICATE`.

### 10.4 Step O3: Plan

Operations are concept- and source-oriented: `add-source`, `update-source`, `reference-only`, `add-concept`, `update-concept`, `retire-concept`, `rename-concept`, `update-section`, `update-profile`, `update-conformance`, `update-generated-index`, `add-asset`, `update-asset`, `retire-asset`, `no-op`.

A plain reference article is a normal `okf-reference` update. The AI extracts or refreshes concepts from it; no law rule or law coherence class is required.

Validation:
- The role is `okf-reference` or `okf-update`; a law-only role is `UPDATE_ROLE_MISMATCH`.
- Concept IDs are bundle-relative paths without `.md`.
- A rename requires an alias; the old ID is tombstoned.
- `requires[]` targets exist in the effective universe.
- Every concept has `type`, `title`, `description`, `sources`.
- Every non-preamble concept has `x-requires`.
- No `x-requires` cycle.
- Every asset operation has a governing concept.
- A changed concept records its referenced graph, index, log, freshness, trust, and asset classes in the **OKF coherence profile**. Law API/registry/conformance/template classes are not required.
- `reference-only` does not change a current concept body.

### 10.5 Step O4: Coverage

Inventory every heading, preamble block, non-empty code block, and non-blank line in the update document. Require a disposition:
- an operation,
- an `interpretation`,
- a `no-op`,
- a `process-directive`,
- a `completion-criterion`,
- a `non-normative` declaration with a reason,
- an `out-of-scope` declaration with a reason,
- or an asset entry.

Zero unmapped headings, preamble, code blocks, and lines. Control sections (`## Summary`, `## Changes`, `## New Rules`, `## New Concepts`, `## Assets`) are mapped as `non-normative` with a reason and are not delivered as concepts. Write `source/revision/coverage.json`.

### 10.6 Step O5: Effective bundle

1. Load the baseline bundle.
2. Apply operations in sorted order:
   - `add-source`: extract concepts from the new source under `concept_prefix`; add them.
   - `update-source`: re-extract the source; map concepts by heading path; update bodies; add new concepts; retire disappeared concepts with authorization.
   - `reference-only`: add the source citation without changing current concept bodies.
   - `update-concept`: replace body and front matter fields; keep the ID.
   - `add-concept`: add a new concept under `okf/pages/<source>/`.
   - `retire-concept`: remove; tombstone.
   - `rename-concept`: move the path; add an alias; tombstone the old ID.
   - `update-section`: replace the section body; keep the ID.
   - `update-profile`, `update-conformance`, `update-generated-index`: update the referenced artifact and record it in `artifact-map.json`.
3. Rewrite internal body links from a renamed concept ID to its new ID. The rename operation records the link rewrites; they are `rendering` changes, not normative changes.
4. Recompute `x-requires` from body links plus explicit `requires[]`.
5. Recompute directory indexes and `okf/index.md`.
6. Recompute `okf/log.md` from `source/okf-log.json`.
7. Write `source/concept-identity.json`, `source/revision/ledger.json`, `source/revision/tombstones.json`, `source/revision/aliases.json`, `source/revision/coherence.json`, `source/revision/artifact-map.json`, `source/revision/policy.json`, and `source/revision/authorizations.json`. The alias map serves external citations; the bundle itself contains only new IDs.
8. The OKF ledger may summarize unchanged concepts by count and digest; changed, retired, renamed, and added concepts are listed explicitly. The verifier expands the baseline inventory and checks every concept is accounted for.

### 10.7 Step O6: Freshness

1. `generated.at` = revision date.
2. `verified.at` = revision date.
3. `status` = `stable` for current concepts; `deprecated` only for explicitly deprecated concepts.
4. `stale_after` = revision date + `stale_after_days`.
5. `okf-log.json` appends a dated entry; `okf/log.md` is newest first.
6. `freshness` reports zero stale current concepts.

### 10.8 Step O7: Assets

1. Run asset discovery over the revision package and its declared assets.
2. Apply add/update/retire asset operations.
3. Re-run measurement, rule/concept linking, and delivery decisions.
4. Update `source/asset-manifest.toml`, `source/asset-inventory.json`, `source/asset-coverage.json`.
5. Render one asset concept per included asset with exact text, `x-asset-sha256`, `x-source-span`, `x-requires`, and `x-enforces` (law) or the governing concept (OKF).
6. Zero assets remains valid with zero-count ledgers.

### 10.9 Step O8: Verify and install

Same as the law pipeline with the OKF verifier:

```bash
node "$CLAUDE_DIR/scripts/amend-rfc-up/verify-okf-skill.mjs" \
  --skill "$STAGING_DIR" \
  --root "$REPO_ROOT" --mode dev \
  --source-root "$REPO_ROOT" \
  --path-alias "$ALIAS_PATH" \
  --baseline "$BASELINE_SKILL" \
  --kind update \
  --check-set 4 \
  --out "$OKF_OUT/<name>-dev-verification.json"
```

Installed mode verifies source/installed SHA parity. Then install atomically with backup and rollback.

## 11. Artifacts

The trees below are **update-mode additions**. Build mode keeps its existing layout; its only optional addition is `source/build-identity.json`.

### 11.1 Law skill additions

```text
source/
├── build-identity.json          # optional, build mode
├── baseline.json                # update mode
├── baseline/
│   ├── rule-concepts.json
│   ├── registry.json
│   ├── atoms.lock.json
│   └── coverage-v3.json
├── revision/
│   ├── context.json
│   ├── document.map.json
│   ├── document.sha256.json
│   ├── plan.json
│   ├── plan.sha256.json
│   ├── interpretations.json
│   ├── policy.json
│   ├── coverage.json
│   ├── coherence.json
│   ├── artifact-map.json
│   ├── ledger.json
│   ├── tombstones.json
│   ├── aliases.json
│   ├── authorizations.json
│   └── revision-log.json
└── rule-identity.json
```

### 11.2 OKF skill additions

```text
source/
├── build-identity.json          # optional, build mode
├── baseline.json                # update mode
├── baseline/
│   ├── concept-inventory.json
│   ├── atoms.lock.json
│   └── coverage.json
├── revision/
│   ├── context.json
│   ├── document.map.json
│   ├── document.sha256.json
│   ├── plan.json
│   ├── plan.sha256.json
│   ├── interpretations.json
│   ├── policy.json
│   ├── coverage.json
│   ├── coherence.json
│   ├── artifact-map.json
│   ├── ledger.json
│   ├── tombstones.json
│   ├── aliases.json
│   ├── authorizations.json
│   └── revision-log.json
└── concept-identity.json
```

## 12. Verifier Check-Set v4 (Update Only)

### 12.1 New shared checks

| Check | Mode | Pass condition |
|---|---|---|
| `revisionContract` | both | Document front matter or inferred context, schema, skill, role, adapter, version, date, language, ID policy, and authorizations are valid. |
| `revisionCoverage` | dev | Zero unmapped headings, prose blocks, statements, code blocks, and lines; zero unaccounted baseline sections; every disposition maps to an applied operation or an interpretation; no interpretation conflict. |
| `revisionPreservation` | both | Every baseline rule/concept is unchanged, rendering-only, updated with old/new hashes, superseded, or retired with document authorization. No ID reuse. |
| `revisionLedger` | both | Ledger schema, baseline/revision digests, operations, hashes, and `ledger_sha256` are consistent. |
| `revisionAuthorization` | both | Every destructive or weakening operation has document evidence; external approval is optional. |
| `revisionCoherence` | both | Every changed rule records every referenced artifact class with an operation or an unchanged reason. |
| `revisionPolicy` | dev | Process directives are recorded in policy and do not appear as law rules; completion criteria map to conformance. |
| `revisionDeterminism` | dev | Re-applying the plan to the baseline in a temporary directory produces byte-identical lock, bundle, coverage, and dist. |
| `revisionIdempotence` | dev | Re-applying an already applied revision reports `NO_CHANGES`; no install. |
| `revisionFreshness` | both | Dates are explicit; `generated.at`/`verified.at` equal the revision date; `stale_after` is valid; no current concept is stale. |
| `revisionAssets` | both | Asset add/update/retire operations are reflected in concepts, ledgers, delivery, and install roots. |

### 12.2 Law-specific changes

| Check | Change |
|---|---|
| `rulePreservation` | Replaced by `revisionPreservation`. The hardcoded 486 count and named IDs are removed. The baseline supplies the prior universe. Aliases are excluded from the canonical count; retired IDs are tombstones. |
| `sourceCoverage` | Includes the revision package headings and rule rows in `coverage-v3.json`. |
| `aliasResolution` | Validates rule aliases and section aliases against the new universe. |
| `bodyFidelity` | Samples are profile-driven from the effective source set; no hardcoded section paths. For revision-sourced rules and sections, compares the body to the plan's English statement/body and the line hash, never to raw non-English text. |
| `manifest` | Validates baseline and revision sources; root `PRE-OKF-ORIGINAL` is v1 (canonical verifier contract) and the baseline original is preserved under `source/baseline/`. |
| `inputLedger` | Includes the revision package and any additional sources; generated baseline/revision artifacts are excluded with a reason. |
| `delivery` | Includes every new rule and section; no omission. The revision package's normative statements are covered by `revisionCoverage`; the baseline package tree remains the `normative-inventory` and `delivery` source. |
| `freshness` | Compares `generated.at`/`verified.at` with the revision date and the source hash; law concepts without `stale_after` are fresh when the statement hash matches the source. |
| `implementation` | The revision's `artifact-map.json` changes are reflected in the implementation policy, contracts, tests, templates, and conformance expectations; the existing `implementation-check` and `gate` still run. |

### 12.3 OKF-specific changes

| Check | Change |
|---|---|
| `freshness` | Uses the revision manifest and `stale_after`; fails `STALE_NODE` on drift. |
| `coverage` | Includes the reference and revision source sections, preamble, and lines. |
| `graph` | Rejects dangling links, orphan indexes, and `x-requires` cycles. |
| `indexlog` | Requires a dated log entry for the update; newest first. |
| `provenance` / `citation` | Reference and revision sources and footnotes resolve. |
| `trust` | `generated.by` and `verified.by` are present. |
| `containment` | Reference and revision sources and assets are inside the declared roots. |
| `profile` / `conformance` | Applied only when the OKF profile declares them; an `okf-reference` update does not require law-style profile or conformance classes. |
| `indexlog` | Generated indexes are regenerated; no hand-edited index is accepted. |
| `version` | The OKF version policy is applied: patch for editorial/reference, minor for addition/update/retire/rename. |
| `source-view` | A `revision` role is excluded; a `reference` role is included when English. |

### 12.4 Check-set version and report

| Item | Value |
|---|---|
| `check_set_version` | Build: `3`. Update: `4`. |
| Verifier kind | The verifier accepts `--kind build` (default) or `--kind update`, or infers update from `source/revision/plan.json`. |
| Layer check | Build: the existing v3 layers; an optional `source/build-identity.json`. Update: adds `source/baseline.json`, `source/baseline/`, and the `source/revision/` artifacts (`context.json`, `document.map.json`, `plan.json`, `interpretations.json`, `policy.json`, `coverage.json`, `coherence.json`, `artifact-map.json`, `ledger.json`, `authorizations.json`). |
| Law required checks | Build: the v3 checks. Update: the v3 checks plus the eleven revision checks. |
| OKF required checks | Build: the current checks. Update: the current checks plus the eleven revision checks. |
| Revision check modes | The revision checks are `mode: update`; they are `not_run` in build mode. |
| Report schema | `law-skill-verification/v2`, `okf-skill-verification/v2`; adds `kind`, `baseline`, `revision`, `ledger_sha256`, `change_counts`, `interpretations`. |
| Check counts | Derived from `checks.json` and the verifier report. The command must not hardcode 36 or 19. |
| Completion | Build: v3 required checks `machine_verified`. Update: v4 required checks `machine_verified`; closure recorded. |

## 13. Command Changes

### 13.1 Shared mode detection

Both commands extend the positional grammar:

```text
<skill-name> <source-doc>...                 # build mode, unchanged
update <skill-name> <revision-doc>           # update mode
```

Both commands add this to Step 1:

1. A first positional token `update` -> update subroute.
2. Otherwise read the first source and parse front matter; `update: true` or `revision: true` -> update subroute.
3. Otherwise -> build mode, unchanged.
4. Update mode is single-skill. More than one skill -> `REVISION_MULTI_SKILL_UNSUPPORTED`.
5. In update mode, absent front matter uses the inference in §5.8.
6. Classify the role and adapter. A law skill with no normative content -> `NO_NORMATIVE_CHANGE`; no install.
7. Build mode does not require a baseline, plan, or revision artifacts. Its inputs, steps, check-set v3, and outputs are unchanged.

`update` is a positional mode token, not a flag. No new flags. The document is the interface. The update subroute is opt-in; build remains the default path.

### 13.2 `/build-law-skill` update subroute

| Step | Action |
|---|---|
| L0 | Mode detection. |
| L1 | Baseline verification and copy. |
| L2 | Revision package measurement. |
| L3 | Plan validation. |
| L4 | Revision coverage. |
| L5 | Effective registry. |
| L6 | Effective documents. |
| L7 | Identity mapping. |
| L8 | Bundle generation. |
| L9 | Revision ledger. |
| L10 | Pre-OKF original v1 plus baseline preservation. |
| L11 | Version and freshness. |
| L12 | Dev and installed verification with `--kind update`, `--baseline`, and `--check-set 4`. |
| L13 | Atomic install with backup and rollback. |
| L14 | Integration, acceptance, report. |

The build steps (`Step 0` through `Step 14`) are unchanged. The L0-L14 steps run only when the update subroute is selected.

### 13.3 `/build-okf-skill` update subroute

| Step | Action |
|---|---|
| O0 | Mode detection. |
| O1 | Baseline verification and copy. |
| O2 | Revision package measurement. |
| O3 | Plan validation. |
| O4 | Revision coverage. |
| O5 | Effective bundle and identity. |
| O6 | Freshness and log. |
| O7 | Asset reconciliation. |
| O8 | Dev and installed verification with `--kind update`, `--baseline`, and `--check-set 4`. |
| O9 | Atomic install with backup and rollback. |
| O10 | Acceptance and report. |

The build steps (`Step 0` through `Step 13`) are unchanged. The O0-O10 steps run only when the update subroute is selected.

### 13.4 Completion conditions

| Condition | Pass |
|---|---|
| Build | Build mode unchanged: v3 required checks `machine_verified`; no revision artifacts required. |
| Update | Update subroute selected; role and adapter recorded. |
| Role | `law-revision` for law; `okf-reference` or `okf-update` for OKF; `mixed` rejected. |
| Baseline | Verified installed mode, digest recorded. |
| Plan | Machine-validated, zero unresolved. |
| Coverage | Zero unmapped update statements, code blocks, and lines; every prose block has a disposition or interpretation. |
| Preservation | Zero silent loss, zero ID reuse; OKF reference updates preserve baseline concepts unless explicitly updated or retired. |
| Authorization | Every destructive/weakening op carries document evidence; external approval is optional. |
| Determinism | Rebuild byte-identical. |
| Idempotence | Re-application reports `NO_CHANGES`. |
| Verification | Check-set v4, all required checks `machine_verified`; counts read from `checks.json`. |
| Install | Source/installed SHA match; backup and rollback proven. |
| Integration | Host lines valid; no drift or stale trigger. |
| Command text | Replace "check set 36" with "check set from `checks.json`"; replace "19/19 installed" with "all installed-required checks". No hardcoded count remains. |

## 14. Determinism, Idempotence, Safety

### 14.1 Determinism

- Sort operations by `(target, op)`.
- Sort effective registry by rule ID.
- Sort effective concepts by concept ID.
- Sort interpretations by line and target.
- Use the update date; never read the clock.
- Serialize JSON with sorted keys and a trailing newline.
- Hash the canonical serialization for `ledger_sha256`.
- The plan is part of the reproducible input: `identical (baseline, plan) -> identical output`.

### 14.2 Idempotence

Version-check order:

1. Installed version equals the revision `version` and every operation is already applied -> `NO_CHANGES`; no install.
2. Installed version is greater than the revision `version` -> `REVISION_STALE`; no install.
3. Installed version equals `baseline_version` and `version` is greater -> apply.
4. Any other combination -> `REVISION_BASELINE_VERSION_MISMATCH`; no install.

Already-applied detection:

- Every operation target already has the declared new hash.
- Every baseline item is accounted for as unchanged, updated, retired, or superseded.
- If all operations are already applied, write `source/revision/revision-log.json` with `status: "no_changes"` and exit 0; do not install.
- If some operations are applied and some are not, `REVISION_PARTIAL_APPLIED`; no install.
- A `no-op` revision reports `NO_CHANGES`.

### 14.3 Safety

- The baseline is copied, never modified.
- Generation writes only under `STAGING_DIR`.
- Verification runs before any install.
- Install backs up and rolls back on failure.
- A failure leaves the installed baseline untouched.
- A per-target lock prevents concurrent updates.
- The revision package cannot write outside the staging/skill roots.

### 14.4 Routine update

The update subroute is designed for daily use:

1. The user supplies one document: `update <skill> <doc>`.
2. The installed skill is verified as the baseline.
3. The AI authors the plan and interpretations; the machine validates coverage, preservation, coherence, authorization, and determinism.
4. Dev and installed v4 verification run.
5. The skill is replaced atomically with a backup; any failure leaves the baseline untouched.
6. No human approval gate and no interactive prompt.

The build path is not affected. A routine update never requires a full rebuild of an unrelated skill and never changes a build-mode skill.

## 15. Security

| Threat | Control |
|---|---|
| Prompt injection in the revision package | The package is data; the plan is machine-validated; the plan cannot invent targets, IDs, paths, or quotes. |
| Path traversal | Sources and assets must resolve inside the declared roots; reject `..`, absolute paths, symlink escapes. |
| Secret leak | Secret scan on the package and assets; reject; never install. |
| Non-English law text | The revision package may be any language; every plan statement, title, and description must be English; the raw package stays only in the exempt original. |
| Binary or NUL | Reject `REVISION_DOCUMENT_INVALID`. |
| Unauthorized weakening | Keyword diff plus declared `weakening: true`; the document evidence is the authorization; an external approval is optional. |
| Ledger tampering | `ledger_sha256` over the canonical serialization; verifier recomputes. |
| Baseline tampering | Baseline digest recomputed from the installed artifacts; mismatch -> `REVISION_BASELINE_INVALID`. |
| Artifact incoherence | The coherence matrix requires every referenced artifact class; a missing class is `REVISION_COHERENCE_GAP`. |
| Hand-edited generated index | The generator regenerates indexes; a hand-edited operation is `GENERATED_INDEX_EDITED`. |
| Process directive emitted as law | `revisionPolicy` rejects a process directive in the bundle; `PROCESS_DIRECTIVE_AS_RULE`. |
| Concurrent agents | Per-target lock; atomic install; backup. |
| Token denial of service | Single skill per update; bounded plan size; performance budget. |

## 16. Migration

### 16.1 Existing skills

Existing skills have no `source/baseline.json` and no revision ledger. Build mode does not create them.

1. The first update verifies the installed skill in installed mode.
2. If `source/build-identity.json` exists, use it; otherwise compute the identity from the installed artifacts.
3. Create `source/baseline.json` with `origin: adopted`.
4. Copy the baseline artifacts.
5. Apply the update to this baseline.
6. Subsequent updates repeat the adoption from the then-installed skill; the revision log chains the history.

### 16.2 Hardcoded rule preservation

1. Generate `source/baseline/rule-concepts.json` and `source/baseline/registry.json` from the installed skill.
2. Add `statement_sha256` to the baseline lock; compute it from each current statement.
3. Replace `checkRulePreservation` with `checkRevisionPreservation`.
4. The baseline contains the prior 486 IDs and statements; the check is now generic.
5. No behavior change for the first update: all prior rules are present.

### 16.3 Check-set version

- v3 reports remain readable.
- Build mode remains v3. It does not require or emit revision artifacts.
- Build mode may emit `source/build-identity.json` with the version, source hashes, and rule/concept counts. It is optional and not part of build acceptance.
- Update mode requires v4. It creates `source/baseline.json` from the installed skill and the `source/revision/` artifacts.
- The revision checks are `mode: update`; they are `not_run` in build mode.
- The command's completion gate reads the mode and `checks.json`; it does not hardcode 36 or 19.

### 16.4 Version bump

- The first update bumps the skill version and `spec_version`.
- `source/baseline.json` records the baseline version.
- `okf-log.json` records the revision.
- A version bump of the repository that clobbers `.claude` must be followed by re-verification; the installed digest is recorded in `source/baseline.json` and the verifier detects a rollback.

## 17. Test Matrix (TDD Red Set)

### 17.1 Shared revision core

| Test file | Red assertions |
|---|---|
| `tests/amend-rfc-up/revision/contract.test.mjs` | A bare document with `update` infers context; a self-describing package with `update: true` or `revision: true` parses; invalid schema fails; a Japanese package is accepted; plan statements with CJK fail; secret fails; outside-root source fails; baseline version mismatch fails; stale version fails; unknown `id_policy` fails; an unknown role fails. |
| `tests/amend-rfc-up/revision/plan.test.mjs` | Valid plan parses; missing target fails; existing add target fails; invalid ID fails; `add-rule` without `id_rationale` fails; `add-rule` with `specialization_of` fails; `rename-rule` without an invalid/collision reason fails; `split-rule` without `kept_id` or with duplicate `new_ids` fails; evidence line-hash mismatch fails; conflicting ops fail; unsorted plan fails. |
| `tests/amend-rfc-up/revision/coverage.test.mjs` | Every revision statement, table row, and non-empty code block maps to a disposition; unmapped fails; duplicate disposition fails; process directives and completion criteria have dispositions; each disposition references an applied op. |
| `tests/amend-rfc-up/revision/identity.test.mjs` | Update preserves ID; add gets a new ID; retire tombstones; merge keeps `kept_id`; split keeps `kept_id` and adds `new_ids`; retired ID reuse fails; alias target missing fails. |
| `tests/amend-rfc-up/revision/preservation.test.mjs` | Baseline unchanged passes; rendering-only change updates the body hash without a normative op; updated with hashes passes; lost without retirement fails; retirement without document evidence fails; added without evidence fails. |
| `tests/amend-rfc-up/revision/ledger.test.mjs` | Ledger schema; baseline/revision digests; every op applied; old/new hashes; artifact-map entries; tamper fails. |
| `tests/amend-rfc-up/revision/authorization.test.mjs` | Retire/merge/split/rename are authorized by document evidence; MUST->MAY is authorized by document evidence; strengthening does not require authorization; a plaintext external approval is rejected with `APPROVAL_LEAK`; no separate approval gate blocks the build. |
| `tests/amend-rfc-up/revision/coherence.test.mjs` | A changed rule records body/registry/api/profile/conformance/template classes; a missing class fails `REVISION_COHERENCE_GAP`; an unchanged reason is accepted; a process directive is not a law rule. |
| `tests/amend-rfc-up/revision/determinism.test.mjs` | Same baseline plus plan is byte-identical; reordered ops are byte-identical; the plan hash is part of the output; no clock read. |
| `tests/amend-rfc-up/revision/idempotence.test.mjs` | Re-applying is `NO_CHANGES`; partial application fails; no-op revision does not install. |
| `tests/amend-rfc-up/revision/prose.test.mjs` | A document with no headings is accepted; every block gets a disposition or interpretation; a non-destructive low-confidence interpretation applies; a destructive interpretation without evidence fails `INTERPRETATION_UNRESOLVED`; a law document with no normative change fails `NO_NORMATIVE_CHANGE`. |
| `tests/amend-rfc-up/revision/roles.test.mjs` | Law-revision on a law skill passes; law-revision on an OKF skill fails `UPDATE_ROLE_MISMATCH`; okf-reference on an OKF skill passes; mixed role fails `UPDATE_ROLE_MIXED_UNSUPPORTED`; build-source is not an update. |
| `tests/amend-rfc-up/revision/security.test.mjs` | `..`, absolute path, symlink escape, secret, NUL, binary are rejected; a Japanese package with English plan statements is accepted; CJK in plan statements is rejected. |

### 17.2 Law adapter

| Test file | Red assertions |
|---|---|
| `tests/amend-rfc-up/law-revision/baseline.test.mjs` | Baseline loads from `rule-concepts.json`; missing baseline fails; invalid baseline fails; adopted baseline is written on first update. |
| `tests/amend-rfc-up/law-revision/registry.test.mjs` | Effective registry applies add/update/retire/merge/split; `kept_id` is preserved; bijection holds; superseded baseline sections are absent from the bundle. |
| `tests/amend-rfc-up/law-revision/preservation.test.mjs` | 486 prior rules are preserved without hardcoding; add/retire counts reconcile; no ID reuse. |
| `tests/amend-rfc-up/law-revision/coverage.test.mjs` | Revision headings, rule rows, and code blocks are mapped; zero unmapped; process directives and completion criteria are mapped; baseline coverage remains zero-gap. |
| `tests/amend-rfc-up/law-revision/generator.test.mjs` | Generator uses the effective registry; no source-order ID allocation; current-only bundle; source view retains baseline history and excludes `role = revision`; artifact-map covers API/profile/conformance/policy/contract/test/template classes. |
| `tests/amend-rfc-up/law-revision/source-view.test.mjs` | The revision package is excluded from the delivered source view; baseline sources regenerate byte-identical; the line map covers every control line; no raw non-English text appears. |
| `tests/amend-rfc-up/law-revision/verifier.test.mjs` | v4 checks pass; remove an op -> `REVISION_COVERAGE_GAP`; remove a superseded section disposition -> `REVISION_SUPERSEDED_UNACCOUNTED`; change ID -> `RULE_ID_CHANGED`; reuse -> `RULE_ID_REUSED`; retire without document evidence -> `AUTHORIZATION_MISSING`; weaken without document evidence -> `WEAKENING_UNAUTHORIZED`; specialize via add -> `REVISION_SPECIALIZATION_NEEDS_UPDATE`; rename without reason -> `RULE_RENAME_PROHIBITED`; split mapping invalid -> `SPLIT_MAPPING_INVALID`; coherence gap -> `REVISION_COHERENCE_GAP`; process directive as rule -> `PROCESS_DIRECTIVE_AS_RULE`; tamper ledger -> `REVISION_LEDGER_DRIFT`; baseline source drift -> `BASELINE_SOURCE_DRIFT`; baseline version mismatch -> `REVISION_BASELINE_VERSION_MISMATCH`; stale version -> `REVISION_STALE`. |
| `tests/amend-rfc-up/law-revision/install.test.mjs` | Failed verification leaves the baseline untouched; backup and rollback work; source/installed SHA match. |
| `tests/amend-rfc-up/law-revision/assets.test.mjs` | Asset add/update/retire; concept and ledger; install roots. |
| `tests/amend-rfc-up/law-revision/performance.test.mjs` | 2.5k rules within budget; update under the declared time and memory limits. |

### 17.3 OKF adapter

| Test file | Red assertions |
|---|---|
| `tests/amend-rfc-up/okf-revision/baseline.test.mjs` | Baseline loads from the concept inventory and bundle; missing baseline fails; adopted baseline is written. |
| `tests/amend-rfc-up/okf-revision/concept-identity.test.mjs` | Update preserves ID; add gets a path ID; rename requires alias; internal links rewrite to the new ID; retire tombstones; duplicate ID fails. |
| `tests/amend-rfc-up/okf-revision/preservation.test.mjs` | Baseline concepts preserved or retired; silent loss fails; changed body requires old/new hashes. |
| `tests/amend-rfc-up/okf-revision/graph.test.mjs` | `x-requires` acyclic; no dangling links; no orphan index; transitive closure remains multi-node. |
| `tests/amend-rfc-up/okf-revision/freshness.test.mjs` | `generated.at`/`verified.at`/`stale_after` updated; stale current concept fails; no stale presentation. |
| `tests/amend-rfc-up/okf-revision/log.test.mjs` | Log entry appended; newest first; deterministic; missing entry fails. |
| `tests/amend-rfc-up/okf-revision/reference.test.mjs` | A plain reference article adds concepts; an existing source updates concepts; `reference-only` adds a citation without changing a body; no law rule, registry, API, or conformance class is required. |
| `tests/amend-rfc-up/okf-revision/version-policy.test.mjs` | OKF reference update bumps patch; concept addition/update bumps minor; retire/rename follows the OKF policy; the law major-bump policy is not applied. |
| `tests/amend-rfc-up/okf-revision/source-view.test.mjs` | A `revision` document is excluded from the delivered source view; a `reference` document is included when English; baseline sources regenerate byte-identical; the line map covers every control line; no raw non-English text appears. |
| `tests/amend-rfc-up/okf-revision/coverage.test.mjs` | Revision headings, preamble, code blocks, and lines mapped; zero unmapped; process directives and completion criteria mapped. |
| `tests/amend-rfc-up/okf-revision/verifier.test.mjs` | v4 checks pass; remove an op -> `REVISION_COVERAGE_GAP`; remove a superseded section disposition -> `REVISION_SUPERSEDED_UNACCOUNTED`; lose a concept -> `CONCEPT_LOST`; rename without alias -> `CONCEPT_ID_CHANGED`; break a link -> `LINK_BROKEN`; orphan index -> `INDEX_ORPHAN`; coherence gap -> `REVISION_COHERENCE_GAP`; process directive as rule -> `PROCESS_DIRECTIVE_AS_RULE`; tamper ledger -> `REVISION_LEDGER_DRIFT`; baseline source drift -> `BASELINE_SOURCE_DRIFT`; baseline version mismatch -> `REVISION_BASELINE_VERSION_MISMATCH`; stale version -> `REVISION_STALE`. |
| `tests/amend-rfc-up/okf-revision/install.test.mjs` | Source/installed parity; backup and rollback. |
| `tests/amend-rfc-up/okf-revision/assets.test.mjs` | Asset add/update/retire; concept per asset; install roots. |
| `tests/amend-rfc-up/okf-revision/performance.test.mjs` | 2.5k concepts within budget. |

### 17.4 Command tests

| Test file | Red assertions |
|---|---|
| `tests/build-law-skill/revision-command.test.mjs` | `update` token enters update mode; `update: true` and `revision: true` also enter update mode; build mode remains v3 and emits no revision artifacts; a bare Japanese prose document without front matter infers context; multi-skill update rejected; baseline missing fails; no flags accepted; a Japanese package with English plan statements updates end to end; no external approval is required. |
| `tests/build-okf-skill/revision-command.test.mjs` | Same for OKF; a plain reference article enters `okf-reference`; it adds/updates concepts without law rule semantics. |
| `tests/build-law-skill/build-regression.test.mjs` | A build-mode invocation is byte-identical to the current build output except for the optional `source/build-identity.json`; v3 checks pass; no baseline or revision artifacts are required. |
| `tests/build-law-skill/revision-exemplar.test.mjs` | The exemplar `rust-interface-law` updates end to end with a 0.4.0 revision; a rule with API, registry, profile, conformance, and template changes passes the coherence matrix. |
| `tests/build-okf-skill/revision-exemplar.test.mjs` | The exemplar `natenv-okf` updates end to end. |
| `tests/build-law-skill/revision-regression.test.mjs` | A build-mode invocation produces the same bundle as before, plus the new baseline artifacts. |

## 18. Acceptance Criteria

### 18.1 Definition of Done

| ID | Check |
|---|---|
| A1 | A revision package updates the installed skill end to end with no additional input. |
| A2 | The baseline remains installed and untouched on any failure. |
| A3 | Every revision statement has a disposition; every baseline item is preserved, updated, or retired. |
| A4 | Rule and concept identities are stable; retired IDs are never reused. |
| A5 | Destructive and weakening operations are authorized by the revision package's evidence; no separate human gate blocks the build. |
| A6 | The revision ledger records evidence, authorizations, old/new hashes, and digests. |
| A7 | Build: v3 verification passes. Update: dev and installed v4 verification pass with every required check `machine_verified`. |
| A8 | Rebuild is byte-identical; re-application is `NO_CHANGES`. |
| A9 | Freshness metadata and logs are updated. |
| A10 | Assets are reconciled and installed. |
| A11 | Security checks reject secrets, binary, path escapes, and non-English plan statements; a Japanese package is accepted. |
| A12 | Build mode remains backward compatible. |
| A13 | Every changed rule passes the coherence matrix for body, registry, API, profile, conformance, policy, contract, test, template, index, and asset classes. |
| A14 | Process directives are recorded as policy and never emitted as law rules. |

### 18.2 Mutation matrix

| Mutation | Required result |
|---|---|
| Remove one revision operation | `REVISION_COVERAGE_GAP`; no install |
| Remove the add-rule op but keep the registry row | `RULE_ADDED_WITHOUT_EVIDENCE`; no install |
| Change a rule ID on update | `RULE_ID_CHANGED`; no install |
| Reuse a retired rule ID | `RULE_ID_REUSED`; no install |
| Retire without document evidence | `AUTHORIZATION_MISSING`; no install |
| MUST->MAY without document evidence | `WEAKENING_UNAUTHORIZED`; no install |
| Add a rule that specializes an existing rule | `REVISION_SPECIALIZATION_NEEDS_UPDATE`; no install |
| Rename an existing rule ID without an invalid/collision reason | `RULE_RENAME_PROHIBITED`; no install |
| Split a rule without `kept_id` or with duplicate `new_ids` | `SPLIT_MAPPING_INVALID`; no install |
| Change a statement without old/new hashes | `REVISION_HASH_MISSING`; no install |
| Tamper the revision ledger | `REVISION_LEDGER_DRIFT`; no install |
| Drift the baseline source | `BASELINE_SOURCE_DRIFT` / `REVISION_BASELINE_INVALID`; no install |
| Use a stale or mismatched baseline version | `REVISION_STALE` / `REVISION_BASELINE_VERSION_MISMATCH`; no install |
| Remove a baseline section without a superseded disposition | `REVISION_SUPERSEDED_UNACCOUNTED`; no install |
| Reapply the same revision | `NO_CHANGES`; no install |
| Reorder operations | Byte-identical output |
| Rename a source file or directory | Same rule/concept identities after alias resolution |
| Add a duplicate obligation | `OBLIGATION_DUPLICATE`; no install |
| Remove a concept without retirement | `CONCEPT_LOST`; no install |
| Rename a concept without an alias | `CONCEPT_ID_CHANGED`; no install |
| Add a dangling `x-requires` | `CONCEPT_REQUIRES_MISSING`; no install |
| Introduce an `x-requires` cycle | `CONCEPT_REQUIRES_CYCLE`; no install |
| Remove the log entry | `LOG_MISSING`; no install |
| Leave a current concept stale | `STALE_NODE`; no install |
| Add a secret | Reject; no install |
| Write a Japanese plan statement | `REVISION_STATEMENT_NOT_ENGLISH`; no install |
| Use a Japanese package with English plan statements | Accept; install |
| Omit a referenced API/profile/conformance/template class | `REVISION_COHERENCE_GAP`; no install |
| Emit a process directive as a law rule | `PROCESS_DIRECTIVE_AS_RULE`; no install |
| Hand-edit a generated index | `GENERATED_INDEX_EDITED`; no install |
| Leave a completion criterion unmapped | `COMPLETION_CRITERION_UNMAPPED`; no install |
| Add an asset without a governing concept | `ASSET_RULE_UNLINKED` / `ASSET_DELIVERY_OMISSION`; no install |
| Supply plain prose with no headings | Accepted; every block has a disposition or interpretation |
| Supply prose with no identifiable change to a law skill | `NO_NORMATIVE_CHANGE`; no install |
| Supply a reference article to an OKF skill | `okf-reference`; concepts added/updated; no law coherence required |
| Use a law role on an OKF skill | `UPDATE_ROLE_MISMATCH`; no install |
| Use a mixed role in one invocation | `UPDATE_ROLE_MIXED_UNSUPPORTED`; no install |
| Omit a prose block from coverage | `INTERPRETATION_MISSING` / `REVISION_COVERAGE_GAP`; no install |
| Run build mode without revision artifacts | Build v3 passes; no baseline or plan required |

### 18.3 Performance budget

| Operation | Budget |
|---|---|
| Package measurement | < 1 s |
| Plan validation | < 2 s |
| Effective generation (486 rules) | < 10 s |
| Dev verification | < 60 s |
| Installed verification | < 30 s |
| Full law update (rust-interface-law) | < 120 s |
| Routine OKF reference update | < 60 s |
| Build mode overhead vs current build | < 5% |
| Memory | < 512 MB |

## 19. Failure Modes

| Code | Cause | Action |
|---|---|---|
| `REVISION_CONTRACT_INVALID` | Front matter or schema invalid | Print the field; write nothing |
| `REVISION_DATE_REQUIRED` | A bare package has no ISO date, ticket date, or `SOURCE_DATE_EPOCH` | Print the sources; write nothing |
| `REVISION_SKILL_MISMATCH` | Package skill differs from the invocation | Print both; write nothing |
| `REVISION_VERSION_INVALID` | Missing or non-increasing version | Print the versions; write nothing |
| `REVISION_VERSION_CLASS_MISMATCH` | Bump class too small | Print the required bump; write nothing |
| `REVISION_DATE_INVALID` | Missing or malformed date | Print the expected format; write nothing |
| `REVISION_BASELINE_MISSING` | No installed baseline | Print the path; write nothing |
| `REVISION_BASELINE_INVALID` | Baseline fails installed verification | Print the verifier report; write nothing |
| `REVISION_BASELINE_VERSION_MISMATCH` | Package `baseline_version` differs from the installed version | Print both versions; write nothing |
| `REVISION_STALE` | Package version is not greater than the installed version | Print both versions; write nothing |
| `BASELINE_SOURCE_DRIFT` | Baseline source hashes no longer match the manifest | Rebuild the baseline; write nothing |
| `REVISION_DOCUMENT_INVALID` | Not Markdown, NUL, or binary | Print detection; write nothing |
| `REVISION_LANGUAGE_INVALID` | Unsupported language declaration | Print the value; write nothing |
| `REVISION_STATEMENT_NOT_ENGLISH` | A plan statement, title, or description contains CJK | Print the statement; write nothing |
| `REVISION_DOCUMENT_SECRET` | Secret detected | Print the path; write nothing |
| `REVISION_SOURCE_OUTSIDE_ROOT` | Source outside the declared root | Print the resolved path; write nothing |
| `REVISION_ID_POLICY_INVALID` | Unknown `id_policy` | Print the value; write nothing |
| `REVISION_PLAN_INVALID` | Plan schema or operation invalid | Print the operation; write nothing |
| `REVISION_TARGET_MISSING` | Update/retire target absent | Print the target; write nothing |
| `REVISION_TARGET_EXISTS` | Add target already exists | Print the target; write nothing |
| `REVISION_EVIDENCE_MISSING` | Operation lacks evidence | Print the operation; write nothing |
| `REVISION_EVIDENCE_MISMATCH` | Line hash not at the cited line | Print the line and hash; write nothing |
| `REVISION_COVERAGE_GAP` | Unmapped revision statement | Print the statement; write nothing |
| `REVISION_SUPERSEDED_UNACCOUNTED` | A baseline section is removed without a superseded disposition | Print the section; write nothing |
| `REVISION_DUPLICATE_DISPOSITION` | Two dispositions for one clause, or overlapping clause spans | Print the statement; write nothing |
| `REVISION_OPERATION_CONFLICT` | Contradictory ops on one target | Print the target; write nothing |
| `REVISION_PLAN_UNSORTED` | Operations not sorted | Print the order; write nothing |
| `REVISION_PLAN_DRIFT` | Plan hash mismatch | Print the hash; write nothing |
| `RULE_ID_INVALID` | ID grammar fail | Print the ID; write nothing |
| `RULE_ID_REUSED` | ID in tombstones or baseline | Print the ID; write nothing |
| `RULE_ID_CHANGED` | Update changed the ID | Print the old and new ID; write nothing |
| `RULE_LOST` | Baseline rule absent without retirement | Print the ID; write nothing |
| `RULE_ADDED_WITHOUT_EVIDENCE` | New rule without an add op | Print the ID; write nothing |
| `ID_RATIONALE_MISSING` | `add-rule` lacks an independence rationale | Print the ID; write nothing |
| `REVISION_SPECIALIZATION_NEEDS_UPDATE` | An add is a specialization of an existing rule | Use `update-rule`; write nothing |
| `RULE_RENAME_PROHIBITED` | Rename is not allowed by the ID policy | Use split/merge or provide the required reason; write nothing |
| `SPLIT_MAPPING_INVALID` | `kept_id`/`new_ids` are missing, duplicated, or conflicting | Print the mapping; write nothing |
| `MERGE_MAPPING_INVALID` | `kept_id`/merged IDs are missing or conflicting | Print the mapping; write nothing |
| `AUTHORIZATION_MISSING` | Destructive operation lacks document evidence | Print the operation; write nothing |
| `WEAKENING_UNAUTHORIZED` | Weakening lacks document evidence | Print the rule; write nothing |
| `APPROVAL_LEAK` | A plaintext external approval appears in the skill tree | Replace it with `external_approval_sha256` and an alias; no install |
| `RULE_REFERENCE_UNRESOLVED` | A rename/merge/split reference cannot be rewritten | Print the reference; write nothing |
| `PROCESS_DIRECTIVE_AS_RULE` | A revision-process instruction appears as a law rule | Move it to `policy.json`; write nothing |
| `COMPLETION_CRITERION_UNMAPPED` | A completion criterion has no conformance target | Add the mapping; write nothing |
| `REVISION_COHERENCE_GAP` | A changed rule omits a referenced artifact class | Print the rule and class; write nothing |
| `GENERATED_INDEX_EDITED` | A hand-edited index or range was supplied | Regenerate from the registry; write nothing |
| `OBLIGATION_DUPLICATE` | Normalized duplicate | Print both IDs; write nothing |
| `REVISION_HASH_MISSING` | Changed item lacks old/new hash | Print the item; write nothing |
| `REVISION_HASH_MISMATCH` | Old hash differs from the baseline | Print the item; write nothing |
| `REVISION_LEDGER_DRIFT` | Ledger hash mismatch | Print the ledger; write nothing |
| `REVISION_NOT_DETERMINISTIC` | Rebuild differs | Print the differing file; write nothing |
| `REVISION_ALREADY_APPLIED` | All ops already applied | Report `NO_CHANGES`; no install |
| `REVISION_PARTIAL_APPLIED` | Some ops applied | Stop; no install |
| `REVISION_NO_CHANGES` | No normative change | Report `NO_CHANGES`; no install |
| `CONCEPT_ID_INVALID` | Section or concept ID is not an ASCII path slug | Print the ID; write nothing |
| `CONCEPT_LOST` | Baseline concept absent without retirement | Print the ID; write nothing |
| `CONCEPT_ID_CHANGED` | Rename without alias | Print the IDs; write nothing |
| `CONCEPT_DUPLICATE` | Duplicate concept ID | Print the ID; write nothing |
| `CONCEPT_REQUIRES_MISSING` | `x-requires` target absent | Print the edge; write nothing |
| `CONCEPT_REQUIRES_CYCLE` | `x-requires` cycle | Print the cycle; write nothing |
| `LOG_MISSING` | Revision log entry absent | Write the entry; re-verify |
| `STALE_NODE` | Source drift or stale concept | Rebuild from current source; no install |
| `REVISION_INSTALL_BLOCKED` | Copy or post-check failed | Restore the backup; report |
| `REVISION_MULTI_SKILL_UNSUPPORTED` | More than one skill in update mode | Print the grammar; write nothing |
| `REVISION_ROLE_INVALID` | Unknown role | Print the role; write nothing |
| `REVISION_ROLE_AMBIGUOUS` | The AI cannot classify the document role with evidence | Print the candidates; write nothing |
| `UPDATE_ROLE_MISMATCH` | A law role on an OKF skill or an OKF role on a law skill | Print the role and skill; write nothing |
| `UPDATE_ROLE_MIXED_UNSUPPORTED` | A mixed law/OKF role in one invocation | Run the two updates separately; write nothing |
| `NO_NORMATIVE_CHANGE` | A law update has no identifiable normative change | Report `NO_CHANGES`; no install |
| `INFORMATION_ZERO` | An OKF update document has no claim-bearing block | Report `NO_CHANGES`; no install |
| `INTERPRETATION_MISSING` | A prose block has no disposition or interpretation | Print the line; write nothing |
| `INTERPRETATION_CONFLICT` | Two interpretations conflict | Print both; write nothing |
| `INTERPRETATION_UNRESOLVED` | A destructive interpretation lacks evidence | Print the line; write nothing |
| `INTERPRETATION_REQUIRES_EVIDENCE` | A low-confidence interpretation changes a public guarantee | Add evidence or choose a non-destructive route; write nothing |
| `REFERENCE_ONLY_CONFLICT` | A `reference-only` operation changes a concept body | Remove the body change; write nothing |

## 20. Rollout Plan

Implementation follows the project's TDD and ticket pipeline.

| Ticket | Scope | Target files | Required tests |
|---|---|---|---|
| T1 | Shared revision contract, plan validator, coverage, coherence, identity, ledger, authorization, policy, determinism | `.claude/scripts/amend-rfc-up/revision/*` | §17.1 |
| T2 | Law baseline, effective registry, artifact classes/coherence, generator, preservation, verifier v4 | `.claude/scripts/amend-rfc-up/law-revision/*`, `law-verify/*`, `law-verify/checks.json` | §17.2 |
| T3 | OKF baseline, effective bundle, artifact classes/coherence, freshness, graph, verifier v4 | `.claude/scripts/amend-rfc-up/okf-revision/*`, `okf-verify/*`, `okf-verify/checks.json` | §17.3 |
| T4 | Command update mode for both builders | `.claude/commands/build-law-skill.md`, `.claude/commands/build-okf-skill.md` | §17.4 |
| T5 | Migrate `rust-interface-law` to `source/baseline.json` and v4; remove the hardcoded 486 check | `.claude/skills/rust-interface-law/*`, canonical verifier | §17.2, §17.4 |
| T6 | Acceptance matrix, prose/role/OKF-reference cases, build-mode regression, performance, security, migration | `tests/build-law-skill/*`, `tests/build-okf-skill/*`, fixtures | §17, §18 |

Each ticket must:

1. Write failing tests first; confirm they fail for the absence of the implementation.
2. Implement behavior, not literal test wording.
3. Refactor only in a green state.
4. Run the impact-set tests with `node --test`; never `make test`.
5. Pass the canonical verifier in dev and installed modes.

## 21. Open Decisions

| ID | Question | Recommended default |
|---|---|---|
| O1 | Should law concepts carry `stale_after`? | Yes when the profile enables it; default 365 days. |
| O2 | Should a no-op revision bump the version? | No. Report `NO_CHANGES`; no install. |
| O3 | Who authorizes destructive operations? | The revision package's evidence. An external approval is optional; the machine records the document hash and evidence line. |
| O4 | Should semantic weakening require AI judgment? | Yes. The AI declares `weakening`; the machine checks the modal diff and requires document evidence. |
| O9 | How are new rule IDs allocated for a narrative package? | The AI authors the plan with `id_rationale`; `id_policy: append` can allocate the next free suffix within the declared prefix. The plan is stored and hashed. |
| O10 | How are artifact-class updates expressed? | Declared operations with canonical paths; the coherence profile requires a disposition for every referenced class. |
| O11 | Does build mode emit revision artifacts? | No. Build remains v3; an optional `source/build-identity.json` is the only addition. |
| O12 | What is the OKF version policy? | Patch for editorial/reference; minor for addition/update/retire/rename. The profile may override. |
| O13 | What happens with ambiguous prose? | Apply the minimal, reversible interpretation; record confidence and rationale. A destructive interpretation without evidence fails closed. |
| O14 | Can a law update add OKF knowledge? | No in one invocation. A mixed role is rejected; run the law update and the OKF update separately. |
| O5 | Should update mode support multiple skills? | No in v1. One skill per update invocation. |
| O6 | Should the build mode emit a baseline? | No. Build remains v3; an optional `source/build-identity.json` is the only addition. Update mode adopts the installed skill on first use. |
| O7 | Should the effective bundle keep superseded sections? | No. Current-only bundle; history in the source view and ledger. |
| O8 | Should the revision package be allowed to add new source files? | Yes, declared in front matter and contained in the source roots. |
