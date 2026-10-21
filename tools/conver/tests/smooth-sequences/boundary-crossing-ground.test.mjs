import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

/** The findings of one check id. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function findingsOf(result, checkId) {
  return result.report.findings.filter((finding) => finding.checkId === checkId);
}

/** A workspace whose boundary is crossed only by the provider side. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function oneSidedCrossing({ ground = null } = {}) {
  const artifact = minimalV3Artifact();
  artifact.steps = artifact.steps.filter((step) => step.operation !== 'ConsumeFact');
  const consumer = artifact.operations.find((operation) => operation.id === 'ConsumeFact');
  consumer.disposition = 'excluded';
  consumer.position = 'excluded';
  if (ground !== null) artifact.boundary_grounds = [{ boundary: 'boundary-001', ground }];
  return materializeSmoothWorkspace({ artifact });
}

/** A workspace whose boundary no step crosses. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function uncrossedBoundary({ ground = null } = {}) {
  const artifact = minimalV3Artifact();
  artifact.steps = artifact.steps.map((step) => ({
    ...step,
    contract: { ...step.contract, crosses: [] },
    contract_prose: step.contract_prose ?? step.quote,
  }));
  if (ground !== null) artifact.boundary_grounds = [{ boundary: 'boundary-001', ground }];
  return materializeSmoothWorkspace({ artifact });
}

// @verifies C004
test('a non-empty ground suppresses the one-sided crossing finding', () => {
  const workspace = oneSidedCrossing({ ground: 'the consumer package owns no operations' });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.crossing-side-missing').length, 0);
    assert.equal(findingsOf(result, 'S5.boundary-uncovered').length, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('an empty ground leaves the one-sided crossing finding', () => {
  const workspace = oneSidedCrossing({ ground: '   ' });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.crossing-side-missing').length, 1);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a non-empty ground suppresses the uncovered boundary finding', () => {
  const workspace = uncrossedBoundary({ ground: 'the boundary is not crossed by an enumerated sequence' });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.boundary-uncovered').length, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('an empty ground leaves the uncovered boundary finding', () => {
  const workspace = uncrossedBoundary({ ground: '   ' });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.boundary-uncovered').length, 1);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a two-sided crossing is not affected by a ground', () => {
  const artifact = minimalV3Artifact();
  artifact.boundary_grounds = [{ boundary: 'boundary-001', ground: 'not crossed' }];
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.crossing-side-missing').length, 0);
  } finally {
    workspace.remove();
  }
});
