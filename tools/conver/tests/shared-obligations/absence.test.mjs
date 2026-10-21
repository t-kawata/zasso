import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeReadings } from '../../.claude/scripts/smooth-sequences/lib/readings-summary.mjs';
import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';
import { materializeSmoothWorkspace } from '../smooth-sequences/helpers/workspace-fixture.mjs';

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('absent readings leave the worklist open and the certificate incomplete', () => {
  const workspace = materializeSmoothWorkspace();
  const registry = [{ id: 'READ:UNCOVERED:OpA', class: 'semantic', state: 'open', required: true }];
  const readings = summarizeReadings(workspace.root, { registry });
  try {
    assert.equal(readings.status, 'absent');
    assert.equal(readings.open[0].code, 'MISSING_EVIDENCE');
    const certificate = buildCertificate({ obligations: registry, checks: [], readings });
    assert.equal(certificate.status, 'incomplete');
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('an empty uncovered file does not close a non-empty worklist', () => {
  const workspace = materializeSmoothWorkspace({ readings: { uncovered: [] } });
  const registry = [
    { id: 'READ:UNCOVERED:OpA', class: 'semantic', state: 'open', required: true },
    { id: 'READ:UNCOVERED:OpB', class: 'semantic', state: 'open', required: true },
  ];
  const readings = summarizeReadings(workspace.root, { registry });
  try {
    assert.equal(readings.uncovered.records, 0);
    assert.equal(readings.uncovered.missing.length, 2);
    assert.ok(readings.open.every((entry) => entry.code === 'MISSING_EVIDENCE'));
  } finally {
    workspace.remove();
  }
});
