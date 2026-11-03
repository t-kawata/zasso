# GIF Animation — Fact Supplement

Status: answer to the external review of `docs/progress-gif/GIF-ANIMATION-INFO.md`.
Implementation source of truth: `.claude/scripts/conver/draw-progress-gif.js` and
`.claude/scripts/conver/progress-gif/`.
This document records **facts**, not new visual design. It deliberately separates what the
conver source guarantees, what a real workspace shows, what is only inference, and what
cannot be determined from artifacts. The implemented renderer uses the verified schemas
below; the sample under `docs/progress-gif/samples/` remains a prototype.

Classification used on every claim:

| Tag | Meaning |
|---|---|
| `[SPEC]` | Guaranteed by a producer, validator, schema, or command contract in the current source. |
| `[OBSERVED]` | Seen in real data (`~/shyme/gaia`, `~/shyme/zasso/crates/siprs`) but not guaranteed by source. |
| `[INFERRED]` | A reasonable consequence of the code/data; not asserted anywhere. |
| `[UNKNOWN]` | Not determinable from existing artifacts; do not guess. |
| `[PROPOSAL]` | From the GIF design discussion; no source support. |

Evidence convention: `path:line` points to the producer/validator. The rule is also stated
in prose and with a minimal example, because the reader cannot open the source. Line
references are to the repository state on 2026-11-03; if a line has drifted, find the named
function or constant rather than trusting the number alone.

Where this supplement conflicts with `docs/GIF-ANIMATION-INFO.md`, **this supplement wins**;
the first document remains the visual/design brief and the data catalog, and its Appendix
lists the corrections.

---

## 0. Corrections to the first document (read this first)

The review questioned several heuristics in `GIF-ANIMATION-INFO.md`. These are the
authoritative corrections:

| Claim in the first document | Correct fact | Tag |
|---|---|---|
| Package list = `seed_index` 1:1 with `tree.workspace.packages` | `seed_index` contains only packages with `seed_required !== false`; it may be shorter than the package catalog. Join by `tree.id === seed_index.package`. | `[SPEC]` |
| Root-level `Tickets.json` is always legacy when package-local tickets exist | A root package is legitimate when a package path is `.` (tree) and its seed path resolves to `./RFC-SEED.md` (allocate). A root `Tickets.json` is legitimate only when that package is declared; otherwise it is unbound/legacy. | `[SPEC]` |
| Root `*-sequences.json` chosen by matching `spec.sha256` | The pipeline requires **exactly one** root `*-sequences.json`; zero is `NO_ARTIFACT`, two is `AMBIGUOUS_ARTIFACT`. There is no hash-based pick. | `[SPEC]` |
| `RFC.md` + `DesignTree.json` ⇒ explain complete | This is a heuristic. Explain completion is `run.mjs answers` exit 0 and is not persisted. | `[UNKNOWN]` + heuristic |
| `Tickets.json` exists ⇒ split complete | Split writes `Tickets.json` before step `6`. Completion requires the split step `6` to be `done` and (when a runId exists) the generation to be recorded. | `[SPEC]` |
| Zero stubs ⇒ consolidate complete | Zero stubs is also the state of a workspace that never needed consolidation and of one whose manifest was consumed. Absence alone cannot distinguish. | `[UNKNOWN]` |
| `remanded` ratio = find inspection ratio | Only tickets with a found gap become `remanded`; tickets that passed remain `reviewed` and the queue file is deleted. The ratio is a lower bound, not an inspection ratio. | `[SPEC]` |
| `R<N>` and `remanded` rank as `reviewed` | `R<N>` is a past-round completion marker (treated as completed by the phase display); `remanded` is an active rework state and is **not** reviewed-equivalent. | `[SPEC]` |
| Smooth pass = findings + remainingOpen zero | A pass requires `exitCode 0`, `findings 0`, `blocked 0`, `readings 0`, `withheld 0`; the certificate and input digest also bind the result. | `[SPEC]` |
| Certificate is always required | A legacy pass is allowed when the certificate is absent **and** no evidence manifest exists; `legacy: true` is recorded. If the evidence manifest exists and the certificate is missing, it is incomplete. | `[SPEC]` |
| Density formula `E(p)`, `maxR`, weights | None of these symbols exist in the repository. The whole density model is `[PROPOSAL]`. | `[SPEC]` (absence) |
| `changes[]` is a reliable change set | It is AI-written prose, appended with `Array.concat`, with no id/path/date and no dedup. Re-running start appends duplicates. | `[SPEC]` |
| A generated file's presence means implemented | Boundify writes a provenance header, a kind-specific boilerplate stub, and `// [::STUB::] MUST implement NODE_ID=…` lines. Presence and line count are not proof; even the generated marker fails the strict stub grammar. | `[SPEC]` + `[OBSERVED]` |

---

## 1. What history can and cannot be reconstructed

### 1.1 The general rule

A stage's persisted state is usually a **current snapshot**, not a log. The only durable
histories are:

- educe: `status.json.history[]` (inline, per superseded generation);
- smooth: `smooth-sequences/archive/<N>/` (superseded report pairs);
- regeneration: `regeneration/archive/<transactionId>/` (pre-commit file copies);
- Malfeasance: an append-only record list (crimes, not command runs);
- Tickets: appended `changes[]` / `foundOmissions[]` / `stubs[]`, but with no timestamps or ids;
- drill/grill: a single session directory whose files are overwritten; `DesignTree.questions[].resolvedAt` is a per-question timestamp.

Everything else keeps counters and the latest value. A stage's `runId` is per invocation
and is **not** shared across stages.

### 1.2 Stage-by-stage table

Legend: "unit" = smallest recoverable unit; "history" = prior generations preserved.

| Stage | Records start/progress/end/re-run | Overwrite or append | History preserved | Time meanings | Re-run key | Unit | Undeterminable |
|---|---|---|---|---|---|---|---|
| `educe` | `educe-sequences/status.json`: `generation`, `entered`, `history[]`, `generationStartedAt`, `phases[18]` (`open/done/refused`, `loops`), `readings`; `EVIDENCE-MANIFEST.json` receipts per phase | Current fields overwritten; superseded generation appended to `history[]` | **Yes, inline** `history[]`; archive files under `educe-sequences/archive/` are partial, not a complete generation | `generationStartedAt` = opening instant of the current generation; no per-phase timestamp; `history[]` entries have no time | `generation`; `history[].generation` | Generation, then phase | Per-phase wall-clock time; exact start of superseded generations |
| `explain` | `INFO-RFC-SEED.md`, `EXPLAIN-RFC-SEED.md`, facts digest block, `<!-- explain-seed:facts ... -->`, E5/E6 items | Documents maintained/overwritten; sections kept or reopened by digest | **No run log.** Prior document revisions are not kept | No timestamp in either document; mtime only | None | Section/fact; ledger is derived, not stored | Open/bound/settled counts without reimplementing the ledger; run count; completion time |
| `grill` | `Status.json`: `state` (`GRILLING…DONE`), `createdAt`, `updatedAt`, `completedAt`, `completedSessions`, `grillGeneration`, `reviewLoopCount`; `DesignTree.json`: nodes `open/resolved`, `questions[].resolvedAt`; `CheckList.md` | `Status.json` overwritten; `completedAt` overwritten on each new completion; `completedSessions` increments only on transition into DONE; `grillGeneration` increments per run; DesignTree nodes/questions accumulate | **Partial:** current tree accumulates answered questions; no per-generation tree archive | `createdAt` = session creation; `updatedAt` = last write; `completedAt` = latest completion (not first); question `resolvedAt` = per-question | `grillGeneration`; `completedSessions` | Question/node; session as a whole | Time of first completion; per-run tree state; exact run boundaries |
| `smooth` | `smooth-sequences/status.json`: `generation`, `measuredAt`, `inputDigest`, `reportDigest`, `verdict`; `COMPLETION-CERTIFICATE.json`; `CALIBRATION.json.measuredAt`; `SMOOTH-VERDICT.json` receipt `checkedAt` | Current files overwritten; superseded pair moved to `archive/<previousGeneration>/` | **Yes** for the report pair; status history only via `generation` + archive | `measuredAt` = measurement time; `checkedAt` = receipt verification time; archive dir number = previous generation | `generation`; `inputDigest`/`reportDigest` | Generation | Prior status/certificate values (only the pair is archived); exact time of a pass without `measuredAt` |
| `graphify` | `RFC-GRAPHIFY-Status.json`: `currentStep`, `steps`, `generation`, `runs`, `runId`, `lastOutputDigest`, `coverage`; graph file | Status overwritten; graph overwritten | **No archive** | `runId` is the only run time (epoch-derived or `Date.now()`); `generation` counts changed output digests, not time | `runId`; `generation`; `lastOutputDigest` | Run/generation; no step timestamps | Any prior graph; exact time of earlier steps; step start/end times |
| `boundify` | `RFC-BOUNDIFY-Status.json` same shape; `RFC-Dirs-Tree.json.generatedAt` | Overwritten | **No archive** | `generatedAt` = Dirs-Tree build time; `runId` = run; `generation` = changed output | `runId`; `generation` | Run/generation | Prior Dirs-Trees; per-step times |
| `split` | `RFC-SPLIT-Status.json`: `currentStep`, `steps` (11 keys), `generation`, `runs`, `runId`, `lastOutputDigest`, `coverage`; `Tickets.json`; `IMPLEMENTATION-ORDER.json` | Overwritten | **No archive.** A phasify snapshot may exist as `Tickets-<ts>.json`, but it is a merge snapshot | `runId` = run; `Tickets.metadata.generatedAt` = date-only; ticket timestamps per lifecycle | `runId`; `generation`; `round` | Run/generation; ticket | Prior ticket documents; exact split time; phase renumbering history |
| `make` | Ticket `status:"made"`, `created_at`, `updated_at`, `specs/<key>.md` | Ticket fields overwritten; spec re-exported/overwritten | **No per-ticket history** | `created_at` = date only (set when absent); `updated_at` = date only; spec mtime | Ticket key | Ticket | Exact time; whether a spec was hand-edited or re-exported |
| `plan` | `status:"planned"`, `planTestCode`, spec re-export | Overwritten | No | `updated_at` date only; spec mtime | Ticket key | Ticket | Exact plan time; prior plans |
| `start` | `startedAt`, `changes[]`, `notes`, status `done` | `changes` appended (`--append`), `notes` concatenated; status overwritten | **Append, no dedup**: `changes[]` accumulates, entries have no id/time | `startedAt` date only; `changes` no time | Ticket key | Ticket; change array (unidentified) | Which change belongs to which run; duplicate changes; exact time |
| `review` | `status:"reviewed"`, `completedAt`, `instrumentation`, `rfcDiscrepancies`, `notes` | Fields appended/overwritten; `completedAt` overwritten on re-review | No | `completedAt` date only; `updated_at` date only | Ticket key | Ticket | Exact review time; prior review reports |
| `resolve` | `Malfeasance.json` records `{detected_at, status, resolved_at, resolved_by_ticket}`; removed source markers; ticket `stubs`/`targetStubs` | Malfeasance records appended; `resolved_at` overwritten if status resolved is set again; source lines removed | **Crime history yes; command runs no** | `detected_at`/`resolved_at` ISO; source mtime | None (no run id) | Stub/crime | Whether resolve ran at all when no markers/crimes remain; per-run scope |
| `consolidate` | `manifests/CONSOLIDATED-MANIFEST-<ts>.json`, `manifests/ROLLBACK-<ts>.json`; `[::UNIT::]` tags stripped; markers re-pointed | Transient files; consumed and deleted by find-omissions | **No** after consumption | Filename timestamp = manifest creation; no per-unit time | None | Manifest/unit, only while it exists | Whether consolidation ran; unit grouping after the manifest is gone; exact time |
| `find` | `OMISSIONS-<ts>.json` (deliverable), `OMISSIONS-phasified-<ts>.json`, ticket `remanded`, `foundOmissions`, `forNextRound`, `round` | OMISSIONS files accumulate; ticket fields appended/overwritten; queue temp deleted | **Partial:** OMISSIONS files persist; per-ticket inspection queue does not | Filename timestamp = completion time; ticket `updated_at` date only; `foundOmissions` no time | Filename timestamp; `round` | Ticket inspected; omission entry | Which reviewed tickets were inspected and passed; per-inspection time; omission entry identity |
| `crystalize` | `CRYSTALIZE-Status.json`: `currentStep` 0–3, `steps`, `grill.toc.nodes[]` (`proposed/confirmed`), `grill.sections[]` (`complete/residue`), `tocApproved`, `examplesApproved`; `README.md`; `.bak` | Status overwritten; README overwritten in refine; sections upserted | **No archive**; `backup` writes `.bak` | No timestamp in status; mtime only | None | Section/TOC node | Exact time; prior README; run count |
| `drill` | `drills/Status.json`: `state`, `currentStep`, `createdAt`, `updatedAt`, `reviewLoopCount`; `drills/DesignTree.json` nodes `open/resolved`, questions `resolvedAt`; `baseline.json` | One session directory, files overwritten; tree/questions accumulate | **No per-session archive** | `createdAt` = session creation; `updatedAt` = last write; question `resolvedAt` per question | None (one session) | Question/node | Prior drill sessions; run boundaries; exact step times |

