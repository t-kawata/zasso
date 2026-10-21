/**
 * The evidence surfaces a check reads.
 *
 * The detector's old failure mode was to read an absent array as an empty one: a check
 * that looped over `operation.boundary_effects ?? []` reported "no drift" when the field
 * did not exist at all. A surface record makes that difference explicit. `present` says
 * whether the workspace authored the field completely; `origin` says who wrote it; and
 * `cardinality` says how many rows the check would measure. A check may execute only
 * when every required surface is present and its denominator is positive.
 *
 * `migration` origin is the second half of the rule: a surface a migration synthesized
 * is not authored evidence. A spec-claiming check must refuse it; a projection-claiming
 * check may still measure it because its question is about the projection itself.
 */
import { SmoothSequencesError } from './errors.mjs';

export const SURFACES = Object.freeze({
  OPERATIONS: 'operations',
  SEQUENCES: 'sequences',
  STEPS: 'steps',
  OPERATION_TRANSITIONS: 'operations[].allowed_status_transitions',
  REGISTRY_CONTRIBUTION: 'operations[].registry_contribution',
  BOUNDARY_EFFECTS: 'operations[].boundary_effects',
  TYPED_STEP_CONTRACTS: 'steps[].contract',
  AUTHORED_CONTRACTS: 'steps[].contract.authored',
  STEP_CROSSINGS: 'steps[].contract.crosses',
  BOUNDARY_GROUNDS: 'artifact.boundary_grounds',
  GROUNDED_OBJECTS: 'artifact.groundedObjects',
  CONTRACT_REGISTRY: 'allocate.contract_registry',
  PACKAGE_VIEWS: 'packages[].SEQUENCES.json',
  OBLIGATION_UNITS: 'views[].obligationUnits',
  TERMINAL_STATUSES: 'vocabulary.terminalStatuses',
  REQUIRED_INTERFACES: 'vocabulary.requiredInterfaces',
});

export const ORIGIN = Object.freeze({
  AUTHORED: 'authored',
  MIGRATION: 'migration',
  ABSENT: 'absent',
});

const ACTIVE_DISPOSITION = 'active';
const AUTHORED_FACT_FIELDS = Object.freeze(['pre', 'post', 'consumes', 'produces', 'errors']);

/** The active operations a status or effect surface is measured over. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function collectActiveOperations(index) {
  return (index.artifact?.operations ?? []).filter((operation) => operation?.disposition === ACTIVE_DISPOSITION);
}

/** Whether a step carries typed authored facts, or an authored prose contract. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function hasAuthoredContract(step) {
  const authored = step?.contract?.authored;
  if (authored !== null && typeof authored === 'object') {
    const hasTypedFact = AUTHORED_FACT_FIELDS.some((field) => Array.isArray(authored[field]) && authored[field].length > 0);
    if (hasTypedFact) return true;
  }
  return typeof step?.contract_prose === 'string' && step.contract_prose.trim() !== '';
}

/** The steps that carry a typed (object) contract. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function collectTypedSteps(index) {
  return (index.artifact?.steps ?? []).filter((step) => step?.contract !== null
    && typeof step?.contract === 'object'
    && !Array.isArray(step.contract));
}

/** The steps that carry an authored contract rather than a registry projection. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function collectAuthoredSteps(index) {
  return (index.artifact?.steps ?? []).filter((step) => hasAuthoredContract(step));
}

/** The steps that declare at least one crossing. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function collectCrossingSteps(index) {
  return collectTypedSteps(index).filter((step) => Object.prototype.hasOwnProperty.call(step.contract, 'crosses'));
}

/** The surfaces a migration synthesized, if the artifact records any. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function readSynthesizedSurfaces(index) {
  const listed = index.artifact?.migration?.synthesized_surfaces;
  return new Set(Array.isArray(listed) ? listed : []);
}

/** The origin of one surface. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function surfaceOriginOf(index, surface) {
  return readSynthesizedSurfaces(index).has(surface) ? ORIGIN.MIGRATION : ORIGIN.AUTHORED;
}

/** A surface backed by a top-level array. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function readArraySurface(rows, origin) {
  return {
    present: Array.isArray(rows),
    origin: Array.isArray(rows) ? origin : ORIGIN.ABSENT,
    cardinality: Array.isArray(rows) ? rows.length : 0,
  };
}

/** A field that every active operation must carry for the surface to be complete. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function readFieldOnEveryActiveOperation(index, field, origin) {
  const operations = collectActiveOperations(index);
  if (operations.length === 0) return { present: false, origin: ORIGIN.ABSENT, cardinality: 0 };
  const carrying = operations.filter((operation) => Object.prototype.hasOwnProperty.call(operation, field));
  return {
    present: carrying.length === operations.length,
    origin: carrying.length === operations.length ? origin : ORIGIN.ABSENT,
    cardinality: carrying.length,
  };
}

/** A surface that is optional: absence means no exemptions, not missing evidence. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function readOptionalArraySurface(rows, origin) {
  return {
    present: true,
    origin,
    cardinality: Array.isArray(rows) ? rows.length : 0,
  };
}

/**
 * Read one surface.
 *
 * @param {object} index — the value `indexArtifact` returns
 * @param {string} surface — one of `SURFACES`
 * @returns {{ present: boolean, origin: string, cardinality: number }}
 */
