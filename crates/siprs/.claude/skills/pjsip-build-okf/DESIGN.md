# Design

`pjsip-build-okf` is a generated Open Knowledge Format v0.2 bundle and CLI.
It makes the PJSIP 2.17 native build handbook navigable without asking the AI
to grep raw Markdown.

## Source

The build input is one English Markdown document: the PJSIP 2.17 build guide
for Windows/x64, Linux/x64, and macOS/ARM64. The measured source text is kept
byte-identical in `PRE-OKF-ORIGINAL.md` and `source/source.baseline.md`; the
manifest records its normalized SHA-256.

## Concept model

- One concept per level-2 section.
- The document title line becomes the rooted preamble concept.
- Every span is recorded in `x-source-span`; the spans partition every
  non-blank source line exactly once.
- The body of each concept is the original section Markdown plus one source
  footnote, so a cited claim can be traced to its line range.
- `x-requires` carries the build-order prerequisite chain. `required --entry`
  walks that chain transitively, and `context --entry --budget` delivers the
  complete closure or refuses with `BUDGET_EXCEEDED`.

## Bundle

The bundle root is `okf/`. Identity is the bundle-relative path without the
extension. `index.md` files are linked lists; `log.md` has dated headings,
newest first. Frontmatter supplies type, title, description, sources, trust,
freshness, and `x-` extensions.

## Engine

The runtime is the canonical OKF engine, copied mechanically from the shared
`okf-core` implementation. Ticket annotations are stripped, library imports
point at the vendored `@okforest/okf` bundle, and the CLI path patch lets the
installed distribution find its sibling `okf/` directory. Every copied module
is hashed in `source/shared-engine.json`.

## Verification

The canonical verifier runs in dev mode (source, manifest, lock, coverage,
graph, retrieval, context, navigation, conformance, lint, profile, installer,
determinism, tests, performance) and installed mode (layering, graph,
retrieval, usage, installer, distribution, conformance, context, navigation,
traversal envelope, unknown-id handling, graph reachability, facet
sufficiency). The acceptance matrix exercises rename, reorder, provenance
loss, coverage loss, broken links, orphan indexes, source drift, unknown
types and keys, budget refusal, engine drift, installed tamper, CRLF
normalization, and a scale bound.
