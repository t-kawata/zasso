// [::TICKET::] PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-202 --for-spec --no-implementation-order`.
// PX-202 @verifies C002
// The dependency matrix check existed but no gate called it, so a reason code
// outside the vocabulary - or the field spelled `reason_code` - published silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkDependencyMatrix, REASON_CODES } from '../../../.claude/scripts/workspacify-tree/lib/dependencies.mjs';

const PACKAGES = [
  { id: 'pkg-a', name: 'alpha', layer: 'protocol' },
  { id: 'pkg-b', name: 'beta', layer: 'protocol' },
];

test('C002 every value of the frozen vocabulary is accepted', () => {
  for (const reasonCode of REASON_CODES) {
    const report = checkDependencyMatrix({ packages: PACKAGES, normalEdges: [{ from: 'pkg-b', to: 'pkg-a', reasonCode }], forbiddenEdges: [] });
    assert.equal(report.missingReasonCode.length, 0, `${reasonCode} must be accepted`);
  }
});

test('C002 a reason code outside the vocabulary is refused with the edge and the value', () => {
  const report = checkDependencyMatrix({
    packages: PACKAGES,
    normalEdges: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'totally-made-up' }],
    forbiddenEdges: [],
  });
  assert.equal(report.missingReasonCode.length, 1);
  assert.equal(report.missingReasonCode[0].from, 'pkg-b');
  assert.equal(report.missingReasonCode[0].to, 'pkg-a');
  assert.equal(report.missingReasonCode[0].reasonCode, 'totally-made-up');
});

test('C002 an edge carrying the misspelled key reason_code is refused, not ignored', () => {
  const report = checkDependencyMatrix({
    packages: PACKAGES,
    normalEdges: [{ from: 'pkg-b', to: 'pkg-a', reason_code: 'canonical-object' }],
    forbiddenEdges: [],
  });
  assert.equal(report.misspelledReasonCodeField.length, 1, JSON.stringify(report));
  assert.match(report.misspelledReasonCodeField[0].detail, /reason_code/);
  assert.equal(report.misspelledReasonCodeField[0].from, 'pkg-b');
  // The edge is also reported as missing a reason code: it has none the machine reads.
  assert.equal(report.missingReasonCode.length, 1);
});

test('C002 the vocabulary has one source of truth and the other checks still hold', () => {
  const source = checkDependencyMatrix({ packages: PACKAGES, normalEdges: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'canonical-object' }], forbiddenEdges: [] });
  assert.deepEqual(source.missingReasonCode, []);
  assert.deepEqual(source.undeclared, []);

  const undeclared = checkDependencyMatrix({ packages: PACKAGES, normalEdges: [{ from: 'pkg-b', to: 'pkg-ghost', reasonCode: 'canonical-object' }], forbiddenEdges: [] });
  assert.equal(undeclared.undeclared.length, 1);

  const forbidden = checkDependencyMatrix({
    packages: PACKAGES,
    normalEdges: [],
    forbiddenEdges: [{ from: 'pkg-a', to: 'pkg-b', reasonCode: 'composition' }],
  });
  assert.equal(forbidden.missingAlternative.length, 1, 'a forbidden edge without an alternative is still refused');
});
