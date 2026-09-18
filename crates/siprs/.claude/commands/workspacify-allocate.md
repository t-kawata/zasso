---
description: Generate the real directory tree and one RFC-SEED.md per package from WORKSPACIFY-TREE-MANIFEST.json (stage two)
argument-hint: <path-to-WORKSPACIFY-TREE-MANIFEST.json>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /workspacify-allocate

Role: stage-two allocator.
- In: one proven tree-manifest; workspaceRoot = dirname(manifestPath).
- Out: real tree, exactly one `RFC-SEED.md` per package, one `WORKSPACIFY-ALLOCATE-MANIFEST.json`.
- Does not start a human grill, canonical-RFC flow, graph flow, or implementation loop.

Upstream (role, not name): workspace decomposition publisher.
- produces: `WORKSPACIFY-TREE-MANIFEST.json`; proven dependency order, boundaries/mandatory clauses, segments/material, package responsibilities, contract-item order.
- guarantees: schema-valid; `artifact_kind == "workspacify-tree-manifest"`; `status == "COMPLETE"`; `final_audit.status == "PASS"`; `stage2_handoff.eligible == true`; self-hash and co-located source hash valid.
- invalid/contradictory/missing material → stop; correct and republish upstream; do not recompute, reinterpret, invent, reorder, or patch workspace design here.

Downstream (role, not name): per-package RFC canonicalizer and implementation workflow.
- consumes: published seed + allocate manifest.
- expects: exact seed format, verified allocation/contracts/order, source traceability.

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
- arg: `<path-to-WORKSPACIFY-TREE-MANIFEST.json>`; first, required, only argument.
- `workspaceRoot = dirname(arg)`; root is a package (`.`); do not derive root from cwd, env, branch, or another path.
- arg must be: regular UTF-8 non-empty JSON file; tree-manifest schema-valid; required kind/status/audit/handoff fields valid; self-hash valid; co-located recorded specification re-hashes to `input.source_hash`.
- no other arg/dialogue/env/hook/external fetch required.
- free-form input beyond arg → additional information.
- decisions input: `workspaceRoot/workspacify/allocate/DECISIONS.json`; derived only; no arg/env/pre-existing file may relocate it.

## The canonical output and its constraints

Artifacts:
- staging: scratch/intermediate files; not records; finalizer deletes them after reload verification.
- published: directory tree; exactly one `RFC-SEED.md` per package; one `WORKSPACIFY-ALLOCATE-MANIFEST.json`; all in `workspaceRoot`.
- allocate manifest: sole machine final authority; proof record, not goal.

Invariants:
- fresh workspace only: existing target file/symlink/non-empty directory → `BLOCKED`; never merge, overwrite, or delete existing content.
- each seed: 14 headings; §1/§2/§3/§14 machine-injected; AI writes §4–§13 only.
- §1 has source-spec, stage-1-manifest, stage-2-manifest references; stage-2 reference is canonical path only, never its hash.
- success residue: only published kinds plus pre-existing files.

## The hand-off contract from stage one (the assumptions on the receiving side)

Receive only upstream-proven dependency order, boundary mandatory clauses (preconditions/postconditions/invariants), segments/material, package responsibilities, contract-item order.
- never recompute/reinterpret/invent order or clause.
- rejection at entry: suspect swapped/tampered input, not output.
- failure: follow entry-gate guide: problem, significance, fix.

## Scripts used

Root: `.claude/scripts/workspacify-allocate/`.

