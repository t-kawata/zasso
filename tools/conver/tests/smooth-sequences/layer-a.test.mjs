import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { checkBoundaryClauses, checkEnumerationIntegrity, checkOperationEnvelope } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { defaultAllocateManifest, defaultContractRegistry, defaultTreeManifest, materializeSmoothWorkspace, minimalV3Artifact, operationRow } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function indexOf(input) {
  const workspace = materializeSmoothWorkspace(input);
  return { workspace, index: indexArtifact(loadWorkspace(workspace.root)) };
}

// @verifies C003
test('S1 rejects a step whose operation does not resolve', () => {
  const artifact = minimalV3Artifact();
  artifact.steps[0].operation = 'MissingOperation';
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkEnumerationIntegrity(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S1.step-unresolved-operation'));
    assert.ok(findings.some((finding) => finding.subject.includes('A-1__ProduceFact')));
  } finally {
    workspace.remove();
  }
});

test('S3 rejects an initial status outside the transition graph', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0] = operationRow('ProduceFact', { result_object_classes: ['Soul'], initial_status: 'unknown' });
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkOperationEnvelope(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S3.status-initial-unknown'));
  } finally {
    workspace.remove();
  }
});

test('S3 rejects a transition out of a terminal status', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0] = operationRow('ProduceFact', {
    result_object_classes: ['Soul'],
    allowed_status_transitions: { submitted: ['accepted'], accepted: ['finalized'], finalized: ['accepted'] },
  });
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkOperationEnvelope(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S3.transition-out-of-terminal'));
  } finally {
    workspace.remove();
  }
});

test('S3 rejects a result object the object registry does not declare', () => {
  const artifact = minimalV3Artifact();
  artifact.objects = [{ id: 'Known' }];
  artifact.operations[0].result_object_classes = ['Missing'];
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkOperationEnvelope(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S3.result-object-unknown'));
  } finally {
    workspace.remove();
  }
});

test('S4 rejects a boundary whose required clause is absent', () => {
  const registry = defaultContractRegistry();
  delete registry[0].clauses.preconditions;
  const { workspace, index } = indexOf({
    treeManifest: defaultTreeManifest(),
    allocateManifest: defaultAllocateManifest(registry),
  });
  try {
    const findings = checkBoundaryClauses(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S4.boundary-clause-missing'));
  } finally {
    workspace.remove();
  }
});

test('S4 rejects a boundary side that names the wrong direction', () => {
  const { workspace, index } = indexOf({});
  try {
    index.viewsByPackage.get('pkg-0002').obligationUnits[0].direction = 'provides';
    const findings = checkBoundaryClauses(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S4.boundary-side-mismatch'));
  } finally {
    workspace.remove();
  }
});
