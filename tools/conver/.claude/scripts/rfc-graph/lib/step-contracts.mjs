// PX-318 @verifies C001 C002 C003
// The operation-boundary contract has no home in the node/edge schema: an edge accepts
// only C### ids and three clause strings. This sidecar is the deterministic projection
// of the artifact step, and the graph note is the short pointer that binds a row to the
// operation node the step names.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import { canonicalStepIdentity, viewDigest } from '../../sequences-slice/lib/distribution-map.mjs';

/** The sidecar schema this module writes and reads. */
export const STEP_CONTRACT_SCHEMA_VERSION = 1;

/** The first ticket-contract id the step projection may use. */
const STEP_CONTRACT_ID_BASE = 500;

/** The number of C5xx ids the projection reserves for one package. */
const STEP_CONTRACT_ID_COUNT = 500;

/** The note a carrying edge uses to name one sidecar row. */
export function stepContractNote(stepId, rowIndex) {
  return `step:${stepId};row:${rowIndex}`;
}

/** The digest that binds one step's complete identity. */
export function digestStepContract(step) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalStepIdentity(step)))
    .digest('hex');
}

/** The prose of one fact array, or an empty string. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function factText(facts) {
  return (Array.isArray(facts) ? facts : [])
    .map((fact) => fact?.text ?? fact?.factId ?? '')
    .filter((text) => typeof text === 'string' && text.length > 0)
    .join('\n');
}

/**
 * The ticket-contract entry one sidecar row projects to.
 *
 * The id is stable for the sidecar order. A package whose steps exceed the reserved
 * range is refused by the caller rather than silently reusing an id.
 *
 * @param {object} row
 * @param {number} index
 * @returns {object}
 */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-318 --for-spec --no-implementation-order`.
export function stepContractEntry(row, index) {
  if (!Number.isInteger(index) || index < 0 || index >= STEP_CONTRACT_ID_COUNT) {
    throw new Error(`STEP_CONTRACT_ID_EXHAUSTED: sidecar row ${index} has no C5xx id`);
  }
  const prose = typeof row?.contractProse === 'string' ? row.contractProse : '';
  const precondition = factText(row?.contract?.pre) || prose || '(none)';
  const postcondition = factText(row?.contract?.post) || prose || '(none)';
  const invariant = factText(row?.contract?.invariants) || prose || '(none)';
  return {
    id: `C${String(STEP_CONTRACT_ID_BASE + index).padStart(3, '0')}`,
    sourceEdge: `step:${row.stepId}`,
    stepId: row.stepId,
    sequenceId: row.sequenceId,
    sourceStep: row.stepId,
    operationId: row.operationId,
    precondition,
    postcondition,
    invariant,
    contractProse: prose,
    contract: row.contract ?? null,
    digest: row.digest,
  };
}

/** The step-bearing records of a view, in view order. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function viewSteps(view) {
  const steps = [];
  const seen = new Set();
  for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      for (const step of Array.isArray(unit?.steps) ? unit.steps : []) {
        if (typeof step?.stepId !== 'string' || seen.has(step.stepId)) continue;
        seen.add(step.stepId);
        steps.push({ unit, step });
      }
    }
  }
  return steps;
}

/** The nodes that carry the operation a step names. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function operationNodes(graph, operationId) {
  return (graph?.nodes ?? [])
    .filter((node) => (node.unitIds ?? []).includes(`op-${operationId}`))
    .map((node) => node.id);
}

/**
 * Project every step-bearing view record into a sidecar row.
 *
 * @param {{ view: object, graph: object }} input
 * @returns {{ ok: boolean, sidecar: object, findings: Array<object> }}
 */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-318 --for-spec --no-implementation-order`.
