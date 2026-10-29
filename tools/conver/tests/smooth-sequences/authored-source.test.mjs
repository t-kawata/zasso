import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

/** The findings of one check id. */
// [::TICKET::] PX-286 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-286 --for-spec --no-implementation-order`.
function findingsOf(result, checkId) {
  return result.report.findings.filter((finding) => finding.checkId === checkId);
}

// @verifies C003
test('a clean authored contract has no missing-source finding', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV3Artifact() });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.authored-source-missing').length, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('an authored fact citing a different line is reported', () => {
  const artifact = minimalV3Artifact();
  artifact.steps[0].contract.authored.post[0].source.line = 99;
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--audit']);
    const findings = findingsOf(result, 'S5.authored-source-missing');
    assert.equal(findings.length, 1);
    assert.ok(findings[0].subject.includes(artifact.steps[0].id));
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('an authored fact without a source object is reported', () => {
  const artifact = minimalV3Artifact();
  artifact.steps[0].contract.authored.post[0] = 'order_id';
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.authored-source-missing').length, 1);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('a quote that is not in the step quote is reported', () => {
  const artifact = minimalV3Artifact();
  const consumer = artifact.steps.find((step) => step.operation === 'ConsumeFact');
  consumer.contract.authored.pre[0].source.quote = 'a sentence the step never wrote';
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--audit']);
    const findings = findingsOf(result, 'S5.authored-source-missing');
    assert.equal(findings.length, 1);
    assert.ok(findings[0].subject.includes(consumer.id));
  } finally {
    workspace.remove();
  }
});
