---
name: pjsip-build-okf
description: Traverse the PJSIP 2.17 native build handbook for Windows/x64, Linux/x64, and macOS/ARM64 in a single-host local lab with a virtual WAN and NAT simulation — source freeze, lane builds, staging, Rust FFI import, ABI and runtime gates. Use for directory drill-down, one-hop concept reads, outgoing and incoming links, required closure, budgeted context, trust and freshness, and source citation.
---

# pjsip-build-okf

A self-contained knowledge bundle plus CLI for the PJSIP 2.17 build guide:
correctness and safety boundaries, host prerequisites, source acquisition,
exact POSIX and Windows builds, stage audit, Rust FFI import, native tests,
threading rules, diagnostics, relocation, and the release gate.

The lanes assume the single-host local lab with a virtual WAN and NAT
simulation. The guide owns the PJSIP and dependency build; the lab owns VM
provisioning, transport, and reset.

The bundle root is `okf/`. The CLI is `dist/skill.mjs`; it finds `okf/` on its
own, so no path argument is needed. Work from the directory that contains this
file.

```sh
OKF=dist/skill.mjs
node "$OKF" list
```

This skill answers what the build guide says, where it says it, what surrounds
a section, and what a complete answer must contain. It is retrieval. It is not
a completion gate and it never certifies a build or a security disposition.

## Traversal Contract

Every node page and edge read returns one Traversal Envelope; a directory listing
returns one command per entry and a search row carries its expand_command. The caller reads `coverage`
and `guidance`; it never re-derives completeness from prose.

### Envelope

- `protocol`: `okf-traversal/v1`
- `node`: id, path, type, title, description, body, sources, trustTier, freshness
- `coverage`: profile, requiredFacets, present, missing, sufficient, insufficient, estimatedBytes, overfetchRatio
- `frontier`: entries with id, title, type, kind, why, command, estBytes, priority
- `guidance`: state, reason, decideAfter, mustRun, stopWhen, ifBack, hop, maxHops, budget
- `backTo`: the previous id in the stack, or null at the root

### Guidance states

| State | Condition | Caller action |
|---|---|---|
| `stop` | `coverage.missing` is empty | Implement or answer; no further read |
| `expand` | a required facet is missing and a hop remains | Run `guidance.mustRun` exactly |
| `back` | maximum hop reached, or no frontier fills the missing facet | Run `guidance.ifBack` |

`coverage.missing` is the only definition of insufficiency. A budget that
cannot fit required facets returns `insufficient: true` and never truncates a
facet. `overfetchRatio` is a report, not a failure.

### Frontier kinds

`prerequisite`, `dependent`, `source-section`, `sibling-rule`, `backlink`,
`parent`, `child`, `directory`, `source`, `action`.

### Failure

An absent id exits 2 and prints candidate ids. An empty edge list with exit 0
is never a valid answer for an absent id.

## Start Here

One command answers "what is here, and where do I enter?".

```sh
node "$OKF" list
```

Every entry line carries its own next command: a concept line carries
`expand --id <id>`, a directory line carries `list --path <directory>`. Follow
the printed command; do not glob the filesystem and do not guess ids. Identity
is the bundle-relative path without the extension.

### Scenario: first contact

1. `node "$OKF" list`
2. Read the entry for `pages`.
3. `node "$OKF" list --path pages`
4. `node "$OKF" list --path pages/pjsip-build-guide`

Stop when the listing shows the concept whose title matches the question.

## Directory Traversal

`list` is the only navigation primitive and it never descends on its own.

- `list` shows the root: `index.md`, `log.md`, and directory entries.
- `list --path <directory>` shows that directory's child directories,
  reserved files, and concepts.
- Reserved entries are structure, not knowledge. A concept id never ends in
  `index` or `log`.

### Scenario: find the Windows lane

1. `node "$OKF" list --path pages/pjsip-build-guide`
2. Pick the concept titled `6. Exact Windows/x64 MSVC build`.
3. `node "$OKF" expand --id pages/pjsip-build-guide/6-exact-windows-x64-msvc-build`

