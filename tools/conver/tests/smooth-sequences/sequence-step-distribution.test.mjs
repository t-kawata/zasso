import { test } from 'node:test';
import assert from 'node:assert/strict';

import { materializeSmoothWorkspace, defaultViews, packageView } from './helpers/workspace-fixture.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { collectArtifactViewConsistency } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import { checkActiveOperationResiduals } from '../../.claude/scripts/smooth-sequences/lib/checks-distribution-map.mjs';

const PROVIDER = 'pkg-0001';
const CONSUMER = 'pkg-0002';

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function findingsOf(workspace) {
  return collectArtifactViewConsistency(indexArtifact(loadWorkspace(workspace.root))).findings;
}

test('a drawn sequence carried only by an obligation unit is not distributed', () => {
  const provider = packageView({
    packageId: PROVIDER,
    operationId: 'ProduceFact',
    direction: 'provides',
    counterpart: CONSUMER,
    sequenceObligations: ['A-1'],
  });
  const consumer = defaultViews()[CONSUMER];
  const workspace = materializeSmoothWorkspace({ views: { [PROVIDER]: provider, [CONSUMER]: consumer } });
  try {
    const findings = findingsOf(workspace);
    const finding = findings.find((entry) => entry.checkId === 'S7.sequence-steps-undistributed' && entry.subject === 'A-1');
    assert.ok(finding, 'the obligation-only sequence must be reported');
    assert.match(finding.why, /A-1__ProduceFact/);
  } finally {
    workspace.remove();
  }
});

test('a drawn sequence carried by a step-bearing owned record is distributed', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const findings = findingsOf(workspace).filter((entry) => entry.checkId === 'S7.sequence-steps-undistributed');
    assert.deepEqual(findings, []);
  } finally {
    workspace.remove();
  }
});

test('a step-bearing record whose step order disagrees with the artifact is reported', () => {
  const provider = packageView({
    packageId: PROVIDER,
    operationId: 'ProduceFact',
    direction: 'provides',
    counterpart: CONSUMER,
    sequenceIds: ['A-1'],
    sequenceSteps: [
      { stepId: 'A-1__ConsumeFact', operationId: 'ConsumeFact', line: 2 },
      { stepId: 'A-1__ProduceFact', operationId: 'ProduceFact', line: 1 },
    ],
  });
  const consumer = defaultViews()[CONSUMER];
  const workspace = materializeSmoothWorkspace({ views: { [PROVIDER]: provider, [CONSUMER]: consumer } });
  try {
    const findings = findingsOf(workspace);
    assert.ok(findings.some((entry) => entry.checkId === 'S7.sequence-step-order'));
  } finally {
    workspace.remove();
  }
});

test('an order field that disagrees with the artifact array does not make the view wrong', () => {
  const provider = packageView({
    packageId: PROVIDER,
    operationId: 'ProduceFact',
    direction: 'provides',
    counterpart: CONSUMER,
    sequenceIds: ['A-1'],
    sequenceSteps: [
      { order: 2, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact', line: 1 },
      { order: 1, stepId: 'A-1__ConsumeFact', operationId: 'ConsumeFact', line: 2 },
    ],
  });
  const consumer = defaultViews()[CONSUMER];
  const workspace = materializeSmoothWorkspace({ views: { [PROVIDER]: provider, [CONSUMER]: consumer } });
  try {
    const findings = findingsOf(workspace).filter((entry) => entry.checkId === 'S7.sequence-step-order');
    assert.deepEqual(findings, []);
  } finally {
    workspace.remove();
  }
});

test('an active operation declared residual without the no-act disposition is reported', () => {
  const index = {
    artifact: {
      operations: [{
        id: 'SubmitComputeResult',
        disposition: 'active',
        position: 'positioned',
        grounding: { classification: 'interface_inventory' },
      }],
    },
    stepsByOperation: new Map(),
  };
  const maps = [{
    packageId: 'pkg-0011',
    units: [],
    residuals: [{ unit: 'op-SubmitComputeResult', kind: 'declared-residual' }],
  }];
  const findings = checkActiveOperationResiduals(index, maps);
  assert.ok(findings.some((entry) => entry.checkId === 'S7.active-operation-residual' && entry.subject === 'op-SubmitComputeResult'));
});

test('an active operation residual with suppliedRule and designer_supplied is allowed', () => {
  const index = {
    artifact: {
      operations: [{
        id: 'SubmitComputeResult',
        disposition: 'active',
        position: 'suppliedRule',
        grounding: { classification: 'designer_supplied' },
      }],
    },
    stepsByOperation: new Map(),
  };
  const maps = [{
    packageId: 'pkg-0011',
    units: [],
    residuals: [{ unit: 'op-SubmitComputeResult', kind: 'declared-residual' }],
  }];
  assert.deepEqual(checkActiveOperationResiduals(index, maps), []);
});
