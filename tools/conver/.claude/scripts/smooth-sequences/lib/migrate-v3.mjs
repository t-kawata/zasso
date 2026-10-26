/**
 * Migrate a schema-v2 sequences artifact to schema v3, and merge authored annotations
 * into an artifact that is already v3.
 *
 * The migration derives typed contracts from records the workspace already holds: the
 * operation envelope, the boundary contract registry, and the sequence's cross-boundary
 * units. It never reads prose to invent a fact, so the result is deterministic and a
 * second run is a no-op.
 *
 * Authoring annotations are the evidence a v2 artifact cannot carry: a step's typed
 * assertions, an operation's contribution or effects, and a boundary's ground. Every
 * authored assertion cites the step line and a quote the step actually carries; an
 * uncited assertion is refused rather than written. The artifact records per-surface
 * authorship so the detector can tell an authored row from a synthesized projection.
 */
import { createHash } from 'node:crypto';

import { SmoothSequencesError } from './errors.mjs';
import {
  contentTokens,
  isFactTextSupported,
  MIN_FACT_SUPPORT_RATIO,
  normalizeFactText,
  registryOriginOf,
  resolveFactOrigin,
  typedFactSupports,
} from './fact-origin.mjs';
import { SURFACES } from './surfaces.mjs';

export { contentTokens, isFactTextSupported, MIN_FACT_SUPPORT_RATIO } from './fact-origin.mjs';

export const SCHEMA_V2 = 2;
export const SCHEMA_V3 = 3;
export const UNCITED_AUTHORED_FACT = 'UNCITED_AUTHORED_FACT';
export const UNCITED_BOUNDARY_GROUND = 'UNCITED_BOUNDARY_GROUND';
export const UNKNOWN_ANNOTATION_TARGET = 'UNKNOWN_ANNOTATION_TARGET';

const AUTHORSHIP_KEY = 'authorship';
const ANNOTATIONS_DIGEST_KEY = 'annotations_digest';
const CITED_FIELDS = Object.freeze(['pre', 'post', 'invariants']);
const FACT_LIST_FIELDS = Object.freeze(['pre', 'post', 'invariants', 'consumes', 'produces', 'errors']);
const ACTIVE_DISPOSITION = 'active';
const BOUNDARY_EFFECT_DIRECTIONS = Object.freeze(['provides', 'consumes']);

/** One typed fact. */
function fact(factId, text, source) {
  return { factId, text: String(text ?? ''), source };
}

/** The facts the operation envelope states, independent of any boundary. */
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
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function boundaryFacts(contract, clauseName) {
  const value = contract.clauses?.[clauseName];
  const projected = (factId, entry) => ({
    factId,
    text: String(entry ?? ''),
    origin: 'contract_registry',
    source: { kind: 'contract_registry', boundaryId: contract.boundary_id, field: clauseName },
  });
  if (Array.isArray(value)) {
    return value.map((entry, index) => projected(`boundary:${contract.boundary_id}/${clauseName}/${index}`, entry));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return [projected(`boundary:${contract.boundary_id}/${clauseName}`, value)];
  }
  return [];
}

/** The typed contract of one step. */
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
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function contributionOf(operation, annotation) {
  if (annotation?.registry_contribution === 'required' || annotation?.registry_contribution === 'not_required') {
    const declared = { registry_contribution: annotation.registry_contribution };
    if (typeof annotation.registry_contribution_ground === 'string' && annotation.registry_contribution_ground.trim() !== '') {
      declared.registry_contribution_ground = annotation.registry_contribution_ground;
    }
    return declared;
  }
  if (operation.registry_contribution === 'required' || operation.registry_contribution === 'not_required') {
    const declared = { registry_contribution: operation.registry_contribution };
    if (typeof operation.registry_contribution_ground === 'string' && operation.registry_contribution_ground.trim() !== '') {
      declared.registry_contribution_ground = operation.registry_contribution_ground;
    }
    return declared;
  }
  if (operation.disposition !== ACTIVE_DISPOSITION || operation.mutates_protocol_state !== true) {
    return {
      registry_contribution: 'not_required',
      registry_contribution_ground: `disposition ${operation.disposition}; position ${operation.position}`,
    };
  }
  return { registry_contribution: 'required' };
}

