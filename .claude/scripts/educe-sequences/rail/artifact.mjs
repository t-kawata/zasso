// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
// [::TICKET::] PX-267 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-267 --for-spec --no-implementation-order`.
// Composing the artifact from the specification and one run's readings (PX-240).
//
// The declaration says what to look for and the readings say what was found; both
// arrive from the reading phases, because even the predicate limbs are a reading and a
// library that shipped them would be carrying one specification's values. Joining the
// two is the one place an entry meets the reading that judged it, which is what makes
// the neighbour a recorded fact rather than something the engine rediscovers.
import { basename } from 'node:path';

import { demandFactsBeside } from './demand.mjs';
import { ADJUDICATION_FIELDS, PREDICATE_LIMB_FIELD, carriesValue, readArtifactSchema } from './load.mjs';
import { establishPins } from './pins.mjs';
import { digestOfSupplied } from './supplied.mjs';

/** The command a reader is told to run to check the artifact later. */
// [::TICKET::] PX-241 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-241 --for-spec --no-implementation-order`.
export const VERIFY_COMMAND = 'node "$(git rev-parse --show-toplevel)/.claude/scripts/educe-sequences/rail/run.mjs" <spec-file>';

/**
 * The fields a v3 artifact carries that a v2 composition cannot reproduce.
 *
 * The v3 schema requires `steps[].contract` and `operations[].registry_contribution`;
 * the migration also writes `contract_prose`, `annotation`, the operation effects and the
 * top-level grounds. The list is named here rather than derived from the schema because
 * half of it is migration state, not schema vocabulary.
 */
const V3_STEP_SURFACES = Object.freeze(['contract', 'contract_prose', 'annotation']);
const V3_OPERATION_SURFACES = Object.freeze([
  'allowed_status_transitions',
  'registry_contribution',
  'registry_contribution_ground',
  'boundary_effects',
]);
const V3_ARTIFACT_SURFACES = Object.freeze([
  'groundedObjects',
  'boundary_grounds',
  'migration',
  'sequence_flow_grounds',
  'vocabulary',
]);

/** The operation envelope the artifact schema declares. */
const OPERATION_ENVELOPE = readArtifactSchema().operations.envelope;

/** The status members a status-bearing operation may use, or null when unstated. */
// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
function operationStatusMembers(pins) {
  const enumeration = (pins?.enumerations ?? [])
    .find((entry) => entry.name === OPERATION_ENVELOPE.statusEnumeration);
  return Array.isArray(enumeration?.members)
    ? enumeration.members.map((member) => String(member))
    : null;
}

/** A named refusal the phase gate can report. */
// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
function envelopeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Refuse a status that is not a member of the declared enumeration. */
// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
function assertStatusMember(operation, value, members, field) {
  if (members === null) {
    throw envelopeError(
      'OPERATION_STATUS_ENUMERATION_MISSING',
      `operation ${operation.id} states ${field} but the declaration has no ${OPERATION_ENVELOPE.statusEnumeration} enumeration`,
    );
  }
  if (!members.includes(String(value))) {
    throw envelopeError(
      'OPERATION_STATUS_UNKNOWN',
      `operation ${operation.id} ${field} ${value} is not a member of ${OPERATION_ENVELOPE.statusEnumeration}`,
    );
  }
}

/** Refuse a value whose shape the declared axis does not carry. */
// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
function assertAxisShape(operation, axis, value, shape) {
  const fail = (expected) => {
    throw envelopeError('OPERATION_ENVELOPE_SHAPE', `operation ${operation.id} ${axis} must be ${expected}`);
  };
  if (shape === 'status') {
    if (typeof value !== 'string' || value.trim() === '') fail('a non-empty string');
    return;
  }
  if (shape === 'string') {
    if (typeof value !== 'string') fail('a string');
    return;
  }
  if (shape === 'boolean') {
    if (typeof value !== 'boolean') fail('a boolean');
    return;
  }
  if (shape === 'stringArray') {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) fail('an array of strings');
    return;
  }
  if (shape === 'transitions') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('an object of status arrays');
    for (const [source, targets] of Object.entries(value)) {
      if (!Array.isArray(targets) || targets.some((entry) => typeof entry !== 'string')) {
        fail(`an array of statuses at ${source}`);
      }
    }
    return;
  }
  throw envelopeError('OPERATION_ENVELOPE_SHAPE', `operation ${operation.id} ${axis} names unknown shape ${shape}`);
}

/**
 * Validate the operation envelope axes the specification declared.
 *
 * An absent axis is not an error: a project that states no status axis carries neither
 * status field. A present axis must have the declared shape, and a status value must be a
 * member of the declared OperationStatus enumeration, so a non-member never reaches the
 * view or sequences-slice C6.
 *
 * @param {object[]} operations — the composed operation rows
 * @param {object} pins — the pins established for this generation
 * @returns {void}
 */
