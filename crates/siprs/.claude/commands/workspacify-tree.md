---
description: Analyse a long Markdown specification and publish WORKSPACIFY-TREE-MANIFEST.json as the single canonical authority (stage one)
argument-hint: <path-to-specification.md>
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# /workspacify-tree

Role: given one Markdown specification, run structural analysis, candidate harvest, workspace design, completeness gates; publish the stage-two-only input `WORKSPACIFY-TREE-MANIFEST.json`. Do not implement specification. AI/running session makes design judgement; machine harvests, verifies, publishes.

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Arguments

In: first/required/only argument `<path-to-specification.md>`.

- Must be readable regular UTF-8 non-empty file with ≥1 ATX heading
- No extra argument, dialogue, environment variable, hook, external fetch
- Free-form input besides argument = additional information

## The canonical output and its constraints

Success publishes exactly one canonical artifact: `WORKSPACIFY-TREE-MANIFEST.json`, current working directory.

## Scripts used

Base: `.claude/scripts/workspacify-tree/`.

| Script | Contract |
|---|---|
| `run.mjs parse <spec>` | G0/G1: input lock, normalization, hash, headings, segments, exact reconstruction; exit PASS/FAIL |
| `run.mjs extract <spec>` | G2: independent object/claim/invariant/state-machine/error-code/required-test harvest with source traceability; prints statistics |
| `run.mjs gate --spec=..` | real per-gate pipeline over decision input; only COMPLETE exits 0 |
| `run.mjs finalize --spec=..` | apply ownership → all gates → manifest → self-hash → current-directory publish |
| `run.mjs reverse` | reverse: G0–G5 then T1–T6 over measured project tree; reads `ARCHITECTURE-DELTA.json`; publishes `reverse_provenance`; only COMPLETE exits 0; failing gate publishes nothing |

## Statuses and gates

Statuses: `PASS|FAIL|REVIEW_REQUIRED|BLOCKED|COMPLETE`.

- `REVIEW_REQUIRED` ≠ success; unresolved review prevents COMPLETE
- `BLOCKED`: existing manifest input hash differs; never overwrite

Gates: G0 input lock → G1 headings/segments/reconstruction → G2 requirement inventory → G3 catalog/ownership/over-splitting/mandatory responsibilities → G4 DAG/layers/cycles/implementation-order proof → G5 schema/self-hash artifact completeness. Rule: parent not PASS ⇒ child never PASS.

## The boundary between design judgement and mechanisation

Machine: harvesting, format, ownership uniqueness, DAG/cycles, forbidden layers, raw SQL, DB-type leakage, self-hash. AI: workspace tree, ownership, final over-splitting decision, adapter/DB applicability, reasonCode, forbidden-edge alternative, REVIEW_REQUIRED approval. Boundary-review finds risk candidates; extractor harvests; verifier checks constraints; neither decides semantics.

## The hand-off contract to stage two (ALLOCATE)

Output must let stage two verify coupling mechanically.

- Handoff proof: provider implementation order; boundary clause groups (pre/post/invariants); segments/material; package responsibilities; contract-item order; all deterministically recomputable from same spec/decisions
- No unverified manifest/order/clause/segment-reference publish
- Double gate: `finalize` calls stage-two entry gate immediately before publish; same predicate; no one-sided bypass
- Gate fail output states problem, significance, correction

## Step 1: parse (G0/G1)

Purpose: lock spec; readable/UTF-8/non-empty validation; normalize unified newlines preserving trailing newline; SHA-256; heading tree; `##` segments; exact recombination proof.

```bash
node .claude/scripts/workspacify-tree/run.mjs parse "$ARGUMENTS"
```

Out: `source_hash` = normalized whole-input immutable fingerprint; `reconstruction` = segment recombination verification. Pass: reconstruction PASS and hash printed. Fail: correct nonexistent/directory/empty/non-UTF8/reconstruction-mismatch input; rerun.

## Step 2: extract (G2)

