// PX-320 @verifies C001 C002
// The real producer and the final verifier in one chain. The artifact is schema-valid
// and omits step order; the view is built by buildPackageView, not hand-written.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';
import {
  artifactStepsForSequences,
  stepIdentityMatches,
} from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';
import {
  buildConsumerChainFixture,
  sequenceStepUnit,
} from './helpers/consumer-chain-fixture.mjs';

/** The finding codes a broken chain may report. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function codes(result) {
  return result.findings.map((finding) => finding.code);
}

test('C001 a schema valid artifact without order passes the chain', () => {
  const chain = buildConsumerChainFixture({ role: 'implementer', stepCount: 1 });
  const result = verifyChain({ ...chain, stage: 'graphify' });
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);

  const viewStep = sequenceStepUnit(chain.view).steps[0];
  const artifactStep = artifactStepsForSequences(chain.artifact, new Set(['S1'])).get('S1')[0].record;
  assert.equal(viewStep.order, 0);
  assert.equal(artifactStep.order, 0);
  assert.equal(stepIdentityMatches(artifactStep, viewStep), true);
});

test('C001 a reordered view still fails with an identity or order code', () => {
  const chain = buildConsumerChainFixture({ role: 'implementer', stepCount: 2 });
  const view = structuredClone(chain.view);
  const unit = sequenceStepUnit(view);
  unit.steps.reverse();
  unit.steps.forEach((step, index) => {
    step.order = index;
  });

  const result = verifyChain({ ...chain, view, stage: 'split' });
  assert.ok(codes(result).some((code) => code === 'STEP_IDENTITY_MISMATCH' || code === 'SEQUENCE_ORDER_MISMATCH'));
});

test('C002 a consumer owner passes while an implementer with a reference ticket fails', () => {
  const consumer = buildConsumerChainFixture({ role: 'consumer' });
  const consumerResult = verifyChain({ ...consumer, stage: 'split' });
  assert.deepEqual(
    consumerResult.findings.filter((finding) => finding.code === 'MISSING_IMPLEMENTER'),
    [],
  );

  const brokenImplementer = buildConsumerChainFixture({ role: 'implementer', ticketMode: 'reference' });
  const brokenResult = verifyChain({ ...brokenImplementer, stage: 'split' });
  assert.ok(brokenResult.findings.some((finding) =>
    finding.code === 'MISSING_IMPLEMENTER' && finding.subject === 'op-Op1'));
});

test('C002 a consumer owner never becomes an implementer', () => {
  const consumer = buildConsumerChainFixture({ role: 'consumer' });
  const operationUnit = consumer.tickets.phases[0].tickets[0].distribution.units
    .find((unit) => unit.kind === 'operation');
  assert.equal(operationUnit.obligation.mode, 'reference');
  const result = verifyChain({ ...consumer, stage: 'split' });
  const implementerFindings = result.findings.filter((finding) => finding.code === 'MISSING_IMPLEMENTER');
  assert.deepEqual(implementerFindings, []);
});