| Script | Contract |
|---|---|
| `run.mjs validate <manifest>` | G0/G1 input lock: schema, self-hash, COMPLETE, final audit, handoff, co-located spec re-hash; exit 0 = PASS |
| `run.mjs plan <manifest>` | G2: ancestor/leaf directory plan, leaf↔package bijection, path safety, existing-output policy |
| `run.mjs packet <manifest> [--package=<id>]` | JSON authoring packet: owned inventory, source excerpts, boundary context |
| `run.mjs gate <manifest>` | G3–G5/order: decisions/authoring, G3.7, render/local checks/parity/transfer, G4 bilateral contracts, G5 WIG/order, APPROVED; exit 0 only = COMPLETE |
| `run.mjs finalize <manifest>` | G6: re-run gates; staged build; atomic publish; reload verification; cleanup |
| `run.mjs reverse` | reverse mode: A1–A5/A6; exact existing tree; one extra path BLOCKED; no top-level rename; failure publishes nothing |

## Statuses and gates

Statuses: `PASS` | `FAIL` | `REVIEW_REQUIRED` | `BLOCKED` | `COMPLETE`.
- `REVIEW_REQUIRED` != success; unresolved review → never `COMPLETE`.
- `BLOCKED`: missing/inconsistent input, collision, or existing output.

Gates:
- G0 input-lock: manifest/schema/hash/status/handoff/spec-hash.
- G1 transfer basis: upstream material accepted.
- G2 plan: directory/package bijection; safe paths; fresh workspace.
- G3 seed render/local checks: authoring surface, references, contracts, coverage/parity.
- G3.7 self-grill: five focuses, convergence, residual shape/carry, forbidden vocabulary.
- G4 bilateral contracts.
- G5 WIG and implementation order.
- G6 staged publish, reload, cleanup.
- Rule: parent not PASS ⇒ child never PASS.
- `REVIEW_REQUIRED` | `BLOCKED` ⇒ never `COMPLETE`.

## The boundary between design judgement and mechanisation

Machine (deterministic): entry/spec hash; path safety; transfer basis; packet; §1/§2 injection; heading/index/contract parsing; local checks; parity; zero-transfer-loss; bilateral contracts; WIG; implementation-order derivation/equivalence; allocate-manifest/self-hash; reload verification; cleanup.

AI (semantic judgement): §4–§13; contract clauses/boundary wording; self-grill/convergence; grill questions; `semantic_review.status === "APPROVED"`.

Machine verifies structure, transfer fidelity, coupling completeness; never prose quality. WIG is staging only; published manifest records canonical summary/hash.

## Step 1: validate (G0/G1)

Purpose: lock manifest + co-located spec; invalid lock invalidates later source trace.

```bash
node .claude/scripts/workspacify-allocate/run.mjs validate "$ARGUMENTS"
```

pass: exit 0; `{status:"PASS", workspaceRoot, sourceHash, manifestHash, gateSummary}`.
fail: stop; do not enter later Steps.

## Step 2: the transfer basis and the dependency proof (G1.5/G2)

Purpose: accept, never decide: segment→owner coverage; inventory→package allocation; edge→boundary→mandatory-clause table; implementation-order outline; path/fresh-workspace preliminary check.

```bash
node .claude/scripts/workspacify-allocate/run.mjs plan "$ARGUMENTS"
```

pass: exit 0; `{status:"PASS", plannedDirectoryCount, relativeDirs}`.
judge: inspect coverage/allocation; missed source, over-split, unnatural boundary → return upstream; never alter workspace design here.
fail: identify tree↔package mismatch, unsafe path, symlink, existing file/symlink/non-empty directory; repair required input; do not proceed until PASS.

## Step 3: authoring — writing the packet and the decisions (the AI's semantic judgement)

Purpose: write each `seed_required: true` semantic body as machine-verifiable decisions JSON; semantic seed body reaches the gate only through decisions.

### 3-1: obtaining the authoring packet

```bash
node .claude/scripts/workspacify-allocate/run.mjs packet "$ARGUMENTS"
# only a specific package: --package=pkg-0001
```

Packet:
- package: id/name/path/layer/kind/seed_required/responsibilities.
- owned items: category/inventory_ref/canonical_name/source_refs(segment id)/source excerpt; unresolved items explicit.
- `contract_context`: counterpart + responsibilities, `required_clauses`, direction, counterpart segment excerpts.
- `forbidden_edges`; conformance/test obligations.

