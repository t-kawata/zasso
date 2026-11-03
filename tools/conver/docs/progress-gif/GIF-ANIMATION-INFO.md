# GIF Animation Information Model — Implementation-Space Density

Status: design input for an external design/implementation AI.
Implementation source of truth: `.claude/scripts/conver/draw-progress-gif.js` and
`.claude/scripts/conver/progress-gif/`.
Corrections and source-verified facts: see `docs/progress-gif/GIF-ANIMATION-INFO-SUPPLEMENT.md`.
Synthetic parser fixtures: see `docs/fixtures/gif-animation/`.
The density formula in this document is a `[PROPOSAL]`, not producer behaviour. The
implemented tool uses contract obligations for area and the reviewed-obligation ratio for
fill, and draws ticket growth at its recovered loop stage.
Audience: an AI that cannot read the conver source tree. Everything needed to discover the
data, compute the numbers, and render the animation is stated here.
Sample workspace used for every measured value below: `~/shyme/gaia` on 2026-11-03.
That workspace is **mid-flight in `/split-to-tickets`**: 29 packages exist, all 29 have a
completed graph and Dirs-Tree, 5 have `Tickets.json` and a completed split.

---

## 1. What is being animated

The conver pipeline turns one specification into an implementation through sixteen commands.
Each command deposits artifacts. The animation renders those deposits as a **space whose
density rises**: design facts first appear as a sparse scaffold, implementation work fills
the scaffold, verification removes dark inclusions, and the final commands add a surface.

The animation is a **snapshot of the process up to the moment the script runs**, not a live
dashboard. A run writes one GIF:

```text
<target>/progress-gif/YYYYMMDDhhmmss.gif
```

The only text allowed in the image is:

1. the date/time, formatted `MM/DD hh:mm` (the brief writes `hh:ss`; treat it as hour:minute
   unless `--time-format` is overridden), and
2. exactly one current stage name from the fixed list:

```text
educe  explain  grill  smooth  graphify  boundify  split  make
plan   start    review resolve consolidate find crystalize drill
```

No package names, counts, bars, axes, legends, icons, or titles. Everything else is visual.

Non-goals:

- real-time monitoring or a web dashboard;
- exact historical truth when the workspace contains only one snapshot (the timeline is a
  reconstruction, §8);
- replacing any conver command or writing outside `progress-gif/`;
- parsing every source file (implemented-file mass is optional and can be disabled).

---

## 2. CLI contract

```bash
node draw-progress-gif.js -t ~/shyme/gaia
# → creates ~/shyme/gaia/progress-gif/
# → writes ~/shyme/gaia/progress-gif/20261103133600.gif
```

Required behaviour:

| Item | Contract |
|---|---|
| `-t`, `--target` | Workspace root. `~` expanded by the shell; the script also expands a leading `~/`. |
| Output directory | `<target>/progress-gif/`, created if absent. |
| Output file | Local time `YYYYMMDDhhmmss.gif`. If that second already exists, advance one second and retry (max 10). Write to a temp file and `rename()` atomically. |
| Exit 0 | A GIF was written. Warnings may still be printed. |
| Exit 2 | Target is not a completed-conver workspace (see §3). |
| Exit 3 | Rendering/encoding failed. |
| Side effects | None outside `progress-gif/`. The workspace is read-only. |

Optional flags: `--out <dir>`, `--size <px>` (default 720), `--fps <n>` (default 15),
`--frames <n>` (default 180), `--seed <string>`, `--max-particles <n>` (default 6000),
`--from <ISO>`, `--to <ISO>`, `--no-git`, `--no-source-scan`, `--time-format <fmt>`,
`--json`, `--dry-run`.

Print a Markdown report to stdout (PASS, packages, stages, events, output path, warnings).
Use `--json` only when a machine consumer asks for it.

---

## 3. Workspace acceptance (PASS / FAIL)

`/workspacify-*` is assumed complete. The target must be the workspace root that directly
contains both manifests. Do not walk upward silently; if the root is wrong, say so.

### PASS conditions

1. `-t` is a readable directory.
2. `<target>/WORKSPACIFY-TREE-MANIFEST.json` and
   `<target>/WORKSPACIFY-ALLOCATE-MANIFEST.json` exist and parse as JSON.
3. `tree.artifact_kind === "workspacify-tree-manifest"` and
   `allocate.artifact_kind === "workspacify-allocate-manifest"`.
4. `tree.status === "COMPLETE"`.
5. `allocate.status === "COMPLETE"` and `allocate.completion_decision === "COMPLETE"`.
   If `allocate.semantic_review` exists, require `status === "APPROVED"`; if it is absent,
   accept with a warning (older manifests predate the field).
6. Chain check: `allocate.input_tree_manifest.hash === tree.integrity.manifest_hash`.
7. Spec check (when the file exists): `tree.input.source_hash` and
   `allocate.input_tree_manifest.spec.sha256` are identical.
8. `tree.workspace.packages` is a non-empty array. Its length should equal
   `allocate.allocation.package_count` and `allocate.seed_index.length`.

If a manifest is missing, the error must name the missing file and say:
`Run /workspacify-tree then /workspacify-allocate in this directory first.`
If both manifests exist in an ancestor but not here, name the ancestor as the likely root.

### What the manifests provide to the renderer

`WORKSPACIFY-TREE-MANIFEST.json`:

| Field | Meaning |
|---|---|
| `status` | `COMPLETE` when stage one finished. |
| `run.generated_at` | ISO timestamp of the tree stage. |
| `input.spec_path`, `input.source_lines`, `input.source_characters` | The source specification and its size (gaia: 15,972 lines by the tree manifest; educe records 15,971 — a trailing-newline difference). |
| `workspace.packages[]` | `{id, name, path, layer, kind, seed_required, owns, responsibilities}`. `path` is package-root-relative. |
| `structure.heading_count`, `structure.segments[]` | Source document structure. |
| `inventory.objects[]`, `terms[]`, `invariants[]`, `state_machines[]`, `error_codes[]`, `required_tests[]` | The extracted design universe. |
| `dependencies.dag.{node_count,edge_count,cycles,topological_order}` | Package graph. |
| `final_audit.status`, `gates.records[]` | Audit outcomes. |
| `integrity.manifest_hash` | Chain hash consumed by allocate. |

`WORKSPACIFY-ALLOCATE-MANIFEST.json`:

| Field | Meaning |
|---|---|
| `status`, `completion_decision`, `semantic_review.status` | Completion gates. |
| `run.workspace_root`, `run.planned_directory_count` | Run context. |
| `seed_index[]` | `{package, path, sha256}`; `path` ends in `RFC-SEED.md`. This is the authoritative package list. |
| `contract_registry[]` | `{contract_id, boundary_id, consumer_package, provider_package, connection_kind, owners, clauses, source_refs}`. |
| `implementation_order.{serial,levels}` | Package build order; levels are parallel groups. |
| `wig.counts.{node_count,edge_count,by_connection_kind,by_layer}` | Package graph summary. |
| `source_coverage.{segments_total,segments_covered,uncovered}` | Specification coverage. |
| `self_grill.{passes,converged,residual_count}` | Design self-review. |

Paths inside JSON may be `~/...`, absolute, or relative. Normalise all three against
`$HOME` / workspace root before touching the filesystem.

---

## 4. The model: packages, stages, atoms, density

### 4.1 Packages

A workspace has `N` packages (gaia: 29). The package list comes from, in order:

1. `allocate.seed_index[].path` → `dirname(path)` (authoritative, present before any
   package artifact exists);
2. `tree.workspace.packages[].path`;
3. fallback: every directory under the workspace containing `RFC.md`, excluding
   `node_modules`, `.git`, `target`, `archive`, and `*/archive/*`.

Merge by package id. Keep `path`, `name`, `layer`, and the build order from
`allocate.implementation_order`.

### 4.2 Stages

| idx | id | Scope | Completion artifact (canonical) |
|---|---|---|---|
| 0 | `educe` | root | `<spec-stem>-sequences.json` + `educe-sequences/status.json` |
| 1 | `explain` | package | `INFO-RFC-SEED.md` + `EXPLAIN-RFC-SEED.md` |
| 2 | `grill` | package | `RFC.md` + `DesignTree.json` + `Status.json` |
| 3 | `smooth` | root | `smooth-sequences/status.json` + `COMPLETION-CERTIFICATE.json` |
| 4 | `graphify` | package | `RFC-GRAPH.json` + `RFC-GRAPHIFY-Status.json` |
| 5 | `boundify` | package | `RFC-Dirs-Tree.json` + `RFC-BOUNDIFY-Status.json` |
| 6 | `split` | package | `Tickets.json` + `RFC-SPLIT-Status.json` |
| 7 | `make` | ticket | ticket `status >= made`, `specs/<key>.md`, `created_at` |
| 8 | `plan` | ticket | ticket `status >= planned`, `planTestCode`, `updated_at` |
| 9 | `start` | ticket | `startedAt`, `changes[]`, source implementation |
| 10 | `review` | ticket | `status === reviewed`, `completedAt` |
| 11 | `resolve` | package | source `[::STUB::]` count falls, `Malfeasance.json` statuses |
| 12 | `consolidate` | package | `manifests/CONSOLIDATED-MANIFEST-*.json` (transient) |
| 13 | `find` | package | `OMISSIONS-*.json`, tickets `remanded`/`foundOmissions` |
| 14 | `crystalize` | package | `README.md` + `CRYSTALIZE-Status.json` |
| 15 | `drill` | package | `drills/Status.json` + `drills/DesignTree.json` |

