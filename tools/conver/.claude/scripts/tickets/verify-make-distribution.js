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
const {
  CONTRACT_AXES,
  CONTRACT_BEARING_OPERATION_FIELDS,
  SURFACE_OPERATION_FIELDS,
  factTexts,
  hasObligationValue,
} = require('./lib/contract-facts');
const {
  foreignStepsForUnit,
  isInterfaceRelevantForeignStep,
  stepOwnerLabel,
} = require('./lib/step-owner');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

/** The named findings this gate reports. */
const DELIVERY_CODES = Object.freeze({
  DISTRIBUTION_UNIT_UNTESTED: 'DISTRIBUTION_UNIT_UNTESTED',
  STEP_CONTRACT_NOT_DELIVERED: 'STEP_CONTRACT_NOT_DELIVERED',
  BOUNDARY_CONTRACT_NOT_DELIVERED: 'BOUNDARY_CONTRACT_NOT_DELIVERED',
  SHARED_WORK_UNDECLARED: 'SHARED_WORK_UNDECLARED',
  SHARED_STEP_INTEGRATION_MISSING: 'SHARED_STEP_INTEGRATION_MISSING',
  SHARED_STEP_OWNER_UNKNOWN: 'SHARED_STEP_OWNER_UNKNOWN',
  STEP_AXIS_NOT_DELIVERED: 'STEP_AXIS_NOT_DELIVERED',
  OPERATION_OBLIGATION_UNPLANNED: 'OPERATION_OBLIGATION_UNPLANNED',
  DISTRIBUTION_VIEW_MISSING: 'DISTRIBUTION_VIEW_MISSING',
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

/** Whether a unit is a sequence whose steps may include a foreign step. */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function isSequenceUnit(unit) {
  const unitId = String(unit?.unitId ?? '');
  return unit?.kind === 'sequence'
    || unit?.kind === 'cross-boundary-sequence'
    || unitId.startsWith('seq-')
    || unitId.startsWith('xdir-');
}

/** The ticket contract that projects one step, or undefined. */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function contractForStep(ticket, stepId) {
  return (Array.isArray(ticket?.contracts) ? ticket.contracts : [])
    .find((contract) => contract?.stepId === stepId);
}

/** The fact texts of one typed axis on a ticket contract. */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function axisTexts(contract, axis) {
  return factTexts(contract?.contract?.[axis]);
}

/** A step's typed axes are delivered only when each non-empty fact is in the test plan. */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function stepAxisFindings({ ticket, unit, testText }) {
  const findings = [];
  for (const step of Array.isArray(unit?.obligation?.steps) ? unit.obligation.steps : []) {
    const contract = contractForStep(ticket, step.stepId);
    if (contract === undefined) continue; // STEP_CONTRACT_NOT_DELIVERED already fired
    for (const axis of CONTRACT_AXES) {
      const texts = axisTexts(contract, axis);
      if (texts.length === 0) continue;
      if (!texts.some((text) => testText.includes(text))) {
        findings.push({
          code: DELIVERY_CODES.STEP_AXIS_NOT_DELIVERED,
          subject: `${step.stepId}:${axis}`,
          message: `step ${step.stepId} carries ${axis} (${texts.join(', ')}) and no test-plan entry names it`,
        });
      }
    }
  }
  return findings;
}

/** The terms that identify a foreign step's owner; null when the owner is unresolved. */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function ownerTerms(label) {
  if (label === 'this ticket') return [];
  if (label === 'unknown package') return null;
  if (label.startsWith('package ')) {
    return label.slice('package '.length).split(',').map((term) => term.trim()).filter((term) => term.length > 0);
  }
  return [label];
}

/** The boundary ids a foreign step crosses. */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function crossedBoundaryIds(step) {
  return factTexts(step?.contract?.crosses)
    .map((fact) => (fact.startsWith('boundary:') ? fact.slice('boundary:'.length).split('/')[0] : fact))
    .filter((boundaryId) => boundaryId.length > 0);
}

/**
 * Each interface-relevant foreign step needs one integration entry naming its owner and
 * the step. A boundary-crossing step also needs the boundary id, because that contract is
 * the interface the two sides must agree on.
 */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function foreignStepFindings({ ticket, unit, view, ticketsDocument }) {
  const findings = [];
  const viewUnit = (view?.ownedSequenceUnits ?? []).concat(view?.crossBoundarySequenceUnits ?? [])
    .find((candidate) => candidate?.unitId === unit?.unitId
      || (candidate?.sequenceId !== undefined && candidate.sequenceId === unit?.sequenceId));
  if (viewUnit === undefined) {
    // A readable view that omits the carried sequence is as unusable as an unreadable
    // one: without its steps the foreign-step check would pass by seeing nothing.
    findings.push({
      code: DELIVERY_CODES.DISTRIBUTION_VIEW_MISSING,
      subject: unit?.unitId ?? '?',
      message: `the package view declares no sequence unit ${unit?.unitId ?? '?'}, so foreign steps cannot be checked`,
    });
    return findings;
  }

  const localSteps = Array.isArray(unit?.obligation?.steps) ? unit.obligation.steps : [];
  const allSteps = Array.isArray(viewUnit?.steps) ? viewUnit.steps : [];
  const integrationText = [...(ticket.testIntegration ?? [])].join(' ');
  for (const foreignStep of foreignStepsForUnit({ view, unit })) {
    if (!isInterfaceRelevantForeignStep({ foreignStep, localSteps, allSteps })) continue;
    const terms = ownerTerms(stepOwnerLabel({ step: foreignStep, unit, ticket, ticketsDocument, view }));
    if (terms === null) {
      findings.push({
        code: DELIVERY_CODES.SHARED_STEP_OWNER_UNKNOWN,
        subject: foreignStep?.stepId ?? '?',
        message: `foreign step ${foreignStep?.stepId ?? '?'} has no resolvable owner`,
      });
      continue;
    }
    const namesOwner = terms.length === 0 || terms.some((term) => integrationText.includes(term));
    const namesStep = typeof foreignStep?.stepId === 'string' && integrationText.includes(foreignStep.stepId);
    const boundaryIds = crossedBoundaryIds(foreignStep);
    const namesBoundary = boundaryIds.every((boundaryId) => integrationText.includes(boundaryId));
    if (!namesOwner || !namesStep || !namesBoundary) {
      findings.push({
        code: DELIVERY_CODES.SHARED_STEP_INTEGRATION_MISSING,
        subject: foreignStep?.stepId ?? '?',
        message: `foreign step ${foreignStep?.stepId ?? '?'} needs a testIntegration entry naming its owner (${terms.join(', ') || 'this ticket'}), the step id and ${boundaryIds.join(', ') || 'no boundary'}`,
      });
    }
  }
  return findings;
}

/** Each non-empty contract-bearing or surface operation field must be planned by name. */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function operationObligationFindings({ unit, testText, exceptionText }) {
  const findings = [];
  const fields = [...CONTRACT_BEARING_OPERATION_FIELDS, ...SURFACE_OPERATION_FIELDS];
  for (const field of fields) {
    if (!hasObligationValue(unit?.obligation?.[field])) continue;
    if (testText.includes(field) || exceptionText.includes(field)) continue;
    findings.push({
      code: DELIVERY_CODES.OPERATION_OBLIGATION_UNPLANNED,
      subject: `${unit?.unitId ?? '?'}:${field}`,
      message: `operation ${unit?.unitId ?? '?'} carries ${field} and no test-plan or testException entry names it`,
    });
  }
  return findings;
}

/**
 * Evaluate the delivery gate without writing to the process streams.
 *
 * @returns {{ ok: boolean, skipped?: string, findings: Array<object> }}
 */
// [::TICKET::] PX-324, PX-325, PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-324|PX-325|PX-326) --for-spec --no-implementation-order`.
function evaluateDistributionDelivery(ticket, { specText = null, specProvided = false, view, ticketsDocument = null } = {}) {
  const units = Array.isArray(ticket?.distribution?.units) ? ticket.distribution.units : [];
  if (units.length === 0) return { ok: true, skipped: 'no-distribution', findings: [] };

  const findings = [];
  const testText = [...(ticket.testUnit ?? []), ...(ticket.testIntegration ?? [])].join(' ');
  const exceptionText = [...(ticket.testExceptions ?? [])].join(' ');

  // A sequence unit's foreign steps live in the package view. The split guarantees the
  // view for a distributed ticket; an explicit null means it could not be read, which is
  // a finding rather than a silent loss of the foreign-step check.
  if (units.some((unit) => isSequenceUnit(unit)) && view === null) {
    findings.push({
      code: DELIVERY_CODES.DISTRIBUTION_VIEW_MISSING,
      subject: 'SEQUENCES.json',
      message: 'a sequence unit is carried and the package view is unreadable, so foreign steps cannot be checked',
    });
  }

  for (const unit of units) {
    const unitId = String(unit?.unitId ?? '');
    if (unit?.kind === 'operation' && unit?.obligation?.mode === 'implement') {
      const operationId = unit.operationId ?? unitId.replace(/^op-/, '');
      const named = [unitId, `op-${operationId}`, operationId].some((term) => term.length > 0 && testText.includes(term));
      if (!named) {
        findings.push({ code: DELIVERY_CODES.DISTRIBUTION_UNIT_UNTESTED, subject: unitId, message: `implement unit ${unitId} is in no test plan entry` });
      }
      findings.push(...operationObligationFindings({ unit, testText, exceptionText }));
    }
    if (isSequenceUnit(unit)) {
      for (const step of Array.isArray(unit?.obligation?.steps) ? unit.obligation.steps : []) {
        const contract = contractForStep(ticket, step.stepId);
        if (!stepContractIsDelivered(step, contract)) {
          findings.push({ code: DELIVERY_CODES.STEP_CONTRACT_NOT_DELIVERED, subject: step.stepId, message: `step ${step.stepId} is carried by the ticket and its contract is not in ticket.contracts` });
        }
      }
      findings.push(...stepAxisFindings({ ticket, unit, testText }));
      if (view !== undefined && view !== null) {
        findings.push(...foreignStepFindings({ ticket, unit, view, ticketsDocument }));
      }
    }
    if (unitId.startsWith('ctr-')) {
      if (!boundaryContractIsDelivered(unit, ticket)) {
        findings.push({ code: DELIVERY_CODES.BOUNDARY_CONTRACT_NOT_DELIVERED, subject: unitId, message: `${unitId} is carried by the ticket and its registry projection is not in ticket.contracts` });
      }
    }
    if (unit?.obligation?.mode === 'reference') {
      // The durable key is the identity a design can name across phases. The numeric id is
      // the phase-local fallback written before the key existed, so it is used only when no
      // key is present: a bare number must not stand in for the ticket it happens to equal.
      const implementer = typeof unit.obligation.implementerTicketKey === 'string'
        && unit.obligation.implementerTicketKey.length > 0
        ? unit.obligation.implementerTicketKey
        : unit.obligation.implementerTicketId;
      const providerTerms = [
        implementer,
        ...(Array.isArray(unit.obligation.providers) ? unit.obligation.providers : []),
      ]
        .filter((value) => typeof value === 'string' || typeof value === 'number')
        .map((value) => String(value))
        .filter((value) => value.length > 0);
      const declared = providerTerms.some((term) => testText.includes(term));
      if (!declared && providerTerms.length > 0) {
        findings.push({ code: DELIVERY_CODES.SHARED_WORK_UNDECLARED, subject: unitId, message: `reference unit ${unitId} names ${providerTerms.join(', ')} and no test-plan entry names it` });
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
    const requiresWorkShare = units.some((unit) => isSequenceUnit(unit)
      || String(unit?.unitId ?? '').startsWith('ctr-'));
    if (requiresWorkShare && !specText.includes('### Work Share')) {
      findings.push({ code: DELIVERY_CODES.WORK_SHARE_SECTION_MISSING, subject: null, message: 'the spec has no ### Work Share section' });
    }
  }
  return { ok: findings.length === 0, findings };
}

// [::TICKET::] PX-324, PX-325, PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-324|PX-325|PX-326) --for-spec --no-implementation-order`.
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
  const viewPath = argumentFor(argv, 'view') ?? path.join(path.dirname(path.resolve(ticketsPath)), 'SEQUENCES.json');
  let view = null;
  if (fs.existsSync(viewPath)) {
    try {
      view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
    } catch {
      view = null;
    }
  }
  const result = evaluateDistributionDelivery(ticket, { specText, specProvided: specPath !== null, view, ticketsDocument: document });
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
