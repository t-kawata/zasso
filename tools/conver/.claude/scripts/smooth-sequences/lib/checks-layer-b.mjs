/**
 * Layer B: the contract-meshing checks over typed v3 step contracts.
 *
 * The comparison is an exact set comparison on fact ids. A fact's prose is never
 * compared: two sentences that mean the same thing cannot be shown to mean the same
 * thing by a script, and pretending otherwise is the failure this layer exists to
 * avoid. A v2 artifact carries no typed facts, so Layer B is withheld rather than
 * failed.
 *
 * Every finding names the authored surface and the producer that re-derives the verdict.
 */
import { finding } from './index.mjs';
import { buildFamilySubChecks } from './check-status.mjs';
import { routeForOperation, routeForSpecRow, routeForStep } from './repair-route.mjs';

const V3 = 3;
const BOUNDARY_FACT_PREFIX = 'boundary:';
const AUTHORED_CONTRACT_FIELD = 'authored';

/** The id of a typed or authored fact. */
// [::TICKET::] PX-284, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-284|PX-285) --for-spec --no-implementation-order`.
function readFactId(fact) {
  return typeof fact === 'string' ? fact : fact?.factId;
}

/** Whether an authored contract carries at least one typed fact. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function hasAuthoredFacts(authored) {
  if (authored === null || typeof authored !== 'object') return false;
  return ['pre', 'post', 'consumes', 'produces', 'errors']
    .some((field) => Array.isArray(authored[field]) && authored[field].length > 0);
}

/** The authored contract of a step, or null when the step carries only a projection. */
// [::TICKET::] PX-284, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-284|PX-285) --for-spec --no-implementation-order`.
function readAuthoredContract(step) {
  const authored = step.contract?.[AUTHORED_CONTRACT_FIELD];
  return hasAuthoredFacts(authored) ? authored : null;
}

/** Whether a step preserves the authored prose contract. */
// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
function hasContractProse(step) {
  return typeof step.contract_prose === 'string' && step.contract_prose.trim() !== '';
}

/** The boundaries a non-empty ground covers. */
// [::TICKET::] PX-284, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-284|PX-285) --for-spec --no-implementation-order`.
function readBoundaryGrounds(index) {
  return new Set((index.artifact.boundary_grounds ?? [])
    .filter((entry) => typeof entry?.ground === 'string' && entry.ground.trim() !== '')
    .map((entry) => entry.boundary));
}

/** One finding with its route already resolved. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function addFinding(findings, checkId, subject, entry) {
  findings.push(finding(checkId, entry.className, subject, {
    ...entry.route,
    why: entry.why,
    fix: entry.fix,
  }));
}

/** Whether a typed fact is a boundary clause fact rather than an operation-envelope fact. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function isBoundaryFact(factId) {
  return typeof factId === 'string' && factId.startsWith(BOUNDARY_FACT_PREFIX);
}

/** Whether a fact belongs to the boundary currently being compared. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function belongsToBoundary(factId, boundaryId) {
  return isBoundaryFact(factId) && factId.startsWith(`${BOUNDARY_FACT_PREFIX}${boundaryId}/`);
}

/**
 * The legacy withheld view of the meshing family.
 *
 * The detector itself now reports blocked sub-checks; this wrapper keeps older callers
 * on the same observable value without restoring a second source of truth.
 */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function layerBWithheld(index) {
  if (index.schemaVersion !== V3) return [{ layer: 'B', reason: 'v3 step contract absent' }];
  const blocked = buildFamilySubChecks('meshing', index).filter((entry) => entry.status === 'blocked');
  return blocked.length === 0 ? [] : [{ layer: 'B', reason: blocked[0].reason }];
}

/** The packages a step's operation belongs to. */
// [::TICKET::] PX-273, PX-274, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274|PX-285) --for-spec --no-implementation-order`.
function readOwners(index, operationId) {
  return index.operationOwners.get(operationId) ?? new Set();
}

/** The steps that cross one boundary. */
// [::TICKET::] PX-273, PX-274, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274|PX-285) --for-spec --no-implementation-order`.
function groupStepsByBoundary(index) {
  const byBoundary = new Map();
  for (const step of index.artifact.steps ?? []) {
    for (const boundary of step.contract?.crosses ?? []) {
      if (!byBoundary.has(boundary)) byBoundary.set(boundary, []);
      byBoundary.get(boundary).push(step);
    }
  }
  return byBoundary;
}

