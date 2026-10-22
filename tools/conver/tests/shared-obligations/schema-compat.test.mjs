// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCertificate,
  detectSchemaDowngrade,
} from '../../.claude/scripts/shared-obligations/certificate.mjs';

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
};

// @verifies C018
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C018 the closure certificate always writes schema 3', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const certificate = buildCertificate({
    schemaVersion: 2,
    obligations: [],
    decisions: [],
    checks: [],
    assurance: CLEAN_V3_ASSURANCE,
  });
  assert.equal(certificate.schemaVersion, 3);
});

// @verifies C018
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C018 a v3 history that is now v2 is an UNPROVEN_DOWNGRADE', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = detectSchemaDowngrade({
    status: { schemaHistory: [3, 2] },
    artifact: { schema_version: 2 },
    baseline: { provenance: { schemaHistory: [3] } },
  });
  assert.equal(result.code, 'UNPROVEN_DOWNGRADE');
});

// @verifies C018
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C018 a v2-only history is not a downgrade', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = detectSchemaDowngrade({
    status: { schemaHistory: [2] },
    artifact: { schema_version: 2 },
    baseline: { provenance: { schemaHistory: [2] } },
  });
  assert.equal(result.code, null);
});
