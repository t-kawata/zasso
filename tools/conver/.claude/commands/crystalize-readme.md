---
description: Generate a package and workspace boundary-contract README group from the package RFC graph (section-by-section inspection loop).
allowed-tools: Read, Write, Bash
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /crystalize-readme

Role: the package README and the workspace README are the boundary contract document group. This command is the only producer of that group. Each package section is judged section by section: "is an implementation that fully works per this section's described usage currently achievable?" A writable section becomes a complete description. An unwritable section becomes a RESIDUE record carrying concrete evidence and a reinforcement design inside README.md under `<::README-RESIDUE::>` (examples use `<::EXAMPLES-RESIDUE::>`). RESIDUE is not a memo: it is source material for implementation tickets. No standalone RESIDUE file.

The shipping role is unchanged. Per package, RESIDUE is extracted; `/drill-rfc-down` ticketizes it; the implementation loop runs until no RESIDUE remains. The workspace README is updated from the package READMEs on every run. Completion is never guaranteed by a gate: the command converges; the outer loop decides shipment.

**Generated README language: English only.** Package and workspace README headings, prose, residue, and examples are English. Source material in any language may inform the content; no non-ASCII letter may appear in the generated README. `validate-readme-language.js` rejects every letter outside A-Z/a-z (Japanese, Cyrillic, Hangul, Arabic, accented Latin) before every write; digits, punctuation, and symbols pass.

**Path anchor (mandatory — resolve once).**

Run this once at the start of the command:

```bash
printf '%s/.claude\n' "$(git rev-parse --show-toplevel)"
```

Record the printed absolute path as `CLAUDE_DIR`. In every later bash block, use that literal path: substitute it into `node "$CLAUDE_DIR/scripts/..."`, or assign `CLAUDE_DIR="<the printed path>"` at the top of the block. Do not run `git rev-parse` again, and do not assume the current directory is the repository root.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Arguments

This command takes no argument. The package graph is a package artifact:

- `RFC-GRAPH.json` in the package directory, or
- exactly one `*-GRAPH.json` when the canonical name is absent.

The same `lib/resolve-graph-path.js` locator used by `/find-omissions` resolves it. An explicit graph path is not accepted. Any argument produces `UNEXPECTED_ARGUMENT` and stops.

## Preflight: derive the graph and the boundary paths (deterministic)

```bash
[ -z "$ARGUMENTS" ] || { echo "[ERROR] UNEXPECTED_ARGUMENT"; echo "Cause: /crystalize-readme takes no graph path."; echo "Action: Run it with no argument in the package directory."; exit 1; }
GRAPH_PATH="$(node "$CLAUDE_DIR/scripts/crystalize-readme/derive-graph-path.js")" || exit 1
node "$CLAUDE_DIR/scripts/crystalize-readme/derive-output-paths.js" --graph="$GRAPH_PATH" || exit 1
SOURCE_FILE="$(node "$CLAUDE_DIR/scripts/crystalize-readme/derive-output-paths.js" --graph="$GRAPH_PATH" --field=sourceFile)" || exit 1
BOUNDARY_JSON="$(node "$CLAUDE_DIR/scripts/crystalize-readme/discover-boundary.js" "$(pwd)")" || exit 1
printf '%s\n' "$BOUNDARY_JSON"
PACKAGE_ROOT="$(node "$CLAUDE_DIR/scripts/crystalize-readme/discover-boundary.js" "$(pwd)" --field=packageRoot)" || exit 1
PRIOR_README="$PACKAGE_ROOT/README.md"
WORKSPACE_README="$(node "$CLAUDE_DIR/scripts/crystalize-readme/discover-boundary.js" "$(pwd)" --field=workspaceReadmePath)" || exit 1
INTERFACES="$(node "$CLAUDE_DIR/scripts/crystalize-readme/discover-boundary.js" "$(pwd)" --field=interfaces)" || exit 1
LANGUAGES="$(node "$CLAUDE_DIR/scripts/crystalize-readme/discover-boundary.js" "$(pwd)" --field=sourceLanguage)" || exit 1
EVIDENCE_DIGEST="$(node "$CLAUDE_DIR/scripts/crystalize-readme/collect-evidence.js" "$(pwd)" --field=packageDigest)" || exit 1
STATUS_PATH="$(dirname "$SOURCE_FILE")/CRYSTALIZE-Status.json"
```

