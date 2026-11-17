// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-436 C001 — clause surfaces and adapter dispatch in the detector library.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  CLAUSE_ASSET_KIND,
  dispatchClauseAdapter,
  enumerateClauseSurfaces,
} = require('../../.claude/scripts/tickets/lib/omission-detectors.js');

test('C001: the clause asset kind is named once', () => {
  assert.equal(CLAUSE_ASSET_KIND, 'contract-clause');
});

test('C001: every inventory clause becomes one clause surface with its owner', () => {
  const key = 'clause|pkg-alpha|C001|precondition|abcdef0123456789';
  const inventory = { clauses: [{ key, contractId: 'C001', element: 'precondition', owners: ['P1-1'] }], conflicts: [] };
  const surfaces = enumerateClauseSurfaces({ inventory });

  assert.deepEqual(surfaces, [{ surface: 'contract-clause', assetId: key, ticketKey: 'P1-1', clauseKey: key }]);
});

test('C001: an adapter id resolves through the registry', () => {
  assert.equal(dispatchClauseAdapter({ id: 'rust' }).id, 'rust');
  assert.equal(dispatchClauseAdapter({ id: 'generic-manifest' }).id, 'generic-manifest');
  assert.equal(dispatchClauseAdapter({ id: 'missing-adapter' }), null);
});
