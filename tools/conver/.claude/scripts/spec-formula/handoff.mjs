// PX-390 @verifies C001 C002 C003
/**
 * The formula handoff: detect the gap between the ledger smooth certifies and the
 * sidecar graphify consumes, and apply only the repairs that are pure mirrors.
 *
 * The detector is read-only and reports its class and evidence. The applier writes
 * only when the repair is provably derived from the AI-authored ledger. A semantic
 * conflict, an AI-only field, or an unresolved section is left for the AI to decide;
 * no script invents a formula body, theory, design or test.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildHeadingIndex, buildSidecar } from './author-ledger.mjs';
import { extractFormulas, uniqueFormulas } from './extract.mjs';
import { parseSeedIdentity } from './identity.mjs';
import { validateFormulaLedger, validateFormulaSidecar } from './ledger.mjs';
import { normalizeFormula } from './normalize.mjs';
import { ownedFormulasForPackage } from './ownership.mjs';

/** The classes the handoff detector reports. */
export const HANDOFF_CLASS = Object.freeze({
  CURRENT: 'current',
  NO_OWNED_FORMULAS: 'no-owned-formulas',
  MISSING_LEDGER: 'missing-ledger',
  LEDGER_INVALID: 'ledger-invalid',
  STALE_MIRROR: 'stale-mirror',
  MISSING_SIDECAR: 'missing-sidecar',
  SIDECAR_ONLY_CONTENT: 'sidecar-only-content',
  FIELD_CONFLICT: 'field-conflict',
  SECTION_UNRESOLVED: 'section-unresolved',
  SECTION_AMBIGUOUS: 'section-ambiguous',
});

/** The named findings the detector and the consumers report. */
export const HANDOFF_CODE = Object.freeze({
  MISSING_FORMULA_LEDGER: 'MISSING_FORMULA_LEDGER',
  MISSING_FORMULA_SIDECAR: 'MISSING_FORMULA_SIDECAR',
  SIDECAR_UNREADABLE: 'SIDECAR_UNREADABLE',
  STALE_SIDECAR: 'STALE_SIDECAR',
  SIDECAR_ONLY_CONTENT: 'SIDECAR_ONLY_CONTENT',
  FIELD_CONFLICT: 'FIELD_CONFLICT',
  SECTION_UNRESOLVED: 'SECTION_UNRESOLVED',
  SECTION_AMBIGUOUS: 'SECTION_AMBIGUOUS',
  SECTION_RESOLVED: 'SECTION_RESOLVED',
  LEDGER_INVALID: 'LEDGER_INVALID',
  JUDGMENT_REQUIRED: 'JUDGMENT_REQUIRED',
});

/** The judgment classes that must never be written by a script. */
export const JUDGMENT_CLASSES = Object.freeze(new Set([
  HANDOFF_CLASS.MISSING_LEDGER,
  HANDOFF_CLASS.LEDGER_INVALID,
  HANDOFF_CLASS.SIDECAR_ONLY_CONTENT,
  HANDOFF_CLASS.FIELD_CONFLICT,
  HANDOFF_CLASS.SECTION_UNRESOLVED,
  HANDOFF_CLASS.SECTION_AMBIGUOUS,
]));

/**
 * The mechanical classes an applier may mirror from the ledger.
 *
 * `missing-sidecar` and `stale-mirror` contain only rows the ledger already carries;
 * `current` is a no-op. Every other class needs a decision.
 */
export const MECHANICAL_CLASSES = Object.freeze(new Set([
  HANDOFF_CLASS.CURRENT,
  HANDOFF_CLASS.MISSING_SIDECAR,
  HANDOFF_CLASS.STALE_MIRROR,
]));

/** Strip a Markdown heading marker and a section sign, then lower-case. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function normalizedSection(value) {
  return String(value ?? '')
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/^§\s*/, '')
    .toLowerCase();
}

/** Whether a heading text names the section a formula records. */
export function sectionMatchesHeading(headingText, section) {
  const token = normalizedSection(section);
  const heading = normalizedSection(headingText);
  if (token.length === 0 || heading.length === 0) return false;
  if (heading === token) return true;
  if (!heading.startsWith(token)) return false;
  const boundary = heading[token.length] ?? '';
  return !/[0-9a-z]/.test(boundary);
}