### 3-2: drafting order — draft the contracts first, the prose after

Order:
1. From `contract_context`, draft every boundary clause group; all `required_clauses`; settle `contractEdges`.
2. Compare counterpart contract; eliminate one-sided contracts/clause mismatches before prose.
3. Write §4–§13; prose refers to §2 contract ids; never contradicts them.

### 3-3: the self-grill loop (the AI reviews itself adversarially)

auto; never ask. Human grill is post-publication, per directory.

Self-grill:
- every pass, all focuses: `implementer`, `counterpart`, `test`, `grill`, `adversarial`.
- implementer: implementation possible against contract.
- counterpart: counterpart seed meshes.
- test: §11 can verify contract.
- grill: question suitable for later human grill.
- adversarial: break coupling: over-coupling, missing clause, implicit assumption.
- convergence: first pass with 0 new findings; final `self_grill.rounds` pass has zero findings.
- inapplicable focus → `status: "not_applicable"` + `reason`; any boundary → adversarial `ran`.
- unresolved only → typed residual: `topic`, non-empty `alternatives`, `chosen_default`, `why_unresolved`, `grill_question`, `package_id`, `origin`.
- machine appends residual `grill_question` verbatim to target seed §12; AI neither copies nor retypes it.
- stage-1 residuals: carry every `stage2_handoff.residual_questions` candidate verbatim: valid `origin` (`stage1_pulse` | `stage1_dependency_review`), `origin_candidate_id`, exact `topic`; dropped candidate → G3.7 FAIL naming id.
- forbidden anywhere in payload: `TODO`, `TBD`, `ask the human`, `waiting for approval`, `human review required`, `confirm with the operator`.
- unsolved → residual + `grill_question`; never leave unattended.

### 3-4: authoring the decisions JSON

Write: `workspaceRoot/workspacify/allocate/DECISIONS.json`.
- schema: `schemas/workspacify-allocate-decisions.schema.json`.
- one `seeds[]` entry per `seed_required: true` package.
- `aiSections`: keys `"4"`…`"13"`, all non-empty; `not_applicable — <reason>` allowed; §1/§2/§3/§14 keys forbidden.
- `contractEdges`: declared boundary only; `contract_id`, `direction`, `connection_kind`, `owners`, closed-vocabulary `clauses`, `source_refs`; five core clauses mandatory; unknown clause key → refuse, name contract/key, never silently drop.
- `semantic_review`: status `APPROVED` | `REVIEW_REQUIRED`; statement; approver. Finalize requires `APPROVED`.

Before `APPROVED`, judge all:
- Allocation Index equals manifest owner assignment.
- source MUST/MUST NOT/prohibitions/formulas/schema/errors not weakened.
- no re-owning another package; use dependency_context/consumer_obligation.
- self-grill converged; unresolved only as typed residuals + §12 grill questions.
- no over-splitting/unnatural boundary; if found, return upstream.

Artifacts:
- decisions: staging, repairable after refusal; finalizer deletes it and empty holder directories only after published-set reload verification.
- published allocate manifest: record of approved/applied semantics.

## Step 4: the gate loop (G3/G4/G5/order)

```bash
node .claude/scripts/workspacify-allocate/run.mjs gate "$ARGUMENTS"
```

pass: exit 0; `{status:"COMPLETE", gateSummary}`.

Checks, all required:
- decisions schema; authoring surface: §4–§13 present only.
- G3.7: five-focus coverage; final-pass convergence; residual type; stage-1 residual carry; forbidden vocabulary absent.
- render each seed; exact 14 ordered headings; non-empty typed bodies; Allocation Index; three agreeing references; complete contracts; extant segment ids.
- seed↔manifest parity; zero transfer loss: every non-empty-owned-inventory segment referenced; empty-owned segment recorded non-material.
- bilateral contracts (G4); WIG (G5); implementation order == stage-1 proof.
- each residual `grill_question` verbatim in target §12.
- `semantic_review.status === "APPROVED"`.