/**
 * Check every crossing of every typed step contract.
 *
 * @param {object} index
 * @returns {Array<object>} findings
 */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
export function collectCrossingContracts(index) {
  if (index.schemaVersion !== V3) {
    return {
      findings: [],
      subChecks: buildFamilySubChecks('meshing', index),
    };
  }
  const findings = [];
  checkCrossingDeclarations(index, findings);
  collectProjectionOnly(index, findings);
  collectBoundaryCoverage(index, findings);
  for (const [boundaryId, steps] of groupStepsByBoundary(index)) {
    const contract = index.contractsByBoundary.get(boundaryId);
    if (contract === undefined) continue;
    checkBoundaryMeshing(index, boundaryId, steps, contract, findings);
  }
  return { findings, subChecks: buildFamilySubChecks('meshing', index) };
}

/** One finding for a step that carries no authored contract at all. */
// [::TICKET::] PX-284, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-284|PX-285) --for-spec --no-implementation-order`.
function collectProjectionOnly(index, findings) {
  for (const step of index.artifact.steps ?? []) {
    if (readAuthoredContract(step) !== null || hasContractProse(step)) continue;
    addFinding(findings, 'S5.projection-only', step.id, {
      className: 'deficiency',
      route: routeForStep('S5.projection-only', index, step),
      why: `step ${step.id} carries only a registry projection; no authored contract facts or contract_prose`,
      fix: 'record contract.authored or contract_prose for the step',
    });
  }
}

/** One finding for a declared boundary that no step crosses and no ground covers. */
// [::TICKET::] PX-284, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-284|PX-285) --for-spec --no-implementation-order`.
function collectBoundaryCoverage(index, findings) {
  const crossed = new Set(groupStepsByBoundary(index).keys());
  const grounded = readBoundaryGrounds(index);
  for (const boundary of index.treeManifest.dependencies?.boundaries ?? []) {
    if (crossed.has(boundary.id) || grounded.has(boundary.id)) continue;
    const effectOperations = (index.artifact.operations ?? [])
      .filter((operation) => operation.disposition === 'active'
        && (operation.boundary_effects ?? []).some((effect) => effect.boundary === boundary.id));
    const first = effectOperations[0];
    const declaredBy = effectOperations.length === 0
      ? 'no active operation declares an effect'
      : `declared by ${effectOperations.slice(0, 3).map((operation) => operation.id).join(', ')}${effectOperations.length > 3 ? ` (+${effectOperations.length - 3} more)` : ''}`;
    addFinding(findings, 'S5.boundary-uncovered', first === undefined ? boundary.id : `${boundary.id}/${first.id}`, {
      className: 'omission',
      route: first === undefined
        ? routeForSpecRow('S5.boundary-uncovered', index, boundary.id)
        : routeForOperation('S5.boundary-uncovered', index, first),
      why: `boundary ${boundary.id} is declared and no step crosses it; ${declaredBy}`,
      fix: `add a step contract.crosses for ${boundary.id} or record a boundary_grounds entry`,
    });
  }
}

/** The findings-only view of the meshing family, kept for existing callers. */
export function checkCrossingContracts(index) {
  return collectCrossingContracts(index).findings;
}

