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
import { routeForSpecRow, routeForStep } from './repair-route.mjs';

const V3 = 3;
const BOUNDARY_FACT_PREFIX = 'boundary:';

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

/** The Layer B withholding record, or an empty list when the artifact is v3. */
export function layerBWithheld(index) {
  return index.schemaVersion === V3 ? [] : [{ layer: 'B', reason: 'v3 step contract absent' }];
}

/** The packages a step's operation belongs to. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function ownersOf(index, operationId) {
  return index.operationOwners.get(operationId) ?? new Set();
}

/** The fact ids a list of typed facts carries. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function factIdsOf(facts) {
  return new Set((facts ?? []).map((fact) => fact.factId));
}

/** The steps that cross one boundary. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function stepsByBoundary(index) {
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
export function checkCrossingContracts(index) {
  if (index.schemaVersion !== V3) return [];
  const findings = [];
  checkCrossingDeclarations(index, findings);
  for (const [boundaryId, steps] of stepsByBoundary(index)) {
    const contract = index.contractsByBoundary.get(boundaryId);
    if (contract === undefined) continue;
    checkBoundaryMeshing(index, boundaryId, steps, contract, findings);
  }
  return findings;
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
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkBoundaryMeshing(index, boundaryId, steps, contract, findings) {
  for (const step of steps) {
    const owners = ownersOf(index, step.operation);
    if (owners.has(contract.provider_package) || owners.has(contract.consumer_package)) continue;
    addFinding(findings, 'S5.crossing-direction-mismatch', step.id, {
      className: 'contradiction',
      route: routeForStep('S5.crossing-direction-mismatch', index, step),
      why: `step ${step.id} crosses ${boundaryId} and belongs to neither side of it`,
      fix: `move ${step.id} to a package that holds a side of ${boundaryId}, or remove the crossing`,
    });
  }
  const providerSteps = steps.filter((step) => ownersOf(index, step.operation).has(contract.provider_package));
  const consumerSteps = steps.filter((step) => ownersOf(index, step.operation).has(contract.consumer_package));
  if (providerSteps.length === 0 || consumerSteps.length === 0) {
    addFinding(findings, 'S5.crossing-side-missing', boundaryId, {
      className: 'omission',
      route: routeForSpecRow('S5.crossing-side-missing', index, boundaryId),
      why: `boundary ${boundaryId} has no ${providerSteps.length === 0 ? 'provider' : 'consumer'} step in the crossed sequence`,
      fix: `add the missing side of ${boundaryId} to the sequence or remove the crossing`,
    });
    return;
  }

  // Only boundary clause facts are compared across the edge. The envelope facts
  // (`authority:*`, `session_binding`, `proof:*`) are requirements the operation
  // places on its own caller, not facts the counterpart guarantees; comparing them
  // would turn an operation-level precondition into a boundary contradiction.
  const providerFacts = new Set();
  const providerErrors = new Set();
  for (const step of providerSteps) {
    for (const fact of factIdsOf(step.contract.post)) {
      if (belongsToBoundary(fact, boundaryId)) providerFacts.add(fact);
    }
    for (const produced of step.contract.produces ?? []) {
      if (belongsToBoundary(produced, boundaryId)) providerFacts.add(produced);
    }
    for (const error of step.contract.errors ?? []) {
      if (belongsToBoundary(error, boundaryId)) providerErrors.add(error);
    }
  }

  for (const consumer of consumerSteps) {
    checkConsumerContracts(index, boundaryId, consumer, { providerFacts, providerErrors }, findings);
  }
}

/** One consumer: its preconditions, consumed facts and expected errors against the provider. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkConsumerContracts(index, boundaryId, consumer, provider, findings) {
  const { providerFacts, providerErrors } = provider;
  const missing = [...factIdsOf(consumer.contract.pre)]
    .filter((fact) => belongsToBoundary(fact, boundaryId) && !providerFacts.has(fact));
  for (const fact of missing) {
    addFinding(findings, 'S5.precondition-not-implied', `${boundaryId}/${consumer.id}`, {
      className: 'contradiction',
      route: routeForStep('S5.precondition-not-implied', index, consumer),
      why: `consumer precondition ${fact} is not in the provider postconditions`,
      fix: `add ${fact} to the provider postconditions or remove it from the consumer preconditions`,
    });
  }
  for (const consumed of consumer.contract.consumes ?? []) {
    if (!belongsToBoundary(consumed, boundaryId)) continue;
    if (providerFacts.has(consumed)) continue;
    const producedEarlier = (index.stepsBySequence.get(consumer.sequence) ?? [])
      .filter((step) => step.line < consumer.line)
      .some((step) => (step.contract?.produces ?? []).includes(consumed));
    if (producedEarlier) continue;
    addFinding(findings, 'S5.consumes-not-produced', `${boundaryId}/${consumer.id}`, {
      className: 'omission',
      route: routeForStep('S5.consumes-not-produced', index, consumer),
      why: `step ${consumer.id} consumes ${consumed}, which no earlier step produces`,
      fix: `produce ${consumed} in an earlier step or declare it as an external input`,
    });
  }
  for (const error of consumer.contract.errors ?? []) {
    if (!belongsToBoundary(error, boundaryId)) continue;
    if (providerErrors.has(error) || providerErrors.size === 0) continue;
    addFinding(findings, 'S5.error-set-mismatch', `${boundaryId}/${consumer.id}`, {
      className: 'contradiction',
      route: routeForStep('S5.error-set-mismatch', index, consumer),
      why: `consumer expects ${error}, which the provider does not declare`,
      fix: `add ${error} to the provider errors or remove it from the consumer expectation`,
    });
  }
}