Purpose: omission-free implementation-target candidates with source traceability. Deterministic patterns: table object column, inline code, claim blocks, normative phrases. Keep invariant/error code/required test independent from terms.

```bash
node .claude/scripts/workspacify-tree/run.mjs extract "$ARGUMENTS"
```

Out: `harvested|confirmed|review_required|unresolved` statistics; `spec_pulse` candidates (`candidate_ids`, each `kind|chapter_ref|observation|evidence_refs`). AI: check canonical_name/aliases/classification/source_refs; settle misfiled/ambiguous candidates through Step-3 approvals. Harvester never deletes candidates. Pass: every candidate has source_refs; review_required/unresolved understood.

## Step 3: authoring the decision JSON (the AI's design judgement)

Purpose: decide workspace split, owners, permitted dependencies; encode machine-verifiable decision. Do not one-pass: run Step-4 gate; thicken ①→⑦ in order until COMPLETE.

1. Candidate classification: settle every `review_required|unresolved` via approvals; no unknown
2. Package design: every package has `layer|kind|responsibilities` (non-empty)|`seed_required|owns`; tree paths match package leaf dirs
3. Ownership: unique owner for object/claim/invariant/state-machine/error-code/required-test; `unallocated==0`; every `owns` object/claim has exactly one matching `ownership` entry; one-sided declaration is G3 refusal (`ownership_disagreement_count`)
4. Dependencies/boundaries: enumerate permitted package edges with `reasonCode`; every forbidden edge has `alternative` and dev policy; every boundary consumer/provider in catalog; decide every adversarial dependency review: `keep|replace_with_port|merge|split|residual`; residual = published-graph default plus later per-directory grill, never abandoned judgement
5. Specification observations: settle every `structure.spec_pulse` candidate as `spec_defects` (`candidate_id|ai_interpretation|chosen_default|rationale`) or `residual_questions` (`candidate_id|topic|alternatives` non-empty|`chosen_default|why_unresolved`). No unsettled candidate. Free text forbids `TODO|TBD|ask the human|waiting for approval|human review required|confirm with the operator`
6. Approval register: every judgement grounds in `approvals` (`decisionId|rationale|approver`)
7. Final semantic approval: check every checklist item; only then record `{status:"APPROVED",statement,approver}`; otherwise redesign

Write staging decision only at derived fixed `workspacify/tree/DECISIONS.json` beneath workspace root; no argument/env/pre-existing file relocates it. Validate `schemas/workspacify-tree-decisions.schema.json`. It is staging, not record: success finalize sweeps it and empty containing dirs; refusal preserves it for repair.

```json
{"workspace":[{"id":"pkg-0001","name":"alpha-protocol","path":"crates/protocol/alpha","layer":"protocol","kind":"production-library","responsibilities":["owns alpha records and validity"],"seed_required":true,"owns":{"objects":["obj-000001"],"claims":[],"invariants":["req-000001"],"state_machines":[],"error_codes":[],"required_tests":[]}}],"tree":[{"name":"crates","path":"crates","kind":"dir","children":[]}],"ownership":[{"objectId":"obj-000001","packageId":"pkg-0001"}],"dependencies":[],"boundaries":[],"adapters":{"ports":[],"databasePolicy":{"applicable":false}},"approvals":[{"decisionId":"obj-000001","rationale":"domain record; confirmed object","approver":"ai-session"}],"semantic_review":{"status":"APPROVED","statement":"ownership, DB policy, boundaries, order, over-splitting checked","approver":"ai-session"}}
```

For multi-package input: declare all packages in `workspace`, `tree`, `ownership`; align each dependency one-to-one with boundary.

