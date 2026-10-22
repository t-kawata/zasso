// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
/**
 * Layer S6: the danger checks that ask whether the sequence can run at all.
 *
 * These are graph questions over the typed step contracts: a cycle, an operation no
 * path reaches, a produced fact nothing consumes, a repeated operation with no loop or
 * retry annotation, and a step that depends on a later step. A v2 artifact carries no
 * typed facts, so the graph checks are withheld with Layer B.
 */
import { finding } from './index.mjs';
import { buildFamilySubChecks } from './check-status.mjs';
import { SURFACES, surfaceAvailabilityOf } from './surfaces.mjs';
import { routeForOperation, routeForSpecRow, routeForStep } from './repair-route.mjs';
import { validateEscape, validatePositionDisposition } from '../../shared-obligations/judgment.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const ESCAPES = new Set(['suppliedRule', 'excluded']);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const REPEAT_ANNOTATIONS = new Set(['loop', 'retry', 'exception']);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const ACT_ORDERING_PATTERNS = Object.freeze([
  '導入する', '追記する', '起動し', '確かめる', '記録する', '作成する', '発行する',
  '実行する', '送信する', '更新する', '削除する', '登録する', '提出する', '公開する',
  '支払う', '移転する', '承認する', '拒否する', '検証する', '付与する',
]);

/** One finding with its route already resolved. */
// [::TICKET::] PX-277, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-277|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function addFinding(findings, checkId, subject, entry) {
  findings.push(finding(checkId, entry.className, subject, {
    ...entry.route,
    why: entry.why,
    fix: entry.fix,
  }));
}

/** The operation graph edges implied by consumed and produced facts. */
// [::TICKET::] PX-273, PX-274, PX-285, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274|PX-285|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function buildOperationEdges(index) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const producers = new Map();
  for (const step of index.artifact.steps ?? []) {
    for (const produced of step.contract?.produces ?? []) {
      if (!producers.has(produced)) producers.set(produced, []);
      producers.get(produced).push(step);
    }
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function findCycles(edges) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const cycles = [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const visiting = new Set();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const visited = new Set();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const path = [];

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const visit = (node) => {
    if (visiting.has(node)) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-273, PX-274, PX-277, PX-285, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274|PX-277|PX-285|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findUnreachableOperations(index) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  for (const operation of index.artifact.operations ?? []) {
    if (operation.disposition !== 'active') continue;
    if ((index.stepsByOperation.get(operation.id) ?? []).length > 0) continue;
    if (ESCAPES.has(operation.position)) continue;
    if (operation.registry_contribution === 'not_required' && typeof operation.registry_contribution_ground === 'string' && operation.registry_contribution_ground.trim() !== '') continue;
    addFinding(findings, 'S6.unreachable-operation', operation.id, {
      className: 'danger',
      route: routeForOperation('S6.unreachable-operation', index, operation),
      why: `active operation ${operation.id} is reached by no step and carries no grounded escape`,
      fix: `add a step that performs ${operation.id}, or record a grounded position escape`,
    });
  }
  return findings;
}

/** Facts produced but never consumed, and facts consumed but never produced. */
// [::TICKET::] PX-273, PX-274, PX-277, PX-285, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274|PX-277|PX-285|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findOrphanFacts(index) {
  if (index.schemaVersion !== 3) return [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const context = collectFactContext(index);
  return [
    ...findUnconsumedProduced(index, context),
    ...findUnproducedConsumed(index, context),
  ];
}

/** The object facts and the exemptions the orphan question must respect. */
// [::TICKET::] PX-277, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-277|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function collectFactContext(index) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const grounded = new Set((index.artifact.groundedObjects ?? []).map((entry) => entry.object));
  // The orphan question is about objects, not about boundary clauses: a boundary
  // contract fact is consumed by the edge's own protocol, and treating it as a data
  // object would report every edge as an orphan. Only `object:` facts participate.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const isObjectFact = (fact) => typeof fact === 'string' && fact.startsWith('object:');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const produced = new Set();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const consumed = new Set();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const terminalOutputs = new Set();
  for (const steps of index.stepsBySequence.values()) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
  return {
    produced,
    consumed,
    terminalOutputs,
    declaredOutputs: new Set((index.artifact.operations ?? []).flatMap((operation) => operation.result_object_classes ?? [])),
    isGrounded: (fact) => grounded.has(fact) || (fact.startsWith('object:') && grounded.has(fact.slice('object:'.length))),
  };
}

/** Produced object facts nothing consumes, unless a ground or a declared output explains them. */
// [::TICKET::] PX-277, PX-285, PX-288, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-277|PX-285|PX-288|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findUnconsumedProduced(index, context) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  for (const fact of context.produced) {
    // A declared result object is not a blanket exemption: the danger is an object that
    // leaves a step and enters none, and only the terminal output of a sequence is
    // deliberately external. A non-terminal output still owes a consumer or a ground.
    if (context.consumed.has(fact) || context.isGrounded(fact) || context.terminalOutputs.has(fact)) continue;
    addFinding(findings, 'S6.orphan-object', fact, {
      className: 'danger',
      route: routeForSpecRow('S6.orphan-object', index, fact),
      why: `fact ${fact} is produced by a step and consumed by none`,
      fix: `consume ${fact} in a later step or declare it as an external output`,
    });
  }
  return findings;
}