/** Split an annotations document into its legacy step map and its operation map. */
export function splitAnnotations(document = {}) {
  const hasStructuredKeys = document.contracts !== undefined
    || document.operations !== undefined
    || document.boundary_grounds !== undefined;
  return {
    stepAnnotations: document.annotations ?? document.steps ?? (hasStructuredKeys ? {} : document),
    operationAnnotations: document.operations ?? {},
  };
}

/** Make a transition target a declared status only when a ground states it is terminal. */
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
function boundaryEffectsOf(operationId, owners, boundaries) {
  const effects = [];
  for (const boundary of boundaries) {
    if (owners.has(boundary.provider_package)) effects.push({ boundary: boundary.id, direction: 'provides' });
    if (owners.has(boundary.consumer_package)) effects.push({ boundary: boundary.id, direction: 'consumes' });
  }
  return effects;
}

/** One annotated boundary effect, or a named refusal. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function normalizeBoundaryEffect(effect) {
  if (effect === null || typeof effect !== 'object' || Array.isArray(effect)) {
    throw new SmoothSequencesError('a boundary effect annotation is not an object', {
      code: UNKNOWN_ANNOTATION_TARGET,
      repair: 'Write {boundary, direction} for every annotated boundary effect.',
    });
  }
  if (typeof effect.boundary !== 'string' || effect.boundary.trim() === '' || !BOUNDARY_EFFECT_DIRECTIONS.includes(effect.direction)) {
    throw new SmoothSequencesError('a boundary effect annotation is missing a boundary or a valid direction', {
      code: UNKNOWN_ANNOTATION_TARGET,
      repair: 'Write {boundary, direction: provides|consumes} for every annotated boundary effect.',
    });
  }
  return { boundary: effect.boundary, direction: effect.direction };
}

/** One flow ground per sequence, accepting the legacy bare id and the authored object. */
function mergeFlowGrounds(existing = [], annotated = []) {
  const bySequence = new Map();
  for (const entry of [...existing, ...annotated]) {
    const sequence = typeof entry === 'string' ? entry : entry?.sequence;
    if (typeof sequence !== 'string' || sequence.length === 0) continue;
    bySequence.set(sequence, typeof entry === 'string' ? { sequence } : entry);
  }
  return [...bySequence.values()];
}

/** The grounded object rows the v2 artifact declares. */
function groundedObjectsOf(artifact) {
  const grounded = new Map();
  for (const object of artifact.groundedObjects ?? []) {
    if (object && typeof object.object === 'string' && typeof object.ground === 'string') grounded.set(object.object, object);
  }
  return [...grounded.values()];
}

/** The source digest the v2 artifact records, or a canonical fallback. */
function sourceDigestOf(artifact, provided) {
  if (typeof provided === 'string' && provided.length > 0) return provided;
  return createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
}

/** A deterministic JSON string for hashing and comparison. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The digest of an annotations document. */
/**
 * Whether an authored contract says anything the projection did not already say.
 *
 * Equality is not a defect by itself — an explicit annotation that agrees with the
 * registry is still an authored act. The distinction this function draws is used by the
 * migration to record what it copied: a contract with no annotation is a projection, and
 * naming it authored would let meshing compare the registry with itself.
 */
export function classifyContractOrigin(authoredContract, derivedContract) {
  if (canonicalJson(authoredContract) === canonicalJson(derivedContract)) return 'synthesized';
  const facts = CITED_FIELDS.flatMap((field) => (Array.isArray(authoredContract?.[field]) ? authoredContract[field] : []));
  const projected = facts.length > 0 && facts.every((entry) => typeof entry?.origin === 'string' && entry.origin !== 'authored');
  return projected ? 'projected' : 'authored';
}

export function digestOfAnnotations(annotations) {
  return createHash('sha256').update(canonicalJson(annotations)).digest('hex');
}

const normalizeQuote = normalizeFactText;