| Field | Rule |
|---|---|
| `workspace` | required `id/name/path/layer/kind/responsibilities/seed_required`; owns six candidate categories; layer `foundation|protocol|ports|adapters|core|interfaces|conformance`; kind `production-library|adapter|binary|test-support|conformance` |
| `ownership` | exactly one candidate/canonical-name owner; object family owner in protocol; claim primary owner likewise |
| `dependencies` | `from/to/reasonCode/reason`; exact camel key `reasonCode`, never `reason_code`; value from `REASON_CODES` vocabulary; forbidden edge requires `alternative`; same pair normal+forbidden refuses |
| `tree` | leaf-path set equals package-path set for non-empty workspace |
| `boundaries` | edge-corresponding contract boundary; catalog consumer/provider; bidirectional edge/boundary coverage |
| `adapters` | ports capability/implementation; databasePolicy only when RDBMS required; domain/protocol no DB types/raw SQL |
| `dependency_reviews` | required candidate_id/decision/rationale/non-empty alternatives; residual requires why_unresolved; `replace_with_port` only after removing its edge and boundary |
| `approvals` | required decisionId/rationale/approver; approved REVIEW_REQUIRED becomes CONFIRMED |
| `semantic_review` | exact APPROVED/statement/approver; missing/unapproved → G2/G3 REVIEW_REQUIRED, never COMPLETE |

Guidance: object owner is protocol/domain, never sole foundation/adapter/core/interface; generic proof owns shared mechanism, never all domain semantics; core orchestrates; adapter does external I/O; neither canonical validity. Over-splitting signs—shared state, split intermediate value, unavoidable mutual dependency, invariant reimplementation, huge snapshot—→ merge. DB: shared store port for memory/SQLite/PostgreSQL/MySQL; SeaORM 2.x; no raw SQL; migration atomicity ≠ domain atomicity.

### The AI final approval checklist (non-deterministic; the machine enforces only that APPROVED exists)

Before APPROVED, check all:
- [ ] Every candidate-category owner matches package responsibilities; unallocated 0
- [ ] Every edge reasonCode exists and matches reason; forbidden edge has explicit alternative
- [ ] Adapter external-I/O only; DB applicable iff RDBMS required; no raw SQL or DB-type leakage into domain/protocol
- [ ] Over-splitting signs checked; merge if needed
- [ ] Every boundary consumer/provider exists in package catalog
- [ ] Provider precedes consumer in `implementation_order`; `contract_definition_order` is contract-item order, not implementation order; DAG `cycle_count==0`

Record APPROVED only after all; statement summarizes checked items; approver names judging session.

## Step 4: the gate loop (G3/G4)

```bash
node .claude/scripts/workspacify-tree/run.mjs gate "--spec=$ARGUMENTS"
```

Out: per-gate status and stdout `finalAudit`; COMPLETE/exit 0 iff all gates PASS and unresolved 0. Semantic-review absent/not APPROVED → G2/G3 REVIEW_REQUIRED.

| finalAudit | Return to Step-3 item |
|---|---|
| `review_required_count|unresolved_count` | ① approvals |
| `spec_defect_count|residual_question_count` | ⑤ spec defects/residual questions |
| `dependency_review_count|unresolved_review_count` | ④ dependency reviews |
| `missing_responsibilities_count` | ② package design |
| `unallocated_count` | ③ ownership |
| `ownership_disagreement_count` | ③ register both owns and ownership |
| `orphan_object_count|orphan_claim_count|owner_collision_count` | ③ ownership |
| `unknown_dependency_count|layer_violation_count|cycle_count` | ④ edges/boundaries |
| `forbidden_dependency_count` | ④ forbidden-edge alternative |
| `raw_sql_count|db_type_leak_count` | adapters/databasePolicy |
| `status` semantic review | ⑦ full AI checklist and APPROVED |

Unlisted causes appear in `reasons`: tree/catalog path mismatch, edge/boundary mismatch, missing category-owner table; choose correction from wording. Heal-loop: fix exact cause; rerun gate until COMPLETE. After correction rerun `extract` and gate; confirm no extraction contradiction.

## Step 5: finalize and publish (G5)

```bash
node .claude/scripts/workspacify-tree/run.mjs finalize "--spec=$ARGUMENTS"
```

