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
 * Since PX-286 the record also partitions rows into authored and synthesized counts. A
 * migration may preserve an authored v2 field while deriving another; a single surface
 * name is no longer enough to say which rows are evidence and which are projection. A
 * surface is authored only when no row was synthesized. Origin `unknown` is a third
 * state: a v3 artifact whose migration record states neither an authorship map nor a
 * synthesized list cannot be trusted as authored, so a spec claim over it is blocked.
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
  UNKNOWN: 'unknown',
  ABSENT: 'absent',
});

const ACTIVE_DISPOSITION = 'active';
const AUTHORED_FACT_FIELDS = Object.freeze(['pre', 'post', 'consumes', 'produces', 'errors']);
const AUTHORSHIP_KEY = 'authorship';
const SYNTHESIZED_SURFACES_KEY = 'synthesized_surfaces';

/** The active operations a status or effect surface is measured over. */
function collectActiveOperations(index) {
  return (index.artifact?.operations ?? []).filter((operation) => operation?.disposition === ACTIVE_DISPOSITION);
}

/** Whether a step carries typed authored facts, or an authored prose contract. */
// [::TICKET::] PX-288, PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-288|PX-306) --for-spec --no-implementation-order`.
function hasAuthoredContract(step) {
  if (['synthesized', 'projected'].includes(step?.contract?.contract_origin)) return false;
  const authored = step?.contract?.authored;
  if (authored !== null && typeof authored === 'object') {
    const hasTypedFact = AUTHORED_FACT_FIELDS.some((field) => Array.isArray(authored[field]) && authored[field].length > 0);
    if (hasTypedFact) return true;
  }
  return typeof step?.contract_prose === 'string' && step.contract_prose.trim() !== '';
}

/** The steps that carry a typed (object) contract. */
function collectTypedSteps(index) {
  return (index.artifact?.steps ?? []).filter((step) => step?.contract !== null
    && typeof step?.contract === 'object'
    && !Array.isArray(step.contract));
}

/** The steps that carry an authored contract rather than a registry projection. */
function collectAuthoredSteps(index) {
  return (index.artifact?.steps ?? []).filter((step) => hasAuthoredContract(step));
}

/** The steps that declare at least one crossing. */
function collectCrossingSteps(index) {
  return collectTypedSteps(index).filter((step) => Object.prototype.hasOwnProperty.call(step.contract, 'crosses'));
}

/** The authorship map a migration recorded, or null when it recorded none. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function readAuthorship(index) {
  const authorship = index.artifact?.migration?.[AUTHORSHIP_KEY];
  return authorship !== null && typeof authorship === 'object' && !Array.isArray(authorship) ? authorship : null;
}

/** The surfaces a migration marked synthesized, or null when it marked none. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function readSynthesizedSurfaces(index) {
  const listed = index.artifact?.migration?.[SYNTHESIZED_SURFACES_KEY];
  return Array.isArray(listed) ? new Set(listed) : null;
}

/** The authorship record for one surface, inheriting the typed contract for crossings. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function readAuthorshipRecord(index, surface) {
  const authorship = readAuthorship(index);
  if (authorship === null) return null;
  const own = authorship[surface];
  if (own !== undefined) return own;
  if (surface === SURFACES.STEP_CROSSINGS) return authorship[SURFACES.TYPED_STEP_CONTRACTS] ?? null;
  return null;
}

/** The origin of one surface. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function surfaceOriginOf(index, surface) {
  const authorship = readAuthorship(index);
  if (authorship !== null) {
    const record = readAuthorshipRecord(index, surface);
    if (record === null) return ORIGIN.AUTHORED;
    if (!Array.isArray(record.authored) || !Array.isArray(record.synthesized)) return ORIGIN.UNKNOWN;
    return record.synthesized.length === 0 ? ORIGIN.AUTHORED : ORIGIN.MIGRATION;
  }

  const migration = index.artifact?.migration;
  if (migration === undefined || migration === null) return ORIGIN.AUTHORED;
  const listed = readSynthesizedSurfaces(index);
  if (listed === null) return ORIGIN.UNKNOWN;
  if (surface === SURFACES.STEP_CROSSINGS && listed.has(SURFACES.TYPED_STEP_CONTRACTS)) {
    return ORIGIN.MIGRATION;
  }
  return listed.has(surface) ? ORIGIN.MIGRATION : ORIGIN.AUTHORED;
}

/** The authored and synthesized row counts a surface declares. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function countOrigins(index, surface, cardinality, origin) {
  if (origin === ORIGIN.ABSENT) return { authoredCardinality: 0, synthesizedCardinality: 0 };
  if (origin === ORIGIN.AUTHORED) return { authoredCardinality: cardinality, synthesizedCardinality: 0 };
  if (origin === ORIGIN.MIGRATION) {
    const record = readAuthorshipRecord(index, surface);
    const authored = Array.isArray(record?.authored) ? Math.min(record.authored.length, cardinality) : 0;
    return { authoredCardinality: authored, synthesizedCardinality: cardinality - authored };
  }
  return { authoredCardinality: 0, synthesizedCardinality: cardinality };
}

/** A surface record with its row partition. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function surfaceRecord(index, surface, present, cardinality) {
  const origin = present ? surfaceOriginOf(index, surface) : ORIGIN.ABSENT;
  return { present, origin, cardinality, ...countOrigins(index, surface, cardinality, origin) };
}

/** A surface backed by a top-level array. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function readArraySurface(index, surface, rows) {
  const present = Array.isArray(rows);
  return surfaceRecord(index, surface, present, present ? rows.length : 0);
}

/** A field that every active operation must carry for the surface to be complete. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function readFieldOnEveryActiveOperation(index, surface, field) {
  const operations = collectActiveOperations(index);
  if (operations.length === 0) return surfaceRecord(index, surface, false, 0);
  const carrying = operations.filter((operation) => Object.prototype.hasOwnProperty.call(operation, field));
  if (carrying.length !== operations.length) return surfaceRecord(index, surface, false, 0);
  return surfaceRecord(index, surface, true, operations.length);
}

/** The record for a surface whose rows are computed by a collector. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function readCollectedSurface(index, surface, rows) {
  return surfaceRecord(index, surface, rows.length > 0, rows.length);
}

/** A surface that is optional: absence means no rows, not missing evidence. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function readOptionalArraySurface(index, surface, rows) {
  return surfaceRecord(index, surface, true, Array.isArray(rows) ? rows.length : 0);
}

/**
 * Read one surface.
 *
 * @param {object} index — the value `indexArtifact` returns
 * @param {string} surface — one of `SURFACES`
 * @returns {{ present: boolean, origin: string, cardinality: number,
 *   authoredCardinality: number, synthesizedCardinality: number }}
 */
