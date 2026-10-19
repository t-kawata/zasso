/**
 * Layer B: the contract-meshing checks over typed v3 step contracts.
 *
 * The comparison is an exact set comparison on fact ids. A fact's prose is never
 * compared: two sentences that mean the same thing cannot be shown to mean the same
 * thing by a script, and pretending otherwise is the failure this layer exists to
 * avoid. A v2 artifact carries no typed facts, so Layer B is withheld rather than
 * failed.
 */
import { finding } from './index.mjs';

const V3 = 3;
const BOUNDARY_FACT_PREFIX = 'boundary:';

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
export function checkCrossingContracts(index) {
  if (index.schemaVersion !== V3) return [];
  const findings = [];
  for (const step of index.artifact.steps ?? []) {
    for (const boundary of step.contract?.crosses ?? []) {
      if (!index.boundariesById.has(boundary)) {
        findings.push(finding('S5.crossing-boundary-unknown', 'deficiency', step.id, `step ${step.id} crosses ${boundary}, which the tree manifest does not declare`, {
          repair: `Declare ${boundary} or remove it from the step contract.`,
        }));
      }
    }
  }

  for (const [boundaryId, steps] of stepsByBoundary(index)) {
    const contract = index.contractsByBoundary.get(boundaryId);
    if (contract === undefined) continue;
    for (const step of steps) {
      const owners = ownersOf(index, step.operation);
      if (!owners.has(contract.provider_package) && !owners.has(contract.consumer_package)) {
        findings.push(finding('S5.crossing-direction-mismatch', 'contradiction', step.id, `step ${step.id} crosses ${boundaryId} and belongs to neither side of it`, {
          repair: `Move ${step.id} to a package that holds a side of ${boundaryId}, or remove the crossing.`,
        }));
      }
    }
    const providerSteps = steps.filter((step) => ownersOf(index, step.operation).has(contract.provider_package));
    const consumerSteps = steps.filter((step) => ownersOf(index, step.operation).has(contract.consumer_package));
    if (providerSteps.length === 0 || consumerSteps.length === 0) {
      findings.push(finding('S5.crossing-side-missing', 'omission', boundaryId, `boundary ${boundaryId} has no ${providerSteps.length === 0 ? 'provider' : 'consumer'} step in the crossed sequence`, {
        repair: `Add the missing side of ${boundaryId} to the sequence or remove the crossing.`,
      }));
      continue;
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
      const missing = [...factIdsOf(consumer.contract.pre)]
        .filter((fact) => belongsToBoundary(fact, boundaryId) && !providerFacts.has(fact));
      for (const fact of missing) {
        findings.push(finding('S5.precondition-not-implied', 'contradiction', `${boundaryId}/${consumer.id}`, `consumer precondition ${fact} is not in the provider postconditions`, {
          repair: `Add ${fact} to the provider postconditions or remove it from the consumer preconditions.`,
        }));
      }
      for (const consumed of consumer.contract.consumes ?? []) {
        if (!belongsToBoundary(consumed, boundaryId)) continue;
        if (providerFacts.has(consumed)) continue;
        const producedEarlier = (index.stepsBySequence.get(consumer.sequence) ?? [])
          .filter((step) => step.line < consumer.line)
          .some((step) => (step.contract?.produces ?? []).includes(consumed));
        if (!producedEarlier) {
          findings.push(finding('S5.consumes-not-produced', 'omission', `${boundaryId}/${consumer.id}`, `step ${consumer.id} consumes ${consumed}, which no earlier step produces`, {
            repair: `Produce ${consumed} in an earlier step or declare it as an external input.`,
          }));
        }
      }
      for (const error of consumer.contract.errors ?? []) {
        if (!belongsToBoundary(error, boundaryId)) continue;
        if (!providerErrors.has(error) && providerErrors.size > 0) {
          findings.push(finding('S5.error-set-mismatch', 'contradiction', `${boundaryId}/${consumer.id}`, `consumer expects ${error}, which the provider does not declare`, {
            repair: `Add ${error} to the provider errors or remove it from the consumer expectation.`,
          }));
        }
      }
    }
  }
  return findings;
}
