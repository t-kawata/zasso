---
description: Generates a directory tree and Dirs-Tree.json from graph JSON produced by /graphify-rfc.
argument-hint: </path/to/*-GRAPH.json>
---

# /boundify-graph-to-dirs <graph-file-path>

**Role**: Accepts the graph JSON produced by /graphify-rfc as input, and through a verification and self-healing loop, generates an implementation directory tree with safe boundaries.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

- **1st argument (required)**: File path to the graph JSON produced by /graphify-rfc (absolute or relative path)
  - Example: `RFC-BOUNDIFY-GRAPH.json`
  - Example: `/absolute/path/to/rfc-graph.json`

## Derived Paths

The following file paths are computed from the graph JSON path:

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

- `graphPath`: Input graph JSON file
- `dirsTreePath`: Output directory tree JSON file
- `statusPath`: Progress management status JSON file (read/written by update-boundify-step-status.js)
- `sourcePath`: Path to the original Markdown document (extracted from the graph JSON's sourceFile field)

## Guidelines

- **/boundify-graph-to-dirs takes the output of /graphify-rfc as its sole input**. It cannot run without an existing graph.
- Scripts used in each Step are located under `.claude/scripts/rfc-graph/`.
- Calls to update-boundify-step-status.js use the `--status=<path>` flag.
- boundify-graph-to-dirs.js is called with the `--graph=<path>` argument format.
- **Self-healing loop**: If errors or warnings occur in any Step, the AI fixes the graph data according to the messages output by the scripts and re-runs. There is no need to return to `/graphify-rfc`. After fixing, always run `verify-graph-integrity.js` for regression checking.
- **Prose kind file generation exclusion**: 3 kinds — `rationale`/`glossary`/`requirement` — are design-information nodes without runtime behavior, so they are excluded from file generation targets. The design information from these nodes is embedded as cross-references within the header comments of files connected via edges (PX-28/PX-30).
- **Prune rules**: During tree generation, directories that do not meet the minimum 2-child-node requirement are removed; directories with a single child are flattened into the parent (PX-29).
- **Declaration stubs**: Empty files without implementation automatically receive declaration stubs (function signature + implementation TODO comment) appropriate to the language and kind. This allows implementation to begin immediately (PX-28).
- **Cross-references**: File header comments connected to prose nodes (design information) embed references to the design intent of the corresponding prose node. This ensures traceability between the design document and implementation files (PX-30).

## List of Scripts Used

Located under `.claude/scripts/rfc-graph/`.

| Script | Arguments | Description |
|---|---|---|
| `boundify-graph-to-dirs.js` | `--graph=<path> [--json\|--quiet\|--dry-run\|--force]` | Main script. Graph loading, language collection, tree generation, edge projection, cycle detection, file output, 3 output mode control |
| `validate-dirs-tree-schema.js` | `--dirs-tree=<path> --graph=<path>` | Dirs-Tree.json schema validation (structure validation of nodes/edges/trees/dependencyDirections) |
| `verify-graph-integrity.js` | `--graph-after=<path> --graph-before=<path> --source=<path>` | 5-axis check (nodes/edges/headingRefs/orphans/coverage). Used for regression checking |
| `generate-all-dir-templates.js` | `--dirs-tree=<path> [--dry-run] [--delete]` | Batch generation/deletion for all languages in Dirs-Tree.json |
| `generate-dir-template.js` | `--dirs-tree=<path> --root-dir=<path> --lang=<lang> [--dry-run] [--force] [--delete]` | Generate/delete actual directories and files from directory tree (single language) |
| `boundify-helpers.js` | (library) | Pure function collection (projectEdgesToDirectories, tarjanSCC, deduplicateFileNames, collectLanguagesFromGraph, etc.) |
| `boundify-tree.js` | (library) | Directory tree generation (buildDomainHierarchy, buildDirectoryTree, generateReport, etc.) |
| `update-boundify-step-status.js` | `--status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <N>` | BOUNDIFY-Status.json progress management (5 subcommands) |
| `show-graph-summary-markdown.js` | `--graph=<path> --source=<path>` | Outputs graph summary in kind-organized Markdown format |
| `query.js` | `--graph=<path> --source=<path> --id=<nodeId> --hops=<N>` | Multi-hop graph search (auxiliary means for regression checking) |
| `validate-slug.js` | `--graph=<path>` | Validates naming conventions for all nodes' slug fields (lower_snake_case/25 char limit/leading lowercase letter). On error, outputs example crud.js fix commands in remedy |

