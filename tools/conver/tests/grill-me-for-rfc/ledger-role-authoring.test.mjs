// PX-328 @verifies C001
// The Distribution ledger is the authored surface for an operation's role. The renderer
// must read the Owner-cell annotation before it writes the map, and the annotation must
// survive the round trip; an unannotated ledger keeps the roleCandidate fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderDistribution } from '../../.claude/scripts/grill-me-for-rfc/render-distribution.mjs';
import { checkOwnerRoles } from '../../.claude/scripts/smooth-sequences/lib/checks-distribution-map.mjs';

/** One operation claimed by two packages, so the view cannot choose an implementer. */
// [::TICKET::] PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-328 --for-spec --no-implementation-order`.
function coOwnedView(packageId, roleCandidate = 'undecided') {
  return {
    packageId,
    ownedOperationUnits: [{
      unitId: 'op-A',
      operationId: 'A',
      resultObjectClasses: ['Thing'],
      ownerPackageIds: ['pkg-1', 'pkg-2'],
      roleCandidate,
      obligation: {},
    }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

/** The ledger row an author writes; `owner` is the only cell under test. */
// [::TICKET::] PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-328 --for-spec --no-implementation-order`.
function ledgerRfc(owner) {
  return [
    '# Package RFC',
    '',
    '## 3.1 A',
    '',
    'The operation is designed here.',
    '',
    '## Distribution ledger',
    '',
    'RFC.md is canonical for this package; the projection is an input, not an authority.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    `| op-A | operation | ${owner} | §3.1 | designed here |`,
    '',
  ].join('\n');
}

// [::TICKET::] PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-328 --for-spec --no-implementation-order`.
function unitOf(result) {
  return result.map.units.find((unit) => unit.unitId === 'op-A');
}

test('C001 an implementer annotation reaches the map and is rendered back', () => {
  const result = renderDistribution(ledgerRfc('pkg-1 (implementer) + pkg-2'), coOwnedView('pkg-1'));
  assert.equal(result.ok, true, result.code);
  assert.equal(unitOf(result).role, 'implementer');
  assert.deepEqual(unitOf(result).implementationSections, ['3.1 A']);
  assert.match(result.rfc, /pkg-1 \(implementer\)/);
});

test('C001 a counterpart annotation is consumer', () => {
  const result = renderDistribution(
    ledgerRfc('pkg-1 (implementer) + pkg-2 (consumer)'),
    coOwnedView('pkg-2'),
  );
  assert.equal(result.ok, true, result.code);
  assert.equal(unitOf(result).role, 'consumer');
  assert.match(result.rfc, /pkg-2 \(consumer\)/);
});

test('C001 an unknown annotation is not a role', () => {
  const result = renderDistribution(ledgerRfc('pkg-1 (owner) + pkg-2'), coOwnedView('pkg-1'));
  assert.equal(result.ok, true, result.code);
  assert.notEqual(unitOf(result).role, 'owner');
  assert.equal(unitOf(result).role, undefined);
});

test('C001 a legacy ledger keeps the roleCandidate fallback', () => {
  const result = renderDistribution(
    ledgerRfc('pkg-1'),
    coOwnedView('pkg-1', 'implementer'),
  );
  assert.equal(result.ok, true, result.code);
  assert.equal(unitOf(result).role, 'implementer');
});

test('C001 an authored annotation overrides a role already in the map', () => {
  const first = renderDistribution(
    ledgerRfc('pkg-1 + pkg-2'),
    coOwnedView('pkg-1'),
  );
  assert.equal(first.ok, true, first.code);
  assert.equal(unitOf(first).role, undefined);

  // The author edits the ledger table, not the generated map block.
  const authored = first.rfc.replace(
    '| op-A | operation | pkg-1 + pkg-2 |',
    '| op-A | operation | pkg-1 (implementer) + pkg-2 |',
  );
  const second = renderDistribution(authored, coOwnedView('pkg-1'));
  assert.equal(second.ok, true, second.code);
  assert.equal(unitOf(second).role, 'implementer');
  assert.match(second.rfc, /pkg-1 \(implementer\)/);
});

test('C001 the authored roles pass checkOwnerRoles', () => {
  const implementer = renderDistribution(
    ledgerRfc('pkg-1 (implementer) + pkg-2'),
    coOwnedView('pkg-1'),
  );
  const consumer = renderDistribution(
    ledgerRfc('pkg-1 (implementer) + pkg-2 (consumer)'),
    coOwnedView('pkg-2'),
  );
  assert.equal(implementer.ok, true, implementer.code);
  assert.equal(consumer.ok, true, consumer.code);

  const verdict = checkOwnerRoles(
    [
      { packageId: 'pkg-1', units: implementer.map.units, residuals: [] },
      { packageId: 'pkg-2', units: consumer.map.units, residuals: [] },
    ],
    { activeOperationUnits: new Set(['op-A']) },
  );
  assert.equal(verdict.ok, true, verdict.code);
});

test('C001 a roleCandidate-derived role is not written as an authored annotation', () => {
  const result = renderDistribution(ledgerRfc('pkg-1 + pkg-2'), coOwnedView('pkg-1', 'implementer'));
  assert.equal(result.ok, true, result.code);
  assert.equal(unitOf(result).role, 'implementer');
  assert.doesNotMatch(result.rfc, /pkg-1 \(implementer\)/);
});

test('C001 removing an authored annotation reverts to the view candidate', () => {
  const first = renderDistribution(ledgerRfc('pkg-1 (implementer) + pkg-2'), coOwnedView('pkg-1'));
  assert.equal(first.ok, true, first.code);
  assert.equal(unitOf(first).role, 'implementer');

  const removed = first.rfc.replace(
    '| op-A | operation | pkg-1 (implementer) + pkg-2 |',
    '| op-A | operation | pkg-1 + pkg-2 |',
  );
  const second = renderDistribution(removed, coOwnedView('pkg-1'));
  assert.equal(second.ok, true, second.code);
  assert.equal(unitOf(second).role, undefined);
  assert.doesNotMatch(second.rfc, /pkg-1 \(implementer\)/);
});
