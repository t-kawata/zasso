// PX-318, PX-322 @verifies C001 C002 C003 C004
// The operation-boundary contract has no home in the node/edge schema: an edge accepts
// only C### ids and three clause strings. This sidecar is the deterministic projection
// of the artifact step, and the graph note is the short pointer that binds a row to the
// operation node the step names. A step is projected only by the package that declares
// its operation: a foreign step of a cross-boundary sequence belongs to the other
// package's graph.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import { canonicalStepIdentity, viewDigest } from '../../sequences-slice/lib/distribution-map.mjs';

/** The sidecar schema this module writes and reads. */
export const STEP_CONTRACT_SCHEMA_VERSION = 2;

/** The first ticket-contract id the step projection may use. */
const STEP_CONTRACT_ID_BASE = 500;

/** The number of C5xx ids the projection reserves for one package. */
const STEP_CONTRACT_ID_COUNT = 500;

/** The graph edge note schema limit, in characters. */
export const STEP_NOTE_LIMIT = 240;

/** The prefix of the pointer note that binds an edge to a sidecar row set. */
export const STEP_SIDECAR_NOTE_PREFIX = 'step-sidecar';

/** The separator between the note parts an edge may carry. */
const NOTE_PART_SEPARATOR = '|';

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
// [::TICKET::] PX-318 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-318) --for-spec --no-implementation-order`.
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function factText(facts) {
  return (Array.isArray(facts) ? facts : [])
    .map((fact) => (typeof fact === 'string' ? fact : (fact?.text ?? fact?.factId ?? '')))
    .filter((text) => typeof text === 'string' && text.length > 0)
    .join('\n');
}

/** The operation ids this package declares locally, from ownership or an obligation. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function localOperationUnitIds(view) {
  const ids = new Set();
  for (const unit of Array.isArray(view?.ownedOperationUnits) ? view.ownedOperationUnits : []) {
    const operationId = typeof unit?.operationId === 'string'
      ? unit.operationId
      : (typeof unit?.unitId === 'string' && unit.unitId.startsWith('op-') ? unit.unitId.slice('op-'.length) : '');
    if (operationId.length > 0) ids.add(operationId);
  }
  for (const unit of Array.isArray(view?.obligationUnits) ? view.obligationUnits : []) {
    const unitId = String(unit?.unitId ?? '');
    if (!unitId.startsWith('op-')) continue;
    const operationId = typeof unit.subject === 'string' ? unit.subject : unitId.slice('op-'.length);
    if (operationId.length > 0) ids.add(operationId);
  }
  return ids;
}

/**
 * The step-bearing records of this package, in view order.
 *
 * A cross-boundary sequence carries every step, but a package owes only the steps whose
 * operation it declares locally. Projection and verification both read this function, so
 * they cannot disagree about which step belongs here. A local step whose graph lacks the
 * operation node is still returned; the caller reports CONTRACT_CHAIN_OPEN rather than
 * silently dropping it.
 *
 * @param {object} view
 * @returns {Array<{ unit: object, step: object }>}
 */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function localStepRecords(view) {
  const local = localOperationUnitIds(view);
  const records = [];
  const seen = new Set();
  for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      for (const step of Array.isArray(unit?.steps) ? unit.steps : []) {
        if (typeof step?.stepId !== 'string' || seen.has(step.stepId)) continue;
        if (!local.has(step.operationId)) continue;
        seen.add(step.stepId);
        records.push({ unit, step });
      }
    }
  }
  return records;
}

