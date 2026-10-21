// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
/**
 * Migrate a schema-v2 sequences artifact to schema v3.
 *
 * The migration derives typed contracts from records the workspace already holds: the
 * operation envelope, the boundary contract registry, and the sequence's cross-boundary
 * units. It never reads prose to invent a fact, so the result is deterministic and a
 * second run is a no-op. The v2 fields are preserved; the migration only adds fields.
 */
import { createHash } from 'node:crypto';

import { SURFACES } from './surfaces.mjs';

export const SCHEMA_V2 = 2;
export const SCHEMA_V3 = 3;

/** One typed fact. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function fact(factId, text, source) {
  return { factId, text: String(text ?? ''), source };
}

/** The facts the operation envelope states, independent of any boundary. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function envelopeFacts(operation) {
  const pre = [];
  const post = [];
  const invariants = [];
  const errors = [];
  const produces = [];

  if (operation.required_authority && operation.required_authority !== 'none') {
    pre.push(fact(`authority:${operation.required_authority}`, operation.required_authority, 'operation.required_authority'));
  }
  if (operation.requires_session_binding === true) {
    pre.push(fact('session_binding', 'a session binding is required', 'operation.requires_session_binding'));
  }
  if (operation.requires_remote_time_handshake === true) {
    pre.push(fact('remote_time_handshake', 'a remote time handshake is required', 'operation.requires_remote_time_handshake'));
  }
  if (operation.required_pre_state_checkpoint === true) {
    pre.push(fact('pre_state_checkpoint', 'a pre-state checkpoint is required', 'operation.required_pre_state_checkpoint'));
  }
  for (const proof of operation.required_proof_classes ?? []) {
    pre.push(fact(`proof:${proof}`, proof, 'operation.required_proof_classes'));
  }

  for (const objectClass of operation.result_object_classes ?? []) {
    post.push(fact(`object:${objectClass}`, objectClass, 'operation.result_object_classes'));
    produces.push(`object:${objectClass}`);
  }
  if (operation.initial_status) {
    post.push(fact(`status:${operation.initial_status}`, operation.initial_status, 'operation.initial_status'));
  }
  if (operation.finality_predicate && operation.finality_predicate !== 'none') {
    post.push(fact('finality', operation.finality_predicate, 'operation.finality_predicate'));
  }
  if (operation.external_dependency_class && operation.external_dependency_class !== 'none') {
    post.push(fact(`external:${operation.external_dependency_class}`, operation.external_dependency_class, 'operation.external_dependency_class'));
  }

  if (operation.idempotency_scope) {
    invariants.push(fact('idempotency', operation.idempotency_scope, 'operation.idempotency_scope'));
  }
  if (operation.reversal_or_recovery_rule) {
    invariants.push(fact('reversal', operation.reversal_or_recovery_rule, 'operation.reversal_or_recovery_rule'));
  }
  for (const family of operation.reject_code_families ?? []) {
    errors.push(`family:${family}`);
  }

  return { pre, post, invariants, errors, produces };
}

/** The owner packages of every operation, read from the views. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function operationOwnersOf(packages) {
  const owners = new Map();
  for (const pkg of packages) {
    for (const unit of pkg.view?.ownedOperationUnits ?? []) {
      if (!owners.has(unit.operationId)) owners.set(unit.operationId, new Set());
      owners.get(unit.operationId).add(pkg.id);
      for (const ownerPackageId of unit.ownerPackageIds ?? []) owners.get(unit.operationId).add(ownerPackageId);
    }
  }
  return owners;
}

/** The cross-boundary units of every sequence, keyed by sequence id. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function sequenceCrossUnitsOf(packages) {
  const units = new Map();
  for (const pkg of packages) {
    for (const unit of pkg.view?.crossBoundarySequenceUnits ?? []) {
      if (!units.has(unit.sequenceId)) units.set(unit.sequenceId, []);
      units.get(unit.sequenceId).push(unit);
    }
  }
  return units;
}

/** The boundaries whose two sides are both inside a set of owner packages. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function boundariesInside(ownerPackages, boundaries) {
  const result = [];
  for (const boundary of boundaries) {
    if (ownerPackages.has(boundary.provider_package) && ownerPackages.has(boundary.consumer_package)) {
      result.push(boundary);
    }
  }
  return result;
}

/** The boundaries a step crosses: a sequence unit names the packages on both sides. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function crossingsOf(step, owners, sequenceUnits, boundaries) {
  const units = sequenceUnits.get(step.sequence) ?? [];
  const crossed = new Set();
  for (const unit of units) {
    if (typeof unit.subject === 'string' && unit.subject.startsWith('boundary-')) {
      crossed.add(unit.subject);
    }
    const unitOwners = new Set(unit.ownerPackageIds ?? []);
    for (const boundary of boundariesInside(unitOwners, boundaries)) crossed.add(boundary.id);
  }
  return [...crossed].filter((boundaryId) => {
    const boundary = boundaries.find((entry) => entry.id === boundaryId);
    if (boundary === undefined) return false;
    return owners.has(boundary.provider_package) || owners.has(boundary.consumer_package);
  });
}

/** The clause facts a boundary contributes to one side. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function boundaryFacts(contract, clauseName) {
  const value = contract.clauses?.[clauseName];
  if (Array.isArray(value)) {
    return value.map((entry, index) => fact(`boundary:${contract.boundary_id}/${clauseName}/${index}`, entry, `boundary:${contract.boundary_id}/${clauseName}/${index}`));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return [fact(`boundary:${contract.boundary_id}/${clauseName}`, value, `boundary:${contract.boundary_id}/${clauseName}`)];
  }
  return [];
}

/** The typed contract of one step. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function typedContractFor(input) {
  const { step, operation, owners, sequenceUnits, boundaries, contractsByBoundary } = input;
  const envelope = envelopeFacts(operation);
  const crosses = crossingsOf(step, owners, sequenceUnits, boundaries);
  const pre = [...envelope.pre];
  const post = [...envelope.post];
  const invariants = [...envelope.invariants];
  const errors = [...envelope.errors];
  const produces = [...envelope.produces];
  const consumes = [];

  for (const boundaryId of crosses) {
    const contract = contractsByBoundary.get(boundaryId);
    if (contract === undefined) continue;
    const isProvider = owners.has(contract.provider_package);
    const isConsumer = owners.has(contract.consumer_package);
    const input = boundaryFacts(contract, 'input');
    const output = boundaryFacts(contract, 'output');
    const preconditions = boundaryFacts(contract, 'preconditions');
    const postconditions = boundaryFacts(contract, 'postconditions');
    invariants.push(...boundaryFacts(contract, 'invariants'));
    if (isConsumer) {
      pre.push(...input, ...preconditions);
      consumes.push(...input.map((entry) => entry.factId), ...preconditions.map((entry) => entry.factId));
    }
    if (isProvider) {
      post.push(...input, ...preconditions, ...output, ...postconditions);
      produces.push(...output.map((entry) => entry.factId), ...postconditions.map((entry) => entry.factId));
      errors.push(...boundaryFacts(contract, 'errors').map((entry) => entry.factId));
    }
  }

  return { pre, post, invariants, errors, consumes, produces, crosses };
}

/** The contribution value an operation carries after the migration. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function contributionOf(operation, annotation) {
  if (annotation?.registry_contribution === 'required' || annotation?.registry_contribution === 'not_required') {
    const declared = { registry_contribution: annotation.registry_contribution };
    if (typeof annotation.registry_contribution_ground === 'string' && annotation.registry_contribution_ground.trim() !== '') {
      declared.registry_contribution_ground = annotation.registry_contribution_ground;
    }
    return declared;
  }
  if (operation.disposition !== 'active' || operation.mutates_protocol_state !== true) {
    return {
      registry_contribution: 'not_required',
      registry_contribution_ground: `disposition ${operation.disposition}; position ${operation.position}`,
    };
  }
  return { registry_contribution: 'required' };
}

/** Split an annotations document into its step map and its operation map. */
export function splitAnnotations(document = {}) {
  return {
    stepAnnotations: document.annotations ?? document.steps ?? document,
    operationAnnotations: document.operations ?? {},
  };
}

