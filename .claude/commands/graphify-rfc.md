---
description: Executes graph conversion via 7-step Step progress control (heading deduplication → node splitting → edge assignment → machine verification → self-verification → final quality verification).
argument-hint: </path/to/RFC-doc.md>
allowed-tools: Read, Write, Bash
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /graphify-rfc <source-file-path>

Role: split source Markdown into fine-grained I/O-boundary nodes; persist attributed-edge graph.
Consumers: `/split-to-tickets`, `/boundify-graph`; reference pipeline: `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`.

Invariants:
- graph granularity: finer than downstream ticket/directory allocation; downstream may aggregate, never need to split coarse nodes.
- graph write: `crud.js` for nodes and edges; `attach-unit-ids.js` atomically writes only the `unitIds` / `distributionDigest` projection after the map digest check. No other script writes the graph.
- status transition: `update-step-status.js --graphify-status="$statusPath"` only.
- graph/query/verify args: `--graph="$graphPath" --source="$1"`.
- script/pre-write schema failure: stderr `[ERROR]` / `Cause:` / `Action:`; exit 1.
- node: exactly one kind; one language; non-empty slug; ≥1 headingRef.
- every node: ≥1 edge; no orphan.
- all headingRefs resolve before Step 4 PASS.
- source edit: Step 0 heading dedup; Step 1 may add `###` only to split >100-line sections without content change/loss.
- Step 4/5 deficiency → reinforce from Step 1.

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
- arg: required source Markdown path; absolute | relative.
- example: `RFC-GRAPHIFY.md` | `/absolute/path/to/rfc-doc.md`.

## Derived Paths

```bash
graphPath="$(dirname "$1")/$(basename "$1" .md)-GRAPH.json"
statusPath="$(dirname "$1")/$(basename "$1" .md)-GRAPHIFY-Status.json"
```

- `graphPath`: generated graph JSON.
- `statusPath`: progress status JSON; `update-step-status.js` reads/writes it.

## Guidelines

- divergence: graphify splits finer than `/split-to-tickets` and `/boundify-graph`; fine nodes may aggregate downstream; coarse nodes cannot be recovered.
- scripts: `.claude/scripts/rfc-graph/`.
- status calls: `--graphify-status=<path>`.
- crud/verify/query: `--graph=<path>` / `--source=<path>`.

## List of Scripts Used

Root: `.claude/scripts/rfc-graph/`.

| Script | Contract |
|---|---|
| `crud.js --graph=<path> <subcommand>` | sole graph write: create/list/get/update/delete nodes; create/delete edges |
| `deduplicate-headings.js <source>` | same-level/same-text heading dedup: append A-Z |
| `resolve-by-heading.js <source> --target=<heading>` | headingRefs 4-level fallback resolution |
| `verify.js --graph=<path> --source=<path>` | uncovered-line / orphan-node machine check |
| `validate-slug.js --graph=<path>` | Step 1 slug validation/self-healing input |
| `query.js --graph=<path> --source=<path> --id=<id> --hops=<N>` | multi-hop Markdown graph query |
| `test-query-all.js --graph=<path> --source=<path>` | all headingRefs check; exit 0/1; writes `_fix_graph_hints.json` |
| `query-fix-hints.js --hints=<path> [--id=<id>] [--diagnosis=<M0-M10>] [--refId=<id>]` | inspect fix hints |
| `update-step-status.js --graphify-status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <N>` | progress status |
| `load-rfc-graph.js` | deprecated; merged into `show-graph-summary-markdown.js --with-cli-examples`; do not use |
| `dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>` | append graph query commands to ticket spec |
| `analyze-source-structure.js <source>` | source structure; 3-axis split aid |
| `show-graph-summary-markdown.js --graph=<path> --source=<path>` | kind-organized graph summary |

Also invoked: `annotate-contracts.js`, `verify-contracts-format.js`, `attach-unit-ids.js`, `tickets/verify-graph-contracts.js`, `query-all-nodes.sh`, `get-node-for-check.js`. Preserve their invocation contracts below; Script List is not an exclusive tool allow-list.

