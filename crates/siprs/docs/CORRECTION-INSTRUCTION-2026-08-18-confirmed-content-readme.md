# Correction Instruction — Render `confirmedContent` into `grill.sections[]` and `README.md`

**Date**: 2026-08-18
**Scope**: `/crystalize-readme` tooling under `crates/siprs/.claude/scripts/crystalize-readme/`
**Implementer**: assigned AI (this document is a self-contained handoff)
**Status**: Ready for implementation once the open item in §8 is confirmed

---

## 1. Background

### 1.1 What `/crystalize-readme` does

`/crystalize-readme` is a slash-command pipeline that takes an RFC graph
(`*-GRAPH.json`) and produces a **user-facing usage README** at
`<rfcDir>/README.md`. Each README section is judged section-by-section as either
a **complete description** (writable) or a **residue description** (not yet
writable; the README records concrete evidence of danger/omission/contradiction/
deficiency plus an implementation-reinforcement design, marked with
`<::README-RESIDUE::>`).

State is persisted in `CRYSTALIZE-Status.json` next to the README.

### 1.2 Pipeline steps and data flow

1. **Preflight** — `derive-output-paths.js` derives paths and mode (`fresh`/`refine`).
2. **Step 1 — TOC grill** — `validate-toc-proposal.js` validates each heading
   proposal; `update-step-status.js propose-heading` records nodes into
   `grill.toc.nodes[]`; `update-step-status.js confirm-heading` sets
   `nodes[].confirmedContent` (the user's chosen content option) and
   `nodes[].status = "confirmed"`. `emit-readme-skeleton.js` then writes the
   skeleton README (one `<::TEMPLATE-README::>` per usage heading, plus a
   trailing `<::TEMPLATE-EXAMPLES::>` section) and `reset-sections` clears
   `grill.sections[]`.
3. **Step 2 — section loop** — `loop-drive-readme.js resolve-section | mark-residue`
   reads `{id, heading, content}`, rewrites the README section (removing
   `<::TEMPLATE-README::>`, or writing `<::README-RESIDUE::>` + evidence), and
   upserts a `grill.sections[]` record. Convergence is checked with `--check`.
4. **Step 3 — examples** — `loop-drive-readme.js resolve-examples | mark-examples-residue`
   finalizes the trailing Examples section. Checked with `--check-examples`.
5. **Marker grammar** — `validate-marker-grammar.js` is the single source of
   truth for the four markers (`<::TEMPLATE-README::>`, `<::README-RESIDUE::>`,
   `<::TEMPLATE-EXAMPLES::>`, `<::EXAMPLES-RESIDUE::>`).

### 1.3 The data model

- `grill.toc.nodes[]` — `{ id, heading, level, confirmedContent, status }`.
  `confirmedContent` is set by `confirm-heading` and is the user's chosen
  content option verbatim. Example (H1):
  `トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード`.
- `grill.sections[]` — `{ id, heading, state }` where `state ∈ complete | residue`.
  **Currently carries no `confirmedContent`.**
- `README.md` — rendered from the sections.

### 1.4 The defect

The user's confirmed content (`nodes[].confirmedContent`) is dropped at the
section layer: `grill.sections[]` does not store it, and `README.md` section
bodies never render it. The README currently shows only the residue evidence /
complete prose below each heading, so the "what this section should contain"
description chosen by the user is absent.

---

## 2. Requirement (what must change)

1. Add a `confirmedContent` field to every `grill.sections[]` record.
2. Its value must be **copied from the matching `grill.toc.nodes[]` record**'s
   `confirmedContent` (join key: `id`).
3. `README.md` must render each **usage section** with `confirmedContent` as the
   section body lead:

   ```markdown
   # <heading>

   <confirmedContent>
   ```

   Example (H1, a residue section):

   ```markdown
   # クイックスタート（SipClient 初期化と最初のステップ）

   トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード
   ```

---

## 3. Design decision — placement of residue / complete content (open item)

The README already holds residue evidence / complete prose below each heading.
Two options exist for where that content sits relative to `confirmedContent`:

- **(b) [RECOMMENDED] — `confirmedContent` as the lead paragraph, existing
  content below it.** This preserves the `/crystalize-readme` invariant that
  residue evidence is recorded **inside README.md** as the source material for
  implementation tickets, while satisfying "`confirmedContent` is written in
  README".

  - Residue section:

    ```markdown
    # <heading>

    <confirmedContent>

    <::README-RESIDUE::>
    ## RESIDUE — 完全記述の作成不可
    <evidence + reinforcement design>
    ```

  - Complete section:

    ```markdown
    # <heading>

    <confirmedContent>

    <complete prose>
    ```

- **(a) Alternative — `README.md` body is `confirmedContent` only**; residue
  evidence is moved out of the README into `CRYSTALIZE-Status.json`
  (e.g. `sections[].content`). This contradicts the skill's rule that residue
  evidence is recorded inside `README.md`, and is a larger change.

**Default: (b).** If the user chooses (a), only §5.2 rendering and §6.3 migration
change; the `sections[].confirmedContent` requirement (§2) is identical in both.

---

## 4. Files to modify

| File | Change |
|---|---|
| `.claude/scripts/crystalize-readme/loop-drive-readme.js` | `updateSectionState()` (≈L190-200): copy `confirmedContent` from node lookup. `executeSectionTransition()` (≈L544): prepend `confirmedContent` to the rendered section body. |
| `.claude/scripts/crystalize-readme/update-step-status.js` | `executeResolveSection()` / `executeMarkResidue()` (≈L412-460): copy `confirmedContent` from node lookup into the sections record. |
| `.claude/scripts/crystalize-readme/emit-readme-skeleton.js` | No change expected — the skeleton still emits `<::TEMPLATE-README::>`; `confirmedContent` is rendered at resolution time. Re-run its tests to confirm no regression. |
| `CRYSTALIZE-Status.json` (current run) | Backfill `sections[].confirmedContent` from `toc.nodes[]` (migration, §6.3). |
| `README.md` (current run) | Backfill `confirmedContent` paragraphs (migration, §6.3). |

Do **not** modify `validate-marker-grammar.js`, `validate-toc-proposal.js`,
`derive-output-paths.js`, or `validate-graph-arg.js` unless a test proves
otherwise.

---

## 5. Precise behavior spec

### 5.1 `sections[]` upsert

In `updateSectionState(status, id, heading, state)` (loop-drive-readme.js), after
the record is located/created, set:

```js
const node = status.grill.toc.nodes.find((n) => n.id === id);
existing.confirmedContent =
  node && typeof node.confirmedContent === 'string' ? node.confirmedContent : null;
```

- `EXAMPLES_SECTION_ID` has no node → `confirmedContent` must be `null`/absent.
- A missing node or an empty `confirmedContent` must not throw.

Apply the identical logic to `executeResolveSection()` and `executeMarkResidue()`
in update-step-status.js.

### 5.2 README rendering

In `executeSectionTransition()` (loop-drive-readme.js, ≈L544), build the body as
`confirmedContent + "\n\n" + content` when `confirmedContent` is non-empty;
otherwise keep the current behavior.

- **Resolve (complete)**: section text =
  `<headingLine>\n\n<confirmedContent>\n\n<content>`.
- **Residue**: section text =
  `<headingLine>\n\n<confirmedContent>\n\n<::README-RESIDUE::>\n<residueBody>`.
- The marker `<::README-RESIDUE::>` stays on its own line; `confirmedContent`
  sits between the heading and the marker.
- **Examples** transitions (`executeExamplesTransition`, ≈L585) are unchanged:
  no node → no `confirmedContent`.

### 5.3 Marker grammar compatibility

`validate-marker-grammar.js` counts markers per section body
(position-independent). Adding a paragraph before the marker must not change
`templateCount` / `errors`. Verify the final README with the grammar validator
(`ok: true`, `templateCount: 0`).

---

## 6. Implementation steps (TDD — mandatory)

Follow the project's supreme law: **Red → Green → Refactor**. Do not skip.

### 6.1 Add tests first (RED)

No unit tests currently exist for the `crystalize-readme` scripts. Add tests
under `.claude/tests/` (e.g. `.claude/tests/crystalize-readme/`), runnable via
`node .claude/tests/run-all.js`. Required coverage:

- `loop-drive-readme.js resolve-section`: README section becomes
  `# heading` + blank + `confirmedContent` + blank + `content`; `sections[].confirmedContent`
  equals `toc.nodes[].confirmedContent`.
- `loop-drive-readme.js mark-residue`: README section becomes
  `# heading` + blank + `confirmedContent` + blank + `<::README-RESIDUE::>` +
  evidence; `sections[].confirmedContent` set.
- Examples transitions do **not** receive `confirmedContent`.
- Missing node / missing `confirmedContent` → `confirmedContent: null`, no crash.
- `validate-marker-grammar.js` passes on a resolved README that includes
  `confirmedContent` paragraphs.
- `update-step-status.js` `resolve-section` / `mark-residue` set
  `sections[].confirmedContent`.
- Migration backfill (§6.3) is idempotent.

### 6.2 Implement (GREEN)

Apply §5. Keep the change minimal; do not alter the marker set, the skill's
Step 1/2/3 semantics, or the overall pipeline.

### 6.3 Backfill the current run (migration)

The current `CRYSTALIZE-Status.json` and `README.md` were produced before this
change. Backfill:

- `CRYSTALIZE-Status.json`: for each `grill.sections[]` record whose `id` matches
  a `grill.toc.nodes[]` record, set `confirmedContent` from the node.
- `README.md`: for each usage section, insert a `confirmedContent` paragraph
  after the heading line (blank line + `confirmedContent` + blank line), before
  the existing body/marker. Leave the Examples section untouched.

Write the backfill as a small idempotent migration (a one-off script or a test
helper) and run it. Verify the result with `validate-marker-grammar.js` and
`loop-drive-readme.js --check`.

### 6.4 Verification

1. `node .claude/tests/run-all.js` — all green.
2. `loop-drive-readme.js --check` → `Loop converged`.
3. `loop-drive-readme.js --check-examples` → `Examples resolved`.
4. `validate-marker-grammar.js` on the final `README.md` → `ok: true`,
   `templateCount: 0`.
5. `make test` (cargo) — no Rust changes are expected; run once to confirm no
   accidental impact.

---

## 7. Scope boundaries

- Do **not** modify `validate-marker-grammar.js`, `validate-toc-proposal.js`,
  `derive-output-paths.js`, or `validate-graph-arg.js` unless a test proves
  otherwise.
- Do **not** change the skill's Step 1/Step 2/Step 3 semantics or the marker set.
- Do **not** touch `src/` (Rust) — this is tooling-only.
- Keep each modified function small; preserve the `[::TICKET::]` provenance
  comments already present in the files.

---

## 8. Open item (must be confirmed before/at handoff)

- **§3**: choose **(b)** [recommended, default] or **(a)** for the placement of
  residue evidence / complete prose relative to `confirmedContent`.

---

## 9. Reference — exact current code locations

- `loop-drive-readme.js`
  - `updateSectionState(status, id, heading, state)` — L190-200 (sections upsert).
  - `markResidue(text, headingText, residueBody)` — L415-424 (builds
    `<headingLine>\n\n<::README-RESIDUE::>\n<residueBody>`).
  - `resolveSection(text, headingText, newSectionText)` — L401-402.
  - `executeSectionTransition(parsed)` — L544-583 (reads `{id, heading, content}`
    from stdin; L549-563 build the body and call `updateSectionState`).
  - `executeExamplesTransition(parsed)` — L585-620.
- `update-step-status.js`
  - `executeResolveSection(status, request)` / `executeMarkResidue(status, request)`
    — ≈L412-460 (sections upsert with `{id, heading, state}`).
  - `executeConfirmHeading(status, confirmation)` — ≈L326-342 (sets
    `node.confirmedContent`, the source of the copy).
- `emit-readme-skeleton.js` — `emitSkeleton(status)` L116-131 (writes headings
  from `grill.toc.nodes` + `<::TEMPLATE-README::>` / `<::TEMPLATE-EXAMPLES::>`).
- `validate-marker-grammar.js` — `splitSections()` L84-104 (sections split by
  heading lines; body = lines until next heading), `countMarkers()` L113+.
- Test runner: `.claude/tests/run-all.js` (`node .claude/tests/run-all.js`).
