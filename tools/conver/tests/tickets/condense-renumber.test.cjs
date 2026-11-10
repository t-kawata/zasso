'use strict';
// PX-402 @verifies C001 @verifies C002 @verifies C003 @verifies C005

/**
 * PX-402 — condensation renumbers to dense ids and rewrites every live reference.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { applyPlan } = require('../../.claude/scripts/tickets/condense-tickets.js');

const NO_MERGE_BUDGET = Object.freeze({
  operations: 0,
  sequenceSteps: 0,
  ownedContracts: 0,
  files: 1,
  testUnit: 1,
  testIntegration: 1,
  modules: 1,
});

const MERGE_BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 10,
  testUnit: 100,
  testIntegration: 100,
  modules: 100,
});

// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function ticket(id, overrides = {}) {
  return {
    id,
    phaseId: 0,
    status: 'todo',
    title: `Ticket ${id}`,
    nodeIds: [`N000${id}`],
    background: `background ${id}`,
    notes: `notes ${id}`,
    scope: [`scope ${id}`],
    invariants: `invariants ${id}`,
    testUnit: [`UT: unit ${id}`],
    testIntegration: [`IT: integration ${id}`],
    testExceptions: [],
    acceptanceCriteria: [`AC ${id}`],
    contracts: [{ id: 'C001', sourceEdge: 'N0001->N0002', precondition: 'a', postcondition: 'b', invariant: 'c' }],
    default_files: [`src/file${id}.js`],
    ...overrides,
  };
}

// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function freshDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function writePackage(directory, tickets) {
  const document = {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-10' },
    phases: [{
      id: 0,
      name: 'P0',
      summary: 'fixture phase',
      nodeIds: tickets.flatMap((entry) => entry.nodeIds),
      tickets,
    }],
  };
  fs.writeFileSync(path.join(directory, 'Tickets.json'), `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

test('C001,C005 a gapped phase is renumbered even when no ticket is merged', async () => {
  const directory = freshDirectory('condense-renumber');
  const ticketsPath = path.join(directory, 'Tickets.json');
  writePackage(directory, [ticket(1), ticket(3)]);
  const first = await applyPlan({
    ticketsPath,
    budget: NO_MERGE_BUDGET,
    verify: () => ({ ok: true }),
  });
  assert.equal(first.ok, true);
  assert.equal(first.renumbered, true);
  const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  assert.deepEqual(document.phases[0].tickets.map((entry) => entry.id), [1, 2]);
  assert.equal(document.identity.generation, 1);
  assert.equal(document.identity.aliases['P0-3@g0'], 'P0-2');
  const second = await applyPlan({
    ticketsPath,
    budget: NO_MERGE_BUDGET,
    verify: () => ({ ok: true }),
  });
  assert.equal(second.noChange, true);
});

test('C001,C002,C003 a merged phase is dense and its prose follows the survivor', async () => {
  const directory = freshDirectory('condense-merge-renumber');
  const ticketsPath = path.join(directory, 'Tickets.json');
  writePackage(directory, [
    ticket(1, {
      notes: 'survivor sees P0-3',
      condensedFrom: { originKey: 'P0-1', tickets: [{ key: 'P0-2', id: 2 }] },
    }),
    ticket(3, { notes: 'absorbed sees P0-2' }),
  ]);
  const first = await applyPlan({
    ticketsPath,
    budget: MERGE_BUDGET,
    verify: () => ({ ok: true }),
  });
  assert.equal(first.ok, true);
  const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  assert.deepEqual(document.phases[0].tickets.map((entry) => entry.id), [1]);
  assert.equal(document.phases[0].tickets[0].notes, 'survivor sees P0-1');
  assert.equal(document.identity.aliases['P0-2@g0'], 'P0-1');
  assert.equal(document.identity.aliases['P0-3@g0'], 'P0-1');
  const absorbed = document.phases[0].tickets[0].condensedFrom.tickets
    .find((entry) => entry.key === 'P0-3');
  assert.equal(absorbed.record.notes, 'absorbed sees P0-2');
  assert.equal(absorbed.generation, 0);
});

test('C005 a failing gate restores the pre-apply bytes', async () => {
  const directory = freshDirectory('condense-renumber-rollback');
  const ticketsPath = path.join(directory, 'Tickets.json');
  writePackage(directory, [ticket(1), ticket(3)]);
  const original = fs.readFileSync(ticketsPath, 'utf8');
  const failed = await applyPlan({
    ticketsPath,
    budget: NO_MERGE_BUDGET,
    verify: () => { throw new Error('closure'); },
  });
  assert.equal(failed.ok, false);
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), original);
});

test('C005 a dense document still returns NO_CHANGE', async () => {
  const directory = freshDirectory('condense-renumber-dense');
  const ticketsPath = path.join(directory, 'Tickets.json');
  writePackage(directory, [ticket(1), ticket(2)]);
  const result = await applyPlan({
    ticketsPath,
    budget: NO_MERGE_BUDGET,
    verify: () => ({ ok: true }),
  });
  assert.equal(result.noChange, true);
});
