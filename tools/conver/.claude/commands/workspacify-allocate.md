---
description: Generate the real directory tree and one RFC-SEED.md per package from WORKSPACIFY-TREE-MANIFEST.json (stage two)
argument-hint: <path-to-WORKSPACIFY-TREE-MANIFEST.json>
disable-model-invocation: true
---

# /workspacify-allocate

**Role**: Take as its only argument the `WORKSPACIFY-TREE-MANIFEST.json` published by stage one `/workspacify-tree` (see `.claude/commands/workspacify-tree.md`; the direct predecessor of this command), generate the real directory tree **in the same directory as the manifest**, and run stage two, which places **exactly one `RFC-SEED.md`** in each package directory. An RFC seed is not a finished RFC: it is the seed from which `/grill-me-for-rfc` produces the canonical RFC, directory by directory. This command itself starts neither a grill nor an implementation loop.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

- First argument (required, the only one): the path to the manifest stage one published (`<path-to-WORKSPACIFY-TREE-MANIFEST.json>`)
  - Requirements: a regular file / decodable as UTF-8 / non-empty / JSON-parseable / conforms to the tree-manifest schema / `artifact_kind == "workspacify-tree-manifest"` / `status == "COMPLETE"` / `final_audit.status == "PASS"` / `stage2_handoff.eligible == true` / self-hash matches / the recorded specification sits in the same directory as the manifest and re-hashes to `input.source_hash`
  - It requires no additional arguments, dialogue, environment variable, hook or external fetch. `--decisions` points at the AI-authored input for gate/finalize (described below)
  - If there is free-form input other than the argument, treat it as additional information

## The canonical output and its constraints

- Exactly **three** artefacts are published: the directory tree / each package's `RFC-SEED.md` / **`WORKSPACIFY-ALLOCATE-MANIFEST.json`** (the machine's final authority). They are generated **in the manifest's parent directory**
- `WORKSPACIFY-ALLOCATE-MANIFEST.json` is "a record of the proof" and **not the goal**. The goal is to publish the tree and the seeds and to prove mechanically that their coupling holds
- `RFC-SEED.md` follows 14 headings (§1 position in the whole system / §2 coupling contracts / §3 transfer and allocation / §4-13 AI authoring / §14 source traceability). **§1 and §2 are machine-injected** and the AI cannot write them
- Every seed carries three references (the source specification / the stage-1 manifest / the stage-2 manifest) in §1, and the stage-2 manifest is **a canonical path only** (embedding its hash would create a cycle)
- Intermediate artefacts (staging / scratch) are permitted only while running, and **the script deletes them mechanically in the final step**. The residue is only the three published kinds plus pre-existing files
- If a target path already exists it is **BLOCKED** (fresh-workspace only). Existing content is never merged, overwritten or deleted

## The hand-off contract from stage one (the assumptions on the receiving side)

Stage two works only from "the material stage one proved". There are only four assumptions.

- **Receive proven material**: the implementation order of the dependencies, the mandatory clause of each boundary (including preconditions, postconditions and invariants), the segments and their material, the responsibilities of each package, and the order of the contract items. Stage two never recomputes or reinterprets them, and never invents its own order or clause.
- **Shortcomings and contradictions are not patched in stage two**: stop at Step 1, correct stage one's manifest and decision, republish, and start again from validate.
- **Double gate**: stage one passes through the same entry gate, so a rejection here means the manifest has been swapped or tampered with (suspect the input, not the output).
- **On failure, follow the advice**: the entry gate states which assumption is missing as "what the problem is, why it matters, and how to fix it"..

## Scripts used

Under `.claude/scripts/workspacify-allocate/`.

