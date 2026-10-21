import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('a certificate with every obligation closed and every check measured is complete', () => {
  const certificate = buildCertificate({
    obligations: [
      { id: 'CHECK:S1.duplicate-id', class: 'mechanical', state: 'closed', subject: 'S1.duplicate-id' },
      { id: 'READ:UNCOVERED:OpA', class: 'semantic', state: 'closed', subject: 'OpA' },
    ],
    checks: [{ id: 'S1.duplicate-id', status: 'executed', evaluatedClaims: 3 }],
    judgments: [{ obligationId: 'READ:UNCOVERED:OpA', state: 'held', verdict: 'No' }],
  });
  assert.equal(certificate.status, 'complete');
  assert.equal(certificate.obligations.open, 0);
  assert.equal(certificate.obligations.closed, 2);
  assert.deepEqual(certificate.closed, ['CHECK:S1.duplicate-id', 'READ:UNCOVERED:OpA']);
});

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('a vacuous check keeps the certificate incomplete', () => {
  const certificate = buildCertificate({
    obligations: [{ id: 'CHECK:X', class: 'mechanical', state: 'closed', subject: 'X' }],
    checks: [{ id: 'X', status: 'vacuous', evaluatedClaims: 0 }],
  });
  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.open[0].id, 'X');
  assert.equal(certificate.open[0].reason, 'VACUOUS');
});
