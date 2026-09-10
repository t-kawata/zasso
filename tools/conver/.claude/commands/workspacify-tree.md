---
description: Analyse a long Markdown specification and publish WORKSPACIFY-TREE-MANIFEST.json as the single canonical authority (stage one)
argument-hint: <path-to-specification.md>
disable-model-invocation: true
---

# /workspacify-tree

**Role**: Taking a single Markdown specification as input, run the structural analysis, candidate harvesting, workspace design and completeness gates, and execute "stage one of designing a long specification into a workspace/crate/package structure that can be split safely and implemented". Publish the `WORKSPACIFY-TREE-MANIFEST.json` that the later stage two can accept as its only argument. This command does not implement the specification. The design judgement is made by the AI (= the running session); the machine carries out harvesting, verification and publication.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

- First argument (required, the only one): the path to the specification (`<path-to-specification.md>`)
  - Requirements: a regular file / decodable as UTF-8 / non-empty / contains at least one ATX heading / readable
  - It requires no additional arguments, dialogue, environment variable, hook or external fetch
  - If there is free-form input other than the argument, treat it as additional information

## The canonical output and its constraints

- Exactly **one** canonical artefact is published on success: `WORKSPACIFY-TREE-MANIFEST.json` in the **current directory** (the working directory at the time the command runs)

## Scripts used

Under `.claude/scripts/workspacify-tree/`.

| Script | Description |
|---|---|
| `run.mjs parse <spec>` | Input lock / normalisation / hash / headings / segments / reconstruction match (G0/G1). Returns PASS/FAIL through the exit code |
| `run.mjs extract <spec>` | Harvests object/claim plus invariant / state machine / error code / required test as independent categories, and gives every candidate source traceability (G2). Prints candidate statistics |
| `run.mjs gate --spec=.. --decisions=..` | Runs the **real gate pipeline** over the decision input and returns the per-gate result. Only COMPLETE exits 0 |
| `run.mjs finalize --spec=.. --decisions=..` | Applies ownership → runs every gate → assembles the manifest → self-hash → publishes to the current directory |
| `run.mjs reverse --spec=.. --decisions=.. --root=..` | **Reverse mode.** Runs the same G0–G5, then judges T1 to T6 over the measured project tree under `--root`, reads the logical/physical mismatches the operator recorded in `ARCHITECTURE-DELTA.json`, and publishes the manifest with `reverse_provenance`. Only `COMPLETE` exits 0; a failing gate publishes nothing |

## Statuses and gates

Status values: `PASS` / `FAIL` / `REVIEW_REQUIRED` / `BLOCKED` / `COMPLETE`

- `REVIEW_REQUIRED` is not success. As long as an unresolved review remains, COMPLETE is never emitted
- `BLOCKED`: refuses to overwrite when the specification differs from the input hash of an existing manifest