/** Whether an annotations document carries any authored input. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function hasAnnotations(annotations) {
  return Object.keys(annotations?.contracts ?? {}).length > 0
    || Object.keys(annotations?.operations ?? {}).length > 0
    || (annotations?.boundary_grounds ?? []).length > 0
    || (annotations?.sequence_flow_grounds ?? []).length > 0
    || (annotations?.grounded_objects ?? []).length > 0;
}

/** Refuse an authored assertion that does not cite its step line and quote. */
export function assertCitedFact(entry, step, field, options = {}) {
  const refuse = (why) => {
    throw new SmoothSequencesError(`authored ${field} entry of ${step.id} is uncited: ${why}`, {
      code: UNCITED_AUTHORED_FACT,
      repair: `Record {factId, text, source: {step: "${step.id}", line: ${step.line}, quote: <substring of the step quote>}} or mark a typed origin {origin: "contract_registry", source: {boundaryId, field}}.`,
    });
  };
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) refuse('it is not a fact object');
  if (typeof entry.factId !== 'string' || entry.factId.trim() === '') refuse('it has no factId');
  if (typeof entry.text !== 'string' || entry.text.trim() === '') refuse('it has no text');
  const source = entry.source;
  if (source === null || typeof source !== 'object' || Array.isArray(source)) refuse('it has no source object');
  if (source.step !== step.id) refuse(`source step ${source.step} is not ${step.id}`);
  if (source.line !== step.line) refuse(`source line ${source.line} is not ${step.line}`);
  const quote = normalizeQuote(source.quote);
  if (quote === '' || !normalizeQuote(step.quote).includes(quote)) refuse('the quote is not in the step quote');

  const origin = resolveFactOrigin(entry, { ...options, step });
  if (origin === null) {
    if (!isFactTextSupported(entry.text, step.quote)) {
      refuse('the text is not supported by the step quote and cites no typed row');
    }
    return;
  }
  if (!typedFactSupports(entry, origin, options)) {
    refuse(`the ${origin} row it cites does not carry its text`);
  }
}

/** Refuse a ground that does not cite the boundary reason code. */
export function assertCitedGround(entry, boundary) {
  const refuse = (why) => {
    throw new SmoothSequencesError(`boundary ground for ${entry?.boundary ?? '<unknown>'} is uncited: ${why}`, {
      code: UNCITED_BOUNDARY_GROUND,
      repair: 'Record {boundary, ground, source: {reasonCode: <tree boundary dependency_reason_code>}}.',
    });
  };
  if (boundary === undefined) refuse('the tree manifest declares no such boundary');
  if (typeof entry.ground !== 'string' || entry.ground.trim() === '') refuse('the ground is empty');
  const reasonCode = entry.source?.reasonCode;
  if (typeof reasonCode !== 'string' || reasonCode !== boundary.dependency_reason_code) {
    refuse(`reasonCode ${reasonCode ?? '<missing>'} is not ${boundary.dependency_reason_code}`);
  }
}

/** One fact id from a string or a fact object. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function factIdOf(entry) {
  return typeof entry === 'string' ? entry : entry?.factId;
}

/** A normalized authored contract, with every assertion cited. */
export function normalizeAuthoredContract(contract, step, options = {}) {
  const normalizeFacts = (field) => (contract[field] ?? []).map((entry) => {
    const origin = resolveFactOrigin(entry, { ...options, step });
    const projected = origin === null ? entry : {
      ...entry,
      origin,
      source: {
        ...entry.source,
        ...(origin === 'contract_registry' && entry?.source?.boundaryId === undefined
          ? registryOriginOf(entry.text, options?.contractRegistry) ?? {}
          : {}),
      },
    };
    assertCitedFact(projected, step, field, options);
    return {
      factId: projected.factId,
      text: projected.text,
      source: projected.source,
      ...(projected.origin === undefined ? {} : { origin: projected.origin }),
    };
  });
  const normalizeIds = (field) => (contract[field] ?? []).map(factIdOf).filter((id) => typeof id === 'string' && id.length > 0);
  return {
    pre: normalizeFacts('pre'),
    post: normalizeFacts('post'),
    invariants: normalizeFacts('invariants'),
    consumes: normalizeIds('consumes'),
    produces: normalizeIds('produces'),
    errors: normalizeIds('errors'),
    crosses: [...(contract.crosses ?? [])].filter((boundary) => typeof boundary === 'string' && boundary.length > 0),
  };
}

/** Every step id, or the subset that is authored. */
// [::TICKET::] PX-286, PX-288, PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-286|PX-288|PX-306) --for-spec --no-implementation-order`.
function authoredStepIdsOf(steps) {
  return steps
    .filter((step) => {
      const origin = step.contract?.contract_origin;
      if (origin === 'synthesized' || origin === 'projected') return false;
      if (origin === 'authored') return true;
      // A legacy v3 row predates contract_origin; its authored facts are the only signal.
      return FACT_LIST_FIELDS.some((field) => Array.isArray(step.contract?.authored?.[field]) && step.contract.authored[field].length > 0);
    })
    .map((step) => step.id);
}