Many scripts output the problem and resolution method on error. Follow the instructions output and re-run.

## Step 0: Graph Loading, Language Collection (Pre-processing)

Confirm the graph JSON is valid and read all nodes' `language` fields to identify the languages in use.

```bash
# Start Step 0 (update progress status to running)
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 0

# Run the main script in dry-run mode to confirm only pre-processing
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --dry-run

# Step 0 successful completion (update progress status to done and advance currentStep to 1)
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 0
```

### Recovery on Error
After fixing the graph data according to the error message output by the script, use `reset-to-step 0` to reset the status, then re-run the Step 0 commands from the beginning.

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 0
```

Always run regression checking after fixing.

## Step 1: Verification and Self-Healing Loop (New)

Verify on 5 axes that the graphify → boundify junction is intact. If problems are found, the script outputs specific fix instructions, and the AI proceeds through fix → re-run → problem disappearance confirmation.

### 5 Verification Axes

| Axis | Check Content | Problem Detected |
|---|---|---|
| 1 | Whether the nodes ID set has changed | Accidental node deletion or addition |
| 2 | Whether edges have changed | Accidental edge deletion or modification |
| 3 | Whether all headingRefs are resolvable | Broken references |
| 4 | Whether orphan nodes exist | Nodes with disconnected edges |
| 5 | Whether all source headings are covered | Uncovered sections |

```bash
# Start Step 1
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 1

# Delete previous backup and create a new one
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" backup

# Run the 5-axis check
node .claude/scripts/rfc-graph/verify-graph-integrity.js \
  --graph-after="$graphPath" \
  --graph-before="$graphPath.bak" \
  --source="$sourcePath"

# Run slug validation
node .claude/scripts/rfc-graph/validate-slug.js --graph="$graphPath"
```

Repeat the following procedure until both the 5-axis check and slug validation return `{"ok":true}` (max 5 iterations):

```bash
# Run verify-graph-integrity.js and validate-slug.js
node .claude/scripts/rfc-graph/verify-graph-integrity.js \
  --graph-after="$graphPath" \
  --graph-before="$graphPath.bak" \
  --source="$sourcePath"
node .claude/scripts/rfc-graph/validate-slug.js --graph="$graphPath"
```

Branch based on verification results:

- **If `{"ok":true}` (both)** → Self-healing loop ends. Delete the backup and proceed to Step 1 successful completion.
  ```bash
  node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" cleanup
  node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 1
  ```

- **If errors are reported** → Fix the graph data following the `remedies` field output by the script, then re-run verify-graph-integrity.js and validate-slug.js. For slug errors, fix the slug using the crud.js command in the remedy. Repeat this fix → run cycle up to 5 times.

- **If `{"ok":true}` is not reached after 5 iterations** → Recover with reset-to-step 1.
  ```bash
  echo "[ERROR] Self-healing loop reached maximum attempts (5)."
  node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 1
  ```

### Recovery on Error
After fixing the graph data according to the `remedies` field output by `verify-graph-integrity.js` or `validate-slug.js`, re-run both scripts to confirm the error has disappeared. For slug errors, fix the slug using the crud.js command in the remedy. Repeat until `{"ok":true}` is returned. If the situation requires starting over from scratch with `reset-to-step 1`, run the following command:

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 1
```

## Step 2: Dirs-Tree.json Generation + Schema Validation

Generate Dirs-Tree.json and verify it conforms to the JSON Schema. This merges the old Step 1 (tree generation) and old Step 3 (schema validation).