/** Consumed object facts nothing produces, unless a ground explains them. */
// [::TICKET::] PX-277, PX-285, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-277|PX-285|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findUnproducedConsumed(index, context) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  for (const fact of context.consumed) {
    if (context.produced.has(fact) || context.isGrounded(fact)) continue;
    addFinding(findings, 'S6.orphan-object', fact, {
      className: 'danger',
      route: routeForSpecRow('S6.orphan-object', index, fact),
      why: `fact ${fact} is consumed by a step and produced by none`,
      fix: `produce ${fact} in an earlier step or declare it as an external input`,
    });
  }
  return findings;
}

/** Repeated operations without a loop, retry or exception annotation. */
// [::TICKET::] PX-273, PX-274, PX-277, PX-285, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274|PX-277|PX-285|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findUnannotatedRepeats(index) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  for (const [sequenceId, steps] of index.stepsBySequence) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const positions = repeated.map((entry) => entry.position);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const contiguous = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const monotonic = repeated.every(({ step }, index) => index === 0 || step.line >= repeated[index - 1].step.line);
      if (contiguous && monotonic) continue;
      addFinding(findings, 'S6.unannotated-repeat', `${sequenceId}/${operationId}`, {
        className: 'danger',
        route: routeForStep('S6.unannotated-repeat', index, repeated[0].step),
        why: `operation ${operationId} appears ${repeated.length} times in ${sequenceId} with no loop, retry or exception annotation`,
        fix: 'annotate the repetition as loop, retry or exception, or remove the duplicate step',
      });
    }
  }
  return findings;
}

/** A step that consumes a fact a later step produces without an exception annotation. */
// [::TICKET::] PX-273, PX-274, PX-277, PX-285, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274|PX-277|PX-285|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findOrderContradictions(index) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  for (const [sequenceId, steps] of index.stepsBySequence) {
    for (const step of steps) {
      for (const consumed of step.contract?.consumes ?? []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
        const later = steps.find((candidate) => candidate.line > step.line && (candidate.contract?.produces ?? []).includes(consumed));
        if (later === undefined) continue;
        if (step.annotation === 'exception' || later.annotation === 'exception') continue;
        addFinding(findings, 'S6.order-contradiction', `${sequenceId}/${step.id}`, {
          className: 'danger',
          route: routeForStep('S6.order-contradiction', index, step),
          why: `step ${step.id} consumes ${consumed}, and ${later.id} produces it later`,
          fix: 'move the producing step earlier or annotate the inversion as an exception',
        });
      }
    }
  }
  return findings;
}