/** Partition all ids into the authored subset and the synthesized rest. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function partitionIds(allIds, authoredIds) {
  const authoredSet = new Set(authoredIds);
  return {
    authored: allIds.filter((id) => authoredSet.has(id)),
    synthesized: allIds.filter((id) => !authoredSet.has(id)),
  };
}

/** The authorship map a migration records. */
// [::TICKET::] PX-286, PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-286|PX-288) --for-spec --no-implementation-order`.
function buildAuthorship(input) {
  const {
    steps, typedStepIds, activeOperationIds, typedOperations, originalOperations,
    annotatedStepIds, annotatedContributionIds, annotatedEffectIds, annotatedTransitionIds,
    boundaryGrounds, groundedObjects,
  } = input;
  const authoredStepIds = authoredStepIdsOf(steps);
  const typedAuthored = typedStepIds.filter((id) => authoredStepIds.includes(id));
  const operationById = new Map(typedOperations.map((operation) => [operation.id, operation]));
  const originalById = new Map(originalOperations.map((operation) => [operation.id, operation]));
  const authoredTransitionIds = activeOperationIds.filter((id) => {
    if (annotatedTransitionIds.includes(id)) return true;
    const original = originalById.get(id)?.allowed_status_transitions;
    const migrated = operationById.get(id)?.allowed_status_transitions;
    return original !== undefined && canonicalJson(original) === canonicalJson(migrated);
  });
  const authorship = {
    [SURFACES.TYPED_STEP_CONTRACTS]: partitionIds(typedStepIds, typedAuthored),
    [SURFACES.AUTHORED_CONTRACTS]: partitionIds(typedStepIds, authoredStepIds),
    [SURFACES.STEP_CROSSINGS]: partitionIds(typedStepIds, typedAuthored),
    [SURFACES.OPERATION_TRANSITIONS]: partitionIds(activeOperationIds, authoredTransitionIds),
    [SURFACES.REGISTRY_CONTRIBUTION]: partitionIds(activeOperationIds, annotatedContributionIds),
    [SURFACES.BOUNDARY_EFFECTS]: partitionIds(activeOperationIds, annotatedEffectIds),
    [SURFACES.GROUNDED_OBJECTS]: { authored: groundedObjects.map((entry) => entry.object), synthesized: [] },
    [SURFACES.BOUNDARY_GROUNDS]: { authored: boundaryGrounds.map((entry) => entry.boundary), synthesized: [] },
  };
  return authorship;
}