During tree generation, the following processes are automatically applied:
- **Hierarchization**: Nodes are placed into the directory hierarchy based on domain structure (domain hierarchy)
- **Prune**: Directories not meeting the minimum 2-child-node requirement are removed; single-child directories are flattened into the parent
- **Prose exclusion**: 3 kinds — `rationale`/`glossary`/`requirement` — are automatically excluded from file generation targets

```bash
# Start Step 2
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 2

# Generate Dirs-Tree.json (if cyclic dependencies exist, they are recorded in warnings)
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath"

# Verify output file existence
test -f "$dirsTreePath" && echo "Dirs-Tree.json: OK" || echo "Dirs-Tree.json: MISSING"

# Run schema validation
node .claude/scripts/rfc-graph/validate-dirs-tree-schema.js \
  --dirs-tree="$dirsTreePath" \
  --graph="$graphPath"

# Step 2 successful completion
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 2
```

### When Cyclic Dependencies Are Detected
The `warnings` output by boundify-graph-to-dirs.js contain details about cyclic dependencies and fix procedures. After the AI fixes the graph's edge definitions according to the instructions, re-run `boundify-graph-to-dirs.js` and confirm the cycle has been resolved. After fixing edges, always run `verify-graph-integrity.js` for regression checking.

### On Schema Validation Error
The error list output by `validate-dirs-tree-schema.js` includes fix priority instructions at the top. Fix one error at a time from the top, re-running after each fix.

### Recovery on Error
After fixing the graph data according to the instructions in each script's error message, re-run. Once the issue is resolved, run `verify-graph-integrity.js` for regression checking. If the situation requires starting over from scratch:

```bash
# Delete generated files before resetting
rm -f "$dirsTreePath"
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 2
```

### Mode Switching

- **`--quiet`**: Suppress standard output (for CI). Outputs to stderr only on error.
- **`--json`**: Output only JSON to standard output (for pipeline chaining).

```bash
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --json
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --quiet
```

## Step 3: Batch File Generation

Based on Dirs-Tree.json, batch generate the actual directories and template files.

```bash
# Start Step 3
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 3

# Preview generation output for all languages with dry-run
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath" --dry-run

# After review, execute actual generation
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath"

# Step 3 successful completion
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 3
```

### Structure of Generated Files

Each file generated by `generate-all-dir-templates.js` automatically receives the following elements:

- **Header comment**: A comment at the top of every file containing graph-derived metadata (source graph file, list of mapped nodes, language, timestamp) in language-appropriate syntax. This makes each file's origin clear (PX-30).
- **Declaration stubs**: Empty files without implementation receive declaration stubs (struct declarations, function signatures + implementation TODO comments) as templates appropriate to the kind and language. This allows implementation to begin immediately (PX-28).
- **Cross-references**: The header comments of files connected to prose nodes (`rationale`/`glossary`/`requirement`) embed references to the design intent of the corresponding prose node. The direction (`→`/`←`) and connected file path are made explicit (PX-30).

### Recovery on Error
If generation fails, fix according to the error message, then re-run `generate-all-dir-templates.js`. If necessary, delete existing output with `--delete` before re-running:

```bash
# Fully delete output before re-running
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath" --delete
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath"

# If unavoidable, reset
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 3
```

## Completion Report

All Steps completed successfully. Clean up temporary files:

```bash
# Delete any remaining backup files
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" cleanup
```

Report the following information:

- **Input graph file**: `$graphPath`
- **Output Dirs-Tree.json**: `$dirsTreePath`
- **Progress status file**: `$statusPath`
- **Node count**: Obtained from boundify-graph-to-dirs.js output
- **Edge count**: Same as above
- **Cyclic dependencies**: Detected or not
- **Schema validation**: validate-dirs-tree-schema.js final result
- **Regression check**: verify-graph-integrity.js final result
- **Generated file count**: Total file count across all languages
- **Cross-references**: Number of resolved prose nodes and connections (obtained from boundify-graph-to-dirs.js output)
- **Prune results**: Number of empty directories removed and flattenings (same as above)
- **Declaration stub quality**: Number of auto-generated declaration stubs (same as above)

After completion, implementation can begin from the generated directory tree and files.