export function projectStepContracts({ view, graph } = {}) {
  const findings = [];
  const steps = [];
  for (const { unit, step } of viewSteps(view)) {
    const nodeIds = operationNodes(graph, step.operationId);
    if (nodeIds.length === 0) {
      findings.push({
        code: 'CONTRACT_CHAIN_OPEN',
        subject: step.stepId,
        message: `step ${step.stepId} names operation ${step.operationId} and no graph node carries op-${step.operationId}`,
      });
      continue;
    }
    steps.push({
      stepId: step.stepId,
      sequenceId: unit.sequenceId,
      operationId: step.operationId,
      nodeIds,
      contract: step.contract ?? null,
      contractProse: typeof step.contractProse === 'string' ? step.contractProse : '',
      digest: digestStepContract(step),
    });
  }
  steps.sort((left, right) => left.stepId.localeCompare(right.stepId));
  return {
    ok: findings.length === 0,
    findings,
    sidecar: {
      schemaVersion: STEP_CONTRACT_SCHEMA_VERSION,
      sourceViewDigest: viewDigest(view),
      steps,
    },
  };
}

/** Whether an edge note names one sidecar row. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function noteNamesRow(note, stepId, rowIndex) {
  const expected = stepContractNote(stepId, rowIndex);
  return String(note ?? '').split('|').some((part) => part.trim() === expected);
}

/**
 * Verify the sidecar against the view and the graph.
 *
 * @param {{ view: object, graph: object, sidecar: object|null }} input
 * @returns {Array<{code: string, subject: string|null, message: string}>}
 */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-318 --for-spec --no-implementation-order`.
export function verifyStepContracts({ view, graph, sidecar } = {}) {
  const findings = [];
  if (sidecar === null || sidecar === undefined) {
    return [{ code: 'CONTRACT_CHAIN_OPEN', subject: null, message: 'the step-contract sidecar is missing' }];
  }
  if (sidecar.sourceViewDigest !== viewDigest(view)) {
    findings.push({ code: 'STALE_STEP_CONTRACT_SIDECAR', subject: null, message: 'the sidecar sourceViewDigest does not equal the live view' });
  }
  const rows = Array.isArray(sidecar.steps) ? sidecar.steps : [];
  const rowById = new Map(rows.map((row, index) => [row.stepId, { row, index }]));
  const expected = viewSteps(view);

  for (const { step } of expected) {
    const found = rowById.get(step.stepId);
    if (found === undefined) {
      findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: step.stepId, message: `step ${step.stepId} has no sidecar row` });
      continue;
    }
    const { row, index } = found;
    if (row.digest !== digestStepContract(step)) {
      findings.push({ code: 'STEP_CONTRACT_MISMATCH', subject: step.stepId, message: `sidecar row ${step.stepId} does not bind the live step` });
    }
    const missingNode = (row.nodeIds ?? []).find((nodeId) => {
      const node = (graph?.nodes ?? []).find((candidate) => candidate.id === nodeId);
      return node === undefined || !(node.unitIds ?? []).includes(`op-${row.operationId}`);
    });
    if (missingNode !== undefined || (row.nodeIds ?? []).length === 0) {
      findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: step.stepId, message: `sidecar row ${step.stepId} names a node that does not carry op-${row.operationId}` });
    }
    const carryingEdge = (graph?.edges ?? []).find((edge) =>
      ((row.nodeIds ?? []).includes(edge.from) || (row.nodeIds ?? []).includes(edge.to))
      && noteNamesRow(edge.attributes?.note, step.stepId, index));
    if (carryingEdge === undefined) {
      findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: step.stepId, message: `no graph edge note names sidecar row ${step.stepId}:${index}` });
    }
  }

  const expectedIds = new Set(expected.map(({ step }) => step.stepId));
  for (const row of rows) {
    if (!expectedIds.has(row.stepId)) {
      findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: row.stepId, message: `sidecar row ${row.stepId} is not a step in the live view` });
    }
  }
  return findings;
}

/** The sidecar document, or null when it is absent or unreadable. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-318 --for-spec --no-implementation-order`.
export function readStepContractSidecar(sidecarPath) {
  if (sidecarPath === null || sidecarPath === undefined || !existsSync(sidecarPath)) return null;
  try {
    return JSON.parse(readFileSync(sidecarPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Write the sidecar atomically beside its target. */
// [::TICKET::] PX-318 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-318 --for-spec --no-implementation-order`.
export function writeStepContractSidecar(sidecarPath, sidecar) {
  const staged = `${sidecarPath}.partial.${process.pid}`;
  writeFileSync(staged, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
  renameSync(staged, sidecarPath);
}