/**
 * The one RFC heading a section reference names, or its candidates.
 *
 * Exact heading text wins; otherwise a unique section-token prefix does. Zero or
 * several candidates are returned without a choice, so the caller can hand the
 * decision to the AI.
 *
 * @param {{ section: string, headings: Array<{title: string, lineStart: number, lineEnd: number}> }} input
 * @returns {{ heading: object|null, candidates: Array<object> }}
 */
export function resolveSectionHeading({ section, headings }) {
  const list = Array.isArray(headings) ? headings : [];
  const exact = list.filter((heading) => normalizedSection(heading.title) === normalizedSection(section));
  if (exact.length === 1) return { heading: exact[0], candidates: exact };
  const prefixed = list.filter((heading) => sectionMatchesHeading(heading.title, section));
  if (prefixed.length === 1) return { heading: prefixed[0], candidates: prefixed };
  return { heading: null, candidates: prefixed.length > 0 ? prefixed : exact };
}

/** A finding in the shape the smooth S8 worklist and graphify both read. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function finding(code, subject, message, extra = {}) {
  return { code, subject, message, severity: 'blocking', ...extra };
}

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function idsOf(rows) {
  return new Set((rows ?? []).map((row) => row.id));
}

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function rowSection(row) {
  return row?.rfcLocation?.section ?? row?.rfcLocation?.path ?? '';
}

/** Resolve every row's section against the RFC headings. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function resolveSections(rows, rfcText) {
  const headings = buildHeadingIndex(rfcText);
  const resolved = {};
  const candidates = {};
  const unresolved = [];
  const ambiguous = [];
  for (const row of rows ?? []) {
    const resolution = resolveSectionHeading({ section: rowSection(row), headings });
    if (resolution.heading !== null) {
      resolved[row.id] = {
        title: resolution.heading.title,
        lineStart: resolution.heading.lineStart,
        lineEnd: resolution.heading.lineEnd,
      };
    } else if (resolution.candidates.length > 1) {
      ambiguous.push({ formulaId: row.id, candidates: resolution.candidates });
    } else {
      unresolved.push(row.id);
    }
    if (resolution.candidates.length > 0) candidates[row.id] = resolution.candidates;
  }
  return { resolved, candidates, unresolved, ambiguous };
}

/** The report every class shares. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function report(input) {
  const { className, ok, ownership, ledger, sidecar, rfcText, ledgerOnly = [], sidecarOnly = [], fieldConflicts = [], sections, findings = [] } = input;
  return {
    ok,
    class: className,
    ownership: {
      owned: ownership.owned.map((formula) => formula.id),
      all: ownership.all.map((formula) => formula.id),
      unresolvedSegments: ownership.unresolvedSegments,
    },
    ledgerRows: ledger?.rows?.length ?? 0,
    sidecarRows: sidecar?.formulas?.length ?? 0,
    ledgerOnly,
    sidecarOnly,
    fieldConflicts,
    sections,
    ledger,
    sidecar,
    rfcText,
    findings,
  };
}

/**
 * Inspect the handoff without writing anything.
 *
 * @param {{ rfcText?: string, seedText: string, specText: string, treeManifest: object|null, ledger?: object|null, sidecar?: object|null }} input
 * @returns {object}
 */