`derive-graph-path.js` fails closed on `MISSING` and `AMBIGUOUS`. `derive-output-paths.js` derives `sourceFile`, `rfcDir`, `examplesDir`, and `readmePath`, and detects fresh/refine. `discover-boundary.js` derives `packageRoot`, `workspaceRoot`, `unitId`, `role`, declared interfaces, the package README path, and the workspace README path; its scalar fields are captured once so every writer and reader targets the same files. When `packageRoot` differs from `rfcDir`, the package README writer targets `packageRoot/README.md`, the loop reads that same file, and the divergence is displayed. `EVIDENCE_DIGEST` is the package-level evidence digest used by the over-detection advisory.

Mode is detected once:

- `README.md` or `CRYSTALIZE-Status.json` exists → **refine**.
- neither exists → **fresh**.

## Marker Classification (single source: `validate-marker-grammar.js`)

| Section type | Work unit | Residue |
|---|---|---|
| Usage section | `<::TEMPLATE-README::>` | `<::README-RESIDUE::>` |
| Examples section | `<::TEMPLATE-EXAMPLES::>` | `<::EXAMPLES-RESIDUE::>` |

## Workflow

### Step 0: Read the source RFC

Read `sourceFile` from Preflight. In refine mode, also read the existing README and `CRYSTALIZE-Status.json`. This is the prerequisite for Step 1.

### Step 1: Derive and set the TOC (non-interactive)

#### 1-1. Collect evidence

```bash
node "$CLAUDE_DIR/scripts/crystalize-readme/collect-evidence.js" "$(pwd)"
```

The collector emits graph, source, seed, obligation, step-contract, spec, and example digests, the RFC-declared Rust surface, the implemented surface (advisory), and the language surface. Everything is recomputed; nothing is stored.

#### 1-2. Derive the candidate TOC

```bash
node "$CLAUDE_DIR/scripts/crystalize-readme/derive-toc.js" \
  --source-file="$SOURCE_FILE" \
  --graph="$GRAPH_PATH" \
  --interfaces="$INTERFACES" \
  --languages="$LANGUAGES" \
  --status="$STATUS_PATH"
```

The candidate always contains the semantic families (purpose, quick start, capabilities, inputs/outputs/effects, preconditions/postconditions/invariants, errors, constraints), the language usage family, the interface family when interfaces are declared, and Examples last. In refine mode, prior headings are preserved.

#### 1-3. Finalize and validate

The AI may reword, merge, or add headings. It must not remove a previously complete heading without a retirement record carrying a reason and evidence.

```bash
echo '{"nodes":<final nodes>,"waivers":<waivers>,"retirements":<retirements>}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/validate-toc-structure.js" || exit 1
echo '{"nodes":<final nodes>,"waivers":<waivers>,"retirements":<retirements>}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/update-step-status.js" --graph="$GRAPH_PATH" set-toc
```

`set-toc` writes every node with `status: "derived"`; `end-step 1` accepts derived nodes. Legacy status files with confirmed nodes remain valid.

#### 1-4. Plan refine and emit the skeleton

Build the plan from prior sections and the current evidence:

- prior complete + unchanged digest → `preserve`;
- prior complete + changed digest → `reanalyze`;
- prior residue → `reanalyze`;
- absent → `new`.

The AI may upgrade `preserve` to `reanalyze` with a recorded reason. The reverse is rejected.

In refine mode, pipe the per-section input (`priorSections`, `priorNodes`, `currentEvidence`) to `plan-refine.js` with `--readme`; every `preserve` node receives its prior body byte-for-byte, and a preserve node whose body is missing is downgraded to `reanalyze`. Omitting `--readme` returns actions only, which would silently lose the carry-forward.

```bash
node "$CLAUDE_DIR/scripts/crystalize-readme/plan-refine.js" --readme="$PRIOR_README" \
  < /tmp/crystalize-plan-input.json > /tmp/crystalize-plan.json
node "$CLAUDE_DIR/scripts/crystalize-readme/emit-readme-skeleton.js" \
  --graph="$GRAPH_PATH" --package-root="$PACKAGE_ROOT" \
  --plan=/tmp/crystalize-plan.json --english-only
echo '{"sections":<planned sections>}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/update-step-status.js" --graph="$GRAPH_PATH" set-section-states
```

