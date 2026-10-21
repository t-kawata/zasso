// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-292 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';

const CLEAN_ASSURANCE = {
  anchoredRatio: 1,
  genericBasis: 0,
  reusedBasis: 0,
  staleRecords: 0,
  provisionalRecords: 0,
  unattackedTier1: 0,
  independentAttacks: 1,
};

// @verifies C002
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a certificate with held, proven and reading decisions is complete', () => {
  const certificate = buildCertificate({
    obligations: [
      { id: 'CHECK:S1.duplicate-id', class: 'mechanical', state: 'closed', subject: 'S1.duplicate-id' },
      { id: 'JUDGE:TRANSLATION:bd-1', class: 'semantic', state: 'open', subject: 'bd-1' },
      { id: 'READ:INQUEST:s1:omission', class: 'semantic', state: 'closed', subject: 's1:omission' },
    ],
    decisions: [
      { obligationId: 'CHECK:S1.duplicate-id', state: 'proven', source: 'mechanical' },
      { obligationId: 'JUDGE:TRANSLATION:bd-1', state: 'held', source: 'judgment' },
      { obligationId: 'READ:INQUEST:s1:omission', state: 'held', source: 'reading' },
    ],
    checks: [{ id: 'S1.duplicate-id', status: 'executed', evaluatedClaims: 3 }],
    assurance: CLEAN_ASSURANCE,
  });
  assert.equal(certificate.status, 'complete');
  assert.equal(certificate.obligations.open, 0);
  assert.equal(certificate.obligations.closed, 3);
  assert.equal(certificate.judged.total, 1);
  assert.equal(certificate.judged.held, 1);
  assert.equal(certificate.readings.held, 1);
  assert.deepEqual(certificate.closed, ['CHECK:S1.duplicate-id', 'JUDGE:TRANSLATION:bd-1', 'READ:INQUEST:s1:omission']);
});

// @verifies C002
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a broken decision keeps the certificate incomplete', () => {
  const certificate = buildCertificate({
    obligations: [{ id: 'JUDGE:TRANSLATION:bd-1', class: 'semantic', state: 'open', required: true }],
    decisions: [{ obligationId: 'JUDGE:TRANSLATION:bd-1', state: 'broken', source: 'judgment', reason: 'COUNTEREXAMPLE_UNREBUTTED' }],
    checks: [],
    assurance: CLEAN_ASSURANCE,
  });
  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.judged.broken, 1);
  assert.equal(certificate.open[0].reason, 'COUNTEREXAMPLE_UNREBUTTED');
});

// @verifies C002
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a stuck decision keeps the certificate incomplete', () => {
  const certificate = buildCertificate({
    obligations: [{ id: 'JUDGE:TRANSLATION:bd-1', class: 'semantic', state: 'open', required: true }],
    decisions: [{ obligationId: 'JUDGE:TRANSLATION:bd-1', state: 'stuck', source: 'judgment', reason: 'ATTACK_UNRESOLVED' }],
    checks: [],
    assurance: CLEAN_ASSURANCE,
  });
  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.judged.stuck, 1);
  assert.equal(certificate.obligations.stuck, 1);
});

// @verifies C002
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('an obligation without a decision is open, never assumed held', () => {
  const certificate = buildCertificate({
    obligations: [{ id: 'JUDGE:TRANSLATION:bd-1', class: 'semantic', state: 'closed', required: true }],
    decisions: [],
    checks: [],
    assurance: CLEAN_ASSURANCE,
  });
  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.open[0].reason, 'NO_DECISION');
});

// @verifies C002
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a vacuous check keeps the certificate incomplete', () => {
  const certificate = buildCertificate({
    obligations: [{ id: 'CHECK:X', class: 'mechanical', state: 'closed', required: true }],
    decisions: [{ obligationId: 'CHECK:X', state: 'proven', source: 'mechanical' }],
    checks: [{ id: 'X', status: 'vacuous', evaluatedClaims: 0 }],
    assurance: CLEAN_ASSURANCE,
  });
  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.open[0].id, 'X');
  assert.equal(certificate.open[0].reason, 'VACUOUS');
});

// @verifies C002
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a non-zero assurance counter keeps the certificate incomplete', () => {
  const certificate = buildCertificate({
    obligations: [{ id: 'JUDGE:TRANSLATION:bd-1', class: 'semantic', state: 'open', required: true }],
    decisions: [{ obligationId: 'JUDGE:TRANSLATION:bd-1', state: 'held', source: 'judgment' }],
    checks: [],
    assurance: { ...CLEAN_ASSURANCE, genericBasis: 1 },
  });
  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.assurance.genericBasis, 1);
});
