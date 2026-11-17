# natenv-okf Design

## Source

One English Markdown source: the native-OS WAN/NAT/VoIP/P2P laboratory
specification. The build is deterministic: the lock, the bundle, and the
distribution are functions of the source bytes and this procedure.

## Bundle

- One concept per level-2 section plus one preamble concept.
- Concept identity is the bundle-relative path without `.md`.
- Body Markdown is the graph. The source has no cross-section links outside
  code fences, so navigation is carried by directory indexes, `x-requires`,
  and the frontier. No synthetic edges are added.
- Every non-preamble concept declares its predecessor in `x-requires`, so the
  required closure is transitive rather than a flat node.
- Every concept carries a source object, a line span, and a body hash.
- Every execution-asset file is one concept under `pages/exec-assets/`. The
  concept carries the exact file text, `x-asset-sha256`, and a governing guide
  section in `x-requires`.

## Engine

The generated `okf-core/` is the canonical engine copied with ticket
annotations stripped. The distribution bundles one ESM entry with esbuild; the
installed skill needs no `node_modules`. The engine reads the bundle through
`@okforest/okf` and exposes navigation, reachability, trust, freshness,
sources, validation, and budgeted context.

## Traversal

A page read returns one Traversal Envelope with Page, Coverage, Frontier, and
Decision blocks. `coverage.missing` is the only definition of insufficiency.
A required closure is complete or `BUDGET_EXCEEDED`; the CLI never truncates.

## Verification

The canonical verifier runs in dev and installed modes. Dev re-reads the
source, checks the manifest hash, the pre-OKF original, the lock, coverage,
provenance, graph, usage, runtime, tests, determinism, distribution, style,
conformance, lint, profile, index/log, trust, sources, context, navigation,
containment, library, performance, and traversal invariants. Installed mode
checks the installed tree, lock, boundary, graph, retrieval, usage, installer,
distribution, conformance, context, navigation, containment, envelope, unknown
id, reach, and facet sufficiency.

## Execution Assets

The skill ships `EXEC_ASSETS/` and indexes every meaningful file as a
first-class concept under `pages/exec-assets/`. Each concept carries the exact
file text, `x-asset-sha256`, `x-source-span`, a governing source section in
`x-requires`, and a body link to that section. `source/asset-manifest.toml`,
`source/asset-coverage.json`, and `source/asset-inventory.json` record the
asset set. The concept is the retrieval view; the file under `EXEC_ASSETS/` is
the executable copy. `install.js` copies both.

## Scope

Retrieval plus portable execution assets. The skill reports what the source
says and what each asset contains, with spans and hashes. It does not execute
the laboratory or certify runtime behavior.
