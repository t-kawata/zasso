---
description: Executes graph conversion via 7-step progress control (heading deduplication → node splitting → edge assignment → machine verification → self-verification → final quality verification).
argument-hint: </path/to/RFC-?.md>
---

# /graphify-rfc <source-file-path>

**Role**: Splits a large Markdown design document into fine-grained I/O-boundary nodes and persists it as a graph structure connected by attributed edges. The generated graph is available from the `/formulate-tickets` and `/formulate-tickets-for-next` slash commands.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

- **1st argument (required)**: File path to the design document (absolute or relative path)
  - Example: `RFC-GRAPHIFY.md`
  - Example: `/absolute/path/to/rfc-doc.md`

## Derived Paths

The following file paths are computed from the source document path:

```bash
graphPath="$(dirname "$1")/$(basename "$1" .md)-GRAPH.json"
statusPath="$(dirname "$1")/$(basename "$1" .md)-GRAPHIFY-Status.json"
```

- `graphPath`: The generated graph JSON file
- `statusPath`: Progress management status JSON file (read/written by update-step-status.js)

## Guidelines

- **The /graphify-rfc slash command always splits at a finer granularity than the /formulate-tickets and /formulate-tickets-for-next slash commands (divergence).** When /formulate-tickets and /formulate-tickets-for-next extract information from the graph at the necessary granularity, overly fine nodes can be aggregated, but overly coarse nodes cannot be split.
- Scripts used in each Step are located under `.claude/scripts/rfc-graph/`.
- Calls to update-step-status.js use the `--graphify-status=<path>` prefix.
- crud.js / verify.js / query.js are called with `--graph=<path>` / `--source=<path>` argument format.

## List of Scripts Used

Located under `.claude/scripts/rfc-graph/`.

| Script | Arguments | Description |
|---|---|---|
| `crud.js` | `--graph=<path> <subcommand>` (see each subcommand) | The sole write path for the graph. create-nodes / list-nodes / get-node / update-node / delete-node / create-edges / delete-edges |
| `deduplicate-headings.js` | `<source-path>` | Heading deduplication (appends A-Z to same-level, same-text headings) |
| `resolve-by-heading.js` | `<source-path> --target=<heading>` | headingRefs resolution (4-level fallback matching) |
| `verify.js` | `--graph=<path> --source=<path>` | Machine verification of uncovered lines and orphan nodes |
| `validate-slug.js` | `--graph=<path>` | Slug naming convention and length validation for all nodes (used in Step 1 self-healing loop) |
| `query.js` | `--graph=<path> --source=<path> --id=<nodeId> --hops=<N>` | Multi-hop graph search and Markdown-formatted output |
| `test-query-all.js` | `--graph=<path> --source=<path>` | Batch verification of all headingRefs (exit 0/1 + outputs _fix_graph_hints.json) |
| `query-fix-hints.js` | `--hints=<path> [--id=<nodeId>] [--diagnosis=<M0-M10>] [--refId=<refId>]` | Search _fix_graph_hints.json and display results in Markdown format |
| `update-step-status.js` | `--graphify-status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <N>` | GRAPHIFY-Status.json progress management (5 subcommands) |
| ~~`load-rfc-graph.js`~~ | (deprecated) | Merged into `show-graph-summary-markdown.js --with-cli-examples` |
| `dump-ticket-graph-commands.js` | `--tickets=<path> --graph=<path> --source=<path>` | formulate integration: appends query.js commands to ticket spec |
| `analyze-source-structure.js` | `<source-path>` | Source document structure analysis report (assists 3-axis splitting) |
| `show-graph-summary-markdown.js` | `--graph=<path> --source=<path>` | Outputs graph summary in kind-organized Markdown format |

All scripts output a 3-line error template (`[ERROR]` / `Cause:` / `Action:`) to stderr on error and exit with code 1. Pre-write JSON Schema validation violations are also reported using the same template.

## Graph Schema Definitions