Heal-loop gate:
- fail → judge: read stderr `[guide]`; fix decisions for schema/empty body/parity/uncovered segment/one-sided or mismatched contract/WIG/order/G3.7/APPROVED cause; re-run gate.
- complete → Step 5.

## Step 5: building the canonical artefact and publishing it atomically (G6)

```bash
node .claude/scripts/workspacify-allocate/run.mjs finalize "$ARGUMENTS"
```

precondition: all gates PASS; `semantic_review.status === "APPROVED"`; else non-zero, never COMPLETE.

Publish:
1. build tree + all seeds + allocate manifest in staging.
2. verify staged set: planned directories, all seeds, nothing beyond manifest.
3. atomic rename per top-level entry; rollback on failure.
4. reload verification.
5. mechanically delete staging.

Reload verification:
- rescan tree; parse every seed; extract contracts; rebuild WIG and compare hash; rederive order; reprove coverage; verify manifest self-hash.
- divergence → fail naming artifact + package.

success out:
`{published:true, workspaceRoot, allocateManifestPath, allocateManifestHash, inputManifestHash, directoryCount, packageCount, seedCount, contractCount, waveCount, gateSummary, residue}`.

Existing target file/symlink/non-empty directory → `BLOCKED`; never replace/destroy tree.

## Step 6: report

success: print only workspace-root absolute path, input-manifest hash, directory count, package count, seed count, gate summary.
fail: print only failing gate id, reason, repair input (`manifest` | `decisions` | co-located spec).

## Error recovery

fail → read stderr `[guide]`; repair input/decisions; re-run required gate.
`REVIEW_REQUIRED` | `BLOCKED` → never `COMPLETE`; preserve existing workspace.

## Appendix A: the required headings of RFC-SEED.md and the Allocation Index grammar

Exactly one seed/package. Exact ordered headings:

```text
# RFC Seed: <package-name>
## 1. Identity and Position in the Whole System
## 2. Coupling Contracts (I/O Boundary)
## 3. Source Coverage and Allocation Index
## 4. In-Scope Objects, Claims, Predicates, State and Invariants
## 5. Incoming Dependencies and Consumer Obligations
## 6. Outgoing Provider Obligations
## 7. State Ownership and State-Transition Material
## 8. Side-Effect and External-I/O Boundaries
## 9. Canonicalization, Signatures and Proof Responsibilities
## 10. Failure, Rejection, Recovery and Finality Material
## 11. Required Unit, Integration, Exception and Malfeasance Test Material
## 12. Grill Questions and Explicitly Unresolved Design Choices
## 13. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals
## 14. Source Traceability Index
```

- §1: machine-injected JSON: three reference paths, implementation order, contract ids, covered segments.
- §2: machine-injected contract JSON: all boundary clause groups.
- §3: machine-injected Allocation Index + coverage.
- §14: machine-injected segment ids.
- §5–§11 refer to §2 `contract_id`; never contradict §2.
- every body non-empty or `not_applicable — <reason>`; machine never invents AI semantics.

Allocation Index grammar:

```markdown
### Allocation Index

| Category | Inventory ID | Canonical Name |
| --- | --- | --- |
| object | obj-000001 | Alpha Record |
| invariant | inv-1 | alpha-invariant |
```

`lib/seed-parse.mjs` extracts it; `lib/seed-parity.mjs` proves bijection against manifest `workspace.ownership.entries`: 0 missing, duplicated, unknown, leaked. Include only this package’s owned items; other ownership may appear only as dependency_context/consumer_obligation prose.

## Appendix B: the fields of the decisions input