### 1.2.1 Exact history locations

| Producer | History location | Naming / structure |
|---|---|---|
| educe | `<dir(spec)>/educe-sequences/status.json` → `history[]` | one object per superseded generation: `{generation, phases, inquest, coverage, entered}`; current generation fields at the top level |
| educe (partial archive) | `<dir(spec)>/educe-sequences/archive/` | `declaration.g<N>.json`, `readings-*.g<N>.jsonl`; not a complete generation copy |
| smooth | `<root>/smooth-sequences/archive/<previousGeneration>/` | `SMOOTH-SEQUENCES.json` and `SMOOTH-SEQUENCES.md`, byte-identical to the superseded pair |
| regeneration | `<root>/regeneration/archive/<transactionId>/<design path>` | byte copies of pre-commit live files; `transactionId` is `<Date.now().toString(36)>-<8 hex>` |
| graphify / boundify / split | none | current artifact overwritten; only `generation`, `runs`, `runId`, `lastOutputDigest` survive |
| tickets | none by the pipeline | a phasify merge snapshot may be `tickets/Tickets-<ts>.json` and `metadata.phasifyMerge.snapshotPath`; `*.bak-*` is manual/backup, not a generation |
| grill | `<rfcDir>/Status.json`, `<rfcDir>/DesignTree.json` | one current session; `grillGeneration`, `completedSessions`, `completedAt`, node/question `resolvedAt`; no per-run tree archive |
| drill | `<rfcDir>/drills/` | one session directory: `Status.json`, `DesignTree.json`, `CheckList.md`, `baseline.json`; overwritten in place |
| resolve | `<pkg>/Malfeasance.json` | append-only crime records with `detected_at`, `resolved_at`, `resolved_by_ticket`; no run log |
| consolidate | `<pkg>/manifests/CONSOLIDATED-MANIFEST-<ts>.json`, `ROLLBACK-<ts>.json` | transient; deleted on find success |
| find | `<pkg>/OMISSIONS-<ts>.json`, `<pkg>/omissions/OMISSIONS-phasified-<ts>.json` | deliverable + derived merge view; per-ticket queue temp deleted |
| crystalize | `<rfcDir>/CRYSTALIZE-Status.json`, `README.md` | current only; a `backup` subcommand can write `.bak` but the command does not call it; no archive |
| drill (RFC evolution) | `<rfcDir>/drills/baseline.json` | pre-drill snapshot for the current session; not a generation archive |

### 1.2.2 External run evidence (not produced by conver)

These are the only run-level transcripts that survive artifact overwrite, but they are
**harness surfaces, not conver contracts**:

| Surface | Location | Content | Tag |
|---|---|---|---|
| bash command log | `~/.claude/bash-commands.log` | append-only, ISO timestamp, sanitized command | `[SPEC]` hook `post-bash-command-log.js` |
| cost tracker | `~/.claude/cost-tracker.log`, `~/.claude/metrics/costs.jsonl` | timestamp, session_id, tokens, model | `[SPEC]` `cost-tracker.js` |
| tool usage | `~/.claude/metrics/tool-usage.jsonl` | per-tool activity | `[SPEC]` `session-activity-tracker.js` |
| session transcript | `~/.claude/projects/<escaped-cwd>/<session-uuid>.jsonl` | individual tool calls and outputs | `[SPEC]`/`[OBSERVED]` |

Use them only in **evidence mode**, only with an explicit opt-in (for example
`--external-history=claude`), and never as a substitute for the artifact checks. They can
reconstruct a run after its artifact was overwritten, but they are outside the workspace
and are not stable across harness versions. The conver pipeline itself writes no run
journal. `[SPEC]`

### 1.3 `resolve`, `consolidate`, `find` in detail

These three were specifically questioned because their artifacts are removed or partial.

#### resolve

- `Malfeasance.json` is append-only. A crime record is created by `malfeasance-create.js`
  with `detected_at = new Date().toISOString()` and `status: "open"`.
- `malfeasance-update.js` allows `status`, `resolved_at`, `resolved_by_ticket`, `note`.
  Setting `status` to `resolved` **auto-sets** `resolved_at`; setting it again overwrites
  the previous `resolved_at`. `false_positive` does not set `resolved_at`.
- `resolved_by_ticket` is a **positive integer ticket id**, not a key; ids repeat across
  phases, so it is not globally unique.
- Removing a marker is a source edit by `remove-stub.js`; nothing records which run removed
  it. No run id, no log.
- `[SPEC]`: a resolved crime has `status:"resolved"` and `resolved_at`. `[UNKNOWN]`: whether
  `resolve` ran when zero markers and zero crimes remain. "No stubs" is not evidence of a run.
- `[OBSERVED]` `resolved_by_ticket` is writable but absent in all 137 sampled records (6
  gaia, 131 siprs); do not require it. Batch scans appear as many records sharing one
  millisecond. `start` and `review` also call `malfeasance-update.js`, so a `resolved_at`
  alone does not prove the `resolve` command ran.

#### consolidate

- `batch-update-stub.js --dry-run` prints changes; apply writes
  `manifests/ROLLBACK-<ts>.json` and `manifests/CONSOLIDATED-MANIFEST-<ts>.json`, re-points
  markers to one unit key, merges true duplicates, strips `[::UNIT::]` tags.
- The manifest shape is a JSON array:

  ```json
  [
    {
      "sourceKey": "P4-2",
      "stubs": [
        {"file": "src/call.rs", "line": 23, "content": "// [::STUB::] P4-2: ..."}
      ]
    }
  ]
  ```

- `find-omissions` consumes the newest manifest and removes both manifest and rollback on
  full success (`require-consolidated-manifest.js`, `find-omissions.md` Step 11).
- No consolidation run record survives. `[UNKNOWN]`: whether consolidation ran, and the
  unit grouping, after the manifest is deleted. Zero stubs plus no manifest can mean
  "nothing to consolidate", "already consolidated and resolved", or "manifest consumed".
- `[OBSERVED]` neither gaia nor siprs currently has a `manifests/` directory; on-disk
  evidence of consolidation is normally absent after a successful find.

#### find

- `create-tmp-omissions.js`/`get-next-check-target-ticket.js` maintain
  `_tmp-omissions-<ts>.json` and `_tmp-check-target-tickets-cmds-<ts>.json` while running;
  both are deleted at cleanup.
- On completion, the tmp omissions file is copied to `OMISSIONS-<YYYYMMDDhhmmss>.json` in
  the package root (the `omissions/` subdirectory seen in siprs is an organized/legacy
  placement, not what the current script writes).
- `get-next-check-target-ticket.js` sets the inspected ticket `status:"remanded"`; a
  ticket that passes inspection stays `reviewed`. Therefore `remanded` is a **gap marker**,
  not an inspection-completed marker.
- `add-omission-ticket.js` clones the source ticket, sets `originalTicketKey`, appends
  `foundOmissions`, sets `forNextRound: true`, and prepends the sentinel
  `[::INSPECTION_FLAGGED::]` to `background`. `phasify-omissions.js` merges clones by
  `originalTicketKey`, keeps the one with most `foundOmissions`, writes
  `OMISSIONS-phasified-<ts>.json`, marks pre-merge tickets `R<N>`, increments `round`, and
  deletes `forNextRound` at the round boundary.
- `[SPEC]`: an OMISSIONS file's filename timestamp is the completion time. `[UNKNOWN]`:
  which reviewed tickets passed; exact per-ticket inspection time; a stable omission id
  (there is none; `foundOmissions` entries have no id).
- `[SPEC]` Each run is a separate generation keyed by a 14-digit local timestamp:
  `_tmp-omissions-<ts>.json` → `OMISSIONS-<ts>.json`; phasify writes
  `OMISSIONS-phasified-<ts>.json` and a pre-merge snapshot `tickets/Tickets-<ts>.json`,
  then records `metadata.phasifyMerge` (last merge only). The snapshot chain is the only
  way to recover earlier merges. `[OBSERVED]` siprs has four such run triplets
  (`20260731115931`, `20260805185804`, `20260807125931`, `20260807154319`).
- `[SPEC]` Repeated inspections are distinguishable at **run** level (one file set per
  timestamp), not at **ticket** level: `remanded` is a single status overwritten on each
  pop, and zero-finding inspections leave no per-ticket record.

### 1.4 Evidence-based history vs explanatory animation

The renderer must support two modes and must not conflate them:

1. **Evidence mode** — draw only events with a located timestamp (`measuredAt`,
   `generationStartedAt`, `runId`, `resolved_at`, filename timestamp, git commit). The date
   text shows that timestamp. Unavailable times are not invented.
