/**
 * residue-coverage.mjs — read RESIDUE records and match them to tickets.
 *
 * The drill reads README as material. This module adds the machine view without
 * changing that contract: a stable residue id comes from the invisible comment
 * crystalize writes, and a ticket may record the ids it implements in
 * `residueIds[]`. Anything unmatched is reported as advisory; the drill must
 * still be able to evolve one package while residue remains.
 */

/** The two usage/examples residue markers. */
export const README_RESIDUE_MARKER = '<::README-RESIDUE::>';
export const EXAMPLES_RESIDUE_MARKER = '<::EXAMPLES-RESIDUE::>';

/** The invisible comment that links a README residue to its stable id. */
const RESIDUE_COMMENT = /<!--\s*crystalize-residue:\s*id=(RSD-[0-9a-f]{12})\s+level=(\S+)\s+layer=(\S+)\s+element=(\S+)\s*-->/;

/** The advisory finding codes. */
export const RESIDUE_UNCOVERED = 'RESIDUE_UNCOVERED';
export const RESIDUE_UNSTRUCTURED = 'RESIDUE_UNSTRUCTURED';

/** The section boundary used by the README markers. */
const HEADING = /^(#+)\s+(\S.*)$/;

/**
 * Split Markdown into heading-led sections, keeping the body lines.
 *
 * @param {string} text
 * @returns {Array<{heading: string, body: string}>}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function splitSections(text) {
  const sections = [];
  let current = null;
  for (const line of String(text || '').split('\n')) {
    const match = line.match(HEADING);
    if (match) {
      if (current !== null) sections.push(current);
      current = { heading: match[2], body: [] };
    } else if (current !== null) {
      current.body.push(line);
    }
  }
  if (current !== null) sections.push(current);
  return sections.map((section) => ({ heading: section.heading, body: section.body.join('\n') }));
}

/**
 * Read every RESIDUE record from one README.
 *
 * @param {string} text — README markdown
 * @param {'package'|'workspace'} source
 * @returns {Array<{id: string|null, section: string, level: string, layer: string,
 *   element: string, structured: boolean, source: string}>}
 */
export function parseResidueRecords(text, source) {
  const records = [];
  const seen = new Set();
  for (const section of splitSections(text)) {
    if (!section.body.includes(README_RESIDUE_MARKER)
      && !section.body.includes(EXAMPLES_RESIDUE_MARKER)) continue;
    const comment = section.body.match(RESIDUE_COMMENT);
    const record = comment
      ? {
        id: comment[1],
        section: section.heading,
        level: comment[2],
        layer: comment[3],
        element: comment[4],
        structured: true,
        source,
      }
      : {
        id: null,
        section: section.heading,
        level: '',
        layer: '',
        element: '',
        structured: false,
        source,
      };
    const key = record.id === null ? `${source}:${record.section}` : record.id;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(record);
  }
  return records;
}

/** The ticket key as the rest of the pipeline writes it. */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function ticketKey(ticket) {
  if (typeof ticket.id === 'string') return ticket.id;
  if (ticket.phaseId === -1) return `PX-${ticket.id}`;
  return `P${ticket.phaseId}-${ticket.id}`;
}

/**
 * Map each residue id to the tickets that name it in `residueIds[]`.
 *
 * @param {object|null} tickets — Tickets.json content
 * @returns {Map<string, string[]>}
 */
export function ticketResidueIds(tickets) {
  const mapping = new Map();
  const phases = tickets && Array.isArray(tickets.phases) ? tickets.phases : [];
  for (const phase of phases) {
    for (const ticket of phase.tickets || []) {
      const ids = Array.isArray(ticket.residueIds) ? ticket.residueIds : [];
      for (const id of ids) {
        const key = ticketKey(ticket);
        const list = mapping.get(id) || [];
        if (!list.includes(key)) list.push(key);
        mapping.set(id, list);
      }
    }
  }
  return mapping;
}

/**
 * Evaluate residue coverage across the package and workspace READMEs.
 *
 * The gate mirrors the other P2 gates: a non-zero exit code records residue and
 * never blocks this package's COMPLETE. A missing README yields an inert gate.
 *
 * @param {{readmeText?: string, workspaceReadmeText?: string, tickets?: object|null}} input
 * @returns {{records: Array<object>, covered: Array<{id: string, ticketIds: string[]}>,
 *   uncovered: string[], unstructured: string[], gate: object, findings: Array<object>}}
 */
export function evaluateResidueCoverage({
  readmeText = '',
  workspaceReadmeText = '',
  tickets = null,
} = {}) {
  const records = [
    ...parseResidueRecords(readmeText, 'package'),
    ...parseResidueRecords(workspaceReadmeText, 'workspace'),
  ];
  const mapping = ticketResidueIds(tickets);
  const covered = [];
  const uncovered = [];
  const unstructured = [];
  const findings = [];

  for (const record of records) {
    if (!record.structured) {
      unstructured.push(record.section);
      findings.push({
        code: RESIDUE_UNSTRUCTURED,
        layer: 'semantic',
        message: `residue section "${record.section}" (${record.source}) has no crystalize-residue id comment`,
      });
      continue;
    }
    const ticketIds = mapping.get(record.id) || [];
    if (ticketIds.length > 0) {
      covered.push({ id: record.id, ticketIds });
      continue;
    }
    uncovered.push(record.id);
    findings.push({
      code: RESIDUE_UNCOVERED,
      layer: record.layer || 'drill',
      message: `residue ${record.id} in "${record.section}" (${record.source}) has no ticket residueIds entry`,
    });
  }

  const residual = uncovered.length + unstructured.length;
  return {
    records,
    covered,
    uncovered,
    unstructured,
    gate: {
      name: 'residue-coverage',
      exitCode: residual > 0 ? 1 : 0,
      status: residual > 0 ? 'failed' : 'passed',
      detail: `${records.length} residue(s), ${covered.length} covered, ${uncovered.length} uncovered, ${unstructured.length} unstructured`,
    },
    findings,
  };
}
