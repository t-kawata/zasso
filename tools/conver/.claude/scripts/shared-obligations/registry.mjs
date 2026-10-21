// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
/**
 * The single obligation registry shared by educe-sequences and smooth-sequences.
 *
 * An obligation is a claim the pipeline must settle. Mechanical obligations are settled by
 * a predicate; semantic obligations are settled only by a held judgment. The registry is a
 * pure function of the inputs, so two callers cannot disagree about which claims exist.
 */

import { performedOperations } from './span.mjs';

export const OBLIGATION_CLASS = Object.freeze({
  MECHANICAL: 'mechanical',
  SEMANTIC: 'semantic',
});

export const OBLIGATION_STATE = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
  STUCK: 'stuck',
  NOT_APPLICABLE: 'not_applicable',
});

export const INQUEST_LENSES = Object.freeze(['omission', 'contradiction', 'deficiency', 'risk']);
export const TIER_ONE_KINDS = Object.freeze(['operation', 'boundary', 'sequence']);
export const ACTIVE_DISPOSITION = 'active';
export const REALIZED_OUTCOMES = new Set(['direct', 'viaNeighbour', 'singleStep']);

/** The error a duplicate obligation id raises. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
export class RegistryError extends Error {
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
  constructor(message, { code, repair } = {}) {
    super(message);
    this.name = 'RegistryError';
    this.code = code ?? 'REGISTRY_ERROR';
    this.repair = repair ?? '';
  }
}

/** A non-empty string, or the fallback. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** The ids of artifact rows. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function idsOf(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => row?.id).filter((id) => typeof id === 'string');
}

/** The (subject, lens) pairs the declaration exempts. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function exemptPairs(declaration) {
  const pairs = new Set();
  for (const entry of Array.isArray(declaration?.exemptions) ? declaration.exemptions : []) {
    if (typeof entry?.subject === 'string' && typeof entry?.lens === 'string') {
      pairs.add(`${entry.subject}\u0000${entry.lens}`);
    }
  }
  return pairs;
}

/** One frozen obligation. */
export function obligation(spec) {
  const { id, className, kind, subject, claim, predicate, producer, required = true, evidence = [] } = spec;
  return Object.freeze({
    id,
    class: className,
    kind,
    subject,
    claim,
    predicate,
    producer,
    required,
    state: OBLIGATION_STATE.OPEN,
    evidence: Object.freeze([...evidence]),
  });
}

