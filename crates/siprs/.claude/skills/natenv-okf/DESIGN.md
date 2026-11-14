# natenv-okf Design

A verified OKF v0.2 wiki skill built from one English Markdown source: the
implementation handbook for the simulated NAT environment (single PC,
virtual WAN included). The skill is a retrieval surface. It is not a
completion gate, a law skill, or a runtime certification of the handbook's
labs.

## Inputs and outputs

- One source: `Implementation-Handbook.md`, 2,987 lines, 13 level-2 sections,
  one level-1 title.
- One bundle: `okf/` with 14 concepts: 13 sections plus a rooted preamble.
- One CLI: `dist/skill.mjs` (bundled) and `scripts/cli.mjs` (staged form).
- One engine: a copied `okf-core/`, with the third-party library vendored.

The source is read-only. The build writes only under the staging tree, the
installed skill directory, the sibling path-alias file, and the OKF output
directory.

## Concept identity

Identity is the bundle-relative path without `.md`. There is no synthetic id,
no frontmatter `id`, and no frontmatter `links`. Body Markdown links are the
graph; `index.md` and `log.md` are reserved structure at every depth.

## Extraction rules

1. One concept per level-2 section. The section's span starts at its heading
   and ends on the line before the next level-2 heading, or at end of file.
2. The preamble owns line 1 through the line before the first level-2
   heading. The source's level-1 title on line 1 therefore has an owner, and
   no non-blank line is left unmapped.
3. Level-3 and deeper headings stay inside their section body. A heading
   inside a fenced block is code and never creates a section.
4. A body is the source span, byte-for-byte after line-ending normalization,
   with trailing blank lines trimmed and one OKF citation appended. The
   citation is a footnote reference plus a definition whose label equals the
   `sources[]` id, so provenance is visible on the page and resolvable by the
   engine.
5. A description is the first paragraph of the section, collapsed to one
   line, at most 200 characters. When a section opens with a code fence or a
   table and has no paragraph, the description falls back to the heading
   text. This is the only synthesized prose in the bundle.
6. Slugs are lowercase ASCII, non-alphanumerics collapsed to `-`, and
   truncated at 80 characters. Collisions take `-2`, `-3`. The preamble slug
   is always `preamble`.

## Frontmatter

Every concept carries `type: Page`, `title`, `description`, `sources[]`
(`resource`, `id`, `title`), `generated`, `verified`, `status: stable`,
`stale_after`, and four extensions: `x-topic`, `x-source-alias`,
`x-source-span`, and `x-content-sha256`. The writer's fixed key order makes
the bytes deterministic. `verified: [{ by: machine }]` yields the
`machine-confirmed` trust tier. `stale_after` is one year after the explicit
build date.

## Ledgers

| Artifact | Content |
|---|---|
| `source/manifest.toml` | source set hash and one `[[file]]` with alias, hash, lines, bytes |
| `source/source.baseline.md` | the LF-normalized source read at build time |
| `source/input-ledger.json` | every input under the declared roots, included with a reason |
| `source/concept-inventory.json` | every concept id, path, source alias, span |
| `source/coverage.json` | per-source lines, concepts, and three zero unmapped counters |
| `source/measurements.json` | raw line, heading, and span measurements |
| `source/okf-log.json` | the explicit dated log entries |
| `source/source-view.md` | alias, hash, and the concept-to-span table |
| `source/shared-engine.json` | every copied engine module with its SHA-256 |
| `source/okf-profile.toml` | domain, types, discovery, detectors, limits |
| `atoms.lock.json` | concept id, path, title, type, and body hash |

The coverage counters are computed, not asserted: spans partition the source
and the span test proves it line by line. There is exactly one source, so the
counters sum one record.

## Engine

The canonical engine under the host's amendment scripts is copied verbatim
except for two mechanical, recorded transformations:

1. Lines that begin with a ticket-annotation comment are removed. The
   generated tree names no ticket. Every other byte is preserved, including
   the module comments.
2. Library imports are rewritten from the package specifier to
   `../vendor/okforest.mjs`.

The vendor file is `@okforest/okf` 0.14.0 bundled with the pinned esbuild
0.27.7, both entry points in one ESM module, with a createRequire banner for
the CommonJS YAML dependency. Minification removes module-path comments that
would otherwise name the build host's node_modules layout.

The generated engine makes two deliberate changes:

- The bundle root defaults to the sibling `okf/` directory, derived from the
  CLI file's own URL. An installed copy therefore runs `list` with no path
  argument, which is the install gate's requirement.
- Usage errors (missing command, unknown command) exit 2, matching the
  unknown-concept exit code. Data and validation errors keep their own
  nonzero codes.

Both changes are covered by `tests/cli.test.mjs` and neither changes behavior
when `--root` is supplied.

## Distribution

`dist/skill.mjs` is one ESM entry bundled by esbuild 0.27.7 with no source
map, a createRequire banner, and minification. The vendor import is resolved
through a build-time plugin to the library's real entry points, so the library
is inlined once and the bundle carries a single require binding. The bundle
derives its default root from its own location, so an installed dist resolves
the sibling `okf/`.

`install.js` is copy-only. It copies `dist/skill.mjs`, `okf-core/`,
`scripts/`, `okf/`, `source/`, the runtime fixture, and the top-level
documents. It never builds, judges, or edits the target. The installed bytes
are compared with the staged bytes by the parity test.

## Determinism

- The build date is explicit (`2026-11-14`); the clock is not read during the
  build.
- Concept order, index order, lock order, and module order are sorted by path.
- `rebuild` regenerates `index.md` and `log.md` from the lock and the log
  ledger and prints a byte-identical verdict; an edited reserved file fails.
- The source set hash is `sha256(alias + ":" + content hash + "\n")`.

## Verification

The canonical verifier runs in dev mode against the staging tree and in
installed mode against a temporary install. Every dev and installed check must
report `machine_verified`; the closure hash is recorded in the build record.

The skill's own test matrix covers the engine modules, the CLI contract, the
real bundle's coverage and span partition, the installed parity, negative
paths, style, and performance. `node --test` runs explicit files only.

## Scope boundaries

- The bundle is a faithful view of one document at one hash. It is not a
  runtime certification of that document's labs.
- The source contains no cross-section Markdown links outside fenced code, so
  the concept graph has no body edges. Navigation still works through the
  directory indexes, sibling frontier, `x-requires`, and search. Adding
  invented links would break body fidelity.
- Redaction removes host-specific paths and identifiers. Lab-private addresses
  and fixed container names stay because they are normative constants of the
  handbook.
