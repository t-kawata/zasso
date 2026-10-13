/**
 * The unit vocabulary: which sequences are sequences, which steps belong to them, and
 * which packages each one therefore touches.
 *
 * The vocabulary is closed over the artifact, and the closure is the property that makes
 * "no unit was dropped" a check rather than a hope: every step's sequence is a sequence
 * id, and the sequence count is exactly the count of outcomes that are not notASequence.
 * PX-256 and PX-257 write these units into package RFCs and gates, so a unit that went
 * missing here would go missing everywhere downstream without anything noticing.
 */
import { resolveOperationOwners } from './ownership.mjs';

/** The outcome that marks a sequence as not a sequence, and so outside the unit vocabulary. */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export const NOT_A_SEQUENCE = 'notASequence';

/** The outcomes that are sequences. Measured across the 553 live sequences. */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export const SEQUENCE_OUTCOMES = Object.freeze(['direct', 'singleStep', 'viaNeighbour']);

/**
 * Build the unit set from the artifact.
 *
 * The sequence axis is filtered; the step and operation axes are carried whole, because a
 * step is the evidence for the sequence that holds it and dropping one would silently
 * shrink the union a unit's owners are computed from.
 *
 * An outcome outside the known set is reported rather than absorbed. The artifact is a
 * pure function of a specification that can gain a new kind of sequence, and a reader
 * that quietly treated an unknown outcome as "not a sequence" would lose that sequence
 * everywhere at once.
 *
 * @param {{ sequences: Array<{ id: string, outcome: string }>, steps: unknown[], operations: unknown[] }} artifact
 * @returns {{ sequences: unknown[], steps: unknown[], operations: unknown[], unknownOutcomes: string[] }}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function buildSequenceUnits(artifact) {
  const known = new Set([NOT_A_SEQUENCE, ...SEQUENCE_OUTCOMES]);
  const unknownOutcomes = new Set();
  for (const sequence of artifact.sequences) {
    if (!known.has(sequence.outcome)) unknownOutcomes.add(sequence.outcome);
  }

  return {
    sequences: artifact.sequences.filter((sequence) => sequence.outcome !== NOT_A_SEQUENCE),
    steps: artifact.steps,
    operations: artifact.operations,
    unknownOutcomes: [...unknownOutcomes].sort(),
  };
}

/**
 * Group the steps of each sequence by the operation each step names.
 *
 * The owner set of a sequence is the union over its steps' operations, which is why the
 * step axis is carried whole: a sequence whose second step crosses a boundary is a
 * cross-boundary sequence, and a reader that looked only at the first step would call it
 * local.
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
function groupStepOperationsBySequence(steps) {
  const operationsBySequence = new Map();
  for (const step of steps) {
    if (!operationsBySequence.has(step.sequence)) operationsBySequence.set(step.sequence, []);
    operationsBySequence.get(step.sequence).push(step.operation);
  }
  return operationsBySequence;
}

/**
 * The packages one sequence touches, sorted.
 *
 * @param {{ id: string }} sequence
 * @param {Map<string, string[]>} operationsBySequence
 * @param {Map<string, object>} operationById
 * @param {Map<string, string>} ownershipByCanonicalName
 * @returns {string[]}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function classifySequenceOwnership(sequence, operationsBySequence, operationById, ownershipByCanonicalName) {
  const owners = new Set();
  for (const operationId of operationsBySequence.get(sequence.id) ?? []) {
    const operation = operationById.get(operationId);
    if (operation === undefined) continue;
    for (const owner of resolveOperationOwners(operation, ownershipByCanonicalName)) owners.add(owner);
  }
  return [...owners].sort();
}

/**
 * How the sequences divide between the three ownership buckets.
 *
 * The three are a partition of the sequences that are sequences, mirrored on the
 * operation axis so that the two can be cross-checked against each other.
 *
 * @param {{ sequences: Array<{ id: string }>, steps: Array<{ sequence: string, operation: string }>, operations: Array<{ id: string }> }} units
 * @param {Map<string, string>} ownershipByCanonicalName
 * @returns {{ onePackage: number, severalPackages: number, noKnownPackage: number, total: number }}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function sequenceAxisBuckets(units, ownershipByCanonicalName) {
  const operationsBySequence = groupStepOperationsBySequence(units.steps);
  const operationById = new Map(units.operations.map((operation) => [operation.id, operation]));

  const buckets = { onePackage: 0, severalPackages: 0, noKnownPackage: 0, total: 0 };
  for (const sequence of units.sequences) {
    const ownerCount = classifySequenceOwnership(sequence, operationsBySequence, operationById, ownershipByCanonicalName).length;
    if (ownerCount === 0) buckets.noKnownPackage += 1;
    else if (ownerCount === 1) buckets.onePackage += 1;
    else buckets.severalPackages += 1;
    buckets.total += 1;
  }
  return buckets;
}

/**
 * The sequences that touch no package at all, sorted by artifact order.
 *
 * Named rather than only counted, because the handling of exactly these five is what
 * PX-257 has to decide, and a count cannot be handed to that decision.
 *
 * @param {{ sequences: Array<{ id: string }>, steps: Array<{ sequence: string, operation: string }>, operations: Array<{ id: string }> }} units
 * @param {Map<string, string>} ownershipByCanonicalName
 * @returns {string[]}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function collectSequencesWithNoKnownPackage(units, ownershipByCanonicalName) {
  const operationsBySequence = groupStepOperationsBySequence(units.steps);
  const operationById = new Map(units.operations.map((operation) => [operation.id, operation]));

  return units.sequences
    .filter((sequence) => classifySequenceOwnership(sequence, operationsBySequence, operationById, ownershipByCanonicalName).length === 0)
    .map((sequence) => sequence.id);
}