## Concept Page

`expand --id <id>` (alias `show`) returns four blocks:

- Page: id, path, type, title, description, full body, sources, trust tier,
  freshness.
- Coverage: the facets the active profile requires, which are present, which
  are missing.
- Frontier: every next hop with its kind, reason, cost, and exact command.
- Decision: `stop`, `expand`, or `back`, with the command to run.

Read `coverage.missing` first. When it is empty, answer from the body.

### Scenario: read one section

1. `node "$OKF" expand --id pages/pjsip-build-guide/5-exact-posix-build-linux-x64-mac-arm64`
2. Confirm `coverage.missing` is empty.
3. Answer from the body and cite the concept id.

## Outgoing and Incoming

The graph is the body Markdown links plus the declared prerequisite relation,
in both directions.

- `node "$OKF" outgoing --id <id>` lists links this concept declares.
- `node "$OKF" incoming --id <id>` lists backlinks and concepts that declare
  `x-requires` on this concept.
- `node "$OKF" neighbors --id <id>` merges both directions.

An external link is an edge with no concept target. A directory or source
entry is not knowledge; do not answer from it.

### Scenario: find who depends on the source freeze

1. `node "$OKF" incoming --id pages/pjsip-build-guide/3-source-acquisition-freeze-once-identical-per-lane`
2. Read the dependent titles.
3. Expand the dependent whose lane matches the question.

## Multi-Hop Reach

Reach is repeated one-hop reads, never a bulk crawl.

1. `node "$OKF" expand --id <id> --hop 0`
2. Read `frontier`; pick the entry whose kind answers the missing facet.
3. Run its `command` exactly, adding `--hop 1` so the decision knows the depth.
4. Repeat, incrementing `--hop`. Stop when `guidance.state` is `stop`, and
   never exceed `guidance.maxHops` (3).

### Scenario: follow a prerequisite chain

1. `node "$OKF" expand --id pages/pjsip-build-guide/9-build-and-execute-rust-ffi-tests-in-each-actual-os`
2. Expand the prerequisite for the imported artifact.
3. Stop at the first page whose `coverage.missing` is empty.

## Required Context

`required` is the closure; `context` is the delivery.

- `node "$OKF" required --entry <id>` returns `required` (declared
  prerequisites, transitively), `reachable` (one-hop body targets), and
  `context` (their union), plus `cycles` and `findings`.
- `node "$OKF" context --entry <id> --budget <bytes>` returns every concept
  body in the closure and a manifest of ids and hashes.

The closure is complete or it is an error. There is no partial delivery.

### Scenario: deliver a complete context

1. `node "$OKF" required --entry pages/pjsip-build-guide/16-implementation-appendix-convention`
2. `node "$OKF" context --entry pages/pjsip-build-guide/16-implementation-appendix-convention --budget 1000000`
3. Check that the Artifact block lists exactly the Required block's ids.

## Zero Results

An empty result is an answer: the bundle has no concept matching the query.

- `node "$OKF" search --query "<terms>"` returning no rows means no match.
- Widen: drop punctuation, use one distinctive word, try the domain noun.
- If still empty, `list --path <directory>` and read titles.
- Never invent an id. An absent id exits 2 with candidates.

### Scenario: empty search

1. `node "$OKF" search --query zzz-not-in-the-guide`
2. No rows.
3. `node "$OKF" list --path pages/pjsip-build-guide`
4. Report that the bundle does not cover the topic.

## Budget Exceeded

`context` refuses to truncate. Over budget prints `BUDGET_EXCEEDED` and exits
non-zero; no partial payload is emitted.

- Narrow the entry set to one concept.
- Read pages one at a time with `expand`.
- Raise `--budget` only when the caller can hold the whole closure.

### Scenario: a lane page too large for the budget

