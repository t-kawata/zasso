// PX-385 @verifies C001
// PX-385 @verifies C002
// The operation envelope is produced from the axes the specification states. A project
// with a status axis carries initial_status and its transition map; a project without one
// carries neither, and a non-member status is refused before it reaches the artifact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as artifactModule from '../../.claude/scripts/educe-sequences/rail/artifact.mjs';
import {
  readArtifactSchema,
  readSpecification,
} from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { SURFACES, surfaceAvailabilityOf } from '../../.claude/scripts/smooth-sequences/lib/surfaces.mjs';

const { buildArtifact } = artifactModule;

const SPEC_PATH = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const RUN_INPUT = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger.run.json', import.meta.url), 'utf8'));

/** Compose the ledger artifact from its recorded readings. */
// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
function compose(overrides = {}) {
  return buildArtifact({
    specPath: SPEC_PATH,
    spec: readSpecification(SPEC_PATH),
    declaration: RUN_INPUT.declaration,
    readings: {
      sequences: RUN_INPUT.readings.sequences,
      steps: RUN_INPUT.readings.steps,
      operations: RUN_INPUT.readings.operations,
      adjudications: RUN_INPUT.readings.adjudications,
    },
    supplied: 'supplied-digest',
    suppliedDocuments: {},
    ...overrides,
  });
}

/** The ledger readings with the Admit operation carrying a status axis. */
// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
function operationsWithStatus(overrides = {}) {
  return RUN_INPUT.readings.operations.map((operation) => operation.id === 'Admit'
    ? {
      ...operation,
      initial_status: 'Pending',
      allowed_status_transitions: { Pending: ['Settled'], Settled: [] },
      ...overrides,
    }
    : operation);
}

/** The ledger readings with Admit active and its finality surface stated. */
// [::TICKET::] PX-388 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-388 --for-spec --no-implementation-order`.
function operationsWithFinality(overrides = {}) {
  return RUN_INPUT.readings.operations.map((operation) => operation.id === 'Admit'
    ? { ...operation, disposition: 'active', external_dependency_class: 'none', ...overrides }
    : operation);
}

test('C001 the schema declares the operation envelope axes', () => {
  const envelope = readArtifactSchema().operations.envelope;
  assert.equal(envelope.statusEnumeration, 'OperationStatus');
  for (const axis of [
    'initial_status',
    'allowed_status_transitions',
    'required_authority',
    'requires_session_binding',
    'requires_remote_time_handshake',
    'required_pre_state_checkpoint',
    'required_proof_classes',
    'result_object_classes',
    'idempotency_scope',
    'reversal_or_recovery_rule',
    'reject_code_families',
    'cancellation_rule',
  ]) {
    assert.equal(Object.hasOwn(envelope.axes, axis), true, axis);
  }
});

test('C001 declared status axes reach the artifact and survive a same-revision merge', () => {
  const artifact = compose({ readings: { ...RUN_INPUT.readings, operations: operationsWithStatus() } });
  const admit = artifact.operations.find((operation) => operation.id === 'Admit');
  assert.equal(admit.initial_status, 'Pending');
  assert.deepEqual(admit.allowed_status_transitions, { Pending: ['Settled'], Settled: [] });

  const preserved = compose({
    readings: { ...RUN_INPUT.readings, operations: operationsWithStatus() },
    previousArtifact: artifact,
  });
  assert.equal(preserved.operations.find((operation) => operation.id === 'Admit').initial_status, 'Pending');
});

test('C001 an operation without a status axis carries neither field', () => {
  const artifact = compose();
  const admit = artifact.operations.find((operation) => operation.id === 'Admit');
  assert.equal(Object.hasOwn(admit, 'initial_status'), false);
  assert.equal(Object.hasOwn(admit, 'allowed_status_transitions'), false);
});

test('C001 an empty transition map with a member initial status is accepted', () => {
  const operations = operationsWithStatus({ allowed_status_transitions: { Pending: [] } });
  assert.doesNotThrow(() => artifactModule.validateOperationEnvelope(operations, {
    enumerations: [{ name: 'OperationStatus', members: ['Pending'] }],
  }));
});

test('C002 a non-member initial_status or target is refused with a named code', () => {
  const invalidInitial = operationsWithStatus({ initial_status: 'Unknown' });
  assert.throws(
    () => compose({ readings: { ...RUN_INPUT.readings, operations: invalidInitial } }),
    (error) => error.code === 'OPERATION_STATUS_UNKNOWN' && /Unknown/.test(error.message),
  );

  const invalidTarget = operationsWithStatus({
    allowed_status_transitions: { Pending: ['Nope'], Nope: [] },
  });
  assert.throws(
    () => compose({ readings: { ...RUN_INPUT.readings, operations: invalidTarget } }),
    (error) => error.code === 'OPERATION_STATUS_UNKNOWN' && /Nope/.test(error.message),
  );
});

test('C002 a status axis without the declared enumeration is refused', () => {
  const declaration = { ...RUN_INPUT.declaration, enumerations: [] };
  assert.throws(
    () => compose({
      declaration,
      readings: { ...RUN_INPUT.readings, operations: operationsWithStatus() },
    }),
    (error) => error.code === 'OPERATION_STATUS_ENUMERATION_MISSING',
  );
});

test('C002 a malformed transition map is refused before it reaches the artifact', () => {
  const operations = operationsWithStatus({ allowed_status_transitions: 'Pending' });
  assert.throws(
    () => artifactModule.validateOperationEnvelope(operations, {
      enumerations: [{ name: 'OperationStatus', members: ['Pending', 'Settled'] }],
    }),
    (error) => error.code === 'OPERATION_ENVELOPE_SHAPE',
  );
});

