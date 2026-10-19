import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { checkContributionCompleteness } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact, rfcBody } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function indexOf(input) {
  const workspace = materializeSmoothWorkspace(input);
  return { workspace, index: indexArtifact(loadWorkspace(workspace.root)) };
}

// @verifies C004
test('a grounded not_required closes an owned active operation without a row', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0].registry_contribution = 'not_required';
  artifact.operations[0].registry_contribution_ground = 'the specification states it on line 14147';
  const { workspace, index } = indexOf({
    artifact,
    rfcBodies: {
      'pkg-0001': rfcBody({ packageId: 'pkg-0001', operationId: 'ConsumeFact' }),
      'pkg-0002': rfcBody({ packageId: 'pkg-0002', operationId: 'ConsumeFact' }),
    },
  });
  try {
    const findings = checkContributionCompleteness(index);
    assert.equal(findings.filter((finding) => finding.subject.includes('ProduceFact')).length, 0);
  } finally {
    workspace.remove();
  }
});

test('an owned active operation with no row and no ground is a finding', () => {
  const { workspace, index } = indexOf({
    rfcBodies: {
      'pkg-0001': rfcBody({ packageId: 'pkg-0001', operationId: 'ConsumeFact' }),
      'pkg-0002': rfcBody({ packageId: 'pkg-0002', operationId: 'ConsumeFact' }),
    },
  });
  try {
    const findings = checkContributionCompleteness(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S4.contribution-missing' && finding.subject.includes('ProduceFact')));
  } finally {
    workspace.remove();
  }
});

test('a contribution for an operation no view owns is accepted as the only ownership record', () => {
  const { workspace, index } = indexOf({
    rfcBodies: {
      'pkg-0001': rfcBody({ packageId: 'pkg-0001', operationId: 'UnownedOperation' }),
      'pkg-0002': rfcBody({ packageId: 'pkg-0002', operationId: 'ConsumeFact' }),
    },
  });
  try {
    const findings = checkContributionCompleteness(index);
    assert.equal(findings.filter((finding) => finding.checkId === 'S4.contribution-unowned' && finding.subject.includes('UnownedOperation')).length, 0);
  } finally {
    workspace.remove();
  }
});

test('a row naming an operation the contributor does not own is a finding', () => {
  const { workspace, index } = indexOf({
    rfcBodies: {
      'pkg-0001': rfcBody({ packageId: 'pkg-0001', operationId: 'ConsumeFact' }),
      'pkg-0002': rfcBody({ packageId: 'pkg-0002', operationId: 'ConsumeFact' }),
    },
  });
  try {
    const findings = checkContributionCompleteness(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S4.contribution-unowned' && finding.subject.includes('ConsumeFact')));
  } finally {
    workspace.remove();
  }
});
