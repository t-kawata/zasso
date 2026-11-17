// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-436 C001/C002/C003 — clause inventory, contract-id scope and source
 * reconciliation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildInventory,
  reconcileSource,
  inventoryDigest,
} = require('../../.claude/scripts/tickets/lib/inventory.js');
const {
  adapter,
  graphSource,
  ticketSource,
  specSource,
  manifestSource,
  contract,
} = require('./helpers/clause-inventory-fixture.cjs');

test('C003: every source element is emitted or explicitly excluded; emitted plus excluded equals source count', () => {
  const source = graphSource([contract('C001', 'input is present', 'output is stored', '   ')]);
  const inventory = buildInventory({ adapter: adapter(), sources: [source] });

  assert.equal(inventory.clauses.length, 2);
  assert.equal(inventory.reconciliation.sourceElements, 3);
  assert.equal(inventory.reconciliation.emitted, 2);
  assert.equal(inventory.reconciliation.excluded, 1);
  assert.equal(inventory.reconciliation.unaccounted, 0);
  assert.deepEqual(inventory.reconciliation.exclusions.map((entry) => entry.element), ['invariant']);
});

test('C003: a source element neither emitted nor excluded is INVENTORY_SOURCE_UNACCOUNTED', () => {
  const result = reconcileSource({
    sourceElements: [{ contractId: 'C001', element: 'precondition' }, { contractId: 'C001', element: 'postcondition' }],
    clauses: [{ key: 'clause|pkg-alpha|C001|precondition|abcdef0123456789' }],
    exclusions: [],
  });

  assert.equal(result.unaccounted, 1);
  assert.equal(result.findings.some((finding) => finding.code === 'INVENTORY_SOURCE_UNACCOUNTED'), true);
});

test('C003: an empty inventory is a repair finding, never a clean pass', () => {
  const inventory = buildInventory({ adapter: adapter(), sources: [] });

  assert.equal(inventory.clauses.length, 0);
  assert.equal(inventory.findings.some((finding) => finding.code === 'REPAIR_REQUIRED'), true);
  assert.notEqual(inventory.findings.find((finding) => finding.code === 'REPAIR_REQUIRED').class, 'acceptable');
});

test('C002: global scope reports differing text for one contract id as CLAUSE_TEXT_CONFLICT', () => {
  const sources = [
    graphSource([contract('C001', 'abstract is read', 'package purpose is stated', 'no guarantee is absent')]),
    ticketSource([{ key: 'P0-1', contracts: [contract('C001', 'amendment is applied', 'package purpose is stated', 'no guarantee is absent')] }]),
  ];
  const inventory = buildInventory({ adapter: adapter({ contractIdScope: 'global' }), sources });

  assert.equal(inventory.conflicts.length, 1);
  assert.equal(inventory.conflicts[0].code, 'CLAUSE_TEXT_CONFLICT');
  assert.equal(inventory.conflicts[0].contractId, 'C001');
});

test('C002: local scope treats differing text under one contract id as distinct clauses', () => {
  const sources = [
    graphSource([contract('C001', 'abstract is read', 'package purpose is stated', 'no guarantee is absent')]),
    ticketSource([{ key: 'PX-3', contracts: [contract('C001', 'amendment is applied', 'package purpose is stated', 'no guarantee is absent')] }]),
  ];
  const inventory = buildInventory({ adapter: adapter({ contractIdScope: 'local' }), sources });

  assert.equal(inventory.conflicts.length, 0);
  assert.equal(inventory.clauses.length, 4);
  assert.equal(new Set(inventory.clauses.map((clause) => clause.key)).size, 4);
});

test('C001: the same text in two tickets is one clause with two owners', () => {
  const shared = contract('C001', 'input is present', 'output is stored', 'state is unchanged');
  const sources = [
    graphSource([shared]),
    ticketSource([
      { key: 'P1-1', contracts: [shared] },
      { key: 'P2-1', contracts: [shared] },
    ]),
  ];
  const inventory = buildInventory({ adapter: adapter(), sources });

  const precondition = inventory.clauses.find((clause) => clause.contractId === 'C001' && clause.element === 'precondition');
  assert.deepEqual(precondition.owners, ['P1-1', 'P2-1']);
});

test('C001: spec and manifest sources are accepted when no graph exists', () => {
  const fromSpec = buildInventory({
    adapter: adapter(),
    sources: [specSource([contract('C900', 'spec precondition', 'spec postcondition', 'spec invariant')])],
  });
  const fromManifest = buildInventory({
    adapter: adapter(),
    sources: [manifestSource([{ contractId: 'C901', element: 'precondition', text: 'manifest precondition' }])],
  });

  assert.equal(fromSpec.clauses.length, 3);
  assert.equal(fromManifest.clauses.length, 1);
  assert.equal(fromManifest.clauses[0].contractId, 'C901');
});

test('C001: inventory digest is deterministic and order-independent', () => {
  const first = buildInventory({
    adapter: adapter(),
    sources: [
      graphSource([contract('C001'), contract('C002')]),
      ticketSource([{ key: 'P1-1', contracts: [contract('C003')] }]),
    ],
  });
  const second = buildInventory({
    adapter: adapter(),
    sources: [
      ticketSource([{ key: 'P1-1', contracts: [contract('C003')] }]),
      graphSource([contract('C002'), contract('C001')]),
    ],
  });

  assert.equal(first.digest, second.digest);
  assert.equal(first.digest, inventoryDigest(first.clauses));
});

test('C001: each clause records a source locator', () => {
  const inventory = buildInventory({
    adapter: adapter(),
    sources: [graphSource([contract('C001')], 'TEST-GRAPH.json')],
  });

  assert.equal(inventory.clauses[0].source[0].artifact, 'TEST-GRAPH.json');
  assert.equal(inventory.clauses[0].source[0].locator.startsWith('E001'), true);
});