/** An operation effect that none of its steps crosses and no ground covers. */
// [::TICKET::] PX-284, PX-285, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-284|PX-285|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findBoundaryEffectDrift(index) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  if (!surfaceAvailabilityOf(index, SURFACES.BOUNDARY_EFFECTS).present) return findings;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const grounded = new Set((index.artifact.boundary_grounds ?? [])
    .filter((entry) => typeof entry?.ground === 'string' && entry.ground.trim() !== '')
    .map((entry) => entry.boundary));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const crossedByOperation = new Map();
  for (const step of index.artifact.steps ?? []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const crossed = crossedByOperation.get(step.operation) ?? new Set();
    for (const boundary of step.contract?.crosses ?? []) crossed.add(boundary);
    crossedByOperation.set(step.operation, crossed);
  }
  for (const operation of index.artifact.operations ?? []) {
    if (operation.disposition !== 'active') continue;
    for (const effect of operation.boundary_effects ?? []) {
      if (grounded.has(effect.boundary)) continue;
      if (crossedByOperation.get(operation.id)?.has(effect.boundary)) continue;
      addFinding(findings, 'S6.boundary-effect-drift', `${operation.id}/${effect.boundary}`, {
        className: 'danger',
        route: routeForOperation('S6.boundary-effect-drift', index, operation),
        why: `operation ${operation.id} declares an effect on ${effect.boundary}, and none of its steps crosses that boundary`,
        fix: `add a step contract.crosses for ${effect.boundary} or record a boundary_grounds entry`,
      });
    }
  }
  return findings;
}

/** The grounding classifications that can excuse an operation with no step. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const ESCAPE_GROUNDINGS = Object.freeze([
  'no_act_stated_by_the_specification',
  'designer_supplied',
  'framework_only',
  'not_an_act',
  'object_type_not_an_operation',
  'the_registry_excludes_this_row',
]);

/** Whether an operation carries a citation for the position it claims. */
// [::TICKET::] PX-288, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-288|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function hasEscapeGrounding(operation) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const grounding = operation?.grounding;
  if (grounding === null || typeof grounding !== 'object') return false;
  if (!ESCAPE_GROUNDINGS.includes(grounding.classification)) return false;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const citedLine = Number.isInteger(grounding.line) ? grounding.line : grounding.presupposition;
  return (Number.isInteger(citedLine) && citedLine > 0)
    || (typeof grounding.note === 'string' && grounding.note.trim() !== '');
}

/** The realized sequences with at least two steps, which can carry an internal handoff. */
// [::TICKET::] PX-288, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-288|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function multiStepSequences(index) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const realized = new Set((index.artifact.sequences ?? [])
    .filter((sequence) => sequence?.outcome !== 'notASequence')
    .map((sequence) => sequence.id));
  return [...index.stepsBySequence.entries()]
    .filter(([sequenceId, steps]) => realized.has(sequenceId) && steps.length >= 2);
}

/** A sequence with no consume and no authored flow ground. */
// [::TICKET::] PX-288, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-288|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findObjectFlows(index) {
  if (index.schemaVersion !== 3) return [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const grounds = new Set((index.artifact.sequence_flow_grounds ?? [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.sequence))
    .filter((entry) => typeof entry === 'string' && entry.length > 0));
  for (const [sequenceId, steps] of multiStepSequences(index)) {
    if (grounds.has(sequenceId)) continue;
    if (steps.some((step) => Array.isArray(step.contract?.consumes) && step.contract.consumes.length > 0)) continue;
    addFinding(findings, 'S6.object-flow-missing', sequenceId, {
      className: 'omission',
      route: routeForSpecRow('S6.object-flow-missing', index, sequenceId),
      why: `realized sequence ${sequenceId} has ${steps.length} steps and no consumed fact or flow ground`,
      fix: `consume a fact from an earlier step or author sequence_flow_grounds for ${sequenceId}`,
    });
  }
  return findings;
}