1. `node "$OKF" context --entry pages/pjsip-build-guide/8-import-artifacts-into-rust-project-no-installation-into-usr-local --budget 1000`
2. Observe `BUDGET_EXCEEDED`.
3. `node "$OKF" expand --id pages/pjsip-build-guide/8-import-artifacts-into-rust-project-no-installation-into-usr-local`
4. Answer from the page, not from a truncated context.

## Trust and Freshness

Every page carries trust and lifecycle metadata.

- `trustTier`: `unverified`, `machine-confirmed`, `human-reviewed`. Generated
  pages are `machine-confirmed`.
- `status`: `draft`, `stable`, `deprecated`. Generated pages are `stable`.
- `freshness`: `stale` and `staleAfter`. A page is stale when the clock passes
  `staleAfter`, or when its source hash drifted.

`node "$OKF" trust` and `node "$OKF" freshness` list the whole bundle. Never
present a stale or deprecated page as current; rebuild instead.

### Scenario: check whether a page is current

1. `node "$OKF" freshness`
2. If the page is listed, rebuild before answering.
3. `node "$OKF" trust --tier machine-confirmed`

## Sources and Citation

Provenance is per page: a source alias, a source id, a title, and a line span.

- `node "$OKF" sources <id>` returns the page's `sources` objects.
- Cite both the concept id and the source id, for example
  `pages/pjsip-build-guide/12-diagnose-wrong-libraries-abi-cache` from
  `pjsip-build-guide-14`.
- The source span is in `x-source-span`; the alias resolves through the
  path-alias map shipped beside the skill.

### Scenario: cite a claim

1. `node "$OKF" sources pages/pjsip-build-guide/12-diagnose-wrong-libraries-abi-cache`
2. Quote the body sentence.
3. Name the concept id and the source id in the answer.

## Authoring and Update

The bundle is files; the CLI keeps the structure honest.

1. Add `okf/pages/<source>/<slug>.md` with frontmatter: `type`, `title`,
   `description`, `sources`, `status`, `stale_after`. Use `x-` keys for
   extensions, including `x-requires` when the page depends on another.
2. Add its link row to the directory's `index.md`.
3. `node "$OKF" rebuild` must print a byte-identical result; it refuses if
   `index.md` or `log.md` drift.
4. `node "$OKF" validate --mode conformance` checks the three official
   conditions.
5. `node "$OKF" validate --mode lint` checks broken links, orphans, unknown
   types and keys, and stale pages.

Never hand-edit `log.md`; its dates come from `source/okf-log.json`.

### Scenario: add one page

1. Write the concept file.
2. Add the index row.
3. `node "$OKF" rebuild`
4. `node "$OKF" validate --mode conformance`
5. `node "$OKF" validate --mode lint`

### Scenario: rebuild after a source edit

1. Replace `source/source.baseline.md` and update `source/manifest.toml`.
2. Regenerate pages from the current source.
3. `node "$OKF" rebuild`
4. `node "$OKF" freshness` must be empty.

## Failure Modes

| Signal | Meaning | Action |
|---|---|---|
| `UNKNOWN_CONCEPT`, exit 2 | the id is absent | use the printed candidates or list the directory |
| `BUDGET_EXCEEDED` | the closure does not fit | narrow the entry set; never truncate |
| `NON_DETERMINISTIC` | a reserved file drifted from its model | restore it, then rebuild |
| `LINK_BROKEN` | a body link target is absent | fix the link or add the page |
| `FRONTMATTER_MISSING`, `TYPE_EMPTY` | conformance failed | add frontmatter with a non-empty type |
| `blocked` edge state | the target escapes the bundle root | stay inside `okf/` |
| `STALE_CONCEPT` | source hash or date moved | rebuild from the current source |

### Scenario: recover from an unknown id

1. Read the candidate list on stderr.
2. `node "$OKF" list --path <parent directory>`
3. Retry with a listed id.

### Scenario: repair a broken link

1. `node "$OKF" validate --mode lint` names the file and target.
2. Add the missing page or correct the link.
3. Rerun lint, then rebuild.
