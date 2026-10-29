import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkContributionCompleteness, contributionWithheld } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import {
  materializeSmoothWorkspace,
  minimalV2Artifact,
  minimalV3Artifact,
  rfcBody,
} from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-275 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-275 --for-spec --no-implementation-order`.

function indexOf(input) {
  const workspace = materializeSmoothWorkspace(input);
  return { workspace, index: indexArtifact(loadWorkspace(workspace.root)) };
}

// @verifies C004
test('a required operation with a ledger row passes', () => {
  const { workspace, index } = indexOf({});
  try {
    assert.deepEqual(checkContributionCompleteness(index), []);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a missing ledger row is a finding even when the contribution is grounded not_required', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0].registry_contribution = 'not_required';
  artifact.operations[0].registry_contribution_ground = 'the object is derived';
  const { workspace, index } = indexOf({
    artifact,
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

// @verifies C004
test('a grounded not_required with a ledger row passes', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0].registry_contribution = 'not_required';
  artifact.operations[0].registry_contribution_ground = 'the object is derived';
  const { workspace, index } = indexOf({ artifact });
  try {
    assert.deepEqual(checkContributionCompleteness(index), []);
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a contribution value outside required and not_required is a finding', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0].registry_contribution = 'sometimes';
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkContributionCompleteness(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S4.contribution-missing' && finding.subject.includes('ProduceFact')));
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('not_required without a ground is a finding', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0].registry_contribution = 'not_required';
  delete artifact.operations[0].registry_contribution_ground;
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkContributionCompleteness(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S4.contribution-ground-missing' && finding.subject.includes('ProduceFact')));
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a v2 artifact withholds contribution instead of guessing', () => {
  const { workspace, index } = indexOf({ artifact: minimalV2Artifact() });
  try {
    assert.deepEqual(checkContributionCompleteness(index), []);
    assert.deepEqual(contributionWithheld(index), [{
      layer: 'S4',
      check: 'S4.contribution',
      reason: 'v2 artifact carries no registry_contribution',
    }]);
  } finally {
    workspace.remove();
  }
});