2. **Explanatory mode** — when timestamps are missing, lay the current state out in stage
   order. This is an explanation of structure, not history. The date text must show the
   snapshot time (or be omitted), and the stage text must not pretend the stage just ran.

A command-line flag should select the mode (for example `--history=evidence|explain|auto`).
`auto` uses evidence mode only when at least two distinct real timestamps exist; otherwise
it uses explanatory mode and reports which stages lacked evidence.

---

## 2. Package identity, root package, and path bases

### 2.1 `tree.workspace.packages[]` vs `allocate.seed_index[]`

- Join key: `tree.workspace.packages[].id === allocate.seed_index[].package` `[SPEC]`.
- `tree` carries `{id, name, path, layer, kind, seed_required, owns, responsibilities}`.
- `allocate` seed entries carry `{package, path, sha256}`; there is no `name`.
- `seed_index` is built from packages with `seed_required !== false`
  (`workspacify-allocate/lib/allocate-manifest.mjs:39-47`). So it can be **shorter** than
  `workspace.packages`; `allocation.package_count >= allocation.seed_count` is legitimate.
  A package with `seed_required:false` has no seed and no seed entry.
- There is **no duplicate-id validator**. `validatePackageCatalog` rejects duplicate paths
  only (`workspace-model.mjs:63-68`); duplicate ids would produce duplicate seed rows and
  a `Map` consumer would silently collapse them. Reject duplicates in the consumer.
- Seed path formula: `` `${pkg.path}/${SEED_FILE_NAME}` `` where `SEED_FILE_NAME` is
  `RFC-SEED.md` (`allocate-manifest.mjs:39-45`, `seed-model.mjs:69`). For a root package
  (`path: "."`) this is `"./RFC-SEED.md"` `[SPEC]`.
- `[OBSERVED]` gaia: 29 tree packages, 29 seed entries, all ids match, every seed path is
  exactly `<path>/RFC-SEED.md`. `[OBSERVED]` crystal: a legitimate root package
  `pkg-crystal` with `path: "."` and a seed path `RFC-SEED.md` (older spelling; normalize
  to `./RFC-SEED.md`). Both normalize to the workspace root.
- A consumer should use the **union**: all `tree.workspace.packages` for cells; seed entries
  only to locate `RFC-SEED.md`. Do not assume 1:1. Normalize seed paths before comparing;
  `RFC-SEED.md`, `./RFC-SEED.md`, and the root package all name the same file.

### 2.2 Root package `.` and legacy root Tickets

`[SPEC]` the root package is supported:

- `workspacify-tree/lib/structure-parity.mjs:68` defines `ROOT_PACKAGE_PATH = '.'`.
- `structure-parity.mjs:170-178` treats `.` as owning the whole project root.
- `workspace-model.mjs:40-75` validates a package path as any non-empty string and rejects
  duplicate paths; `.` is valid.
- `workspacify-allocate/lib/path-safety.mjs` resolves `.` to the workspace root and accepts
  containment.
- `workspacify-reverse.md:215` shows the canonical root-package decision
  `{"path":".","name":"root"}`.
- `allocate-manifest.mjs:39-45` produces `./RFC-SEED.md` for that package.

Mechanical rule for a root `Tickets.json`:

1. Build the set of package paths from `tree.workspace.packages[]`. If any path is `.`
   (or resolves to the workspace root), the root is a real package. Its `Tickets.json`,
   `RFC.md`, `RFC-GRAPH.json`, `RFC-Dirs-Tree.json`, `RFC-SPLIT-Status.json` are legitimate
   package artifacts.
2. If no package path resolves to the root, a root `Tickets.json` is **not bound to a
   declared package**. It may be a legacy aggregate; do not count it as a package's tickets.
3. `metadata.resolvedPaths.rfcPath` and `metadata.source` are corroborating evidence, not
   the join key: they are free strings and can be stale. The package declaration is
   authoritative.

`[OBSERVED]` gaia has 29 packages, none at `.`, and a root `Tickets.json` with 38 reviewed
tickets (`metadata.generatedAt: 2026-09-11`). Under the rule above it is unbound/legacy and
must be ignored for per-package density. `[OBSERVED]` crystal is the counter-example: its
tree manifest declares `pkg-crystal` with `path: "."`, so `<root>/Tickets.json` is that
package's legitimate store.

`[OBSERVED]` a current-code limitation: the forward allocate planner includes the tree
node `"."` in `relativeDirs` and its fresh-workspace policy refuses a non-empty planned
directory (`tree-staging.mjs:25-60`, gate `G2.4`). Re-planning a root package in a
non-empty workspace therefore fails. Treat a published root-package manifest as a
read-only fact; do not assume the current allocator would regenerate it.

### 2.3 Mismatch, duplicates, missing

- `[SPEC]` `validatePackageCatalog` rejects duplicate package ids/paths? It rejects duplicate
  paths (`workspace-model.mjs:57-73`); package id uniqueness is not explicitly checked there.
- `[SPEC]` `validateWorkspaceTree` requires the leaf directory paths and package paths to
  agree exactly, in both directions (`workspace-model.mjs:76-110`).
- `[SPEC]` `allocate-manifest` sorts seed entries by package id; missing seeds are not an
  error when `seed_required:false`.
- Consumer rule: if ids disagree, report a warning and use the tree catalog for cells; use
  seed entries only when the id matches. Do not invent a package for an unmatched seed.
  `[INFERRED]`, because no single validator defines consumer behavior.

### 2.4 Path bases (per field)

`resolveStoredPath(storedPath, baseDirectory)` = `path.resolve(baseDirectory, fromHomeRelative(storedPath))`
(`lib/path-utils.js`). `fromHomeRelative` expands `~`/`~/`; absolute paths stay absolute;
relative paths are resolved against the caller's base. Writers convert `$HOME/...` to
`~/...` (`toHomeRelativeDeep`, `toHomeRelativeText`).

| Field | Base | Observed forms | Tag |
|---|---|---|---|
| `tree.workspace.packages[].path` | workspace root | `crates/foundation/gaia-foundation`; `.` for root | `[SPEC]` |
| `allocate.seed_index[].path` | workspace root | `<pkg.path>/RFC-SEED.md`; `./RFC-SEED.md` for root | `[SPEC]` |
| `tree.input.spec_path` | workspace root | basename/relative; must stay inside root | `[SPEC]` (`seed-local-checks.mjs:119`) |
| `allocate.input_tree_manifest.spec.path` | workspace root | copied from tree `input.spec_path` | `[SPEC]` |
| `graph.sourceFile` | Canonically home-relative or absolute. Writers call `toHomeRelative(path.resolve(...))`, so a relative CLI argument was resolved against the writer's cwd. A relative stored value is legacy; do not resolve it against the reader's cwd. | absolute, `~/...`, legacy relative | `[SPEC]` `crud.js:81-86,229-231`; `path-utils.js` |
| `Dirs-Tree.sourceFile`, `sourceGraph` | home-relative or absolute; written with `toHomeRelative`; readers expand `~` before `dirname` | absolute or `~/...` | `[SPEC]` `boundify-graph-to-dirs.js:570-574` |
| `Tickets.metadata.source` | relative to `ticketsDir` or absolute; the fallback `path.resolve(ticketsDir, raw)` does **not** expand `~` | `~/...`, absolute, relative | `[SPEC]` `show-ticket-context.js:121` |
| `Tickets.metadata.resolvedPaths.*` | `path.resolve(ticketsDir, fromHomeRelative(value))`; used only if all three are non-empty and exist | `~/...`, absolute, relative | `[SPEC]` `show-ticket-context.js:109-117` |
| `ticket.specPath` | `resolveStoredPath(value, ticketsDir)` = `path.resolve(ticketsDir, fromHomeRelative(value))`; no conventional fallback if missing | absolute, `~/...` | `[SPEC]` `show-ticket-context.js:1243-1245` |
| `ticket.default_files[]` | **No resolver in code.** Emitted literally. Derived from the Dirs-Tree hierarchy, so package-relative when built for a package and root-relative for a `"."` package. May be stored `~/...` or absolute. | `src/...`, `~/...`, absolute | `[SPEC]` `add-tickets-for-phase.js:90-103`; `show-ticket-context.js:949-955` |
| `ticket.stubs[].file` | Stored verbatim; no resolver. Current generator writes it relative to the scan root passed to find-omissions (`path.relative(root, s.file)`); real data also has absolute and `~/...`. | `src/...`, absolute, `~/...` | `[SPEC]` `print-manifest-for-find-omissions.js:159-180`; `[OBSERVED]` |
| `Malfeasance.records[].file` | Project-root-relative, where the project root is the directory containing `Malfeasance.json`; `~/...` is preserved; absolute is relativized. | `src/...`, `~/...` | `[SPEC]` `malfeasance-utils.js:229-242` |
| `manifests/*`, `OMISSIONS-*` | `process.cwd()` of the command (the package root when run there) | package-root-relative | `[SPEC]` |
| `README.md` | `dirname(fromHomeRelative(graph.sourceFile))/README.md`; `examples/` under the same directory | package-root-relative | `[SPEC]` `crystalize-readme/derive-output-paths.js:89-106` |
| `drills/` | `dirname(path.resolve(rfcPath))/drills`; a relative RFC argument is cwd-relative | package-root-relative | `[SPEC]` `session-init.js:39-43` |
| `specs/<key>.md` | package root | `specs/P0-1.md` | `[SPEC]` |

Correction to the first document: do not assume every stored path is workspace-relative.
Apply `fromHomeRelative` first, then resolve relative against the named base.

### 2.5 Specification outside the workspace

- `[SPEC]` In forward workspacify, the spec is at the workspace root and
  `tree.input.spec_path` is root-relative; `seed-local-checks.mjs:119` requires the
  reference block's `source_spec.path` to stay inside the workspace.
- `[SPEC]` `/educe-sequences <spec-file>` derives its artifact and run directory **beside
  the spec file**: `<dir>/<stem>-sequences.json` and `<dir>/educe-sequences/`
  (`educe-sequences.md:54`, `rail/paths.mjs`). It does not require the spec to be the
  workspace root file.
- `[UNKNOWN]` If a user runs educe on a spec outside the workspace, nothing in the workspace
  manifests names that artifact. A renderer cannot discover it from the manifests alone.
  It can only discover it if the caller supplies the spec path or if the artifact happens
  to be at the workspace root.
- Consumer rule: locate the spec from `tree.input.spec_path`; if it is outside the root,
  look beside it and emit a warning that the workspace does not reference the artifact.

### 2.6 Multiple candidates with the same spec hash

`[SPEC]` there is no hash-based selection:

- `smooth-sequences/lib/workspace.mjs:44-67` requires exactly one root `*-sequences.json`;
  zero → `NO_ARTIFACT`, two → `AMBIGUOUS_ARTIFACT`, no hash comparison.
