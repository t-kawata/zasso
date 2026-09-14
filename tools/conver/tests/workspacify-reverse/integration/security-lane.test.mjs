// @verifies C001
// @verifies C002
/**
 * The security lane, end to end over the real claim ledger.
 *
 * The classification is exercised against the ledger P22-5 actually produced for
 * `siprs-for-reverse` rather than against a fixture written to agree with the
 * code. That matters more here than elsewhere: the unit tests prove each category
 * is reachable, and only this file can show whether the lane classifies anything
 * on the corpus the phase is measuring. A lane that finds nothing is a measurement,
 * not a success — which is why the counts are asserted to be reported rather than
 * asserted to be non-zero.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CROSS_CUTTING_RISK_CATEGORIES,
  LANE_MEMBERSHIP,
  RISK_CATEGORIES,
  assertLanesAreSeparate,
  blockCanonisation,
  classifySecurityLane,
  renderLaneReport,
} from '../../../.claude/scripts/workspacify-reverse/lib/security-lane.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUN_SCRIPT = fileURLToPath(new URL('../../../.claude/scripts/workspacify-reverse/run.mjs', import.meta.url));
const LEDGER_PATH = fileURLToPath(
  new URL('../../../tests/workspacify-reverse/analysis/CLAIM-LEDGER.json', import.meta.url),
);

/** The ledger names its own population root; the anchors are read from there. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function loadRealLedger() {
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  return { ledger, subjectAvailable: existsSync(ledger.root) };
}

const ledgerPresent = existsSync(LEDGER_PATH);
const skip = ledgerPresent ? false : 'the claim ledger P22-5 produces is not present';

test('IT-1: high-risk claims in the real corpus are classified into the lane', { skip }, () => {
  const { ledger, subjectAvailable } = loadRealLedger();
  if (!subjectAvailable) {
    // The lane reads the source text at each anchor, so without the population
    // there is nothing to classify — and saying so is not the same as finding none.
    return;
  }

  const classification = classifySecurityLane(ledger);

  assert.equal(classification.root, ledger.root);
  assert.equal(classification.counts.total, ledger.claims.length);
  assert.equal(classification.counts.total,
    classification.counts.security + classification.counts.ordinary + classification.counts.unclassified);

  // A lane that classifies nothing on a corpus with an FFI boundary, a security
  // module and an unsafe-isolation test is measurable rather than merely suspicious.
  assert.ok(
    classification.counts.security > 0,
    `the security lane is empty over ${ledger.claims.length} claims: ${renderLaneReport(classification)}`,
  );

  for (const entry of classification.lane.security) {
    assert.equal(entry.lane, LANE_MEMBERSHIP.SECURITY);
    assert.ok(entry.risk_categories.length > 0);
    assert.ok(entry.risk_categories.every((c) => RISK_CATEGORIES.includes(c)));
  }

  // Every category is reported, so a zero reads as a measurement rather than as a
  // category nobody looked for.
  for (const category of CROSS_CUTTING_RISK_CATEGORIES) {
    assert.equal(Object.hasOwn(classification.categories, category), true);
  }
});

test('IT-1b: no lane claim in the real corpus is canonisable without a human authority record', { skip }, () => {
  const { ledger, subjectAvailable } = loadRealLedger();
  if (!subjectAvailable) return;

  const classification = classifySecurityLane(ledger);
  assert.ok(classification.counts.security > 0);

  for (const entry of classification.lane.security) {
    const decision = blockCanonisation(entry, {
      authorityRecord: null,
      falsificationPlan: [{ channel: 'sandbox execution', evidence_mode: 'runtime_dynamic' }],
    });
    assert.equal(decision.canonisation_blocked, true);
    assert.equal(decision.claim_id, entry.claim_id);
  }
});

test('IT-3: the lane remains structurally distinct from the ordinary lanes in the emitted structure', { skip }, () => {
  const { ledger, subjectAvailable } = loadRealLedger();
  if (!subjectAvailable) return;

  const classification = classifySecurityLane(ledger);

  assert.equal(assertLanesAreSeparate(classification), true);
  assert.equal(classification.lane.security === classification.lane.ordinary, false);

  const securityIds = new Set(classification.lane.security.map((e) => e.claim_id));
  for (const entry of classification.lane.ordinary) {
    assert.equal(securityIds.has(entry.claim_id), false);
    assert.equal(entry.lane, LANE_MEMBERSHIP.ORDINARY);
  }
});

test('the lane report names the categories it found none of, in plain English', { skip }, () => {
  const { ledger, subjectAvailable } = loadRealLedger();
  if (!subjectAvailable) return;

  const classification = classifySecurityLane(ledger);
  const report = renderLaneReport(classification);

  for (const category of RISK_CATEGORIES) assert.match(report, new RegExp(category));
  assert.match(report, new RegExp(String(classification.counts.security)));
  assert.ok(!/succeeded|failed/i.test(report), 'the report must not use a verdict vocabulary');
});

test('IT-2: the P22-1 forward-rotation regression gate exits 0', () => {
  const result = spawnSync(process.execPath, [RUN_SCRIPT, 'regression', 'check'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /proved/);
});
