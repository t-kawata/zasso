'use strict';
// PX-397 @verifies C002

/**
 * PX-397 — the repair plan, the debt check and the completion certificate.
 *
 * The plan is a deterministic worklist: identical findings collapse, and repair
 * order follows the asset class. Debt is an identity-set relation between two
 * runs. A certificate exists only when the proof it records exists.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createFinding,
  findingIdentity,
  findingsDigest,
} = require('../../.claude/scripts/tickets/lib/gate-finding.js');
const {
  buildRepairPlan,
  repairRank,
  assetClassOf,
} = require('../../.claude/scripts/tickets/repair-plan.js');
const { detectDebt, debtFinding } = require('../../.claude/scripts/tickets/gate-debt.js');
const {
  buildCertificate,
  writeCertificate,
} = require('../../.claude/scripts/tickets/completion-certificate.js');

/** A finding for the given code. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function finding(code, asset = 'PX-1/' + code) {
  return createFinding({
    code,
    asset,
    problem: 'problem for ' + code,
    fixes: [{ tool: 'patch-ticket', input: { field: code } }],
    rerun: 'rerun ' + code,
  });
}

test('C002: repair-plan deduplicates by identity', () => {
  const plan = buildRepairPlan([
    finding('CONTRACT_TEST_MISSING'),
    finding('CONTRACT_TEST_MISSING'),
  ]);

  assert.equal(plan.count, 1);
  assert.equal(plan.byCode.CONTRACT_TEST_MISSING, 1);
});

test('C002: repair-plan orders contract before test before annotation', () => {
  const plan = buildRepairPlan([
    finding('ANNOTATION_MISSING'),
    finding('TEST_MISSING'),
    finding('CONTRACT_TEST_MISSING'),
  ]);

  assert.deepEqual(
    plan.findings.map((entry) => entry.code),
    ['CONTRACT_TEST_MISSING', 'TEST_MISSING', 'ANNOTATION_MISSING'],
  );
  assert.ok(repairRank('contract') < repairRank('test'));
  assert.ok(repairRank('test') < repairRank('annotation'));
});

test('C002: asset classes derive from the code prefix', () => {
  assert.equal(assetClassOf(finding('CONTRACT_TEST_MISSING')), 'contract');
  assert.equal(assetClassOf(finding('TEST_MISSING')), 'test');
  assert.equal(assetClassOf(finding('ANNOTATION_MISSING')), 'annotation');
  assert.equal(assetClassOf(finding('SPEC_FIELD_MISSING')), 'spec');
  assert.equal(assetClassOf(finding('FORMULA_SYMBOL_MISSING')), 'formula');
  assert.equal(assetClassOf(finding('SOMETHING_ELSE')), 'other');
});

test('C002: the plan digest equals the digest of its findings', () => {
  const findings = [finding('TEST_MISSING'), finding('CONTRACT_TEST_MISSING')];
  const plan = buildRepairPlan(findings);

  assert.equal(plan.digest, findingsDigest(plan.findings));
});

test('C002: debt increases when the identity set grows', () => {
  const previous = [finding('CONTRACT_TEST_MISSING', 'PX-1/C001')];
  const current = [...previous, finding('TEST_MISSING', 'PX-1/C002')];

  const debt = detectDebt({ previousFindings: previous, currentFindings: current });
  assert.equal(debt.increased, true);
  assert.deepEqual(debt.added, [findingIdentity(current[1])]);

  const shrunk = detectDebt({ previousFindings: current, currentFindings: previous });
  assert.equal(shrunk.increased, false);
});

test('C002: the first run is not debt', () => {
  const debt = detectDebt({
    previousFindings: null,
    currentFindings: [finding('TEST_MISSING')],
  });

  assert.equal(debt.increased, false);
  assert.deepEqual(debt.added, []);
});

test('C002: a debt finding is itself repairable', () => {
  const previous = [finding('CONTRACT_TEST_MISSING', 'PX-1/C001')];
  const current = [...previous, finding('TEST_MISSING', 'PX-1/C002')];
  const entry = debtFinding(
    detectDebt({ previousFindings: previous, currentFindings: current }),
    current,
  );

  assert.equal(entry.code, 'DEBT_INCREASED');
  assert.deepEqual(entry.fixes, current[1].fixes);
  assert.equal(entry.rerun, current[1].rerun);
});

test('C002: a certificate requires every gate digest and the zero-finding proof', () => {
  assert.throws(
    () => buildCertificate({
      ticketKey: 'PX-1',
      gates: [{ name: 'plan', digest: '' }],
      runCount: 2,
      finalFindings: [],
    }),
    (error) => error.code === 'CERTIFICATE_INCOMPLETE',
  );
  assert.throws(
    () => buildCertificate({ ticketKey: 'PX-1', gates: [], runCount: 2, finalFindings: [] }),
    (error) => error.code === 'CERTIFICATE_INCOMPLETE',
  );
  assert.throws(
    () => buildCertificate({
      ticketKey: 'PX-1',
      gates: [{ name: 'plan', digest: 'abc' }],
      runCount: 1,
      finalFindings: [],
    }),
    (error) => error.code === 'CERTIFICATE_INCOMPLETE',
  );
  assert.throws(
    () => buildCertificate({
      ticketKey: 'PX-1',
      gates: [{ name: 'plan', digest: 'abc' }],
      runCount: 2,
      finalFindings: [finding('TEST_MISSING')],
    }),
    (error) => error.code === 'CERTIFICATE_INCOMPLETE',
  );
});

test('C002: a valid certificate records the proof and writes atomically', () => {
  const certificate = buildCertificate({
    ticketKey: 'PX-1',
    gates: [{ name: 'plan', digest: 'abc123' }, { name: 'review', digest: 'def456' }],
    runCount: 2,
    finalFindings: [],
  });

  assert.equal(certificate.ticketKey, 'PX-1');
  assert.equal(certificate.proof.zeroFindings, true);
  assert.equal(certificate.proof.stableRuns, 2);
  assert.equal(certificate.proof.findingCount, 0);
  assert.equal(certificate.gates.length, 2);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'certificate-'));
  const target = path.join(directory, 'certificate.json');
  writeCertificate(target, certificate);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), certificate);
});
