/**
 * Layer S6: the danger checks that ask whether the sequence can run at all.
 *
 * These are graph questions over the typed step contracts: a cycle, an operation no
 * path reaches, a produced fact nothing consumes, a repeated operation with no loop or
 * retry annotation, and a step that depends on a later step. A v2 artifact carries no
 * typed facts, so the graph checks are withheld with Layer B.
 */
import { finding } from './index.mjs';

const ESCAPES = new Set(['suppliedRule', 'excluded']);
const REPEAT_ANNOTATIONS = new Set(['loop', 'retry', 'exception']);

/** The operation graph edges implied by consumed and produced facts. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function operationEdges(index) {
  const producers = new Map();
  for (const step of index.artifact.steps ?? []) {
    for (const produced of step.contract?.produces ?? []) {
      if (!producers.has(produced)) producers.set(produced, []);
      producers.get(produced).push(step);
    }
  }
  const edges = new Map();
  for (const step of index.artifact.steps ?? []) {
    for (const consumed of step.contract?.consumes ?? []) {
      for (const producer of producers.get(consumed) ?? []) {
        if (!edges.has(producer.operation)) edges.set(producer.operation, new Set());
        edges.get(producer.operation).add(step.operation);
      }
    }
  }
  return edges;
}

/** Every cycle in a directed graph, as a list of operation paths. */
export function findCycles(edges) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const path = [];

  const visit = (node) => {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      cycles.push([...path.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    path.push(node);
    for (const next of edges.get(node) ?? []) visit(next);
    path.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of edges.keys()) visit(node);
  return cycles;
}

/** Operations no step reaches and no escape covers. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function unreachableOperations(index) {
  const findings = [];
  for (const operation of index.artifact.operations ?? []) {
    if (operation.disposition !== 'active') continue;
    if ((index.stepsByOperation.get(operation.id) ?? []).length > 0) continue;
    if (ESCAPES.has(operation.position)) continue;
    if (operation.registry_contribution === 'not_required' && typeof operation.registry_contribution_ground === 'string' && operation.registry_contribution_ground.trim() !== '') continue;
    findings.push(finding('S6.unreachable-operation', 'danger', operation.id, `active operation ${operation.id} is reached by no step and carries no grounded escape`, {
      repair: `Add a step that performs ${operation.id}, or record a grounded position escape.`,
    }));
  }
  return findings;
}

/** Facts produced but never consumed, and facts consumed but never produced. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function orphanFacts(index) {
  if (index.schemaVersion !== 3) return [];
  const grounded = new Set((index.artifact.groundedObjects ?? []).map((entry) => entry.object));
  const isGrounded = (fact) => grounded.has(fact) || (fact.startsWith('object:') && grounded.has(fact.slice('object:'.length)));
  // The orphan question is about objects, not about boundary clauses: a boundary
  // contract fact is consumed by the edge's own protocol, and treating it as a data
  // object would report every edge as an orphan. Only `object:` facts participate.
  const isObjectFact = (fact) => typeof fact === 'string' && fact.startsWith('object:');
  const declaredOutputs = new Set(
    (index.artifact.operations ?? []).flatMap((operation) => operation.result_object_classes ?? []),
  );
  const produced = new Set();
  const consumed = new Set();
  const terminalOutputs = new Set();
  for (const steps of index.stepsBySequence.values()) {
    const last = steps.reduce((latest, step) => (step.line > latest.line ? step : latest), steps[0]);
    for (const fact of last.contract?.produces ?? []) {
      if (isObjectFact(fact)) terminalOutputs.add(fact);
    }
  }
  for (const step of index.artifact.steps ?? []) {
    for (const fact of step.contract?.produces ?? []) {
      if (isObjectFact(fact)) produced.add(fact);
    }
    for (const fact of step.contract?.consumes ?? []) {
      if (isObjectFact(fact)) consumed.add(fact);
    }
  }
  const findings = [];
  for (const fact of produced) {
    const objectName = fact.slice('object:'.length);
    // A result object an operation declares is a deliberate output of that operation.
    // The danger the orphan check exists to catch is an object with no producer at all,
    // not an output nothing consumes later in the enumerated sequence.
    if (declaredOutputs.has(objectName)) continue;
    if (!consumed.has(fact) && !isGrounded(fact) && !terminalOutputs.has(fact)) {
      findings.push(finding('S6.orphan-object', 'danger', fact, `fact ${fact} is produced by a step and consumed by none`, {
        repair: `Consume ${fact} in a later step or declare it as an external output.`,
      }));
    }
  }
  for (const fact of consumed) {
    if (!produced.has(fact) && !isGrounded(fact)) {
      findings.push(finding('S6.orphan-object', 'danger', fact, `fact ${fact} is consumed by a step and produced by none`, {
        repair: `Produce ${fact} in an earlier step or declare it as an external input.`,
      }));
    }
  }
  return findings;
}

/** Repeated operations without a loop, retry or exception annotation. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function unannotatedRepeats(index) {
  const findings = [];
  for (const [sequenceId, steps] of index.stepsBySequence) {
    const byOperation = new Map();
    for (const [position, step] of steps.entries()) {
      if (!byOperation.has(step.operation)) byOperation.set(step.operation, []);
      byOperation.get(step.operation).push({ step, position });
    }
    for (const [operationId, repeated] of byOperation) {
      if (repeated.length < 2) continue;
      if (repeated.some(({ step }) => REPEAT_ANNOTATIONS.has(step.annotation))) continue;
      // Consecutive, line-monotonic steps of one operation are the procedure's own
      // internal steps, not a repetition: a policy issuance that validates seven
      // clauses is one act read as seven rows, and requiring a loop annotation there
      // would be a false finding. A repeat separated by another operation, or one
      // that steps backwards, is a branch or a retry and must say which.
      const positions = repeated.map((entry) => entry.position);
      const contiguous = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);
      const monotonic = repeated.every(({ step }, index) => index === 0 || step.line >= repeated[index - 1].step.line);
      if (contiguous && monotonic) continue;
      findings.push(finding('S6.unannotated-repeat', 'danger', `${sequenceId}/${operationId}`, `operation ${operationId} appears ${repeated.length} times in ${sequenceId} with no loop, retry or exception annotation`, {
        repair: `Annotate the repetition as loop, retry or exception, or remove the duplicate step.`,
      }));
    }
  }
  return findings;
}

/** A step that consumes a fact a later step produces without an exception annotation. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function orderContradictions(index) {
  const findings = [];
  for (const [sequenceId, steps] of index.stepsBySequence) {
    for (const step of steps) {
      for (const consumed of step.contract?.consumes ?? []) {
        const later = steps.find((candidate) => candidate.line > step.line && (candidate.contract?.produces ?? []).includes(consumed));
        if (later === undefined) continue;
        if (step.annotation === 'exception' || later.annotation === 'exception') continue;
        findings.push(finding('S6.order-contradiction', 'danger', `${sequenceId}/${step.id}`, `step ${step.id} consumes ${consumed}, and ${later.id} produces it later`, {
          repair: `Move the producing step earlier or annotate the inversion as an exception.`,
        }));
      }
    }
  }
  return findings;
}

/** Every danger finding for one index. */
export function checkDangers(index) {
  const findings = [];
  for (const cycle of findCycles(operationEdges(index))) {
    findings.push(finding('S6.cycle', 'danger', cycle.join(' -> '), `the operation dependency graph contains the cycle ${cycle.join(' -> ')}`, {
      repair: 'Break the cycle by removing a consumed fact or reordering the steps.',
    }));
  }
  findings.push(...unreachableOperations(index));
  findings.push(...orphanFacts(index));
  findings.push(...unannotatedRepeats(index));
  findings.push(...orderContradictions(index));
  return findings;
}