/** The surfaces an authorship map marks with at least one synthesized row. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function synthesizedSurfacesOf(authorship) {
  return Object.entries(authorship)
    .filter(([, record]) => record.synthesized.length > 0)
    .map(([surface]) => surface);
}

/** Build the v3 artifact from a v2 artifact and an annotations document. */
// [::TICKET::] PX-286, PX-288, PX-306, PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-286|PX-288|PX-306|PX-310) --for-spec --no-implementation-order`.
function migrateV2ToV3(input) {
  const { artifact, treeManifest, allocateManifest, packages, sourceDigest, annotations = {} } = input;
  const boundaries = treeManifest.dependencies?.boundaries ?? [];
  const boundariesById = new Map(boundaries.map((boundary) => [boundary.id, boundary]));
  const contractsByBoundary = new Map((allocateManifest.contract_registry ?? []).map((contract) => [contract.boundary_id, contract]));
  const ownersByOperation = operationOwnersOf(packages);
  const sequenceUnits = sequenceCrossUnitsOf(packages);
  const { stepAnnotations, operationAnnotations } = splitAnnotations(annotations);
  const contractAnnotations = annotations.contracts ?? {};

  const typedSteps = (artifact.steps ?? []).map((step) => {
    const operation = (artifact.operations ?? []).find((entry) => entry.id === step.operation) ?? {};
    const owners = ownersByOperation.get(step.operation) ?? new Set();
    const annotation = stepAnnotations[step.id] ?? stepAnnotations[`${step.sequence}/${step.operation}`];
    const authored = contractAnnotations[step.id] ?? contractAnnotations[`${step.sequence}/${step.operation}`];
    const annotatedProse = typeof authored?.contract_prose === 'string' && authored.contract_prose.trim() !== ''
      ? authored.contract_prose
      : null;
    const contractProse = annotatedProse ?? (typeof step.contract === 'string' && step.contract.trim() !== ''
      ? step.contract
      : (typeof step.contract_prose === 'string' && step.contract_prose.trim() !== '' ? step.contract_prose : null));
    const derived = typedContractFor({ step, operation, owners, sequenceUnits, boundaries, contractsByBoundary });
    const contract = authored === undefined
      ? derived
      : {
        ...normalizeAuthoredContract(authored, step, {
          contractRegistry: allocateManifest.contract_registry ?? [],
          operation,
        }),
      };
    return {
      ...step,
      ...(annotation === undefined ? {} : { annotation }),
      ...(contractProse === null ? {} : { contract_prose: contractProse }),
      contract: authored === undefined
        ? { ...contract, contract_origin: 'synthesized' }
        : { ...contract, authored: { ...contract }, contract_origin: classifyContractOrigin(contract, derived) },
    };
  });

  const producesByStep = new Map(typedSteps.map((step) => [step.id, new Set(step.contract.produces)]));
  for (const step of typedSteps) {
    const earlier = typedSteps.filter((candidate) => candidate.sequence === step.sequence && candidate.line < step.line);
    for (const factEntry of step.contract.pre) {
      if (earlier.some((candidate) => producesByStep.get(candidate.id).has(factEntry.factId))) {
        step.contract.consumes.push(factEntry.factId);
      }
    }
    step.contract.consumes = [...new Set(step.contract.consumes)];
  }

  const typedOperations = (artifact.operations ?? []).map((operation) => {
    const owners = ownersByOperation.get(operation.id) ?? new Set();
    const annotation = operationAnnotations[operation.id] ?? {};
    const contribution = contributionOf(operation, annotation);
    const terminalityGrounds = operation.status_terminality_ground
      ?? annotation.status_terminality_ground
      ?? {};
    const effects = Array.isArray(annotation.boundary_effects)
      ? annotation.boundary_effects.map(normalizeBoundaryEffect)
      : boundaryEffectsOf(operation.id, owners, boundaries);
    const transitions = annotation.allowed_status_transitions !== undefined
      ? annotation.allowed_status_transitions
      : normalizeStatusGraph(operation, terminalityGrounds);
    return {
      ...operation,
      allowed_status_transitions: transitions,
      ...contribution,
      boundary_effects: effects,
    };
  });

  const boundaryGrounds = (annotations.boundary_grounds ?? []).map((entry) => {
    assertCitedGround(entry, boundariesById.get(entry.boundary));
    return { boundary: entry.boundary, ground: entry.ground, source: entry.source };
  });
  const groundedObjects = [
    ...groundedObjectsOf(artifact),
    ...(annotations.grounded_objects ?? []).filter((entry) => typeof entry?.object === 'string' && typeof entry?.ground === 'string'),
  ];
  const sequenceFlowGrounds = mergeFlowGrounds(artifact.sequence_flow_grounds, annotations.sequence_flow_grounds);
  const typedStepIds = typedSteps.filter((step) => step.contract !== null && typeof step.contract === 'object').map((step) => step.id);
  const activeOperationIds = typedOperations.filter((operation) => operation.disposition === ACTIVE_DISPOSITION).map((operation) => operation.id);
  const annotatedStepIds = Object.keys(contractAnnotations).filter((id) => typedStepIds.includes(id));
  const annotatedContributionIds = activeOperationIds.filter((id) => operationAnnotations[id]?.registry_contribution !== undefined);
  const annotatedEffectIds = activeOperationIds.filter((id) => Array.isArray(operationAnnotations[id]?.boundary_effects));
  const annotatedTransitionIds = activeOperationIds.filter((id) => operationAnnotations[id]?.allowed_status_transitions !== undefined);
  const authorship = buildAuthorship({
    steps: typedSteps,
    typedStepIds,
    activeOperationIds,
    typedOperations,
    originalOperations: artifact.operations ?? [],
    annotatedStepIds,
    annotatedContributionIds,
    annotatedEffectIds,
    annotatedTransitionIds,
    boundaryGrounds,
    groundedObjects,
  });

  return {
    ...artifact,
    schema_version: SCHEMA_V3,
    steps: typedSteps,
    operations: typedOperations,
    groundedObjects,
    ...(boundaryGrounds.length === 0 ? {} : { boundary_grounds: boundaryGrounds }),
    ...(sequenceFlowGrounds.length === 0 ? {} : { sequence_flow_grounds: sequenceFlowGrounds }),
    migration: {
      from_schema_version: SCHEMA_V2,
      to_schema_version: SCHEMA_V3,
      source_digest: sourceDigestOf(artifact, sourceDigest),
      annotations_digest: digestOfAnnotations(annotations),
      migrated_by: 'smooth-sequences/migrate-v3',
      authorship,
      synthesized_surfaces: synthesizedSurfacesOf(authorship),
    },
  };
}

