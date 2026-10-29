// @verifies C007
// @verifies C008
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { checkDangers } from '../../.claude/scripts/smooth-sequences/lib/checks-danger.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-288 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-288 --for-spec --no-implementation-order`.
function indexOf(artifact) {
  const workspace = materializeSmoothWorkspace({ artifact });
  return { workspace, index: indexArtifact(loadWorkspace(workspace.root)) };
}

// [::TICKET::] PX-288 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-288 --for-spec --no-implementation-order`.
function subjectsOf(findings, checkId) {
  return findings.filter((finding) => finding.checkId === checkId).map((finding) => finding.subject);
}

test('a realized multi-step sequence with no consume and no flow ground is S6.object-flow-missing', () => {
  const artifact = minimalV3Artifact();
  artifact.steps.forEach((step) => { step.contract.consumes = []; });
  const { workspace, index } = indexOf(artifact);
  try {
    assert.ok(subjectsOf(checkDangers(index), 'S6.object-flow-missing').includes('A-1'));
  } finally {
    workspace.remove();
  }
});

test('a sequence with a consume is not reported and a single-step sequence is exempt', () => {
  const connected = indexOf(minimalV3Artifact());
  try {
    assert.equal(subjectsOf(checkDangers(connected.index), 'S6.object-flow-missing').includes('A-1'), false);
  } finally {
    connected.workspace.remove();
  }
  const single = minimalV3Artifact();
  single.steps = [single.steps[0]];
  const one = indexOf(single);
  try {
    assert.equal(subjectsOf(checkDangers(one.index), 'S6.object-flow-missing').includes('A-1'), false);
  } finally {
    one.workspace.remove();
  }
});

test('steps with no operation edge are S6.graph-empty', () => {
  const artifact = minimalV3Artifact();
  artifact.steps.forEach((step) => { step.contract.consumes = []; step.contract.produces = []; });
  const { workspace, index } = indexOf(artifact);
  try {
    assert.ok(subjectsOf(checkDangers(index), 'S6.graph-empty').length > 0);
  } finally {
    workspace.remove();
  }
});

test('a position escape without grounding is S6.escape-ungrounded', () => {
  const artifact = minimalV3Artifact();
  artifact.operations.push({
    id: 'EscapedOperation', disposition: 'active', position: 'excluded', registry_contribution: 'required',
  });
  const { workspace, index } = indexOf(artifact);
  try {
    assert.ok(subjectsOf(checkDangers(index), 'S6.escape-ungrounded').includes('EscapedOperation'));
  } finally {
    workspace.remove();
  }
});

test('an object-type exclusion and a presupposition citation are accepted', () => {
  const artifact = minimalV3Artifact();
  artifact.operations.push({
    id: '@object:AssetScore',
    disposition: 'active',
    position: 'excluded',
    registry_contribution: 'required',
    grounding: { classification: 'object_type_not_an_operation', line: 17 },
  });
  artifact.operations.push({
    id: 'CAPABILITIES_GET',
    disposition: 'active',
    position: 'excluded',
    registry_contribution: 'required',
    grounding: { classification: 'the_registry_excludes_this_row', line: 14157 },
  });
  artifact.operations.push({
    id: 'ReceiveReinstatementProof',
    disposition: 'active',
    position: 'suppliedRule',
    registry_contribution: 'required',
    grounding: { classification: 'designer_supplied', presupposition: 6033 },
  });
  const { workspace, index } = indexOf(artifact);
  try {
    const subjects = subjectsOf(checkDangers(index), 'S6.escape-ungrounded');
    assert.equal(subjects.includes('@object:AssetScore'), false);
    assert.equal(subjects.includes('CAPABILITIES_GET'), false);
    assert.equal(subjects.includes('ReceiveReinstatementProof'), false);
  } finally {
    workspace.remove();
  }
});

test('a grounded excluded operation is accepted', () => {
  const artifact = minimalV3Artifact();
  artifact.operations.push({
    id: 'GroundedOperation',
    disposition: 'active',
    position: 'excluded',
    registry_contribution: 'required',
    grounding: { classification: 'no_act_stated_by_the_specification', line: 10 },
  });
  const { workspace, index } = indexOf(artifact);
  try {
    assert.equal(subjectsOf(checkDangers(index), 'S6.escape-ungrounded').includes('GroundedOperation'), false);
  } finally {
    workspace.remove();
  }
});

test('a non-terminal declared output still needs a consumer', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0].result_object_classes = ['Order'];
  artifact.steps[0].contract.produces.push('object:Order');
  artifact.steps[1].contract.consumes = ['object:Other'];
  artifact.steps[1].contract.produces = [];
  const { workspace, index } = indexOf(artifact);
  try {
    assert.ok(subjectsOf(checkDangers(index), 'S6.orphan-object').includes('object:Order'));
  } finally {
    workspace.remove();
  }
});
