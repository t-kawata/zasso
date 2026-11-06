// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexArtifact } from '../../.claude/scripts/smooth-sequences/lib/index.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { evaluateCheckRegistry } from '../../.claude/scripts/smooth-sequences/lib/check-registry.mjs';
import {
  checkArtifactViewConsistency,
  checkBoundaryClauses,
  checkEnumerationIntegrity,
  checkOperationEnvelope,
} from '../../.claude/scripts/smooth-sequences/lib/checks-layer-a.mjs';
import {
  defaultAllocateManifest,
  defaultContractRegistry,
  defaultTreeManifest,
  materializeSmoothWorkspace,
  minimalV3Artifact,
  operationRow,
  rfcBody,
} from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-275 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-275 --for-spec --no-implementation-order`.

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
  artifact.operations[0] = operationRow('ProduceFact', { result_object_classes: ['Order'], initial_status: 'unknown' });
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkOperationEnvelope(index);
    assert.ok(findings.some((finding) => finding.checkId === 'S3.status-initial-unknown'));
  } finally {
    workspace.remove();
  }
});

// @verifies C002
// [::TICKET::] PX-276 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-276 --for-spec --no-implementation-order`.
test('S3 rejects a transition out of a declared terminal status', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0] = operationRow('ProduceFact', {
    allowed_status_transitions: { open: ['closed'], closed: ['open'] },
  });
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkOperationEnvelope(index).filter((finding) => finding.checkId === 'S3.transition-out-of-terminal');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].subject, 'ProduceFact');
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('S3 never treats an undeclared status name as terminal', () => {
  const artifact = minimalV3Artifact();
  delete artifact.vocabulary;
  artifact.operations[0] = operationRow('ProduceFact', {
    allowed_status_transitions: { finalized: ['accepted'] },
  });
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkOperationEnvelope(index);
    assert.equal(findings.filter((finding) => finding.checkId === 'S3.transition-out-of-terminal').length, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
// [::TICKET::] PX-277 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-277 --for-spec --no-implementation-order`.
test('S3 rejects a declared required interface that the operation does not map', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = { terminalStatuses: ['closed'], requiredInterfaces: ['grpc'] };
  artifact.operations[0] = operationRow('ProduceFact', { grpc: undefined, rest: 'GET /v1/orders' });
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkOperationEnvelope(index).filter((finding) => finding.checkId === 'S3.interface-mapping-missing');
    assert.equal(findings.length, 1);
    assert.match(findings[0].why, /grpc/);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('S3 requires no fixed interface triple when the workspace declares none', () => {
  const artifact = minimalV3Artifact();
  delete artifact.vocabulary;
  artifact.operations = artifact.operations.map((operation) => operationRow(operation.id, {
    rest: undefined,
    grpc: 'rpc Orders',
    cli: undefined,
  }));
  const { workspace, index } = indexOf({ artifact });
  try {
    assert.equal(checkOperationEnvelope(index).filter((finding) => finding.checkId === 'S3.interface-mapping-missing').length, 0);
  } finally {
    workspace.remove();
  }
});

test('S3 does not invent an object registry the artifact never declares', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0].result_object_classes = ['Order'];
  const { workspace, index } = indexOf({ artifact });
  try {
    assert.equal(checkOperationEnvelope(index).filter((finding) => finding.checkId === 'S3.result-object-unknown').length, 0);
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

// @verifies C005
test('S7 selects a carried boundary by relation and subject, not by the unit-id prefix', () => {
  const { workspace, index } = indexOf({
    rfcBodies: {
      'pkg-0001': '# RFC pkg-0001\n',
      'pkg-0002': rfcBody({ packageId: 'pkg-0002', operationId: 'ConsumeFact', crossSequenceIds: ['A-1'] }),
    },
  });
  try {
    const provider = index.viewsByPackage.get('pkg-0001');
    provider.obligationUnits[0].unitId = 'carry-001';
    assert.ok(checkArtifactViewConsistency(index).some((finding) => finding.checkId === 'S7.rfc-boundary-missing'));

    provider.obligationUnits[0].unitId = 'ctr-boundary-999';
    provider.obligationUnits[0].subject = 'boundary-unknown';
    assert.equal(checkArtifactViewConsistency(index).filter((finding) => finding.checkId === 'S7.rfc-boundary-missing').length, 0);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('S3 names a missing initial_status instead of interpolating undefined', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0] = operationRow('ProduceFact', {
    initial_status: '',
    allowed_status_transitions: { open: ['closed'], closed: [] },
  });
  const { workspace, index } = indexOf({ artifact });
  try {
    const finding = checkOperationEnvelope(index)
      .find((entry) => entry.checkId === 'S3.status-initial-unknown');
    assert.ok(finding);
    assert.match(finding.why, /has no initial_status field/);
    assert.doesNotMatch(finding.why, /undefined/);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('S3 accepts an empty transition map with a declared initial status', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0] = operationRow('ProduceFact', {
    initial_status: 'open',
    allowed_status_transitions: {},
  });
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkOperationEnvelope(index)
      .filter((entry) => entry.checkId === 'S3.status-initial-unknown');
    assert.equal(findings.length, 0);
  } finally {
    workspace.remove();
  }
});

// PX-386 @verifies C003
// An operation reading that does not classify its external dependency is missing
// evidence, not a claim that every operation has one. The whole check is blocked so
// no fabricated finality predicate is forced on the project.

test('PX-386 C003: an absent external-dependency surface blocks the finality check', () => {
// [::TICKET::] PX-386 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-386 --for-spec --no-implementation-order`.
  const artifact = minimalV3Artifact();
  for (const operation of artifact.operations) delete operation.external_dependency_class;
  const { workspace, index } = indexOf({ artifact });
  try {
    const result = evaluateCheckRegistry(index);
    const blocked = result.blocked.find((entry) => entry.checkId === 'S3.finality-missing-for-external');
    assert.ok(blocked, JSON.stringify(result.blocked));
    assert.equal(blocked.surface, 'operations[].external_dependency_class');
    assert.equal(
      result.findings.some((entry) => entry.checkId === 'S3.finality-missing-for-external'),
      false,
    );
  } finally {
    workspace.remove();
  }
});

// PX-386 @verifies C004
test('PX-386 C004: a present external class without finality is one finding', () => {
  const artifact = minimalV3Artifact();
  artifact.operations[0] = operationRow('ProduceFact', { external_dependency_class: 'network' });
  delete artifact.operations[0].finality_predicate;
  const { workspace, index } = indexOf({ artifact });
  try {
    const findings = checkOperationEnvelope(index)
      .filter((entry) => entry.checkId === 'S3.finality-missing-for-external');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].subject, 'ProduceFact');
    assert.doesNotMatch(findings[0].why, /undefined/);
  } finally {
    workspace.remove();
  }
});