// @verifies C002
test('C002 an initial status that is not a key of a non-empty transition map is refused', () => {
  const operations = operationsWithStatus({
    initial_status: 'Pending',
    allowed_status_transitions: { Settled: [] },
  });
  assert.throws(
    () => compose({ readings: { ...RUN_INPUT.readings, operations } }),
    (error) => error.code === 'OPERATION_STATUS_UNKNOWN' && /initial_status/.test(error.message),
  );
});

// PX-386 @verifies C005
// The external-dependency classification and its finality predicate are operation
// reading facts the smooth detector checks. They are declared here so a malformed
// value is refused at composition rather than becoming a detector finding.

test('PX-386 C005: the finality axes are declared in the operation envelope', () => {
// [::TICKET::] PX-386 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-386 --for-spec --no-implementation-order`.
  const axes = readArtifactSchema().operations.envelope.axes;
  assert.equal(axes.external_dependency_class, 'string');
  assert.equal(axes.finality_predicate, 'string');
});

test('PX-386 C005: a malformed finality axis is refused before the artifact', () => {
  const operations = operationsWithStatus({ external_dependency_class: 7, finality_predicate: {} });
  assert.throws(
    () => compose({ readings: { ...RUN_INPUT.readings, operations } }),
    (error) => error.code === 'OPERATION_ENVELOPE_SHAPE',
  );
});

test('PX-386 C005: a well-formed finality axis reaches the artifact', () => {
  const operations = operationsWithStatus({
    external_dependency_class: 'network',
    finality_predicate: 'closed when the peer acknowledges',
  });
  const artifact = compose({ readings: { ...RUN_INPUT.readings, operations } });
  const admit = artifact.operations.find((operation) => operation.id === 'Admit');
  assert.equal(admit.external_dependency_class, 'network');
  assert.equal(admit.finality_predicate, 'closed when the peer acknowledges');
});

// PX-388 @verifies C001
// The smooth detector reads external_dependency_class on every active operation and
// blocks the finality surface when it is absent. An artifact composed without the axis
// can never complete, so the producer refuses it and names the operation to repair.

test('PX-388 C001: an active operation without the dependency class is refused', () => {
// [::TICKET::] PX-388 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-388 --for-spec --no-implementation-order`.
  const operations = operationsWithFinality({ external_dependency_class: undefined });
  assert.throws(
    () => compose({ readings: { ...RUN_INPUT.readings, operations } }),
    (error) => error.code === 'OPERATION_EXTERNAL_DEPENDENCY_MISSING' && /Admit/.test(error.message),
  );
});

test('PX-388 C001: the schema declares the required finality axes', () => {
  const axes = readArtifactSchema().operations.envelope.axes;
  assert.equal(axes.external_dependency_class, 'string');
  assert.equal(axes.finality_predicate, 'string');
});

// PX-388 @verifies C002
// A non-none class claims the operation waits on an external system; without a finality
// predicate the claim cannot be checked, so the reading is refused with both facts named.

test('PX-388 C002: a non-none class without finality is refused', () => {
// [::TICKET::] PX-388 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-388 --for-spec --no-implementation-order`.
  const operations = operationsWithFinality({ external_dependency_class: 'network' });
  assert.throws(
    () => compose({ readings: { ...RUN_INPUT.readings, operations } }),
    (error) => error.code === 'OPERATION_FINALITY_MISSING'
      && /Admit/.test(error.message) && /network/.test(error.message),
  );
});

// PX-388 @verifies C003
// The artifact that passes the gate is the artifact smooth measures: every active
// operation carries the class, and the EXTERNAL_DEPENDENCY surface reports present.
// An operation whose disposition is not active is outside the surface and stays exempt.

test('PX-388 C003: none composes and reaches the artifact', () => {
// [::TICKET::] PX-388 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-388 --for-spec --no-implementation-order`.
  const artifact = compose({ readings: { ...RUN_INPUT.readings, operations: operationsWithFinality() } });
  const admit = artifact.operations.find((operation) => operation.id === 'Admit');
  assert.equal(admit.external_dependency_class, 'none');
});

test('PX-388 C003: a non-none class with finality reaches the artifact unchanged', () => {
// [::TICKET::] PX-388 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-388 --for-spec --no-implementation-order`.
  const operations = operationsWithFinality({
    external_dependency_class: 'network',
    finality_predicate: 'closed when the peer acknowledges',
  });
  const artifact = compose({ readings: { ...RUN_INPUT.readings, operations } });
  const admit = artifact.operations.find((operation) => operation.id === 'Admit');
  assert.equal(admit.external_dependency_class, 'network');
  assert.equal(admit.finality_predicate, 'closed when the peer acknowledges');
});

test('PX-388 C003: a non-active operation is exempt from the requirement', () => {
// [::TICKET::] PX-388 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-388 --for-spec --no-implementation-order`.
  const operations = RUN_INPUT.readings.operations.map((operation) => operation.id === 'Admit'
    ? { ...operation, disposition: 'disposed', external_dependency_class: 'network' }
    : operation);
  assert.doesNotThrow(() => compose({ readings: { ...RUN_INPUT.readings, operations } }));
});

test('PX-388 C003: the artifact makes the smooth external-dependency surface present', () => {
// [::TICKET::] PX-388 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-388 --for-spec --no-implementation-order`.
  const artifact = compose({ readings: { ...RUN_INPUT.readings, operations: operationsWithFinality() } });
  const availability = surfaceAvailabilityOf({ artifact }, SURFACES.EXTERNAL_DEPENDENCY);
  assert.equal(availability.present, true);
  assert.equal(availability.cardinality, 1);
});
