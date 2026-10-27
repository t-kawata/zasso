#!/usr/bin/env node

/**
 * show-ticket-distribution.js — Read the split's distribution records as Markdown
 *
 * The split gate proves every unit reached a ticket; this prints what each ticket owes so
 * a reader can inspect the sequence step, the operation and the spec line without opening
 * the raw Tickets.json. Read-only.
 *
 * Usage:
 *   node show-ticket-distribution.js <path to Tickets.json>
 *
 * Exit codes:
 *   0 — every ticket carries a distribution record, or the graph carries no unit
 *   1 — the graph carries units and a ticket has no distribution record
 */

const fs = require('fs');
const path = require('path');

const { deriveGraphPathFromTickets } = require('../lib/package-artifacts');
const { writeLine } = require('../lib/cli-output');
const {
  OPERATION_OBLIGATION_FIELDS,
  EXTRA_CONTRACT_AXES,
  renderObligationValue,
  renderFactText,
  renderContractAxis,
} = require('./show-ticket-context.js');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * The phase label a ticket key uses (`PX` for the independent phase).
 *
 * @param {number} phaseId
 * @returns {string}
 */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function phaseLabel(phaseId) {
  return phaseId === -1 ? 'PX' : 'P' + phaseId;
}

/**
 * Every ticket's distribution record, in phase and ticket order.
 *
 * @param {object} ticketsData — parsed Tickets.json
 * @returns {Array<{ ticketKey: string, ticketId: number, title: string, distribution: object|null }>}
 */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function collectTicketDistribution(ticketsData) {
  const records = [];
  for (const phase of ticketsData?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      records.push({
        ticketKey: `${phaseLabel(ticket.phaseId ?? phase.id)}-${ticket.id}`,
        ticketId: ticket.id,
        title: ticket.title ?? '(untitled)',
        distribution: ticket.distribution ?? null,
      });
    }
  }
  return records;
}

/**
 * The units the graph carries.
 *
 * @param {{ nodes?: Array<object> }|null} graph
 * @returns {Set<string>}
 */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function graphUnitIds(graph) {
  return new Set((graph?.nodes ?? []).flatMap((node) => node.unitIds ?? []));
}

/**
 * The tickets that owe a distribution record and carry none.
 *
 * A package with no graph units predates the chain, so it has nothing to distribute and
 * does not fail.
 *
 * @param {object} ticketsData
 * @param {{ nodes?: Array<object> }|null} graph
 * @returns {Array<{ code: string, unitId: string, layer: string, message: string }>}
 */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function findDistributionGaps(ticketsData, graph) {
  const units = graphUnitIds(graph);
  if (units.size === 0) return [];
  const findings = [];
  for (const record of collectTicketDistribution(ticketsData)) {
    if (record.distribution !== null) continue;
    findings.push({
      code: 'MISSING_UNIT_AT_LAYER',
      unitId: [...units][0],
      layer: 'ticket',
      message: `ticket ${record.ticketKey} carries no distribution record while the graph carries ${units.size} unit(s)`,
    });
  }
  return findings;
}

/** One line per spec reference. */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function renderSpecRef(ref) {
  return `  - ${ref.path}:${ref.line}${ref.quote ? ` "${ref.quote}"` : ''}`;
}

/** One sequence step, with its operation-boundary contract. */
// [::TICKET::] PX-308, PX-318, PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-308|PX-318|PX-322) --for-spec --no-implementation-order`.
function renderStep(step) {
  const location = typeof step.line === 'number' && step.line > 0 ? ` line ${step.line}` : '';
  const statement = ['subject', 'predicate', 'object']
    .map((field) => (step[field] ? `${field}=${step[field]}` : null))
    .filter(Boolean)
    .join(', ');
  const statementText = statement.length > 0 ? ` [${statement}]` : '';
  const lines = [`  - ${step.stepId} (op-${step.operationId}, order ${step.order ?? 0})${location}${step.quote ? ` "${step.quote}"` : ''}${statementText}`];
  const precondition = renderFactText(step.contract?.pre);
  const postcondition = renderFactText(step.contract?.post);
  const invariant = renderFactText(step.contract?.invariants);
  if (precondition) lines.push(`    - precondition: ${precondition}`);
  if (postcondition) lines.push(`    - postcondition: ${postcondition}`);
  if (invariant) lines.push(`    - invariant: ${invariant}`);
  for (const axis of EXTRA_CONTRACT_AXES) {
    const rendered = renderContractAxis(step.contract, axis);
    if (rendered !== null) lines.push(`    - ${rendered}`);
  }
  if (typeof step.contractProse === 'string' && step.contractProse.length > 0) {
    lines.push(`    - contractProse: ${step.contractProse}`);
  }
  return lines.join('\n');
}

/**
 * One unit's section.
 *
 * @param {object} unit
 * @returns {string[]}
 */