`*-GRAPH.json` consists of the following 3-layer schema.

### Root (graph.schema.json)

```json
{
  "sourceFile": "RFC-ROOT.md",
  "mainLanguage": "rust",
  "nodes": [...],
  "edges": [...]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `sourceFile` | string | required | Path to the original Markdown document |
| `mainLanguage` | string | required | The project's primary programming language (e.g. `"rust"`). For multilingual projects, specify the central language. Used as the sole fallback when a node's `language` field is not set. |
| `nodes` | array | required | Node array (node.schema.json) |
| `edges` | array | required | Edge array (edge.schema.json) |

### Node (node.schema.json)

```json
{
  "id": "N0001",
  "title": "§1 Purpose — Responsibilities of this crate",
  "kind": "architecture",
  "summary": "Defines the purpose of this crate...",
  "language": "rust",
  "slug": "purpose_crate_responsibility",
  "headingRefs": [
    { "refId": "REF001", "heading": 2, "texts": ["§1 Purpose"] }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | required | Node ID in `^N[0-9]{4}$` format |
| `title` | string | required | Title, 1 to 120 characters |
| `kind` | string | required | Selected from the 12-kind enum |
| `summary` | string | required | Summary of 1 or more characters |
| `language` | string | required (in principle) | The programming language in which this node is implemented (single value, not an array). Must be set in principle according to Step 1's "Language Assignment Rules". Only uses `mainLanguage` as a fallback when accidentally empty. |
| `slug` | string | required | A lower_snake_case identifier generated from the title (pattern: `^[a-z][a-z0-9_]*$`, max 25 characters). Must always be set according to Step 1's "slug generation rules". Empty values are not allowed. Used mechanically as the base for file and directory names. |
| `headingRefs` | array | required | Heading references to the source document (1 or more entries) |

## Step 0: Heading Deduplication (Pre-processing)

With the headingRefs approach, headings with the same text at the same level cannot be uniquely resolved. Headings are mechanically deduplicated in advance by the script.

```bash
# Start Step 0 (update progress status to running)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 0

# Deduplicate headings in the source document (append A-Z for same-level, same-text headings)
# If changes are made, overwrite the file and output a change log. If no changes, report accordingly.
node .claude/scripts/rfc-graph/deduplicate-headings.js "$1"

# Step 0 successful completion (update progress status to done and advance currentStep to 1)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 0
```

### Recovery on Error
After fixing the cause according to the error message, use `reset-to-step 0` to reset the status, then re-run the Step 0 commands from the beginning.

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 0
```

## Step 1: Node Splitting

### Pre-Reference: I/O Boundary Reference Information

**Important: This information describes the design intent at its most current state as written by the RFC author, and must be respected to the fullest extent in all subsequent phases of node splitting and edge assignment.**

If the target RFC has an I/O Boundary Reference Information section, display it and reference it from the following perspectives:

```bash
echo "=== I/O Boundary Reference Information ==="
node .claude/scripts/grill-me-for-rfc/extract-io-boundary.js "$1" || echo "(No I/O Boundary Reference Information)"
echo "==========================================="
```

- **Observed natural I/O boundaries (B1, B2, ...)** → Use as material for Axis 1 (section hierarchy) of node splitting
- **Boundary attributes** → Use as reference for node kind classification and edge type selection
- **Dependencies requiring caution during splitting** → Identify cyclic dependencies in advance that require special attention during edge assignment (Step 2)

### Node Splitting Procedure

Read all lines of the source document and identify semantic I/O boundaries across the following 4 axes, splitting into nodes. Ensure the /graphify-rfc slash command always splits at a finer granularity than the /formulate-tickets and /formulate-tickets-for-next slash commands (divergence). This is because graphify's divergent splitting into many fine-grained nodes is then bundled by formulate into appropriate implementation ticket units, achieving high-information-density convergence.

**Axis 1: Section Hierarchy**
- Use Markdown `##` headings as the primary splitting boundary
- Split within the same heading if content spans multiple concepts
- Paragraph groups without headings should be independent nodes, not merged with surrounding sections
- Use the section tree output by `analyze-source-structure.js` as reference information

**Axis 2: Single kind (12 types) Assignment**
- Each node has exactly one kind. If multiple kinds coexist within one section, force-split
- Select from the following 12 kinds:
  `requirement` / `api_contract` / `data_model` /
  `state_machine` / `architecture` / `security` /
  `error_policy` / `config` / `test_policy` /
  `build_ci` / `rationale` / `glossary`
- Example: "Requirements" and "API contracts" mixed in the same section → split into 2 nodes

**Axis 3: Presence of External Dependencies**
- Descriptions containing external dependencies (file I/O, network, DB, calls to other modules, etc.) must be force-split into nodes that have dependency content and nodes that do not
- This enables splitting that supports the "1 ticket, 1 invariant" principle of /formulate-tickets and /formulate-tickets-for-next

**Axis 4: Language Assignment**
- Set the `language` field (single value) on each node. Not an array.
- Basic rule: Default to the project's primary language (`mainLanguage`). Most nodes will have the same value as `mainLanguage`.
- Exception rule: Only set a different value when the node's content strongly depends on another language (e.g., TypeScript type definitions section → `"typescript"`, Go interface design → `"go"`).
- Content independent of any language (requirements, glossary, design rationale, etc.) gets `mainLanguage`.
- Supported languages: `"rust"`, `"go"`, `"typescript"` — 3 types. Do not set values outside these.

**Slug Generation Rules**

Set the `slug` field (lower_snake_case, max 64 characters, pattern: `^[a-z][a-z0-9_]*$`) on each node. Generate deterministically in the following priority order:

1. **English word extraction**: Extract English words and numbers from the title, convert to lower_snake_case.
   - `§1 Purpose — Responsibilities of this crate` → `purpose_crate_responsibility`
   - `§2.1 Tauri integration boundary` → `tauri_integration_boundary`
   - `§4.1 Versioning policy` → `versioning_policy`

2. **Section number fallback**: If there are no English words (or too few for distinctiveness), base it on the section number. Replace dots with underscores.
   - `§3 Glossary — Domain-specific definitions` → `section_3_glossary` (kind name as suffix)
   - `§17.1 Registration state transition rules` → `section_17_1`
   - `§18.1 Call state transition rules` → `section_18_1`

3. **Collision avoidance**: If slugs collide within the same graph, append `_2`, `_3`... to make them unique. No suffix is needed for the first occurrence.

4. **Forbidden characters**: Uppercase letters, hyphens, and leading digits are forbidden. All must be converted to lower_snake_case.
   - `API Design` → `api_design` (uppercase → lowercase)
   - `3rd-party` → `third_party` (avoid leading digit, hyphen → _)

**Granularity guideline**: Approximately 30 to 50 lines per node for the effective description content (excluding code snippets in ``` blocks). Sections exceeding 100 lines (excluding code snippets) must be split into multiple nodes. Always keep in mind that the granularity is finer than the ticket granularity of /formulate-tickets and /formulate-tickets-for-next.

```bash
# Obtain mechanical structure information in advance with analyze-source-structure.js as reference material for all 4 axes
node .claude/scripts/rfc-graph/analyze-source-structure.js "$1"
```

Check the `## Sections exceeding 100 lines` item; if any section exceeds 100 lines, directly edit the RFC source file to insert `###` subheadings, being extremely careful not to change the content or cause any information loss, splitting into appropriate granularity of approximately 30-50 lines. After splitting, run `analyze-source-structure.js` again to confirm sections exceeding 100 lines have been resolved:

```bash
# Run structure analysis again to confirm no sections exceed 100 lines
node .claude/scripts/rfc-graph/analyze-source-structure.js "$1"
```

Repeat editing the RFC source file and re-checking until `## Sections exceeding 100 lines` reports "None (all sections under 100 lines)".

```bash
# Start Step 1 (update progress status to running)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 1

# Generate node JSON based on the 4-axis criteria + slug generation rules (above), and inject it into the graph file via crud.js
# Save the generated node JSON to the temporary file _temp_nodes.json first, then specify it via crud.js's --file
# ※ The refId in sourceRanges is auto-assigned by crud.js, so the AI only needs to specify startLine/endLine
#
# Each entry in the node JSON follows this format:
# {"id":"N0001","title":"§1 Purpose","kind":"architecture","summary":"...","language":"rust","slug":"purpose","headingRefs":[{"refId":"REF001","heading":2,"texts":["§1 Purpose"]}]}
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-nodes --file=_temp_nodes.json --source="$1"

# Slug validation (pre-check naming convention, length, word count)
node .claude/scripts/rfc-graph/validate-slug.js --graph="$graphPath"

# If validation errors exist, fix each node's slug via crud.js and re-run
# Validation errors are output to stdout in JSON format: {"ok":false, "errors":[...]}
# Each error.remedy contains an example crud.js fix command

# Step 1 successful completion (update progress status to done and advance currentStep to 2)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 1

# Clean up temporary files
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

### Recovery on Error

If validate-slug.js reports slug validation errors, fix the slug using the crud.js command specified in each error's remedy field, then re-run with `reset-to-step 1`:

```bash
# Error example: {"nodeId":"N0005","slug":"CamelCaseName","reason":"Contains uppercase letters","remedy":"node ... crud.js ... update-node --id=N0005 --field=slug --value=camelcasename"}
# Run the remedy command to fix the slug
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" update-node --id=N0005 --field=slug --value=camelcasename

# After fixing, re-run from the beginning of Step 1
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

After fixing the cause according to the error message, use `reset-to-step 1` to reset the status, then re-run the Step 1 commands from the beginning. Delete any old temporary files before re-running:

```bash
# Delete old temporary files before re-running
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

For minor fixes, individual operations can also be used:

```bash
# Partially fix specific node's sourceRanges, etc.
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" get-node --id=N0003
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" update-node --id=N0003 --file=_patch.json

# Delete unnecessary nodes
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" delete-node --id=N0003

# For extensive fixes, re-run everything
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

## Step 2: Edge Assignment

Select appropriate relationships from the 12 edge types (depends_on / implements / refines / extends / conflicts_with / triggers / constrains / supersedes / references / precedes / part_of / validates), ensuring every node has at least one edge. Confirm that no orphan nodes exist.

```bash
# Start Step 2 (update progress status to running)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 2

# Generate edge JSON and inject it into the graph file via crud.js
# Save the generated edge JSON to the temporary file _temp_edges.json first, then specify it via crud.js's --file
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-edges --file=_temp_edges.json

# Step 2 successful completion (update progress status to done and advance currentStep to 3)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 2

# Clean up temporary files
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

### Recovery on Error
After fixing the cause according to the error message, use `reset-to-step 2` to reset the status, then re-run the Step 2 commands from the beginning. Delete any old temporary files before re-running:

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 2
```

Individual edges can also be removed and re-added.

```bash
# Delete unnecessary edges (identified by from + to + type)
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" delete-edges --file=_remove_edges.json

# Inject additional edges
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-edges --file=_add_edges.json

# For extensive fixes, re-run everything
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 2
```

## Step 3: Machine Verification

Use verify.js to check for uncovered lines and orphan nodes. Repeat until `{"ok":true}` is returned.

```bash
# Start Step 3 (update progress status to running)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 3

# Machine-verify uncovered lines and orphan nodes
node .claude/scripts/rfc-graph/verify.js --graph="$graphPath" --source="$1"
```

Branch based on verification results:

- **If uncovered lines are reported** → Return to Step 1 with `reset-to-step 1` to add or modify nodes covering the uncovered lines
  ```bash
  node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
  ```
- **If orphan nodes are reported** → Return to Step 2 with `reset-to-step 2` to add appropriate edges to orphan nodes
  ```bash
  node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 2
  ```
- **If `{"ok":true}`** → Proceed to Step 4
  ```bash
  node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 3
  ```

Repeat Steps 1 through 3 until `{"ok":true}` is returned.

### Recovery on Error
After fixing the cause according to the error message, use `reset-to-step 3` to reset the status, then re-run the Step 3 commands from the beginning.
```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 3
```

## Step 4: Self-Verification

Machine-verify the resolvability of all headingRefs using test-query-all.js. After passing, optionally run structural queries with query.js. Confirm the graph structure is of sufficient quality for the /formulate-tickets and /formulate-tickets-for-next slash commands and for reference during implementation.

```bash
# Start Step 4 (update progress status to running)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 4

# Verify resolvability of all headingRefs (mandatory gate)
node .claude/scripts/rfc-graph/test-query-all.js --graph="$graphPath" --source="$1"
```

Branch based on the exit code of test-query-all.js:

- **exit 0 (all headingRefs confirmed resolvable)** → Proceed to optional subsequent queries
- **exit 1 (unresolvable headingRefs exist)** → Fix using the following procedure:
  1. Check the list of unresolvable headingRefs output to stderr
  2. If necessary, obtain detailed diagnostic information via `query-fix-hints.js`:
     ```bash
     node .claude/scripts/rfc-graph/query-fix-hints.js --hints=_fix_graph_hints.json
     ```
  3. Follow the remedyHint in `_fix_graph_hints.json` to fix headingRefs via `crud.js update-node`
  4. Delete temporary files and re-run:
     ```bash
     node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
     node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 4
     ```

When test-query-all.js exits with 0, all headingRefs are guaranteed resolvable. After that, optionally run structural queries against any nodes:

```bash
# Example: Multi-hop search on a specific node (use --hops=2 as needed)
node .claude/scripts/rfc-graph/query.js --graph="$graphPath" --source="$1" --id=N0001 --hops=2
```

Even with a large number of nodes, the AI only needs to query nodes it deems necessary (all headingRefs are resolved, so the reachability of the entire graph is guaranteed).

### AI Quality Inspection (Random Sampling Visual Check)

Visually inspect quality issues that cannot be detected by machine verification (edge correctness, kind classification consistency, headingRefs adequacy) through random sampling.

```bash
# Save query.js results for all nodes to _quality/, randomly select 5%, and display the command list
bash .claude/scripts/rfc-graph/query-all-nodes.sh --graph="$graphPath" --source="$1"
```

For each selected node, inspect them **one by one, without skipping a single one**, following this procedure:

```bash
# Display each selected node in order one at a time (do not attempt to display all at once)
node .claude/scripts/rfc-graph/get-node-for-check.js Nxxxx
```

Read each node's display content and check the following items:

1. **Does the relationship with other nodes correctly reflect the design document's description** (are any required edges missing)?
2. **Does each node's content cover the corresponding section of the design document completely, without excess or deficiency**?
3. **Are there any missing or ambiguous areas that would hinder /formulate-tickets and /formulate-tickets-for-next from decomposing tickets from this graph**?

If deficiencies are found → Return to Step 1 to **refine (strengthen) the graph** by combining the addition of new nodes, modification of existing nodes, creation of new edges, modification of existing edges, and deletion-and-recreation as needed.

```bash
# Reinforce: Return to Step 1 to cover missing information
# Combine new node addition, update-node modification, and delete-node recreation as appropriate
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

Note that this is "reinforcement (refinement)" rather than "rework." Delete duplicate or coarse-grained nodes via delete-node and re-split into more appropriate nodes. Add missing nodes via add-node. Fine-tune existing nodes via update-node. Any type of change is acceptable as long as it improves the overall quality of the graph.

Once inspection is complete without missing a single node, make the following decision:

> You only inspected 5% of the total, not all nodes. This means the quality of everything is not guaranteed. Based on this premise, decide whether to randomly select another 5% for additional inspection.

To perform additional inspection:

```bash
# Re-random select an additional 5% (do not regenerate _quality)
bash .claude/scripts/rfc-graph/query-all-nodes.sh --graph="$graphPath" --additional
```

Inspect each node in the output command list **one by one, without skipping a single one**. After inspection, re-evaluate the decision above.

If no additional inspection is needed (the current quality is deemed sufficient) → Step 4 successful completion.

```bash
# On success: Step 4 successful completion (update progress status to done)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 4
# Clean up temporary files (_quality/ directory is also subject to deletion)
rm -rf _quality/
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

### Recovery on Error

Identify the cause according to the query.js error message and fix it by resetting the status with the appropriate Step's `reset-to-step N` (missing nodes → Step 1, missing edges → Step 2).

#### Recovery on test-query-all.js Failure
Check the list of unresolvable headingRefs output to stderr, and fix via `crud.js` following the remedyHint in `_fix_graph_hints.json`. After fixing, re-run with cleanup → reset-to-step 4:

```bash
# Delete temporary files before re-running
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 4
```

#### Recovery on Unknown Errors
```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 4
```

## Step 5: Final Quality Verification — Full Summary Inspection

Use show-graph-summary-markdown.js to mechanically output a summary of the entire graph, allowing the AI to make a final judgment on structural adequacy.

```bash
# Start Step 5 (update progress status to running)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 5

# Output the entire graph summary in Markdown format
node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="$graphPath" --source="$1"
```

### AI Adequacy Judgment

Read the entire output summary and judge whether the graph is a "sufficiently structured relationship graph" from the following perspectives:

1. **Are all major sections of the design document fully represented as nodes, without excess or deficiency?**
2. **Does the kind classification of each node align with the design intent?**
3. **Do the dependency relationships (edges) between nodes accurately reflect the logical relationships in the design document?**
4. **Are there any missing or ambiguous areas that would hinder /formulate-tickets and /formulate-tickets-for-next from decomposing tickets from this graph?**

### Decision and Branching

**If judged sufficient** → Explain the reasons concretely, using the following example format:

```markdown
[Adequacy Explanation]
- All 12 out of 12 sections are represented as nodes
- The kind classification of 4 requirement, 3 api_contract, and 2 architecture entries all align with the design document
- Dependencies form a fully connected chain: "auth API → token verification → session management → ACL"
- 0 orphan nodes
- Each edge is linked via headingRefs to the corresponding location in the design document
- Supplementary information: ?????
```

The explanation must be at a level that the user can reliably accept. If the explanation feels weak (e.g., abstract "it's sufficient" without listing concrete facts), that means it is not a convincing explanation — return to reinforcement.

**If judged insufficient, or if a convincing explanation cannot be written** → Return to Step 1 for reinforcement (refinement).

```bash
# Reinforce: Return to Step 1 to refine the graph
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

**If judged sufficient AND a convincing explanation can be written** → Step 5 successful completion.

```bash
# On success: Step 5 successful completion (update progress status to done)
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 5
```

### Recovery on Error
After fixing the cause according to the script's error message, use `reset-to-step 5` to reset the status, then re-run the Step 5 commands from the beginning.
```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 5
```

## Completion Report

Report the following information:

- **Generated graph file**: `$graphPath`
- **Progress status file**: `$statusPath`
- **Node count**: Obtained via crud.js list-nodes
- **Edge count**: Obtained from the graph JSON's edges array length
- **headingRefs resolution rate**: All N entries confirmed resolvable by test-query-all.js
- **Verification result**: verify.js final output (coverage rate, presence of orphan nodes)
- **Final quality verification**: show-graph-summary-markdown.js adequacy judgment result (sufficient/reinforcement history)
- **Graph structure summary**: show-graph-summary-markdown.js output (kind-organized node list + edge relationships)

After completion, this graph becomes available to the /formulate-tickets and /formulate-tickets-for-next slash commands via `show-graph-summary-markdown.js --with-cli-examples`.
