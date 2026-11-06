// PX-383 @verifies C003
// A typed check is executed only when it evaluated a typed proposition. A prose-only
// step set is not evidence for a typed check; it is notApplicable with a ground, and the
// evaluated claim count is the number of facts the check actually compared.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';
import { buildFamilySubChecks } from '../../.claude/scripts/smooth-sequences/lib/check-status.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

/** The index the detector would judge. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function indexOfWorkspace(input) {
  const workspace = materializeSmoothWorkspace(input);
  return { workspace, index: indexArtifact(loadWorkspace(workspace.root)) };
}

test('C003 a typed contract contributes one evaluated proposition', () => {
  const { workspace, index } = indexOfWorkspace({});
  try {
    const check = buildFamilySubChecks('meshing', index)
      .find((entry) => entry.id === 'S5.precondition-not-implied');

    assert.equal(check.status, 'executed');
    assert.equal(check.evaluatedClaims, 1);
  } finally {
    workspace.remove();
  }
});

test('C003 a prose-only step set is notApplicable for typed checks', () => {
  const proseArtifact = minimalV3Artifact();
  proseArtifact.steps = proseArtifact.steps.map((step) => ({
    ...step,
    contract: null,
    contract_prose: 'pre: the input is present',
  }));
  const { workspace, index } = indexOfWorkspace({ artifact: proseArtifact });
  try {
    const check = buildFamilySubChecks('meshing', index)
      .find((entry) => entry.id === 'S5.precondition-not-implied');

    assert.equal(check.status, 'notApplicable');
    assert.equal(check.evaluatedClaims, 0);
  } finally {
    workspace.remove();
  }
});

test('C003 prose never counts as a typed authored fact', async () => {
  const statusModule = await import('../../.claude/scripts/smooth-sequences/lib/check-status.mjs');
  const proseArtifact = minimalV3Artifact();
  proseArtifact.steps = proseArtifact.steps.map((step) => ({
    ...step,
    contract: null,
    contract_prose: 'pre: the input is present',
  }));
  const { workspace, index } = indexOfWorkspace({ artifact: proseArtifact });
  try {
    assert.equal(typeof statusModule.countTypedAuthoredSteps, 'function');
    assert.equal(statusModule.countTypedAuthoredSteps(index), 0);
  } finally {
    workspace.remove();
  }
});

test('C003 a notApplicable check is not an open certificate obligation', () => {
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    checks: [{
      id: 'S5.precondition-not-implied',
      family: 'meshing',
      status: 'notApplicable',
      ground: { line: 1, quote: 'the contracts are prose' },
    }],
    readings: {},
    inputs: {},
    assurance: {},
    receiptDebt: [],
  });

  assert.equal(certificate.open.some((entry) => entry.subject === 'S5.precondition-not-implied'), false);
});