- `lib/package-artifacts.js:82-140` prefers the canonical name; otherwise exactly one
  sibling with the suffix; two → `AMBIGUOUS_GRAPH` / `AMBIGUOUS_DIRS_TREE` /
  `AMBIGUOUS_STATUS`; zero → `MISSING_*`.
- `verify-smooth-verdict.mjs` uses `findSingleSiblingPath`, which returns null on ambiguity.
- `shared-obligations/evidence-writer.mjs:291-297` is the exception: it takes the **first**
  directory entry ending in `-sequences.json` with no cardinality or hash check. That is a
  producer bug/limitation, not a selection rule to copy.

A renderer that wants to be permissive may pick a candidate by matching
`spec.sha256` and emit a warning, but that is `[INFERRED]/[PROPOSAL]`, not pipeline behavior.
Keep exactly one `*-sequences.json` in any directory a workspace consumer reads.

### 2.7 Nested packages and ownership

- `[SPEC]` package paths are a set; `validateWorkspaceTree` compares them with the measured
  leaf directories exactly (`workspace-model.mjs:76-110`).
- `[SPEC]` `packageOwnsPath` in `structure-parity.mjs:170-178` treats `.` as owning every
  file, and a non-root package as owning files under its prefix.
- `[SPEC]` `MEASUREMENTS` in `architecture-delta.mjs:71-74` distinguishes root-including
  and root-excluding partitions; a mixed pair is refused.
- `[SPEC]` There is no “package paths may not nest” validator. `validateWorkspaceTree`
  compares the package set against **leaf** directory paths only; a malformed tree could
  still satisfy set equality. File ownership is prefix-based and non-exclusive:
  `packageOwnsPath` treats `.` as owning every file; a non-root parent and child would both
  own the child's files, and `assertNoBehaviouralLoss` only asks whether at least one
  package owns a file.
- `[SPEC]` Counter-example: crystal's `pkg-crystal` (`path: "."`) and every other package
  lies beneath it; the reverse terminal state special-cases the root so the same directory
  is not counted twice (`workspacify-reverse/lib/terminal-state.mjs:193-203,305-316`).
- Consumer rule (`[INFERRED]/[PROPOSAL]`): treat every non-root package path as a leaf;
  reject non-root prefix pairs; let `.` own only paths not under another package; assign a
  file to the most specific package path when aggregating. Do not rely on a validator to
  enforce this.

### 2.8 Symlinks and outside references

- `[SPEC]` `workspacify-allocate/lib/path-safety.mjs:104-160` reports a symbolic-link
  ancestor of any planned path as unsafe; package paths resolving outside the root are
  rejected (`:61-77`).
- `[SPEC]` planned relative paths reject absolute paths, `..`, backslash separators and
  drive letters (`:19-48`).
- `[SPEC]` `tree` measurement excludes `.git`, `node_modules`, `target`, `dist`, `vendor`,
  `.venv`, `__pycache__` (`structure-parity.mjs:29-38`) and uses `statSync`, which follows
  links; the safety gate, not the measurement, is the containment guarantee.
- `[SPEC]` **Read side follows symlinks.** `isReadableRegularFile` uses `statSync`
  (`fs-safe.mjs:17-22`); spec containment is lexical `path.resolve` + `path.relative`, with
  no `realpath` (`tree-manifest-input.mjs:206-226`). A symlinked spec whose target is
  outside therefore passes the containment check. Ticket, graph, Dirs-Tree, OMISSIONS and
  educe readers likewise accept `~/...`, absolute, or relative paths that resolve outside.
  Such references are legitimate **read** inputs.
- `[SPEC]` **Write side refuses symlink ancestors** (`path-safety.mjs:84-129`, reason
  `path contains a symlink at "<prefix>"`, gate `G2.2`) and refuses a planned leaf that is
  a file/symlink or a non-empty directory (`tree-staging.mjs:25-60`, gate `G2.4`).
- `[SPEC]` Reverse sandbox refuses a symlink whose target leaves the sandbox
  (`SandboxError('symlink-escapes-target')`, `sandbox.mjs:552-566`).
- `[UNKNOWN]` the schema does not enforce containment for `changes` prose or arbitrary
  ticket paths.
- Consumer rule: expand `~`, resolve against the documented base, then use `realpath` and
  check containment for any path used to read source; warn on outside targets. This is a
  consumer safety rule, not a pipeline guarantee.

---

## 3. State, completion, and evidence validity (16-stage matrix)

### 3.1 State words

| Word | Meaning |
|---|---|
| `not_started` | No artifact and no status. |
| `running` | Status exists with a non-terminal step/tag (`pending`/`running`), or a partial artifact. |
| `complete` | The stage's own completion condition holds. |
| `failed` | Status records `error`/`refused`, or a run exit was non-zero and persisted. |
| `insufficient_evidence` | An artifact exists but a required binding/receipt/certificate is absent. |
| `stale` | The artifact's current bytes no longer match the recorded digest/receipt/input. |
| `undeterminable` | No record distinguishes completion from absence. |

### 3.2 Matrix

"Necessary" = must hold for `complete`; "sufficient" = its conjunction with necessary is
enough from artifacts alone; "stale check" = a computable freshness test.