In fresh mode, omit `--plan`; every section carries `<::TEMPLATE-README::>`. The no-plan path is unchanged: it overwrites the README and re-marks every usage section. Before the first overwrite, a README with no crystalize marker is copied once to `README.pre-crystalize.md`; an existing backup is never replaced and a marked README is not copied.

#### 1-5. End Step 1

```bash
node "$CLAUDE_DIR/scripts/crystalize-readme/update-step-status.js" --graph="$GRAPH_PATH" end-step 1
```

### Step 2: Section-by-section inspection loop

Entry determination: display the ticket list and identify the source-reading entry point.

```bash
node "$CLAUDE_DIR/scripts/tickets/list-phases-and-tickets.js" Tickets.json
node "$CLAUDE_DIR/scripts/crystalize-readme/loop-drive-readme.js" --graph="$GRAPH_PATH" --package-root="$PACKAGE_ROOT" --list
```

Judgment order for every section:

1. Does an implementation exist that fully works per the section's usage? Evidence: specs, source, tests, interface surface, examples.
2. Can that boundary be described exactly sufficient in the semantic, language, and interface layers?
3. Is the section consistent with the package and workspace composition?

A section is writable only when 1 passes. Contract existence never substitutes for 1.

- Writable → `resolve-section` with the complete English content.
- Not writable → `mark-residue` with concrete evidence and a reinforcement design. Include the structured `residue` object when the cause is root-caused; the command records a stable id and deduplicates it.

```bash
echo '{"id":"H1-1","heading":"<heading>","content":"<English content>"}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/loop-drive-readme.js" --graph="$GRAPH_PATH" --package-root="$PACKAGE_ROOT" --english-only resolve-section
echo '{"id":"H1-2","heading":"<heading>","content":"<evidence and reinforcement>","residue":{"level":"package","layer":"interface","element":"<element>","evidence":[{"kind":"interface-gap","ref":"<file:line>"}],"reinforcement":{"design":"<design>","acceptance":"<acceptance>"}}}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/loop-drive-readme.js" --graph="$GRAPH_PATH" --package-root="$PACKAGE_ROOT" --require-structured-residue --english-only mark-residue
```

`--require-structured-residue` is the command path's rule: a prose-only residue is refused because it would bypass the stable id, deduplication, and lifecycle. A legal residue carries `level`, `layer`, `element`, at least one `evidence` item, and a non-empty `reinforcement.design` and `reinforcement.acceptance`.

After the loop, reconcile residues and check both convergence and residue structure:

```bash
echo '{"sections":<section states>}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/update-step-status.js" --graph="$GRAPH_PATH" reconcile-residues
node "$CLAUDE_DIR/scripts/crystalize-readme/loop-drive-readme.js" --graph="$GRAPH_PATH" --package-root="$PACKAGE_ROOT" --check
node "$CLAUDE_DIR/scripts/crystalize-readme/loop-drive-readme.js" --graph="$GRAPH_PATH" --package-root="$PACKAGE_ROOT" --check-residues --evidence-digest="$EVIDENCE_DIGEST"
```

`--check` succeeds when every usage section is complete or residue and the marker grammar is clean. `--check-residues` succeeds when every active residue has evidence and reinforcement, ids are unique, every README marker has a registry record, every active record has a marker, and resolved ids are absent from the README. It also reports `POSSIBLE_OVER_DETECTION` as an advisory when many new residues appear while the evidence digest is unchanged; the advisory never blocks convergence.

### Step 3: Examples and workspace README

Finalize the trailing Examples section. It is not part of Step 2's convergence check.

```bash
echo '{"content":"<complete English examples design>"}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/loop-drive-readme.js" --graph="$GRAPH_PATH" --package-root="$PACKAGE_ROOT" --english-only resolve-examples
echo '{"content":"<evidence and reinforcement>","residue":{"level":"package","layer":"interface","element":"<element>","evidence":[{"kind":"example-failure","ref":"<file:line>"}],"reinforcement":{"design":"<design>","acceptance":"<acceptance>"}}}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/loop-drive-readme.js" --graph="$GRAPH_PATH" --package-root="$PACKAGE_ROOT" --require-structured-residue --english-only mark-examples-residue
node "$CLAUDE_DIR/scripts/crystalize-readme/loop-drive-readme.js" --graph="$GRAPH_PATH" --package-root="$PACKAGE_ROOT" --check-examples
```

