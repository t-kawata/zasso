#!/usr/bin/env node

/**
 * verify-final-contracts.js — Verify final contract fulfillment (Gate R)
 *
 * Usage: node verify-final-contracts.js --ticket-key=<PX-id> --tickets=<path>
 *
 * Verifies all contracts in the ticket are accounted for and produces
 * a coverage report.
 *
 * Exits 0 on pass, 1 on failure. JSON report on stdout, errors on stderr.
 *
 * [::TICKET::] PX-71: Gate R + Pipeline Integration
 */

const fs = require('fs');
const path = require('path');

// [::TICKET::] PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-71 --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  let ticketKey, ticketsPath;
  for (const a of args) {
    if (a.startsWith('--ticket-key=')) ticketKey = a.slice('--ticket-key='.length);
    if (a.startsWith('--tickets=')) ticketsPath = path.resolve(a.slice('--tickets='.length));
  }
  if (!ticketKey || !ticketsPath) {
    console.error('[ERROR] --ticket-key=<PX-id> and --tickets=<path> are required');
    process.exit(1);
  }
  return { ticketKey, ticketsPath };
}

/**
 * Verify final contracts for a set of tickets (all phases)
 *
 * @param {object} opts - { tickets: Array, graph: object, contractsCheck: boolean }
 * @returns {{ valid: boolean, report: { coverage: number, details: Array } }}
 */
// [::TICKET::] PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-71 --for-spec --no-implementation-order`.
function verifyFinalContracts(opts) {
  const { tickets } = opts;
  const allContracts = [];
  const details = [];

  for (const t of tickets) {
    if (t.contracts) {
      for (const c of t.contracts) {
        allContracts.push({ ticketId: t.id, contract: c, status: t.status });
      }
    }
  }

  if (opts.contractsCheck && allContracts.length > 0) {
    // Check each contract: a contract is "fulfilled" if the ticket status is "done" or "reviewed"
    for (const entry of allContracts) {
      const fulfilled = entry.status === 'done' || entry.status === 'reviewed';
      details.push({
        contractId: entry.contract.id,
        ticketId: entry.ticketId,
        status: entry.status,
        fulfilled
      });
    }
  }

  const fulfilled = details.filter(d => d.fulfilled).length;
  const total = details.length;
  const coverage = total === 0 ? 100 : Math.round((fulfilled / total) * 100);
  const valid = coverage === 100;

  return {
    valid,
    report: {
      coverage,
      totalContracts: total,
      fulfilledContracts: fulfilled,
      details
    }
  };
}

// [::TICKET::] PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-71 --for-spec --no-implementation-order`.
function main() {
  const { ticketKey, ticketsPath } = parseArgs();

  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    process.exit(1);
  }

  const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));

  // Parse ticket key: PX-{id} or P{phase}-{id}
  const pxMatch = ticketKey.match(/^PX-(\d+)$/);
  const pMatch = ticketKey.match(/^P(\d+)-(\d+)$/);
  let targetPhaseId, targetId;
  if (pxMatch) { targetPhaseId = -1; targetId = parseInt(pxMatch[1], 10); }
  else if (pMatch) { targetPhaseId = parseInt(pMatch[1], 10); targetId = parseInt(pMatch[2], 10); }
  else { console.error('[ERROR] Invalid ticket key format: ' + ticketKey); process.exit(1); }

  // Find target ticket across all phases
  let targetTicket = null;
  for (const phase of ticketsData.phases) {
    if (phase.tickets) {
      for (const t of phase.tickets) {
        if (t.id === targetId && t.phaseId === targetPhaseId) {
          targetTicket = { ...t, phaseId: phase.id };
          break;
        }
      }
    }
    if (targetTicket) break;
  }
  if (!targetTicket) {
    console.error('[ERROR] Ticket ' + ticketKey + ' not found');
    process.exit(1);
  }

  const result = verifyFinalContracts({ tickets: [targetTicket], contractsCheck: true });

  if (!result.valid) {
    for (const d of result.report.details) {
      if (!d.fulfilled) {
        console.error('[ERROR] Contract ' + d.contractId + ' (ticket P' + d.ticketId + '): not fulfilled (status=' + d.status + ')');
        console.error('Cause: Contract fulfillment rate is ' + result.report.coverage + '% (target: 100%)');
        console.error('Action: Complete all tickets and re-run');
      }
    }
    // Still output the report
    console.log(JSON.stringify({ ok: false, ...result.report }));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, ...result.report }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { verifyFinalContracts };
