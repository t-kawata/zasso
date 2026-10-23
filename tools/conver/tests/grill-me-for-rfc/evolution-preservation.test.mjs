// PX-307 @verifies C002
// The evolution loop rewrites the RFC. The renderer must either preserve the generated
// regions or fail precisely; it must never guess a replacement section.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderDistribution } from '../../.claude/scripts/grill-me-for-rfc/render-distribution.mjs';

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [{
      unitId: 'op-Produce',
      operationId: 'Produce',
      roleCandidate: 'implementer',
      obligation: { purpose: 'produce', specLines: [12] },
    }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureRfc() {
  return [
    '# Package RFC',
    '',
    'Introduction prose.',
    '',
    '## 3.1 Produce',
    '',
    'The operation is designed here.',
    '',
    '## Distribution ledger',
    '',
    'RFC.md is canonical for this package; the projection is an input, not an authority.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    '| op-Produce | operation | pkg-1 | §3.1 | designed here |',
    '',
  ].join('\n');
}

test('C002 a rewrite that keeps the section re-renders byte-identically', () => {
  const first = renderDistribution(fixtureRfc(), fixtureView());
  assert.equal(first.ok, true, first.code);
  const rewritten = first.rfc.replace('The operation is designed here.', 'The operation is designed here, with more detail.');
  const second = renderDistribution(rewritten, fixtureView());
  assert.equal(second.ok, true, second.code);
  assert.match(second.rfc, /with more detail/);
  assert.equal(second.rfc, renderDistribution(second.rfc, fixtureView()).rfc);
});

test('C002 a removed section fails MISSING_RFC_SECTION and writes nothing', () => {
  const first = renderDistribution(fixtureRfc(), fixtureView());
  const removed = first.rfc.replace('## 3.1 Produce', '## 3.1 Renamed');
  const second = renderDistribution(removed, fixtureView());
  assert.equal(second.ok, false);
  assert.equal(second.code, 'MISSING_RFC_SECTION');
  assert.deepEqual(second.missing, ['3.1 Produce']);
});

test('C002 a new view unit fails until it is mapped', () => {
  const first = renderDistribution(fixtureRfc(), fixtureView());
  const grown = {
    ...fixtureView(),
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      outcome: 'direct',
      steps: [],
    }],
  };
  const second = renderDistribution(first.rfc, grown);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'MISSING_UNIT');
  assert.deepEqual(second.missing, ['seq-A-1']);
});

test('C002 the generated regions are preserved across a prose rewrite', () => {
  const first = renderDistribution(fixtureRfc(), fixtureView());
  const rewritten = first.rfc.replace('Introduction prose.', 'Introduction prose, revised.');
  const second = renderDistribution(rewritten, fixtureView());
  assert.equal(second.ok, true, second.code);
  assert.match(second.rfc, /Introduction prose, revised\./);
  assert.match(second.rfc, /```json distribution-map/);
  assert.match(second.rfc, /<!-- unit: op-Produce -->/);
});
