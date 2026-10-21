import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import {
  materializeSmoothWorkspace,
  notASequenceArtifact,
} from './helpers/workspace-fixture.mjs';

/** The findings of one check id in a result. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function findingsOf(result, checkId) {
  return result.report.findings.filter((finding) => finding.checkId === checkId);
}

// @verifies C003
test('a notASequence region with predicateLimb none-applies and no ground is a finding', () => {
  const workspace = materializeSmoothWorkspace({ artifact: notASequenceArtifact() });
  try {
    const result = runCommand([workspace.root, '--audit']);
    const findings = findingsOf(result, 'S1.not-a-sequence-ground-missing');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].subject, 'G-1');
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('grounding.classification suppresses the finding', () => {
  const ungrounded = materializeSmoothWorkspace({ artifact: notASequenceArtifact() });
  try {
    assert.equal(findingsOf(runCommand([ungrounded.root, '--audit']), 'S1.not-a-sequence-ground-missing').length, 1);
  } finally {
    ungrounded.remove();
  }
  const workspace = materializeSmoothWorkspace({ artifact: notASequenceArtifact({ grounded: true }) });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S1.not-a-sequence-ground-missing').length, 0);
  } finally {
    workspace.remove();
  }
});

test('ground, reason and ground_ref each suppress the finding', () => {
  const ungrounded = materializeSmoothWorkspace({ artifact: notASequenceArtifact() });
  try {
    assert.equal(findingsOf(runCommand([ungrounded.root, '--audit']), 'S1.not-a-sequence-ground-missing').length, 1);
  } finally {
    ungrounded.remove();
  }
  for (const field of ['ground', 'reason', 'ground_ref']) {
    const artifact = notASequenceArtifact();
    artifact.sequences.at(-1)[field] = 'the region states no actor performing ordered acts';
    const workspace = materializeSmoothWorkspace({ artifact });
    try {
      const result = runCommand([workspace.root, '--audit']);
      assert.equal(findingsOf(result, 'S1.not-a-sequence-ground-missing').length, 0, field);
    } finally {
      workspace.remove();
    }
  }
});

test('an empty ground does not suppress the finding', () => {
  const artifact = notASequenceArtifact();
  artifact.sequences.at(-1).ground = '   ';
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S1.not-a-sequence-ground-missing').length, 1);
  } finally {
    workspace.remove();
  }
});