export function validateOperationEnvelope(operations, pins) {
  const members = operationStatusMembers(pins);
  const axes = Object.entries(OPERATION_ENVELOPE.axes);
  for (const operation of operations) {
    if (operation === null || typeof operation !== 'object') continue;
    for (const [axis, shape] of axes) {
      if (operation[axis] === undefined) continue;
      assertAxisShape(operation, axis, operation[axis], shape);
    }
    if (operation.initial_status !== undefined) {
      assertStatusMember(operation, operation.initial_status, members, 'initial_status');
    }
    if (operation.allowed_status_transitions !== undefined) {
      for (const [source, targets] of Object.entries(operation.allowed_status_transitions)) {
        assertStatusMember(operation, source, members, 'allowed_status_transitions source');
        for (const target of targets) {
          assertStatusMember(operation, target, members, 'allowed_status_transitions target');
        }
      }
      if (operation.initial_status !== undefined
        && Object.keys(operation.allowed_status_transitions).length > 0
        && !Object.hasOwn(operation.allowed_status_transitions, operation.initial_status)) {
        throw envelopeError(
          'OPERATION_STATUS_UNKNOWN',
          `operation ${operation.id} initial_status ${operation.initial_status} is not a key of allowed_status_transitions`,
        );
      }
    }
  }
}

/** The vocabulary fields a declaration may author for the artifact to carry. */
const DECLARATION_VOCABULARY_FIELDS = Object.freeze([
  'requiredInterfaces',
  'terminalStatuses',
  'applicability',
]);

/**
 * The vocabulary a declaration states, validated before it reaches the artifact.
 *
 * The artifact is the detector's only input; a malformed declaration must fail here
 * rather than become a vocabulary the detector reads as absent.
 */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function declarationVocabularyOf(declaration) {
  const vocabulary = declaration?.vocabulary;
  if (vocabulary === undefined) return null;
  if (vocabulary === null || typeof vocabulary !== 'object' || Array.isArray(vocabulary)) {
    throw new Error('declaration vocabulary must be an object');
  }
  const stated = {};
  for (const field of DECLARATION_VOCABULARY_FIELDS) {
    if (vocabulary[field] === undefined) continue;
    if (field === 'applicability') {
      if (vocabulary[field] === null || typeof vocabulary[field] !== 'object' || Array.isArray(vocabulary[field])) {
        throw new Error('declaration vocabulary.applicability must be an object');
      }
      stated[field] = vocabulary[field];
      continue;
    }
    if (!Array.isArray(vocabulary[field])
      || vocabulary[field].some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
      throw new Error(`declaration vocabulary.${field} must be an array of non-empty strings`);
    }
    stated[field] = vocabulary[field];
  }
  return Object.keys(stated).length === 0 ? null : stated;
}

/** Whether two artifacts were read from the same specification and the same material. */
export function isSameRevision(previous, next) {
  return previous?.spec?.sha256 === next?.spec?.sha256
    && previous?.spec?.lines === next?.spec?.lines
    && previous?.supplied?.digest === next?.supplied?.digest;
}

/**
 * Merge one row, keeping the previous row as the shape and preserving its v3 fields.
 *
 * Starting from the previous row keeps its key order, which is what makes an unchanged
 * composition byte-identical. A key the new reading dropped is deleted unless it is a v3
 * surface; a v3 surface is never overwritten by the v2 value that replaced its name.
 */
// [::TICKET::] PX-294 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-294 --for-spec --no-implementation-order`.
function mergeArtifactRow(previousRow, composedRow, preservedFields) {
  const merged = { ...previousRow };
  for (const key of Object.keys(merged)) {
    if (!(key in composedRow) && !preservedFields.includes(key)) delete merged[key];
  }
  for (const [key, value] of Object.entries(composedRow)) {
    if (!preservedFields.includes(key) || !(key in merged)) merged[key] = value;
  }
  return merged;
}

/** A step new to this generation keeps its prose, and receives no typed contract. */
// [::TICKET::] PX-294 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-294 --for-spec --no-implementation-order`.
function preserveNewStep(step) {
  const { contract, ...rest } = step;
  if (contract === undefined) return rest;
  return { ...rest, contract_prose: step.contract_prose ?? contract };
}

/**
 * Carry a v3 artifact's authored surfaces through a v2 composition.
 *
 * A v3 workspace re-enters the rail through the same composer that first produced it.
 * Without this merge the composer writes schema 2 over the migrated artifact, and smooth
 * reads that as `UNPROVEN_DOWNGRADE`. The merge is deliberately id-based and
 * revision-bound: a changed specification or supplied material is a new reading, and a
 * new id is not given an old contract.
 */