/** The authored ids a previous authorship record declares, or the conservative fallback. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function previousAuthoredIds(authorship, previousSynthesized, surface, allIds) {
  const record = authorship?.[surface];
  if (record !== undefined) return Array.isArray(record.authored) ? record.authored : [];
  if (previousSynthesized !== null) return previousSynthesized.has(surface) ? [] : allIds;
  return [];
}

/** Merge a new annotations document into an existing v3 artifact. */
// [::TICKET::] PX-286, PX-288, PX-306, PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-286|PX-288|PX-306|PX-310) --for-spec --no-implementation-order`.
function mergeAnnotationsIntoV3(input) {
  const { artifact, treeManifest, allocateManifest = null, annotations = {} } = input;
  const next = JSON.parse(JSON.stringify(artifact));
  const boundaries = treeManifest?.dependencies?.boundaries ?? [];
  const boundariesById = new Map(boundaries.map((boundary) => [boundary.id, boundary]));
  const stepsById = new Map((next.steps ?? []).map((step) => [step.id, step]));
  const operationsById = new Map((next.operations ?? []).map((operation) => [operation.id, operation]));
  const { stepAnnotations, operationAnnotations } = splitAnnotations(annotations);
  const previousAuthorship = next.migration?.[AUTHORSHIP_KEY];
  const previousSynthesizedList = next.migration?.synthesized_surfaces;
  const previousSynthesized = Array.isArray(previousSynthesizedList) ? new Set(previousSynthesizedList) : null;

  for (const [stepId, contract] of Object.entries(annotations.contracts ?? {})) {
    const step = stepsById.get(stepId);
    if (step === undefined) {
      throw new SmoothSequencesError(`annotations name no step ${stepId}`, {
        code: UNKNOWN_ANNOTATION_TARGET,
        repair: 'Use a step id the artifact declares.',
      });
    }
    const operation = operationsById.get(step.operation) ?? {};
    const derived = step.contract;
    const authored = normalizeAuthoredContract(contract, step, {
      contractRegistry: allocateManifest?.contract_registry ?? [],
      operation,
    });
    step.contract = { ...authored, authored: { ...authored }, contract_origin: classifyContractOrigin(authored, derived) };
    if (typeof contract.contract_prose === 'string' && contract.contract_prose.trim() !== '') {
      step.contract_prose = contract.contract_prose;
    }
  }

  for (const [operationId, annotation] of Object.entries(operationAnnotations)) {
    const operation = operationsById.get(operationId);
    if (operation === undefined) {
      throw new SmoothSequencesError(`annotations name no operation ${operationId}`, {
        code: UNKNOWN_ANNOTATION_TARGET,
        repair: 'Use an operation id the artifact declares.',
      });
    }
    if (annotation.registry_contribution !== undefined) {
      operation.registry_contribution = annotation.registry_contribution;
      if (typeof annotation.registry_contribution_ground === 'string' && annotation.registry_contribution_ground.trim() !== '') {
        operation.registry_contribution_ground = annotation.registry_contribution_ground;
      }
    }
    if (Array.isArray(annotation.boundary_effects)) {
      operation.boundary_effects = annotation.boundary_effects.map(normalizeBoundaryEffect);
    }
    if (annotation.allowed_status_transitions !== undefined) {
      operation.allowed_status_transitions = annotation.allowed_status_transitions;
    }
  }

  for (const [stepId, annotation] of Object.entries(stepAnnotations)) {
    if (stepsById.has(stepId) && annotation !== null && typeof annotation === 'object') {
      stepsById.get(stepId).annotation = annotation;
    }
  }

  const mergedGrounds = new Map((next.boundary_grounds ?? []).map((entry) => [entry.boundary, entry]));
  for (const entry of annotations.boundary_grounds ?? []) {
    assertCitedGround(entry, boundariesById.get(entry.boundary));
    mergedGrounds.set(entry.boundary, { boundary: entry.boundary, ground: entry.ground, source: entry.source });
  }
  if (mergedGrounds.size > 0) next.boundary_grounds = [...mergedGrounds.values()];

  const mergedGroundedObjects = new Map((next.groundedObjects ?? []).map((entry) => [entry.object, entry]));
  for (const entry of annotations.grounded_objects ?? []) {
    if (typeof entry?.object === 'string' && typeof entry?.ground === 'string') mergedGroundedObjects.set(entry.object, entry);
  }
  if (mergedGroundedObjects.size > 0) next.groundedObjects = [...mergedGroundedObjects.values()];

  const mergedFlowGrounds = mergeFlowGrounds(next.sequence_flow_grounds, annotations.sequence_flow_grounds);
  if (mergedFlowGrounds.length > 0) next.sequence_flow_grounds = mergedFlowGrounds;

  const typedStepIds = (next.steps ?? []).filter((step) => step.contract !== null && typeof step.contract === 'object').map((step) => step.id);
  const authoredStepIds = authoredStepIdsOf(next.steps ?? []);
  const typedAuthored = typedStepIds.filter((id) => authoredStepIds.includes(id));
  const activeOperationIds = (next.operations ?? []).filter((operation) => operation.disposition === ACTIVE_DISPOSITION).map((operation) => operation.id);
  const annotatedContributionIds = activeOperationIds.filter((id) => operationAnnotations[id]?.registry_contribution !== undefined);
  const annotatedEffectIds = activeOperationIds.filter((id) => Array.isArray(operationAnnotations[id]?.boundary_effects));
  const annotatedTransitionIds = activeOperationIds.filter((id) => operationAnnotations[id]?.allowed_status_transitions !== undefined);
  const authoredContributionIds = activeOperationIds.filter((id) => annotatedContributionIds.includes(id)
    || previousAuthoredIds(previousAuthorship, previousSynthesized, SURFACES.REGISTRY_CONTRIBUTION, activeOperationIds).includes(id));
  const authoredEffectIds = activeOperationIds.filter((id) => annotatedEffectIds.includes(id)
    || previousAuthoredIds(previousAuthorship, previousSynthesized, SURFACES.BOUNDARY_EFFECTS, activeOperationIds).includes(id));
  const authoredTransitionIds = activeOperationIds.filter((id) => annotatedTransitionIds.includes(id)
    || previousAuthoredIds(previousAuthorship, previousSynthesized, SURFACES.OPERATION_TRANSITIONS, activeOperationIds).includes(id));
  const authorship = {
    [SURFACES.TYPED_STEP_CONTRACTS]: partitionIds(typedStepIds, typedAuthored),
    [SURFACES.AUTHORED_CONTRACTS]: partitionIds(typedStepIds, authoredStepIds),
    [SURFACES.STEP_CROSSINGS]: partitionIds(typedStepIds, typedAuthored),
    [SURFACES.OPERATION_TRANSITIONS]: partitionIds(activeOperationIds, authoredTransitionIds),
    [SURFACES.REGISTRY_CONTRIBUTION]: partitionIds(activeOperationIds, authoredContributionIds),
    [SURFACES.BOUNDARY_EFFECTS]: partitionIds(activeOperationIds, authoredEffectIds),
    [SURFACES.GROUNDED_OBJECTS]: { authored: (next.groundedObjects ?? []).map((entry) => entry.object), synthesized: [] },
    [SURFACES.BOUNDARY_GROUNDS]: { authored: (next.boundary_grounds ?? []).map((entry) => entry.boundary), synthesized: [] },
  };
  next.migration = {
    ...(next.migration ?? {}),
    annotations_digest: digestOfAnnotations(annotations),
    authorship,
    synthesized_surfaces: synthesizedSurfacesOf(authorship),
  };
  return next;
}

/**
 * Migrate a v2 artifact to v3, or merge authored annotations into an existing v3
 * artifact.
 *
 * @param {{ artifact: object, treeManifest: object, allocateManifest: object,
 *   packages: Array<object>, sourceDigest?: string, annotations?: object }} input
 * @returns {object} the v3 artifact
 */
export function migrateArtifactToV3(input) {
  const { artifact, annotations = {} } = input;
  if (artifact.schema_version === SCHEMA_V3) {
    return hasAnnotations(annotations) ? mergeAnnotationsIntoV3(input) : artifact;
  }
  return migrateV2ToV3(input);
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
