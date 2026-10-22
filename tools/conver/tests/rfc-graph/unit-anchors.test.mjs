// PX-306 @verifies C002
// The RFC section anchor is the only place a unit id enters the graph. The connector reads
// the anchors under each heading and attaches them to the node that heading built, so the
// graph carries what the ledger assigned without relying on an AI to retype it.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignUnitIdsFromRfc,
  collectLedgerUnitIds,
  collectViewUnitIds,
  readSectionUnitAnchors,
  unassignedAnchors,
} from '../../.claude/scripts/rfc-graph/lib/unit-ids.mjs';

const RFC = [
  '## 3.1 Issue',
  '<!-- unit: op-IssueCertificate -->',
  'Issues a certificate.',
  '',
  '## 3.2 Consume',
  '<!-- unit: op-ConsumeCertificate -->',
  'Consumes a certificate.',
  '',
  '## 3.3 Appendix',
  '<!-- unit: op-Orphan -->',
  'No node builds this section.',
].join('\n');

const nodes = [
  { id: 'N0001', title: '3.1 Issue', headingRefs: [{ heading: 2, texts: ['3.1 Issue'] }] },
  { id: 'N0002', title: '3.2 Consume', headingRefs: [{ heading: 2, texts: ['3.2 Consume'] }] },
];

test('C002 section anchors are read under their heading', () => {
  const sections = readSectionUnitAnchors(RFC);
  assert.deepEqual(sections.find((entry) => entry.headingText === '3.1 Issue').unitIds, ['op-IssueCertificate']);
  assert.deepEqual(sections.find((entry) => entry.headingText === '3.2 Consume').unitIds, ['op-ConsumeCertificate']);
});

test('C002 anchors are attached to the node their heading built', () => {
  const graph = assignUnitIdsFromRfc({ nodes }, RFC);
  assert.deepEqual(graph.nodes[0].unitIds, ['op-IssueCertificate']);
  assert.deepEqual(graph.nodes[1].unitIds, ['op-ConsumeCertificate']);
  assert.deepEqual(nodes[0].unitIds, undefined, 'the input graph is not mutated');
});

test('C002 an anchor no node owns is reported rather than dropped', () => {
  assert.deepEqual(unassignedAnchors({ nodes }, RFC), ['op-Orphan']);
});

test('C002 view and ledger unit ids are read from the material', () => {
  const viewUnits = collectViewUnitIds([{
    view: {
      ownedOperationUnits: [{ unitId: 'op-A' }],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [{ unitId: 'xdir-S' }],
      obligationUnits: [{ unitId: 'ctr-boundary-005' }],
    },
  }]);
  assert.deepEqual(viewUnits.sort(), ['ctr-boundary-005', 'op-A', 'xdir-S']);
  assert.deepEqual(
    collectLedgerUnitIds([
      { unit: 'op-A', kind: 'operation' },
      { unit: 'op-B', kind: 'declared-residual' },
      { unit: 'N0001', kind: 'operation' },
    ]),
    ['op-A'],
  );
});