export function inspectFormulaHandoff(input) {
  const { rfcText = '', seedText, specText, treeManifest, ledger = null, sidecar = null } = input;
  const ownership = ownedFormulasForPackage({ seedText, specText, treeManifest });
  const rows = ledger?.rows ?? [];
  const sidecarRows = sidecar?.formulas ?? [];
  const sections = resolveSections(rows.length > 0 ? rows : sidecarRows, rfcText);

  if (ownership.owned.length === 0 && sidecar === null) {
    return report({ className: HANDOFF_CLASS.NO_OWNED_FORMULAS, ok: true, ownership, ledger, sidecar, rfcText, sections });
  }
  if (ledger === null && sidecar !== null) {
    return report({
      className: HANDOFF_CLASS.SIDECAR_ONLY_CONTENT,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      sidecarOnly: [...idsOf(sidecarRows)],
      findings: [finding(HANDOFF_CODE.SIDECAR_ONLY_CONTENT, null, 'the package carries a sidecar and no Formula ledger; the AI decides which record is authoritative')],
    });
  }
  if (ledger === null) {
    return report({
      className: HANDOFF_CLASS.MISSING_LEDGER,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      findings: [finding(HANDOFF_CODE.MISSING_FORMULA_LEDGER, null, `the package owns ${ownership.owned.length} formula(s) and carries no Formula ledger`)],
    });
  }

  const ledgerFindings = validateFormulaLedger(ledger);
  if (ledgerFindings.length > 0) {
    return report({
      className: HANDOFF_CLASS.LEDGER_INVALID,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      findings: ledgerFindings.map((entry) => finding(
        HANDOFF_CODE.LEDGER_INVALID,
        entry.formulaId ?? entry.field ?? null,
        entry.message,
        { field: entry.field ?? null },
      )),
    });
  }

  const ledgerIds = idsOf(rows);
  const sidecarIds = idsOf(sidecarRows);
  const ledgerOnly = [...ledgerIds].filter((id) => !sidecarIds.has(id)).sort();
  const sidecarOnly = [...sidecarIds].filter((id) => !ledgerIds.has(id)).sort();
  const sidecarFindings = sidecar === null ? [] : validateFormulaSidecar(sidecar, ledger);
  // A missing or extra row is a set difference, not a field conflict: the id sets below
  // decide it, and a script can mirror a missing row without making a judgment.
  const rowSetCodes = new Set(['SIDECAR_ROW_MISSING', 'SIDECAR_ROW_EXTRA']);
  const fieldConflicts = [...new Map(sidecarFindings
    .filter((entry) => typeof entry.formulaId === 'string' && !rowSetCodes.has(entry.code))
    .map((entry) => [entry.formulaId, { formulaId: entry.formulaId, code: entry.code, field: entry.field ?? null, message: entry.message }]))
    .values()];

  if (sidecarOnly.length > 0) {
    return report({
      className: HANDOFF_CLASS.SIDECAR_ONLY_CONTENT,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      ledgerOnly,
      sidecarOnly,
      fieldConflicts,
      findings: [finding(HANDOFF_CODE.SIDECAR_ONLY_CONTENT, sidecarOnly[0], `sidecar rows are absent from the ledger: ${sidecarOnly.join(', ')}`)],
    });
  }
  if (fieldConflicts.length > 0) {
    return report({
      className: HANDOFF_CLASS.FIELD_CONFLICT,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      ledgerOnly,
      sidecarOnly,
      fieldConflicts,
      findings: fieldConflicts.map((entry) => finding(HANDOFF_CODE.FIELD_CONFLICT, entry.formulaId, entry.message, { field: entry.field })),
    });
  }
  if (sections.unresolved.length > 0) {
    return report({
      className: HANDOFF_CLASS.SECTION_UNRESOLVED,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      ledgerOnly,
      sidecarOnly,
      findings: sections.unresolved.map((formulaId) => finding(HANDOFF_CODE.SECTION_UNRESOLVED, formulaId, 'the recorded section matches no RFC heading')),
    });
  }
  if (sections.ambiguous.length > 0) {
    return report({
      className: HANDOFF_CLASS.SECTION_AMBIGUOUS,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      ledgerOnly,
      sidecarOnly,
      findings: sections.ambiguous.map((entry) => finding(
        HANDOFF_CODE.SECTION_AMBIGUOUS,
        entry.formulaId,
        `the recorded section matches ${entry.candidates.map((candidate) => candidate.title).join(', ')}`,
        { candidates: entry.candidates },
      )),
    });
  }
  if (sidecar === null) {
    return report({
      className: HANDOFF_CLASS.MISSING_SIDECAR,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      findings: [finding(HANDOFF_CODE.MISSING_FORMULA_SIDECAR, null, 'the ledger is valid and no RFC-FORMULAS.json exists')],
    });
  }
  if (ledgerOnly.length > 0) {
    return report({
      className: HANDOFF_CLASS.STALE_MIRROR,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      ledgerOnly,
      findings: [finding(HANDOFF_CODE.STALE_SIDECAR, ledgerOnly[0], `the sidecar lacks ledger rows: ${ledgerOnly.join(', ')}`)],
    });
  }
  if (sidecarFindings.length > 0) {
    return report({
      className: HANDOFF_CLASS.STALE_MIRROR,
      ok: false,
      ownership,
      ledger,
      sidecar,
      rfcText,
      sections,
      fieldConflicts,
      findings: sidecarFindings.map((entry) => finding(
        HANDOFF_CODE.STALE_SIDECAR,
        entry.formulaId ?? entry.field ?? null,
        entry.message,
      )),
    });
  }
  return report({ className: HANDOFF_CLASS.CURRENT, ok: true, ownership, ledger, sidecar, rfcText, sections });
}

