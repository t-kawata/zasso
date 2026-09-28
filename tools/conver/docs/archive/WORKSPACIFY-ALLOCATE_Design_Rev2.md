# Stage 2 (`/workspacify-allocate`) — Design Rev2

Supersedes the parts of `WORKSPACIFY-ALLOCATE_Complete_Implementation_Instruction.md` that
invert the goal. Rev2 keeps that document's *machinery* (WIC, WIG, allocate manifest,
coverage, contract gates) and rejects its *framing* (that producing
`WORKSPACIFY-ALLOCATE-MANIFEST.json` — or the WIG — is the purpose of the command).

## 0. Corrected premise

Stage 2 takes `WORKSPACIFY-TREE-MANIFEST.json` and produces, **in the manifest's own
directory**:

1. the real directory tree (already decided by stage 1 — stage 2 never decides it),
2. exactly one `RFC-SEED.md` per `seed_required` package,
3. `WORKSPACIFY-ALLOCATE-MANIFEST.json` — the machine final authority for the *contract
   verification*, not the goal of the command.

Each seed is the starting point of the per-directory convergent loop
(grill → graphify → boundify → split → make/plan/start/review). A directory whose seed
cannot state its coupling completely is a directory that cannot be implemented safely,
and a workspace containing one such directory collapses as a whole. That is why coupling
and dependency are the two most important sections of every seed.

## Part A. Stage-1 changes required (`workspacify-tree`)