/** Make a transition target a declared status only when a ground states it is terminal. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function normalizeStatusGraph(operation, terminalityGrounds = {}) {
  const transitions = { ...(operation.allowed_status_transitions ?? {}) };
  for (const targets of Object.values(transitions)) {
    for (const target of targets ?? []) {
      if (transitions[target] !== undefined) continue;
      const ground = terminalityGrounds[target];
      if (typeof ground === 'string' && ground.trim() !== '') transitions[target] = [];
    }
  }
  if (operation.initial_status && transitions[operation.initial_status] === undefined) {
    const ground = terminalityGrounds[operation.initial_status];
    if (typeof ground === 'string' && ground.trim() !== '') transitions[operation.initial_status] = [];
  }
  return transitions;
}

/** The boundary effects of one operation. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function boundaryEffectsOf(operationId, owners, boundaries) {
  const effects = [];
  for (const boundary of boundaries) {
    if (owners.has(boundary.provider_package)) effects.push({ boundary: boundary.id, direction: 'provides' });
    if (owners.has(boundary.consumer_package)) effects.push({ boundary: boundary.id, direction: 'consumes' });
  }
  return effects;
}

/** The grounded object rows the v2 artifact declares. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function groundedObjectsOf(artifact) {
  const grounded = new Map();
  for (const object of artifact.groundedObjects ?? []) {
    if (object && typeof object.object === 'string' && typeof object.ground === 'string') grounded.set(object.object, object);
  }
  return [...grounded.values()];
}

/** The source digest the v2 artifact records, or a canonical fallback. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function sourceDigestOf(artifact, provided) {
  if (typeof provided === 'string' && provided.length > 0) return provided;
  return createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
}

/**
 * Migrate a v2 artifact to v3.
 *
 * @param {{ artifact: object, treeManifest: object, allocateManifest: object,
 *   packages: Array<object>, sourceDigest?: string }} input
 * @returns {object} the v3 artifact
 */
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
export function migrateArtifactToV3(input) {
  const { artifact, treeManifest, allocateManifest, packages, sourceDigest, annotations = {} } = input;
  if (artifact.schema_version === SCHEMA_V3) return artifact;

  const boundaries = treeManifest.dependencies?.boundaries ?? [];
  const contractsByBoundary = new Map((allocateManifest.contract_registry ?? []).map((contract) => [contract.boundary_id, contract]));
  const ownersByOperation = operationOwnersOf(packages);
  const sequenceUnits = sequenceCrossUnitsOf(packages);
  const { stepAnnotations, operationAnnotations } = splitAnnotations(annotations);

  const typedSteps = (artifact.steps ?? []).map((step) => {
    const operation = (artifact.operations ?? []).find((entry) => entry.id === step.operation) ?? {};
    const owners = ownersByOperation.get(step.operation) ?? new Set();
    const annotation = stepAnnotations[step.id] ?? stepAnnotations[`${step.sequence}/${step.operation}`];
    const contractProse = typeof step.contract === 'string' && step.contract.trim() !== ''
      ? step.contract
      : (typeof step.contract_prose === 'string' && step.contract_prose.trim() !== '' ? step.contract_prose : null);
    return {
      ...step,
      ...(annotation === undefined ? {} : { annotation }),
      ...(contractProse === null ? {} : { contract_prose: contractProse }),
      contract: typedContractFor({ step, operation, owners, sequenceUnits, boundaries, contractsByBoundary }),
    };
  });

  const producesByStep = new Map(typedSteps.map((step) => [step.id, new Set(step.contract.produces)]));
  for (const step of typedSteps) {
    const earlier = (typedSteps ?? []).filter((candidate) => candidate.sequence === step.sequence && candidate.line < step.line);
    for (const factEntry of step.contract.pre) {
      if (earlier.some((candidate) => producesByStep.get(candidate.id).has(factEntry.factId))) {
        step.contract.consumes.push(factEntry.factId);
      }
    }
    step.contract.consumes = [...new Set(step.contract.consumes)];
  }

  const typedOperations = (artifact.operations ?? []).map((operation) => {
    const owners = ownersByOperation.get(operation.id) ?? new Set();
    const contribution = contributionOf(operation, operationAnnotations[operation.id]);
    const terminalityGrounds = operation.status_terminality_ground
      ?? operationAnnotations[operation.id]?.status_terminality_ground
      ?? {};
    return {
      ...operation,
      allowed_status_transitions: normalizeStatusGraph(operation, terminalityGrounds),
      ...contribution,
      boundary_effects: boundaryEffectsOf(operation.id, owners, boundaries),
    };
  });

  return {
    ...artifact,
    schema_version: SCHEMA_V3,
    steps: typedSteps,
    operations: typedOperations,
    groundedObjects: groundedObjectsOf(artifact),
    migration: {
      from_schema_version: SCHEMA_V2,
      to_schema_version: SCHEMA_V3,
      source_digest: sourceDigestOf(artifact, sourceDigest),
      migrated_by: 'smooth-sequences/migrate-v3',
      synthesized_surfaces: [
        SURFACES.TYPED_STEP_CONTRACTS,
        SURFACES.OPERATION_TRANSITIONS,
        SURFACES.REGISTRY_CONTRIBUTION,
        SURFACES.BOUNDARY_EFFECTS,
        SURFACES.GROUNDED_OBJECTS,
      ],
    },
  };
}

/** Apply loop/retry/exception annotations to the steps named by the input. */
export function applyStepAnnotations(artifact, annotations = {}) {
  return {
    ...artifact,
    steps: (artifact.steps ?? []).map((step) => {
      const annotation = annotations[step.id] ?? annotations[`${step.sequence}/${step.operation}`];
      return annotation === undefined ? step : { ...step, annotation };
    }),
  };
}

/** Render an artifact deterministically. */
export function renderArtifact(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
