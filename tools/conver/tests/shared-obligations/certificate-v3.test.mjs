// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const CLEAN_V3_ASSURANCE = {
  basisResolvedRatio: 1,
  quoteGroundedRatio: 1,
  templateAttackRatio: 0,
  inheritedRatio: 0,
  escapeActConflictCount: 0,
  staleReceiptCount: 0,
  effortCoverage: 1,
  blindAttackRatio: 1,
  discriminatingRatio: 1,
  rejudgeAgreement: 1,
  staleReaderGenerationCount: 0,
  generationMismatchCount: 0,
  rereadCount: 3768,
};

// @verifies C014
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C014 a certificate with clean v3 counters is complete at schema 3', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    checks: [],
    assurance: CLEAN_V3_ASSURANCE,
  });
  assert.equal(certificate.status, 'complete');
  assert.equal(certificate.schemaVersion, 3);
  assert.equal(certificate.assuranceSchemaVersion, 1);
  assert.equal(certificate.assurance.provisionalRecords, 0);
  assert.equal(certificate.assurance.anchoredRatio, 1);
});

// @verifies C014
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C014 a missing v3 counter is ASSURANCE_UNFALSIFIABLE and incomplete', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    checks: [],
    assurance: {},
  });
  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.open.some((entry) => entry.code === 'ASSURANCE_UNFALSIFIABLE'), true);
});

// @verifies C014
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C014 a dirty v3 counter keeps the certificate incomplete', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    checks: [],
    assurance: { ...CLEAN_V3_ASSURANCE, templateAttackRatio: 0.5 },
  });
  assert.equal(certificate.status, 'incomplete');
});

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
test('C004 a stale reader generation keeps the certificate incomplete', () => {
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    checks: [],
    assurance: { ...CLEAN_V3_ASSURANCE, staleReaderGenerationCount: 1 },
  });
  assert.equal(certificate.status, 'incomplete');
});

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
test('C004 a generation mismatch keeps the certificate incomplete', () => {
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    checks: [],
    assurance: { ...CLEAN_V3_ASSURANCE, generationMismatchCount: 1 },
  });
  assert.equal(certificate.status, 'incomplete');
});
