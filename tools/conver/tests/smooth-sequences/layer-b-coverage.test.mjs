import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import {
  defaultAllocateManifest,
  defaultContractRegistry,
  defaultTreeManifest,
  materializeSmoothWorkspace,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

const NEW_BOUNDARY = 'boundary-009';

/** A workspace with one extra boundary and an optional ground. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function workspaceWithBoundary({ effects = ['ProduceFact'], ground = null } = {}) {
  const artifact = minimalV3Artifact();
  for (const operationId of effects) {
    const operation = artifact.operations.find((entry) => entry.id === operationId);
    operation.boundary_effects = [{ boundary: NEW_BOUNDARY, direction: 'provides' }];
  }
  if (ground !== null) artifact.boundary_grounds = [{ boundary: NEW_BOUNDARY, ground }];
  const treeManifest = defaultTreeManifest();
  treeManifest.dependencies.boundaries.push({
    id: NEW_BOUNDARY,
    provider_package: 'pkg-0001',
    consumer_package: 'pkg-0002',
    stage2_contract_scope: [],
  });
  const registry = [
    ...defaultContractRegistry(),
    {
      boundary_id: NEW_BOUNDARY,
      provider_package: 'pkg-0001',
      consumer_package: 'pkg-0002',
      clauses: {},
      source_refs: ['s-000002'],
    },
  ];
  return materializeSmoothWorkspace({ artifact, treeManifest, allocateManifest: defaultAllocateManifest(registry) });
}

/** The findings of one check id in a result. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function findingsOf(result, checkId) {
  return result.report.findings.filter((finding) => finding.checkId === checkId);
}

// @verifies C001
test('a declared boundary effect with no crossing and no ground is S5.boundary-uncovered', () => {
  const workspace = workspaceWithBoundary();
  try {
    const result = runCommand([workspace.root, '--audit']);
    const findings = findingsOf(result, 'S5.boundary-uncovered');
    assert.equal(findings.length, 1);
    assert.ok(findings[0].subject.includes(NEW_BOUNDARY));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a non-empty boundary ground suppresses the finding', () => {
  const ungrounded = workspaceWithBoundary();
  try {
    assert.equal(findingsOf(runCommand([ungrounded.root, '--audit']), 'S5.boundary-uncovered').length, 1);
  } finally {
    ungrounded.remove();
  }
  const workspace = workspaceWithBoundary({ ground: 'not crossed by an enumerated sequence' });
  try {
    assert.equal(findingsOf(runCommand([workspace.root, '--audit']), 'S5.boundary-uncovered').length, 0);
  } finally {
    workspace.remove();
  }
});

test('an empty boundary ground does not suppress the finding', () => {
  const workspace = workspaceWithBoundary({ ground: '   ' });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.boundary-uncovered').length, 1);
  } finally {
    workspace.remove();
  }
});

test('a crossed boundary is not reported', () => {
  const ungrounded = workspaceWithBoundary();
  try {
    assert.equal(findingsOf(runCommand([ungrounded.root, '--audit']), 'S5.boundary-uncovered').length, 1);
  } finally {
    ungrounded.remove();
  }
  const workspace = workspaceWithBoundary();
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.ok(!findingsOf(result, 'S5.boundary-uncovered').some((finding) => finding.subject.includes('boundary-001')));
  } finally {
    workspace.remove();
  }
});

test('one boundary effect declared by two operations is one finding', () => {
  const workspace = workspaceWithBoundary({ effects: ['ProduceFact', 'ConsumeFact'] });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S5.boundary-uncovered').length, 1);
  } finally {
    workspace.remove();
  }
});
