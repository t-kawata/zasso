// PX-255 @verifies C001
// The unit vocabulary is what PX-256 and PX-257 will write into RFCs and gates. Its
// closure over the artifact is the property that makes "no unit was dropped" checkable,
// so the closure is asserted rather than described.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NOT_A_SEQUENCE,
  SEQUENCE_OUTCOMES,
  buildSequenceUnits,
  collectSequencesWithNoKnownPackage,
  sequenceAxisBuckets,
} from '../../.claude/scripts/sequences-slice/lib/units.mjs';
import { resolveOwningPackages } from '../../.claude/scripts/sequences-slice/lib/ownership.mjs';
import {
  RECORDED_SEQUENCE_BUCKETS,
  liveShapedObjects,
  liveShapedOperations,
  liveShapedSequenceAxis,
} from './fixtures/synthetic-workspace.mjs';

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 the sequence axis keeps only the outcomes that are sequences, with ids unchanged', () => {
  const artifact = {
    schema_version: 2,
    sequences: [
      { id: 'S-1', outcome: 'notASequence', kind: 'neighbour', firstLine: 1, lastLine: 2, cites: 0 },
      { id: 'S-2', outcome: 'notASequence', kind: 'neighbour', firstLine: 1, lastLine: 2, cites: 0 },
      { id: 'S-3', outcome: 'direct', kind: 'entry', firstLine: 1, lastLine: 2, cites: 0 },
      { id: 'S-4', outcome: 'singleStep', kind: 'entry', firstLine: 1, lastLine: 2, cites: 0 },
      { id: 'S-5', outcome: 'viaNeighbour', kind: 'entry', firstLine: 1, lastLine: 2, cites: 0 },
    ],
    steps: [{ id: 'S-3__1', sequence: 'S-3', operation: 'Op1', line: 1 }],
    operations: [{ id: 'Op1', position: 1, result_object_classes: [] }],
  };
  const units = buildSequenceUnits(artifact);
  assert.deepEqual(units.sequences.map((sequence) => sequence.id), ['S-3', 'S-4', 'S-5']);
  assert.ok(units.sequences.every((sequence) => sequence.outcome !== NOT_A_SEQUENCE));
  assert.equal(units.steps.length, 1);
  assert.equal(units.operations.length, 1);
  assert.deepEqual(units.steps, artifact.steps);
  assert.deepEqual(units.operations, artifact.operations);
  assert.deepEqual(units.unknownOutcomes, []);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 an outcome outside the known set is reported rather than silently absorbed', () => {
  const artifact = {
    schema_version: 2,
    sequences: [{ id: 'S-1', outcome: 'someFutureOutcome', kind: 'entry', firstLine: 1, lastLine: 2, cites: 0 }],
    steps: [],
    operations: [],
  };
  const units = buildSequenceUnits(artifact);
  assert.deepEqual(units.unknownOutcomes, ['someFutureOutcome']);
  assert.deepEqual(SEQUENCE_OUTCOMES, ['direct', 'singleStep', 'viaNeighbour']);
  assert.equal(NOT_A_SEQUENCE, 'notASequence');
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 the unit vocabulary is closed over the artifact', () => {
  const { sequences, steps } = liveShapedSequenceAxis();
  const artifact = { schema_version: 2, sequences, steps, operations: [] };
  const units = buildSequenceUnits(artifact);
  const sequenceIds = new Set(units.sequences.map((sequence) => sequence.id));
  assert.ok(units.steps.every((step) => sequenceIds.has(step.sequence)));
  assert.equal(units.sequences.length, 116);
  assert.equal(units.steps.length, 283);
  assert.equal(new Set(units.steps.map((step) => step.sequence)).size, 116);
  assert.equal(units.sequences.length, sequences.filter((sequence) => sequence.outcome !== NOT_A_SEQUENCE).length);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 the sequence buckets follow from the operation buckets through the same join', () => {
  const { sequences, steps } = liveShapedSequenceAxis();
  const artifact = { schema_version: 2, sequences, steps, operations: [] };
  const units = buildSequenceUnits({ ...artifact, operations: liveShapedOperations() });
  const buckets = sequenceAxisBuckets(units, resolveOwningPackages(liveShapedObjects()));
  assert.deepEqual(buckets, RECORDED_SEQUENCE_BUCKETS);
  assert.equal(buckets.onePackage + buckets.severalPackages + buckets.noKnownPackage, buckets.total);
  assert.equal(buckets.total, 116);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 the sequences that resolve to no package are named rather than only counted', () => {
  const { sequences, steps } = liveShapedSequenceAxis();
  const units = buildSequenceUnits({ schema_version: 2, sequences, steps, operations: liveShapedOperations() });
  const ownership = resolveOwningPackages(liveShapedObjects());
  const named = collectSequencesWithNoKnownPackage(units, ownership);
  assert.equal(named.length, 5);
  assert.deepEqual(named, [...named].sort());
  const bounded = new Set(named);
  assert.ok(named.every((id) => units.sequences.some((sequence) => sequence.id === id)));
  assert.equal(
    sequenceAxisBuckets(units, ownership).noKnownPackage,
    named.length,
  );
  assert.equal(new Set([...bounded]).size, 5);
});