## Graph Schema Definitions

`*-GRAPH.json`: root + node + edge schema.

### Root (graph.schema.json)

```json
{
  "sourceFile": "RFC-ROOT.md",
  "mainLanguage": "rust",
  "nodes": [...],
  "edges": [...]
}
```

| Field | Contract |
|---|---|
| `sourceFile` | required original Markdown path |
| `mainLanguage` | required primary language; multilingual project: central language; only fallback for accidentally empty node `language` |
| `nodes` | required node array |
| `edges` | required edge array |

### Node (node.schema.json)

The unit anchor — a section written for a distributed unit records the unit's id in an HTML comment, `<!-- unit: op-<operationId> -->`, so the id can be read out of the section without reading its prose. A unit the ledger does not assign to this package carries no anchor here. When a node is built from such a section, the node's optional `unitIds` array records those ids, and it stays empty for a section that carries none. The property is optional, so a graph written before it existed still validates against `additionalProperties: false`; nothing else about the node changes.

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

| Field | Contract |
|---|---|
| `id` | required `^N[0-9]{4}$` |
| `title` | required; 1–120 chars |
| `kind` | required; one 12-kind enum value |
| `summary` | required; ≥1 char |
| `language` | required in principle; one value, never array; `mainLanguage` fallback only if accidentally empty |
| `slug` | required lower_snake_case; `^[a-z][a-z0-9_]*$`; never empty; file/directory-name base; **max length: schema says 25; Step 1 rule says 64—do not normalize without schema/script decision** |
| `headingRefs` | required; ≥1 source-heading reference |

## Step 0: Heading Deduplication (Pre-processing)

G0 heading-dedup: same-level/same-text headings cannot resolve uniquely; mechanically append A-Z.

```bash
RUN_ID="$(date +%s%N)-$$"
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" begin-run --run-id="$RUN_ID"
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 0
node .claude/scripts/rfc-graph/verify-smooth-verdict.mjs --package="$(dirname "$1")" --write
node .claude/scripts/rfc-graph/deduplicate-headings.js "$1"
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 0
```

- The verdict gate runs before heading deduplication can change the source. It verifies `smooth-sequences/status.json`, the closure certificate and the frozen design snapshot, then writes the workspace-level `SMOOTH-VERDICT.json`.
- The receipt records `viewDigests`: one SHA-256 per package `SEQUENCES.json`. A package view edited after the receipt is `STALE_SMOOTH_VERDICT`; an `RFC.md` heading insertion made by graphify is not, because the receipt binds the view smooth certified, not the whole design snapshot.
- `MISSING_SMOOTH_VERDICT` / `SMOOTH_VERDICT_NOT_PASS` / `STALE_SMOOTH_VERDICT` / `SMOOTH_CERTIFICATE_INCOMPLETE` / `SMOOTH_ARTIFACT_MISMATCH` → stop; repair the smooth run or the workspace, then `reset-to-step 0` and rerun. A receipt without `viewDigests` is `MISSING_SMOOTH_RECEIPT`; rerun graphify Step 0 to rewrite it.
- Outside a workspacify workspace the gate is skipped and reports `skipped:outside-workspace`.
- changed source → overwrite + change log.
- unchanged source → report unchanged.
- fail → read error; `reset-to-step 0`; re-run Step 0 from start.
- `begin-run` counts one invocation; `end-step 5` advances `generation` only when the graph digest changes. Audit mode appends `--audit` to the final `end-step 5`: it counts the run, writes no generation, and exits 0 with `wouldExit`.

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 0
```

## Step 1: Node Splitting

### Pre-Reference: I/O Boundary Reference Information

I/O boundary reference, if present, is current RFC-author design intent; respect fully through node split + edge assignment.

```bash
echo "=== I/O Boundary Reference Information ==="
node .claude/scripts/grill-me-for-rfc/extract-io-boundary.js "$1" || echo "(No I/O Boundary Reference Information)"
echo "==========================================="
```

Use:
- natural boundaries `B1`, `B2`, … → Axis 1 material.
- boundary attributes → node-kind / edge-type reference.
- caution dependencies → identify cycles before Step 2.

### Pre-Reference: Distribution Admission

Fail closed before splitting. No node, edge or contract is authored until this passes. `SEQUENCES.json`, the RFC distribution-map and the allocate manifest are read as digest-bound sidecars, not as a second design.

```bash
viewPath="$(dirname "$1")/SEQUENCES.json"
registryPath="$(node -e "process.stdout.write(require('./.claude/scripts/lib/package-artifacts').findAllocateManifest('$(dirname "$1")')||'')")"
artifactPath="$(node -e "const fs=require('fs'),p=require('path');const a=require('./.claude/scripts/lib/package-artifacts').findAllocateManifest('$(dirname "$1")');if(!a)process.stdout.write('');else{const r=p.dirname(a);const m=fs.readdirSync(r).filter(n=>n.endsWith('-sequences.json'));process.stdout.write(m.length===1?p.join(r,m[0]):'')}")"
if [ -n "$registryPath" ]; then
  node .claude/scripts/rfc-graph/attach-unit-ids.js --admit --rfc="$1" --view="$viewPath" --registry="$registryPath" --artifact="$artifactPath"