/** The edge key the boundary projection also uses. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function edgeKeyOf(edge) {
  return `${edge.from}→${edge.to}(${edge.type})`;
}

/** The edge a row may bind to: an incident edge, preferring one already carrying a note. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function edgeForRow(graph, row) {
  const incident = (graph?.edges ?? []).filter((edge) =>
    (row.nodeIds ?? []).includes(edge.from) || (row.nodeIds ?? []).includes(edge.to));
  return incident.find((edge) => isStepNote(String(edge.attributes?.note ?? ''))) ?? incident[0];
}

/** Whether a note already carries a step or step-sidecar part. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function isStepNote(note) {
  return note.split(NOTE_PART_SEPARATOR).some((part) =>
    part.trim().startsWith('step:') || part.trim().startsWith(`${STEP_SIDECAR_NOTE_PREFIX};`));
}

/** Group row indexes by the edge they bind to. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function assignRowsToEdges(graph, rows) {
  const groups = new Map();
  for (const [index, row] of (rows ?? []).entries()) {
    const edge = edgeForRow(graph, row);
    if (edge === undefined) continue;
    const key = edgeKeyOf(edge);
    const group = groups.get(key) ?? { edge, indexes: [] };
    group.indexes.push(index);
    groups.set(key, group);
  }
  return groups;
}

/** The digest that binds the rows of one edge. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function digestStepRows(rows) {
  return createHash('sha256')
    .update(JSON.stringify((rows ?? [])
      .map((row) => ({ stepId: row?.stepId ?? null, digest: row?.digest ?? null }))
      .sort((left, right) => String(left.stepId).localeCompare(String(right.stepId)))))
    .digest('hex');
}

/** The bounded pointer note an edge carries for its rows. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function stepSidecarNote(rows) {
  return `${STEP_SIDECAR_NOTE_PREFIX};digest:${digestStepRows(rows)}`;
}

/** The digest a note carries, or null when the note is not a step pointer. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function parseStepSidecarNote(note) {
  const match = String(note ?? '').match(/step-sidecar;digest:([0-9a-f]{64})/);
  return match === null ? null : { digest: match[1] };
}

/** The edge a sidecar edge key names, or undefined. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function edgeByKey(graph, key) {
  return (graph?.edges ?? []).find((edge) => edgeKeyOf(edge) === key);
}

/** The note each edge must carry for the sidecar rows it binds. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function stepNotesByEdge(graph, sidecar) {
  const rows = Array.isArray(sidecar?.steps) ? sidecar.steps : [];
  const notes = new Map();
  if (sidecar?.edges !== undefined && sidecar.edges !== null && typeof sidecar.edges === 'object') {
    for (const [key, indexes] of Object.entries(sidecar.edges)) {
      const edge = edgeByKey(graph, key);
      if (edge === undefined) continue;
      notes.set(key, { edge, note: stepSidecarNote(indexes.map((index) => rows[index])) });
    }
    return notes;
  }
  for (const [key, group] of assignRowsToEdges(graph, rows)) {
    notes.set(key, { edge: group.edge, note: stepSidecarNote(group.indexes.map((index) => rows[index])) });
  }
  return notes;
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
// [::TICKET::] PX-318 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-318 --for-spec --no-implementation-order`.
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

/** The nodes that carry the operation a step names. */
// [::TICKET::] PX-318 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function operationNodes(graph, operationId) {
  return (graph?.nodes ?? [])
    .filter((node) => (node.unitIds ?? []).includes(`op-${operationId}`))
    .map((node) => node.id);
}

/**
 * Project every local step-bearing view record into a sidecar row.
 *
 * @param {{ view: object, graph: object }} input
 * @returns {{ ok: boolean, sidecar: object, findings: Array<object> }}
 */