/** A mechanical check obligation. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function checkObligation(subCheck) {
  return obligation({
    id: `CHECK:${subCheck.id}`,
    className: OBLIGATION_CLASS.MECHANICAL,
    kind: 'check',
    subject: subCheck.id,
    claim: `check ${subCheck.id} executes over an authored surface and evaluates at least one claim`,
    predicate: 'mechanical:check',
    producer: 'smooth-sequences/check-registry',
  });
}

/** A census bijection obligation. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function censusObligation(kind, missing, extra) {
  return obligation({
    id: `CENSUS:BIJECTION:${kind}`,
    className: OBLIGATION_CLASS.MECHANICAL,
    kind: 'census',
    subject: kind,
    claim: `every ${kind} member appears on both sides of the census`,
    predicate: 'mechanical:census-bijection',
    producer: 'shared-obligations/registry',
    evidence: [{ kind: 'census', missing, extra }],
  });
}

/** A reading obligation closed mechanically by a step, or semantically by a reading. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function uncoveredObligation(operationId, performed) {
  return obligation({
    id: `READ:UNCOVERED:${operationId}`,
    className: performed ? OBLIGATION_CLASS.MECHANICAL : OBLIGATION_CLASS.SEMANTIC,
    kind: 'reading',
    subject: operationId,
    claim: performed
      ? `operation ${operationId} is performed by a span step`
      : `operation ${operationId} is either performed by a named actor or covered by a grounded escape`,
    predicate: performed ? 'mechanical:span-step' : 'judgment:uncovered',
    producer: 'educe-sequences/phase-8',
  });
}

/** One inquest obligation unless the declaration exempts the pair. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function inquestObligation(subject, lens) {
  return obligation({
    id: `READ:INQUEST:${subject}:${lens}`,
    className: OBLIGATION_CLASS.SEMANTIC,
    kind: 'reading',
    subject: `${subject}:${lens}`,
    claim: `the ${lens} lens is answered for ${subject}`,
    predicate: 'judgment:inquest',
    producer: 'educe-sequences/phase-13',
  });
}

/** A boundary semantic obligation. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function boundaryObligation(boundaryId, kind, subject = boundaryId) {
  return obligation({
    id: `JUDGE:${kind}:${subject}`,
    className: OBLIGATION_CLASS.SEMANTIC,
    kind: 'judgment',
    subject,
    claim: `the ${kind.toLowerCase()} judgment holds for ${subject}`,
    predicate: `judgment:${kind.toLowerCase()}`,
    producer: 'smooth-sequences/judgment-worklist',
  });
}

/** A distribution fidelity obligation. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function fidelityObligation(packageId, unitId) {
  return obligation({
    id: `DIST:FIDELITY:${packageId}/${unitId}`,
    className: OBLIGATION_CLASS.SEMANTIC,
    kind: 'distribution',
    subject: `${packageId}/${unitId}`,
    claim: `the ${packageId} RFC section named by ${unitId} describes the unit`,
    predicate: 'judgment:distribution-fidelity',
    producer: 'smooth-sequences/judgment-worklist',
  });
}

/** A risk disposition obligation. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function riskObligation(subject, riskClass) {
  return obligation({
    id: `RISK:${subject}:${riskClass}`,
    className: OBLIGATION_CLASS.SEMANTIC,
    kind: 'risk',
    subject: `${subject}:${riskClass}`,
    claim: `${riskClass} is mitigated or accepted for ${subject}`,
    predicate: 'judgment:risk',
    producer: 'smooth-sequences/judgment-worklist',
  });
}

/** A falsification obligation for a Tier 1 subject. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function falsifyObligation(subject) {
  return obligation({
    id: `FALSIFY:${subject}`,
    className: OBLIGATION_CLASS.SEMANTIC,
    kind: 'judgment',
    subject,
    claim: `a No answer for ${subject} survives an attack`,
    predicate: 'judgment:falsification',
    producer: 'smooth-sequences/judgment-worklist',
  });
}

/** The risk classes an active operation with state changes makes applicable. */
const RISK_CLASSES_FOR_STATE = Object.freeze(['idempotency', 'replay', 'partial-failure', 'concurrency']);
const RISK_CLASSES_FOR_EXTERNAL = Object.freeze(['liveness', 'finality', 'external-dependency']);

/**
 * Derive every obligation the pipeline must settle.
 *
 * @param {object} inputs — census, declaration, artifact, tree/allocate manifests, packages, readings, mechanical
 * @returns {Array<object>} sorted obligations with unique ids
 */