else
  echo "(not a workspacify workspace: distribution admission skipped)"
fi
```

- `STALE_DISTRIBUTION_MAP` → rerun `/smooth-sequences` and `render-distribution`; never split a stale view.
- `UNIT_SET_MISMATCH` → view and map disagree; fix authored input, re-project, rerun.
- `SEQUENCE_STEPS_UNDISTRIBUTED` → a drawn sequence is only an `obligationUnits` row; move it to `ownedSequenceUnits`/`crossBoundarySequenceUnits` with its steps.
- `MISSING_BOUNDARY_CONTRACT` → a registry boundary has no `ctr-*` unit in the view.
- `MISSING_VIEW` / `MISSING_SIDECAR` / `MISSING_REGISTRY` → inside a workspace, the named file is missing; restore it or pass the explicit path. Outside a workspace the admission is skipped.
- Nonzero → stop; do not author nodes.

### Node Splitting Procedure

G1 node-split: read all source lines; identify semantic I/O boundaries; split on all axes; preserve divergence invariant.

| Axis | Rule |
|---|---|
| 1 section hierarchy | `##` primary boundary; split multiple concepts within heading; headingless paragraph groups are independent nodes; use `analyze-source-structure.js` section tree |
| 2 single kind | exactly one kind/node; mixed kind → force split |
| 3 external dependencies | dependency content (file I/O/network/DB/other module calls/etc.) → force split from non-dependency content |
| 4 language | one language/node; default `mainLanguage`; other value only strong language dependence; language-independent material → `mainLanguage` |

Kinds: `requirement` / `api_contract` / `data_model` / `state_machine` / `architecture` / `security` / `error_policy` / `config` / `test_policy` / `build_ci` / `rationale` / `glossary`.

Languages: `rust` | `go` | `typescript`; no other value.

Slug generation; deterministic priority:
1. English words/numbers from title → lower_snake_case.
2. insufficient/no English → section number, dots → `_`; kind suffix when needed.
3. graph collision → `_2`, `_3`, …; first has no suffix.
4. uppercase/hyphen/leading digit forbidden; normalize to lower_snake_case.

Examples: `§1 Purpose — Responsibilities of this crate` → `purpose_crate_responsibility`; `§2.1 Tauri integration boundary` → `tauri_integration_boundary`; `§3 Glossary — Domain-specific definitions` → `section_3_glossary`; `API Design` → `api_design`; `3rd-party` → `third_party`.

Granularity:
- effective prose: ~30–50 lines/node; fenced code excluded.
- section >100 effective prose lines → mandatory split.
- Run `analyze-source-structure.js "$1"`; while `## Sections exceeding 100 lines` ≠ `None (all sections under 100 lines)`, insert `###` only, preserving all content, then re-run.

