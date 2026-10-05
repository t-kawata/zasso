---
description: Generate a user-facing usage README from an RFC graph (section-by-section inspection loop method).
argument-hint: </path/to/*-GRAPH.json>
allowed-tools: Read, Write, Bash
disable-model-invocation: true
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (`/workspacify-*`, `/graphify-rfc`, `/split-to-tickets`, `/boundify-graph`, `/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`, `/consolidate-stubs`, `/find-omissions`, `/crystalize-readme`, `/epush-branch`, `/jpush-branch`) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor, background tasks, or polling; resume immediately. NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only: narrow by impact, target tests, or parallelize/background work; NEVER reduce completion criteria, defer, or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation. Decide from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Flow: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

**Exception to the above, scoped to this command only**: Step 1.5 below is a genuine `ask; stop` checkpoint — a literal, blocking wait for the user's answer. It is not a violation of this block; it is the one designed exception, and it is stated explicitly at its point of use.

# /crystalize-readme <graph-path>

Role: RFC graph (`*-GRAPH.json`) → user-facing usage README. Each section judged section-by-section: "is an implementation that fully works per this section's described usage currently achievable?" → complete description, or residue description. Cannot-be-written sections carry the concrete evidence of danger/omission/contradiction/deficiency + implementation reinforcement design, inside README.md, under `<::README-RESIDUE::>` (examples: `<::EXAMPLES-RESIDUE::>`). RESIDUE is not a "why it can't be written" memo — it must be strict, rigorous source material for implementation tickets. no standalone RESIDUE file.

Downstream (role): `/drill-rfc-down`.
- consumes: RESIDUE entries (evidence + reinforcement design)
- contract: ticketizes them into implementation tickets

Upstream (role): the make→plan→start→review ticket pipeline.
- produces: reviewed/implemented tickets with detailed specs
- guarantee: `specs/<ticket-key>.md` exists for each; `Tickets.json` lists them

## Language Protocol

| Context | Language |
|---|---|
| Chat, proposals, explanations addressing user | Japanese only |
| Code comments | English |
| Design docs, plans, tasks | English |
| Runtime logs | English |
| Every other non-user-directed context | English |

## Arguments

- arg (required): path to the graph JSON (absolute or relative) — e.g. `crates/siprs/RFC-ROOT-GRAPH.json`, `/absolute/path/to/rfc-doc-GRAPH.json`

## Preflight: Output Path Derivation and Execution Mode Determination (Deterministic)

```bash
node .claude/scripts/crystalize-readme/derive-output-paths.js --graph="$ARGUMENTS" || exit 1
```
gate: graph unreadable / structure invalid / `sourceFile` missing → error, exit1.
out (success): English Markdown — Mode, path set, existence flags = prerequisites for later Steps.

Mode (detected once, here only — no re-detection later):
- `README.md` or `CRYSTALIZE-Status.json` exists → **refine** (prior run detected; this execution refines/updates)
- neither exists → **fresh** (from scratch)

out template (fields differ by mode, structure identical):
```markdown
## crystalize-readme Preflight

**Mode: fresh|refine** — <fresh: no previous run detected | refine: a previous run detected (README.md and/or CRYSTALIZE-Status.json exists)>. This execution will <fresh: start from scratch | refine: refine and update the existing artifacts>.

| Path | Value |
|------|-------|
| sourceFile | /path/to/rfc/RFC-ROOT.md |
| rfcDir | /path/to/rfc |
| examplesDir | /path/to/rfc/examples |
| readmePath | /path/to/rfc/README.md |

- sourceFile exists: yes
- README.md exists: fresh=no / refine=yes
- CRYSTALIZE-Status.json exists: fresh=no / refine=yes
```

| Path | Description |
|------|------|
| `sourceFile` | RFC doc the graph was generated from (existence confirmed at Preflight); Step 0's read target |
| `rfcDir` | directory containing the source RFC document |
| `examplesDir` | `<rfcDir>/examples/` — implementation samples |
| `readmePath` | `<rfcDir>/README.md` — README output destination |

## Marker Classification (Single Source of Truth: `validate-marker-grammar.js`)

| Section type | Work unit (unprocessed) | Residue (cannot be written) |
|---|---|---|
| Usage section | `<::TEMPLATE-README::>` | `<::README-RESIDUE::>` |
| Examples section | `<::TEMPLATE-EXAMPLES::>` | `<::EXAMPLES-RESIDUE::>` |

## Workflow Steps

### Step 0: Read sourceFile

Read `sourceFile` from Preflight. out: prerequisite for Step 1 (TOC grill).
gate: do not proceed to Step 1+ until complete.

### Step 1: Grill — Hierarchical Headings (Table of Contents)

Finalize the README TOC. uses Step 0's `sourceFile` content as prerequisite.

Policy: usage-focused TOC, no technical deep-dive. every heading gets a hierarchical path ID (`H1`, `H1-1`, `H1-2`, `H1-2-1`, `H2`, `H2-1`, ...) — parent = strip trailing `-<n>` (`H1-2-1`'s parent is `H1-2`). invariant: a child can exist only after its parent; an ID without its parent (e.g. `H2-1` without `H2`) is a structural violation → rejected.

#### 1-1. In refine mode, if `README.md exists: yes`, read the existing README.md and use it as prerequisite information for the heading proposals in 1-2 below (propose with the goal of refining and updating by referencing the previous headings and content). The finalized heading set is re-emitted to README.md in 1-8, and all sections are re-analyzed in Step 2. In fresh mode, skip 1-1.
refine: read existing README.md as prerequisite for 1-2's proposals (goal: refine/update by referencing prior headings/content). the finalized heading set is re-emitted in 1-8, all sections re-analyzed in Step 2.
fresh: skip.

#### 1-2. **Heading proposals (non-deterministic)**: The AI synthesizes each usage-focused TOC heading based on `sourceFile`. Each heading takes the form `{id, heading, contentOptions[], recommendation, reason, existingIds}` and carries a "content proposal" answerable with A/B/C or Yes/No. `existingIds` is the full set of existing node IDs (indicating that the parent exists). Each proposal must clearly state **the AI's recommendation and its reason**.
judge: AI synthesizes each usage-focused TOC heading from `sourceFile`. shape: `{id, heading, contentOptions[], recommendation, reason, existingIds}` — a content proposal answerable A/B/C or Yes/No. `existingIds` = full set of existing node IDs (parent-exists evidence). every proposal states the AI's recommendation + reason.

#### 1-3. **Validation gate (deterministic, mandatory)**: Validate every proposal with `validate-toc-proposal.js` **before presenting it to the user**. Restructure until `valid:true`; never present an unvalidated proposal.
gate: validate every proposal with `validate-toc-proposal.js` **before presenting to the user**. restructure until `valid:true`; never present an unvalidated proposal.
```bash
echo '{"id":"H1-1","heading":"アカウントの追加","contentOptions":["add_account() と register() を呼ぶコード","SipAccountHandle 経由で登録状態を確認するコード","set_registration_enabled() で動的に登録を切り替えるコード"],"recommendation":"add_account() と register() を呼ぶコード","reason":"アカウント追加は最も基本的な操作であり、先に最小のコードを示すのが効果的なため","existingIds":["H1"]}' | node .claude/scripts/crystalize-readme/validate-toc-proposal.js || exit 1
```
fields: `id` (path ID, parent = strip trailing `-<n>`) / `heading` / `contentOptions` (2–4 options, A/B/C or Yes/No) / `recommendation` / `reason` / `existingIds` (full existing-ID set, parent must be included).
this is a **living example** grounded in the real public API of the actual crate (siprs: `add_account`/`register`/`SipAccountHandle`) — assemble proposals with concrete content grounded in the actual target API/usage.
invariant: heading/option/reason content in Japanese.

#### 1-4. **Record proposals**: Record the validated proposal JSON in CRYSTALIZE-Status.json via `propose-heading`.
```bash
echo '<proposal-json>' | node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" propose-heading
```

#### 1-5. **User response**: The user answers **with A/B/C/Yes/No per ID**. Free comments are also allowed. If a free comment is received, re-run the 1-2 heading proposals later in line with its content.
**ask; stop** — the one designed exception to this file's global auto;never-ask.
wait: user answers **A/B/C/Yes/No per ID**. free comments allowed → free comment received: re-run 1-2's proposals accordingly.

#### 1-6. **Record confirmations**: For each answer, record the confirmed content via `confirm-heading`. `confirmedContent` is the content of the chosen option.
`confirmedContent` = the chosen option's content.
```bash
echo '{"id":"H1-1","confirmedContent":"add_account() と register() を呼ぶコード"}' | node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" confirm-heading
```

#### 1-7. **Completion condition**: Do not proceed until all heading items and their content are finalized. Repeat the revision and re-proposal of heading suggestions from 1-2 above until everything is finalized. After all nodes are finalized, complete Step 1 with `end-step 1`. **The final heading must always be "Examples（implementation samples）spec and design"**.
gate: do not proceed until all heading items + content are finalized. loop 1-2→1-6 (revise/re-propose) until everything finalized. invariant: the final heading must always be "Examples（実装サンプル）仕様と設計". then `end-step 1`.

#### 1-8. **Skeleton output (end of Step 1, deterministic)**: Mechanically output the finalized heading set + the examples section to README.md via script. The `<::TEMPLATE-README::>` marker is automatically attached to each usage section, and the `<::TEMPLATE-EXAMPLES::>` marker to the examples section.
```bash
node .claude/scripts/crystalize-readme/emit-readme-skeleton.js --graph="$ARGUMENTS"
```
mechanically writes the finalized heading set + examples section to README.md; auto-attaches `<::TEMPLATE-README::>` to each usage section, `<::TEMPLATE-EXAMPLES::>` to the examples section.
invariant (fresh=refine, common): even if README.md exists (refine), **overwrite** with the new skeleton — prior body/residue NOT preserved; **all sections re-analyzed** in Step 2 (refinement happens via heading re-finalization + re-analysis; still, heavily reference the old README.md content).
```bash
node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" reset-sections
```
`reset-sections` empties `grill.sections`/`examplesApproved`, starts Step 2 as full re-analysis.
gate: do not proceed to Step 2 until complete.

### Step 2: Section-by-Section Inspection Loop

Transitions each finalized-heading section to complete description or residue description. judgment is per-section.

refine: run identically to fresh, on the README.md re-emitted at 1-8. all sections carry `<::TEMPLATE-README::>` → all subject to inspection; prior finalized state NOT inherited. still, heavily reference the old README.md content.

Entry determination (deterministic, mandatory): display ticket list, identify src-reading entry point. ticket key known (e.g. P3-2) → detailed spec at `specs/<ticket-key>.md`.
```bash
node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json
```

Loop body:
1. check loop state (deterministic): `node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" --list` — lists unresolved sections (`<::TEMPLATE-README::>` remaining).
2. analyze implementation (evidence required): per `<::TEMPLATE-README::>` section, identify its ticket key, analyze `specs/<ticket>.md` → src. invariant: judgments without physical evidence are prohibited.
3. judgment (per-section, non-deterministic): "can be written" iff the implementation is complete — fully working without danger/omission/contradiction/deficiency (usage-only description, no internal deep-dive).
   - can be written → prepare complete `content`, pass `{id, heading, content}` to `resolve-section`. script replaces the section (removes `<::TEMPLATE-README::>`), marks complete.
   - cannot be written → describe concrete evidence of danger/omission/contradiction/deficiency + reinforcement design as `content`, pass `{id, heading, content}` to `mark-residue`. script replaces the marker with `<::README-RESIDUE::>`, marks residue.
   invariant: **the AI must not hand-edit the README** — both transitions go through the script.
```bash
echo '{"id":"H1-1","heading":"アカウントの追加","content":"<完全な本文>"}' | node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" resolve-section
echo '{"id":"H1-2","heading":"通話","content":"<証拠と実装補強設計>"}' | node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" mark-residue
```
4. exit condition (deterministic):
```bash
node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" --check
```
judge: read the English message text, not the exit code. "Loop converged" (all usage sections complete/residue, no marker-grammar violations; `<::TEMPLATE-EXAMPLES::>` still open is fine — Step 3's target) → exit loop, proceed to Step 3. "Loop not converged" (message enumerates unresolved sections/violations) → fix per instructions, continue loop.

### Step 3: Examples-Specific Step (After Loop Exit)

Finalizes the trailing "Examples（実装サンプル）仕様と設計" section. resolving `<::TEMPLATE-EXAMPLES::>` is this Step's job — NOT part of Step 2's convergence check.

1. complete coverage (non-deterministic): synthesize one implementation example covering everything in every non-Examples section.
2. concreteness (non-deterministic): must include exhaustive contracts (pre/post/invariant), unit+integration tests satisfying all contracts, implementation code, build method, post-build operation — design nearly as concrete as the implementation itself.
3. inspection loop (non-deterministic): inspect whether Examples is a perfect, complete-coverage implementation example; repeat corrections on any deficiency.
4. finalize (deterministic, script): "reliably works, can be written" → pass complete design as `content` to `resolve-examples` — removes `<::TEMPLATE-EXAMPLES::>`, inserts complete description, marks complete. cannot be written → pass concrete evidence + reinforcement design as `content` to `mark-examples-residue` — replaces with `<::EXAMPLES-RESIDUE::>`, marks residue. invariant: **the AI must not hand-edit the README**. both rejected with an error if the entry gate hasn't converged or the marker is absent.
```bash
echo '{"content":"<完全な examples 設計>"}' | node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" resolve-examples
echo '{"content":"<証拠と実装補強設計>"}' | node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" mark-examples-residue
```
5. completion condition (deterministic):
```bash
node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" --check-examples
```
judge: read the English message text, not the exit code. "Examples resolved" (zero `<::TEMPLATE-EXAMPLES::>`, marker grammar clean) → Step complete. "Examples not resolved" (message enumerates unresolved usage sections / remaining `<::TEMPLATE-EXAMPLES::>` / grammar violations) → fix per instructions, re-run.

## Reverse rotation only — the return path from a RESIDUE to its scenario and its route
**Rotation gate** — this section runs only when `return-refs-reverse-mode` holds. `return-refs.js` is invoked with `--mode=reverse`; without the flag the artefact is returned itself and no return reference is written, so this section cannot fire in a forward run.

Mode: forward | reverse
  detect: `return-refs-reverse-mode` holds / `--mode=reverse` passed. without it, this section cannot fire — the artefact returns itself, no return reference written.

forward: a RESIDUE recorded during forward rotation carries exactly the fields it carried before this section existed — RESIDUE-0 is the reverse rotation's stated success condition, and the forward shape is what that condition is counted from.

reverse: a RESIDUE is a shortfall of the product's own account, not of the RFC. it names where it came from and where it travels next: `scenario_ref` and `next_route`.
1. `scenario_ref` = the id of the confirmed section the shortfall was found in, resolved against `grill.sections[]` in `CRYSTALIZE-Status.json` (upserted by `loop-drive-readme.js`). `next_route` = the step the shortfall travels to next, one of `R3.5`/`R5`/`R6`/`grill`.
2. judge: resolve before recording. call `return-refs.js` with the RESIDUE + status file; returns the RESIDUE carrying only the references that resolved, plus a report in plain English for each that did not.
```bash
node .claude/scripts/tickets/lib/return-refs.js \
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
