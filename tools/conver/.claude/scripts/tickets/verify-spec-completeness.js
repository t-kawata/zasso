#!/usr/bin/env node
'use strict';

/**
 * verify-spec-completeness.js — the spec export omits no field and no section.
 *
 * A field that the renderer silently drops is invisible to every later reader.
 * The gate renders the spec with the same function the exporter uses and checks
 * that each non-empty ticket field has its section and that the required
 * sections exist.
 *
 * Report only: prints one finding envelope and exits zero.
 */

const path = require('node:path');
const {
  buildTicketMarkdown,
  titleCaseField,
} = require('./show-ticket-context.js');
const {
  gateFinding,
  gateRerun,
  emitGateReport,
  loadTicketDocument,
  findTicketByKey,
  argumentValue,
  resolveArgumentPath,
  emitTicketNotFound,
  emitInputMissing,
  rendererRoute,
} = require('./lib/gate-report.js');

const GATE = 'verify-spec-completeness';

/** Ticket metadata the renderer shows in the title block, not as a section. */
const INTERNAL_FIELDS = Object.freeze(['id', 'phaseId', 'status', 'title', 'specPath']);

/** Fields whose absence is legitimate: the graph may be unavailable. */
const OPTIONAL_FIELDS = Object.freeze(['nodeIds']);

/** The existing section each standard field renders under. */
const SPEC_FIELD_HEADINGS = Object.freeze({
  referenceSection: '## RFC Reference',
  background: '## Background',
  scope: '## Scope',
  default_files: '## Implementation Target Files',
  sourcePaths: '## Source Paths',
  targetStubs: '## STUBs',
  targetCrimes: '## Crimes',
  foundOmissions: '## Omissions',
  investigation: '## Investigation',
  acceptanceCriteria: '## Acceptance Criteria',
  invariants: '## Invariants',
  contracts: '## Contracts',
  boyScoutPlan: '## Boy Scout Rule',
  testUnit: '## Test Plan',
  testIntegration: '## Test Plan',
  testExceptions: '## Test Plan',
  planTestCode: '## Test Plan',
  relatedTicketIds: '## Related Tickets',
  changes: '## Changes',
  referenceUrls: '## Reference URLs',
  rfcDiscrepancies: '## RFC Discrepancies',
  notes: '## Notes',
  distribution: '## Distribution Obligations',
  formulaObligations: '## Formula Obligations',
  prerequisites: '## Implementation Prerequisites',
  condensedFrom: '## Condensed From',
});

/** Sections every spec must carry. */
const REQUIRED_SPEC_SECTIONS = Object.freeze(['## Test Plan']);

/** Whether a value carries information. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * Find every field or section the spec text omitted.
 *
 * @param {object} ticket
 * @param {string} specText
 * @param {string} ticketKey
 * @returns {object[]} — frozen findings
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function findSpecGaps(ticket, specText, ticketKey) {
  const rerun = gateRerun(GATE, ticketKey, 'Tickets.json');
  const findings = [];

  for (const [field, value] of Object.entries(ticket || {})) {
    if (INTERNAL_FIELDS.includes(field) || OPTIONAL_FIELDS.includes(field)) continue;
    if (!hasValue(value) || value === 'verified_empty') continue;

    const heading = SPEC_FIELD_HEADINGS[field] ?? '### ' + titleCaseField(field);
    if (specText.includes(heading)) continue;

    const asset = ticketKey + '/' + field;
    findings.push(gateFinding({
      code: 'SPEC_FIELD_MISSING',
      asset,
      problem: 'the spec export omits field "' + field + '" (expected heading "' + heading + '")',
      rerun,
      fix: rendererRoute({
        field,
        section: heading,
        asset,
        instruction: 'Render the field in show-ticket-context.js so the spec export cannot hide it',
      }),
    }));
  }

  for (const section of REQUIRED_SPEC_SECTIONS) {
    if (specText.includes(section)) continue;
    findings.push(gateFinding({
      code: 'SPEC_SECTION_MISSING',
      asset: ticketKey + '/' + section.replace(/^## /, ''),
      problem: 'the spec export omits the required section "' + section + '"',
      rerun,
      fix: rendererRoute({
        field: null,
        section,
        asset: ticketKey + '/' + section,
        instruction: 'Restore the required section in show-ticket-context.js',
      }),
    }));
  }

  return findings;
}

// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const ticketKey = argumentValue(args, 'ticket-key');
  const ticketsPath = resolveArgumentPath(args, 'tickets');
  if (!ticketKey || !ticketsPath) {
    emitInputMissing(GATE, ticketKey, ticketsPath);
    process.exit(0);
  }

  const document = loadTicketDocument(ticketsPath);
  const ticket = findTicketByKey(document, ticketKey);
  if (!ticket) {
    emitTicketNotFound(GATE, ticketKey, ticketsPath);
    process.exit(0);
  }

  const specText = buildTicketMarkdown(
    ticketKey,
    ticket,
    document,
    path.dirname(ticketsPath),
    true,
    false,
    { view: null, ticketsDocument: document, registry: [] },
  );

  emitGateReport({
    gate: GATE,
    ticketKey,
    findings: findSpecGaps(ticket, specText, ticketKey),
  });
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  GATE,
  INTERNAL_FIELDS,
  OPTIONAL_FIELDS,
  SPEC_FIELD_HEADINGS,
  REQUIRED_SPEC_SECTIONS,
  findSpecGaps,
};