Then update the workspace README before `end-step 3`. Only managed blocks are written; human text outside blocks stays byte-identical, the update runs under an exclusive lock, and both blocks must be English. The workspace block carries purpose, the package table, topology, exposed interfaces, cross-package recipes, non-goals, and workspace residue. The package table is deterministic: put `<!-- crystalize-aggregate -->` in the workspace block and supply `aggregate` records; the writer replaces the placeholder with a unit-id-sorted table that lists missing packages as `not crystallized`. The package block carries the unit id, path, role, interfaces, README link, contract state, and dependency edges. There is no completion gate.

```bash
echo '{"unitId":"<unit id>","packageBlock":"<English package block>","workspaceBlock":"<English workspace block with <!-- crystalize-aggregate -->>","aggregate":{"packageBlocks":<package records>,"knownUnits":<unit ids>}}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/workspace-readme.js" --file="$WORKSPACE_README" --update --english-only
echo '{"workspace":{"path":"'"$WORKSPACE_README"'","unitId":"<unit id>","state":"updated"}}' \
  | node "$CLAUDE_DIR/scripts/crystalize-readme/update-step-status.js" --graph="$GRAPH_PATH" set-workspace
node "$CLAUDE_DIR/scripts/crystalize-readme/update-step-status.js" --graph="$GRAPH_PATH" end-step 3
```

### Convergence policy

- Exit when every usage section is complete or residue, Examples is resolved, and every residue is actionable.
- Do not wait for zero residue. A concrete residue is a successful handoff to `/drill-rfc-down`.
- Do not create a residue for style, wording preference, or a general "documentation is missing" claim.
- Deduplicate by root cause; a stable id may appear in several sections, but the evidence is one record.
- If new residue count is high while the evidence digest is unchanged, consolidate or waive with a recorded reason.
- Do not fail because some packages have not run. The workspace README is rebuilt from the package blocks that exist.
- Implementation completeness remains the absolute precondition. A previously complete section may be preserved only when its evidence digest is unchanged.

## Reverse rotation only — the return path from a RESIDUE to its scenario and its route
**Rotation gate** — this section runs only when `return-refs-reverse-mode` holds. `return-refs.js` is invoked with `--mode=reverse`; without the flag the artefact is returned itself and no return reference is written, so this section cannot fire in a forward run.

Mode: forward | reverse
  detect: `return-refs-reverse-mode` holds / `--mode=reverse` passed. without it, this section cannot fire — the artefact returns itself, no return reference written.

forward: a RESIDUE recorded during forward rotation carries exactly the fields it carried before this section existed — RESIDUE-0 is the reverse rotation's stated success condition, and the forward shape is what that condition is counted from.

reverse: a RESIDUE is a shortfall of the product's own account, not of the RFC. it names where it came from and where it travels next: `scenario_ref` and `next_route`.
1. `scenario_ref` = the id of the confirmed section the shortfall was found in, resolved against `grill.sections[]` in `CRYSTALIZE-Status.json` (upserted by `loop-drive-readme.js`). `next_route` = the step the shortfall travels to next, one of `R3.5`/`R5`/`R6`/`grill`.
2. judge: resolve before recording. call `return-refs.js` with the RESIDUE + status file; returns the RESIDUE carrying only the references that resolved, plus a report in plain English for each that did not.
```bash
node "$CLAUDE_DIR/scripts/tickets/lib/return-refs.js" \
  --kind=residue \
  --scenario-status="<path to CRYSTALIZE-Status.json>" \
  < "<the RESIDUE as the analysis recorded it>.json"
```
3. pass only the resolved RESIDUE to `mark-residue`/`mark-examples-residue`. prohibition: an unresolvable reference is reported, never written — a pointer to a nonexistent scenario/route reads as a chain that exists, and the human following it finds nothing.
4. a RESIDUE with no known scenario or route carries no new fields and remains valid — both fields optional; an absent field is a fact about what is known, not a gap to fill with a plausible value.

exit: `return-refs.js` exits 0 regardless of resolution — the report is the output, the judgment is the human's.

Invariants:
- forward output byte-identical to its pre-change form — no required field added; a consumer unaware of `scenario_ref`/`next_route` continues to work unchanged; the count of forward RESIDUEs is unaffected
- P22-1 regression gate's command-file digest runs before and after every edit to this file
