#!/usr/bin/env node

/**
 * verify-make-distribution.js — the /make-ticket delivery gate for a distributed ticket.
 *
 * The producer side proves every sequence, operation and boundary contract reached the
 * ticket. This gate proves the ticket design used them: every implement unit is in the test
 * plan, every local step contract and ctr boundary contract is in `ticket.contracts`, and a
 * reference unit names the ticket or package it consumes.
 *
 * The gate is conditional. A ticket with no `distribution.units` — Case B, or a ticket
 * written before the distribution existed — is a skip, never a failure.
 *
 * Usage:
 *   node verify-make-distribution.js --ticket-key=<key> [--tickets=<path>] [--spec=<path>]
 */

const fs = require('fs');
const path = require('path');

const { parseTicketKey } = require('../lib/validate-tickets');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

/** The named findings this gate reports. */
const DELIVERY_CODES = Object.freeze({
  DISTRIBUTION_UNIT_UNTESTED: 'DISTRIBUTION_UNIT_UNTESTED',
  STEP_CONTRACT_NOT_DELIVERED: 'STEP_CONTRACT_NOT_DELIVERED',
  BOUNDARY_CONTRACT_NOT_DELIVERED: 'BOUNDARY_CONTRACT_NOT_DELIVERED',
  SHARED_WORK_UNDECLARED: 'SHARED_WORK_UNDECLARED',
  DISTRIBUTION_SECTION_MISSING: 'DISTRIBUTION_SECTION_MISSING',
  DISTRIBUTION_SPEC_MISSING: 'DISTRIBUTION_SPEC_MISSING',
  WORK_SHARE_SECTION_MISSING: 'WORK_SHARE_SECTION_MISSING',
});

/** Parse `--name=value` or `--name value`. */// [::TICKET::] PX-324 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-324 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** Every ticket in a Tickets.json document, in phase order. */// [::TICKET::] PX-324 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-324 --for-spec --no-implementation-order`.
function flattenTickets(document) {
  return (document?.phases ?? []).flatMap((phase) => (phase?.tickets ?? []).map((ticket) => ({
    ...ticket,
    phaseId: ticket.phaseId ?? phase.id,
  })));
}

/** The ticket a key names, or null. */// [::TICKET::] PX-324 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-324 --for-spec --no-implementation-order`.
function findTicket(document, key) {
  const parsed = parseTicketKey(key);
  if (parsed === null) return null;
  return flattenTickets(document).find((ticket) => ticket.phaseId === parsed.phaseId && ticket.id === parsed.ticketId) ?? null;
}

/** Whether a step contract carries every axis the artifact declared. */// [::TICKET::] PX-324 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-324 --for-spec --no-implementation-order`.
function stepContractIsDelivered(step, contract) {
  if (contract === undefined) return false;
  const required = [
    ['pre', 'precondition'],
    ['post', 'postcondition'],
    ['invariants', 'invariant'],
  ];
  return required.every(([source, target]) => {
    const declared = Array.isArray(step?.contract?.[source]) ? step.contract[source].length > 0 : false;
    return !declared || (typeof contract[target] === 'string' && contract[target].trim().length > 0);
  });
}

/** Whether a ctr unit's registry projection is present. */// [::TICKET::] PX-324 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-324 --for-spec --no-implementation-order`.
function boundaryContractIsDelivered(unit, ticket) {
  const boundaryId = String(unit?.unitId ?? '').replace(/^ctr-/, '');
  return (Array.isArray(ticket?.contracts) ? ticket.contracts : []).some((contract) => contract?.boundaryId === boundaryId
    || contract?.registryContractId === `contract-${boundaryId}`
    || contract?.id === `contract-${boundaryId}`);
}

/**
 * Evaluate the delivery gate without writing to the process streams.
 *
 * @returns {{ ok: boolean, skipped?: string, findings: Array<object> }}
 */
