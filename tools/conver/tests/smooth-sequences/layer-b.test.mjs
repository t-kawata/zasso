import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { checkCrossingContracts, layerBWithheld } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-b.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function indexOf(artifact) {
  const workspace = materializeSmoothWorkspace({ artifact });
  return { workspace, index: indexArtifact(loadWorkspace(workspace.root)) };
}

// @verifies C005
test('S5 accepts a consumer precondition the provider postcondition implies', () => {
  const { workspace, index } = indexOf(minimalV3Artifact());
  try {
    assert.deepEqual(checkCrossingContracts(index), []);
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
test('S5 rejects a consumer precondition the provider does not imply', () => {
  const artifact = minimalV3Artifact();
  artifact.steps[1].contract.pre.push({ factId: 'boundary:boundary-001/preconditions/99', text: 'the lease is active', source: 'boundary:boundary-001/preconditions/99' });
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkCrossingContracts(index);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].checkId, 'S5.precondition-not-implied');
    assert.match(findings[0].why, /preconditions\/99/);
  } finally {
    workspace.remove();
  }
});

test('S5 compares boundary facts, not operation-envelope facts', () => {
  const artifact = minimalV3Artifact();
  artifact.steps[1].contract.pre.push({ factId: 'authority:order_authority_and_lease', text: 'the authority is required', source: 'operation.required_authority' });
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkCrossingContracts(index);
    assert.equal(findings.filter((finding) => finding.checkId === 'S5.precondition-not-implied').length, 0);
  } finally {
    workspace.remove();
  }
});

test('S5 rejects a consumed object no step produces', () => {
  const artifact = minimalV3Artifact();
  artifact.steps[1].contract.consumes.push('boundary:boundary-001/preconditions/99');
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkCrossingContracts(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S5.consumes-not-produced'));
  } finally {
    workspace.remove();
  }
});

test('S5 rejects a step that crosses a boundary its package does not hold', () => {
  const artifact = minimalV3Artifact();
  artifact.operations.push({ ...artifact.operations[0], id: 'ForeignOperation' });
  artifact.steps[0].operation = 'ForeignOperation';
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkCrossingContracts(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S5.crossing-direction-mismatch'));
  } finally {
    workspace.remove();
  }
});

test('a v2 artifact withholds Layer B', () => {
  const { workspace, index } = indexOf(minimalV2Artifact());
  try {
    assert.deepEqual(checkCrossingContracts(index), []);
    assert.deepEqual(layerBWithheld(index), [{ layer: 'B', reason: 'v3 step contract absent' }]);
  } finally {
    workspace.remove();
  }
});