/** A step set that implies no operation edge at all. */
// [::TICKET::] PX-288, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-288|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findEmptyGraph(index) {
  if (index.schemaVersion !== 3) return [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const steps = index.artifact.steps ?? [];
  if (steps.length === 0) return [];
  if (buildOperationEdges(index).size > 0) return [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const first = steps[0];
  return [finding('S6.graph-empty', 'danger', 'operation-graph', {
    ...routeForStep('S6.graph-empty', index, first),
    why: `the artifact carries ${steps.length} steps and none consumes a fact another produces`,
    fix: 'author the consumed fact on the step that reads it, or record why the steps are independent',
  })];
}

/** An operation that escapes by position without the ground the escape owes. */
// [::TICKET::] PX-288, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-288|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function findUngroundedEscapes(index) {
  if (index.schemaVersion !== 3) return [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  for (const operation of index.artifact.operations ?? []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const steps = index.stepsByOperation.get(operation.id) ?? [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const positional = operation.position === 'excluded' || operation.position === 'suppliedRule';
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const activeRequired = operation.disposition === 'active' && operation.registry_contribution === 'required' && steps.length === 0 && positional;
    if (!positional && !activeRequired) continue;
    if (positional) {
      if (hasEscapeGrounding(operation)) continue;
    } else if (typeof operation.registry_contribution_ground === 'string' && operation.registry_contribution_ground.trim() !== '') {
      continue;
    } else if (typeof operation.position_ground === 'string' && operation.position_ground.trim() !== '') {
      continue;
    }
    addFinding(findings, 'S6.escape-ungrounded', operation.id, {
      className: 'danger',
      route: routeForOperation('S6.escape-ungrounded', index, operation),
      why: `operation ${operation.id} escapes with position ${operation.position ?? 'none'} and no grounded citation`,
      fix: `record grounding.classification with a line or note, or a registry_contribution_ground`,
    });
  }
  return findings;
}

/** The quote a grounding carries, from the first property that names one. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297|PX-298) --for-spec --no-implementation-order`.
function groundingQuote(operation) {
  if (typeof operation?.grounding?.quote === 'string' && operation.grounding.quote !== '') {
    return operation.grounding.quote;
  }
  for (const property of Object.values(operation?.grounding?.properties ?? {})) {
    if (typeof property?.quote === 'string' && property.quote !== '') return property.quote;
  }
  return null;
}

/** An active operation whose position and no-act ground disagree. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297|PX-298) --for-spec --no-implementation-order`.
function findPositionDispositionConflicts(index) {
  if (index.linesByPath === undefined || index.linesByPath === null) return [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  for (const operation of index.artifact?.operations ?? []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = validatePositionDisposition(operation);
    if (result.ok) continue;
    addFinding(findings, 'S6.position-disposition-conflict', operation.id, {
      className: 'contradiction',
      route: routeForOperation('S6.position-disposition-conflict', index, operation),
      why: `${operation.id} is active but its position and grounding say it orders no act`,
      fix: 'change the disposition, perform the operation in a step, or record a designer-supplied ground',
    });
  }
  return findings;
}

/** An escape whose cited line orders an act. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297|PX-298) --for-spec --no-implementation-order`.
function findEscapeActConflicts(index) {
  if (index.linesByPath === undefined || index.linesByPath === null) return [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  for (const operation of index.artifact?.operations ?? []) {
    if (!ESCAPES.has(operation.position)) continue;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const line = operation?.grounding?.line;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const quote = groundingQuote(operation);
    if (!Number.isInteger(line) || quote === null) continue;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = validateEscape({
      escape: {
        subject: operation.id,
        outcome: 'escaped',
        escapeKind: 'no_act',
        line,
        quote,
        why: operation?.grounding?.note ?? '',
      },
      linesByPath: index.linesByPath,
      actPatterns: ACT_ORDERING_PATTERNS,
    });
    if (result.ok) continue;
    addFinding(findings, 'S6.escape-act-conflict', operation.id, {
      className: 'danger',
      route: routeForOperation('S6.escape-act-conflict', index, operation),
      why: `${operation.id} escapes as no-act but the cited line orders an act`,
      fix: 'add a step that performs the operation, or cite a line that states an object or rule',
    });
  }
  return findings;
}

/** Every danger finding for one index. */
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function collectDangers(index) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findings = [];
  for (const cycle of findCycles(buildOperationEdges(index))) {
    addFinding(findings, 'S6.cycle', cycle.join(' -> '), {
      className: 'danger',
      route: routeForSpecRow('S6.cycle', index, cycle.join(' -> ')),
      why: `the operation dependency graph contains the cycle ${cycle.join(' -> ')}`,
      fix: 'break the cycle by removing a consumed fact or reordering the steps',
    });
  }
  findings.push(...findUnreachableOperations(index));
  findings.push(...findOrphanFacts(index));
  findings.push(...findUnannotatedRepeats(index));
  findings.push(...findOrderContradictions(index));
  findings.push(...findBoundaryEffectDrift(index));
  findings.push(...findObjectFlows(index));
  findings.push(...findEmptyGraph(index));
  findings.push(...findUngroundedEscapes(index));
  findings.push(...findPositionDispositionConflicts(index));
  findings.push(...findEscapeActConflicts(index));
  return { findings, subChecks: buildFamilySubChecks('danger', index) };
}

/** The findings-only view of the danger family, kept for existing callers. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function checkDangers(index) {
  return collectDangers(index).findings;
}
