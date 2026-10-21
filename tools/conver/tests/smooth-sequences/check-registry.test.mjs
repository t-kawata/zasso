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

test('a v2 artifact skips the meshing and contribution families with a named reason', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    const skipped = new Map(result.subChecks.filter((entry) => entry.status === 'skipped').map((entry) => [entry.id, entry.reason]));
    assert.match(skipped.get('S5.error-set-mismatch'), /v3 step contract absent/);
    assert.match(skipped.get('S4.contribution-missing'), /v2 artifact carries no registry_contribution/);
    assert.equal(result.subChecks.length, CHECK_REGISTRY.length);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('executed + skipped equals the registry size and every skip carries a reason', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const result = evaluateCheckRegistry(indexOf(workspace));
    const executed = result.subChecks.filter((entry) => entry.status === 'executed');
    const skipped = result.subChecks.filter((entry) => entry.status === 'skipped');
    assert.equal(executed.length + skipped.length, CHECK_REGISTRY.length);
    assert.ok(skipped.length > 0);
    assert.ok(skipped.every((entry) => typeof entry.reason === 'string' && entry.reason.length > 0));
    assert.ok(executed.every((entry) => entry.reason === undefined));
  } finally {
    workspace.remove();
  }
});