| Field | Contract |
|---|---|
| `seeds[].packageId` | catalog package id; required for every `seed_required: true` package |
| `seeds[].aiSections` | §4–§13 semantic bodies only; all ten required/non-empty; §1/§2/§3/§14 keys refused |
| `seeds[].contractEdges` | every declared boundary; closed contract vocabulary; mandatory core clauses; declared id only; scope-valid source segment ids |
| `semantic_review.status` | `APPROVED` | `REVIEW_REQUIRED`; only `APPROVED` finalizes |
| `semantic_review.statement` | checked-subject summary |
| `semantic_review.approver` | judging session identifier |

## Appendix C: examples of run.mjs output

```text
$ node .claude/scripts/workspacify-allocate/run.mjs validate ./WORKSPACIFY-TREE-MANIFEST.json
{"status":"PASS","workspaceRoot":"/work/specs","sourceHash":"ab12…","manifestHash":"cd34…","gateSummary":"G0:PASS G1:PASS"}

$ node .claude/scripts/workspacify-allocate/run.mjs gate ./WORKSPACIFY-TREE-MANIFEST.json
{"status":"COMPLETE","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS semantic:APPROVED"}

$ node .claude/scripts/workspacify-allocate/run.mjs finalize ./WORKSPACIFY-TREE-MANIFEST.json
{"published":true,"workspaceRoot":"/work/specs","allocateManifestPath":"/work/specs/WORKSPACIFY-ALLOCATE-MANIFEST.json","allocateManifestHash":"ef56…","residue":["WORKSPACIFY-ALLOCATE-MANIFEST.json","WORKSPACIFY-TREE-MANIFEST.json","crates","spec.md"],"inputManifestHash":"cd34…","directoryCount":7,"packageCount":3,"seedCount":3,"contractCount":2,"waveCount":2,"segmentCoverage":"5/5","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS G6:PASS semantic:APPROVED"}
```

failure stdout: `{status:"FAIL", gateId, reason}`; stderr: human-readable next-action guide.
success: workspace root, allocate-manifest path/hash, input-manifest hash, directory/package/seed/contract counts, wave count, segment coverage, gate summary, residue.

## Appendix D: the AI final semantic approval checklist (detailed)

`APPROVED` only if all pass; otherwise repair decisions and return gate.
- owner assignment sound: no unallocated, duplicated, leaked item; inspect §1/§2/§3 as well as machine parity.
- source norms preserved: MUST/MUST NOT/prohibitions/formulas/schema/errors/tests not unjustifiably weakened.
- no semantic re-ownership; dependency_context/consumer_obligation only.
- coupling complete: every boundary §2; core clauses incl. preconditions/postconditions/invariants non-empty; semantic counterpart meaning correct.
- forbidden edges/non-interference/non-goals reflected in §13; no coupling contradicts §2.
- prose respects §1 provider-first implementation order.
- unclear decision → residual + grill question in §12; no TODO/TBD.
- shared internal state, split intermediate value, unavoidable mutual dependency, invariant reimplementation → decide return upstream.

## Appendix F: the structure of WORKSPACIFY-ALLOCATE-MANIFEST.json

Published sole machine authority:

| Field | Contract |
|---|---|
| `artifact_kind` / `schema_version` / `status` | `workspacify-allocate-manifest` / `1.0.0` / `COMPLETE` |
| `input_tree_manifest` | proven stage-1 manifest + source spec path/hash |
| `seed_index[]` | every seed: workspace-relative path + sha256 |
| `source_coverage` | totals/covered/material/non-material/uncovered; `uncovered` always empty |
| `contract_registry[]` | verified boundary contracts and clauses/source refs |
| `wig` | summary/counts/hash; `violations` always empty |
| `implementation_order` | provider-first `{serial, levels}`; equals stage-1 proof |
| `allocation` | package/seed/parsed-package counts |
| `gates[]` | G4/G5 results |
| `self_grill` | passes/converged/focuses/rounds/finding counts/residual count |
| `handoff_summary` | unresolved, grill questions, risky boundaries |
| `semantic_review` | status/approver |
| `completion_decision` | `COMPLETE` |
| `integrity` | canonicalization, hash algorithm, self-hash, reload validation |