/** Write a file by staging it beside the target and renaming it into place. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function writeAtomically(targetPath, contents) {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const staged = `${targetPath}.partial.${process.pid}`;
  writeFileSync(staged, contents, 'utf8');
  renameSync(staged, targetPath);
}

/** One sidecar row derived from a ledger row, preserving an AI-authored section. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function sidecarRowFromLedger({ row, formula, existing, resolvedSection }) {
  const section = resolvedSection?.title
    ?? existing?.rfcLocation?.section
    ?? rowSection(row);
  const implementation = {
    ...row.implementation,
    rfcSection: existing?.implementation?.rfcSection ?? section,
  };
  return {
    id: row.id,
    digest: row.digest,
    body: row.body,
    display: formula?.display ?? true,
    normalized: formula?.normalized ?? normalizeFormula(row.body),
    specLocation: row.specLocation,
    rfcLocation: {
      section,
      lineStart: row.rfcLocation?.lineStart ?? 0,
      lineEnd: row.rfcLocation?.lineEnd ?? 0,
    },
    theory: row.theory,
    implementation,
    tests: row.tests,
  };
}

/** The spec formulas keyed by id, so display and normalized are derived, not guessed. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function specFormulaById(specText) {
  return new Map(uniqueFormulas(extractFormulas(specText)).map((formula) => [formula.id, formula]));
}

/**
 * Apply a mechanical mirror or an AI-chosen section.
 *
 * @param {{ targetPath: string, report: object, mode: 'mirror-ledger'|'apply-sections', chosenSections?: Record<string,string>, seedText: string, specText: string, rfcText?: string }} input
 * @returns {{ ok: boolean, written: boolean, targetPath: string, writtenRowCount: number, findings: Array<object> }}
 */