/** Every crossed boundary the step names must exist in the tree manifest. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkCrossingDeclarations(index, findings) {
  for (const step of index.artifact.steps ?? []) {
    for (const boundary of step.contract?.crosses ?? []) {
      if (index.boundariesById.has(boundary)) continue;
      addFinding(findings, 'S5.crossing-boundary-unknown', step.id, {
        className: 'deficiency',
        route: routeForStep('S5.crossing-boundary-unknown', index, step),
        why: `step ${step.id} crosses ${boundary}, which the tree manifest does not declare`,
        fix: `declare ${boundary} in the boundary set or remove it from the step contract`,
      });
    }
  }
}

/** One boundary: both sides exist, and every consumer contract is met by the provider. */
// [::TICKET::] PX-277, PX-284, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-277|PX-284|PX-285) --for-spec --no-implementation-order`.
function checkBoundaryMeshing(index, boundaryId, steps, contract, findings) {
  for (const step of steps) {
    const owners = readOwners(index, step.operation);
    if (owners.has(contract.provider_package) || owners.has(contract.consumer_package)) continue;
    addFinding(findings, 'S5.crossing-direction-mismatch', step.id, {
      className: 'contradiction',
      route: routeForStep('S5.crossing-direction-mismatch', index, step),
      why: `step ${step.id} crosses ${boundaryId} and belongs to neither side of it`,
      fix: `move ${step.id} to a package that holds a side of ${boundaryId}, or remove the crossing`,
    });
  }
  const providerSteps = steps.filter((step) => readOwners(index, step.operation).has(contract.provider_package));
  const consumerSteps = steps.filter((step) => readOwners(index, step.operation).has(contract.consumer_package));
  if (providerSteps.length === 0 || consumerSteps.length === 0) {
    addFinding(findings, 'S5.crossing-side-missing', boundaryId, {
      className: 'omission',
      route: routeForSpecRow('S5.crossing-side-missing', index, boundaryId),
      why: `boundary ${boundaryId} has no ${providerSteps.length === 0 ? 'provider' : 'consumer'} step in the crossed sequence`,
      fix: `add the missing side of ${boundaryId} to the sequence or remove the crossing`,
    });
    return;
  }

  // A projection is not an authored contract. When either side carries only the
  // registry projection, the meshing comparison would compare the registry with
  // itself; the projection-only check names the step and this check makes no claim.
  const authoredProviderSteps = providerSteps.filter((step) => readAuthoredContract(step) !== null);
  const authoredConsumerSteps = consumerSteps.filter((step) => readAuthoredContract(step) !== null);
  if (authoredProviderSteps.length === 0 || authoredConsumerSteps.length === 0) return;

  const providerFacts = new Set();
  const providerErrors = new Set();
  for (const step of authoredProviderSteps) {
    const authored = readAuthoredContract(step);
    for (const fact of authored.post ?? []) {
      const id = readFactId(fact);
      if (belongsToBoundary(id, boundaryId)) providerFacts.add(id);
    }
    for (const produced of authored.produces ?? []) {
      const id = readFactId(produced);
      if (belongsToBoundary(id, boundaryId)) providerFacts.add(id);
    }
    for (const error of authored.errors ?? []) {
      const id = readFactId(error);
      if (belongsToBoundary(id, boundaryId)) providerErrors.add(id);
    }
  }

  for (const consumer of authoredConsumerSteps) {
    checkConsumerContracts(index, boundaryId, consumer, { providerFacts, providerErrors }, findings);
  }
}

/** One consumer: its authored preconditions, consumed facts and expected errors against the provider. */
// [::TICKET::] PX-277, PX-284, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-277|PX-284|PX-285) --for-spec --no-implementation-order`.
function checkConsumerContracts(index, boundaryId, consumer, provider, findings) {
  const authored = readAuthoredContract(consumer);
  const { providerFacts, providerErrors } = provider;
  const missing = (authored.pre ?? [])
    .map(readFactId)
    .filter((fact) => belongsToBoundary(fact, boundaryId) && !providerFacts.has(fact));
  for (const fact of missing) {
    addFinding(findings, 'S5.precondition-not-implied', `${boundaryId}/${consumer.id}`, {
      className: 'contradiction',
      route: routeForStep('S5.precondition-not-implied', index, consumer),
      why: `consumer precondition ${fact} is not in the provider postconditions`,
      fix: `add ${fact} to the provider postconditions or remove it from the consumer preconditions`,
    });
  }
  for (const consumed of (authored.consumes ?? []).map(readFactId)) {
    if (!belongsToBoundary(consumed, boundaryId)) continue;
    if (providerFacts.has(consumed)) continue;
    const producedEarlier = (index.stepsBySequence.get(consumer.sequence) ?? [])
      .filter((step) => step.line < consumer.line)
      .some((step) => (readAuthoredContract(step)?.produces ?? []).map(readFactId).includes(consumed));
    if (producedEarlier) continue;
    addFinding(findings, 'S5.consumes-not-produced', `${boundaryId}/${consumer.id}`, {
      className: 'omission',
      route: routeForStep('S5.consumes-not-produced', index, consumer),
      why: `step ${consumer.id} consumes ${consumed}, which no earlier step produces`,
      fix: `produce ${consumed} in an earlier step or declare it as an external input`,
    });
  }
  for (const error of (authored.errors ?? []).map(readFactId)) {
    if (!belongsToBoundary(error, boundaryId)) continue;
    if (providerErrors.has(error)) continue;
    addFinding(findings, 'S5.error-set-mismatch', `${boundaryId}/${consumer.id}`, {
      className: 'contradiction',
      route: routeForStep('S5.error-set-mismatch', index, consumer),
      why: `consumer expects ${error}, which the provider does not declare`,
      fix: `add ${error} to the provider errors or remove it from the consumer expectation`,
    });
  }
}