Seeds reference it by canonical path only; manifest holds seed hashes; no cyclic embedded hash.

## Appendix E: the relationship to the stages before and after

Flow:
- upstream decomposition publisher: specification → proven tree manifest.
- this allocator: proven tree manifest → real tree + one seed/package + allocate manifest.
- downstream per-package canonicalization/graph/boundary/ticket/implementation workflows consume each seed.

This command never starts downstream flows. It settles machine-readable coupling contracts and verifies bilateral symmetry, WIG, implementation order. WIG is not published; allocate manifest retains summary/hash only.

## Prohibitions

- no published intermediate WIG, contracts, or separate working temporary file.
- no second machine authority; allocate manifest only.
- no AI-authored §1/§2; decisions inclusion refused.
- no Claude Code/Git/shell hooks.
- no existing-content merge/overwrite/delete.
- no workspace-root inference from cwd/env/branch.
- no machine prose-quality grading.

## Definition of success

All required:
- `semantic_review.status === "APPROVED"`.
- every machine gate PASS; zero transfer loss; bilateral contracts; 0 WIG violations; order == stage-1 proof; reload PASS.
- final rescan; every seed re-parsed/contracts re-extracted; WIG rebuilt; order rederived; manifest self-hash valid; residue only published kinds + pre-existing files.

---

## Reverse mode (A1 to A6)

Mode: forward | reverse.
- detect once: `reverse-decisions-mode` → reverse; absent/empty/unrecognised → forward; no re-detect.
- forward: `finalize` from manifest arg.
- reverse: `run.mjs reverse`; subject = current directory/workspace root.

Invariants:
- forward/reverse retain G0–G5 proof obligations and converge on required published seed/allocate-manifest schema.
- reverse preserves existing tree: no top-level rename; failed gate publishes nothing.

Reverse input:
- stage-1 manifest: `workspaceRoot/WORKSPACIFY-TREE-MANIFEST.json`; no caller path.
- refuse, never ignore: `--root`; decisions argument.
- decisions: `workspaceRoot/workspacify/allocate/DECISIONS.json`.
- no dialogue/env/hook/external fetch.

Reverse safety inversion:
- forward: fresh-only, atomic top-level rename.
- reverse: every planned path exists; every existing path planned; any single extra path → `BLOCKED`, name it.

| Gate | fail | pass |
|---|---|---|
| A1 safety inversion | plan/tree directory sets differ | same set; otherwise BLOCKED naming all extra/missing paths |
| A2 additions only | write outside allow-list or renamed top-level entry | writes allow-listed; top-level directories unchanged |
| A3 packet extension | consumer-declaring package lacks incoming-dependency excerpt | every owed packet excerpt present |
| A4 section 1 index | no reverse index, or heading count mismatches declared format section list | index in §1; matching count |
| A5 seed parity | Allocation Index/ownership bijection broken | 0 missing/duplicated/leaked |

A6 folds into A3: provider-packet obligation supplies implementations of packages using this package; one verdict.
- declared no-consumers: record, never fail; A3 fails dropped owed material only.
- allow-list: `RFC-SEED.md`, `WORKSPACIFY-ALLOCATE-MANIFEST.json`; one definition/check.
- reverse names no rename primitive; never staged publisher; cannot rename/destroy tree.
- reverse provenance: read manifest `reverse_provenance` sidecar hash/count; populate §1 reverse index/sidecar reference; absent → A4 fail; never invent.
- causes: extra/missing directory A1; non-allow-listed write/renamed top-level A2; missing owed excerpt A3; missing/mismatched reverse index A4; broken Allocation Index A5.
- heading contract: exact match against declared `SEED_FORMATS` section list; absent/unknown version parsed against current read format. Older pattern-2/3 format gap → report, not refuse; publish reconciliation in `SEED-COMPATIBILITY.md` beside report. Never accept fifteenth heading/transposed title. Reverse index extends §1; never §15. Forward cannot observe reverse-only behavior.