Stage label → command mapping:

```text
educe=/educe-sequences  explain=/explain-seed  grill=/grill-me-for-rfc
smooth=/smooth-sequences  graphify=/graphify-rfc  boundify=/boundify-graph
split=/split-to-tickets  make=/make-ticket  plan=/plan-ticket  start=/start-ticket
review=/review-ticket  resolve=/resolve-ticket  consolidate=/consolidate-stubs
find=/find-omissions  crystalize=/crystalize-readme  drill=/drill-rfc-down
```

Pipeline order is sequential **per scope**. A package at stage `s` has passed every earlier
stage even if an intermediate file was deleted. Root stages (0, 3) are global; apply their
result to all packages, but only advance a package past `smooth` when its own graph exists.

The user's requested label order is the 16 names above. One text label is shown at a time.

### 4.3 Atoms

An atom is one realised design or implementation unit:

| Atom type | Source | Visual role |
|---|---|---|
| `operation` | educe `demand.facts.counts.operations` | diffuse seed |
| `sequence` | educe `demand.facts.counts.sequences` | filament seed |
| `boundary` | allocate `contract_registry` / educe boundaries | ring/bridge |
| `section` | explain facts block sections E1–E7 | haze |
| `decision` | grill `DesignTree.nodes` | fixed point |
| `node` | graph `nodes[]` | scaffold vertex |
| `edge` | graph `edges[]` | scaffold filament |
| `contract` | graph edge `contracts[]` | bright filament |
| `directory` | Dirs-Tree directories | cell wall |
| `file` | Dirs-Tree files | facet |
| `ticket` | `Tickets.json` tickets | growing cell |
| `spec` | `specs/<key>.md` | inner leaf |
| `change` | ticket `changes[]` | luminous mass |
| `impl_file` | a `default_files[]` path that exists; mass from its line count | solidified mass |
| `stub` | source markers / ticket `stubs[]` / Malfeasance | dark knot |
| `omission` | OMISSIONS files / `foundOmissions` | crack |
| `readme_section` | README markers / Crystalize status | surface facet |
| `drill_question` | drills DesignTree | inward filament |

Every atom gets a stable id (`<packageId>:<stage>:<sourceKey>`), a mass, a birth time, a
declared stage, and a deterministic position (§9). Never use unseeded randomness.

### 4.4 Density

Let `E(p)` be the expected design mass of package `p`:

```text
E(p) = 1 + allocation_units(p)          # educe demand.assignmentDistribution[].count
                 + graph_nodes(p)         # once graph exists
                 + dirs_files(p)          # once Dirs-Tree exists
                 + tickets(p)             # once split exists
```

`allocation_units(p)` is the count in `educe-sequences/demand.json`
`coverage.assignmentDistribution[]` for the matching `packageId`; fall back to 1.

Let `R(p,t)` be the sum of masses of atoms with `birth <= t` (weights in §9.2). Define

```text
density(p,t) = log1p(R(p,t)) / log1p(E(p) + maxR)      # 0..1, clamped
```

and the **global density** as the mass-weighted mean over packages. A package's visual
radius shrinks and its particle count and luminance rise with `density`; this is the single
most important visual rule.

---

## 5. Discovery: how to find the right files accurately

### 5.1 Canonical names

A package may use the canonical names below or a stem-prefixed variant. Prefer canonical,
then the variant. Never read `.delta.json`, `.bak`, `.bak-*`, or `archive/` for current
state.

| Artifact | Canonical | Variant |
|---|---|---|
| RFC | `RFC.md` | `<stem>.md` (from graph `sourceFile`) |
| Seed | `RFC-SEED.md` | — |
| Info seed | `INFO-RFC-SEED.md` | — |
| Explanation | `EXPLAIN-RFC-SEED.md` | — |
| Graph | `RFC-GRAPH.json` | `<stem>-GRAPH.json` |
| Graph status | `RFC-GRAPHIFY-Status.json` | `<stem>-GRAPHIFY-Status.json` |
| Dirs-Tree | `RFC-Dirs-Tree.json` | `<stem>-Dirs-Tree.json` |
| Boundify status | `RFC-BOUNDIFY-Status.json` | `<stem>-BOUNDIFY-Status.json` |
| Tickets | `Tickets.json` | `<stem>-Tickets.json`; package-local only |
| Split status | `RFC-SPLIT-Status.json` | `<stem>-SPLIT-Status.json` |
| Step contracts | `RFC-STEP-CONTRACTS.json` | `<stem>-STEP-CONTRACTS.json` |
| Sequences view | `SEQUENCES.json` | — |
| Distribution digest | `SEQUENCES-DISTRIBUTIONS.json` | — |
| Obligations | `OBLIGATION.json` | — |
| Boundary contracts | `RFC-BOUNDARY-CONTRACTS.json` | — |
| Crystalize status | `CRYSTALIZE-Status.json` | — |
| Drill status | `drills/Status.json` | — |
| Consolidation | `manifests/CONSOLIDATED-MANIFEST-*.json` | — |
| Omissions | `OMISSIONS-<timestamp>.json`, `OMISSIONS-<NNN>.json`, `omissions/OMISSIONS-*.json` | `OMISSIONS-phasified-*.json` (post-merge) |

### 5.2 Selection rules

- **Graph/Dirs-Tree**: if several match, prefer the one whose JSON `sourceFile` resolves to
  this package's `RFC.md`; otherwise the newest `mtime`. A `.delta.json` is never a graph.
- **Status files**: status `generation` is the artifact generation; `runs` is invocations.
  An unchanged output digest is a verification, not a new generation. Show `generation`,
  not `runs`, as structural progress.
- **Root sequences**: choose the single root `*-sequences.json` whose
  `spec.sha256 === allocate.input_tree_manifest.spec.sha256`; if none match, refuse rather
  than mix specifications.
- **Tickets**: only package-local `Tickets.json`. A workspace-root `Tickets.json` may be a
  legacy aggregate (gaia has one with 38 reviewed tickets dated 2026-10-01); ignore it when
  package-local tickets exist. If several package-local files exist, choose the newest
  `metadata.generatedAt`, then `mtime`.
- **Generations**: `smooth-sequences/status.json.generation` identifies the live pair at
  the root; `archive/<N>/` is history. `educe-sequences/status.json.generation` identifies
  the live educe run; `educe-sequences/archive/*` is history. Use archives only for
  timeline reconstruction, never for current density.
- **Exclusions**: `node_modules/`, `.git/`, `target/`, `dist/`, `*.delta.json`, `*.bak*`,
  `*.p22-ja.bak`, `archive/` (current state), and the tool's own `progress-gif/`.

### 5.3 Decoys observed in real workspaces

Do not count any of these as current state:

| Decoy | Why |
|---|---|
| `*.delta.json` (e.g. `RFC-GRAPH.json.delta.json`) | incremental patch/delta, not a graph or Dirs-Tree |
| `*.bak`, `*.bak-*`, `*.p22-ja.bak` | backups; older content, often a different round |
| `archive/` (root, `educe-sequences/archive/`, `smooth-sequences/archive/<N>/`) | superseded generations; timeline-only |
| `regeneration/` | RFC regeneration candidates, not the measured design |
| `sim/`, `pods/`, `docs/archive/` | unrelated product/simulation material |
| root `Tickets.json` when package-local tickets exist | legacy aggregate (gaia: 38 reviewed, 2026-09-11) |
| root `SMOOTH-SEQUENCES.json/.md` | legacy pair; live pair is under `smooth-sequences/` |
| `<target>/progress-gif/` | the tool's own output; always exclude |

### 5.4 Discovery pseudocode

```js
const root = expandTilde(target);
assertDir(root);

const tree = readJson(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'));
const alloc = readJson(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'));
validateManifests(tree, alloc);                 // §3, exit 2 on failure

const packages = mergePackageLists(alloc, tree); // §4.1
const rootArtifacts = readRootStages(root, alloc);
for (const pkg of packages) {
  pkg.docs   = readExplainAndGrill(pkg.path);
  pkg.graph  = readGraphAndStatus(pkg.path);
  pkg.dirs   = readDirsTreeAndStatus(pkg.path);
  pkg.split  = readTicketsAndSplitStatus(pkg.path);
  pkg.build  = readTicketLifecycle(pkg.split.tickets);
  pkg.verify = readStubsCrimesOmissions(pkg.path, pkg.split.tickets);
  pkg.surface= readReadmeAndDrill(pkg.path);
}
const events = buildTimeline({ rootArtifacts, packages }); // §8
```

Fail soft per package: a malformed artifact is a warning, not a fatal error. Exit 2 only for
manifest acceptance failures.

---

## 6. Stage catalog

Each subsection is enough to parse the stage without source access. "Progress" means the
value used to drive the animation; "Mass" means the atom count/weight.

### 6.1 `educe` — sequence extraction (root)

Writes, beside the specification:

| Path | Format | Core shape |
|---|---|---|
| `<spec-stem>-sequences.json` | JSON | `schema_version`, `spec{path,sha256,lines}`, `supplied{digest}`, `pins`, `sequences[]`, `steps[]`, `operations[]`, `adjudications[]`, `sections[]`, `exemptions[]`, `verify`, `demand`, `groundedObjects[]`, `sequence_flow_grounds[]`, `migration`, `boundary_grounds[]` |
| `<spec-stem>-sequences.md` | Markdown | human view |
| `educe-sequences/status.json` | JSON | `spec{path,sha256,lines}`, `generation`, `entered`, `history[{generation,phases[{id,tag,status,verdict,loops}]}]`, `supplied`, `invalidated[]`, `assets{digest}`, `phases[18]`, `readings{predicate,row schema,enumerations,blocks,span,adversarial,reroute,adjudicate,inquest}`, `generationStartedAt` |
| `educe-sequences/demand.json` | JSON | `measuredAgainst{spec,path}`, `note`, `facts{candidateColumns[],boundaryCount,counts{operations,sequences,boundaries,surfaces}}`, `denominator{axis{axis,source,members,borrowed}}`, `coverage{verdict,unassigned[],refusedExemptions[],denominatorGaps[],assignmentDistribution[{packageId,count}]}` |
| `educe-sequences/declaration.json` | JSON | `predicate.limbs[]`, `rowSchema.fields[]`, `weakestLink{subject,why,tightenedBy}`, `enumerations[{name,members,closedness}]` |
| `educe-sequences/EVIDENCE-MANIFEST.json` | JSON | `schemaVersion`, `spec{path,sha256}`, `artifact{path,sha256}`, `generation`, `files[]`, `receipts[]`, `writeReceipts[]` |
| `educe-sequences/pins.json` | JSON | `sourceEnumerations[]`, `columns`, `requiredMeasuredColumns`, `consumerFields`, `predicate`, `rowSchema`, `enumerations`, `forms`, `sectionLevel`, `blocks` |
| `educe-sequences/rail-exits.jsonl` | JSONL | one rail exit per line |
| `educe-sequences/readings-<lens>.jsonl` | JSONL | `span`, `adversarial`, `reroute`, `adjudicate`, `inquest`, `uncovered`, `attack`, `effort`, `judgment` |
| `educe-sequences/supplied/*` | mixed | authored census/registry material |

Progress: `status.phases` done / 18; `readings.*.claims` for lens activity;
`demand.coverage.verdict === "holds"` and empty `unassigned`.
Mass: `demand.facts.counts` (gaia: 257 operations, 119 sequences, 84 boundaries,
6 surfaces) plus `artifact.sequences.length` (gaia: 553 records), `steps.length` (300),
`operations.length` (257), `sections.length` (292), `adjudications.length` (292).
Timestamps: `generationStartedAt` (ISO). Archive files have no embedded time; use mtime.
Pitfall: `sequences.length` (553) is not the semantic sequence count (119). Use
`demand.facts.counts` for denominators and record arrays for mass.

### 6.2 `explain` — per-package seed explanation

Writes only two files beside `RFC-SEED.md`: `INFO-RFC-SEED.md` (English facts, ten numbered
sections) and `EXPLAIN-RFC-SEED.md` (Japanese explanation, seven facts sections E1–E7). It also consumes `SEQUENCES.json`,
`SEQUENCES-DISTRIBUTIONS.json`, `OBLIGATION.json`, `RFC-BOUNDARY-CONTRACTS.json`.

`EXPLAIN-RFC-SEED.md` ends with a machine-readable block:

```html
<!-- explain-seed:facts
{"schema":"explain-seed-facts-v1","sections":{"E1":{"digest":"…","facts":[{"id":"I2","digest":"…"}]}, …}}
-->
```

Seven section keys E1–E7. Settled decisions appear as headings `### 先に決めた A<n> — …`.
The human section is `## 人間が決めること（ここだけ）`.
`RFC-BOUNDARY-CONTRACTS.json` is `{schemaVersion, boundaries:{<boundaryId>:{contractId,
clauseDigest, clauses:{...}}}, edges}`. Use `allocate.contract_registry` for counts; this
sidecar is for names and clause digests. A literal `[::MUST-FILL::]` in the
preamble is instructional text, not an unfilled marker; do not count it.

Progress: INFO exists 0.35 + EXPLAIN exists 0.35 + facts sections/7 × 0.2 + settled
heading count capped × 0.1. Completion: `RFC.md` **and** `DesignTree.json` exist (grill
begins only after explain passes). Do not rely on time: `Status.json.createdAt` is the
grill session's creation time and can predate the explanation's mtime after a re-sync.
Mass: fact count in the facts block (gaia foundation: 7 sections, facts per section),
`OBLIGATION.json.assignments.length`, `SEQUENCES.json` unit counts.
Timestamps: file mtime; no content timestamp. Use `Status.json.updatedAt` only as a
corroborating signal, never as the sole completion test.
Pitfall: do not treat the explanatory sentence containing `[::MUST-FILL::]` as a live
marker. Completion is not written into a status file.

### 6.3 `grill` — design interview (package)

Writes `RFC.md`, `DesignTree.json`, `CheckList.md`, `Status.json`.

`DesignTree.json`:

```json
{"version":1,"updatedAt":"2026-10-24T08:11:31.128Z",
 "nodes":[{"id":"identity","title":"…","status":"resolved",
           "questions":[{"resolvedAt":"2026-10-05T23:44:46.963Z","answer":"…","decision":"…"}],
           "children":[]}],
 "priorScan":{"scannedAt":"…","directories":["…"],"artifacts":["RFC-SEED.md","INFO-RFC-SEED.md","EXPLAIN-RFC-SEED.md","RFC.md"],"decisions":[…]},
 "questions":[]}
```

`Status.json` (grill session):

```json
{"state":"DONE","researchPath":"…/RFC-SEED.md","materialPaths":["…"],
 "rfcPath":"…/RFC.md","rfcDir":"…","reviewLoopCount":3,
 "createdAt":"2026-10-05T23:38:54.277Z","updatedAt":"2026-10-24T03:19:04.449Z",
 "completedAt":"2026-10-24T03:19:04.448Z","grillGeneration":3,
 "distributionGeneration":3,"distributionDigest":"…"}
```

Progress: resolved nodes / all nodes (gaia foundation: 54/54); checked boxes / all boxes in
`CheckList.md`; `state === "DONE"`; `reviewLoopCount` as iteration heat.
Mass: nodes (54), questions (59), RFC lines (4,391).
Timestamps: `DesignTree.updatedAt`, question `resolvedAt`, `Status.createdAt/updatedAt/
completedAt`.
Pitfall: `state` values seen: `DONE`; treat unknown non-empty states as in progress.

### 6.4 `smooth` — enumeration and contract gate (root)

Run directory `<root>/smooth-sequences/`:

| Path | Shape |
|---|---|
| `status.json` | `schemaVersion:2`, `generation`, `mode`, `measuredAt`, `inputDigest`, `reportDigest`, `findingKeysDigest`, `schemaHistory[]`, `calibrationDigest`, `verdict{exitCode,findings,blocked,withheld,readings}`, `remainingOpen`, `effortDebt`, `assuranceSchemaVersion` |
| `SMOOTH-SEQUENCES.json` | `schemaVersion:4`, `workspace`, `checks{families,run,blocked,skipped,failed,subChecks[]}`, `provenance`, `readings`, `instrument`, `denominator`, `evidencePolicy`, `verdict`, `wouldExit`, `downgrade`, `withheld`, `blocked[]`, `waived[]`, `findingsByClass`, `findings[]`, `certificate`, `calibration`, `remainingOpen`, `effortDebt` |
| `COMPLETION-CERTIFICATE.json` | `schemaVersion:3`, `assuranceSchemaVersion`, `status:"complete"`, `inputs{spec,artifact,evidenceManifest,exemptions}`, `obligations{total,closed,open,stuck,notApplicable}`, `receipts{open,stale,missingWrite}`, `proven{mechanical,claims}`, `judged{total,held,broken,unresolved,stuck}`, `readings{held}`, `assurance{…}`, `accepted`, `residue[]` |
| `CALIBRATION.json` | `schemaVersion`, `measuredAt`, `seeds[{checkId,seededDefect,applicable,detected,findings[]}]`, `digest` |
| `JUDGMENT-WORKLIST.json` | open judgment items |
| `archive/<N>/` | previous generation pair |
| `<root>/SMOOTH-VERDICT.json` | receipt: `schemaVersion`, `workspaceRoot`, `statusDigest`, `inputDigest`, `reportDigest`, `generation`, `artifactDigest`, `viewDigests`, `mapDigests`, `certificateStatus`, `verdictPass`, `checkedAt` |

Progress: `certificate.obligations.closed / total` (gaia: 6,660 / 6,660);
`status.verdict.findings === 0`; `remainingOpen === 0`; `verdict === "pass"`.
Mass: obligations total, judged held (1,928), readings held (4,419), exemptions (48).
Timestamps: `status.measuredAt`, `CALIBRATION.measuredAt`, verdict `checkedAt` (ISO).
Pitfall: legacy root `SMOOTH-SEQUENCES.json/.md` may exist; `smooth-sequences/` is the live
run directory. `archive/<N>/` is history, not current.

