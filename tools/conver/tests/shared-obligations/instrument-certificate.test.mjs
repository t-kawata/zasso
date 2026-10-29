// [::TICKET::] PX-302 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-302 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';
import { decideAll } from '../../.claude/scripts/shared-obligations/decide.mjs';
import { summarizeInstrument } from '../../.claude/scripts/shared-obligations/instrument.mjs';
import { buildReport, renderConsoleReport } from '../../.claude/scripts/smooth-sequences/lib/report.mjs';

const CLEAN_V3_ASSURANCE = {
  basisResolvedRatio: 1,
  quoteGroundedRatio: 1,
  templateAttackRatio: 0,
  inheritedRatio: 0,
  escapeActConflictCount: 0,
  staleReceiptCount: 0,
  effortCoverage: 1,
  blindAttackRatio: 1,
  staleReaderGenerationCount: 0,
  generationMismatchCount: 0,
  rereadCount: 3768,
};

// @verifies C003
test('C003 a complete certificate carries the instrument block and the console prints it', () => {
  const decisions = decideAll({
    obligations: [],
    worklist: [],
    judgments: [],
    attacks: [],
    requireEffort: true,
  });
  const instrument = summarizeInstrument({
    readings: { inquest: { records: 1, yes: 0, no: 1 } },
    attacks: [],
  });
  const certificate = buildCertificate({
    obligations: [],
    decisions: decisions.decisions,
    checks: [],
    assurance: { ...CLEAN_V3_ASSURANCE, discriminatingRatio: null, rejudgeAgreement: null },
  });
  const report = buildReport({
    workspace: { root: '/workspace' },
    findings: [],
    checks: {},
    instrument,
  });

  assert.equal(certificate.status, 'complete');
  assert.deepEqual(report.instrument, instrument);
  assert.ok(renderConsoleReport(report).some((line) => line.startsWith('instrument:')));
});

// @verifies C002
test('C002 a measured rejudge disagreement keeps the certificate incomplete', () => {
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    checks: [],
    assurance: { ...CLEAN_V3_ASSURANCE, discriminatingRatio: null, rejudgeAgreement: 0 },
  });

  assert.equal(certificate.status, 'incomplete');
});

// @verifies C006
test('C006 a report without an instrument block still builds and renders', () => {
  const report = buildReport({ workspace: { root: '/workspace' }, findings: [], checks: {} });

  assert.equal(typeof report.instrument.inquest.yesRatio, 'number');
  assert.doesNotThrow(() => renderConsoleReport(report));
});