// [::TICKET::] PX-308, PX-321, PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-308|PX-321|PX-322) --for-spec --no-implementation-order`.
function renderUnit(unit) {
  const lines = [];
  const surface = unit.surface ? `, surface: ${unit.surface}` : '';
  lines.push(`### ${unit.unitId} — ${unit.kind ?? 'unit'} (${unit.role ?? 'role undeclared'}${surface})`);
  lines.push('');
  const placement = unit.placement ?? {};
  lines.push(`- placement: ${(placement.nodeIds ?? []).join(', ') || '(none)'} -> ${(placement.paths ?? []).join(', ') || '(none)'}`);
  lines.push(`- obligation: ${unit.obligation?.mode ?? 'unknown'}`);
  if (unit.obligation?.outcome !== undefined && unit.obligation?.outcome !== null) {
    lines.push(`- outcome: ${unit.obligation.outcome}`);
  }
  if (unit.obligation?.mode === 'reference') {
    const providers = renderObligationValue(unit.obligation.providers);
    if (providers !== null) lines.push(`- providers: ${providers}`);
    const implementer = renderObligationValue(unit.obligation.implementerTicketId);
    if (implementer !== null) lines.push(`- implementer ticket: ${implementer}`);
  }
  if (unit.obligation?.mode === 'implement') {
    for (const field of OPERATION_OBLIGATION_FIELDS) {
      const rendered = renderObligationValue(unit.obligation[field]);
      if (rendered !== null) lines.push(`- ${field}: ${rendered}`);
    }
  }
  if (unit.obligation?.mode === 'obligation') {
    for (const field of ['relation', 'subject', 'direction', 'counterpart']) {
      const rendered = renderObligationValue(unit.obligation[field]);
      if (rendered !== null) lines.push(`- ${field}: ${rendered}`);
    }
    const coverage = unit.obligation.coverage;
    if (coverage !== null && typeof coverage === 'object') {
      for (const field of ['column', 'operationSet', 'carried', 'total', 'uncoveredSpellings']) {
        const rendered = renderObligationValue(coverage[field]);
        if (rendered !== null) lines.push(`- coverage.${field}: ${rendered}`);
      }
    }
  }
  if (Array.isArray(unit.obligation?.steps) && unit.obligation.steps.length > 0) {
    lines.push('- sequence steps:');
    for (const step of unit.obligation.steps) lines.push(renderStep(step));
  }
  if (Array.isArray(unit.specRefs) && unit.specRefs.length > 0) {
    lines.push('- spec references:');
    for (const ref of unit.specRefs) lines.push(renderSpecRef(ref));
  }
  lines.push('');
  return lines;
}

/**
 * The whole report.
 *
 * @param {Array<object>} records — output of collectTicketDistribution
 * @returns {string}
 */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function renderTicketDistribution(records) {
  const lines = ['# Ticket Distribution', '', `${records.length} ticket(s).`, ''];
  for (const record of records) {
    lines.push(`## ${record.ticketKey}: ${record.title}`);
    lines.push('');
    if (record.distribution === null) {
      lines.push('No distribution record.');
      lines.push('');
      continue;
    }
    const units = record.distribution.units ?? [];
    lines.push(`- distribution digest: ${record.distribution.digest ?? '(none)'}`);
    lines.push(`- units: ${units.length}`);
    lines.push('');
    for (const unit of units) lines.push(...renderUnit(unit));
  }
  return lines.join('\n');
}

/** Entry point. */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function main() {
  const ticketsPath = process.argv[2];
  if (!ticketsPath) {
    process.stderr.write('Usage: node show-ticket-distribution.js <path to Tickets.json>\n');
    process.exit(EXIT_FAILURE);
  }

  const resolvedPath = path.resolve(ticketsPath);
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    process.stderr.write(`Tickets.json read failed: ${error.message}\n`);
    process.exit(EXIT_FAILURE);
  }

  const graphPath = deriveGraphPathFromTickets(resolvedPath);
  let graph = null;
  if (graphPath !== null && fs.existsSync(graphPath)) {
    try {
      graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    } catch (error) {
      process.stderr.write(`GRAPH.json read failed: ${error.message}\n`);
      process.exit(EXIT_FAILURE);
    }
  }

  writeLine(renderTicketDistribution(collectTicketDistribution(ticketsData)));

  const gaps = findDistributionGaps(ticketsData, graph);
  if (gaps.length === 0) {
    process.exit(EXIT_SUCCESS);
  }
  for (const gap of gaps) process.stderr.write(`${gap.code}: ${gap.message}\n`);
  process.exit(EXIT_FAILURE);
}

if (require.main === module) main();

module.exports = {
  collectTicketDistribution,
  findDistributionGaps,
  renderTicketDistribution,
  graphUnitIds,
  phaseLabel,
};
