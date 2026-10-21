import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import {
  materializeSmoothWorkspace,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

const NEW_BOUNDARY = 'boundary-009';

/** The findings of one check id in a result. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function findingsOf(result, checkId) {
  return result.report.findings.filter((finding) => finding.checkId === checkId);
}

/** A workspace whose first operation declares a boundary effect. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function driftWorkspace({ ground = null } = {}) {
  const artifact = minimalV3Artifact();
  artifact.operations[0].boundary_effects = [{ boundary: NEW_BOUNDARY, direction: 'provides' }];
  if (ground !== null) artifact.boundary_grounds = [{ boundary: NEW_BOUNDARY, ground }];
  return materializeSmoothWorkspace({ artifact });
}

// @verifies C001
test('an effect that no step of the operation crosses is S6.boundary-effect-drift', () => {
  const workspace = driftWorkspace();
  try {
    const result = runCommand([workspace.root, '--audit']);
    const findings = findingsOf(result, 'S6.boundary-effect-drift');
    assert.equal(findings.length, 1);
    assert.ok(findings[0].subject.includes(NEW_BOUNDARY));
  } finally {
    workspace.remove();
  }
});

test('a boundary ground suppresses the drift finding', () => {
  const ungrounded = driftWorkspace();
  try {
    assert.equal(findingsOf(runCommand([ungrounded.root, '--audit']), 'S6.boundary-effect-drift').length, 1);
  } finally {
    ungrounded.remove();
  }
  const workspace = driftWorkspace({ ground: 'the boundary is carried by the operation envelope' });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S6.boundary-effect-drift').length, 0);
  } finally {
    workspace.remove();
  }
});

test('an effect crossed by the operation step produces no drift', () => {
  const uncrossed = driftWorkspace();
  try {
    assert.equal(findingsOf(runCommand([uncrossed.root, '--audit']), 'S6.boundary-effect-drift').length, 1);
  } finally {
    uncrossed.remove();
  }
  const workspace = driftWorkspace();
  try {
    const artifact = workspace.readArtifact();
    artifact.operations[0].boundary_effects = [{ boundary: 'boundary-001', direction: 'provides' }];
    const redirected = materializeSmoothWorkspace({ artifact });
    try {
      const result = runCommand([redirected.root, '--audit']);
      assert.equal(findingsOf(result, 'S6.boundary-effect-drift').length, 0);
    } finally {
      redirected.remove();
    }
  } finally {
    workspace.remove();
  }
});