Gate hierarchy: G0 input lock → G1 structure (headings/segments/reconstruction) → G2 requirement inventory → G3 workspace (catalog/ownership/over-splitting/mandatory responsibilities) → G4 dependencies (DAG/layer rules/cycles/**proof of the implementation order**) → G5 artefact completeness (schema/self-hash). A child gate is never PASS while its parent is not PASS.

## The boundary between design judgement and mechanisation

- **Machine (deterministic)**: harvesting, format verification, ownership uniqueness, DAG/cycles, forbidden layers, raw SQL, DB type leakage, self-hash
- **AI (semantic judgement)**: the workspace tree design, owner assignment, the final decision on over-splitting, whether adapter/DB applies, the choice of reasonCode, the alternative route for a forbidden edge, approval of REVIEW_REQUIRED items

Avoid over-mechanisation: boundary-review goes as far as "finding risk candidates". The extractor goes as far as harvesting candidates. The verifier goes as far as checking constraints.

## The hand-off contract to stage two (ALLOCATE)

The output of stage one must be material from which stage two can decide, by machine verification alone, that the coupling contract is satisfied.

- **Hand over with proof**: the implementation order of the dependencies (the providers), the clause groups of each boundary (including preconditions, postconditions and invariants), the segments and the material they carry, the responsibilities of each package, and the order of the contract items. Every one of them must be recomputable deterministically (the same specification and decisions produce the same manifest).
- **Prohibition**: a manifest that does not pass verification must not be published. You must not hand over an unverified order, clause or segment reference merely by writing it down.
- **Double gate**: immediately before publication, finalize calls stage two's entry gate as the authority, and a manifest it does not accept stops at G5. The checks of stage one and stage two are the same predicate, and no one-sided bypass exists.
- **On failure, follow the advice**: every gate, when it fails, prints "what the problem is, why it matters, and how to fix it"..

## Step 1: parse (G0/G1)

**The purpose of this step**: to "lock" the input specification. It checks whether the file is readable / UTF-8 / non-empty, settles the normalisation (unified newlines, trailing newline preserved) and the SHA-256, splits the document into a heading tree and `##`-level segments, and then proves by machine that "recombining the segments matches the original bytes exactly". If this breaks, every later source traceability becomes invalid, which makes it the first checkpoint.

```bash
node .claude/scripts/workspacify-tree/run.mjs parse "$ARGUMENTS"
```

- **What the output means**: `source_hash` = the SHA-256 of the whole normalised input (the immutable fingerprint every later entry gate refers to). `reconstruction` = the verification result of recombining the segments
- **Success condition (to advance to the next step)**: `reconstruction.status == PASS` and `source_hash` is printed
- **On failure**: identify the cause from the error (does not exist / is a directory / empty / not UTF-8 / reconstruction mismatch), correct the input specification and run again

## Step 2: extract (G2)

**The purpose of this step**: to harvest, without omission, the "candidates that could become implementation targets" from the locked structure, and to attach the source location (source traceability) to every candidate. Harvesting runs on deterministic patterns (the object column of a table / inline code / claim code blocks / normative phrases), and invariant / error code / required test are separated as **independent categories** rather than folded into `terms`. If the AI does not review them here, the later design suffers from "it was written in the specification but went missing from the extraction".

```bash
node .claude/scripts/workspacify-tree/run.mjs extract "$ARGUMENTS"
```

- **What the output means**: candidate statistics `harvested` (harvested) / `confirmed` (confirmed) / `review_required` (awaiting AI review) / `unresolved` (unresolved), plus `spec_pulse` (the specification-observation candidates: `candidate_ids` and, for each candidate, `kind` / `chapter_ref` / `observation` / `evidence_refs`). The candidates that must be settled in Step 3 can be read here
- **The AI's work**: check the `canonical_name / aliases / classification / source_refs` of the harvested candidates, identify misfiled and ambiguous candidates, and confirm or reject them through `approvals` in Step 3. The harvester never deletes a candidate (it loses no information)
- **Success condition**: every candidate has source_refs, and the lists of review_required / unresolved are understood

## Step 3: authoring the decision JSON (the AI's design judgement)

**The purpose of this step**: based on the candidates from Step 2 and the content of the specification, the AI decides "how to split this into a workspace, who owns what, and who may depend on whom", and **writes it out as a structured decision JSON the machine can verify**. The machine cannot read the AI's mind, so the judgement must always reach the gate through this file. The design judgement is completed here (no over-mechanisation).

### Iterative procedure to raise the information level

Do not complete the decision in one pass; **while watching the gate results of Step 4, thicken ①→⑦ below in order and raise the information level**. The shortage at each stage is pointed at by the counts in finalAudit (see the table in the next Step).

1. **Settle the candidate classification**: check extract's REVIEW_REQUIRED / unresolved and confirm or reject them through `approvals` (leave no unknown behind)
2. **Package design**: give every package `layer / kind / responsibilities (non-empty) / seed_required / owns`, and make `tree` match the package paths with leaf directories
3. **Complete the owner assignment**: assign a unique owner to **invariant / state machine / error code / required test** as well as object / claim, and aim for `unallocated == 0`. **Every object / claim listed in `owns` must also be registered, one entry each, in `ownership`** (a one-sided declaration is refused by G3, with the number of cases in `final_audit.ownership_disagreement_count`. Previously `owns` masked the omission, and an item with no owner was published with a PASS)
4. **Cover dependencies and contract boundaries completely**: enumerate the permitted edges between all packages with a `reasonCode`, state an `alternative` for every forbidden edge and the dev policy. The `consumer`/`provider` of every `boundaries` entry (the decisions key; published in the manifest as `stage2_handoff.contract_boundaries`) must be inside the catalog. The machine reads the declared graph adversarially and returns observations as `dependency_reviews` (unnecessary serialization / an alternative route for a forbidden edge / a mutually dependent pair that cannot be separated / an over-depended provider). **Record a decision yourself for every candidate** (`keep` / `replace_with_port` / `merge` / `split` / `residual`). `residual` is not an abandonment of judgement but the decision to "leave the published graph as the default and hand the question to the later per-directory grill"
5. **Settle the specification observations**: the machine also reads the specification itself adversarially and returns observations as `structure.spec_pulse` (an extraction gap / an isolated chapter / an oversized chapter / a chapter thin on normative statements / a wobble in naming / a disagreement between a table and its prose / an undefined reference). **Settle every candidate yourself**: either fix the interpretation in `spec_defects` (`candidate_id` / `ai_interpretation` / `chosen_default` / `rationale`), or hand an unsolvable one to the later per-directory grill as a `residual_questions` entry (`candidate_id` / `topic` / `alternatives` (non-empty) / `chosen_default` / `why_unresolved`). If even one candidate is unsettled, G3 stops. Free text must not contain `TODO` / `TBD` / `ask the human` / `waiting for approval` / `human review required` / `confirm with the operator` (they express handing work back to a human, and the machine refuses them). A question you cannot solve is handed to the later grill as a residual
6. **Complete the approval register**: leave the grounds for each judgement in `approvals` (decisionId/rationale/approver) and subject them to machine verification
7. **The AI's final semantic approval**: the AI checks **every** item of the "AI final approval checklist" below and records `{ status: "APPROVED", statement, approver }` in `semantic_review`. If even one item is unmet, do not mark it APPROVED: go back to the gate and redesign (unless the AI's judgement is recorded, the machine never emits COMPLETE)

Create the decision JSON as one file outside the specification's directory (for example in `os.tmpdir()`). The schema is machine-verified against `schemas/workspacify-tree-decisions.schema.json`.

```json
{
  "workspace": [
    { "id": "pkg-0001", "name": "alpha-protocol", "path": "crates/protocol/alpha", "layer": "protocol", "kind": "production-library",
      "responsibilities": ["owns alpha records and their validity"],
      "seed_required": true,
      "owns": { "objects": ["obj-000001", "obj-000003"], "claims": [], "invariants": ["req-000001"], "state_machines": [], "error_codes": [], "required_tests": [] } }
  ],
  "tree": [
    { "name": "crates", "path": "crates", "kind": "dir", "children": [
        { "name": "protocol", "path": "crates/protocol", "kind": "dir", "children": [
            { "name": "alpha", "path": "crates/protocol/alpha", "kind": "dir", "children": [] } ] } ] }
  ],
  "ownership": [ { "objectId": "obj-000001", "packageId": "pkg-0001" } ],
  "dependencies": [],
  "boundaries": [],
  "adapters": { "ports": [], "databasePolicy": { "applicable": false } },
  "approvals": [ { "decisionId": "obj-000003", "rationale": "domain record; confirmed as object", "approver": "ai-session" } ],
  "semantic_review": { "status": "APPROVED", "statement": "alpha protocol owns obj-000001/obj-000003 and invariant req-000001; no DB persistence; not over-split.", "approver": "ai-session" }
}
```

> In an example with several packages, declare every package in `workspace`, `tree` and `ownership`, and line up each edge of `dependencies` one-to-one with `boundaries` (the gate enforces bidirectional coverage).

### The meaning of each field and its rules

| Field | Content |
|---|---|
| `workspace` | The package array. `id/name/path/layer/kind/responsibilities (non-empty)/seed_required` are required. `owns` holds objects / claims / invariants / state_machines / error_codes / required_tests. layer is `foundation/protocol/ports/adapters/core/interfaces/conformance`; kind is `production-library/adapter/binary/test-support/conformance` |
| `ownership` | The unique assignment of a candidate to a package. `objectId` (a candidate id or canonical_name) takes a `packageId`. Each object family has exactly one owner in the protocol layer. For a claim, assign the primary owner in the same way |
| `dependencies` | The dependency edge array. `from/to/reasonCode/reason`. **The key is `reasonCode`** (`reason_code` is a different key the machine does not read, and G4 refuses it as an unknown key). Choose the reasonCode from `REASON_CODES` in `.claude/scripts/workspacify-tree/lib/dependencies.mjs` (26 words such as canonical-value / merkle-proof / payment-settlement) — a value outside the vocabulary is refused by G4. A forbidden edge (`kind: "forbidden"`) requires an `alternative` (port-injection and the like), and **declaring the same pair as both normal and forbidden makes G4 refuse it by name** |
| `tree` | The directory tree. The set of leaf directory paths must match the set of package paths (mandatory for a non-empty workspace) |
| `boundaries` | The declaration of the contract boundaries that correspond one-to-one with the dependency edges. `consumer`/`provider` must be inside the catalog. The gate enforces bidirectional coverage between edges and boundaries (a one-sided declaration does not pass) |
| `adapters` | `ports` (the capability/implementation a port provides) and `databasePolicy` (applicable only when RDBMS persistence is required). domain/protocol never refers to DB-specific types or raw SQL |
| `dependency_reviews` | The answers to the dependency review. `candidate_id` / `decision` (`keep` / `replace_with_port` / `merge` / `split` / `residual`) / `rationale` / `alternatives (non-empty)` are required. `residual` also requires `why_unresolved`. `replace_with_port` is recorded after removing the edge and boundary in question (G3 refuses it while the declaration remains). Decide every candidate yourself. Handing it back to a human is forbidden |
| `approvals` | **The REVIEW approval register**. `decisionId` (the candidate id or canonical_name being approved) / `rationale` / `approver` are required. An approved REVIEW_REQUIRED candidate becomes CONFIRMED and leaves the unresolved set |
| `semantic_review` | **The AI final approval register (non-deterministic)**. `{ status: "APPROVED", statement, approver }`. Set `APPROVED` only when the AI has checked every item of the "AI final approval checklist" below. A missing or unapproved entry makes G2/G3 return REVIEW_REQUIRED and never emit COMPLETE |

### Guidance for the design

- An object has one owner in protocol/domain. Never make foundation/adapter/core/interface the sole owner
- A generic proof package owns only the shared mechanism and never owns domain claim semantics wholesale
- core only orchestrates across domains. adapter only performs external I/O. Neither owns canonical validity
- If there is an over-splitting risk (shared internal state, splitting an intermediate value, a mutual dependency that is unavoidable, reimplementing an invariant, passing a huge snapshot), decide to merge
- When a DB is needed: a common store port for memory/SQLite/PostgreSQL/MySQL plus a SeaORM 2.x policy. Raw SQL is forbidden. Do not turn migration atomicity into domain atomicity

### The AI final approval checklist (non-deterministic; the machine enforces only that APPROVED exists)

**The purpose of this checklist**: what the gate in Step 4 verifies is objective rules only, and semantic correctness (is this owner assignment really sound, is this dependency reason correct) can only be judged by the AI. Before finalize, the AI checks **every** item below and sets `semantic_review.status` to `APPROVED` only when all of them are met. If even one is unmet, do not set `APPROVED`: correct the decision and return to the gate (while it is unapproved, the machine never emits COMPLETE).

- [ ] **Soundness of the owner assignment**: the owner of every object / claim / invariant / state machine / error code / required test is consistent with the package's `responsibilities`, and `unallocated == 0`
- [ ] **Validity of the reasonCode**: the `reasonCode` of every dependency edge exists and matches the reason for the edge. A forbidden edge states an alternative route (port-injection and the like) explicitly
- [ ] **Whether adapter and DB apply**: an adapter performs external I/O only. Set `databasePolicy.applicable` only when RDBMS persistence is required, and confirm that no raw SQL is used and no DB-specific type leaks into domain/protocol
- [ ] **The final decision on over-splitting**: check for signs of shared internal state, splitting an intermediate value, an unavoidable mutual dependency, reimplementing an invariant, or passing a huge snapshot, and merge packages if needed
- [ ] **Consistency of the boundaries inside the catalog**: the `consumer` / `provider` of every declared `boundaries` entry exists in the workspace's package catalog
- [ ] **Soundness of the dependency proof**: `implementation_order` places the provider at an earlier level than the consumer for every edge, and `contract_definition_order` is the order of the contract items (the two are not confused). The `cycle_count` of `dependencies.dag` is 0

Once every item is checked, record it in the decision's `semantic_review`: `{ "status": "APPROVED", "statement": "<a summary of what was checked>", "approver": "<session identifier>" }`. The `statement` summarises the items that were checked, and the `approver` names the session that made the judgement.

## Step 4: the gate loop (G3/G4)

**The purpose of this step**: verify with the machine's real gate pipeline whether the decision (the design) from Step 3 "conforms to the objective rules". If it does not, find the cause of the FAIL/REVIEW_REQUIRED, correct the decision, verify again, and converge on **all gates PASS, unresolved 0 (COMPLETE)**. Nothing may be published unless this passes. Note that a decision which does not record the final semantic judgement (`semantic_review.status === "APPROVED"`) also makes G2/G3 return REVIEW_REQUIRED and never reach COMPLETE.

```bash
node .claude/scripts/workspacify-tree/run.mjs gate "--spec=$ARGUMENTS" "--decisions=<decision.json>"
```

- **What the output means**: the per-gate result (PASS/FAIL/REVIEW_REQUIRED for `G0..G5`) and `finalAudit` (each count). `COMPLETE` (exit 0) means every gate PASS and unresolved 0
- **The table mapping the counts of `finalAudit` to what to fix** (only the values of `finalAudit` that appear on stdout):
  | count | meaning | what to fix (the Step 3 procedure) |
  |---|---|---|
  | `review_required_count` / `unresolved_count` | unapproved candidates | ① confirm/reject through approvals |
  | `spec_defect_count` / `residual_question_count` | specification observations left unsettled | ⑤ spec_defects / residual_questions |
  | `dependency_review_count` / `unresolved_review_count` | dependency reviews left unanswered | ④ dependency_reviews |
  | `missing_responsibilities_count` | responsibilities not written | ② package design |
  | `unallocated_count` | invariant/error/test and the like with no owner | ③ owner assignment |
  | `ownership_disagreement_count` | items declared on only one of `owns` and `ownership` | ③ owner assignment (register in both) |
  | `orphan_object_count` / `orphan_claim_count` / `owner_collision_count` | a missing or duplicated owner | ③ owner assignment |
  | `unknown_dependency_count` / `layer_violation_count` / `cycle_count` | a defect in the dependencies or a cycle | ④ boundary and dependency coverage |
  | `forbidden_dependency_count` | a forbidden edge is declared | ④ the `alternative` of the forbidden edge |
  | `raw_sql_count` / `db_type_leak_count` | a violation of the adapter/DB policy | adapters and databasePolicy |
  | `status` | `semantic_review.status` is not APPROVED / is not recorded | ⑦ the AI's final semantic approval: check every item of the checklist and record APPROVED in `semantic_review` |
- **A cause that is not in the table appears in the gate's reasons**: a path mismatch between tree and catalog, a mismatch between an edge and a contract boundary, or a missing category owner table is listed by the guide as `reasons` in sentences on failure (the per-gate breakdown counts are not printed on stdout), so judge which Step applies from that wording
- **The AI's work**: correct the decision according to the cause of the FAIL (duplicate ownership / a cycle / a forbidden layer / raw SQL / DB type leakage / an invalid schema / a shortage in the table above) and **repeat until exit 0 (COMPLETE)** (the self-repair loop). The level to reach is that all of ①〜⑦ listed in this doc are filled in
- **Regression check**: after correcting the decision, run `run.mjs extract` and the gate again and confirm that nothing contradicts the extraction result

## Step 5: finalize and publish (G5)

**The purpose of this step**: assemble the manifest from the decision that reached COMPLETE and the analysis result, compute the canonical JSON plus its self-hash, and **atomically publish the single canonical authority `WORKSPACIFY-TREE-MANIFEST.json` to the current directory**. Stage two can take this file alone as its argument.

```bash
node .claude/scripts/workspacify-tree/run.mjs finalize "--spec=$ARGUMENTS" "--decisions=<decision.json>"
```

- **Condition to run**: only when every gate is PASS and unresolved is 0. Otherwise it does not reach COMPLETE and exits non-zero
- **Success condition (the arrival check)**: the generated manifest passes stage two's ALLOCATE entry check. The information level means "the workspace tree, the unique owner, the dependency matrix, the DAG and the implementation order are all complete". This final check is run by finalize itself immediately before publication (the same predicate as stage two; there is no need to invoke a separate command)
- **Output destination**: **always the current directory**
- **The publish procedure**: write to a temp file → fsync → read back (schema/self-hash) → rename. On success the temp file is renamed, on failure it is deleted, and a stale one is swept mechanically at the next start
- **Protection of an existing manifest**: if a `WORKSPACIFY-TREE-MANIFEST.json` already exists with a different input hash, it exits **BLOCKED** and never replaces or destroys the existing manifest

## Step 6: report

**The purpose of this step**: print the outcome in the minimal form a human and the next stage can interpret. Print nothing extra.

- On success, print **only the manifest's absolute path / source_hash / manifest_hash / gate summary**
- On failure, print **the id of the failing gate / the reason / the input and design items to fix**

## Error recovery

- On failure, read the `[guide]` on stderr (the cause and what to fix), correct the input or the decision, and run the gate again
- `REVIEW_REQUIRED` / `BLOCKED` never become `COMPLETE`, and an existing manifest is always preserved

## Prohibitions

The prohibitions are already consolidated into "what the gate enforces mechanically" and "the guidance for the design in Step 3". No further prohibition for the AI to decide on its own is set.

## Definition of success

Success is consolidated into the coexistence of **① the AI's final semantic approval** (recording `semantic_review.status === "APPROVED"` in the decision) and **② every machine gate PASS and unresolved review 0**. One side alone — machine gates only, or AI approval only — is not success. The final confirmation is a reload of the generated manifest (schema / required values / self-hash), the presence of the `semantic_review` record, and acceptance by stage two's entry gate (which finalize runs itself immediately before publication).

## Reverse mode (T1 to T6)

**Role**: when a project already contains a substantial implementation, the partition cannot be designed from a specification alone — it has to be grounded in the tree that exists. Reverse mode preserves the physical layout exactly and holds the logical architecture as a separate layer, so that the existing technical debt is **recorded** rather than frozen into the canonical record as if it had been designed.

**Invocation**: `run.mjs reverse --spec=<origin-spec.md> --decisions=<path> --root=<project directory>`, with optional `--graph=<graph.json>`, `--measured=<dependency measurement>`, `--sidecars=<dir>`, `--delta=<path>` and `--out=<dir>`.

The forward gates G0 to G5 are unchanged and still have to reach `COMPLETE`. Reverse mode then judges six gates over the measured tree:

| Gate | FAIL condition | PASS condition |
|---|---|---|
| **T1 structure parity** | the manifest package path set and the measured directory set differ in either direction | they agree exactly; every difference is named as extra or missing |
| **T2 zero behavioural loss** | a hand-written source file belongs to no declared package path | every hand-written source file is owned |
| **T3 grounding** | a node does not resolve to a file that exists | every node resolves, and an unresolvable node is named by its identifier |
| **T4 measured implementation order** | the order the measured DAG proves differs from the manifest's `implementation_order`, or that projection contains a cycle | the two orders agree |
| **T5 logical/physical separation** | a mismatch that `ARCHITECTURE-DELTA.json` does not record, or the record is missing entirely | every mismatch is recorded |
| **T6 reverse provenance** | the run is in reverse mode and `reverse_provenance` is absent, or its sidecar bundle hash does not resolve | it is present and resolves. In forward mode the field is deliberately absent and T6 does not fire |

**What T5 means, and what it does not**: T5 passes on the **presence of a record**, not on the absence of a difference. A run with zero mismatches still has to write `ARCHITECTURE-DELTA.json`, because the record is what says the layout was examined rather than assumed. Agreement between the physical layout and the logical model is not evidence that either is correct.

**The one field reverse mode adds** is `reverse_provenance`, holding the sidecar bundle hash and a count summary. The meaning of `COMPLETE` is unchanged — it still means only that the input packet and the artefacts met the schema, the gates and the publication discipline — and the normalisation behind `manifest_hash` is not changed. Forward-mode manifests are byte-identical.

**Causes of a reverse FAIL, by gate**: a path present on disk with no package (T1, "extra"), a declared package with no directory (T1, "missing"), a source file no package path contains (T2), a node whose file does not exist (T3), an order the measurement contradicts or a cycle (T4), a mismatch the record omits (T5), a provenance that does not resolve (T6).

**Prohibitions**:

- Never rename a top-level entry in reverse mode: the existing tree is preserved. The writes are the manifest and `ARCHITECTURE-DELTA.json` only
- Never add a field to `*-GRAPH.json` or `*-Dirs-Tree.json`; reverse provenance lives on the manifest alone
- Never treat the measured DAG as the logical architecture. T5 exists precisely because they are different things
- Never record a mismatch and then treat its record as a repair. The record is the artefact, not the fix
