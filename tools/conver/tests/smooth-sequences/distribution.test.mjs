// @verifies C010
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { collectArtifactViewConsistency } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { sequenceOwners } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { defaultViews, materializeSmoothWorkspace, minimalV3Artifact, packageView } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-288 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-288 --for-spec --no-implementation-order`.
test('sequenceOwners unions owned, cross-boundary and obligation units', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    assert.equal(sequenceOwners(index).has('A-1'), true);
  } finally {
    workspace.remove();
  }
});

test('an operation and a realized sequence with no owner are distribution findings', () => {
  const artifact = minimalV3Artifact();
  artifact.operations.push({ ...artifact.operations[0], id: 'UnownedOperation' });
  artifact.sequences.push({ id: 'UnownedSequence', kind: 'entry', firstLine: 1, lastLine: 10, outcome: 'direct' });
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    const findings = collectArtifactViewConsistency(index).findings;
    assert.ok(findings.some((finding) => finding.checkId === 'S7.operation-distribution-missing' && finding.subject === 'UnownedOperation'));
    assert.ok(findings.some((finding) => finding.checkId === 'S7.sequence-distribution-missing' && finding.subject === 'UnownedSequence'));
  } finally {
    workspace.remove();
  }
});

test('an operation assigned only by an obligation unit is owned', () => {
  const artifact = minimalV3Artifact();
  artifact.operations.push({ ...artifact.operations[0], id: 'ObligationOnly' });
  const views = defaultViews();
  views['pkg-0001'].obligationUnits.push({ unitId: 'op-ObligationOnly', relation: 'assigns', subject: 'ObligationOnly', kind: 'operation' });
  const workspace = materializeSmoothWorkspace({ artifact, views });
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    const findings = collectArtifactViewConsistency(index).findings;
    assert.equal(findings.some((finding) => finding.checkId === 'S7.operation-distribution-missing' && finding.subject === 'ObligationOnly'), false);
  } finally {
    workspace.remove();
  }
});

test('the clean fixture has no distribution findings', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    const findings = collectArtifactViewConsistency(index).findings;
    assert.equal(findings.some((finding) => finding.checkId === 'S7.operation-distribution-missing'), false);
    assert.equal(findings.some((finding) => finding.checkId === 'S7.sequence-distribution-missing'), false);
  } finally {
    workspace.remove();
  }
});
