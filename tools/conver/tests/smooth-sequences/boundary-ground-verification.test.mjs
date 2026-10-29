// @verifies C012
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { collectCrossingContracts } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-b.mjs';
import {
  defaultAllocateManifest,
  defaultTreeManifest,
  materializeSmoothWorkspace,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-288 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-288 --for-spec --no-implementation-order`.
function workspaceWithGround(ground) {
  const artifact = minimalV3Artifact();
  artifact.boundary_grounds = [ground];
  const treeManifest = defaultTreeManifest();
  treeManifest.dependencies.boundaries.push({
    id: 'boundary-002',
    provider_package: 'pkg-0001',
    consumer_package: 'pkg-0002',
    dependency_reason_code: 'canonical-object',
    stage2_contract_scope: ['input', 'output'],
  });
  const allocateManifest = defaultAllocateManifest();
  allocateManifest.contract_registry.push({
    contract_id: 'contract-boundary-002',
    boundary_id: 'boundary-002',
    consumer_package: 'pkg-0002',
    provider_package: 'pkg-0001',
    clauses: { input: 'in', output: 'out' },
    source_refs: ['s-000001'],
  });
  return materializeSmoothWorkspace({ artifact, treeManifest, allocateManifest });
}

test('a ground that omits the sequence containing both sides is unverified', () => {
  const workspace = workspaceWithGround({ boundary: 'boundary-002', reason: 'not crossed', examinedSequences: [] });
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    const findings = collectCrossingContracts(index).findings;
    assert.ok(findings.some((finding) => finding.checkId === 'S5.boundary-ground-unverified' && finding.subject === 'boundary-002'));
  } finally {
    workspace.remove();
  }
});

test('a ground that names the sequence and explains the non-crossing is accepted', () => {
  const workspace = workspaceWithGround({ boundary: 'boundary-002', reason: 'the two sides are not adjacent in this sequence', examinedSequences: ['A-1'] });
  try {
    const index = indexArtifact(loadWorkspace(workspace.root));
    const findings = collectCrossingContracts(index).findings;
    assert.equal(findings.some((finding) => finding.checkId === 'S5.boundary-ground-unverified'), false);
  } finally {
    workspace.remove();
  }
});