### 6.5 `graphify` — graph construction (package)

Writes `RFC-GRAPH.json`, `RFC-GRAPHIFY-Status.json`, `RFC-STEP-CONTRACTS.json`.

Graph schema (`additionalProperties:false`):

```json
{"sourceFile":"…/RFC.md","mainLanguage":"rust","contractChain":"obligation",
 "nodes":[{"id":"N0001","title":"…","kind":"architecture","summary":"…",
           "language":"rust","slug":"purpose_responsibility",
           "headingRefs":[{"refId":"REF160","heading":2,"texts":["1. 目的"]}],
           "unitIds":["op-IssueCertificate"]}],
 "edges":[{"from":"N0001","to":"N0007","type":"implements",
           "attributes":{"strength":"hard","bidirectional":false},
           "contracts":[{"id":"C001","precondition":"…","postcondition":"…","invariant":"…"}]}]}
```

`kind` enum: `requirement, api_contract, data_model, state_machine, architecture, security,
error_policy, config, test_policy, build_ci, rationale, glossary`.
`edge.type` enum: `depends_on, implements, refines, extends, conflicts_with, triggers,
constrains, supersedes, references, precedes, part_of, validates`.
Every edge carries ≥1 contract; every node has ≥1 edge.

Status:

```json
{"sourceFile":"…/RFC.md","graphFile":"…/RFC-GRAPH.json","currentStep":6,
 "steps":{"0":"done","1":"done","2":"done","3":"done","4":"done","5":"done"},
 "generation":2,"runs":4,"runId":"1793176756446023000-86368",
 "lastOutputDigest":"…","coverage":{"units":20,"steps":0,"boundaries":19}}
```

Steps 0–5: heading dedup, node split, edge assignment, machine verification,
self-verification, final quality. `currentStep:6` means all six are done.
Progress: done steps / 6; nodes/edges/contracts; `coverage.units`/`coverage.boundaries`.
Mass: `nodes.length`, `edges.length`, sum of `contracts.length`.
Timestamps: parse `runId` (§8.2); else mtime. The graph has no timestamp field.
Pitfall: a graph may be regenerated after boundify (gaia graph mtimes are newer than
Dirs-Tree). Stage order is guaranteed by status, not mtime.

### 6.6 `boundify` — directory and file tree (package)

Writes `RFC-Dirs-Tree.json`, `RFC-BOUNDIFY-Status.json`, and generated `src/**` files.

Dirs-Tree:

```json
{"schemaVersion":"…","generatedAt":"2026-07-28T12:42:11.975Z",
 "sourceGraph":"…/RFC-GRAPH.json","sourceFile":"…/RFC.md",
 "analysis":{"nodeCount":67,"edgeCount":68,"kindCounts":{…},"edgeTypeCounts":{…},"circularDependencies":[]},
 "trees":{"rust":{"name":"src","type":"directory","kind":"root","children":[
   {"name":"config","type":"directory","kind":"config","mappedNodeIds":[{"nodeId":"N0006","title":"…"}],"children":[]},
   {"name":"command_serialization.rs","type":"file","kind":"api_contract","mappedNodeIds":[…],"declarationStub":"pub trait Service {}"}]}},
 "dependencyDirections":{"rust":[{"from":"src/model","to":"src/api","rule":"…"}]},
 "warnings":[],"distribution":{…}}
```

Status: same schema as graphify, steps 0–3, `currentStep:4` = done, `coverage` present.
Progress: done steps / 4; directory count; file count; dependency edge count.
Mass: directories (gaia total 553), files (1,722), mapped nodes, dependency directions.
Timestamps: `generatedAt` (ISO); status `runId`; mtimes.
Pitfall: `mappedNodeIds` may repeat; count unique `nodeId`s for node coverage.

### 6.7 `split` — tickets and phases (package)

Writes `Tickets.json`, `RFC-SPLIT-Status.json`, `IMPLEMENTATION-ORDER.json`.

Split status:

```json
{"sourceFile":"…/RFC.md","graphFile":"…/RFC-GRAPH.json","currentStep":"6",
 "steps":{"1":"done","2":"done","3":"done","6":"done","0-1":"done","0-2":"done",
          "4-1":"done","4-2":"done","5-1":"done","5-2":"done","5-3":"done"},
 "generation":2,"runs":3,"runId":"1793600759191919000-94288",
 "lastOutputDigest":"…","coverage":{"units":42,"steps":0,"boundaries":40}}
```

`Tickets.json` root:

```json
{"title":"…","round":1,
 "metadata":{"source":"…/RFC.md","generatedAt":"2026-11-02",
             "analyzedSections":"…","resolvedPaths":{"rfcPath":"…","graphPath":"…","dirsTreePath":"…"}},
 "phases":[{"id":0,"name":"…","tickets":[{"id":1,"phaseId":0,"status":"todo",
   "title":"…","nodeIds":["N0001","ctr-boundary-001"],"contracts":[…],
   "invariants":"…","background":"…","scope":[…],"acceptanceCriteria":[…],
   "testUnit":[…],"testIntegration":[…],"testExceptions":[…],"default_files":[…],
   "distribution":{"units":[…]}, "prerequisites":"…"}]}]}
```

Ticket `status` enum: `todo, made, planned, done, reviewed, remanded`. Legacy data also
contains `R1`–`R4`; treat `R*` as a reviewed/round-complete state.
`IMPLEMENTATION-ORDER.json`: `schemaVersion`, `packageId`,
`buildOrder{serial[],levels[][]}`, `implementationOrder{serial,levels}`.

Progress: done split step keys / 11; `currentStep >= 6`; ticket count; node coverage =
unique `phases[].tickets[].nodeIds` / graph node ids; phase count.
Mass: tickets (gaia: 66 across 5 packages), phases, contracts, `nodeIds`.
Timestamps: `metadata.generatedAt` (date only), status `runId`, mtimes.
Pitfall: `phaseId` can be `-1` (PX / independent phase). The display key is derived:
`P${phaseId}-${id}`, and `PX-${id}` for `-1`; no `key` field is stored.

### 6.8 `make` — spec authoring (ticket)

Invoked per ticket. Sets `status:"made"`, `created_at`, `updated_at`, and writes
`specs/<ticketKey>.md`. Fills `contracts`, `invariants`, `background`, `scope`,
`acceptanceCriteria`, `testUnit/Integration/Exceptions`, `investigation`, `boyScoutPlan`,
`default_files` (machine-resolved), and distribution sections.

Progress: count tickets with `status` in `made|planned|done|reviewed` / total; spec file
exists; non-empty `contracts`.
Mass: spec files, contracts, acceptance criteria, test plan entries.
Timestamps: `created_at` (YYYY-MM-DD), `updated_at`, spec mtime.
Pitfall: `created_at` is set by `insert-field-template.js`; split-created tickets may lack
it until make runs. Do not infer make from `specs/` alone if the spec was re-exported later
by plan.

### 6.9 `plan` — plan authoring (ticket)

Sets `status:"planned"`, appends `planTestCode`, re-exports `specs/<key>.md`.

Progress: tickets `status >= planned` / total; `planTestCode` non-empty; spec mtime newer
than `created_at`.
Mass: planTestCode entries (each a test plan atom).
Timestamps: `updated_at` (date), spec mtime.
Pitfall: start-ticket does not change status; a started ticket remains `planned` until
`done`. Therefore `startedAt` is the only start signal.

### 6.10 `start` — implementation (ticket)

Records `startedAt`, implements code, appends `changes[]`, updates tests/instrumentation,
then sets `status:"done"`.

Progress: tickets with `startedAt` / tickets planned-or-later; `changes.length`; done count.
Mass: changes (each `{before,after,description}`), implemented files (a `default_files[]`
path that exists, weighted by `log10(lines+1)`), test entries.
Timestamps: `startedAt` (date), `updated_at`, source mtimes.
Pitfall: `changes` is the most reliable "implementation mass"; a large change array means
a large implementation even if status is still `planned`.

### 6.11 `review` — review gate (ticket)

Sets `status:"reviewed"`, `completedAt`, appends quality findings/changes. Boy Scout
checks, stub/crime scan, test verification.

Progress: reviewed / done+reviewed; `completedAt` present; changes count.
Mass: reviewed tickets, appended changes.
Timestamps: `completedAt` (date), `updated_at`.

### 6.12 `resolve` — batch stub and crime resolution (package)

Does **not** change ticket status. Removes resolved `[::STUB::]` markers, rewrites deferred
keys, records/resolves crimes.

`Malfeasance.json`:

```json
{"version":1,"records":[{"id":1,"file":"…/src/account.rs","line":4,
 "description":"// [::STUB::] P0-7: …","detected_at":"2026-08-03T05:12:35.947Z",
 "status":"resolved","note":"…"}]}
```

`status` values: `open`, `resolved`, `false_positive` (legacy `deferred` may appear).
Source marker form: `// [::STUB::] <ticketKey>: <reason> -- <resolve plan>`.

