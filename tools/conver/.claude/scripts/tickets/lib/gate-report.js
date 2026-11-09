'use strict';

/**
 * gate-report.js — the one report envelope every gate writes.
 *
 * Report mode exists so a gate can name a problem and its repair without
 * stopping the caller. The default mode of an existing gate is untouched; a
 * gate that only reports (the new ones) always emits this envelope and exits 0.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createFinding } = require('./gate-finding.js');
const { parseTicketKey } = require('../../lib/validate-tickets.js');

/** Whether the caller asked for the additive report mode. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function reportMode(argv = process.argv.slice(2)) {
  return argv.includes('--report');
}

/** The rerun command that proves one gate finding. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function gateRerun(gate, ticketKey, ticketsPath) {
  return `node .claude/scripts/tickets/${gate}.js --ticket-key=${ticketKey} --tickets=${ticketsPath} --report`;
}

/** A repair that the caller authors (judgment) and a script inserts. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function testRepairRoute({ ticketKey, contractId = null, asset, instruction }) {
  return {
    tool: 'author-and-insert-test',
    input: { ticketKey, contractId, asset, instruction },
  };
}

/** A ticket-field patch whose value the caller must author. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function patchRoute({ ticketsPath, ticketKey, field, asset, instruction }) {
  return {
    tool: 'patch-ticket',
    input: {
      ticketsPath,
      ticketKey,
      field,
      mode: 'append',
      requiresAuthoredValue: true,
      asset,
      instruction,
    },
  };
}

/** A deferral clone rewrite whose content the caller must author. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function rewriteRoute({ ticketsPath, ticketKey, asset, instruction }) {
  return {
    tool: 'rewrite-deferral-ticket',
    input: { ticketsPath, ticketKey, requiresAuthoredValue: true, asset, instruction },
  };
}

/** A review-record write whose content the caller must author. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function reviewRecordRoute({ ticketsPath, ticketKey, fields, asset }) {
  return {
    tool: 'record-review',
    input: { ticketsPath, ticketKey, fields, requiresAuthoredValue: true, asset },
  };
}

/** A renderer patch that makes an omitted field or section visible. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function rendererRoute({ field, section, asset, instruction }) {
  return {
    tool: 'patch-renderer',
    input: { field, section, asset, instruction },
  };
}

/** An implementation patch for a formula symbol or its test. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function implementationRoute({ formulaId, code, asset, message }) {
  return {
    tool: 'author-implementation',
    input: { formulaId, code, asset, message },
  };
}

/** A malformed gate input, reported without stopping the caller. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function inputRoute({ asset, instruction }) {
  return {
    tool: 'repair-input',
    input: { asset, instruction },
  };
}

/**
 * Build one frozen finding.
 *
 * @param {object} input
 * @returns {object}
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function gateFinding({ code, asset, problem, rerun, fix }) {
  return createFinding({ code, asset, problem, fixes: [fix], rerun });
}

/** Write the report envelope and exit zero. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function emitGateReport({ gate, ticketKey, findings }) {
  process.stdout.write(JSON.stringify({ gate, ticketKey, findings }) + '\n');
}

/** Read a Tickets.json document. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function loadTicketDocument(ticketsPath) {
  return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
}

/** Find one ticket across every phase. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function findTicketByKey(document, ticketKey) {
  const parsed = parseTicketKey(ticketKey);
  if (!parsed) return null;
  for (const phase of document.phases || []) {
    for (const ticket of phase.tickets || []) {
      if (ticket.phaseId === parsed.phaseId && ticket.id === parsed.ticketId) return ticket;
    }
  }
  return null;
}

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** Resolve a path argument against the working directory. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function resolveArgumentPath(args, name) {
  const value = argumentValue(args, name);
  return value === undefined ? undefined : path.resolve(value);
}

/** The durable key of a ticket object. */
function ticketKeyOf(ticket) {
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
  return ticket.phaseId === -1 ? 'PX-' + ticket.id : 'P' + ticket.phaseId + '-' + ticket.id;
}

/**
 * Emit the not-found finding every gate shares.
 *
 * @param {string} gate
 * @param {string} ticketKey
 * @param {string} ticketsPath
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function emitTicketNotFound(gate, ticketKey, ticketsPath) {
  emitGateReport({
    gate,
    ticketKey,
    findings: [gateFinding({
      code: 'TICKET_NOT_FOUND',
      asset: ticketKey,
      problem: `ticket ${ticketKey} is not present in ${ticketsPath}`,
      rerun: gateRerun(gate, ticketKey, ticketsPath),
      fix: inputRoute({
        asset: ticketKey,
        instruction: 'Run the gate against an existing ticket key or repair the Tickets.json path',
      }),
    })],
  });
}

/**
 * Emit the missing-argument finding every gate shares.
 *
 * @param {string} gate
 * @param {string} ticketKey
 * @param {string} ticketsPath
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function emitInputMissing(gate, ticketKey, ticketsPath) {
  emitGateReport({
    gate,
    ticketKey: ticketKey || '(missing)',
    findings: [gateFinding({
      code: 'GATE_INPUT_MISSING',
      asset: gate,
      problem: '--ticket-key and --tickets are required',
      rerun: gateRerun(gate, ticketKey || '(missing)', ticketsPath || '(missing)'),
      fix: inputRoute({
        asset: gate,
        instruction: 'Pass --ticket-key=<key> and --tickets=<Tickets.json>',
      }),
    })],
  });
}

module.exports = {
  reportMode,
  gateRerun,
  testRepairRoute,
  patchRoute,
  rewriteRoute,
  reviewRecordRoute,
  rendererRoute,
  implementationRoute,
  inputRoute,
  gateFinding,
  emitGateReport,
  loadTicketDocument,
  findTicketByKey,
  ticketKeyOf,
  argumentValue,
  resolveArgumentPath,
  emitTicketNotFound,
  emitInputMissing,
};
