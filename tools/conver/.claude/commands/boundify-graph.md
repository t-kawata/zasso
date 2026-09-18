---
description: Generates a directory tree and Dirs-Tree.json from graph JSON produced by /graphify-rfc.
argument-hint: </path/to/*-GRAPH.json>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /boundify-graph <graph-file-path>

Role: accept `/graphify-rfc` graph; verify/heal graph junction; generate safe implementation directory tree.

Invariants:
- In: graph JSON only; absent graph → cannot run.
- graph repair: error/warning → fix graph per emitted remedy; re-run; no return to `/graphify-rfc`.
- after every graph fix → `verify-graph-integrity.js` regression check.
- prose kinds `rationale` / `glossary` / `requirement`: no file targets; traceability via header cross-references in edge-connected files.
- prune: directory with <2 child nodes → remove; single child → flatten into parent.
- empty implementation file → language/kind declaration stub, function signature + implementation TODO comment.
- header cross-reference to prose node: design intent, explicit `→` / `←`, connected file path.
- script errors: follow emitted problem/resolution; re-run required step.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Arguments

In:
- arg: required graph JSON path, absolute | relative; output of `/graphify-rfc`.
- example: `RFC-BOUNDIFY-GRAPH.json` | `/absolute/path/to/rfc-graph.json`.

## Derived Paths

```bash
graphPath="$1"
graphDir="$(dirname "$1")"
basename="$(basename "$1" -GRAPH.json)"
dirsTreePath="${graphDir}/${basename}-Dirs-Tree.json"
statusPath="${graphDir}/${basename}-BOUNDIFY-Status.json"

# Extract sourceFile (original Markdown document path) from the graph JSON
sourcePath=$(node -p "JSON.parse(require('fs').readFileSync('${graphPath}','utf8')).sourceFile||''")
if [ -z "$sourcePath" ]; then
  echo "[ERROR] sourceFile not found in graph JSON"
  exit 1
fi
```

- `graphPath`: input graph JSON.
- `dirsTreePath`: output Dirs-Tree JSON.
- `statusPath`: BOUNDIFY status; `update-boundify-step-status.js` reads/writes it.
- `sourcePath`: graph `sourceFile`; original Markdown path.

## Guidelines

- `/boundify-graph` takes `/graphify-rfc` output as sole input.
- scripts: `.claude/scripts/rfc-graph/`.
- status calls: `--status=<path>`.
- main generator: `--graph=<path>`.
- self-heal: script error/warning → graph fix per message → re-run; after graph fix → integrity regression check.
- prose exclusion: `rationale` / `glossary` / `requirement`; connected implementation header embeds design-intent reference (PX-28/PX-30).
- prune (PX-29): <2-child directory remove; single child flatten.
- declaration stubs (PX-28): empty unimplemented file → language/kind signature + implementation TODO.
- cross-references (PX-30): connected prose-node design intent in file header.

## List of Scripts Used

Root: `.claude/scripts/rfc-graph/`.

| Script | Contract |
|---|---|
| `boundify-graph-to-dirs.js --graph=<path> [--json\|--quiet\|--dry-run\|--force]` | graph load, language collection, tree generation, edge projection, cycle detection, file output, modes |
| `validate-dirs-tree-schema.js --dirs-tree=<path> --graph=<path>` | Dirs-Tree nodes/edges/trees/dependencyDirections schema validation |
| `verify-graph-integrity.js --graph-after=<path> --graph-before=<path> --source=<path>` | regression: nodes/edges/headingRefs/orphans/coverage |
| `generate-all-dir-templates.js --dirs-tree=<path> [--dry-run] [--delete]` | all-language batch generation/deletion |
| `generate-dir-template.js --dirs-tree=<path> --root-dir=<path> --lang=<lang> [--dry-run] [--force] [--delete]` | one-language directory/file generation/deletion |
| `boundify-helpers.js` | library: edge projection, Tarjan SCC, filenames, language collection |
| `boundify-tree.js` | library: domain hierarchy, tree build, report |
| `update-boundify-step-status.js --status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <N>` | BOUNDIFY status; `backup` / `cleanup` commands below are retained |
| `show-graph-summary-markdown.js --graph=<path> --source=<path>` | kind-organized graph summary |
| `query.js --graph=<path> --source=<path> --id=<id> --hops=<N>` | auxiliary regression query |
| `validate-slug.js --graph=<path>` | lower_snake_case / 25-char / leading-lowercase validation; error `remedy` has graph CRUD fix example |

## Step 0: Graph Loading, Language Collection (Pre-processing)

Confirm valid graph; collect all node `language` fields.

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 0
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --dry-run
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 0
```

### Recovery on Error

fail → fix graph per script output; always regression check; reset 0; re-run Step 0.

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 0
```

## Step 1: Verification and Self-Healing Loop (New)

Verify graphify→boundify junction. Graph problem → script fix instructions → fix → re-run → confirm disappearance.

### 5 Verification Axes

| Axis | Check | Detects |
|---|---|---|
| 1 | node ID set unchanged | accidental node add/delete |
| 2 | edges unchanged | accidental edge deletion/modification |
| 3 | all headingRefs resolve | broken references |
| 4 | no orphan node | disconnected edge set |
| 5 | all source headings covered | uncovered sections |

Start Step 1; replace previous backup with `$graphPath.bak`.

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 1
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" backup
```

Heal-loop junction; max 5:
- run Checks.
- both `{"ok":true}` → run Success only.
- any fail → judge: fix graph per `remedies`; slug fail → run remedy CRUD command; repeat Checks.
- exhausted → print error; reset 1.

Checks:

```bash
node .claude/scripts/rfc-graph/verify-graph-integrity.js \
  --graph-after="$graphPath" \
  --graph-before="$graphPath.bak" \
  --source="$sourcePath"
node .claude/scripts/rfc-graph/validate-slug.js --graph="$graphPath"
```

Success only:

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 1
```

Exhausted:

```bash
echo "[ERROR] Self-healing loop reached maximum attempts (5)."
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 1
```

### Recovery on Error

Fix graph per `verify-graph-integrity.js` / `validate-slug.js` `remedies`; slug → exact `remedy` CRUD command; run Checks again to prove disappearance. Start over only when required: reset 1.

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 1
```

## Step 2: Dirs-Tree.json Generation + Schema Validation

Generate Dirs-Tree; require output; schema-validate. Combines former tree-generation and schema-validation steps.

Automatic:
- hierarchy: domain structure.
- prune: <2 child nodes remove; single child flatten.
- prose exclusion: `rationale` / `glossary` / `requirement` not file targets.

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 2
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath"
test -f "$dirsTreePath" && echo "Dirs-Tree.json: OK" || echo "Dirs-Tree.json: MISSING"
node .claude/scripts/rfc-graph/validate-dirs-tree-schema.js \
  --dirs-tree="$dirsTreePath" \
  --graph="$graphPath"
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 2
```

### When Cyclic Dependencies Are Detected

`boundify-graph-to-dirs.js` `warnings` name cycles + fix procedure. Fix graph edge definitions per warning; regenerate; confirm cycle resolved; always run `verify-graph-integrity.js` after edge repair.

### On Schema Validation Error

Read priority-ordered `validate-dirs-tree-schema.js` errors; fix one error at a time from top; re-run after every fix.

### Recovery on Error

After graph repair per any script error: re-run; resolved → run `verify-graph-integrity.js`. Start over only when required: delete generated Dirs-Tree; reset 2.

```bash
rm -f "$dirsTreePath"
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 2
```

### Mode Switching

- `--quiet`: stdout suppressed; stderr only on error; CI.
- `--json`: stdout JSON only; pipeline chaining.

```bash
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --json
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --quiet
```

## Step 3: Batch File Generation

Preview all languages; review; generate actual directories/template files.

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 3
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath" --dry-run
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath"
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 3
```

### Structure of Generated Files

- header: source graph, mapped nodes, language, timestamp; language-appropriate comment (PX-30).
- empty/unimplemented: language/kind declaration stub: struct declaration or function signature + implementation TODO comment (PX-28).
- prose-node connection: header embeds design-intent reference; explicit `→`/`←`, connected file path (PX-30).

### Recovery on Error

generation fail → fix per error; re-run generator. Full output rebuild if required: `--delete`; then generate. Unavoidable restart: reset 3.

```bash
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath" --delete
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath"
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 3
```

## Completion Report

Clean remaining backup files:

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" cleanup
```

Report:
- input graph: `$graphPath`.
- output Dirs-Tree: `$dirsTreePath`.
- status: `$statusPath`.
- node count; edge count; cyclic dependencies detected/not detected.
- final schema validation result.
- final graph-integrity regression result.
- generated file count across languages.
- resolved prose-node/cross-reference count.
- prune: empty-directory removals / flattenings.
- auto-generated declaration stub count.

Done: implementation may begin from generated tree/files.