Progress: `1 - unresolvedMarkers / max(1, initialMarkers)`; unresolved = markers whose
key is not a completed ticket (or `MUST RESOLVE`), plus `open` crimes. Artifact-only proxy:
`tickets[].stubs` length is historical, not current; prefer a source scan
(`grep -R "\[::STUB::\]"` excluding `node_modules`, `.git`, `target`).
Mass: resolved crimes, removed markers.
Timestamps: `detected_at` (ISO), source mtimes.
Pitfall: `stubs[]` on a reviewed ticket does not mean the stub is unresolved; it records
what the ticket originally carried.

### 6.13 `consolidate` — merge stub slivers into units (package)

Writes transient `manifests/CONSOLIDATED-MANIFEST-<YYYYMMDDhhmmss>.json`:

```json
[{"sourceKey":"P4-2","stubs":[{"file":"src/call.rs","line":23,"content":"// [::STUB::] …"}]}]
```

Also writes `manifests/ROLLBACK-<ts>.json`, then strips `[::UNIT::<id>::]` tags.
`/find-omissions` consumes and deletes both on full success.

Progress: tagged markers → units; manifest exists = consolidation in progress;
no manifest + zero source stubs = complete; no manifest + stubs = not started or already
consumed (ambiguous).
Mass: units, markers grouped.
Timestamps: filename timestamp (local `YYYYMMDDhhmmss`), mtime.
Pitfall: absence is not failure. Treat the stage as complete when the stub scan is zero.

### 6.14 `find` — contract-to-test omission inspection (package)

Inspects every reviewed/remanded ticket, records omissions in
`omissions/OMISSIONS-<timestamp>.json` (or `OMISSIONS-<NNN>.json` at the package root;
both forms exist), then merges omission tickets back into `Tickets.json` via
`phasify-omissions.js`. `OMISSIONS-phasified-<timestamp>.json` is the post-merge view.

OMISSIONS file is Tickets-shaped: `title`, `metadata{source,generatedAt,analyzedSections}`,
`phases[].tickets[]` with the same ticket fields plus `foundOmissions`, `targetStubs`,
`targetCrimes`, `originalTicketKey`, `fromStub`.

Progress: inspected tickets / reviewed tickets (ticket `status:"remanded"` marks inspected);
omissions recorded; merged phases. `round` in `Tickets.json` increments per implementation
loop.
Mass: omission tickets, `foundOmissions` entries, new phases.
Timestamps: filename timestamp; ticket `updated_at`; file mtime.
Pitfall: multiple OMISSIONS files accumulate; latest is by filename timestamp, not mtime.
`OMISSIONS-phasified-*` is a derived view, not a separate finding set.

### 6.15 `crystalize` — user-facing README (package)

Writes `README.md`, `CRYSTALIZE-Status.json`, and `examples/`.

Status:

```json
{"sourceFile":"…/RFC-ROOT.md","graphFile":"…/RFC-ROOT-GRAPH.json","currentStep":4,
 "steps":{"0":"done","1":"done","2":"done","3":"done"},
 "grill":{"tocApproved":true,"examplesApproved":true,
          "toc":{"nodes":[{"id":"H1","heading":"…","level":1,
                           "confirmedContent":"…","status":"confirmed"}]}}}
```

README markers: `<::TEMPLATE-README::>`, `<::README-RESIDUE::>`,
`<::TEMPLATE-EXAMPLES::>`, `<::EXAMPLES-RESIDUE::>`.

Progress: done steps / 4; confirmed TOC nodes / all; `grill.sections[].state`
(`complete` vs residue); `tocApproved` and `examplesApproved`; count of unresolved template
markers when the README still carries them.
Mass: README sections, examples, resolved residues.
`grill.sections[]` entries are `{id, heading, state, confirmedContent}`; this is the most
reliable per-section progress signal after the markers are consumed.
Timestamps: status mtime, README mtime; no embedded time.
Pitfall: in refine mode the README is overwritten with a new skeleton; mtime reflects the
latest run, not first creation.

### 6.16 `drill` — reverse rotation / RFC evolution (package)

Session lives in `<rfcDir>/drills/`: `Status.json`, `DesignTree.json`, `CheckList.md`,
`baseline.json`, plus delta artifacts.

`Status.json`:

```json
{"state":"DONE","researchPath":"…/RFC-ROOT.md","rfcPath":"…/RFC-ROOT.md",
 "rfcDir":"…","reviewLoopCount":0,"createdAt":"2026-08-26T01:21:46.412Z",
 "updatedAt":"2026-08-28T01:49:19.998Z","currentStep":"1-12"}
```

Steps run `1-1` … `1-12`. DesignTree uses the same node/status shape as grill; questions
carry `resolvedAt`.

Progress: step index / 12 (parse the trailing number of `1-N`); resolved nodes / all;
`state === "DONE"`; loop count.
Mass: resolved questions, RFC delta lines, new material.
Timestamps: `createdAt`, `updatedAt`, question `resolvedAt`, baseline mtime.
Pitfall: drill is a rotation, not a one-way stage; a new drill can restart at `1-1` while
the package is already implemented. Use `state`/`currentStep`, not mere existence.

---

## 7. Cross-cutting artifact: `Tickets.json`

This is the single most important file after split. It drives stages 7–14.

### 7.1 Structure

```text
Tickets.json
  title, round, metadata{source,generatedAt,analyzedSections,resolvedPaths}
  policy?, dependencyMap?, distribution?, checklist?
  phases[{id,name,nodeIds?,summary?,tickets[]}]
```

Derived key: `phaseId === -1 → PX-${id}`, otherwise `P${phaseId}-${id}`.

### 7.2 Ticket fields used by the animation

| Field | Type | Animation use |
|---|---|---|
| `id`, `phaseId` | integer | stable id; phase grouping |
| `status` | string | lifecycle colour/ignition |
| `title` | string | stable hashing only |
| `nodeIds[]` | string[] | design coverage; scaffold binding |
| `contracts[]` | array | contract atoms; precondition/postcondition/invariant |
| `default_files[]` | string[] | file placement |
| `prerequisites` | string/array | build-order constraint |
| `created_at`, `updated_at` | `YYYY-MM-DD` | make/plan timing |
| `startedAt`, `completedAt` | `YYYY-MM-DD` | start/review timing |
| `changes[]` | `{before,after,description}` | implementation mass |
| `stubs[]` | `{file,line,content}` | historical stub burden |
| `foundOmissions[]` | array | omission burden |
| `fromStub`, `originalTicketKey` | string | omission lineage |
| `distribution.units[]` | array | unit/boundary atoms |
| `acceptanceCriteria[]`, `testUnit/Integration/Exceptions` | string[] | verification mass |
| `planTestCode[]` | string[] | plan mass |

### 7.3 Status semantics

```text
todo → made → planned → (startedAt recorded; status stays planned) → done → reviewed
reviewed → remanded            (find-omissions inspection)
remanded → new omission tickets (todo) → second implementation round
```

`R1`–`R4` are legacy round statuses; treat as reviewed for density and as active for
round counting. Missing `status` = `todo`.

---

## 8. Timeline reconstruction

The GIF shows a process; the data is a snapshot. Reconstruct events as follows.

### 8.1 Event sources and precedence

For each atom or stage transition, choose the first available time:

1. explicit ISO timestamp in JSON (`generatedAt`, `measuredAt`, `updatedAt`, `createdAt`,
   `completedAt`, `detected_at`, `generationStartedAt`, `resolvedAt`);
2. `runId` (see §8.2);
3. filename timestamp (`OMISSIONS-YYYYMMDDhhmmss`, `CONSOLIDATED-MANIFEST-YYYYMMDDhhmmss`);
4. git first-add/commit time (`git log --diff-filter=A --format=%aI --follow -- <file>`),
   unless `--no-git`;
5. file `mtime`.

Date-only fields (`created_at`, `updated_at`, `startedAt`, `completedAt`,
`metadata.generatedAt`) are
placed at 09:00 local, then spread by a stable order within the day (e.g. ticket index ×
3 minutes) so events do not coincide.

### 8.2 `runId` parsing

Observed forms:

- `1793600759191919000-94288` — epoch nanoseconds: take the first 10 digits as Unix seconds
  (`1793600759`), the next 3 as milliseconds.
- `<13-digit-ms>-<pid>` — `Date.now()` form.
- Anything else: ignore.

Validate the parsed date is within ±2 years of now; otherwise fall back.

### 8.3 Event ordering and stage monotonicity

Sort by time, then by stage index, then by package build order. When many files share one
commit/mtime (a clone or a version bump), treat them as one burst; the animation shows a
single condensation pulse rather than 100 simultaneous births.