```bash
node .claude/scripts/rfc-graph/analyze-source-structure.js "$1"
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 1
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-nodes --file=_temp_nodes.json --source="$1"
node .claude/scripts/rfc-graph/validate-slug.js --graph="$graphPath"
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 1
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

Node input example: `{"id":"N0001","title":"§1 Purpose","kind":"architecture","summary":"...","language":"rust","slug":"purpose","headingRefs":[{"refId":"REF001","heading":2,"texts":["§1 Purpose"]}]}`.
`crud.js` auto-assigns `sourceRanges.refId`; AI specifies `startLine/endLine` only.

### Error Recovery

Slug fail: read JSON `{ok:false, errors:[...]}`; run each `error.remedy` crud fix; cleanup; reset 1; re-run all Step 1.

```bash
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" update-node --id=N0005 --field=slug --value=camelcasename
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

Minor repair: `get-node` / `update-node`; delete unnecessary node with `delete-node`; extensive repair → `reset-to-step 1`.

```bash
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" get-node --id=N0003
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" update-node --id=N0003 --file=_patch.json
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" delete-node --id=N0003
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

## Step 2: Edge Assignment

G2 edge-assign:
- every node: ≥1 edge; no orphan.
- type: `depends_on` / `implements` / `refines` / `extends` / `conflicts_with` / `triggers` / `constrains` / `supersedes` / `references` / `precedes` / `part_of` / `validates`.
- edge: `from`, `to`, `type`, `attributes`, `contracts`.
- attributes: `strength` = `hard` | `soft`; `bidirectional` = bool; optional `note` ≤240 chars.
- contracts: `C000` id; non-empty `precondition`, `postcondition`, `invariant`.

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 2
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-edges --file=_temp_edges.json
node .claude/scripts/rfc-graph/attach-unit-ids.js --graph="$graphPath" --rfc="$1" --ledger="$1" --view="$viewPath" --registry="$registryPath"
node .claude/scripts/rfc-graph/project-step-contracts.js --graph="$graphPath" --view="$viewPath"
node .claude/scripts/rfc-graph/annotate-contracts.js "$1"
node .claude/scripts/rfc-graph/project-boundary-contracts.js --graph="$graphPath" --registry="$registryPath" --view="$viewPath" --mode=attach
node .claude/scripts/rfc-graph/verify-contracts-format.js --graph="$graphPath"
node .claude/scripts/tickets/verify-graph-contracts.js --graph="$graphPath" --registry="$registryPath" --view="$viewPath"
node .claude/scripts/sequences-slice/verify-chain.mjs --stage=graphify --package="$(dirname "$1")" --artifact="$artifactPath"
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 2
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

Edge example: `{"from":"N0001","to":"N0003","type":"depends_on","attributes":{"strength":"hard","bidirectional":false},"contracts":[{"id":"C001","precondition":"...","postcondition":"...","invariant":"..."}]}`.
Annotate each edge via `crud.js update-edge --file=<patch.json>` with `{from,to,type,contracts}` **before** the boundary projection, so the projected `C9xx` contract is never overwritten.

`attach-unit-ids.js` reads the `distribution-map` block from `$1` and, when `--view` is supplied, refuses to proceed unless `sourceViewDigest` equals the current `SEQUENCES.json` digest. A map unit with no node fails `MISSING_UNIT_AT_LAYER`; a node unit outside the map fails `INVENTED_UNIT`; an obligation-only sequence step fails `SEQUENCE_STEPS_UNDISTRIBUTED`. `/graphify-rfc` reads the RFC plus digest-bound sidecars; it does not read a sidecar whose digest it has not checked.
The artifact is the denominator. An active operation absent from the view and not a valid suppliedRule residual is `MISSING_OPERATION`; a sequence absent from the view is `MISSING_SEQUENCE`; a step whose operationId, order, line, quote, subject, predicate, object, contract or prose differs is `STEP_IDENTITY_MISMATCH`; a multi-owner operation with no implementer is `OWNER_ROLE_UNDECLARED` at smooth. `verify-chain --stage=graphify` reports these before node splitting is accepted.
`project-step-contracts.js` writes `RFC-STEP-CONTRACTS.json` beside the graph and a short `step:<stepId>;row:<n>` note on an edge incident to the operation node. `verify-graph-contracts.js` reads the sidecar automatically; a missing row, a changed digest or a note naming no row is `CONTRACT_CHAIN_OPEN` or `STEP_CONTRACT_MISMATCH`. The sidecar is the full contract; the note is only the pointer.

`project-boundary-contracts.js` projects only the registry rows whose `ctr-*` unit this package graph carries; a foreign row is skipped, not projected and not refused. It uses the view direction and prefers a `depends_on` / `constrains` / `conflicts_with` edge; more than one candidate is `AMBIGUOUS_BOUNDARY_EDGE`, and a missing edge is `MISSING_BOUNDARY_EDGE`. `verify-graph-contracts.js` reads the same carrying edge, never the first edge touching the ctr node.

`verify-graph-contracts.js` discovers the workspace's `WORKSPACIFY-ALLOCATE-MANIFEST.json` at the nearest ancestor holding both workspace manifests, so the boundary contract-edge check (check 4) runs whenever the graph is inside a workspacify workspace and is skipped outside one. Pass `--registry=<path>` only to override that discovery.

### Error Recovery

fail → repair per error; cleanup; reset 2; re-run Step 2. Individual repair: `delete-edges` then `create-edges`; extensive repair → reset 2.

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 2
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" delete-edges --file=_remove_edges.json
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-edges --file=_add_edges.json
```