Run only at all-PASS/unresolved-0. Finalize assembles canonical JSON/self-hash; invokes stage-two entry predicate immediately before publish. Stage-two acceptance proves complete tree, unique owner, dependency matrix, DAG, implementation order; no separate invocation.

Publish current directory only: temp → fsync → read-back schema/self-hash → rename. Success renames; failure deletes temp; next start sweeps stale temp. Existing manifest with distinct input hash → BLOCKED; never replace/destroy.

## Step 6: report

Success only: manifest absolute path, source_hash, manifest_hash, gate summary. Failure only: failing gate id, reason, input/design correction.

## Error recovery

Read stderr `[guide]`; correct input/decision; rerun gate. `REVIEW_REQUIRED|BLOCKED` never COMPLETE; existing manifest always preserved.

## Prohibitions

Mechanical prohibitions and Step-3 design guidance are exhaustive; add no discretionary prohibition.

## Definition of success

Both: AI final semantic approval (`semantic_review.status=="APPROVED"`) and every machine gate PASS/unresolved review 0. Neither alone suffices. Final confirmation: reload manifest; schema/required values/self-hash; semantic-review record; stage-two entry-gate acceptance invoked by finalize.

## Reverse mode (T1 to T6)

Runs only when `reverse-decisions-mode` holds. Forward invokes finalize; absent/empty/unrecognized mode resolves FORWARD; this section cannot fire forward.

Role: existing substantial implementation requires measured-tree grounding; preserve physical layout exactly; maintain logical architecture separately; record technical debt, never canonize it as designed. Invoke `run.mjs reverse`; subject=current directory only.

- Read origin spec `workspacify/reverse/ORIGIN-LONG-SPEC.md`; copy it to workspace root before gates: stage two resolves basename `input.spec_path` against manifest directory and refuses absent root copy
- Sidecars: same reserved directory; measured dependencies: `workspacify/reverse/DEPENDENCIES.json`
- Root graph: `RFC-ROOT-GRAPH.json`; layer seam: `RFC-ROOT-Dirs-Tree.json`; omitted measurement ≠ empty measurement; T3/T4 distinguish
- Root holds manifest and `ARCHITECTURE-DELTA.json`; never build workspace under reserve
- Refuse whole token, never ignore: `--spec|--graph|--measured|--sidecars|--root|--delta|--out|--prior-partition|decisions argument`
- Decisions: fixed `workspacify/tree/DECISIONS.json`; read once; success sweeps it
- No dialogue/env/hook/external fetch

Forward G0–G5 unchanged; then T1–T6:

| Gate | FAIL | PASS |
|---|---|---|
| T1 structure parity | manifest package paths ≠ measured dirs either direction | exact agreement; each extra/missing named |
| T2 zero behavioural loss | handwritten source outside every package | every handwritten source owned |
| T3 grounding | node resolves to nonexistent file | every node resolves; unresolved id named |
| T4 measured implementation order | measured DAG order ≠ manifest order, or projection cycle | orders agree |
| T5 logical/physical separation | unrecorded mismatch or absent delta | every mismatch recorded |
| T6 reverse provenance | reverse provenance absent/unresolvable sidecar hash | present/resolves; forward deliberately absent/T6 inactive |

T5 checks record presence, not no-difference. Even zero mismatch writes `ARCHITECTURE-DELTA.json`; agreement proves neither model correct. Reverse adds only `reverse_provenance` (bundle hash/count summary); COMPLETE meaning and manifest-hash normalization unchanged; forward manifests byte-identical.

Reverse FAIL causes: disk extra/manifest missing (T1); source outside package (T2); nonexistent node file (T3); contradictory order/cycle (T4); omitted mismatch (T5); nonresolving provenance (T6).

Prohibitions:
- Never rename top-level entry. Writes: root manifest, root origin-spec copy, and delta only if prior partition. Analysis writes reserve before gates; walks exclude reserve
- Never add field to `*-GRAPH.json` or `*-Dirs-Tree.json`; provenance belongs manifest only
- Never treat measured DAG as logical architecture
- Never treat mismatch record as repair