| Script | Description |
|---|---|
| `run.mjs validate <manifest>` | Input lock: schema / self-hash / COMPLETE / final_audit / stage2_handoff / spec re-hash (G0/G1). Returns PASS/FAIL through the exit code |
| `run.mjs plan <manifest>` | The directory plan (ancestors + leaves, leaf↔package bijection) + path safety + existing-output policy (G2) |
| `run.mjs packet <manifest> [--package=<id>]` | AI authoring support: prints, as JSON, the per-package authoring packet (owned inventory, source excerpts, boundary context) |
| `run.mjs gate <manifest> --decisions=<path>` | decisions schema/authoring surface → the self-grill loop (G3.7: 5 focuses, convergence, residual shape, verbatim carrying of stage-1 residuals, forbidden vocabulary) → render every seed → seed-local (3 references, contract completeness) → parity → zero transfer loss (coverage of material segments plus the recording of non-material ones) → bilateral contracts (G4) → WIG (G5) → implementation order match → APPROVED presence. Only COMPLETE exits 0 |
| `run.mjs finalize <manifest> --decisions=<path>` | Re-runs every gate → builds the manifest → atomically publishes tree + seeds + allocate manifest → reload re-verification → cleanup (G6). On success only the three kinds are published |
| `run.mjs reverse --root=<dir> --decisions=<path>` | **Reverse mode.** Inverts the safety guarantee: the existing tree must match the proved plan exactly, and one extra path is BLOCKED. Judges A1 to A5, then places one RFC-SEED.md per package and the allocate manifest. Never renames a top-level entry; a failing gate publishes nothing |

## Statuses and gates

Status values: `PASS` / `FAIL` / `REVIEW_REQUIRED` / `BLOCKED` / `COMPLETE`

- `REVIEW_REQUIRED` is not success. As long as an unresolved review remains, COMPLETE is never emitted
- `BLOCKED`: the input is missing or inconsistent, a path collision, or a clash with existing output (fresh-workspace only)
- Gate hierarchy: G0 input lock → G2 transfer basis, dependency proof and safety → G3 seed render and local checks (references/contracts/coverage) → **G3.7 the self-grill and the arrival of its residuals** → G4 bilateral contracts → G5 WIG (Workspace Integration Graph: the coupling graph the extracted contracts form. It detects as violations a coupling nobody can honour, a double owner, a double change and a proof with no verifier) and the implementation order → G6 publish, reload and cleanup. A child gate is never PASS while its parent is not PASS

## The boundary between design judgement and mechanisation

- **Machine (deterministic)**: the input entry gate, spec re-hash, path safety, deriving the transfer basis, generating the authoring packet, **injecting §1/§2**, parsing headings/index/contracts, seed-local checks, parity, **the zero-transfer-loss proof**, **bilateral contracts**, **WIG verification**, **deriving the implementation order and proving it equivalent to stage-1's proof**, building the allocate manifest and its self-hash, reload re-verification, cleanup
- **AI (semantic judgement)**: authoring §4-13 of each seed, the content of the contract clauses, the wording of the boundaries, **running the self-grill loop and judging its convergence**, the grill questions, and recording `semantic_review.status === "APPROVED"`
- Avoid over-mechanisation: the machine verifies only the structure, the fidelity of the transfer and the completeness of the coupling, and **never grades the prose quality of a seed**. WIG is an intermediate artefact and is not left in the workspace; only its canonical summary and hash are recorded in the allocate manifest

## Step 1: validate (G0/G1)

**Purpose**: to "lock" the input manifest and its co-located specification. It verifies schema / self-hash / COMPLETE / final_audit / stage2_handoff, re-hashes the specification in the manifest's directory and matches it against `input.source_hash`. If this breaks, every later source trace becomes invalid.

```bash
node .claude/scripts/workspacify-allocate/run.mjs validate "$ARGUMENTS"
```

- **Success condition**: `{status:"PASS", workspaceRoot, sourceHash, manifestHash, gateSummary}` is printed and it exits 0
- **On failure**: **stop here. Do not proceed to the later Steps.**

## Step 2: the transfer basis and the dependency proof (G1.5/G2)

**Purpose**: this is not where the tree is decided (stage one already fixed it). What is fixed here is **① the segment→owner coverage table ② the inventory→package allocation table ③ the edge→boundary→mandatory clause table ④ the outline of the implementation order**, together with a preliminary check of path safety and fresh-workspace-ness.

```bash
node .claude/scripts/workspacify-allocate/run.mjs plan "$ARGUMENTS"
```

- **Success condition**: `{status:"PASS", plannedDirectoryCount, relativeDirs}` is printed and it exits 0
- **The AI's work**: check the coverage and allocation tables, and if the source has been missed, over-split or given an unnatural boundary, decide to return to stage one (this command never changes the workspace design)
- **On failure**: identify the cause from the reason for a tree↔package mismatch, an unsafe path, a symlink, or an existing file/symlink/non-empty directory that produced BLOCKED

