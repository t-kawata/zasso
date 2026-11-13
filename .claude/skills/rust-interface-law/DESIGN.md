# Rust Interface Law — Asset Lock

Status: normative · Version: 0.3.2

## 1. Purpose

Zero-loss extraction of 18 numbered `IMPLEMENTATION-SPEC` docs into a machine-checkable atom lock. Runtime consumes lock only. Unlocked atom = unconsumable.

## 2. Source

| Item | Value |
|---|---|
| Source docs | 18 numbered docs under `docs/IMPLEMENTATION-SPEC` |
| Lines | 6,749 |
| Rule IDs | 430 |
| `README.md` | index; excluded from 18 |
| `EXPERT-REVIEW-PACKAGE.md` | derived 8,009-line view; not source |

## 3. Decisions

| ID | Decision |
|---|---|
| D1 | CI pinned copy authoritative; local Stop hook self-check |
| D2 | Project-law overlay included; TDD, stubs, test weakening, generated files, language |
| D3 | Multi-unit union + parity |
| D4 | Single `dist/skill.mjs`; `install.js` copy-only |
| D5 | V4/exception require `approval_ref`; AI cannot close |
| D6 | 18 docs authoritative; package derived |
| D7 | Atom identity = content hash + heading path + type + ordinal |
| D8 | Project rules additive only; no `Fixed` weakening |
| D9 | Skill tree: zero concrete project identifier; placeholder-only |

## 4. Atom

| Field | Rule |
|---|---|
| `id` | Rule = rule ID; other = `<type>/<heading-slug>/<ordinal>/<hash12>` |
| `type` | `Rule`, `Heading`, `Paragraph`, `List`, `Table`, `TableRow`, `TableHeader`, `CodeBlock`, `Blank` |
| `source` | Manifest path |
| `heading_path` | Redacted heading stack |
| `ordinal` | Per type + heading path; Rule = registry row |
| `source_sha256` | SHA-256 of LF-normalized original span |
| `content_sha256` | SHA-256 of redacted delivered text |
| `span` | 1-indexed inclusive line range |
| `classification` | `normative`, `non_normative`, `structural` |
| `reason` | Deterministic classification reason |
| `text` | Redacted delivered text |

Rule ID grammar: `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$`.

Order: source file order, span start, ordinal.

## 5. Coverage

Partition: each source line → exactly one leaf atom or explicit exclusion.

| Metric | Pass |
|---|---|
| `gaps` | 0 |
| `overlaps` | 0 |
| `attributed` | `lines` |
| Structural exclusion | `Heading`, `Blank`, `TableHeader` |

## 6. Generic Boundary

| Layer | Rule |
|---|---|
| Map | `source/redaction.sha256.json` = `[{sha256, placeholder}]`; no literal identifier |
| Token | `[A-Za-z][A-Za-z0-9_]*`; lowercase; SHA-256; map hit → placeholder |
| Applied to | `text`, `heading_path`; ID slug uses redacted path |
| Unknown proper noun | Not in map, not generic allowlist → extract/classify fail `15` |
| Skill tree | Hash-only scan; zero forbidden token |
| Source docs | Unchanged; original identifiers remain only in archived source |

Placeholders: `<platform>`, `<project-a>`, `<project-b>`, `<project-c>`.

## 7. CLI

| Command | Args | Exit |
|---|---|---|
| `manifest` | `--source <dir> --out <toml>` | 0 |
| `extract` | `--source <dir> --out <json>` | 0, 10, 15 |
| `classify` | `--source <dir> [--decisions <json>] [--lock <path>] [--coverage <path>]` | 0, 10–15 |
| `verify` | `--source <dir> [--lock <path>] [--coverage <path>]` | 0, 10–15 |

Exit: `0` pass; `10` source/extract; `11` classify; `12` coverage; `13` registry; `14` determinism; `15` generic boundary.

## 8. Artifacts

| Path | Content |
|---|---|
| `source/manifest.toml` | 18 paths + SHA-256 + `spec_version` + `source_set_sha256` + `redaction_sha256` |
| `source/redaction.sha256.json` | Hash-only map |
| `source/skill-registry.toml` | `SK-01..SK-08` + verification |
| `atoms.lock.json` | Full atom set; redacted text; source/content hashes |
| `coverage.json` | Per-file attribution; gaps; overlaps; exclusions |

## 9. Invariants

| ID | Statement | Verification |
|---|---|---|
| SK-01 | Line → one leaf atom or exclusion | `test:atom-lock.test.mjs::coverage partitions every line` |
| SK-02 | Rule atoms ↔ registry rows bijective | `test:atom-lock.test.mjs::registry bijection` |
| SK-03 | Identity stable across line shift; hash changes on text change | `test:atom-lock.test.mjs::identity survives line shift` |
| SK-04 | Identical input → identical lock/coverage | `test:atom-lock.test.mjs::deterministic output` |
| SK-05 | Skill tree has zero forbidden token | `test:redaction.test.mjs::skill tree has no forbidden token` |
| SK-06 | Redaction map hash-only | `test:redaction.test.mjs::map has only sha256 and placeholder` |
| SK-07 | Empty/heading-only/CRLF/EOF deterministic | `test:atom-lock.test.mjs::CRLF normalizes deterministically` |
| SK-08 | Hash mismatch fails verify | `test:integration.test.mjs::manifest hash mismatch fails with exit 10` |

## 10. Non-goals

The runtime owns OKF render, resolve, context, scan, gate, attest, exception, hooks, CI, packaging. The asset lock does not edit the 18 docs, regenerate the expert package, or change the registry.

## 11. Implementation Contract Layer

| Artifact | Role |
|---|---|
| `source/implementation-policy.toml` | baseline pins, features, forbidden edges |
| `source/implementation-contracts.toml` | rule to template, detector, and test mapping |
| `source/implementation-tests.toml` | test driver and command manifest |
| `templates/<interface>/` | test and implementation skeletons |
| `implementation-check` | dependency, feature, edge, source, and template checks |
| `law-identity` | spec_version, dist, and policy hash comparison |

Template bodies stay outside `context` delivery. `gate --implementation` consumes the report. A missing report is `not_run`, never a pass.