## Step 3: Machine Verification

G3 structure:

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 3
node .claude/scripts/rfc-graph/verify.js --graph="$graphPath" --source="$1"
```

- uncovered lines → reset 1; add/modify covering nodes.
- orphan nodes → reset 2; add edges.
- `{\"ok\":true}` → end 3; Step 4.
- other failure → repair per error; reset 3; re-run.
- repeat Steps 1–3 until `{\"ok\":true}`.

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 2
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 3
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 3
```

## Step 4: Self-Verification

G4 headingRefs:

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 4
node .claude/scripts/rfc-graph/test-query-all.js --graph="$graphPath" --source="$1"
```

- exit 0 → every headingRef resolvable; optional targeted structural queries allowed.
- exit 1 → read stderr; optionally inspect `_fix_graph_hints.json`; follow `remedyHint` with `crud.js update-node`; cleanup; reset 4; re-run.

```bash
node .claude/scripts/rfc-graph/query-fix-hints.js --hints=_fix_graph_hints.json
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 4
node .claude/scripts/rfc-graph/query.js --graph="$graphPath" --source="$1" --id=N0001 --hops=2
```

### AI Quality Inspection (Random Sampling Visual Check)

Q4 sample loop:
- create `_quality/`; random-select 5%; inspect each selected node sequentially; skip none.
- inspect: edges reflect source; node covers its source section exactly; no missing/ambiguous area blocks downstream ticket decomposition.
- deficiency → reset 1; reinforce via add/update/delete/recreate as required.
- after complete sample: acknowledge 5% does not guarantee all quality; judge whether another 5% sample is needed.
- additional sample: `--additional`; do not regenerate `_quality`; inspect every selected node; repeat decision.
- sufficient / no additional sample → end 4; delete `_quality/`; cleanup.

```bash
bash .claude/scripts/rfc-graph/query-all-nodes.sh --graph="$graphPath" --source="$1"
node .claude/scripts/rfc-graph/get-node-for-check.js Nxxxx
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
bash .claude/scripts/rfc-graph/query-all-nodes.sh --graph="$graphPath" --additional
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 4
rm -rf _quality/
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

### Error Recovery

query failure: diagnose; missing node → reset 1; missing edge → reset 2. `test-query-all` failure: stderr + `remedyHint` + crud repair; cleanup; reset 4. Unknown error → reset 4.

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 4
```

## Step 5: Final Quality Verification — Full Summary Inspection

G5 whole-graph:

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 5
node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="$graphPath" --source="$1"
```

judge full summary:
1. all major source sections represented, no excess/deficiency.
2. node kind matches design intent.
3. edges match source logical relationships.
4. no missing/ambiguous area blocks downstream ticket decomposition.

Adequacy report: concretely state section coverage/counts, kind distribution, dependency chain, orphan count, headingRef linkage, and applicable supplementary facts. Abstract adequacy claim is insufficient.

```markdown
[Adequacy Explanation]
- All <represented> out of <total> sections are represented as nodes
- The kind classification of <counts by kind> aligns with the design document
- Dependencies form: "<concrete chain>"
- <count> orphan nodes
- Each edge is linked via headingRefs to its source location
- Supplementary information: <concrete facts>
```

- insufficient OR no concrete convincing adequacy explanation → reset 1; reinforce.
- sufficient AND concrete convincing explanation → end 5.

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 5
```

### Error Recovery

repair per script error; reset 5; re-run Step 5.

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 5
```

## Completion Report

out:
- generated graph: `$graphPath`.
- progress status: `$statusPath`.
- node count: `crud.js list-nodes`.
- edge count: graph `edges.length`.
- headingRefs resolution: all N confirmed by `test-query-all.js`.
- final `verify.js`: coverage + orphan result.
- chain verdict: `verify-chain --stage=graphify` 0 findings; report view/map/graph/dirs/ticket unit counts and the 84-boundary projection count.
- stage counters: `runs` and `generation` from `statusPath`; an unchanged graph digest is a verification, not a new generation.
- G5 adequacy: sufficient/reinforcement history.
- graph summary: kind-organized node list + edge relationships.

Done: graph available to `/split-to-tickets` and `/boundify-graph` through `show-graph-summary-markdown.js --with-cli-examples`; referenced by `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`.

## Reverse mode (GF1, GF2)

**Rotation gate** — this section runs only when `measured-tree-root` holds. The forward rotation generates the tree from a Dirs-Tree and is given no `--root`, so this section cannot fire in one.

Same command, same steps; two gates added, neither changes the schema: `*-GRAPH.json` is layer C and gains nothing, so the grounding is published beside the graph and never written into it.

Why the gates exist: `node.schema.json` carries no file field and `additionalProperties` is false, so a graph can be internally consistent — every heading referenced, every edge joined — and connected to nothing real. And an RFC written from the code agrees with the code by construction, so a reconciliation that finds nothing is the **ratification RFC** (F1, ABOUT-REVERSE 3.4), not a clean result. Reverse mode makes both failures visible instead of silent.

| Change | Does |
|---|---|
| **GF1 grounding** | `grounding-check.js` — every node resolves to a file that exists under the measured tree, T3's rule. A missing declared path and a node declaring no path fail alike, reported **by identifier**; reads through `crud.js` and adds no second write path |
| **GF2 contract reconciliation** | `contract-diff.js` — R3 contract candidates (what the code does) against RFC-derived contracts (what the edges state). Every difference is recorded as an **omission or RESIDUE candidate**, never discarded; gap-versus-artefact is the grill's judgement, this step decides only what is unmatched |

**Prohibitions**

- No extension of `node.schema.json`, `edge.schema.json` or `graph.schema.json`: a grounding is a table beside the graph, not a node field.
- No second graph write path: `crud.js` remains the only one, both scripts read.
- Never remove a difference to make the reconciliation clean — a removed difference destroys the only evidence that the RFC disagrees with the code.
- Never report zero differences as success: zero is F1's signature, and the record must say the comparison was made rather than that nothing was found.
- Never classify a difference by guessing intent; an unclassifiable one is recorded `unclassified` and carried to the grill.

**Report additions**: GF1 status and every unresolvable node identifier; GF2 difference count split by direction with the recorded candidates; and on zero, the sentence saying a zero result is to be scrutinised rather than trusted.