Within one package, **stage time must be non-decreasing**: after computing each stage's
time, clamp `t_s = max(t_s, t_{s-1})`. This is mandatory. A graph file can be regenerated
after boundify (gaia's graph mtimes are newer than its Dirs-Tree), so mtime alone can put
graphify after boundify. The status `runId` is authoritative for graphify/boundify/split
and normally restores the true order; the clamp protects the timeline when it does not.

### 8.4 Warped animation time

Real history can be months of idle time. Build a monotone piecewise-linear map from real
time to animation time:

- Each event gets a nominal dwell `w = clamp(log1p(mass) , 0.2, 2.0)`.
- Give every stage a minimum of 8 frames and a maximum of 45.
- Distribute the remaining frames in proportion to `w`.
- Total frames default 180 (12 s at 15 fps).
- The date text always shows the real time of the event being depicted; the stage text
  shows the stage of the most recent event, held for at least 6 frames to avoid flicker.

If no usable timestamp exists beyond one value, fall back to a logical timeline: stage
order, then package build order, with the snapshot date repeated.

---

## 9. Density model (normative for the renderer)

### 9.1 Stage progress `π_s(p)`

| Stage | Formula |
|---|---|
| educe | done phases / 18 |
| explain | 0.35·`INFO` + 0.35·`EXPLAIN` + 0.2·(E-sections/7) + 0.1·min(settled/20,1) |
| grill | 0.6·(resolved nodes/total) + 0.3·(checked boxes/total) + 0.1·`state==="DONE"` |
| smooth | `obligations.closed/obligations.total`; if the certificate is absent, `1` when `status.verdict.findings === 0 && remainingOpen === 0`, else `1 - findings/max(1,findings+closed)` |
| graphify | done steps/6; artifact present counts as 0.25 minimum |
| boundify | done steps/4; artifact present counts as 0.25 minimum |
| split | done step keys/11; `currentStep>=6` ⇒ 1 |
| make | `count(status≥made)/tickets` |
| plan | `count(status≥planned)/tickets` |
| start | `count(startedAt)/count(status≥planned)` |
| review | `count(status==reviewed)/count(status≥done)` |
| resolve | `1 - unresolvedStubs/max(1,totalStubs)` |
| consolidate | 1 if no manifest and zero stubs; 0.5 if manifest exists; else 0 |
| find | `count(remanded)/count(reviewed+remanded)`; 0 if no reviewed tickets |
| crystalize | 0.5·(steps/4) + 0.3·(confirmed toc/total) + 0.2·(markers resolved/total) |
| drill | `stepIndex/12` from `currentStep`, capped by `state==="DONE"` |

`status≥X` means the lifecycle rank is at least X: `todo<made<planned<done<reviewed`;
`remanded` and `R*` rank at `reviewed`.

### 9.2 Atom mass

Suggested weights (tune after visual tests; keep them in one config object):

| Atom | Mass |
|---|---|
| operation, sequence, boundary, section | 1 |
| decision, node | 1 |
| edge | 0.8 |
| contract | 1.2 |
| directory | 0.6 |
| file | 0.9 |
| ticket | 1.5 |
| spec | 1.5 |
| change | 2.0 |
| implemented file | `clamp(log10(lines+1), 0.3, 3.0)` |
| accepted test plan entry | 0.5 |
| stub (unresolved) | −1.2 (dark mass) |
| omission (open) | −1.0 |
| resolved stub / closed omission | +0.8 at resolution time |
| README section / example | 1.0 |
| drill resolved question | 1.0 |

Negative mass is intentional: it creates visible voids. Clamp `R(p,t)` at 0.

### 9.3 Visual mapping

```text
particleCount(p) = 40 + 280 * density(p)
clusterRadius(p) = R0 * (0.6 + 0.4*expectedNorm(p)) * (1 - 0.55*density(p))
luminance(p)     = 0.20 + 0.80 * density(p)
filamentAlpha    = 0.08 + 0.35 * stageProgress
haze(p)          = density(p)^2
```

`expectedNorm(p) = E(p)/maxE`. Large packages start larger and dimmer; as they fill they
contract and brighten. That contraction is the primary "density rising" cue.

---

## 10. Visual design brief (for the design AI)

### 10.1 Concept: Condensation Lattice

A near-black volume holds 29 cells arranged by build order. Each cell begins as a faint
scaffold of design filaments. As the pipeline advances, luminous matter condenses inside
the scaffold, the cell contracts, and its light rises. Verification pulls dark inclusions
out. The final stages freeze a thin crystalline surface over the cell. The camera drifts
slowly; a wavefront of activity travels through the lattice. No labels except date and
stage.

This is abstract but not random: the geometry is derived from package order and artifact
counts, so the same workspace always produces the same structure.

### 10.2 Spatial layout

- `Y` axis = `allocate.implementation_order.levels` (level 0 at the bottom).
- Within a level, packages sit on a horizontal ring at Fibonacci angles
  (`θ_i = i * 2.399963`), radius proportional to `sqrt(expectedMass)`.
- Package `path`/id seeds a small deterministic offset (stable across runs).
- Camera: 3/4 perspective, 28–35° elevation, slow orbit ±6° over the loop, subtle dolly.
- Depth fog: far cells fade toward background; near cells receive slight bloom.
- No visible grid, floor, axes, or bounding boxes.

### 10.3 What density looks like

| Density | Appearance |
|---|---|
| 0.0–0.2 | sparse drifting points, faint hairline filaments, large radius |
| 0.2–0.4 | filaments connect, points cluster, a dim core forms |
| 0.4–0.6 | cluster contracts; additive glow; scaffold clearly visible |
| 0.6–0.8 | bright core; thick braided filaments; haze fills the cell |
| 0.8–1.0 | dense luminous body with a few dark inclusions; slow internal motion |

Dark inclusions are stubs/omissions; they must remain visible as negative space until
resolved, then close with a brief flash.

### 10.4 Stage and sub-stage encoding

Four acts. Colour is semantic, not decorative:

| Act | Stages | Palette | Motion regime |
|---|---|---|---|
| Design | educe, explain, grill, smooth | cold teal/blue `#4C8FB5 → #6FD3C7` | diffuse drift, slow swirl |
| Structure | graphify, boundify, split | violet `#7C6CF0 → #B49CFF` | filaments pull taut, cells partition |
| Build | make, plan, start, review | ember `#FF9E4F → #FF5C3A` | ignition, inward condensation |
| Verify/Surface | resolve, consolidate, find, crystalize, drill | gold/white `#F2D9A0 → #FFFFFF` | purification, faceting, reverse ripple |

Note: the fixed list has 5 stages in the last act; group `resolve/consolidate` as
"purify", `find` as "seal", `crystalize` as "surface", `drill` as "re-open". The stage
text still uses the exact 16 names.

Sub-stage encoding (no text):

| Stage | Visual parameter driven by sub-progress |
|---|---|
| educe | number of concurrent reading streams; `det` phases snap, `read` phases swirl |
| explain | three states: open points drift, bound points orbit, settled points lock |
| grill | unresolved tree nodes orbit; resolved nodes settle into the scaffold |
| smooth | a compression wave; findings appear as dark specks that vanish when closed |
| graphify | one stream per step; node kinds set facet shape; orphan nodes dim |
| boundify | lattice walls grow; files become facets; dependency edges become bridges |
| split | cells partition; each ticket is a seed that appears at its node binding |
| make | spec leaves unfold inside ticket cells |
| plan | test-plan filaments shoot from leaves |
| start | ember ignition; change mass adds brightness |
| review | white rim on completed cells; failed checks flicker (briefly) |
| resolve | dark knots shrink and pop; light fills the void |
| consolidate | nearby knots merge into one larger, darker inclusion |
| find | hairline cracks appear; repaired cracks seal with a flash |
| crystalize | a thin refractive shell/facets fade in on the outer surface |
| drill | an inward ripple; new dark seeds appear at the surface and sink |

### 10.5 Motion rules

- Birth: 0.4 s ease-out; particle travels from a deterministic offset to its target.
- Stage change: 0.8 s global pulse; hue and motion regime interpolate.
- Active stage: particles in that stage's band orbit slowly; completed bands settle.
- Stub resolution: shrink to zero over 0.5 s, then a 1-frame flash.
- Omission sealing: crack line closes over 0.6 s.
- No camera shake, no strobing, no rapid flashing (>3 Hz prohibited).
- Loop: first 6 frames fade from black; final 12 frames hold a slow breathing pulse;
  loop cut is clean. Total 180 frames at 15 fps.

### 10.6 Palette and type

- Background `#05070A`; fog `#0B1220`; haze additive.
- Design `#4C8FB5`/`#6FD3C7`; structure `#7C6CF0`/`#B49CFF`;
  build `#FF9E4F`/`#FF5C3A`; verify `#F2D9A0`/`#FFFFFF`.
- Negative signal `#FF2E4D` only for unresolved stubs; `#FF6A3D` only for open omissions.
- One typeface only; a geometric sans or monospace. Date left-bottom, stage center-bottom,
  both at ~70% white, letterspaced. No boxes, shadows, or logos.
- Keep total colour count low; a 128-colour GIF palette is sufficient.

### 10.7 Text rules

Exactly two strings per frame:

```text
11/03 13:36
split
```

No other text. If the stage is between commands, keep the nearest completed/active stage
label. Do not print counts, percentages, package names, or "loading".

### 10.8 Timeline and loop

- The date text advances monotonically; it may jump by days across idle periods.
- The stage text changes only when the event stream enters a new stage.
- If the workspace is current (now equals the last event), the final 1 s holds the current
  stage and shows the snapshot time.
- Do not animate backwards except for the final `drill` reverse ripple, which is a visual
  metaphor, not a time reversal.

### 10.9 Alternates (if the primary concept is rejected)

1. **Crystal growth**: each package is a mineral nodule; design stages build the seed
   lattice, implementation deposits translucent layers, verification removes inclusions,
   README/drill grow the outer facets. Same encoding table.
2. **Mycelial bloom**: filaments branch through a dark substrate; tickets are fruiting
   bodies; stubs are necrotic knots; review whitens the tips. Same data, organic idiom.
3. **Nebula collapse**: 29 gas clouds collapse into stars; edges are gravitational
   filaments; the stage is the colour temperature. Most abstract, least "implementation".

Do not choose dark mode by default for its own sake; the dark ground exists because the
subject is luminous density. A light "paper and ink" variant is acceptable only if the
density cue remains (ink pooling on paper).

---

## 11. Node.js implementation blueprint

### 11.1 Dependencies

Recommended (small, prebuilt, Node ≥22):

```bash
npm install @napi-rs/canvas gifenc
```

- `@napi-rs/canvas` — 2D canvas, text, compositing, no system libraries.
- `gifenc` — palette quantization + GIF89a encoding, streaming-friendly, ESM.

Fallback if native modules are forbidden: a pure-JS RGBA framebuffer plus a small LZW GIF
writer. Keep the renderer behind an interface so the encoder can be swapped.

Do not use ImageMagick, ffmpeg, or a headless browser; they add environment dependencies
and make byte-determinism harder.

Adding either dependency is a **Never-Tiny** change under the project's Plan Gate. Create a
ticket (`/make-ticket` pipeline) before editing `package.json`; this document is design
input, not authorization to add dependencies.

### 11.2 Module layout

```text
tools/conver/.claude/scripts/progress-gif/
  draw-progress-gif.js       # CLI, orchestration, atomic write (ESM; package type=module)
  lib/workspace.mjs          # §3 validation, path normalisation
  lib/discover.mjs           # §5 package/artifact discovery
  lib/read-educe.mjs         # §6.1
  lib/read-package.mjs       # §6.2–6.7
  lib/read-tickets.mjs       # §6.8–6.14
  lib/read-surface.mjs       # §6.15–6.16
  lib/timeline.mjs           # §8 events + warping
  lib/density.mjs            # §9 formulas
  lib/scene.mjs              # atoms, positions, camera
  lib/render.mjs             # §10 drawing
  lib/palette.mjs
  lib/rng.mjs                # deterministic PRNG + stable hash
  lib/gif.mjs                # gifenc wrapper
```

The entry file must be `draw-progress-gif.js` to match the requested invocation. The
package is `"type": "module"`, so `.js` files are ESM; `.mjs` is also acceptable for
libs. No TypeScript. Keep each file <300 lines.

### 11.3 Pipeline

```js
const opts = parseArgs(process.argv);
const root = normaliseTarget(opts.target);
const ws   = validateWorkspace(root);          // exit 2 on failure
const pkgs = discoverPackages(ws);
const model= readAllStages(ws, pkgs);          // warnings, never throw per package
const ev   = buildTimeline(model, opts);       // §8
const scene= buildAtoms(model, ev);            // stable ids + masses
const enc  = createGifEncoder(opts);           // shared palette
for (let f = 0; f < opts.frames; f++) {
  const t = frameTime(f, opts.frames, ev);     // warped
  const state = evaluate(scene, t);            // births, progress, stage
  const canvas = renderFrame(state, opts, palette); // §10
  enc.addFrame(canvas);
}
enc.finish(atomicOutputPath(root, opts));      // temp + rename
```

### 11.4 Determinism

- Seed a PRNG with `sha256(opts.seed ?? root)`.
- Derive every atom position from `hash64(atom.id)` — never `Math.random()`.
- Sort atoms by `(stage, packageBuildOrder, id)` before drawing.
- Fix the palette quantization input order and the frame count.
- Same workspace + same flags ⇒ byte-identical GIF. Add a test that hashes two runs.
- Ignore file mtimes when `--from/--to` are supplied; otherwise they are part of the input,
  so a re-clone may legitimately change the animation.

### 11.5 Performance and encoding

- 720×720, 180 frames, ≤6,000 particles: a few seconds to tens of seconds on a laptop.
- Encode frame-by-frame; do not retain all RGBA buffers. A single 720² RGBA frame is ~2 MB.
- Quantize with 128 colours; sample 12–16 key frames to build one global palette, then
  apply it to every frame. This avoids palette flicker and reduces file size.
- GIF delay is centiseconds: 15 fps → 7 cs (~14.3 fps). Use 20 fps (5 cs) if exactness
  matters; 12.5 fps (8 cs) is also clean.
- Target file size: 2–8 MB for 12 s at 720². If larger, reduce particles, not frames.
- Draw order: haze → far filaments → far atoms → near filaments → near atoms → text.
- Bloom: draw each bright sprite at 3 scales with decreasing alpha; no expensive blur pass.
- Text: render with canvas `fillText`; keep the two strings cached as sprites per frame
  only when the value changes.

### 11.6 Reading large files

- The manifests are large (gaia tree: 8.6 MB; Tickets: 0.6–6.8 MB; sequences: 8.3 MB).
  `JSON.parse` is acceptable. Read each file once; cache by real path.
- Cap OMISSIONS parsing: read `metadata` and `phases[].tickets[]` only; do not retain prose.
- Never `require()` a workspace JSON; always `JSON.parse(fs.readFileSync(...))`.
- Treat all workspace data as untrusted input: no `eval`, no shell interpolation, no
  executing scripts found in the workspace.

---

## 12. Error handling and edge cases

| Case | Behaviour |
|---|---|
| Missing manifest | exit 2 with the missing filename and the fix command |
| Manifest present but incomplete | exit 2 naming `status`, `completion_decision`, or `semantic_review` |
| Hash chain mismatch | exit 2 naming both hashes |
| Spec file missing/unreadable | warn; still render if manifests pass |
| No educe artifact | stage 0 at 0; render an empty field with the snapshot date |
| Package has graph but no dirs | package stops at graphify; do not invent files |
| Package has tickets but no split status | infer split complete from `Tickets.json`; warn |
| Ticket status unknown (`R2`, etc.) | rank as reviewed; count as active round |
| Multiple generations | use the live one; archives only for timeline |
| Duplicate `Tickets.json` | prefer package-local; warn about the ignored file |
| Malformed JSON | skip that artifact with a warning; never abort the whole run |
| No timestamps at all | logical timeline (stage order, then build order) |
| Output exists in the same second | advance one second, retry up to 10 |
| `progress-gif/` is inside the scanned tree | always exclude it |
| Windows path separators | normalise to `/` before hashing and matching |

Warnings are collected and printed in the final Markdown report. Exit 0 if a GIF was
written, even with warnings.

---

## 13. Test plan (TDD, mandatory order)

Write these tests first; each must fail for absence of implementation.

### Unit

1. `expandTilde` and path normalisation (`~/`, absolute, relative).
2. Manifest acceptance: PASS fixture; each FAIL condition (missing, wrong kind, status,
   hash mismatch, zero packages).
3. Package discovery: seed_index authoritative; fallback to packages; fallback to `RFC.md`
   scan; exclusions (`archive`, `.delta.json`, `.bak`).
4. Root sequences selection by `spec.sha256`; refusal on ambiguity.
5. Status parsing: steps/runs/generation; `currentStep` semantics; unknown states.
6. `runId` parsing for ns, ms, and invalid forms; ±2-year guard.
7. Ticket key derivation (`P0-1`, `PX-1`); lifecycle ranks; `R*`/`remanded` mapping.
8. Ticket statistics: per-status counts, startedAt/reviewed ratios, node coverage.
9. Stub scan count and unresolved classification (completed-key vs active-key vs orphan).
10. Omission file selection: timestamp vs 3-digit vs phasified; latest precedence.
11. Timeline: event precedence, date-only spreading, burst collapsing, warping monotonicity.
12. Density: `π_s` for each stage, negative mass, clamping, normalization.
13. Determinism: same inputs ⇒ same scene hash and same GIF hash.

### Integration

1. Minimal workspace (manifests + one package seed) → valid GIF, expected filename.
2. Mid-flight workspace with 3 packages at different stages → stage label = latest event;
   three visually distinct densities.
3. Workspace with legacy root `Tickets.json` + package-local tickets → root ignored.
4. Workspace with `.delta.json`, `.bak`, `archive/` decoys → none counted.
5. Corrupted JSON in one artifact → warning, GIF still written.
6. Same-second double run → two distinct files.

### Visual / acceptance

- No text other than date and stage (OCR or pixel-region assertion is acceptable).
- Active stage's colour is correct per the act table.
- A package at `boundify` is visibly denser than the same package at `explain`.
- A 29-package workspace shows 29 distinct clusters, none merged or off-canvas.
- GIF header is `GIF89a`; loop count is infinite; dimensions and frame count match flags.
- Runtime on gaia < 120 s on a 2020-class laptop; file size < 12 MB.

---

## 14. Acceptance criteria for the script

1. `node draw-progress-gif.js -t ~/shyme/gaia` exits 0 and writes
   `~/shyme/gaia/progress-gif/YYYYMMDDhhmmss.gif`.
2. The target is validated as a completed workspacify workspace; failures exit 2 with the
   exact cause and remedy.
3. All 16 stage names are reachable; the label is always one of the fixed 16.
4. Only date and stage are rendered as text.
5. Density rises visibly as artifacts accumulate; sub-stage work is visible through motion
   and composition, not text.
6. The workspace is not modified.
7. Deterministic output for identical inputs and seed.
8. The script reads only the artifact paths documented here; no source-code parsing is
   required for the model (source scans are allowed only for stub counts and may be
   omitted when `--no-source-scan` is set).
9. Missing later-stage artifacts degrade gracefully; the animation still runs.
10. A `--dry-run` prints the discovered packages, stages, event count, and output path
    without writing a GIF.

---

## 15. Appendix A — measured gaia snapshot (2026-11-03)

Workspace root:

| Metric | Value |
|---|---|
| Specification | `GaiaSekkeiShiyousho_v32.md` |
| Source lines / bytes | 15,971 (educe) / 15,972 (tree) / 1,069,729 bytes |
| Packages | 29 |
| Package with completed graph + Dirs-Tree | 29 |
| Packages with `Tickets.json` + split status | 5 (`gaia-foundation`, `gaia-network`, `gaia-ports`, `gaia-invariants`, `gaia-soul`) |
| Tickets in those 5 | 66 (12, 15, 11, 12, 16) |
| Graph nodes / edges (sum) | 2,700 / 4,364 |
| Dirs-Tree directories / files (sum) | 553 / 1,722 |
| Implementation levels | 11 |

Educe/smooth:

| Metric | Value |
|---|---|
| Educe generation | 17 |
| Operations / sequences / boundaries / surfaces | 257 / 119 / 84 / 6 |
| Sequence artifact records / steps / sections | 553 / 300 / 292 |
| Educe phases done | 18 |
| Adversarial readings | 543 |
| Inquest readings | 3,768 |
| Smooth generation | 138 |
| Smooth obligations closed / total | 6,660 / 6,660 |
| Judged held | 1,928 |
| Readings held | 4,419 |
| Exemptions | 48 |
| Smooth verdict | pass |

Per-package examples:

| Package | Nodes | Edges | Dirs | Files | Tickets |
|---|---|---|---|---|---|
| `crates/foundation/gaia-foundation` | 73 | 122 | 21 | 53 | 12 |
| `crates/protocol/gaia-soul` | 121 | 191 | 9 | 84 | 16 |
| `crates/protocol/gaia-invariants` | 102 | 116 | 8 | 33 | 12 |
| `crates/network/gaia-network` | 106 | 171 | 27 | 73 | 15 |
| `crates/ports/gaia-ports` | 65 | 71 | 10 | 38 | 11 |
| `crates/protocol/gaia-asset` | 137 | 230 | 18 | 97 | 0 |
| `crates/interfaces/gaia-cli` | 45 | 46 | 11 | 28 | 0 |

Root legacy artifact to ignore: `Tickets.json` at the workspace root, 38 reviewed tickets,
`metadata.generatedAt: 2026-09-11`, 5 phases. It predates the per-package split.

What the animation should look like for this snapshot:

- 29 cells, all with a visible design scaffold (graph + Dirs-Tree), arranged in 11 build
  levels.
- 5 cells additionally show ticket cells and the split surface: foundation, network,
  ports, invariants, soul.
- All 66 tickets are `todo`; there is no ember ignition yet. The split cells are brighter
  and more articulated, but not warm.
- The current stage label is `split`; the date label is the snapshot time.
- No README or drill surface exists in this workspace, so the gold/white act is absent.

---

## 16. Appendix B — field quick reference

```text
Workspace
  WORKSPACIFY-TREE-MANIFEST.json
    status, run.generated_at, input.{spec_path,source_lines},
    workspace.packages[], dependencies.dag.{node_count,edge_count,levels},
    integrity.manifest_hash
  WORKSPACIFY-ALLOCATE-MANIFEST.json
    status, completion_decision, semantic_review.status,
    seed_index[], contract_registry[], implementation_order.{serial,levels},
    input_tree_manifest.{path,hash,spec.{path,sha256}}

Root stages
  <spec-stem>-sequences.json
    spec{path,sha256,lines}, sequences[], steps[], operations[], sections[]
  educe-sequences/status.json
    generation, phases[18], readings{}, generationStartedAt
  educe-sequences/demand.json
    facts.counts{operations,sequences,boundaries,surfaces},
    coverage.assignmentDistribution[{packageId,count}]
  smooth-sequences/status.json
    generation, measuredAt, verdict{exitCode,findings,blocked,readings}, remainingOpen
  smooth-sequences/COMPLETION-CERTIFICATE.json
    status, obligations{total,closed,open}, judged{total,held}, readings{held}

Package docs
  RFC-SEED.md, INFO-RFC-SEED.md, EXPLAIN-RFC-SEED.md
  EXPLAIN-RFC-SEED.md → <!-- explain-seed:facts {"schema":"explain-seed-facts-v1",...} -->
  OBLIGATION.json → {version,serves[],assignments[{unit,ground}],adjudications[]}
  SEQUENCES.json → {packageId,ownedOperationUnits[],ownedSequenceUnits[],...}
  SEQUENCES-DISTRIBUTIONS.json → {schemaVersion,distributions,digest}

Package grill
  RFC.md, DesignTree.json, CheckList.md, Status.json
  DesignTree.json → {version,updatedAt,nodes[{id,title,status,questions[],children[]}],priorScan,questions}
  Status.json → {state,createdAt,updatedAt,completedAt,reviewLoopCount,grillGeneration,distributionGeneration}

Package structure
  RFC-GRAPH.json → {sourceFile,mainLanguage,contractChain,nodes[],edges[]}
  RFC-GRAPHIFY-Status.json → {currentStep,steps{},generation,runs,runId,coverage{units,steps,boundaries}}
  RFC-STEP-CONTRACTS.json → {schemaVersion,sourceViewDigest,edges{},steps[]}
  RFC-Dirs-Tree.json → {schemaVersion,generatedAt,analysis,trees{},dependencyDirections{},warnings[]}
  RFC-BOUNDIFY-Status.json → same status shape, currentStep 4

Package tickets
  Tickets.json → {title,round,metadata{source,generatedAt,resolvedPaths},phases[]}
  RFC-SPLIT-Status.json → {currentStep,steps{},generation,runs,runId,coverage}
  IMPLEMENTATION-ORDER.json → {schemaVersion,packageId,buildOrder{serial,levels},implementationOrder}

Package verification
  Malfeasance.json → {version,records[{id,file,line,description,detected_at,status,note}]}
  manifests/CONSOLIDATED-MANIFEST-*.json → [{sourceKey,stubs[{file,line,content}]}]
  OMISSIONS-*.json / omissions/OMISSIONS-*.json → Tickets-shaped omission set
  README.md, CRYSTALIZE-Status.json → {currentStep,steps{},grill{tocApproved,examplesApproved,toc}}
  drills/{Status,DesignTree,CheckList,baseline}.json
```

---

## 17. Appendix C — copy-paste discovery snippets

```js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const expand = (p) => p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
const readJson = (p) => JSON.parse(fs.readFileSync(expand(p), 'utf8'));

function packageDirs(root, tree, alloc) {
  const fromSeeds = (alloc.seed_index ?? [])
    .map(s => path.dirname(expand(s.path)))
    .filter(Boolean);
  const fromTree = (tree.workspace?.packages ?? [])
    .map(p => path.resolve(root, p.path));
  const merged = [...new Set([...fromSeeds, ...fromTree])];
  if (merged.length) return merged;
  return walk(root).filter(d => fs.existsSync(path.join(d, 'RFC.md')));
}

function newestMatching(dir, re, exclude = /\.(delta|bak)\b|archive\//) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir)
    .filter(n => re.test(n) && !exclude.test(n))
    .map(n => path.join(dir, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
}

function runIdToDate(runId) {
  if (typeof runId !== 'string') return null;
  const [head] = runId.split('-');
  if (/^\d{19,}$/.test(head)) return new Date(Number(head.slice(0, 13)));
  if (/^\d{13}$/.test(head)) return new Date(Number(head));
  return null;
}
```

```bash
# Stub scan — the authoritative unresolved-stub signal (artifact proxies are unreliable).
grep -R --line-number --fixed-strings '[::STUB::]' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=target \
  --exclude-dir=archive --exclude-dir=progress-gif . | head -200
```

---

## 18. Appendix D — glossary

| Term | Meaning |
|---|---|
| **Atom** | One realised design/implementation unit, the particle of the animation. |
| **Density** | Realised mass relative to expected mass, normalised per package and across the workspace. |
| **Cell** | The spatial region belonging to one package. |
| **Stage** | One of the 16 commands in the fixed label list. |
| **Sub-stage** | Internal progress of a stage (steps, statuses, counts) encoded visually, never as text. |
| **Scaffold** | Design-stage filaments (nodes/edges/contracts) that later matter fills. |
| **Inclusion** | A dark knot or crack: unresolved stub or omission. |
| **Surface** | README/drill artifacts rendered as facets/shell. |
| **Snapshot** | The GIF written by one invocation, covering history up to now. |
| **Verification** | An unchanged output digest; it advances no generation. |

---

### Final instruction to the external AI

Do not infer data from the visual metaphor. Read the artifact paths above, apply the
selection rules in §5, and compute the model in §9. The visual brief in §10 is deliberately
abstract; the numbers behind it are exact. If a field is absent, use the documented
fallback and emit a warning; never invent a count, a ticket, or a stage completion.