**Critical limit:** `steps[N] === "done"` (or `Status.state === "DONE"`) proves the
**writer ran and recorded completion**, not that the stage's validators passed. The status
scripts do not invoke validators; the command prose orders validators before `end-step`.
Validation results are not persisted (except smooth `verdict`, educe receipts, and
verify-chain's transient exit). Therefore, for graphify/boundify/split, "artifact + all
steps done" is **structural completion**, not independently proven validation. The same
distinction applies to grill's `DONE` and ticket status strings: a later stage can overwrite
them.

| Stage | Necessary | Sufficient (artifact-only) | Stale check | Cannot determine |
|---|---|---|---|---|
| educe | `status.json` parses; artifact exists | all 18 phases `done` **and** artifact exists; when `EVIDENCE-MANIFEST.json` exists, its `artifact.sha256` must match the artifact (otherwise the receipt check is unavailable: legacy, warn) | `sha256(<spec-stem>-sequences.json) === EVIDENCE-MANIFEST.artifact.sha256` when the manifest exists; `status.spec.sha256` matches spec | phase wall-clock time; whether a phase's verdict is still valid if receipts are absent (legacy) |
| explain | INFO + EXPLAIN exist | **No artifact-only sufficient condition**; only `run.mjs answers` exit 0 (not persisted) | facts block section digests vs current INFO facts (if reimplemented) | completion; open/bound/settled counts; run time |
| grill | `Status.json` + `DesignTree.json` + RFC | `Status.state === "DONE"` **and** `check-all-schema` would pass | `updatedAt`/`completedAt`; RFC mtime is not a staleness test because graphify may edit RFC later | first completion; per-run tree state |
| smooth | `status.json` | `verdictIsPass` **and** certificate complete (or legacy: certificate absent + no evidence manifest) **and** `status.inputDigest === computeInputDigest(root)` **and** certificate `inputs.artifact === sha256(root artifact)` | receipt `statusDigest`, `artifactDigest`, `viewDigests`, `mapDigests` vs live | exact time of an older pass; why a certificate is absent (legacy vs deleted) |
| graphify | graph + status | steps `0..5` all `done` (or `currentStep >= 6`) **and** graph exists; this is structural completion, not proof that `verify.js` passed | `sha256(RFC-GRAPH.json) === status.lastOutputDigest` is a **consumer inference**: no reader re-validates it | prior graph; step times; whether `verify.js` coverage still holds if source changed |
| boundify | Dirs-Tree + status | steps `0..3` all `done` (or `currentStep >= 4`) **and** Dirs-Tree exists; structural only | `sha256(RFC-Dirs-Tree.json) === status.lastOutputDigest` is a **consumer inference**: no reader re-validates it | prior Dirs-Tree; step times |
| split | Tickets + status | step `"6" === "done"` **and** Tickets exists; structural only | `sha256(Tickets.json) === status.lastOutputDigest` is a **consumer inference**: no reader re-validates it | prior Tickets; phase renumbering history |
| make | ticket status/spec | all tickets have rank ≥ `made` | spec file exists; `created_at` only date | exact make time; whether spec was re-exported by plan |
| plan | status ≥ planned + planTestCode | all tickets ≥ `planned` | none | exact plan time; Gate P result |
| start | startedAt/changes/status done | all tickets with `startedAt` and status ≥ done | none | which changes belong to which run; exact time |
| review | status reviewed + completedAt | all tickets `reviewed` (or `R<N>`) | none | review report contents; exact time |
| resolve | no run record | **No artifact-only sufficient condition**; per-crime `status:"resolved"` + `resolved_at` is evidence per item | source marker absence; crime resolved_at | whether resolve ran; which run resolved a marker |
| consolidate | manifest or zero stubs | **No artifact-only sufficient condition** | manifest exists; rollback exists | whether it ran after consumption; unit grouping |
| find | OMISSIONS file or remanded/foundOmissions | an OMISSIONS file exists, but it does not prove every reviewed ticket was inspected | filename timestamp; `round`; `forNextRound` | inspected-passed set; per-inspection time; omission identity |
| crystalize | status + README | `currentStep >= 4` (steps 0–3 done) **and** README exists **and** every section has a terminal `state` (`complete` **or** `residue`) **and** `tocApproved`; examples are approved or an `EXAMPLES` residue record exists. A residue is an accepted terminal outcome, not a failure. | README marker count; section states; `EXAMPLES` record | exact time; run count; prior README |
| drill | drills/Status + DesignTree | `state === "DONE"` **and** `currentStep === "1-12"` **and** open count 0 | question `resolvedAt`; `updatedAt` | prior sessions; exact step times |

### 3.3 Smooth: necessary vs sufficient, in exact terms

`verdictIsPass(status)` (`sequences-slice/lib/smooth-verdict.mjs:75-84`):

```text
status.verdict.exitCode === 0
&& status.verdict.findings === 0
&& status.verdict.blocked === 0
&& (status.verdict.readings ?? 0) === 0
&& (status.verdict.withheld ?? 0) === 0
```

`verifySmoothVerdict` additionally:

- requires exactly one root `*-sequences.json`;
- if `COMPLETION-CERTIFICATE.json` exists: `certificate.status === "complete"` and
  `certificate.inputs.artifact === sha256(root artifact)`;
- if the certificate is absent **and** `educe-sequences/EVIDENCE-MANIFEST.json` exists:
  `SMOOTH_CERTIFICATE_INCOMPLETE`;
- if the certificate is absent and no evidence manifest exists: legacy pass allowed
  (`receipt.legacy = true`);
- `status.inputDigest === computeInputDigest(root)`, otherwise `STALE_SMOOTH_VERDICT`.

The receipt (`SMOOTH-VERDICT.json`, schemaVersion 3) binds `statusDigest`,
`artifactDigest`, `viewDigests`, `mapDigests`, `verdictPass`, `checkedAt`. Downstream
graphify/boundify/split refuse when the receipt and live files disagree
(`verify-smooth-receipt.mjs` / `verifySmoothReceipt`).

`[OBSERVED]` gaia: `status.verdict = {exitCode:0, findings:0, blocked:0, withheld:0,
readings:0}`; certificate `obligations.closed = total = 6660`; `status.readings` has
`inquest.records = 3768` while `verdict.readings = 0`. The certificate's `readings.held`
(4419) is **not** the pass gate; the pass gate is `status.verdict.readings` (unresolved
readings). Do not conflate them.

`[SPEC]` `status.schemaHistory` is the sequence of **schema versions**, not generation
history. The current generation is the only one in `status.json`; prior report pairs are in
`archive/<previousGeneration>/`. A verification with identical inputs writes nothing and
returns `mode: "verification"`, so a re-verification leaves no trace. The existence of an
archive pair does **not** prove a pass: an archived report can carry a non-pass verdict.

### 3.4 Which first-document heuristics are guaranteed?

| Heuristic | Verdict |
|---|---|
| Downstream artifact implies all upstream stages completed | `[INFERRED]` at best. Command gates enforce order at run time, but files can be deleted/edited; downstream presence proves an upstream run existed, not that current upstream evidence is valid. |
| `RFC.md` + `DesignTree.json` ⇒ explain complete | `[UNKNOWN]`/heuristic. Only `run.mjs answers` exit 0 proves it; that exit is not persisted. |
| smooth findings/remainingOpen zero ⇒ pass | `[SPEC]` **false**: the pass rule includes exitCode, blocked, readings, withheld, certificate/input binding. |
| zero stubs ⇒ consolidate complete | `[UNKNOWN]`: also true when nothing needed consolidation or after manifest consumption. |
| `Tickets.json` ⇒ split complete | `[SPEC]` **false**: step `6` must be done; Tickets is written before. |
| `remanded` ratio ⇒ find inspected ratio | `[SPEC]` **false**: only gap tickets are remanded; passed tickets leave no per-ticket record. |
| `R<N>` and `remanded` = reviewed | Partly false: `R<N>` is a completed-round marker; `remanded` is active rework. |

---

## 4. Exact schemas and transitions

### 4.1 educe: 18 phases

`[SPEC]` phase table (`educe-sequences/rail/gates.mjs:265-620`), in definition order:

| id | name | tag | requires | maxLoops |
|---:|---|---|---|---:|
| 1 | identity | det | — | 1 |
| 2 | predicate | read | 1 | 3 |
| 3 | row schema | read | 2 | 3 |
| 4 | enumerations | read | 3 | 3 |
| 5 | blocks | read | 1 | 3 |
| 6 | pins | det | 2,3,4,5 | 3 |
| 7 | worklist | det | 6 | 3 |
| 8 | span | read | 7 | 3 |
| 9 | integrate | det | 8 | 5 |
| 10 | adversarial | read | 9 | 3 |
| 11 | reroute | read | 10 | 3 |
| 12 | adjudicate | read | 11 | 3 |
| 13 | inquest | read | 12 | 3 |
| 14 | checks | det | 9,13 | 3 |
| 15 | re-derive | det | 14 | 2 |
| 16 | falsify | det | 14 | 3 |
| 17 | rail exit | ad-hoc | — | 5 |
| 18 | report | det | 14 | 2 |

Status values: `open`, `done`, `refused` (`rail/run-state.mjs:355-372`). `loops` counts
refusals. `entered` is a generation-level boolean. `history[]` entries carry the superseded
generation's phases, `inquest`, `coverage`, `entered`; they have **no timestamp**.
`generationStartedAt` is ISO and belongs to the current generation only.

`status.json` minimal shape:

```json
{
  "spec": {"path": "spec.md", "sha256": "0000000000000000000000000000000000000000000000000000000000000000", "lines": 3},
  "generation": 1,
  "entered": true,
  "generationStartedAt": "2026-11-01T00:00:00.000Z",
  "history": [],
  "phases": [{"id": 1, "tag": "det", "status": "done", "verdict": "identity recorded", "loops": 0}],
  "readings": {"span": {"claims": 1}}
}
```

`[SPEC]` Generation archiving renames `declaration.json` and the readings of read phases
8,10,11,12,13 (`span`, `uncovered`, `adversarial`, `reroute`, `adjudicate`, `inquest`) to
`name.g<N>.ext`, where N is the superseded generation. `readings-attack/effort/judgment`
are **not** generation-archived; they are merged by `obligationId` and stamped with
`readAt`/`readerGeneration`. `history[]` entries carry no timestamp. A phase whose receipt
no longer matches the current spec/declaration/artifact/worklist digest is reopened on the
next generation.

`declaration.json` is required by phases 2–7. Minimal shape that passes
`validateDeclaration`:

```json
{
  "predicate": {"limbs": ["X"]},
  "rowSchema": {"fields": ["A"]},
  "weakestLink": {"subject": "s", "why": "w", "tightenedBy": "c"},
  "enumerations": [{"name": "E", "members": ["m"], "closedness": "open"}],
  "forms": [{"name": "f", "proposes": true}],
  "entries": [{"id": "e1", "kind": "entry", "firstLine": 1, "lastLine": 1}],
  "sections": [{"id": "s1", "firstLine": 1, "lastLine": 1}],
  "exemptions": []
}
```

`entry.kind` is not an enum in the validator; observed values are `entry` and `neighbour`,
and only `entry` is adjudicable (`gates.mjs:103-105`). `closedness` is also a free string.

`demand.json` is an **output snapshot**, not an input. It is written only by the `report`
subcommand; no reader validates it, and the live answer is recomputed by
`check-obligation-coverage.js`. Use it for mass/progress, not as the current authority.
Its `coverage.verdict` is `"holds"` or `"not established"`; `assignmentDistribution` is
`[{packageId,count}]`.

### 4.2 explain: facts block and ledger

`[SPEC]` Facts block (produced by `explain-seed/lib/digest.mjs`; observed at the end of
`EXPLAIN-RFC-SEED.md`):

```html
<!-- explain-seed:facts
{"schema":"explain-seed-facts-v1",
 "sections":{
   "E1":{"digest":"<sha256>","facts":[{"id":"I2","digest":"<sha256>"}]},
   "E2":{"digest":"<sha256>","facts":[]}
 }}
-->
```

The seven sections are fixed (`frame.mjs:85-93`): E1 30秒でわかるこのディレクトリ, E2 全体の中での位置,
E3 このディレクトリが担うもの, E4 他のディレクトリとの約束ごと, E5 人間が決めること（ここだけ）,
E6 先に決めておいたこと, E7 踏むと壊れる線と用語ミニ辞典.

`[SPEC]` The block must contain **all seven** keys E1–E7; each is
`{digest: 64 lowercase hex, facts: [{id, digest}]}`. The fact ids each section rests on
are fixed (`EXPLAIN_SECTION_FACTS`, `digest.mjs:35-46`): E1→I2,I3,I10; E2→I2; E3→I3,I6;
E4→I4,I5; E5→I9,I10; E6→I5,I7,I8,I10; E7→I7,I6. A missing or malformed block makes the
merge treat every section as reopened (`digest.mjs:117-143`), not as an error.

Ledger:

- `[SPEC]` `deriveLedger({documentText, projection})` (`lib/ledger.mjs:107-140`) computes
  `open`, `bound`, `settled`, `unsettled`, `added`, `questions`. **It is never written to a
  file.** `run.mjs info` prints `ledger: N open, N bound, N settled, N added` to stderr;
  `check` and `answers` return exit codes.
- `[SPEC]` The universe is the recorded open items from the projection plus document-added
  points (`universeOf`). The projection is built from manifests/seed/views, not from
  `INFO-RFC-SEED.md` alone.
- `[SPEC]` Question grammar: E5 items `### 判断 Q<n>`; bound line
  `- 束ねた論点:` followed by comma-separated ids; the answer is the text after the
  `<!-- 人間の判断 -->` placeholder line (`items.mjs`, `frame.mjs`).
- `[SPEC]` Predecided grammar: E6 items `### 先に決めた A<n> — <reference>`; fields
  `決定:`, `根拠:`, `覆す条件:`; a point is settled only when the item carries `根拠`.
- `[SPEC]` `bound` and `settled` are physically readable from `EXPLAIN-RFC-SEED.md`:
  `bound` from each question's `- 束ねた論点:` line, `settled` from `### 先に決めた A<n>`
  items carrying a non-null `- 根拠:`. Added points are readable from
  `<!-- explain-seed:added-point id="added-NNN" -->` blocks.
- `[SPEC]` The recorded side of the universe is in `INFO-RFC-SEED.md` section I9 (residual
  ids and risky-boundary ids) and I10 (settled-elsewhere boundary ids). I9/I10 are capped
  at 12 items with `…and N more` (`render.mjs:38,131-137`), and excerpts are truncated.
  With more than 12 items the documents do not name the full universe.
- `[UNKNOWN]` The full open/bound/settled partition cannot be guaranteed from the two
  documents alone. Exact reconstruction requires the projection from the seed + both
  manifests + neighbours' `EXPLAIN-RFC-SEED.md` files, and must subtract I10 ids from I9.
  Safest: treat explain completion as `[UNKNOWN]` unless `run.mjs answers` is invoked; use
  downstream artifacts only as a heuristic.
- Question/answer persistence is exact: E5 items are `### 判断 Q<n>`; each carries
  `束ねた論点`, `決められなかった理由`, `この質問で決まること`, the AI-only record copy,
  `判断の前提`, `選択肢`, `推奨`, `推奨の理由`, `推奨が覆る条件`, `誰の体験が変わるか`,
  `決めないと何が困るか`, then `<!-- 人間の判断 -->`. The answer is the prose under that
  placeholder. Rounds are `<!-- explain-seed:round N -->`; revision cycles are
  `<!-- explain-seed:cycle N -->`. Numbering never restarts.

Completion markers: no status file. `run.mjs answers` exit 0 is the only proof; it is not
persisted. `Status.json.createdAt` is the grill session's creation time and can predate a
re-synced explanation; do not use it as explain completion.

### 4.3 DesignTree (grill and drill)

`[SPEC]` Node status is exactly `open` or `resolved` (`grill-me-for-rfc/check-all-schema.js:273`;
`update-tree.js` sets `open` by default and `resolved` on resolution). Recursive shape:

```json
{
  "version": 1,
  "updatedAt": "2026-11-01T00:00:00.000Z",
  "nodes": [
    {
      "id": "Q1",
      "title": "design decision",
      "status": "resolved",
      "questions": [
        {"resolvedAt": "2026-11-01T01:00:00.000Z", "answer": "the answer"}
      ],
      "children": []
    }
  ],
  "priorScan": {"scannedAt": "2026-11-01T00:00:00.000Z", "directories": [], "artifacts": [], "decisions": []},
  "questions": []
}
```

- Counts: resolved / all nodes; open count recursively (`update-tree.js open-count`).
- `questions` accumulate; each resolution pushes `{resolvedAt, answer}` (drill also pushes
  `decision` in some writers). Questions are **not** a separate top-level work queue for
  the grill; `nodes[].questions` is the record.
- Drill uses the same node/status schema, in `<rfcDir>/drills/DesignTree.json`
  (`drill-rfc-down/session-init.js:5-100`).
- `[SPEC]` Top-level `questions[]` (optional) holds direction questions:
  `{number, boundNodeIds, scopeLine, settleTrace:[{record, leavesOpen}], framing?,
  choice?, answer}`. `answer: null` means unanswered; a non-null string means answered.
  `number` is unique. Node `questions[]` are **settlement records**, not open questions:
  `{resolvedAt, answer, decision?, ground?, override?, source?}`; `override` is required
  when `ground` is present.
- `[SPEC]` Counting: resolved nodes = total nodes − recursively open nodes
  (`tree-query.js`, `update-tree.js open-count`). Top-level answered questions are counted
  separately (`questions.filter(q => q.answer !== null).length`); no bundled tool includes
  them in the node count.
- `[SPEC]` Grill accepts any non-empty node id; drill requires `^Q\d+[a-z]?$`
  (`drill-rfc-down/check-all-schema.js:34,193`). Drill rolls back an invalid tree write;
  grill does not. Both use the same node/question shape.
- `[UNKNOWN]` the total number of questions that *should* exist; only created questions and
  answered settlements are recorded.
- `[OBSERVED]` drill uses one session directory. Older sessions are visible only through
  manual archives (`DesignTree.round<N>.archive.json`, `CheckList.round<N>.archive.md`,
  `q*.txt`, `r<N>/`) or git; siprs shows at least two sessions in git but only one
  `drills/` directory. Those manual files are not produced by current scripts.

### 4.4 graphify / boundify / split status

`[SPEC]` Step values: `pending`, `running`, `done`, `error`
(`update-step-status.js:55-65`, `update-boundify-step-status.js`, `update-split-step-status.js`).

- graphify: steps `"0"`–`"5"`; `currentStep` is a number; step 5 done sets `currentStep = 6`.
- boundify: steps `"0"`–`"3"`; step 3 done sets `currentStep = 4`.
- split: step ids in order `["0-1","0-2","1","2","3","4-1","4-2","5-1","5-2","5-3","6"]`;
  `currentStep` is a **string**; finishing `6` leaves `currentStep: "6"` and all steps done.
  Completion = `steps["6"] === "done"` (and, if `runId` exists, `lastOutputDigest` written).
- `generation` increments only when the output digest changes; a verification does not
  increment. `runs` increments per distinct `runId`. `runId` is `${Date.now()}-${pid}` in
  the default path, but observed values can be epoch nanoseconds (e.g.
  `1793600759191919000-94288`); parse leading digits defensively.
- Coverage:
  - graphify: distinct `nodes[].unitIds`; `steps` from local view steps; `boundaries` =
    distinct `ctr-*` units (`status-generation.js:110-125`).
  - boundify: `Object.keys(document.distribution.units)`; same step/boundary rules.
  - split: flatten `tickets[].distribution.units`; `steps` = sum of
    `unit.obligation.steps.length`; `boundaries` = `ctr-*` units.
- `lastOutputDigest` is the sha256 of the graph, Dirs-Tree, or Tickets.json respectively.
  It is written at the final `end-step`; **no producer reader re-validates it**. A consumer
  can recompute it to distinguish current from modified-after-generation, but that is a
  consumer inference, not pipeline behavior. `[SPEC]` at write time; `[INFERRED]` as a
  staleness check.

### 4.5 Tickets

`[SPEC]` `tickets-schema.json` + `lib/validate-tickets.js`:

- `id`: integer ≥ 1 (never a composite string).
- `phaseId`: integer ≥ -1; required by the validator; must equal the parent phase id when
  present. `-1` is the PX phase.
- Display key: `P{phaseId}-{id}`; `PX-{id}` for `-1` (`validate-tickets.js:151-155`;
  `KEY_RE = /^(?:PX|P(-?\d+))-(\d+)$/`).
- `status`: `todo | made | planned | done | reviewed | remanded`, plus legacy
  `R[1-9]\d*` round statuses. Unknown status is invalid for writes; readers should treat
  unknown as `undeterminable`.
- `prerequisites`: not in the JSON schema; an optional array of objects:
  `{ticket: "P2-1" | package: "pkg-0003", kind: "implementation",
  source: "graph:depends_on:N0001->N0002", boundary?: "boundary-001"}`. It is a **cache** re-derived by the entry gates; absent =
  none (`tickets/add-tickets-for-phase.js:638-850`,
  `check-ticket-prerequisites.js:152`).
- `changes[]`: `{before?, after?, description?}` strings; no id/time/path; appended by
  `update-ticket --append` via `Array.concat`; no dedup (`update-ticket.js:114-125`).
- `targetStubs`/`targetCrimes`: idempotent fields; `--append` is rejected
  (`update-ticket.js:18,102-113`).
- Duplicate-key validator quirk: the duplicate check uses `if (ticket.id && ticket.phaseId)`,
  so `phaseId: 0` is falsy and duplicates in phase 0 are not detected (`validate-tickets.js:75-77`).
  Consumers must derive keys themselves.
- `[SPEC]` Two schema layers disagree: `tickets-schema.json` requires `contracts` with
  `minItems: 1`, while the runtime `validateTickets` treats `contracts` as optional for
  backward compatibility (`validate-tickets.js:52-72`). A ticket accepted by the runtime
  validator may fail the JSON Schema file.
- `[OBSERVED]` `phaseId` is required by both schemas and the current validator, but
  consumers tolerate a missing value by falling back to the parent phase or `-1`; 2 of 106
  gaia tickets omit it. Treat a missing `phaseId` as the parent phase id, then `-1`.
- `[SPEC]` `prerequisites` entry `kind` must be `"implementation"`; other kinds are skipped
  (`implementation-order.mjs:922-923`). Status completion for a prerequisite ticket is
  exactly `done` or `reviewed`; `planned`/`made`/`remanded` are incomplete.
- `[SPEC]` `R<N>` is accepted by the runtime validator but not by the JSON Schema enum.
  It means “this ticket was closed/processed in round N”, not “artifact generation N”.
- `[OBSERVED]` `tickets/README.md` still documents the older spec-frontmatter lifecycle
  (`draft/reviewing/approved/implementing/done/reviewed/blocked`); it is not the current
  `Tickets.json` enum. Do not use it for `Tickets.json` state.
- `[SPEC]` `forNextRound: true` marks a mid-round ticket deferred to the next round. The
  phase display excludes it from pending work, find-omissions never re-queues it, and
  phasify deletes the flag at the round boundary. For density, count it as pending design,
  not completed implementation.

Minimal ticket:

```json
{
  "id": 1, "phaseId": 0, "status": "todo", "title": "Example ticket",
  "nodeIds": ["N0001"], "contracts": [
    {"id": "C001", "sourceEdge": "N0001→N0002",
     "precondition": "p", "postcondition": "q", "invariant": "r"}
  ]
}
```

### 4.6 crystalize

`[SPEC]` `update-step-status.js` (crystalize):

- Steps 0–3 (`MIN_STEP=0`, `MAX_STEP=3`); `currentStep=4` means all done.
- `grill.toc.nodes[]`: `{id, heading, level, confirmedContent, status}` with
  `status: "proposed" | "confirmed"`.
- `grill.sections[]`: `{id, heading, state, confirmedContent}` with
  `state: "complete" | "residue"` (upsert on resolve/mark-residue).
- `grill.tocApproved`: derived true when every TOC node is confirmed.
- `grill.examplesApproved`: boolean set by the examples step. The examples section uses the
  reserved id `EXAMPLES` in `grill.sections` (`loop-drive-readme.js:88`).
- No timestamps and **no schemaVersion/generation field** in the status file; use mtime.
- Legacy forms: `grill.proposedIds` / `grill.confirmedIds` are migrated to
  `grill.toc.nodes` on read (`update-step-status.js:198-208`). A legacy status missing
  `grill` or `grill.sections` is backfilled with empty defaults.
- The header comment says “Steps 0–4 + grill”, but `MAX_STEP = 3`; the current range is 0–3
  and `currentStep=4` means done (`update-step-status.js:4-27,44-46`).
- Completion is not a single boolean: every usage section is `complete` or a residue record,
  marker grammar is clean, and examples are `examplesApproved` plus an `EXAMPLES` record.

Minimal shape:

```json
{
  "sourceFile": "RFC.md", "graphFile": "RFC-GRAPH.json", "currentStep": 4,
  "steps": {"0":"done","1":"done","2":"done","3":"done"},
  "grill": {
    "tocApproved": true, "examplesApproved": true,
    "toc": {"nodes":[{"id":"H1","heading":"Usage","level":1,"confirmedContent":"usage","status":"confirmed"}]},
    "sections":[{"id":"H1","heading":"Usage","state":"complete","confirmedContent":"usage"}]
  }
}
```

### 4.7 OMISSIONS files

- `[SPEC]` `/find-omissions` copies `_tmp-omissions-<ts>.json` to
  `OMISSIONS-<YYYYMMDDhhmmss>.json` in the package root
  (`get-next-check-target-ticket.js:213-235`). The `omissions/` subdirectory is where the
  phasified merge output is moved (`phasify-omissions.js:1155-1182`); glob both the root and
  `omissions/`.
- `[SPEC]` **Two shapes exist.** The legacy schema
  (`tickets/omissions-schema.json`) is
  `{parentRfcPath, parentRfcTitle, generatedAt, summary, rfcUnderstanding, omissions[],
  steps[]}` with `omissions[].id: ^O-\d{3}$`. Current `OMISSIONS-<ts>.json` is
  Tickets-shaped (`title`, `metadata`, `phases[].tickets[]`). No version field
  distinguishes them; branch on the presence of `phases` vs `omissions`.
- `[SPEC]` `OMISSIONS-phasified-<ts>.json` carries
  `title: "phasify-omissions auto-generated re-implementation plan"` and metadata with
  `phaseIdOffset`, `totalOmissionNodes`, `hardEdgesInSubgraph`, `crossBoundaryDependsOnFrom/To`.
  The merge into `Tickets.json` records `metadata.phasifyMerge = {offset, mergedPhaseIds,
  mergedAt, timestamp, snapshotPath}` (`phasify-omissions.js:1773-1781`).
- The file is Tickets-shaped: `title`, `metadata{source,generatedAt,analyzedSections}`,
  `phases[].tickets[]`. Omission tickets carry `foundOmissions[]`, `originalTicketKey`,
  `fromStub`, `stubs[]`, `forNextRound`.
- `foundOmissions[]` entries are anonymous: `{evaluations:[{criterion:"A"|"B"|"C",
  passed:boolean, reason:string, evidence:[{file,line, codes?}]}]}`. There is **no id**.
- `OMISSIONS-phasified-<ts>.json` is the post-merge view; it is derived, not a second
  finding set. Merge detection: presence of the phasified file + `round` increment +
  pre-offset tickets marked `R<N>`.
- The background sentinel `[::INSPECTION_FLAGGED::]` marks a clone that failed ABC
  inspection; `forNextRound: true` marks deferral to the next round.

### 4.8 consolidation manifest

`[SPEC]` `print-manifest-for-find-omissions.js:8,176`:

```json
[
  {
    "sourceKey": "P4-2",
    "stubs": [
      {"file": "src/call.rs", "line": 23, "content": "// [::STUB::] P4-2: implement codec enumeration"}
    ]
  }
]
```

One entry per unit; `sourceKey` is the ticket key the unit resolves to; `file` is
cwd-relative. The internal `unitId` is used for grouping but is **not emitted**.

`ROLLBACK-<ts>.json` holds the pre-edit marker contents:

```json
{
  "edited": [{"file": "src/call.rs", "line": 23, "oldContent": "// [::STUB::] P4-2: old plan"}],
  "removed": []
}
```

The reader also accepts a legacy flat array and treats it as all `edited` entries. Both
manifest and rollback are deleted by find-omissions on success; `manifests/` is removed if
empty.

### 4.9 README markers

`[SPEC]` `crystalize-readme/validate-marker-grammar.js`:

- Usage sections: `<::TEMPLATE-README::>` unresolved; `<::README-RESIDUE::>` residue.
- Examples: `<::TEMPLATE-EXAMPLES::>`; `<::EXAMPLES-RESIDUE::>`.
- After completion, a section's marker is gone; `grill.sections[].state` is the durable
  per-section record.

---

### 4.10 Version and compatibility quick table

| Artifact | Current | Old / compatible form | Discriminator |
|---|---|---|---|
| `Tickets.json` | no schema version; `title, round, metadata, phases`; runtime enum + `R<N>` | JSON Schema requires `contracts` min 1, runtime treats it optional; missing `phaseId` tolerated by consumers | shape/field presence; no version field |
| graphify/boundify/split status | `sourceFile, graphFile, currentStep, steps` + optional `generation, runs, runId, lastOutputDigest, coverage` | old file with only the first four fields is readable | absence of counters |
| educe `status.json` | `generation, entered, history, supplied, invalidated, assets, generationStartedAt, phases[18], readings` | old `phases[]` + `readings{}` is treated as generation 1 | absence of `generation` |
| educe artifact | `schema_version: 3` (typed step contracts) | `schema_version: 2`; v2 is never asked for v3 fields | `schema_version` |
| educe readings | current generation suffix; mixed/stale generations refused | legacy readers without suffix accepted as one family | filename suffix / `READER_MIXED` |
| explain facts | `schema: "explain-seed-facts-v1"` | earlier frame without current labels is reset, not migrated | facts block presence/labels |
| smooth report | `schemaVersion: 4` | v2/v3 recognized; **v2 can never pass** (v3-only surfaces blocked, verdict `unproven`) | `schemaVersion`; `UNPROVEN_DOWNGRADE` |
| smooth status | `schemaVersion: 2` | — | `schemaVersion` |
| smooth certificate | `schemaVersion: 3` | evidence-manifest mode when absent | `status`, `schemaVersion` |
| smooth calibration | `schemaVersion: 1` | — | `schemaVersion` |
| crystalize status | no version; steps 0–3; `grill.toc.nodes`, `grill.sections` | `grill.proposedIds`/`confirmedIds` migrated on read | presence of `grill.toc` vs id arrays |
| OMISSIONS | Tickets-shaped `{title, metadata, phases}` | legacy `{parentRfcPath, omissions[], steps[]}` with `O-NNN` | presence of `phases` vs `omissions` |
| consolidation manifest | array of `{sourceKey, stubs[]}` | — | array at top level |
| consolidation rollback | `{edited[], removed[]}` | legacy flat array treated as `edited` | object vs array |

---

## 5. Generated code vs implemented code

### 5.1 What boundify writes

A generated file is:

```rust
// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// ... provenance and warning ...
// ============================================================================
// Stub: implement …                    (kind-specific boilerplate, not a [::STUB::] line)
// [::STUB::] MUST implement NODE_ID=N0072: <node title>
```

- Header marker: `Initial Design Artifact — RFC-driven Implementation`
  (`boundify-helpers.js:492`). Never removed.
- Kind boilerplate: `// Stub: ...` (`boundify-helpers.js:401-442`), not a `[::STUB::]`.
- Node markers: `// [::STUB::] MUST implement NODE_ID=<id>: <title>`
  (`generate-dir-template.js:47,183-193`).

`[SPEC]` File existence, size and line count are **not** implementation evidence. A file
with a header and no marker can be fully implemented or partially implemented; there is no
per-file flag.

### 5.2 `changes[]`

- Only `/start-ticket` Step 9 writes it (via `update-ticket --append`); review writes
  `instrumentation`, `rfcDiscrepancies`, `notes`, not `changes`.
- Append semantics: array+array → `existing.concat(incoming)`; string+string → newline
  concatenation; otherwise replace. No dedup, no id, no time, no file path.
- Repeated start/rework appends duplicates. There is no key to deduplicate.
- `[SPEC]` a done/reviewed ticket is expected to carry a change record (completeness
  reporter), but the schema does not require it; an empty/missing `changes` is a gap, not
  an invalid ticket.

### 5.3 Stub grammar and scan scope

`[SPEC]` strict grammar (`validate-stub-format.js:19`):

```text
^//\s*\[::STUB::\]\s+(P[A-Z0-9]+-\d+|MUST\s+RESOLVE):\s*\S.*$
```

One line only; trailing non-whitespace lines reject. The generated
`// [::STUB::] MUST implement NODE_ID=N0072: …` line **does not match** this grammar and
contains no `P…-N` key. The ticket-key extractor therefore treats it as an orphan
(`validate-no-external-excuses.js`). This is why generated markers show up in a broad scan
but are not resolvable stubs.

Scan scope (`review/find-all-stubs.js`):

- Requires a directory argument.
- Skips `node_modules`, `target`, `.git`, `.claude`, `fixtures`, and every hidden entry.
- Scans only code extensions: `.rs .go .ts .tsx .js .jsx .cjs .mjs .vue .py .java .kt
  .swift .c .cpp .h .hpp .rb .php .cs` (`ticket-config.js:76-82`).
- `.md`, `.json`, `.yaml`, etc. are never scanned, so markers in prose/specs are excluded
  by extension, not by fence parsing.
- A marker is excluded only when the same line contains a quoted `[::STUB::]`
  (`stub-marker-scan.js:15-31`).
- `tests/` is scanned unless under `.claude` or a `fixtures` directory. Running
  `find-all-stubs.js src` scans only `src`.

`[OBSERVED]` gaia has 1,722 generated `MUST implement NODE_ID=…` markers; siprs's `src`
scan reports zero because its markers were removed/implemented. A naive marker count is
therefore not "unresolved ticket stubs".

### 5.4 Unresolved stub classification

`preflight-stub-cleanup.js` priority (`classifyStubs`):

1. `excuses`: terminal-excuse phrase and no imperative work verb.
2. `orphans`: no ticket key; key names no ticket; or status neither active nor completed.
3. `resolvedCandidates`: key's ticket status matches `reviewed|done|R[1-9]\d*`.
4. `pendingObligations`: key's ticket status is `todo|in_progress|planned|remanded`.

A reviewed resolve-by ticket with a surviving marker is a `resolvedCandidate`, not an
automatic removal; the AI must inspect and run `remove-stub.js`. Nothing auto-removes.
`[UNKNOWN]` from artifacts alone: whether a `resolvedCandidate` is actually resolved; code
inspection is required.

### 5.5 Malfeasance

Schema (`malfeasance-schema.json`):

```json
{"version":1,"records":[{
  "id":1,"file":"src/lib.rs","line":42,"description":"stub remains",
  "detected_at":"2026-11-01T00:00:00.000Z","status":"open",
  "resolved_at":"2026-11-02T00:00:00.000Z","resolved_by_ticket":17,"note":"resolved by inspection"
}]}
```

- `status`: `open | resolved | false_positive`.
- `resolved_at` auto-set when status becomes `resolved`; overwritten if set again;
  not set for `false_positive`.
- `resolved_by_ticket` is a positive integer ticket id, not a key; not globally unique.
- `scan-crimes.sh` only lists records; detection is upstream from stub/marker scans.

### 5.6 Omission tracking

| Question | Answer |
|---|---|
| Is this omission unresolved? | A clone with `forNextRound: true` or a `foundOmissions` entry on a ticket that has not been re-implemented. `remanded` marks the source ticket inspected with a gap. |
| Is it repaired? | The clone ticket reaches `reviewed`/`R<N>` and its marker/contract tests pass; there is no per-omission status field. |
| Was it re-inspected? | `round` increments; pre-merge tickets become `R<N>`; the clone may receive more `foundOmissions` (appended, no dedup). The per-ticket queue record (`done:true`) is deleted at cleanup. |
| Stable key? | No. `foundOmissions` entries have no id. The clone is linked to its source by `originalTicketKey`, a snapshot not updated by consolidation. `O-NNN` belongs to the separate legacy `OMISSIONS-*.json` schema family, not to clones. |
| Exact finding shape? | `{severity?, recommendation?, evaluations:[{criterion:"A"|"B"|"C", passed, reason, evidence:[{file,line,codes}]}]}`. `severity`/`recommendation` are observed and not required by the validator; `evaluations` is required. |
| Inspection-target fields? | `targetStubs[]` entries are `{id, ticketRef, file, line, markerText, contracts[], deferredTo, status, resolutionPlan}`; `targetCrimes[]` add `crimeType` and optional `falsePositive{justification}`. When none are found the field may be the string `"verified_empty"`. `TS-00N` ids are regenerated per scan and are not stable. `enumerate-ticket-targets.js` replaces both fields wholesale and sets each item to `pending`; **no current script writes per-item `status` or `resolvedAt`**, so observed resolved statuses are hand-maintained. |

---

## 6. Cross-stage identity, dedup, and generations

### 6.1 The chain that actually joins

| Link | Fields | Guarantee |
|---|---|---|
| Requirement → unit | `unitIds` pattern `^(op|seq|xdir|ctr|obl)-` on graph nodes; RFC `<!-- unit: … -->` anchors | `[SPEC]` for the pattern; the requirement inventory id is not on the node |
| Package → graph | `seed_index`, `contract_registry`, `implementation_order` | `[SPEC]` |
| Node → dir/file | Dirs-Tree `mappedNodeIds[].nodeId`; top-level `distribution.units[unitId]{nodeIds,paths}` | `[SPEC]` |
| Node/edge → contract | edge `contracts[].id` (`C###` or `contract-<boundary>`) and `sourceEdge` (free string) | `[SPEC]` for shape; `sourceEdge` is not validated |
| Node → ticket | ticket `nodeIds[]` (may include unit ids appended by split) | `[SPEC]` |
| Ticket → file | `default_files[]` derived from Dirs-Tree via `nodeIds` | `[SPEC]` |
| Ticket → spec | `specs/<ticketKey>.md`; `specPath` checkbox | `[SPEC]` for the path convention |
| Ticket → tests | `testUnit`, `testIntegration`, `testExceptions`, `planTestCode` strings | `[SPEC]` shape; not a foreign key |
| Ticket → implementation | `changes[]`, `default_files`, status | `[INFERRED]`; no per-file join |

The chain is **not** a fully joined foreign-key graph. Requirement inventory ids are not
on graph nodes; `contracts[].sourceEdge` is a free string; `changes[]` has no file field.
A renderer should use the joins that exist and treat the rest as co-location in the same
package/stage, not as identity.

### 6.2 Shared boundary contracts

- `[SPEC]` The workspace registry is `WORKSPACIFY-ALLOCATE-MANIFEST.json.contract_registry`.
  Each row has `contract_id`, `boundary_id`, `consumer_package`, `provider_package`,
  `connection_kind`, `owners`, `clauses`, `source_refs`.
- `[SPEC]` Per-package graphs carry projected rows: only rows whose `ctr-<boundary_id>`
  appears in a node's `unitIds`; the global registry index is preserved as `C9xx`
  (`900 + index`), a second direction in the same package uses `C7xx` (`700 + index`)
  (`rfc-graph/project-boundary-contracts.js:60-95`).
- `[SPEC]` Workspace-wide unique count = registry rows deduplicated by `contract_id`
  (equivalently `boundary_id`). Package graphs and `RFC-BOUNDARY-CONTRACTS.json` are views;
  do not sum them.
- `[OBSERVED]` gaia: 84 rows, 84 distinct `contract_id`, 84 distinct `boundary_id`.

### 6.3 ID survival

| ID | Re-graphify | Ticket renumbering/consolidation | Omission addition | Drill |
|---|---|---|---|---|
| `N####` | Delta graphify diffs by id; a full re-authoring can reassign. No stability guarantee. | n/a | n/a | Same delta model. |
| `op-/seq-/xdir-/ctr-/obl-` unit ids | Stable if RFC anchors/view unchanged; `attach-unit-ids.js` refuses to rewrite an existing unit projection. | n/a | n/a | Stable. |
| ticket key `P<n>-<id>` | n/a | **Not stable**; consolidation renumbers. Only `prerequisites[].ticket` and `distribution.units[].obligation.implementerTicketKey/Id` are remapped. `originalTicketKey`, `targetStubs`, `targetCrimes`, `stubs`, source markers are not remapped. | New clones get new keys; pre-existing keys unchanged; phasify rewrites markers. | Same as consolidation. |
| `C###` | Authored per graph; unstable across re-authoring. | n/a | n/a | Re-authored. |
| `boundary_id`/`contract_id` | Stable within a manifest; regeneration can reallocate. | n/a | n/a | Unchanged if manifest reused. |
| `TS-00N` | n/a | n/a | **Not stable** (per-process counter). | n/a |
| `O-NNN` | Legacy omission artifact only; not carried into tickets. | n/a | n/a | n/a |
| `originalTicketKey` | n/a | **Snapshot**, not remapped. | Created. | No. |

### 6.4 `generation`, `runs`, `runId`, `round`

- graphify/boundify/split: `runs` = invocations with distinct `runId`; `generation` = count
  of changed output digests; `runId` = one invocation. No archive.
- smooth: `generation` = report generation; `archive/<N>/` holds the previous pair.
- educe: `generation` = reader generation; `history[]` holds superseded phase records;
  `generationStartedAt` is the current generation's opening time.
- tickets: `round` = omission merge round; `R<N>` = ticket closed/processed in round N.
  It is **not** an artifact generation.
- There is no cross-stage generation/run key. Correlate by timestamp and by digest, not by
  an id.
- Archives: smooth archive is the same logical report at the previous revision; educe
  history is the previous phase record set; regeneration archive is a byte copy of the
  pre-transaction file; graphify/boundify/split have no archived version.

### 6.5 Density formula

`[SPEC]` absence: no `maxR`, `E(p)`, `densityWeight`, or `generationGap` exists anywhere in
the repository. The density model in the first document is `[PROPOSAL]`. The only
source-side "density" terms are unrelated (ticket field density, thin-normative density,
dependency density).

---

## 7. Fixtures

The fixture bundle is at `docs/fixtures/gif-animation/`. It is synthetic (not anonymized
real data) and deliberately small.

Files:

- `README.md` — materialization instructions and case map.
- `workspace-min.json` — a bundle of files for case 1 (workspacify only).
- `workspace-mixed.json` — a bundle for cases 2–7 (packages at different stages).
- `expected.json` — expected parser output per case.

Bundle format:

```json
{
  "description": "synthetic",
  "root": "workspace-mixed",
  "files": {
    "WORKSPACIFY-TREE-MANIFEST.json": { "artifact_kind": "workspacify-tree-manifest" },
    "pkgs/alpha/RFC-SEED.md": "# RFC Seed: alpha"
  }
}
```

Objects are serialized as JSON, strings as raw text. No ellipses are used; every bundle
parses as JSON. The expected file gives, for each case: detected packages, adopted/ignored
artifacts, per-stage state with evidence, directly computable counts, recoverable events and
time precision, undeterminable items, and warnings.

Cases covered:

1. workspacify complete, no later artifacts;
2. multiple packages at different stages;
3. ticket status differences (todo/made/planned/done/reviewed);
4. stubs/crimes/omissions before and after resolution;
5. crystalize residue/complete and drill mid/complete;
6. legitimate root `Tickets.json` vs a legacy root aggregate;
7. stale evidence, missing artifacts, regenerated artifacts, `.delta`/`.bak`/`archive` decoys.

---

## 8. Environment and proposal status

### 8.1 Confirmed environment

| Item | Value | Tag |
|---|---|---|
| OS | macOS 26.2 (Darwin 25.2.0) | `[OBSERVED]` |
| CPU | arm64 (Apple Silicon) | `[OBSERVED]` |
| Node.js | v26.0.0 | `[OBSERVED]` |
| npm | 12.1.0 | `[OBSERVED]` |
| `tools/conver/package.json` | `"type": "module"`, engines `>=22` | `[OBSERVED]` |
| `tools/conver/.claude/package.json` | `"type": "commonjs"` | `[OBSERVED]` |
| Image/GIF libraries installed | none (`@napi-rs/canvas`, `gifenc`, `sharp`, `gif-encoder-2` absent) | `[OBSERVED]` |
| gaia git | yes; 63 `RFC-GRAPH.json`/`RFC-Dirs-Tree.json`/`Tickets.json` files tracked; 7,027 files tracked | `[OBSERVED]` |
| `progress-gif/` ignored | no (`.gitignore` covers only `.DS_Store`, `node_modules`, `target`, `dist`) | `[OBSERVED]` |

### 8.2 Placement and module system

- Entry filename requested by the user: `draw-progress-gif.js`.
- If placed at `tools/conver/draw-progress-gif.js`, the nearest `package.json` is
  `tools/conver/package.json` (`type: module`) → the `.js` file is ESM. `[SPEC]` by Node.
- If placed under `tools/conver/.claude/scripts/progress-gif/`, the nearest package is
  `.claude/package.json` (`type: commonjs`) → a `.js` file is CommonJS. Use `.mjs` for ESM
  or write CommonJS. This is a correction to the first document's layout.
- Distribution form: **not specified by the user**. Running from the conver repository
  against `-t` is a `[PROPOSAL]`. Copying the script to another workspace is also a
  `[PROPOSAL]`; it would need its own `package.json` and dependencies.

### 8.3 Dependencies

- No image/GIF library is installed. Adding `@napi-rs/canvas` (native prebuilt) and
  `gifenc` (pure JS) is feasible but not user-confirmed.
- The project's Plan Gate classifies a new dependency as Never-Tiny; implementation must go
  through the ticket pipeline. This is a process fact, not a technical prohibition.
- Bundled fonts: none found. Using system fonts is possible on macOS; bundling a font is a
  `[PROPOSAL]`.

### 8.4 User-confirmed requirements vs proposals

**User-confirmed (from the original brief):**

- `node draw-progress-gif.js -t <workspace>`.
- Auto-create `<target>/progress-gif/`.
- Save `YYYYMMDDhhmmss.gif` as a snapshot.
- Assume `/workspacify-*` complete; validate manifests; PASS or error exit.
- Render the 16-command process as rising implementation-space density.
- Use JSON/MD artifacts heavily.
- GIF must show density rising, which command/part is progressing, abstractly (not a
  dashboard).
- Display date/time and one stage name; no other text.

**Proposals in the first document (not user-confirmed):**

- 720×720, 180 frames, 15 fps, 128-colour palette.
- The Condensation Lattice concept, 29-cell layout, four acts, colours, motion rules.
- `E(p)`, `maxR`, density weights, particle counts, cluster radii.
- Module split, `@napi-rs/canvas` + `gifenc`, atomic write scheme.
- `--out`, `--size`, `--fps`, `--frames`, `--seed`, `--max-particles`, `--from`, `--to`,
  `--no-git`, `--no-source-scan`, `--time-format`, `--json`, `--dry-run`.
- Interpreting the brief's `hh:ss` as `hh:mm`. **The user has not confirmed this.** The
  original text is `MM/DD hh:ss`; the renderer should either honour it literally or make
  the format configurable and document the default.

---

## Appendix — minimal correction list for the first document

1. Remove the claim that `seed_index` is 1:1 with `tree.workspace.packages`; use the union
   and `seed_required`.
2. Fix the root `Tickets.json` rule: a root package must be declared.
3. Remove the spec-hash selection rule for `*-sequences.json`; ambiguity is refused.
4. Downgrade explain completion to `[UNKNOWN]`/heuristic.
5. Require split step `6`, not mere `Tickets.json` existence.
6. Replace the smooth pass rule with `verdictIsPass` + certificate/input binding.
7. Downgrade consolidate zero-stub inference to `[UNKNOWN]`.
8. Correct `remanded` and `R<N>` semantics.
9. Add: generated stub markers fail the strict grammar; a broad scan counts them.
10. Add: `changes[]` has no dedup/id/time; it is AI prose.
11. Add: Malfeasance `resolved_at` is auto-set and overwritten; `resolved_by_ticket` is a
    non-unique integer id.
12. Add: no stable omission id; `originalTicketKey` is a snapshot.
13. Add: no graph/boundify/split archive; `generation` cannot be mapped to a stored version.
14. Mark the entire density formula as `[PROPOSAL]`.
15. Correct the script placement/module-system note (`.claude` is CommonJS).
16. State that `hh:ss → hh:mm` is an unconfirmed interpretation.
