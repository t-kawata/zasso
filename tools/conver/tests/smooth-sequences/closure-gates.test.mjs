// [::TICKET::] PX-360 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-360 --for-spec --no-implementation-order`.
// The gates /smooth-sequences must not pass over.
//
// A pass from the acceptance gate used to mean only that its own checks found nothing.
// The grill's mechanical gates prove the obligation list is total; this file holds the
// rule that a failing one makes the acceptance gate unproven, so "smooth passes" and
// "the pipeline is closed" cannot come apart again.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CLOSURE_GATES, runClosureGates } from '../../.claude/scripts/smooth-sequences/lib/closure-gates.mjs';
import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';

test('the closure gates are the six the transaction runs', () => {
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
  const scripts = CLOSURE_GATES.map((gate) => gate.script);
  assert.deepEqual(scripts, [
    'check-obligation-coverage.js',
    'check-contribution-completeness.js',
    'check-distribution-completeness.js',
    'defect-report.js',
    'check-formula-completeness.js',
    'verify-api-consistency.mjs',
  ]);
  assert.deepEqual(CLOSURE_GATES[3].args('/workspace'), ['/workspace', '--gate']);
  assert.deepEqual(CLOSURE_GATES[4].args('/workspace'), ['/workspace']);
  assert.deepEqual(CLOSURE_GATES[5].args('/workspace'), ['--workspace=/workspace']);
});

test('a failing gate is reported by script and by the refusal it wrote', () => {
  const run = ({ script }) => (script === 'check-obligation-coverage.js'
    ? { script, exitCode: 1, reason: 'unstated denominator: 1' }
    : { script, exitCode: 0, reason: 'holds' });

  const result = runClosureGates({ root: '/workspace', run });

  assert.equal(result.ok, false);
  assert.equal(result.gates.length, 6);
  assert.equal(result.gates[0].script, 'check-obligation-coverage.js');
  assert.equal(result.gates[0].reason, 'unstated denominator: 1');
});

test('a failing closure gate keeps the certificate incomplete and names the repair', () => {
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    checks: [],
    readings: {},
    inputs: {},
    assurance: {},
    receiptDebt: [],
    closureGates: [{ script: 'check-obligation-coverage.js', exitCode: 1, reason: 'unstated denominator: 1' }],
  });

  assert.equal(certificate.status, 'incomplete');
  const entry = certificate.open.find((row) => row.id === 'CLOSURE:check-obligation-coverage.js');
  assert.notEqual(entry, undefined);
  assert.equal(entry.code, 'GRILL_GATE_FAILED');
  assert.equal(entry.subject, 'unstated denominator: 1');
});
