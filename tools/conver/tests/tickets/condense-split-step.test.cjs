'use strict';
// PX-396 @verifies C005

/**
 * PX-396 — condensation inside split Step 5-3 must keep numeric-phase keys and
 * leave the verification sequence intact.
 *
 * The fixture has no distribution artifacts, so applyPlan stops at the ticket
 * document. The command document is checked separately for the exact order of
 * the three gates that follow condense in Step 5-3.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { applyPlan } = require('../../.claude/scripts/tickets/condense-tickets.js');

const SPLIT_COMMAND = path.join(__dirname, '..', '..', '.claude', 'commands', 'split-to-tickets.md');
const BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 10,
  testUnit: 100,
  testIntegration: 100,
  modules: 100,
});

/** One numeric-phase ticket with one implementation file. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
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
    testIntegration: [],
    testExceptions: [],
    acceptanceCriteria: [`AC ${id}`],
    contracts: [{ id: `C00${id}`, sourceEdge: `N000${id}->N000${id + 1}`, precondition: 'p', postcondition: 'q', invariant: 'r' }],
    default_files: [`src/file${id}.js`],
    ...overrides,
  };
}

test('C005: a numeric-phase merge keeps every surviving key and remaps absorbed references', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'condense-split-'));
  const tickets = [ticket(1), ticket(2), ticket(3, { default_files: Array.from({ length: 20 }, (_, index) => `src/three-${index}.js`) })];
  const document = {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{ id: 0, name: 'P0', summary: '', nodeIds: tickets.flatMap((entry) => entry.nodeIds), tickets }],
  };
  fs.writeFileSync(path.join(directory, 'Tickets.json'), `${JSON.stringify(document, null, 2)}\n`);

  const result = await applyPlan({
    ticketsPath: path.join(directory, 'Tickets.json'),
    budget: BUDGET,
    verify: () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
  const merged = JSON.parse(fs.readFileSync(path.join(directory, 'Tickets.json'), 'utf8'));
  const keys = merged.phases[0].tickets.map((entry) => `P0-${entry.id}`);
  assert.deepEqual(keys, ['P0-1', 'P0-3']);
  assert.equal(merged.phases[0].tickets[0].condensedFrom.tickets[0].key, 'P0-2');
});

test('C005: split Step 5-3 keeps condense followed by the three verification gates', () => {
  const command = fs.readFileSync(SPLIT_COMMAND, 'utf8');
  const start = command.indexOf('### Step 5-3');
  const end = command.indexOf('### Resuming from an Error', start);
  const step = command.slice(start, end === -1 ? undefined : end);
  const condense = step.indexOf('condense-tickets.js" --apply');
  const stepContracts = step.indexOf('project-step-contracts.js" --mode=verify');
  const chain = step.indexOf('verify-chain.mjs');
  const order = step.indexOf('verify-implementation-order.mjs');

  assert.ok(start >= 0, 'the split command must contain Step 5-3');
  assert.ok(condense >= 0, 'Step 5-3 must invoke condense apply');
  assert.ok(stepContracts > condense, 'step-contract verification must follow condense');
  assert.ok(chain > stepContracts, 'chain verification must follow step contracts');
  assert.ok(order > chain, 'implementation order must follow chain verification');
});
