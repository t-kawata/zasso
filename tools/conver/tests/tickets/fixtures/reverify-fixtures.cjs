'use strict';

/**
 * Shared fixtures for the PX-399 reverify tests.
 *
 * A clean ticket is one every gate accepts: one contract, a planTestCode entry
 * that names it, a test plan that names its clauses, and no distribution.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** A ticket that satisfies the contract, clause and review gates. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function cleanTicket(overrides = {}) {
  return {
    id: 1,
    phaseId: -1,
    status: 'done',
    title: 'Fixture',
    contracts: [{
      id: 'C001',
      sourceEdge: 'N0001->N0002',
      precondition: 'order exists',
      postcondition: 'order saved',
      invariant: 'order stable',
    }],
    planTestCode: ['C001\n```js\nassert.ok(true);\n```'],
    testUnit: ['UT: C001 order exists order saved order stable'],
    testIntegration: [],
    testExceptions: [],
    acceptanceCriteria: [],
    targetStubs: 'verified_empty',
    targetCrimes: 'verified_empty',
    ...overrides,
  };
}

/** A reviewed ticket with a complete review record. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function reviewedTicket(overrides = {}) {
  return cleanTicket({
    status: 'reviewed',
    instrumentation: 'tests pass',
    rfcDiscrepancies: [],
    notes: 'reviewed',
    ...overrides,
  });
}

/** A document that groups tickets by phase id. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function documentWith(...tickets) {
  const byPhase = new Map();
  for (const ticket of tickets) {
    const phaseId = ticket.phaseId ?? -1;
    if (!byPhase.has(phaseId)) byPhase.set(phaseId, []);
    byPhase.get(phaseId).push(ticket);
  }
  return {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [...byPhase.entries()].map(([id, phaseTickets]) => ({
      id,
      name: id === -1 ? 'PX' : 'P' + id,
      tickets: phaseTickets,
    })),
  };
}

/** Write a one-ticket package and return its paths. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function writeFixture(ticket) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reverify-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  const document = documentWith(ticket);
  fs.writeFileSync(ticketsPath, JSON.stringify(document, null, 2) + '\n');
  return { directory, ticketsPath, document };
}

/** Write a source file under the fixture directory and return its relative path. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function writeSourceFile(directory, relativePath, content) {
  const target = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return relativePath;
}

module.exports = {
  cleanTicket,
  reviewedTicket,
  documentWith,
  writeFixture,
  writeSourceFile,
};
