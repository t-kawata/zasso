// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CHECK_REGISTRY, evaluateCheckRegistry } from '../../.claude/scripts/smooth-sequences/lib/check-registry.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact } from './helpers/workspace-fixture.mjs';

/** The index a materialized workspace produces. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function indexOf(workspace) {
  return indexArtifact(loadWorkspace(workspace.root));
}

test('the registry declares every check id exactly once', () => {
  const ids = CHECK_REGISTRY.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('S5.error-set-mismatch'));
  assert.ok(ids.includes('S4.contribution-missing'));
});

test('a v3 clean workspace executes every registered sub-check', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    assert.equal(result.subChecks.length, CHECK_REGISTRY.length);
    assert.deepEqual(result.subChecks.filter((entry) => entry.status === 'skipped'), []);
    assert.deepEqual(result.findings, []);
  } finally {
    workspace.remove();
  }
});

test('a v2 artifact blocks the meshing and contribution families with a named surface', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    const blocked = new Map(result.blocked.map((entry) => [entry.checkId, entry]));
    assert.equal(blocked.get('S5.error-set-mismatch').surface, 'steps[].contract.authored');
    assert.equal(blocked.get('S4.contribution-missing').surface, 'operations[].registry_contribution');
    assert.equal(result.subChecks.length, CHECK_REGISTRY.length);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('executed + blocked equals the registry size and every block carries a reason', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    const executed = result.subChecks.filter((entry) => entry.status === 'executed');
    const blocked = result.subChecks.filter((entry) => entry.status === 'blocked');
    assert.equal(executed.length + blocked.length, CHECK_REGISTRY.length);
    assert.ok(blocked.length > 0);
    assert.ok(blocked.every((entry) => typeof entry.reason === 'string' && entry.reason.length > 0));
    assert.ok(blocked.every((entry) => typeof entry.surface === 'string' && entry.surface.length > 0));
    assert.ok(executed.every((entry) => entry.reason === undefined));
  } finally {
    workspace.remove();
  }
});