export function surfaceAvailabilityOf(index, surface) {
  switch (surface) {
    case SURFACES.OPERATIONS:
      return readArraySurface(index, surface, index.artifact?.operations);
    case SURFACES.SEQUENCES:
      return readArraySurface(index, surface, index.artifact?.sequences);
    case SURFACES.STEPS:
      return readArraySurface(index, surface, index.artifact?.steps);
    case SURFACES.OPERATION_TRANSITIONS:
      return readFieldOnEveryActiveOperation(index, surface, 'allowed_status_transitions');
    case SURFACES.REGISTRY_CONTRIBUTION:
      return readFieldOnEveryActiveOperation(index, surface, 'registry_contribution');
    case SURFACES.BOUNDARY_EFFECTS:
      return readFieldOnEveryActiveOperation(index, surface, 'boundary_effects');
    case SURFACES.TYPED_STEP_CONTRACTS:
      return readCollectedSurface(index, surface, collectTypedSteps(index));
    case SURFACES.AUTHORED_CONTRACTS:
      return readCollectedSurface(index, surface, collectAuthoredSteps(index));
    case SURFACES.STEP_CROSSINGS:
      return readCollectedSurface(index, surface, collectCrossingSteps(index));
    case SURFACES.BOUNDARY_GROUNDS:
      return readOptionalArraySurface(index, surface, index.artifact?.boundary_grounds);
    case SURFACES.GROUNDED_OBJECTS:
      return readOptionalArraySurface(index, surface, index.artifact?.groundedObjects);
    case SURFACES.CONTRACT_REGISTRY:
      return readArraySurface(index, surface, index.allocateManifest?.contract_registry);
    case SURFACES.PACKAGE_VIEWS:
      return surfaceRecord(index, surface, (index.packages ?? []).length > 0, (index.packages ?? []).length);
    case SURFACES.OBLIGATION_UNITS: {
      const views = (index.packages ?? []).filter((pkg) => Array.isArray(pkg.view?.obligationUnits));
      const cardinality = views.reduce((total, pkg) => total + pkg.view.obligationUnits.length, 0);
      return surfaceRecord(index, surface, views.length > 0, cardinality);
    }
    case SURFACES.TERMINAL_STATUSES: {
      const names = index.vocabulary?.terminalStatuses;
      return surfaceRecord(index, surface, names !== null, Array.isArray(names) ? names.length : 0);
    }
    case SURFACES.REQUIRED_INTERFACES: {
      const names = index.vocabulary?.requiredInterfaces;
      return surfaceRecord(index, surface, names !== null, Array.isArray(names) ? names.length : 0);
    }
    default:
      throw new SmoothSequencesError(`unknown surface ${surface}`, {
        code: 'UNKNOWN_SURFACE',
        repair: 'Add the surface to SURFACES and to surfaceAvailabilityOf.',
      });
  }
}
