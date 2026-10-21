import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CHECK_REGISTRY, evaluateCheckRegistry } from '../../.claude/scripts/smooth-sequences/lib/check-registry.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import {
  materializeSmoothWorkspace,
  minimalV2Artifact,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

/** The index a materialized workspace produces. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function indexOf(workspace) {
  return indexArtifact(loadWorkspace(workspace.root));
}

/** The blocked entry for one check id. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function blockedOf(result, checkId) {
  return result.blocked.find((entry) => entry.checkId === checkId);
}

// @verifies C002
test('every check descriptor declares requires, claims and denominator', () => {
  for (const entry of CHECK_REGISTRY) {
    assert.ok(Array.isArray(entry.requires), entry.id);
    assert.ok(entry.claims === 'spec' || entry.claims === 'projection', entry.id);
    assert.equal(typeof entry.denominator, 'function', entry.id);
  }
});

// @verifies C002
test('executed and blocked partition the registry', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    const executed = result.subChecks.filter((check) => check.status === 'executed');
    assert.equal(executed.length + result.blocked.length, CHECK_REGISTRY.length);
    assert.ok(result.blocked.every((entry) => entry.surface !== undefined && entry.reason !== undefined));
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a v2 artifact blocks the v3-only surfaces', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    assert.equal(blockedOf(result, 'S6.boundary-effect-drift').surface, 'operations[].boundary_effects');
    assert.equal(blockedOf(result, 'S5.precondition-not-implied').surface, 'steps[].contract.authored');
    assert.equal(blockedOf(result, 'S4.contribution-missing').surface, 'operations[].registry_contribution');
    assert.equal(blockedOf(result, 'S6.cycle').surface, 'steps[].contract');
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('an authored v3 artifact executes every check', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    assert.deepEqual(result.blocked, []);
    assert.equal(result.findings.length, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a blocked check never contributes a finding', () => {
  const artifact = minimalV2Artifact();
  artifact.operations[0].boundary_effects = [{ boundary: 'boundary-001', direction: 'provides' }];
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    assert.equal(result.findings.some((finding) => finding.checkId === 'S6.boundary-effect-drift'), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a present-but-empty boundary effect surface is a measured zero', () => {
  const artifact = minimalV3Artifact();
  artifact.operations = artifact.operations.map((operation) => ({ ...operation, boundary_effects: [] }));
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    const entry = result.subChecks.find((check) => check.id === 'S6.boundary-effect-drift');
    assert.equal(entry.status, 'executed');
    assert.equal(entry.denominator, 2);
  } finally {
    workspace.remove();
  }
});
