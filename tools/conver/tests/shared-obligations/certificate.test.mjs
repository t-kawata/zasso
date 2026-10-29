// [::TICKET::] PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-293 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-291 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-291 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-291 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-291 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-291 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-291 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-291 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-291 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-291 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-291 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-291 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-291 --for-spec --no-implementation-order`.
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

// PX-311 @verifies C003
// Receipt debt blocks completion, but it is not an obligation: counting it in
// obligations.open made a strict gaia run report 1,585 while only 1,570 obligations
// were open. The two counts are separated and the arithmetic must still balance.
test('C003 receipt debt is reported apart from obligations.open', () => {
// [::TICKET::] PX-311 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-311 --for-spec --no-implementation-order`.
  const certificate = buildCertificate({
    obligations: [{ id: 'JUDGE:A', class: 'semantic', state: 'open' }],
    decisions: [{ obligationId: 'JUDGE:A', state: 'open', source: 'judgment' }],
    receiptDebt: [{ code: 'STALE_RECEIPT', phase: 'P1' }],
    checks: [],
    assurance: CLEAN_ASSURANCE,
  });
  assert.equal(certificate.obligations.open, 1);
  assert.equal(certificate.receipts.open, 1);
  assert.equal(certificate.receipts.stale, 1);
  assert.equal(certificate.receipts.missingWrite, 0);
  assert.equal(
    certificate.obligations.total,
    certificate.obligations.closed + certificate.obligations.open + certificate.obligations.stuck,
  );
  assert.ok(certificate.open.some((entry) => entry.id === 'RECEIPT:P1'));
  assert.equal(certificate.status, 'incomplete');
});

test('C003 receipt debt alone leaves obligations.open at zero', () => {
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    receiptDebt: [{ code: 'MISSING_WRITE_RECEIPT', path: 'educe-sequences/readings-judgment.jsonl' }],
    checks: [],
    assurance: CLEAN_ASSURANCE,
  });
  assert.equal(certificate.obligations.open, 0);
  assert.equal(certificate.receipts.open, 1);
  assert.equal(certificate.receipts.stale, 0);
  assert.equal(certificate.receipts.missingWrite, 1);
  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.open.length, 1);
});

test('C003 a closure gate entry is not counted as an obligation either', () => {
  const certificate = buildCertificate({
    obligations: [{ id: 'JUDGE:A', class: 'semantic', state: 'open' }],
    decisions: [{ obligationId: 'JUDGE:A', state: 'held', source: 'judgment' }],
    closureGates: [{ script: 'defect-report.js', exitCode: 1, reason: 'a ground is missing' }],
    checks: [],
    assurance: CLEAN_ASSURANCE,
  });
  assert.equal(certificate.obligations.open, 0);
  assert.equal(certificate.receipts.open, 0);
  assert.equal(certificate.status, 'incomplete');
  assert.ok(certificate.open.some((entry) => entry.id === 'CLOSURE:defect-report.js'));
});
