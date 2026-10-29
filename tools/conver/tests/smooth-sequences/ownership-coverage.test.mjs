import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import {
  defaultViews,
  materializeSmoothWorkspace,
  minimalV3Artifact,
  operationRow,
  rfcBody,
} from './helpers/workspace-fixture.mjs';

/** The findings of one check id in a result. */
// [::TICKET::] PX-284 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-284 --for-spec --no-implementation-order`.
function findingsOf(result, checkId) {
  return result.report.findings.filter((finding) => finding.checkId === checkId);
}

/** A workspace with one assigned-only operation. */
// [::TICKET::] PX-284 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-284 --for-spec --no-implementation-order`.
function assignedOnlyWorkspace({ ledgerRow = false } = {}) {
  const artifact = minimalV3Artifact();
  artifact.operations.push(operationRow('AssignedOnly', {
    position: 'suppliedRule',
    registry_contribution: 'required',
  }));
  const views = defaultViews();
  views['pkg-0001'].obligationUnits.push({
    unitId: 'op-AssignedOnly',
    relation: 'assigns',
    subject: 'AssignedOnly',
    kind: 'operation',
  });
  const bodies = ledgerRow
    ? {
      'pkg-0001': rfcBody({
        packageId: 'pkg-0001',
        operationId: 'ProduceFact',
        sequenceIds: ['A-1'],
        crossSequenceIds: ['A-1'],
        extraUnits: [{ id: 'op-AssignedOnly', kind: 'operation' }],
      }),
      'pkg-0002': rfcBody({ packageId: 'pkg-0002', operationId: 'ConsumeFact', crossSequenceIds: ['A-1'] }),
    }
    : undefined;
  return materializeSmoothWorkspace({ artifact, views, rfcBodies: bodies });
}

// @verifies C004
test('an assigned-only operation without a ledger row is S4.contribution-unowned', () => {
  const workspace = assignedOnlyWorkspace();
  try {
    const result = runCommand([workspace.root, '--audit']);
    const findings = findingsOf(result, 'S4.contribution-unowned');
    assert.equal(findings.length, 1);
    assert.ok(findings[0].subject.includes('AssignedOnly'));
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('an assigned-only operation with its ledger row produces no contribution finding', () => {
  const missing = assignedOnlyWorkspace();
  try {
    assert.equal(findingsOf(runCommand([missing.root, '--audit']), 'S4.contribution-unowned').length, 1);
  } finally {
    missing.remove();
  }
  const workspace = assignedOnlyWorkspace({ ledgerRow: true });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S4.contribution-unowned').length, 0);
  } finally {
    workspace.remove();
  }
});

test('an owned operation is not reported as assigned-only', () => {
  const assigned = assignedOnlyWorkspace();
  try {
    assert.equal(findingsOf(runCommand([assigned.root, '--audit']), 'S4.contribution-unowned').length, 1);
  } finally {
    assigned.remove();
  }
  const workspace = materializeSmoothWorkspace();
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.equal(findingsOf(result, 'S4.contribution-unowned').length, 0);
  } finally {
    workspace.remove();
  }
});

test('an obligation unit naming an unknown operation is S7.obligation-unit-unknown', () => {
  const views = defaultViews();
  views['pkg-0001'].obligationUnits.push({
    unitId: 'op-Missing',
    relation: 'assigns',
    subject: 'Missing',
    kind: 'operation',
  });
  const workspace = materializeSmoothWorkspace({ views });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.ok(findingsOf(result, 'S7.obligation-unit-unknown').some((finding) => finding.subject.includes('Missing')));
  } finally {
    workspace.remove();
  }
});

test('an obligation unit naming an unknown sequence is S7.obligation-unit-unknown', () => {
  const views = defaultViews();
  views['pkg-0001'].obligationUnits.push({
    unitId: 'seq-G-999',
    relation: 'assigns',
    subject: 'G-999',
    kind: 'sequence',
  });
  const workspace = materializeSmoothWorkspace({ views });
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.ok(findingsOf(result, 'S7.obligation-unit-unknown').some((finding) => finding.subject.includes('G-999')));
  } finally {
    workspace.remove();
  }
});