export function applyFormulaHandoff(input) {
  const { targetPath, report: handoff, mode, chosenSections = null, seedText, specText, rfcText = '' } = input;
  if (handoff === null || handoff === undefined) {
    return { ok: false, written: false, targetPath, writtenRowCount: 0, findings: [finding(HANDOFF_CODE.JUDGMENT_REQUIRED, null, 'no handoff report was supplied')] };
  }
  if (!MECHANICAL_CLASSES.has(handoff.class) && mode !== 'apply-sections') {
    return { ok: false, written: false, targetPath, writtenRowCount: 0, findings: handoff.findings ?? [] };
  }
  if (handoff.class === HANDOFF_CLASS.CURRENT) {
    return { ok: true, written: false, targetPath, writtenRowCount: 0, findings: [] };
  }

  if (mode === 'apply-sections') {
    return applyChosenSections({ targetPath, handoff, chosenSections, rfcText: rfcText || handoff.rfcText });
  }
  if (mode !== 'mirror-ledger') {
    return { ok: false, written: false, targetPath, writtenRowCount: 0, findings: handoff.findings ?? [] };
  }

  const ledger = handoff.ledger;
  const formulas = specFormulaById(specText);
  const existingById = new Map((handoff.sidecar?.formulas ?? []).map((row) => [row.id, row]));
  const rows = (ledger?.rows ?? []).map((row) => sidecarRowFromLedger({
    row,
    formula: formulas.get(row.id),
    existing: existingById.get(row.id),
    resolvedSection: handoff.sections.resolved[row.id] ?? null,
  }));
  const sidecar = buildSidecar({
    specPath: parseSeedIdentity(seedText).sourceSpec.path,
    rfcPath: 'RFC.md',
    specDigest: ledger.specDigest,
    rfcDigest: ledger.rfcDigest,
    rows,
  });
  const parityFindings = validateFormulaSidecar(sidecar, ledger);
  if (parityFindings.length > 0) {
    return {
      ok: false,
      written: false,
      targetPath,
      writtenRowCount: 0,
      findings: parityFindings.map((entry) => finding(HANDOFF_CODE.LEDGER_INVALID, entry.formulaId ?? entry.field ?? null, entry.message)),
    };
  }
  writeAtomically(targetPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  return { ok: true, written: true, targetPath, writtenRowCount: rows.length, findings: [] };
}

/** Apply the AI's chosen sections without changing formula content. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function applyChosenSections({ targetPath, handoff, chosenSections, rfcText }) {
  if (chosenSections === null || typeof chosenSections !== 'object' || Object.keys(chosenSections).length === 0) {
    return { ok: false, written: false, targetPath, writtenRowCount: 0, findings: [finding(HANDOFF_CODE.JUDGMENT_REQUIRED, null, 'apply-sections needs at least one chosen section')] };
  }
  if (!existsSync(targetPath)) {
    return { ok: false, written: false, targetPath, writtenRowCount: 0, findings: [finding(HANDOFF_CODE.MISSING_FORMULA_SIDECAR, targetPath, 'the sidecar to update is missing')] };
  }
  const headings = buildHeadingIndex(rfcText);
  const sidecar = JSON.parse(readFileSync(targetPath, 'utf8'));
  const findings = [];
  let writtenRowCount = 0;
  for (const row of sidecar.formulas ?? []) {
    const chosen = chosenSections[row.id];
    if (typeof chosen !== 'string' || chosen.length === 0) continue;
    const resolution = resolveSectionHeading({ section: chosen, headings });
    if (resolution.heading === null) {
      findings.push(finding(
        resolution.candidates.length > 1 ? HANDOFF_CODE.SECTION_AMBIGUOUS : HANDOFF_CODE.SECTION_UNRESOLVED,
        row.id,
        resolution.candidates.length > 1
          ? `the chosen section matches ${resolution.candidates.map((candidate) => candidate.title).join(', ')}`
          : `the chosen section matches no heading: ${chosen}`,
        { candidates: resolution.candidates },
      ));
      continue;
    }
    row.rfcLocation = { ...(row.rfcLocation ?? {}), section: resolution.heading.title };
    if (row.implementation !== null && typeof row.implementation === 'object') {
      row.implementation = { ...row.implementation, rfcSection: resolution.heading.title };
    }
    writtenRowCount += 1;
    findings.push(finding(HANDOFF_CODE.SECTION_RESOLVED, row.id, `resolved to ${resolution.heading.title}`));
  }
  if (findings.some((entry) => entry.code !== HANDOFF_CODE.SECTION_RESOLVED)) {
    return { ok: false, written: false, targetPath, writtenRowCount: 0, findings };
  }
  if (writtenRowCount === 0) {
    return { ok: false, written: false, targetPath, writtenRowCount: 0, findings: [finding(HANDOFF_CODE.JUDGMENT_REQUIRED, null, 'no chosen section names a formula in the sidecar')] };
  }
  const parityFindings = handoff.ledger === null ? [] : validateFormulaSidecar(sidecar, handoff.ledger);
  if (parityFindings.length > 0) {
    return {
      ok: false,
      written: false,
      targetPath,
      writtenRowCount: 0,
      findings: parityFindings.map((entry) => finding(HANDOFF_CODE.LEDGER_INVALID, entry.formulaId ?? entry.field ?? null, entry.message)),
    };
  }
  writeAtomically(targetPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  return { ok: true, written: true, targetPath, writtenRowCount, findings };
}
