---
description: Generate a user-facing usage README from an RFC graph (section-by-section inspection loop method).
argument-hint: </path/to/*-GRAPH.json>
allowed-tools: Read, Write, Bash
disable-model-invocation: true
---

# /crystalize-readme <graph-path>

**Role**: Takes an RFC graph (`*-GRAPH.json`) as input and generates a user-facing "usage README." Each README section is judged section-by-section on **whether an implementation that fully works according to the usage described in that section is currently achievable**, and is finalized as either a "complete description" or a "residue description." For a section that cannot be written, the **concrete evidence of danger, omission, contradiction, and deficiency** and the **implementation reinforcement design** are recorded inside README.md together with the `<::README-RESIDUE::>` marker (for examples, `<::EXAMPLES-RESIDUE::>`). RESIDUE is not a "memo of why it cannot be written" but must be described strictly and rigorously as **the source material for creating implementation tickets that make the README and the examples implementation complete** (it will later be ticketized by `/drill-rfc-down`). No standalone RESIDUE file is generated.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

- **First argument (required)**: Path to the graph JSON (absolute or relative)
  - Example: `crates/siprs/RFC-ROOT-GRAPH.json`
  - Example: `/absolute/path/to/rfc-doc-GRAPH.json`

## Preflight: Output Path Derivation and Execution Mode Determination (Deterministic)

Run `derive-output-paths.js` to load and structurally validate the graph JSON (nodes / edges / `sourceFile` field), check **whether `sourceFile` actually exists**, and derive the output paths. It also determines the execution mode from **whether `README.md` / `CRYSTALIZE-Status.json` exist**.

```bash
node .claude/scripts/crystalize-readme/derive-output-paths.js --graph="$ARGUMENTS" || exit 1
```

- If the graph cannot be read / the structure is invalid / `sourceFile` does not exist, display an error message and exit (exit 1).
- On success, outputs English Markdown. The `Mode`, path set, and existence flags serve as the prerequisites for the subsequent Steps.
- **Mode determination**: If `README.md` or `CRYSTALIZE-Status.json` exists → **`refine`** (`/crystalize-readme` has been run before; this execution refines and updates). If neither exists → **`fresh`** (starts from scratch).

Example output (fresh):

```markdown
## crystalize-readme Preflight

**Mode: fresh** — No previous run was detected (no README.md or CRYSTALIZE-Status.json). This execution will start from scratch.

| Path | Value |
|------|-------|
| sourceFile | /path/to/rfc/RFC-ROOT.md |
| rfcDir | /path/to/rfc |
| examplesDir | /path/to/rfc/examples |
| readmePath | /path/to/rfc/README.md |

- sourceFile exists: yes
- README.md exists: no
- CRYSTALIZE-Status.json exists: no
```

Example output (refine):

```markdown
## crystalize-readme Preflight

**Mode: refine** — A previous /crystalize-readme run was detected (README.md and/or CRYSTALIZE-Status.json exists). This execution will refine and update the existing artifacts.

| Path | Value |
|------|-------|
| sourceFile | /path/to/rfc/RFC-ROOT.md |
| rfcDir | /path/to/rfc |
| examplesDir | /path/to/rfc/examples |
| readmePath | /path/to/rfc/README.md |

- sourceFile exists: yes
- README.md exists: yes
- CRYSTALIZE-Status.json exists: yes
```

| Path | Description |
|------|------|
| `sourceFile` | The RFC document from which the graph was generated (existence confirmed in Preflight). The read target of Step 0 |
| `rfcDir` | The directory where the source RFC document resides |
| `examplesDir` | `<rfcDir>/examples/`. Where the examples (implementation samples) live |
| `readmePath` | `<rfcDir>/README.md`. The README output destination |

## Marker Classification (Single Source of Truth: `validate-marker-grammar.js`)

| Section type | Work unit (unprocessed) | Residue (cannot be written) |
|---|---|---|
| Usage section | `<::TEMPLATE-README::>` | `<::README-RESIDUE::>` |
| Examples section | `<::TEMPLATE-EXAMPLES::>` | `<::EXAMPLES-RESIDUE::>` |

## Workflow Steps

### Step 0: Read sourceFile

Read the file at `sourceFile` output by Preflight.

- The read content is used as the **prerequisite information for Step 1 (TOC grill)**.
- Do not proceed to Step 1 or later until this Step is complete.

### Step 1: Grill — Hierarchical Headings (Table of Contents)

Finalize the README's table of contents (hierarchical headings). Use the `sourceFile` content read in Step 0 as prerequisite information.

**Policy**: Propose a "usage-focused README table of contents." Do not delve into technical details. Assign a **hierarchical path ID (H1, H1-1, H1-2, H1-2-1, H2, H2-1, ...)** to every heading. An ID is a hierarchical path; **the parent is derived by removing the trailing `-<n>`** (`H1-2-1`'s parent is `H1-2`). **A child can exist only after its parent; an ID without its parent (e.g., H2-1 without H2) is a structural violation** and is rejected.

#### 1-1. In refine mode, if `README.md exists: yes`, read the existing README.md and use it as prerequisite information for the heading proposals in 1-2 below (propose with the goal of refining and updating by referencing the previous headings and content). The finalized heading set is re-emitted to README.md in 1-8, and all sections are re-analyzed in Step 2. In fresh mode, skip 1-1.

#### 1-2. **Heading proposals (non-deterministic)**: The AI synthesizes each usage-focused TOC heading based on `sourceFile`. Each heading takes the form `{id, heading, contentOptions[], recommendation, reason, existingIds}` and carries a "content proposal" answerable with A/B/C or Yes/No. `existingIds` is the full set of existing node IDs (indicating that the parent exists). Each proposal must clearly state **the AI's recommendation and its reason**.

#### 1-3. **Validation gate (deterministic, mandatory)**: Validate every proposal with `validate-toc-proposal.js` **before presenting it to the user**. Restructure until `valid:true`; never present an unvalidated proposal.

```bash
echo '{"id":"H1-1","heading":"アカウントの追加","contentOptions":["add_account() と register() を呼ぶコード","SipAccountHandle 経由で登録状態を確認するコード","set_registration_enabled() で動的に登録を切り替えるコード"],"recommendation":"add_account() と register() を呼ぶコード","reason":"アカウント追加は最も基本的な操作であり、先に最小のコードを示すのが効果的なため","existingIds":["H1"]}' | node .claude/scripts/crystalize-readme/validate-toc-proposal.js || exit 1
```

- All fields of the proposal JSON: `id` (hierarchical path ID; parent = remove the trailing `-<n>`) / `heading` (heading title) / `contentOptions` (2–4 options, A/B/C or Yes/No) / `recommendation` (the recommended option) / `reason` (rationale for the recommendation) / `existingIds` (the full set of existing node IDs; the parent must be included).
- The above is a **living example** based on the real public API of the actual crate (siprs) (`add_account` / `register` / `SipAccountHandle`, etc.). Similarly, the AI must assemble proposals with concrete content grounded in the actual API and usage of the target RFC / `sourceFile`.
- The **content** of headings, options, and reasons must be written **in Japanese**.

#### 1-4. **Record proposals**: Record the validated proposal JSON in CRYSTALIZE-Status.json via `propose-heading`.

```bash
echo '<proposal-json>' | node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" propose-heading
```

#### 1-5. **User response**: The user answers **with A/B/C/Yes/No per ID**. Free comments are also allowed. If a free comment is received, re-run the 1-2 heading proposals later in line with its content.

#### 1-6. **Record confirmations**: For each answer, record the confirmed content via `confirm-heading`. `confirmedContent` is the content of the chosen option.

```bash
echo '{"id":"H1-1","confirmedContent":"add_account() と register() を呼ぶコード"}' | node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" confirm-heading
```

#### 1-7. **Completion condition**: Do not proceed until all heading items and their content are finalized. Repeat the revision and re-proposal of heading suggestions from 1-2 above until everything is finalized. After all nodes are finalized, complete Step 1 with `end-step 1`. **The final heading must always be "Examples（implementation samples）spec and design"**.

#### 1-8. **Skeleton output (end of Step 1, deterministic)**: Mechanically output the finalized heading set + the examples section to README.md via script. The `<::TEMPLATE-README::>` marker is automatically attached to each usage section, and the `<::TEMPLATE-EXAMPLES::>` marker to the examples section.

```bash
node .claude/scripts/crystalize-readme/emit-readme-skeleton.js --graph="$ARGUMENTS"
```

- **Common to fresh / refine**: Even if an existing README.md is present (refine mode), **overwrite** it with the skeleton of the new finalized heading set. The previous body and residue are not preserved; **all sections are re-analyzed** in Step 2 (refinement and updates are achieved through heading re-finalization and re-analysis, but the original README.md content should be heavily referenced and taken into account).
- Simultaneously with the skeleton re-emission, use `reset-sections` to empty `grill.sections` / `examplesApproved`, and start Step 2 as a re-analysis of all sections.

```bash
node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" reset-sections
```

- Do not proceed to Step 2 until this Step is complete.

### Step 2: Section-by-Section Inspection Loop

A loop that transitions each section of the finalized heading set to either a "complete description" or a "residue description." **The judgment must be made section-by-section.**

**refine mode**: Run this Step 2 loop on the README.md re-emitted from the finalized heading set in 1-8, exactly as in fresh mode. In refine mode, since all sections have been re-emitted with the `<::TEMPLATE-README::>` marker, **all sections are subject to inspection**, and the previous finalized state is not inherited. However, the original README.md content should be heavily referenced and taken into account.

**Entry determination (deterministic, mandatory)**: First display the ticket list and identify the entry point for which parts of src to read. Once the ticket key (e.g., P3-2) is known, the detailed design spec can be confirmed in `specs/<ticket-key>.md`.

```bash
node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json
```

Loop body:

1. **Check loop state (deterministic)**: List the unresolved sections (remaining `<::TEMPLATE-README::>`) with `loop-drive-readme.js`.

```bash
node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" --list
```

2. **Analyze the implementation (evidence required)**: For each `<::TEMPLATE-README::>` section, identify the ticket key corresponding to the section's content and analyze `specs/<ticket>.md` → the src implementation. Strictly inspect whether "what would be written in that README section" is complete as an implementation **fully working without danger, omission, contradiction, or deficiency**. Judgments without physical evidence are prohibited.
3. **Judgment (section-by-section, non-deterministic)**: Decide section-by-section whether "a README that can guarantee reliable, accurate operation (describing only usage, without delving into internal technical details)" **can or cannot be written**. If the implementation is complete as "**fully working without danger, omission, contradiction, or deficiency**," judge it "can be written"; otherwise, "cannot be written."
   - **"Can be written"** → Prepare the complete body (`content`) and pass `{id, heading, content}` to `loop-drive-readme.js resolve-section`. The dedicated script replaces the corresponding section in README.md (removing `<::TEMPLATE-README::>`) and marks it complete in CRYSTALIZE-Status.json. **The AI must not hand-edit the README.**
   - **"Cannot be written"** → Describe, extremely concretely and descriptively as `content`, the **specific evidence** of "danger, omission, contradiction, deficiency" and **what must be done to reinforce the implementation**, and pass `{id, heading, content}` to `loop-drive-readme.js mark-residue`. The dedicated script replaces the marker in README.md with `<::README-RESIDUE::>` and marks it as residue in CRYSTALIZE-Status.json. **The AI must not hand-edit the README.**

```bash
echo '{"id":"H1-1","heading":"アカウントの追加","content":"<完全な本文>"}' | node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" resolve-section
echo '{"id":"H1-2","heading":"通話","content":"<証拠と実装補強設計>"}' | node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" mark-residue
```

4. **Exit condition (deterministic)**: Run `--check` and **follow the English message output**. If `Loop converged` (all usage sections are complete descriptions or residues, with no marker grammar violations such as cross-contamination; the examples section's `<::TEMPLATE-EXAMPLES::>` is permitted as a Step 3 target), exit the loop and proceed to Step 3. If `Loop not converged` (unresolved sections / grammar violations are enumerated in the message), fix them according to the instructions and continue the loop.

```bash
node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" --check
# Follow the English message output (Loop converged / Loop not converged). Do not interpret the exit code itself.
```

### Step 3: Examples-Specific Step (After Loop Exit)

Finalize the README's trailing section "Examples（implementation samples）spec and design." Resolving the `<::TEMPLATE-EXAMPLES::>` marker is the responsibility of this dedicated Step and is not included in the Step 2 loop's completion check. Write up the complete design for the examples implementation.

1. **Complete coverage of all sections (non-deterministic)**: Synthesize a design that incorporates into a single implementation example everything described in all sections of the README except the trailing Examples section.
2. **Concreteness equivalent to the implementation (non-deterministic)**: Must include an exhaustive list of contracts (preconditions, postconditions, invariants), unit and integration tests satisfying all contracts, implementation code, build method, and how to operate after building — a design that, although a design, is nearly as concrete as the implementation itself.
3. **Inspection loop (non-deterministic)**: Inspect whether the written Examples is a perfect implementation example that completely covers all sections except Examples, and repeat corrections if there are any deficiencies.
4. **Finalize (deterministic, script)**: If you judge that "a description of examples that reliably works can be written," pass the complete design as `content` to `resolve-examples`. The dedicated script removes `<::TEMPLATE-EXAMPLES::>` and replaces it with the complete description, and marks it complete in CRYSTALIZE-Status.json. If it cannot be written, pass the concrete evidence of danger, omission, contradiction, and deficiency plus the implementation reinforcement design as `content` to `mark-examples-residue`. The dedicated script replaces `<::TEMPLATE-EXAMPLES::>` with `<::EXAMPLES-RESIDUE::>` and marks it as residue in CRYSTALIZE-Status.json. **The AI must not hand-edit the README.** Both commands are rejected with an error when the entry gate has not converged or the marker is absent.

```bash
echo '{"content":"<完全な examples 設計>"}' | node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" resolve-examples
echo '{"content":"<証拠と実装補強設計>"}' | node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" mark-examples-residue
```

5. **Completion condition (deterministic)**: Run `--check-examples` and **follow the English message output**. If `Examples resolved` (zero `<::TEMPLATE-EXAMPLES::>` and marker grammar clean), the Step is complete. If `Examples not resolved` (unresolved usage sections, remaining `<::TEMPLATE-EXAMPLES::>`, or grammar violations are enumerated in the message), fix them according to the instructions and re-run.

```bash
node .claude/scripts/crystalize-readme/loop-drive-readme.js --graph="$ARGUMENTS" --check-examples
# Follow the English message output (Examples resolved / Examples not resolved). Do not interpret the exit code itself.
```
