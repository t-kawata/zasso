import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { checkDangers } from '../../.claude/scripts/smooth-sequences/lib/checks-danger.mjs';
import { materializeSmoothWorkspace, minimalV3Artifact } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function indexOf(artifact) {
  const workspace = materializeSmoothWorkspace({ artifact });
  return { workspace, index: indexArtifact(loadWorkspace(workspace.root)) };
}

test('S6 detects a dependency cycle', () => {
  const artifact = minimalV3Artifact();
  artifact.steps[0].contract.consumes = ['second_fact'];
  artifact.steps[1].contract.produces = ['second_fact'];
  artifact.steps[1].contract.post = [{ factId: 'second_fact', text: 'second fact', source: 'boundary-001/postconditions/1' }];
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkDangers(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S6.cycle'));
  } finally {
    workspace.remove();
  }
});

test('S6 detects an active operation no step reaches and no escape covers', () => {
  const artifact = minimalV3Artifact();
  artifact.operations.push({ ...artifact.operations[0], id: 'UnreachedOperation', position: 'positioned', disposition: 'active' });
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkDangers(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S6.unreachable-operation'));
  } finally {
    workspace.remove();
  }
});

test('S6 detects an unannotated repeated operation in one sequence', () => {
  const artifact = minimalV3Artifact();
  artifact.steps.push({ ...artifact.steps[0], id: 'A-1__ProduceFact__repeat', line: 3 });
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkDangers(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S6.unannotated-repeat'));
  } finally {
    workspace.remove();
  }
});

test('S6 does not flag a result object the operation declares as a deliberate output', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0].result_object_classes = ['Soul'];
  artifact.steps[0].contract.produces.push('object:Soul');
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkDangers(index);
    assert.equal(findings.filter((finding) => finding.checkId === 'S6.orphan-object' && finding.subject === 'object:Soul').length, 0);
  } finally {
    workspace.remove();
  }
});

test('S6 flags an object no operation declares and no step consumes', () => {
  const artifact = minimalV3Artifact();
  artifact.steps[0].contract.produces.push('object:Undeclared');
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkDangers(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S6.orphan-object' && finding.subject === 'object:Undeclared'));
  } finally {
    workspace.remove();
  }
});

test('S6 accepts consecutive monotonic steps of one operation as internal steps', () => {
  const artifact = minimalV3Artifact();
  artifact.steps = [
    artifact.steps[0],
    { ...artifact.steps[0], id: 'A-1__ProduceFact__second', line: 2 },
  ];
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkDangers(index);
    assert.equal(findings.filter((finding) => finding.checkId === 'S6.unannotated-repeat').length, 0);
  } finally {
    workspace.remove();
  }
});

test('S6 accepts a repeated operation annotated as a retry', () => {
  const artifact = minimalV3Artifact();
  artifact.steps.push({ ...artifact.steps[0], id: 'A-1__ProduceFact__retry', line: 3, annotation: 'retry' });
  const { workspace, index } = indexOf(artifact);
  try {
    const findings = checkDangers(index);
    assert.equal(findings.filter((finding) => finding.checkId === 'S6.unannotated-repeat').length, 0);
  } finally {
    workspace.remove();
  }
});