// [::TICKET::] PX-324, PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-324|PX-325) --for-spec --no-implementation-order`.
function evaluateDistributionDelivery(ticket, { specText = null, specProvided = false } = {}) {
  const units = Array.isArray(ticket?.distribution?.units) ? ticket.distribution.units : [];
  if (units.length === 0) return { ok: true, skipped: 'no-distribution', findings: [] };

  const findings = [];
  const testText = [...(ticket.testUnit ?? []), ...(ticket.testIntegration ?? [])].join(' ');
  const notesText = typeof ticket.notes === 'string' ? ticket.notes : '';

  for (const unit of units) {
    const unitId = String(unit?.unitId ?? '');
    if (unit?.kind === 'operation' && unit?.obligation?.mode === 'implement') {
      const operationId = unit.operationId ?? unitId.replace(/^op-/, '');
      const named = [unitId, `op-${operationId}`, operationId].some((term) => term.length > 0 && testText.includes(term));
      if (!named) {
        findings.push({ code: DELIVERY_CODES.DISTRIBUTION_UNIT_UNTESTED, subject: unitId, message: `implement unit ${unitId} is in no test plan entry` });
      }
    }
    if (unit?.kind === 'sequence' || unit?.kind === 'cross-boundary-sequence' || unitId.startsWith('seq-') || unitId.startsWith('xdir-')) {
      for (const step of Array.isArray(unit?.obligation?.steps) ? unit.obligation.steps : []) {
        const contract = (Array.isArray(ticket.contracts) ? ticket.contracts : []).find((candidate) => candidate?.stepId === step.stepId);
        if (!stepContractIsDelivered(step, contract)) {
          findings.push({ code: DELIVERY_CODES.STEP_CONTRACT_NOT_DELIVERED, subject: step.stepId, message: `step ${step.stepId} is carried by the ticket and its contract is not in ticket.contracts` });
        }
      }
    }
    if (unitId.startsWith('ctr-')) {
      if (!boundaryContractIsDelivered(unit, ticket)) {
        findings.push({ code: DELIVERY_CODES.BOUNDARY_CONTRACT_NOT_DELIVERED, subject: unitId, message: `${unitId} is carried by the ticket and its registry projection is not in ticket.contracts` });
      }
    }
    if (unit?.obligation?.mode === 'reference') {
      const providerTerms = [
        unit.obligation.implementerTicketId,
        ...(Array.isArray(unit.obligation.providers) ? unit.obligation.providers : []),
      ].filter((value) => typeof value === 'string' && value.length > 0);
      const declared = providerTerms.some((term) => testText.includes(term) || notesText.includes(term));
      if (!declared && providerTerms.length > 0) {
        findings.push({ code: DELIVERY_CODES.SHARED_WORK_UNDECLARED, subject: unitId, message: `reference unit ${unitId} names ${providerTerms.join(', ')} and no test plan or note names it` });
      }
    }
  }

  if (specProvided && specText === null) {
    findings.push({ code: DELIVERY_CODES.DISTRIBUTION_SPEC_MISSING, subject: null, message: 'the spec file passed to the delivery gate does not exist' });
  }
  if (specText !== null) {
    if (!specText.includes('## Distribution Obligations')) {
      findings.push({ code: DELIVERY_CODES.DISTRIBUTION_SECTION_MISSING, subject: null, message: 'the spec has no ## Distribution Obligations section' });
    }
    // Work Share is the block for sequence and ctr units. An operation-only ticket has
    // no shared step owner or boundary to report, so requiring the block would reject a
    // correct spec for that shape.
    const requiresWorkShare = units.some((unit) => {
      const unitId = String(unit?.unitId ?? '');
      return unit?.kind === 'sequence'
        || unit?.kind === 'cross-boundary-sequence'
        || unitId.startsWith('seq-')
        || unitId.startsWith('xdir-')
        || unitId.startsWith('ctr-');
    });
    if (requiresWorkShare && !specText.includes('### Work Share')) {
      findings.push({ code: DELIVERY_CODES.WORK_SHARE_SECTION_MISSING, subject: null, message: 'the spec has no ### Work Share section' });
    }
  }
  return { ok: findings.length === 0, findings };
}

// [::TICKET::] PX-324, PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-324|PX-325) --for-spec --no-implementation-order`.
function run(argv = process.argv.slice(2)) {
  const ticketKey = argumentFor(argv, 'ticket-key');
  if (ticketKey === null) {
    return { code: EXIT_FAILURE, verdict: { ok: false, findings: [] }, findings: [{ code: 'MISSING_TICKET_KEY', subject: null, message: '--ticket-key=<key> is required' }] };
  }
  const ticketsPath = argumentFor(argv, 'tickets') ?? 'Tickets.json';
  if (!fs.existsSync(ticketsPath)) {
    return { code: EXIT_FAILURE, verdict: { ok: false, findings: [] }, findings: [{ code: 'MISSING_TICKETS', subject: ticketsPath, message: 'Tickets.json is not readable' }] };
  }
  const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const ticket = findTicket(document, ticketKey);
  if (ticket === null) {
    return { code: EXIT_OK, verdict: { ok: true, skipped: 'ticket-not-found', findings: [] }, findings: [] };
  }
  const specPath = argumentFor(argv, 'spec');
  const specText = specPath !== null && fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : null;
  const result = evaluateDistributionDelivery(ticket, { specText, specProvided: specPath !== null });
  return { code: result.ok ? EXIT_OK : EXIT_FAILURE, verdict: result, findings: result.findings ?? [] };
}

/** The CLI entry point. */// [::TICKET::] PX-324 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-324 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const result = run(argv);
  for (const finding of result.findings) {
    console.error(`${finding.code}: ${finding.subject ?? ''} ${finding.message}`);
  }
  process.stdout.write(`${JSON.stringify(result.verdict)}\n`);
  return result.code;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  DELIVERY_CODES,
  argumentFor,
  boundaryContractIsDelivered,
  evaluateDistributionDelivery,
  findTicket,
  flattenTickets,
  main,
  run,
  stepContractIsDelivered,
};