export function surfaceAvailabilityOf(index, surface) {
  const origin = surfaceOriginOf(index, surface);
  switch (surface) {
    case SURFACES.OPERATIONS:
      return readArraySurface(index.artifact?.operations, origin);
    case SURFACES.SEQUENCES:
      return readArraySurface(index.artifact?.sequences, origin);
    case SURFACES.STEPS:
      return readArraySurface(index.artifact?.steps, origin);
    case SURFACES.OPERATION_TRANSITIONS:
      return readFieldOnEveryActiveOperation(index, 'allowed_status_transitions', origin);
    case SURFACES.REGISTRY_CONTRIBUTION:
      return readFieldOnEveryActiveOperation(index, 'registry_contribution', origin);
    case SURFACES.BOUNDARY_EFFECTS:
      return readFieldOnEveryActiveOperation(index, 'boundary_effects', origin);
    case SURFACES.TYPED_STEP_CONTRACTS: {
      const steps = collectTypedSteps(index);
      return { present: steps.length > 0, origin: steps.length > 0 ? origin : ORIGIN.ABSENT, cardinality: steps.length };
    }
    case SURFACES.AUTHORED_CONTRACTS: {
      const steps = collectAuthoredSteps(index);
      return { present: steps.length > 0, origin: steps.length > 0 ? origin : ORIGIN.ABSENT, cardinality: steps.length };
    }
    case SURFACES.STEP_CROSSINGS: {
      const steps = collectCrossingSteps(index);
      return { present: steps.length > 0, origin: steps.length > 0 ? origin : ORIGIN.ABSENT, cardinality: steps.length };
    }
    case SURFACES.BOUNDARY_GROUNDS:
      return readOptionalArraySurface(index.artifact?.boundary_grounds, origin);
    case SURFACES.GROUNDED_OBJECTS:
      return readOptionalArraySurface(index.artifact?.groundedObjects, origin);
    case SURFACES.CONTRACT_REGISTRY:
      return readArraySurface(index.allocateManifest?.contract_registry, origin);
    case SURFACES.PACKAGE_VIEWS:
      return {
        present: (index.packages ?? []).length > 0,
        origin,
        cardinality: (index.packages ?? []).length,
      };
    case SURFACES.OBLIGATION_UNITS: {
      const views = (index.packages ?? []).filter((pkg) => Array.isArray(pkg.view?.obligationUnits));
      const cardinality = views.reduce((total, pkg) => total + pkg.view.obligationUnits.length, 0);
      return { present: views.length > 0, origin: views.length > 0 ? origin : ORIGIN.ABSENT, cardinality };
    }
    case SURFACES.TERMINAL_STATUSES: {
      const names = index.vocabulary?.terminalStatuses;
      return { present: names !== null, origin, cardinality: Array.isArray(names) ? names.length : 0 };
    }
    case SURFACES.REQUIRED_INTERFACES: {
      const names = index.vocabulary?.requiredInterfaces;
      return { present: names !== null, origin, cardinality: Array.isArray(names) ? names.length : 0 };
    }
    default:
      throw new SmoothSequencesError(`unknown surface ${surface}`, {
        code: 'UNKNOWN_SURFACE',
        repair: 'Add the surface to SURFACES and to surfaceAvailabilityOf.',
      });
  }
}