export function preserveV3Surfaces(previous, composed) {
  if (previous?.schema_version !== 3) return composed;
  if (!isSameRevision(previous, composed)) return composed;

  const previousSteps = new Map((previous.steps ?? []).map((step) => [step.id, step]));
  const previousOperations = new Map((previous.operations ?? []).map((operation) => [operation.id, operation]));
  const steps = (composed.steps ?? []).map((step) => {
    const previousStep = previousSteps.get(step.id);
    return previousStep === undefined
      ? preserveNewStep(step)
      : mergeArtifactRow(previousStep, step, V3_STEP_SURFACES);
  });
  const operations = (composed.operations ?? []).map((operation) => {
    const previousOperation = previousOperations.get(operation.id);
    return previousOperation === undefined
      ? operation
      : mergeArtifactRow(previousOperation, operation, V3_OPERATION_SURFACES);
  });

  const preserved = mergeArtifactRow(previous, composed, V3_ARTIFACT_SURFACES);
  preserved.schema_version = 3;
  preserved.steps = steps;
  preserved.operations = operations;
  return preserved;
}

/**
 * The fields of an adjudication row, taken from the reading that recorded it.
 *
 * A reading carries more than the artifact contracts — the reader's own category and reason
 * among them — and a pass-through would put those in the artifact as words no declaration owns
 * and no check decides. The row keeps what the schema names; the reading keeps the rest. A key
 * holding no answer is not carried, the rule the limb already follows: a key present and empty
 * is a field that answered nothing.
 */
// [::TICKET::] PX-268 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-268 --for-spec --no-implementation-order`.
function declaredFieldsOf(reading) {
  return Object.fromEntries(
    [...ADJUDICATION_FIELDS, PREDICATE_LIMB_FIELD]
      .filter((field) => carriesValue(reading, field))
      .map((field) => [field, reading[field]]),
  );
}

/**
 * Compose the artifact.
 *
 * The recorded path is the file name, not the path the run was invoked with: the
 * artifact sits beside the specification, so its own location plus this name identifies
 * the revision, and a committed artifact that named a home directory would depend on
 * the machine that produced it as well as on its input.
 *
 * The supplied digest is recorded because the reproducibility guarantee is over the
 * specification *and* the material the reading was taken with: a hint that changes the
 * reading while leaving the text alone would otherwise leave the artifact looking
 * reproducible when it is not. A run given nothing records the digest of nothing, which
 * is the same value a verification computes beside a specification with no run.
 */
// [::TICKET::] PX-240, PX-242, PX-248 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-240|PX-242|PX-248) --for-spec --no-implementation-order`.
// [::TICKET::] PX-260 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-260 --for-spec --no-implementation-order`.
// [::TICKET::] PX-261 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function buildArtifact({ specPath, spec, declaration, readings, supplied = digestOfSupplied([]), suppliedDocuments = {}, previousArtifact = null }) {
  const pins = establishPins(spec.lines, declaration, suppliedDocuments);
  const readingFor = new Map(readings.sequences.map((reading) => [reading.subject, reading]));

  const composed = {
    // The version is read from the schema rather than written here, so a schema change
    // and the artifacts it produces cannot disagree about which contract they carry.
    schema_version: readArtifactSchema().schema_version,
    spec: { path: basename(specPath), sha256: spec.sha256, lines: spec.lineCount },
    supplied: { digest: supplied },
    pins,
    sequences: declaration.entries.map((entry) => {
      const reading = readingFor.get(entry.id);
      return {
        ...entry,
        outcome: reading?.outcome ?? null,
        ...(reading?.neighbour === undefined ? {} : { neighbour: reading.neighbour }),
        // The limb travels with the row for the same reason the neighbour does: a check that
        // asks a ruling to cite one reads the artifact, not the reading, and a fact left behind
        // in the reading is a fact no check can see. A key carrying no answer is not carried,
        // because an entry that answered nothing has not cited a limb.
        ...(reading !== undefined && carriesValue(reading, PREDICATE_LIMB_FIELD)
          ? { [PREDICATE_LIMB_FIELD]: reading[PREDICATE_LIMB_FIELD] }
          : {}),
      };
    }),
    steps: readings.steps,
    operations: readings.operations,
    adjudications: (readings.adjudications ?? []).map((reading) => declaredFieldsOf(reading)),
    sections: declaration.sections,
    exemptions: declaration.exemptions,
    verify: { command: VERIFY_COMMAND, expected_exit: 0 },
  };

  // The envelope is validated before the artifact is handed to the demand or the v3
  // preservation pass, so a non-member status refuses the reading rather than reaching a
  // downstream C6 finding or a property obligation.
  validateOperationEnvelope(composed.operations, pins);

  // The demand is stated after the rest is composed, because it is read from what was composed:
  // the candidate columns are the pinned vocabularies crossed with this artifact's own operation
  // rows. Who owes a demand is deliberately absent — the rail emits, and the slice assigns.
  const authoredVocabulary = declarationVocabularyOf(declaration);
  const withDemand = { ...composed, demand: demandFactsBeside(specPath, composed) };
  const preserved = preserveV3Surfaces(previousArtifact, withDemand);
  if (authoredVocabulary === null) return preserved;
  return { ...preserved, vocabulary: { ...(preserved.vocabulary ?? {}), ...authoredVocabulary } };
}