export function deriveObligations(inputs = {}) {
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
  const byId = new Map();
  const add = (entry) => {
    if (byId.has(entry.id)) {
      throw new RegistryError(`obligation id ${entry.id} is duplicated`, {
        code: 'REGISTRY_DUPLICATE_ID',
        repair: 'Make the subject part of the obligation id so two claims cannot share an id.',
      });
    }
    byId.set(entry.id, entry);
  };

  const census = inputs.census ?? {};
  const declaration = inputs.declaration ?? {};
  const artifact = inputs.artifact ?? {};
  const treeManifest = inputs.treeManifest ?? {};
  const allocateManifest = inputs.allocateManifest ?? {};
  const packages = Array.isArray(inputs.packages) ? inputs.packages : [];
  const readings = inputs.readings ?? {};

  const censusOperations = Array.isArray(census.operations) ? census.operations : idsOf(artifact.operations);
  const censusEntries = Array.isArray(census.entries) ? census.entries : idsOf(artifact.sequences);
  const censusSections = Array.isArray(census.sections) ? census.sections : idsOf(artifact.sections);

  const artifactOperations = idsOf(artifact.operations);
  const artifactSequences = idsOf(artifact.sequences);
  const boundaries = treeManifest.dependencies?.boundaries ?? [];
  const contracts = allocateManifest.contract_registry ?? [];
  const contractBoundaryIds = new Set(contracts.map((contract) => contract.boundary_id));

  add(censusObligation(
    'operations',
    censusOperations.filter((id) => !artifactOperations.includes(id)),
    artifactOperations.filter((id) => !censusOperations.includes(id)),
  ));
  add(censusObligation(
    'entries',
    censusEntries.filter((id) => !artifactSequences.includes(id)),
    artifactSequences.filter((id) => !censusEntries.includes(id)),
  ));
  add(censusObligation(
    'sections',
    censusSections.filter((id) => !idsOf(artifact.sections).includes(id)),
    idsOf(artifact.sections).filter((id) => !censusSections.includes(id)),
  ));
  add(censusObligation(
    'boundaries',
    boundaries.map((boundary) => boundary.id).filter((id) => !contractBoundaryIds.has(id)),
    [...contractBoundaryIds].filter((id) => !boundaries.some((boundary) => boundary.id === id)),
  ));
  add(censusObligation(
    'packages',
    (treeManifest.workspace?.packages ?? []).map((pkg) => pkg.id).filter((id) => !packages.some((pkg) => pkg.id === id)),
    packages.map((pkg) => pkg.id).filter((id) => !(treeManifest.workspace?.packages ?? []).some((record) => record.id === id)),
  ));

  for (const subCheck of Array.isArray(inputs.mechanical?.subChecks) ? inputs.mechanical.subChecks : []) {
    add(checkObligation(subCheck));
  }

  const performed = performedOperations(readings?.span ?? []);
  for (const operationId of censusOperations) {
    add(uncoveredObligation(operationId, performed.has(operationId)));
  }

  const exempted = exemptPairs(declaration);
  const inquestSubjects = [...new Set([
    ...censusSections,
    ...censusEntries,
    ...artifact.operations
      .filter((operation) => operation?.position === 'excluded' || operation?.position === 'suppliedRule')
      .map((operation) => operation.id),
  ])];
  for (const subject of inquestSubjects) {
    for (const lens of INQUEST_LENSES) {
      if (exempted.has(`${subject}\u0000${lens}`)) continue;
      add(inquestObligation(subject, lens));
    }
  }

  const escaped = (artifact.operations ?? [])
    .filter((operation) => operation?.position === 'excluded' || operation?.position === 'suppliedRule')
    .map((operation) => operation.id);
  const rulings = (artifact.sequences ?? [])
    .filter((sequence) => sequence?.outcome === 'notASequence')
    .map((sequence) => sequence.id);
  for (const subject of [...new Set([...rulings, ...escaped])]) {
    add(obligation({
      id: `READ:ADVERSARIAL:${subject}`,
      className: OBLIGATION_CLASS.SEMANTIC,
      kind: 'reading',
      subject,
      claim: `the ruling on ${subject} survives an attack`,
      predicate: 'judgment:adversarial',
      producer: 'educe-sequences/phase-10',
    }));
  }

  const steps = Array.isArray(artifact.steps) ? artifact.steps : [];
  for (const step of steps) {
    for (const boundaryId of Array.isArray(step?.contract?.crosses) ? step.contract.crosses : []) {
      if (contractBoundaryIds.has(boundaryId)) {
        add(boundaryObligation(boundaryId, 'ENTAILMENT', `${boundaryId}/${step.id}`));
      }
    }
  }
  for (const boundary of boundaries) {
    add(boundaryObligation(boundary.id, 'TRANSLATION'));
    add(boundaryObligation(boundary.id, 'INVARIANT'));
    add(boundaryObligation(boundary.id, 'ERRORS'));
    add(boundaryObligation(boundary.id, 'TESTS'));
  }

  for (const pkg of packages) {
    for (const unit of pkg?.view?.ownedOperationUnits ?? []) add(fidelityObligation(pkg.id, unit.unitId ?? `op-${unit.operationId}`));
    for (const unit of pkg?.view?.ownedSequenceUnits ?? []) add(fidelityObligation(pkg.id, unit.unitId ?? `seq-${unit.sequenceId}`));
    for (const unit of pkg?.view?.crossBoundarySequenceUnits ?? []) add(fidelityObligation(pkg.id, unit.unitId ?? `xdir-${unit.sequenceId}`));
  }

  const tierOne = [
    ...(artifact.operations ?? []).filter((operation) => operation?.disposition === ACTIVE_DISPOSITION).map((operation) => operation.id),
    ...boundaries.map((boundary) => boundary.id),
    ...(artifact.sequences ?? []).filter((sequence) => REALIZED_OUTCOMES.has(sequence?.outcome)).map((sequence) => sequence.id),
  ];
  for (const subject of new Set(tierOne)) add(falsifyObligation(subject));

  for (const operation of artifact.operations ?? []) {
    if (operation?.disposition !== ACTIVE_DISPOSITION) continue;
    if (operation.mutates_protocol_state === true) {
      for (const riskClass of RISK_CLASSES_FOR_STATE) add(riskObligation(operation.id, riskClass));
    }
    if (typeof operation.external_dependency_class === 'string' && operation.external_dependency_class !== 'none') {
      for (const riskClass of RISK_CLASSES_FOR_EXTERNAL) add(riskObligation(operation.id, riskClass));
    }
  }

  for (const entry of propertyObligations(artifact)) add(entry);

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/** Whether a pinned column carries no value at all. */
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function isEmptyValue(value) {
  return value === undefined
    || value === null
    || value === ''
    || (Array.isArray(value) && value.length === 0);
}

/** One property obligation for an empty column with a column-specific grounding. */
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function groundedPropertyObligation(operationId, column, ground) {
  const base = obligation({
    id: `PROP:${operationId}:${column}`,
    className: OBLIGATION_CLASS.SEMANTIC,
    kind: 'property',
    subject: `${operationId}:${column}`,
    claim: `${column} is present or grounded absent for ${operationId}`,
    predicate: 'judgment:property',
    producer: 'shared-obligations/registry',
    evidence: [{
      kind: 'grounding',
      classification: ground.classification,
      line: ground.line ?? null,
      quote: ground.quote ?? null,
    }],
  });
  return { ...base, state: OBLIGATION_STATE.NOT_APPLICABLE, reason: 'GROUNDED_ABSENT' };
}

/** One property obligation for an empty column with no column-specific grounding. */
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function openPropertyObligation(operationId, column) {
  return obligation({
    id: `PROP:${operationId}:${column}`,
    className: OBLIGATION_CLASS.SEMANTIC,
    kind: 'property',
    subject: `${operationId}:${column}`,
    claim: `${column} is present or grounded absent for ${operationId}`,
    predicate: 'judgment:property',
    producer: 'shared-obligations/registry',
  });
}

/**
 * The property obligations the pinned columns make applicable.
 *
 * An operation-wide grounding is not a column grounding: the artifact must state the
 * classification and citation for this column, or the emptiness is an open question.
 */
export function propertyObligations(artifact = {}) {
  const columns = (artifact.pins?.columns ?? []).map((column) => column.name).filter((name) => typeof name === 'string');
  const obligations = [];
  for (const operation of artifact.operations ?? []) {
    if (typeof operation?.id !== 'string' || operation.disposition !== ACTIVE_DISPOSITION) continue;
    for (const column of new Set(columns)) {
      if (!isEmptyValue(operation[column])) continue;
      const ground = operation.grounding?.properties?.[column];
      const grounded = ground !== undefined
        && text(ground.classification)
        && (Number.isInteger(ground.line) || text(ground.citation))
        && text(ground.quote);
      obligations.push(grounded
        ? groundedPropertyObligation(operation.id, column, ground)
        : openPropertyObligation(operation.id, column));
    }
  }
  return obligations;
}

/** The count of obligations by class and state. */
export function summarizeObligations(obligations = []) {
  const summary = {
    total: obligations.length,
    mechanical: 0,
    semantic: 0,
    open: 0,
    closed: 0,
    stuck: 0,
    notApplicable: 0,
  };
  for (const entry of obligations) {
    if (entry.class === OBLIGATION_CLASS.MECHANICAL) summary.mechanical += 1;
    if (entry.class === OBLIGATION_CLASS.SEMANTIC) summary.semantic += 1;
    if (entry.state === OBLIGATION_STATE.OPEN) summary.open += 1;
    if (entry.state === OBLIGATION_STATE.CLOSED) summary.closed += 1;
    if (entry.state === OBLIGATION_STATE.STUCK) summary.stuck += 1;
    if (entry.state === OBLIGATION_STATE.NOT_APPLICABLE) summary.notApplicable += 1;
  }
  return summary;
}