| # | Change | Current evidence | Target |
|---|---|---|---|
| T1 | Persist the dependency proof | `lib/dag.mjs:123` computes `topological_order` but the manifest keeps only `final_audit.cycle_count` | add `dependencies.dag` = `{edge_count, cycle_count, topological_order[], levels[][], canonical_edges[]}` |
| T2 | Normalise contract scope | `run.mjs:399` hardcodes the same 15-clause list per boundary, unnamed, unvalidated | named `CONTRACT_CLAUSES` constant; core clauses (`input`, `output`, `preconditions`, `postconditions`, `invariants`) mandatory for every boundary; per-boundary scope declared and schema/gate-enforced |
| T3 | Normalise segment coverage | `lib/segmentation.mjs` already partitions the whole normalised spec (`s-000001` ids, preamble + chapters) but the manifest does not state totality, and inventory `source_refs` are not guaranteed to be segment-based | `structure.segments` totality invariant + `segment_count` / `covered_bytes`; every inventory item and normative candidate must carry a `segment_id` in `source_refs` |
| T4 | Require package responsibilities | `lib/validation.mjs:45` only counts `missing_responsibilities_count` | empty `responsibilities` becomes a FAIL condition (it is the source of the seed's "role in the system") |
| T5 | Define `stage2_handoff` semantics | `contract_definition_order` / `contract_boundaries` exist but empty is tolerated | define ordering semantics, require non-empty; `entry_gate` additionally requires the DAG proof and contract scope to be present |
| T6 | Update `workspacify-tree.md` | the hand-off to stage 2 is appendix-level (`L189`) | promote "hand-off contract to stage 2" to a first-class section (DAG proof, contract scope, segment coverage, order outline); add a dependency-proof item to the AI approval checklist |

Edge↔boundary 1:1 coverage (doc `L94/L122/L132`) and the DAG/cycle/layer gates already
hold. T1–T3 therefore record facts stage 1 already computes rather than adding new
judgement.

## Part B. Stage-2 design

### B0. Step semantics

| Old | New |
|---|---|
| Step 2 = decide the directory set | **Step 2 = fix the transfer basis and the dependency proof**: segment→owner coverage table, inventory→package allocation table, edge→boundary→required-clause table, DAG verification and **derivation of the implementation order (serial index / parallel waves)**. Directory safety and fresh-workspace checks remain as *preconditions* |
| Step 3 = write seed prose | **Step 3 = write seed prose *and* the coupling contracts** (contracts are the priority) |
| Step 4 = render / local / parity | **Step 4 = contract completeness → bilateral symmetry → WIG verification → order confirmation** loop |

### B1. Published artifacts

1. the directory tree, 2. one `RFC-SEED.md` per package, 3. `WORKSPACIFY-ALLOCATE-MANIFEST.json`
at the workspace root containing: `input_tree_manifest{path, hash, spec{path, hash}}`,
`seed_index[{package, path, sha256}]`, `source_coverage{segments_total, segments_covered,
uncovered[]=0}`, `contract_registry[]` (canonical ContractEdges), `wig{summary, counts,
hash, violations[]=0}`, `implementation_order{serial[], levels[][]}`, `allocation`,
`gates[]`, `semantic_review`, `integrity{canonicalization, self_hash,
reload_validation}`, `completion_decision`.

**Circular-hash resolution**: a seed references the allocate manifest by canonical
relative path only (no hash); the allocate manifest carries every seed's sha256. The
reference is one-way, and manifest integrity is proven by reload validation.

### B2. Seed grammar (coupling and dependency first)

```
# RFC Seed: <package-name>
## 1. Identity and Position in the Whole System   <- proof of "independent yet not independent"
## 2. Coupling Contracts (I/O Boundary)           <- contract authority
## 3. Source Coverage and Allocation Index        <- zero-omission proof
## 4. In-Scope Objects, Claims, Predicates, State and Invariants
## 5. Incoming Dependencies and Consumer Obligations   (references contract_id)
## 6. Outgoing Provider Obligations                    (references contract_id)
## 7. State Ownership and State-Transition Material
## 8. Side-Effect and External-I/O Boundaries
## 9. Canonicalization, Signatures and Proof Responsibilities
## 10. Failure, Rejection, Recovery and Finality Material
## 11. Required Unit, Integration, Exception and Malfeasance Test Material
## 12. Grill Questions and Explicitly Unresolved Design Choices
## 13. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals
## 14. Source Traceability Index                       (segment_id <-> statement table)
```

`§1` JSON (machine-injected fields + AI-authored fields):
`package{id,name,path,layer,kind,responsibilities}` /
`source_spec{path, sha256}` / `stage1_manifest{path, hash}` / `stage2_manifest{path}` /
`implementation_order{before[], after[], parallel_with[], serial_index, wave}` /
`contract_refs[contract_id]` / `source_segments[]` / `role_in_system` (AI).

`§2` JSON: `seed_package`, `seed_path`, `contract_edges[]`, `no_external_contracts`
(+ typed reason; an empty array alone is not sufficient).

`ContractEdge`: `contract_id` (stable, unique) / consumer and provider (package + path) /
`direction` / `connection_kind` / five owners (semantic, state, side_effect, port,
adapter) / `clauses{input, output, preconditions[], postconditions[], invariants[],
errors[], state_ownership, idempotency, atomicity, ordering, finality, canonicalization,
signature, proof_verification, tests[]}` / `source_refs[]` (segment ids).

Every clause is required to match the stage-1 boundary scope, whose core five clauses are
always mandatory. Prose in §5–§11 references contract ids and must not contradict them.

### B3. Contract completeness and symmetry (G4)

For every `normal_edges` edge, both the consumer seed and the provider seed must carry the
same `contract_id` with mirror-identical content (direction reversed only). Zero unknown
packages, self-loops, duplicate ids, reverse edges, undeclared edges, forbidden edges,
layer violations, cycles; zero owner collisions; proof-lifecycle closure; zero state
mutation conflicts; zero side-effect races; zero reachable forbidden semantic-flow paths;
a test obligation for every clause.

### B4. Zero-omission transfer proof (G1.5 / G3.5)

Every `structure.segments` id is referenced by at least one seed (§3 or §14); every
inventory object / claim / normative candidate / invariant / error / required test lands
in at least one seed's Allocation Index; semantic ownership stays unique. A seed that
declares a source segment `not_applicable` must give the reason and the supporting
segment.

### B5. Implementation order (deterministic)

Derive from the verified contract DAG plus `dependencies.dag` using Kahn's algorithm with
canonical key tie-breaking, emitting `serial[]` and `levels[][]`, and verify equivalence
with the stage-1 proof (mismatch is FAIL). Each seed's `§1 implementation_order` is
machine-injected, never AI-authored.

### B6. Pipeline and gates

```
Step 1 validate        G0/G1   input lock + segment totality + presence of the DAG proof
Step 2 basis & proof   G1.5/G2 coverage and allocation basis, edge->clause table, order derivation, preconditions
Step 3 authoring       -       packet (counterpart package, required clause list, excerpts) -> decisions
Step 4 gate loop       G3.5/G3.8/G4.*/G5.*  seed grammar and coverage, contract completeness and symmetry, WIG
Step 5 order & manifest G6.5   confirm order, final render, build the allocate manifest
Step 6 publish & reload G6.3-6 staging, atomic publish, rescan + re-parse + WIC re-extraction + WIG rebuild + order re-derivation
Step 7 cleanup         -       remove staging, intermediate JSON and temporary renders mechanically (success and failure)
```

Any unmet condition means no `COMPLETE`, a non-zero exit, and no destruction of existing
output.

### B7. Scripts

`lib/contract-model.mjs` (ContractEdge schema, clause vocabulary, canonicalisation),
`lib/coverage-proof.mjs`, `lib/contract-gate.mjs` (G4), `lib/wig.mjs` (G5),
`lib/implementation-order.mjs`, `walk-seed-contracts.mjs` (**walks the tree and
mechanically extracts the contract JSON from every RFC-SEED.md**),
`publish-allocate-manifest.mjs`, `cleanup-workspace-artifacts.mjs`, and `run.mjs` as the
thin orchestrator.

### B8. Existing assets that must be reversed

`workspacify-allocate.md` L32/L33 and the purposes of Steps 2 and 5; `lib/seed-model.mjs`
(15 headings → new grammar); `seed-render.mjs`; `seed-parse.mjs`; and the tests that pin
the old direction (`end-to-end-allocate`, `command-realize`, `runmjs-handlers`).

## Part C. Guaranteed delivery of the three reference paths (appended)

Every `RFC-SEED.md` must carry the reference paths to

1. the original long specification (the argument of `workspacify-tree`),
2. `WORKSPACIFY-TREE-MANIFEST.json`,
3. `WORKSPACIFY-ALLOCATE-MANIFEST.json`.

Guarantee is enforced by four layers; presence in the grammar is not sufficient on its own.

**C1. Machine authorship.** `renderSeed` generates the `§1` JSON from a template, never
from AI text. Values come from measurement, not from declarations:
spec = `<manifestDir>/<input.spec_path>` (existence checked, re-hashed);
tree manifest = the canonical path of the manifest passed on the command line plus its
self-hash; allocate manifest = `<manifestDir>/WORKSPACIFY-ALLOCATE-MANIFEST.json`, which is
known before publication because the location is canonical. Paths are written relative to
the workspace root so the workspace stays portable. Hashes are carried for the spec and
the tree manifest only; the allocate manifest is referenced by path alone, which keeps the
reference one-way and avoids the circular hash described in B1.

**C2. Excluded from AI input.** The `aiSections` key set does not include `§1`. If a
decision payload supplies it, the value is discarded and reported as a schema violation,
so a seed can neither omit nor overwrite the block.

**C3. Gate on existence and agreement.** `seed-parse.mjs` parses the `§1` JSON and the
seed-local gate (G3.x) checks that all three references are present and resolvable, that
the spec re-hash equals `input.source_hash`, that the tree manifest hash equals the
self-hash of the manifest supplied on the command line, and that the allocate manifest
path equals the canonical location. Any failure is a FAIL, not a warning.

**C4. Cross-seed and post-publication re-verification.** `walk-seed-contracts.mjs` walks
the directory tree, reads `§1` from every seed, and makes "three references present in
every seed, zero missing" a gate condition (G6.5). After publication the reload pass
re-parses every seed and re-checks the same agreement, and additionally confirms the
allocate manifest exists at the canonical path each seed names.

Tests pin the guarantee: every rendered seed carries the three references; a seed whose
`§1` is absent, altered, or divergent from the manifest fails; a missing file or a hash
mismatch fails.

## Part D. Invariants and failure policy

- Stage 2 never decides the directory tree; it reproduces `workspace.tree`.
- Existing paths are never merged, overwritten or deleted (fresh-workspace only).
- No `COMPLETE` while any gate, coverage item, contract clause or semantic review is open.
- Intermediate artifacts are permitted mid-run but must be removed mechanically by the
  final step; what remains is the tree, the seeds and the allocate manifest.

## Part E. Ticket plan

1. **PX-192** — stage-1 changes T1–T6 plus stage-1 tests (must land first; it produces
   stage-2's inputs).
2. **PX-193** — contract model, new seed grammar, coverage proof, packet extension,
   render/parse.
3. **PX-194** — WIG, contract gates, implementation-order derivation, `walk-seed-contracts`.
4. **PX-195** — allocate manifest, reload re-extraction/rebuild, cleanup, command doc
   rewrite.
5. **PX-196** (optional) — reverse the doc/test assertions that pin the discarded
   direction.
