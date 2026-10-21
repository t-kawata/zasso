import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import {
  materializeSmoothWorkspace,
  minimalV3Artifact,
  projectionOnlyArtifact,
} from './helpers/workspace-fixture.mjs';

/** The findings of one check id in a result. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function findingsOf(result, checkId) {
  return result.report.findings.filter((finding) => finding.checkId === checkId);
}

// @verifies C002
test('a step with only a registry projection is S5.projection-only and is not meshed', () => {
  const workspace = materializeSmoothWorkspace({ artifact: projectionOnlyArtifact() });
  try {
    const result = runCommand([workspace.root, '--audit']);
    const projection = findingsOf(result, 'S5.projection-only');
    assert.equal(projection.length, 2);
    assert.equal(findingsOf(result, 'S5.precondition-not-implied').length, 0);
    assert.equal(findingsOf(result, 'S5.consumes-not-produced').length, 0);
  } finally {
    workspace.remove();
  }
});

test('an authored contract is not reported as projection-only', () => {
  const projection = materializeSmoothWorkspace({ artifact: projectionOnlyArtifact() });
  try {
    assert.equal(findingsOf(runCommand([projection.root, '--audit']), 'S5.projection-only').length, 2);
  } finally {
    projection.remove();
  }
  const workspace = materializeSmoothWorkspace({ artifact: minimalV3Artifact() });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.projection-only').length, 0);
  } finally {
    workspace.remove();
  }
});

test('contract_prose alone is not a registry projection', () => {
  const artifact = projectionOnlyArtifact();
  artifact.steps[0].contract_prose = 'the producer derives order_id';
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--audit']);
    const subjects = findingsOf(result, 'S5.projection-only').map((finding) => finding.subject);
    assert.ok(!subjects.includes(artifact.steps[0].id));
    assert.ok(subjects.includes(artifact.steps[1].id));
  } finally {
    workspace.remove();
  }
});

test('an empty authored object is still a projection-only step', () => {
  const artifact = projectionOnlyArtifact();
  artifact.steps[0].contract.authored = {};
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.ok(findingsOf(result, 'S5.projection-only').some((finding) => finding.subject === artifact.steps[0].id));
  } finally {
    workspace.remove();
  }
});

test('the consumer error set is compared even when the provider declares none', () => {
  const artifact = minimalV3Artifact();
  const consumer = artifact.steps.find((step) => step.operation === 'ConsumeFact');
  consumer.contract.authored.errors = ['boundary:boundary-001/errors/0'];
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.ok(findingsOf(result, 'S5.error-set-mismatch').some((finding) => finding.subject.includes(consumer.id)));
  } finally {
    workspace.remove();
  }
});

test('an authored consumer precondition absent from the provider post is reported', () => {
  const artifact = minimalV3Artifact();
  const consumer = artifact.steps.find((step) => step.operation === 'ConsumeFact');
  consumer.contract.authored.pre.push('boundary:boundary-001/input');
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.ok(findingsOf(result, 'S5.precondition-not-implied').some((finding) => finding.subject.includes(consumer.id)));
  } finally {
    workspace.remove();
  }
});
