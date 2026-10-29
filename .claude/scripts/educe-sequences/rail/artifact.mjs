// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
// [::TICKET::] PX-267 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-267 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-294 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-294 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-294 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-294 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-240, PX-242, PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-242|PX-248) --for-spec --no-implementation-order`.
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
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

  // The demand is stated after the rest is composed, because it is read from what was composed:
  // the candidate columns are the pinned vocabularies crossed with this artifact's own operation
  // rows. Who owes a demand is deliberately absent — the rail emits, and the slice assigns.
  const withDemand = { ...composed, demand: demandFactsBeside(specPath, composed) };
  return preserveV3Surfaces(previousArtifact, withDemand);
}