// [::TICKET::] PX-318, PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-318|PX-322) --for-spec --no-implementation-order`.
export function projectStepContracts({ view, graph } = {}) {
  const findings = [];
  const steps = [];
  for (const { unit, step } of localStepRecords(view)) {
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

  const groups = assignRowsToEdges(graph, steps);
  const boundIndexes = new Set([...groups.values()].flatMap((group) => group.indexes));
  for (const [index, step] of steps.entries()) {
    if (boundIndexes.has(index)) continue;
    findings.push({
      code: 'CONTRACT_CHAIN_OPEN',
      subject: step.stepId,
      message: `step ${step.stepId} has no edge incident to its operation node`,
    });
  }

  return {
    ok: findings.length === 0,
    findings,
    sidecar: {
      schemaVersion: STEP_CONTRACT_SCHEMA_VERSION,
      sourceViewDigest: viewDigest(view),
      edges: Object.fromEntries([...groups.entries()].map(([key, group]) => [key, group.indexes])),
      steps,
    },
  };
}

/** Whether an edge is incident to the row's operation node. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function edgeIsIncident(edge, nodeIds) {
  return (nodeIds ?? []).includes(edge.from) || (nodeIds ?? []).includes(edge.to);
}

/** Whether one row is bound by an inline note or a pointer note on an incident edge. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function rowIsBound({ graph, sidecar, row, index, rows }) {
  const incident = (graph?.edges ?? []).filter((edge) => edgeIsIncident(edge, row.nodeIds));
  for (const edge of incident) {
    const parts = String(edge.attributes?.note ?? '').split(NOTE_PART_SEPARATOR).map((part) => part.trim());
    if (parts.includes(stepContractNote(row.stepId, index))) return true;
    const key = edgeKeyOf(edge);
    for (const part of parts) {
      const pointer = parseStepSidecarNote(part);
      if (pointer === null) continue;
      const indexes = sidecar?.edges?.[key];
      if (!Array.isArray(indexes) || !indexes.includes(index)) continue;
      const boundRows = indexes.map((rowIndex) => rows[rowIndex]).filter((candidate) => candidate !== undefined);
      if (boundRows.some((candidate) => !edgeIsIncident(edge, candidate.nodeIds))) continue;
      if (digestStepRows(boundRows) === pointer.digest) return true;
    }
  }
  return false;
}

/** The findings the sidecar edges map must satisfy. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function verifyEdgeMap(sidecar, rows) {
  const findings = [];
  if (sidecar?.edges === undefined || sidecar.edges === null || typeof sidecar.edges !== 'object') return findings;
  const seen = new Set();
  for (const [key, indexes] of Object.entries(sidecar.edges)) {
    if (!Array.isArray(indexes) || indexes.length === 0) {
      findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: null, message: `sidecar edge ${key} names no row` });
      continue;
    }
    for (const index of indexes) {
      if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
        findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: null, message: `sidecar edge ${key} names row ${index}, which does not exist` });
        continue;
      }
      if (seen.has(index)) {
        findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: rows[index]?.stepId ?? null, message: `sidecar row ${index} is bound to more than one edge` });
      }
      seen.add(index);
    }
  }
  for (let index = 0; index < rows.length; index += 1) {
    if (seen.has(index)) continue;
    findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: rows[index]?.stepId ?? null, message: `sidecar row ${index} is not bound to any edge` });
  }
  return findings;
}

/**
 * Verify the sidecar against the view and the graph.
 *
 * @param {{ view: object, graph: object, sidecar: object|null }} input
 * @returns {Array<{code: string, subject: string|null, message: string}>}
 */
// [::TICKET::] PX-318, PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-318|PX-322) --for-spec --no-implementation-order`.
export function verifyStepContracts({ view, graph, sidecar } = {}) {
  const findings = [];
  if (sidecar === null || sidecar === undefined) {
    return [{ code: 'CONTRACT_CHAIN_OPEN', subject: null, message: 'the step-contract sidecar is missing' }];
  }
  if (sidecar.sourceViewDigest !== viewDigest(view)) {
    findings.push({ code: 'STALE_STEP_CONTRACT_SIDECAR', subject: null, message: 'the sidecar sourceViewDigest does not equal the live view' });
  }
  const rows = Array.isArray(sidecar.steps) ? sidecar.steps : [];
  findings.push(...verifyEdgeMap(sidecar, rows));
  const rowById = new Map(rows.map((row, index) => [row.stepId, { row, index }]));
  const expected = localStepRecords(view);

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
    if (!rowIsBound({ graph, sidecar, row, index, rows })) {
      findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: step.stepId, message: `no graph edge note binds sidecar row ${step.stepId}:${index}` });
    }
  }

  const expectedIds = new Set(expected.map(({ step }) => step.stepId));
  for (const row of rows) {
    if (!expectedIds.has(row.stepId)) {
      findings.push({ code: 'CONTRACT_CHAIN_OPEN', subject: row.stepId, message: `sidecar row ${row.stepId} is not a step this package declares` });
    }
  }
  return findings;
}

/** The sidecar document, or null when it is absent or unreadable. */
// [::TICKET::] PX-318 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-318) --for-spec --no-implementation-order`.
export function readStepContractSidecar(sidecarPath) {
  if (sidecarPath === null || sidecarPath === undefined || !existsSync(sidecarPath)) return null;
  try {
    return JSON.parse(readFileSync(sidecarPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Write the sidecar atomically beside its target. */
// [::TICKET::] PX-318 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-318) --for-spec --no-implementation-order`.
export function writeStepContractSidecar(sidecarPath, sidecar) {
  const staged = `${sidecarPath}.partial.${process.pid}`;
  writeFileSync(staged, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
  renameSync(staged, sidecarPath);
}