## Step 3: authoring — writing the packet and the decisions (the AI's semantic judgement)

**Purpose**: based on the plan and manifest from Step 2, the AI writes out each package's RFC-SEED.md content as a **machine-verifiable decisions JSON**. The machine cannot read the AI's mind, so the semantic body of a seed must always reach the gate through the decisions.

### 3-1: obtaining the authoring packet

```bash
node .claude/scripts/workspacify-allocate/run.mjs packet "$ARGUMENTS"
# only a specific package: --package=pkg-0001
```

The packet contains the following (AI information supply, machine generated):
- package identity (id/name/path/layer/kind/seed_required/**responsibilities**)
- owned items: category / inventory_ref / canonical_name / source_refs (**segment id**) / source excerpt (an unresolvable one is shown in unresolved_items)
- **contract_context**: for every declared boundary, the counterpart package (with its responsibilities), `required_clauses` (stating the core ones as mandatory), the direction, and segment excerpts of the counterpart's material
- forbidden_edges: the dependencies that must not become contracts and their counterparts
- conformance/test obligations (test-support / conformance packages)

### 3-2: drafting order — draft the contracts first, the prose after

**The contract is drafted before the prose.** What decides the quality of a seed is the coupling contract, and the prose is subordinate to it.

1. From the packet's `contract_context`, first write the clause groups of each boundary (the core ones in `required_clauses` are mandatory) and settle the `contractEdges`
2. Compare them against the counterpart seed's contract (the machine checks this through the bilateral contract inspection of G4). Kill one-sided contracts and clause mismatches here
3. Once the contracts are settled, write the prose of §4〜§13. The prose refers to the clauses of §2 and must not contradict them

### 3-3: the self-grill loop (the AI reviews itself adversarially)

**This loop is run by the AI itself. Handing anything back to a human, asking a human, or waiting for a human's approval is completely forbidden** (the human grill happens later, as post-publication work per directory). Once the contracts are drafted, run the following as `self_grill`:

- Run the **five focuses** in every pass: `implementer` (can an implementer write against this contract?) / `counterpart` (does it mesh with the counterpart seed?) / `test` (can the test obligations of §11 verify the contract?) / `grill` (is it a question that can go to the human grill?) / `adversarial` (try to break this coupling: over-coupling, a missing clause, an implicit assumption)
- **The convergence condition**: stop at the pass where new findings reach 0. The **final pass of `self_grill.rounds` must have no findings** (= the evidence of convergence). If a focus does not apply, write `status: "not_applicable"` and a `reason` (if there is even one boundary, adversarial must be `ran`)
- **Only the questions you could not solve become residuals**: `topic` / `alternatives` (non-empty) / `chosen_default` / `why_unresolved` / `grill_question` / `package_id` / `origin`. The machine **appends** the `grill_question` to §12 of the seed in question, so the AI does not have to copy it across (and cannot mistype it)
- **Stage one's residuals are carried verbatim**: point at each `candidate_id` of `stage2_handoff.residual_questions` in `WORKSPACIFY-TREE-MANIFEST.json` through `origin` (`stage1_pulse` / `stage1_dependency_review`) and `origin_candidate_id`, and copy the `topic` exactly as it stands. If even one is dropped, G3.7 stops and names the candidate id
- **`TODO` / `TBD` / `ask the human` / `waiting for approval` / `human review required` / `confirm with the operator` are forbidden anywhere in the payload**. If you cannot solve it, make it a residual and write a `grill_question`

### 3-4: authoring the decisions JSON

Read the packet and the specification, and write the semantic body of every package (`seed_required: true`) into the decisions.

```json
{
  "seeds": [
    { "packageId": "pkg-0001",
      "aiSections": {
        "4": "the alpha record and the range of what is valid for it...",
        "5": "the consumer obligation...", "6": "the provider obligation...",
        "7": "not_applicable — no state", "8": "not_applicable — no external I/O",
        "9": "...", "10": "...", "11": "...",
        "12": "grill question: ...", "13": "forbidden dependencies..." },
      "contractEdges": [
        { "contract_id": "contract-boundary-001", "direction": "consumer_to_provider",
          "connection_kind": "value_only",
          "owners": { "semantic": "pkg-0002", "state": "not_applicable", "side_effect": "not_applicable", "port": "not_applicable", "adapter": "not_applicable" },
          "clauses": { "input": "...", "output": "...", "preconditions": ["..."], "postconditions": ["..."], "invariants": ["..."], "tests": ["..."] },   // a key outside the vocabulary is refused by the machine (never dropped in silence)
          "source_refs": ["s-000002"] } ] }
  ],
  "self_grill": {
    "passes": 2,
    "converged": true,
    "rounds": [
      { "pass": 1, "focus": "implementer", "status": "ran", "findings": ["the errors clause of boundary-001 is not reflected in §10"] },
      { "pass": 1, "focus": "counterpart", "status": "ran", "findings": [] },
      { "pass": 1, "focus": "test", "status": "ran", "findings": [] },
      { "pass": 1, "focus": "grill", "status": "ran", "findings": [] },
      { "pass": 1, "focus": "adversarial", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "implementer", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "counterpart", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "test", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "grill", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "adversarial", "status": "ran", "findings": [] }
    ],
    "residual": [
      { "topic": "the observation stage one left (verbatim)", "origin": "stage1_pulse", "origin_candidate_id": "pulse-000001",
        "package_id": "pkg-0001", "alternatives": ["keep it in pkg-0001", "move it to pkg-0002"],
        "chosen_default": "keep stage one's assignment", "why_unresolved": "the choice of owner changes the contract surface",
        "grill_question": "does this rule belong to pkg-0001 or to pkg-0002" }
    ]
  },
  "semantic_review": { "status": "APPROVED", "statement": "checked the owner assignment, the boundaries and the over-splitting of every package", "approver": "ai-session" }
}
```

- The AI final approval checklist (the same shape as workspacify-tree Step 3. Set `semantic_review.status` to `APPROVED` only when every item has been checked):
  - [ ] Each seed's Allocation Index matches the owner assignment of the manifest (the machine guarantees it, but the AI confirms it too)
  - [ ] The semantic body does not weaken the MUST / MUST NOT / prohibitions / formulas / schema / errors of the source
  - [ ] It does not redefine another package's semantic owner (dependencies are described as dependency_context / consumer_obligation)
  - [ ] The self-grill loop was run to convergence, and only the questions that could not be solved were left as residuals with a grill question in §12 (leaving them unattended and asking a human are both forbidden)
  - [ ] There is no over-splitting and no unnatural boundary (if there is, decide to return to stage one)
- Create the decisions outside the specification's directory (for example in `os.tmpdir()`). The schema is machine-verified against `schemas/workspacify-allocate-decisions.schema.json`

## Step 4: the gate loop (G3/G4/G5/order)

**Purpose**: verify with the machine's real gate pipeline whether the decisions and the rendered seeds "conform to the objective rules".

```bash
node .claude/scripts/workspacify-allocate/run.mjs gate "$ARGUMENTS" "--decisions=<decision.json>"
```

- **Success condition**: `{status:"COMPLETE", gateSummary}` is printed and it exits 0
- **What the gate covers**: decisions schema + authoring surface (that §1/§2 are not written and §4-13 are all present) → **the self-grill loop (G3.7)** (coverage of the 5 focuses, convergence of the final pass, the shape of the residuals, the verbatim carrying of stage-1 residuals, the forbidden vocabulary) → render every package's seed → seed-local checks (the 14 headings in order, non-empty, index match, **the three references agreeing**, **contract completeness**, segment ids existing) → seed↔manifest parity → **zero transfer loss** (every segment with a non-empty `owned_inventory_ids` is referenced, and a segment with none is recorded as non-material) → **bilateral contracts (G4)** → **WIG (G5)** → **the implementation order matches stage-1's proof** → **the arrival of the residuals (the G3.7 re-check)** (every `grill_question` exists verbatim in §12 of its seed) → `semantic_review.status === "APPROVED"` presence
- **The AI's work**: correct the decisions according to the cause of the FAIL (schema / an empty body / parity / an uncovered segment / a one-sided contract / a clause mismatch / a WIG violation / an order mismatch / **G3.7: a missing focus, non-convergence, a malformed residual, a dropped stage-1 residual, the forbidden vocabulary** / APPROVED not recorded) and **repeat until exit 0** (the self-repair loop). The machine never grades prose quality

## Step 5: building the canonical artefact and publishing it atomically (G6)

**Purpose**: only when every gate is PASS and the semantic approval is recorded, build the tree + seeds + `WORKSPACIFY-ALLOCATE-MANIFEST.json` in staging, **publish them together atomically**, and re-verify the published artefacts themselves.

```bash
node .claude/scripts/workspacify-allocate/run.mjs finalize "$ARGUMENTS" "--decisions=<decision.json>"
```

- **Condition to run**: every gate PASS and `semantic_review.status === "APPROVED"`. Otherwise it does not reach COMPLETE and exits non-zero
- **The publish procedure**: build the tree + all seeds + the manifest in staging → verify the staged set (the planned directories, all seeds, and nothing beyond the manifest) → atomic rename per top-level entry (with rollback) → **reload re-verification** → **mechanical deletion of the intermediate artefacts** → report
- **reload re-verification**: rescan the tree → re-parse every seed → re-extract the contracts → rebuild WIG (compare the hash) → re-derive the implementation order → re-prove the coverage → verify the manifest's self-hash. A divergence fails by naming the artefact and the package
- **Output on success**: `{published:true, workspaceRoot, allocateManifestPath, allocateManifestHash, inputManifestHash, directoryCount, packageCount, seedCount, contractCount, waveCount, gateSummary, residue}`
- **Protection of existing output**: if a target path is a file/symlink/non-empty directory, it stops BLOCKED and never replaces or destroys the existing tree

## Step 6: report

- On success, print **only the workspace root's absolute path / the input manifest hash / the directory count / the package count / the seed count / the gate summary**
- On failure, print **the id of the failing gate / the reason / the input to fix (manifest, decisions, co-located spec)**

## Error recovery

- On failure, read the `[guide]` on stderr (the cause and what to fix), correct the input or the decisions, and run the gate again
- `REVIEW_REQUIRED` / `BLOCKED` never become `COMPLETE`, and the existing workspace is always preserved

## Appendix A: the required headings of RFC-SEED.md and the Allocation Index grammar

Exactly **one** `RFC-SEED.md` is placed per package. It carries the following **14 headings** in this order, and **§1 and §2 are injected by the machine** (the AI cannot write them). Every body is either non-empty or carries a reason in the typed form `not_applicable — <reason>`. The machine cannot make a body empty (so that it never fabricates the semantics the AI should write).

```text
# RFC Seed: <package-name>
## 1. Identity and Position in the Whole System      <- machine-injected (3 references / implementation order / contract ids / covered segments)
## 2. Coupling Contracts (I/O Boundary)              <- machine-injected (the clause groups of each boundary)
## 3. Source Coverage and Allocation Index           <- machine-injected (the Allocation Index table + coverage)
## 4. In-Scope Objects, Claims, Predicates, State and Invariants
## 5. Incoming Dependencies and Consumer Obligations      (refers to contract_id)
## 6. Outgoing Provider Obligations                       (refers to contract_id)
## 7. State Ownership and State-Transition Material
## 8. Side-Effect and External-I/O Boundaries
## 9. Canonicalization, Signatures and Proof Responsibilities
## 10. Failure, Rejection, Recovery and Finality Material
## 11. Required Unit, Integration, Exception and Malfeasance Test Material
## 12. Grill Questions and Explicitly Unresolved Design Choices
## 13. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals
## 14. Source Traceability Index                     <- machine-injected (with segment ids)
```

§1 is **machine-injected JSON** (the three reference paths, the implementation order, the contract ids, the covered segments), and §2 is **the coupling contract as JSON** (the clause groups of each boundary). These two sections are the machine's canonical authority for the coupling, and the prose of §5〜§11 refers to the contract ids of §2 and must not contradict them. The Allocation Index of §3 is the only table that makes the manifest's owner assignment machine-extractable, and it is the following three-column Markdown table:

```markdown
### Allocation Index

| Category | Inventory ID | Canonical Name |
| --- | --- | --- |
| object | obj-000001 | Alpha Record |
| invariant | inv-1 | alpha-invariant |
```

The machine recovers this table with `lib/seed-parse.mjs` and, with `lib/seed-parity.mjs`, verifies it against `workspace.ownership.entries` of the manifest as **a bijection across all packages (0 missing, 0 duplicated, 0 unknown, 0 leaked to another seed)**. The table carries only the items this package owns. An item owned by another package may be explained in the prose as dependency_context / consumer_obligation, but it **must not appear in the table**.

## Appendix B: the fields of the decisions input

`gate` / `finalize` read the AI-authored decisions JSON. The schema is machine-verified against `schemas/workspacify-allocate-decisions.schema.json`.

| Field | Type | Content |
|---|---|---|
| `seeds[].packageId` | string | The id of a package in the catalog (one entry is required for every package with `seed_required: true`) |
| `seeds[].aiSections` | object | The semantic body the AI authors. The keys are heading numbers and **the ten of §4〜§13 are required** (§1/§2/§3/§14 are machine-injected; including a key for them makes the schema and the authoring surface refuse it). A missing or empty one is a render error |
| `seeds[].contractEdges` | array | The **coupling contract** for each boundary this package carries. `contract_id` / `direction` / `connection_kind` / `owners` (semantic/state/side_effect/port/adapter) / `clauses` (the keys are the closed vocabulary of contract clauses only. **A key outside the vocabulary is refused by naming the contract id and the key, and is never dropped in silence**. The values satisfy `stage2_contract_scope`. **The five core clauses are mandatory**) / `source_refs` (segment ids). A declared boundary with no contract makes the local gate FAIL, and a contract_id outside the declaration is refused |
| `semantic_review.status` | `APPROVED`/`REVIEW_REQUIRED` | The AI's final semantic approval. Anything but `APPROVED` cannot be finalized |
| `semantic_review.statement` | string | A summary of what was checked |
| `semantic_review.approver` | string | The identifier of the session that made the judgement |

## Appendix C: examples of run.mjs output

```text
$ node .claude/scripts/workspacify-allocate/run.mjs validate ./WORKSPACIFY-TREE-MANIFEST.json
{"status":"PASS","workspaceRoot":"/work/specs","sourceHash":"ab12…","manifestHash":"cd34…","gateSummary":"G0:PASS G1:PASS"}

$ node .claude/scripts/workspacify-allocate/run.mjs gate ./WORKSPACIFY-TREE-MANIFEST.json --decisions=/tmp/decisions.json
{"status":"COMPLETE","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS semantic:APPROVED"}

$ node .claude/scripts/workspacify-allocate/run.mjs finalize ./WORKSPACIFY-TREE-MANIFEST.json --decisions=/tmp/decisions.json
{"published":true,"workspaceRoot":"/work/specs","allocateManifestPath":"/work/specs/WORKSPACIFY-ALLOCATE-MANIFEST.json",
 "allocateManifestHash":"ef56…","residue":["WORKSPACIFY-ALLOCATE-MANIFEST.json","WORKSPACIFY-TREE-MANIFEST.json","crates","spec.md"],
 "inputManifestHash":"cd34…","directoryCount":7,"packageCount":3,"seedCount":3,"contractCount":2,"waveCount":2,
 "segmentCoverage":"5/5","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS G6:PASS semantic:APPROVED"}
```

On failure it prints `{status:"FAIL", gateId, reason}` to stdout and a human-readable guide (the next action) to stderr. On success it prints **the workspace root / the allocate manifest's path and hash / the input manifest hash / the directory, package, seed and contract counts / the wave count / the segment coverage / the gate summary / the residue**.

## Appendix D: the AI final semantic approval checklist (detailed)

Before setting `semantic_review.status` to `APPROVED`, the AI checks **every** item. If even one is unmet, it does not set `APPROVED`: it corrects the decisions and returns to the gate (while unapproved, the machine never emits COMPLETE).

- [ ] **Soundness of the owner assignment**: each seed's Allocation Index matches the manifest's owner assignment, with nothing unallocated, duplicated or leaked to another seed (machine parity guarantees it; the AI also inspects §1/§2/§3 visually)
- [ ] **Preservation of the source's norms**: it does not weaken, without grounds, the MUST / MUST NOT / prohibitions / formulas / schema / errors of an object/claim/invariant/state machine/error/required test (source trace is preserved)
- [ ] **No redefinition of a semantic owner**: it does not re-own a norm owned by another package, and describes dependencies as dependency_context / consumer_obligation
- [ ] **Completeness of the coupling contract**: each boundary's contract is in §2, and the core clauses — **including preconditions, postconditions and invariants** — are not empty. It does not contradict the counterpart seed (the machine verifies bilateral symmetry, WIG and the order, but whether the meaning is right is the AI's judgement)
- [ ] **Forbidden dependencies and non-interference**: the manifest's forbidden edges and non-goals are reflected in §13, and no coupling contradicts the contract of §2
- [ ] **Respect for the implementation order**: it states no premise that contradicts the provider-first order `implementation_order` shows in §1 (such as a description that depends on an unimplemented counterpart)
- [ ] **Stating what is unclear**: it does not leave an ambiguous or unresolved design decision unattended, but writes a `grill_question` as a `residual` of the self-grill loop and leaves it in §12 (TODO/TBD are forbidden anywhere in the payload)
- [ ] **The final decision on over-splitting and boundaries**: if there is a sign of shared internal state, splitting an intermediate value, an unavoidable mutual dependency or reimplementing an invariant, it has decided to return to stage one

## Appendix F: the structure of WORKSPACIFY-ALLOCATE-MANIFEST.json

The published machine final authority. Stage three (the implementation loop of each directory) reads it.

| Field | Content |
|---|---|
| `artifact_kind` / `schema_version` / `status` | `workspacify-allocate-manifest` / `1.0.0` / `COMPLETE` |
| `input_tree_manifest` | `{path, hash, spec:{path, sha256}}` — the stage-1 manifest and the source specification that were proven |
| `seed_index[]` | `{package, path, sha256}` — every published seed (the path is workspace-relative) |
| `source_coverage` | `segments_total` / `segments_covered` / `material_segments` / `non_material_segments` / `uncovered` (always empty) |
| `contract_registry[]` | The verified coupling contracts (contract_id, boundary_id, consumer/provider, connection_kind, owners, clauses, source_refs) |
| `wig` | `summary` (the node/edge counts by layer and by kind), `counts`, `hash`, `violations` (always empty) |
| `implementation_order` | `{serial, levels}` — provider first. Verified to match stage-1's proof |
| `allocation` | The package / seed / parsed-package counts |
| `gates[]` | The results of G4 and G5 |
| `self_grill` | The proof of the self-grill loop: `passes` / `converged` / `focuses` / `rounds[]` (pass, focus, status, finding_count) / `residual_count` |
| `handoff_summary` | The hand-off to the human grill: `unresolved[]` (residual_id, package_id, topic, why_unresolved) / `grill_questions[]` (residual_id, package_id, question) / `risky_boundaries[]` (the boundaries whose endpoint carries a residual. Read from here) |
| `semantic_review` | The AI's final semantic approval (`status` / `approver`) |
| `completion_decision` | `COMPLETE` |
| `integrity` | `canonicalization` / `manifest_hash_algorithm` / `manifest_hash` (the self-hash of the canonical serialisation) / `reload_validation` |

It is referenced from the seeds **by canonical path**, and no hash is embedded (the manifest holds every seed's hash, so it would cycle).

## Appendix E: the relationship to the stages before and after

`/workspacify-tree` + `/workspacify-allocate` are the entrance that turns a single long specification into "workspace decomposition → realisation" and runs the later stages **directory by directory**.

- `/workspacify-tree`: analyses the specification, designs the workspace/package decomposition and publishes `WORKSPACIFY-TREE-MANIFEST.json` (stage one)
- `/workspacify-allocate`: takes that manifest as input and generates the real directory tree plus one RFC-SEED.md per package (stage two, this command)
- After that, each package directory's RFC-SEED.md becomes the input of `/grill-me-for-rfc`, and the loop canonical RFC → `/graphify-rfc` → `/boundify-graph` → `/split-to-tickets` → `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket` runs **per directory**

This command starts neither `/grill-me-for-rfc` nor `/graphify-rfc` nor an implementation loop. At allocate time it **settles the coupling contracts in a machine-readable form and verifies them down to bilateral symmetry, WIG and the implementation order**. After that, the `/graphify-rfc` of each directory canonicalises the contract edges and the implementation loop turns. WIG is an intermediate artefact and is not left in the workspace (only its canonical summary and hash are recorded in the allocate manifest).

## Prohibitions

- **Do not leave intermediate artefacts (a WIG, contracts or a working temporary file written to a separate file) as published output** (only the three kinds are published: tree / seeds / allocate manifest)
- **Do not create a second machine authority (a WIG or contracts written to a separate file)** — the authority is the one allocate manifest
- **Do not let the AI write §1/§2** (machine-injected only. Including them in the decisions is refused)
- Do not use hooks (Claude Code / Git / shell)
- Do not merge into, overwrite or delete existing content (fresh-workspace only)
- Do not infer the workspace root from the current directory, an environment variable or a branch
- Do not try to grade prose quality by machine (so as not to obstruct the AI's judgement)

## Definition of success

Success is consolidated into the coexistence of **① the AI's final semantic approval** (`semantic_review.status === "APPROVED"` in the decisions) and **② every machine gate PASS, zero transfer loss, the bilateral contracts holding, 0 WIG violations, the implementation order matching stage-1's proof, and reload verification PASS**. The final confirmation is a rescan of the generated tree, a re-parse of every RFC-SEED.md with re-extraction of the contracts, a rebuild of WIG and a re-derivation of the order, the allocate manifest's self-hash, and that the residue is only the three published kinds plus pre-existing files.

---

## Reverse mode (A1 to A6)

**Rotation gate** — this section runs only when `reverse-decisions-mode` holds. The forward rotation invokes `finalize`, and `resolveTreeMode` / `resolveAllocateMode` return FORWARD for an absent, an empty or an unrecognised mode, so this section cannot fire in one.

**Role**: when the project already exists, the directory tree cannot be created — it is already there, and it is the thing the whole phase exists to preserve. Reverse mode keeps the forward gates G0 to G5 exactly as they are and adds a second safety guarantee, pointing the other way.

**Invocation**: `run.mjs reverse --root=<project directory> --decisions=<path>`, with the stage-1 manifest read from `<root>/WORKSPACIFY-TREE-MANIFEST.json`.

**The inversion.** Forward mode guarantees `fresh-workspace only` and publishes by renaming each top-level directory into place. In the reverse direction that same rename would move the existing `src/` and `tests/`. So the guarantee is re-tensioned rather than dropped: **every planned path must exist, every existing path must be planned, and a single extra path is BLOCKED with the path named.** The strength is identical; only the direction of the comparison changed.

| Gate | FAIL condition | PASS condition |
|---|---|---|
| **A1 safety inversion** | the plan and the tree are not the same directory set | they are the same set, or the run is BLOCKED with every extra and missing path named |
| **A2 additions only** | a write outside `RFC-SEED.md` and the manifest, or a top-level entry that changed name | writes are inside the allow-list and the top-level directories are unchanged |
| **A3 packet extension** | a package that declares consumers arrives with an empty incoming-dependency excerpt | every packet carries the excerpt it owes |
| **A4 section 1 index** | section 1 carries no reverse index, or the seed has a heading count other than 14 | the index sits inside section 1 and the count is 14 |
| **A5 seed parity** | the Allocation Index to ownership bijection is broken | 0 missing / 0 duplicated / 0 leaked |

**A6 folds into A3.** The provider-packet obligation — hand the author the implementation of the packages that *use* this one — is the same material A3 requires, so it has one verdict rather than two. Without it a session authoring a seed sees a function with no visible callers and has to guess why it exists, and a guess is what a ratification RFC is made of.

**What A3 does not fail on.** A package the manifest declares nothing consumes is *recorded*, not failed. Every finite dependency graph has a leaf, so failing there would mean a reverse run could never succeed at all. A3 fails when the material was dropped, which is the omission it exists to catch.

**The write allow-list** is `RFC-SEED.md` and `WORKSPACIFY-ALLOCATE-MANIFEST.json`, defined once and checked in one place. Reverse mode names no rename primitive and never calls the staged publisher, so a run that cannot rename cannot destroy a tree.

**Where the reverse index comes from.** The reverse tree run records `reverse_provenance` on the manifest — the sidecar bundle hash and a count summary. Reverse allocate reads it to populate section 1's index and to name the sidecar it resolved against. A manifest without that provenance is one this step cannot render, and A4 says so rather than inventing one.

**Causes of a reverse FAIL, by gate**: a directory present with no package (A1, "extra"), a declared package with no directory (A1, "missing"), a write outside the allow-list or a renamed top-level entry (A2), an excerpt the packet owed and did not carry (A3), a missing reverse index or a fifteenth heading (A4), a broken Allocation Index bijection (A5).

**The heading contract is not modified.** `seed-parse.mjs` still enforces an exact match against `SEED_REQUIRED_SECTIONS`, and the reverse index extends section 1 in place rather than becoming section 15. The forward rotation cannot observe any of this.
