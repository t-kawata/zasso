/**
 * The one read-only verifier that proves the distribution chain is the same object at
 * every layer: the package view, the RFC distribution map, the graph, the Dirs-Tree and
 * the tickets. It never writes; every producer keeps its own write path.
 *
 * The verifier is used by graphify as an admission gate, by boundify as a preflight, and
 * by split before and after ticket authoring. A layer that copies a digest but drops a
 * unit, a step, a boundary contract or a direction is named, not silently accepted.
 */
import {
  activeArtifactOperationsForPackage,
  artifactSequencesForPackage,
  artifactStepsForSequences,
  collectViewUnits,
  declaredSequenceIds,
  isAdditiveEmptyDistribution,
  mapDigest,
  registryRowsForPackage,
  stepBearingRecords,
  stepContractMatches,
  stepIdentityMatches,
  UNIT_ROLE_IMPLEMENTER,
  validOperationResiduals,
  viewDigest,
} from './lib/distribution-map.mjs';
import { digestValue } from './lib/digest.mjs';
import { readDistributionMap } from '../rfc-graph/lib/unit-ids.mjs';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { findAllocateManifest, findSingleSiblingPath } = require('../lib/package-artifacts.js');
const { ticketIdentity } = require('../tickets/lib/ticket-identity.js');
import {
  boundaryClauseDigest,
  carryingEdgeFor,
  combinedBoundaryDigest,
  parseBoundaryNoteRows,
  projectionMatches,
} from './lib/boundary-contract.mjs';
import { verifySmoothReceipt } from './lib/smooth-verdict.mjs';

export const CHAIN_CODES = Object.freeze({
  STALE_DISTRIBUTION_MAP: 'STALE_DISTRIBUTION_MAP',
  DISTRIBUTION_DIGEST_MISMATCH: 'DISTRIBUTION_DIGEST_MISMATCH',
  UNIT_SET_MISMATCH: 'UNIT_SET_MISMATCH',
  SEQUENCE_STEPS_UNDISTRIBUTED: 'SEQUENCE_STEPS_UNDISTRIBUTED',
  TICKET_STEP_MISSING: 'TICKET_STEP_MISSING',
  DUPLICATE_SEQUENCE_STEP: 'DUPLICATE_SEQUENCE_STEP',
  SEQUENCE_ORDER_MISMATCH: 'SEQUENCE_ORDER_MISMATCH',
  MISSING_BOUNDARY_CONTRACT: 'MISSING_BOUNDARY_CONTRACT',
  BOUNDARY_CONTRACT_MISMATCH: 'BOUNDARY_CONTRACT_MISMATCH',
  BOUNDARY_DIRECTION_MISMATCH: 'BOUNDARY_DIRECTION_MISMATCH',
  AMBIGUOUS_BOUNDARY_EDGE: 'AMBIGUOUS_BOUNDARY_EDGE',
  DUPLICATE_UNIT_AT_TICKET: 'DUPLICATE_UNIT_AT_TICKET',
  MISSING_IMPLEMENTER: 'MISSING_IMPLEMENTER',
  STEP_CONTRACT_MISMATCH: 'STEP_CONTRACT_MISMATCH',
  MISSING_OPERATION: 'MISSING_OPERATION',
  MISSING_SEQUENCE: 'MISSING_SEQUENCE',
  STEP_IDENTITY_MISMATCH: 'STEP_IDENTITY_MISMATCH',
  ACTIVE_OPERATION_RESIDUAL: 'ACTIVE_OPERATION_RESIDUAL',
  INVENTED_SEQUENCE: 'INVENTED_SEQUENCE',
  INVENTED_SEQUENCE_STEP: 'INVENTED_SEQUENCE_STEP',
});

/** One named chain finding. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return { code, subject: subject ?? null, message };
}

/** The unit ids a ticket's distribution carries. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function ticketUnitIds(ticket) {
  return (ticket?.distribution?.units ?? []).map((unit) => unit.unitId).filter((unitId) => typeof unitId === 'string');
}

/** Every ticket in the aggregate, in phase order. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function allTickets(tickets) {
  return (tickets?.phases ?? []).flatMap((phase) => phase?.tickets ?? []);
}

/** The step-bearing records a view carries, keyed by sequence id. */
// [::TICKET::] PX-312, PX-313, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-314) --for-spec --no-implementation-order`.
function viewStepBearing(view) {
  return stepBearingRecords(view);
}

/** The ordered artifact steps of the sequences this view declares. */
// [::TICKET::] PX-312, PX-313, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-314) --for-spec --no-implementation-order`.
function artifactStepsBySequence(artifact, sequenceIds) {
  return artifactStepsForSequences(artifact, sequenceIds);
}

/** The step ids a sequence declares when no root artifact is supplied. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function declaredStepsFromView(view) {
  const bySequence = new Map();
  for (const [sequenceId, records] of viewStepBearing(view)) {
    const steps = [];
    const seen = new Set();
    for (const record of records) {
      for (const step of record.steps) {
        if (typeof step?.stepId !== 'string' || seen.has(step.stepId)) continue;
        seen.add(step.stepId);
        steps.push({ id: step.stepId, operationId: step.operationId, order: step.order ?? step.line ?? 0 });
      }
    }
    steps.sort((left, right) => left.order - right.order);
    bySequence.set(sequenceId, steps);
  }
  return bySequence;
}

/** Compare the unit sets of two layers. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function compareUnitSets(actual, expected, layer, findings) {
  const missing = [...expected].filter((unitId) => !actual.has(unitId));
  const invented = [...actual].filter((unitId) => !expected.has(unitId));
  if (missing.length > 0 || invented.length > 0) {
    findings.push(finding(CHAIN_CODES.UNIT_SET_MISMATCH, layer, `${layer} unit set differs; missing=${missing.join(',') || 'none'}; invented=${invented.join(',') || 'none'}`));
  }
}

/** The direction records a ctr unit carries in the view, in view order. */
// [::TICKET::] PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-315 --for-spec --no-implementation-order`.
function directionsFor(view, ctrUnit) {
  return (collectViewUnits(view).get(ctrUnit)?.records ?? [])
    .map((record) => record.direction)
    .filter((direction) => typeof direction === 'string');
}

/** The registry rows a note resolves to, including a sidecar note, or null. */
// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
function boundaryRowsFromNote(note, registry, sidecarPath, edgeKey = null) {
  if (note.sidecar === null) {
    const rows = note.ids.map((id) => (registry ?? []).find((row) => row.boundary_id === id));
    return rows.some((row) => row === undefined) ? null : rows;
  }
  const resolvedPath = sidecarPath ?? note.sidecar;
  if (resolvedPath === null || !existsSync(resolvedPath)) return null;
  let sidecar;
  try {
    sidecar = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  } catch {
    return null;
  }
  const ids = sidecar.edges !== undefined && edgeKey !== null
    ? (sidecar.edges[edgeKey] ?? [])
    : Object.keys(sidecar.boundaries ?? {}).sort();
  if (ids.length === 0) return null;
  const rows = ids.map((id) => (registry ?? []).find((row) => row.boundary_id === id));
  if (rows.some((row) => row === undefined)) return null;
  for (const row of rows) {
    const sidecarRow = sidecar.boundaries[row.boundary_id];
    if (sidecarRow.clauseDigest !== boundaryClauseDigest(row)) return null;
    if (JSON.stringify(sidecarRow.clauses) !== JSON.stringify(row.clauses)) return null;
  }
  return rows;
}

/** The registry boundary contract a ticket carries, or undefined. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function ticketBoundaryContract(ticket, row) {
  const boundaryId = row.boundary_id;
  const registryId = `contract-${boundaryId}`;
  return (ticket?.contracts ?? []).find((contract) => contract?.boundaryId === boundaryId
    || contract?.registryContractId === registryId
    || contract?.id === registryId);
}

/** The role the package map, or the view candidate, gives one operation unit. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function resolveUnitRole({ map, view, unitId }) {
  const mapRole = (map?.units ?? []).find((unit) => unit.unitId === unitId)?.role ?? null;
  const viewRole = collectViewUnits(view).get(unitId)?.record?.roleCandidate ?? null;
  return mapRole ?? viewRole;
}

/** Require an implementing ticket only for the package that declares the operation. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function requireImplementerForRole({ unitId, map, view, implementersByUnit, findings }) {
  if (resolveUnitRole({ map, view, unitId }) !== UNIT_ROLE_IMPLEMENTER) return;
  if (implementersByUnit.has(unitId)) return;
  findings.push(finding(
    CHAIN_CODES.MISSING_IMPLEMENTER,
    unitId,
    `operation ${unitId} is an implementer and no ticket implements it`,
  ));
}

/**
 * Verify the chain.
 *
 * @param {{ view: object, map: object, graph: object, dirsTree: object, tickets: object, registry?: Array<object>, artifact?: object|null }} input
 * @returns {{ ok: boolean, findings: Array<{ code: string, subject: string|null, message: string }> }}
 */
// [::TICKET::] PX-312, PX-313, PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-315) --for-spec --no-implementation-order`.
// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-317 --for-spec --no-implementation-order`.
// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function verifyChain(input = {}) {
  const {
    view,
    map,
    graph,
    dirsTree,
    tickets,
    registry = [],
    artifact = null,
    treeManifest = null,
    stage = 'split',
    preflight = false,
    sidecarPath = null,
  } = input;
  const findings = [];
  const checkDirs = stage !== 'graphify' && !preflight && dirsTree !== undefined && dirsTree !== null;
  const checkTickets = stage === 'split' && tickets !== undefined && tickets !== null;

  const additiveEmpty = isAdditiveEmptyDistribution(view, map);
  if (!additiveEmpty) {
    const computedViewDigest = viewDigest(view);
    if (map?.sourceViewDigest !== computedViewDigest) {
      findings.push(finding(CHAIN_CODES.STALE_DISTRIBUTION_MAP, map?.packageId, `map.sourceViewDigest does not equal viewDigest(view)`));
    }
    if (map?.digest !== mapDigest(map)) {
      findings.push(finding(CHAIN_CODES.DISTRIBUTION_DIGEST_MISMATCH, 'map', 'map.digest does not equal mapDigest(map)'));
    }
    if (graph?.distributionDigest !== map?.digest) {
      findings.push(finding(CHAIN_CODES.DISTRIBUTION_DIGEST_MISMATCH, 'graph', 'graph.distributionDigest does not equal map.digest'));
    }
    if (checkDirs && dirsTree?.distribution?.digest !== graph?.distributionDigest) {
      findings.push(finding(CHAIN_CODES.DISTRIBUTION_DIGEST_MISMATCH, 'dirs', 'dirsTree.distribution.digest does not equal graph.distributionDigest'));
    }
    if (checkTickets && tickets?.distribution?.sourceMapDigest !== graph?.distributionDigest) {
      findings.push(finding(CHAIN_CODES.DISTRIBUTION_DIGEST_MISMATCH, 'tickets', 'tickets.distribution.sourceMapDigest does not equal graph.distributionDigest'));
    }
    if (checkTickets && tickets?.distribution?.sourceViewDigest !== map?.sourceViewDigest) {
      findings.push(finding(CHAIN_CODES.DISTRIBUTION_DIGEST_MISMATCH, 'tickets-view', 'tickets.distribution.sourceViewDigest does not equal map.sourceViewDigest'));
    }
  }
  if (checkTickets && (!additiveEmpty || tickets?.distribution !== undefined)) {
    const ticketDigests = tickets?.distribution?.ticketDigests ?? {};
    if (tickets?.distribution?.digest !== digestValue({ ticketDigests })) {
      findings.push(finding(CHAIN_CODES.DISTRIBUTION_DIGEST_MISMATCH, 'tickets-aggregate', 'tickets aggregate digest does not match ticketDigests'));
    }
  }

  const viewUnits = new Set(collectViewUnits(view).keys());
  const mapUnits = new Set((map?.units ?? []).map((unit) => unit.unitId));
  const residualUnits = new Set((map?.residuals ?? []).map((residual) => residual.unit));
  compareUnitSets(new Set([...mapUnits, ...residualUnits]), viewUnits, 'view/map', findings);
  const graphUnits = new Set((graph?.nodes ?? []).flatMap((node) => node.unitIds ?? []));
  compareUnitSets(graphUnits, mapUnits, 'graph', findings);
  if (checkDirs) {
    const dirsUnits = new Set(Object.keys(dirsTree?.distribution?.units ?? {}));
    compareUnitSets(dirsUnits, graphUnits, 'dirs', findings);
  }

  const validResiduals = validOperationResiduals(artifact, map);
  const artifactScoped = (treeManifest?.inventory?.objects ?? []).length > 0;
  const declaredSequenceIdSet = declaredSequenceIds(view);
  if (artifact !== null) {
    for (const operation of activeArtifactOperationsForPackage(artifact, view?.packageId, treeManifest)) {
      const unitId = `op-${operation.id}`;
      if (viewUnits.has(unitId) || validResiduals.has(unitId)) continue;
      findings.push(finding(CHAIN_CODES.MISSING_OPERATION, unitId, `active operation ${unitId} is absent from the view and is not a valid suppliedRule residual`));
    }
    for (const sequence of artifactSequencesForPackage(artifact, view?.packageId, treeManifest)) {
      if (declaredSequenceIdSet.has(sequence.id)) continue;
      if (residualUnits.has(`seq-${sequence.id}`) || residualUnits.has(`xdir-${sequence.id}`)) continue;
      findings.push(finding(CHAIN_CODES.MISSING_SEQUENCE, `seq-${sequence.id}`, `sequence ${sequence.id} is absent from the view and is not a declared residual`));
    }
  }

  if (checkTickets) {
    const ticketUnits = new Set(allTickets(tickets).flatMap((ticket) => ticketUnitIds(ticket)));
    compareUnitSets(ticketUnits, graphUnits, 'tickets', findings);

    // Exactly one ticket implements an operation, across every phase. The per-phase check
    // cannot see a unit carried by nodes in two phases, so the package-global pass owns this.
    const implementersByUnit = new Map();
    for (const ticket of allTickets(tickets)) {
      for (const unit of ticket?.distribution?.units ?? []) {
        if (unit?.kind !== 'operation' || unit?.obligation?.mode !== 'implement') continue;
        const identities = implementersByUnit.get(unit.unitId) ?? [];
        identities.push(ticketIdentity(ticket));
        implementersByUnit.set(unit.unitId, identities);
      }
    }
    for (const [unitId, identities] of implementersByUnit) {
      if (identities.length > 1) {
        findings.push(finding(CHAIN_CODES.DUPLICATE_UNIT_AT_TICKET, unitId, `unit ${unitId} is implemented by ${identities.join(', ')}`));
      }
    }
    if (artifact !== null && artifactScoped) {
      for (const operation of activeArtifactOperationsForPackage(artifact, view?.packageId, treeManifest)) {
        const unitId = `op-${operation.id}`;
        if (validResiduals.has(unitId)) continue;
        requireImplementerForRole({ unitId, map, view, implementersByUnit, findings });
      }
    } else {
      for (const unitId of graphUnits) {
        if (!unitId.startsWith('op-')) continue;
        requireImplementerForRole({ unitId, map, view, implementersByUnit, findings });
      }
    }
  }

  const declared = artifact === null
    ? declaredStepsFromView(view)
    : artifactStepsForSequences(artifact, declaredSequenceIdSet);
  const stepBearing = viewStepBearing(view);

  // The artifact is the denominator in both directions. The loops below prove every
  // artifact step reached the view; this block proves the view added nothing.
  if (artifact !== null && Array.isArray(artifact.sequences)) {
    const artifactSequenceIds = new Set(
      (artifact.sequences ?? []).map((sequence) => sequence?.id).filter((id) => typeof id === 'string'),
    );
    const artifactStepIds = new Map();
    for (const step of Array.isArray(artifact.steps) ? artifact.steps : []) {
      if (!artifactSequenceIds.has(step?.sequence) || typeof step?.id !== 'string') continue;
      const ids = artifactStepIds.get(step.sequence) ?? new Set();
      ids.add(step.id);
      artifactStepIds.set(step.sequence, ids);
    }
    const viewSequenceUnitIds = new Map();
    for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
      for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
        if (typeof unit?.sequenceId === 'string' && typeof unit?.unitId === 'string') {
          viewSequenceUnitIds.set(unit.sequenceId, unit.unitId);
        }
      }
    }
    for (const unit of Array.isArray(view?.obligationUnits) ? view.obligationUnits : []) {
      const unitId = String(unit?.unitId ?? '');
      const isSequence = unit?.kind === 'sequence'
        || unit?.kind === 'cross-boundary-sequence'
        || unitId.startsWith('seq-')
        || unitId.startsWith('xdir-');
      if (!isSequence) continue;
      const sequenceId = typeof unit?.subject === 'string' ? unit.subject : unitId.replace(/^(seq|xdir)-/, '');
      if (sequenceId.length > 0 && !viewSequenceUnitIds.has(sequenceId)) viewSequenceUnitIds.set(sequenceId, unitId);
    }
    for (const sequenceId of declaredSequenceIdSet) {
      if (artifactSequenceIds.has(sequenceId)) continue;
      findings.push(finding(
        CHAIN_CODES.INVENTED_SEQUENCE,
        viewSequenceUnitIds.get(sequenceId) ?? `seq-${sequenceId}`,
        `sequence ${sequenceId} is declared by the view and absent from the artifact`,
      ));
    }
    const reportedSteps = new Set();
    for (const [sequenceId, records] of stepBearing) {
      if (!artifactSequenceIds.has(sequenceId)) continue;
      const expected = artifactStepIds.get(sequenceId) ?? new Set();
      for (const record of records) {
        for (const step of record.steps) {
          if (expected.has(step.stepId) || reportedSteps.has(step.stepId)) continue;
          reportedSteps.add(step.stepId);
          findings.push(finding(
            CHAIN_CODES.INVENTED_SEQUENCE_STEP,
            step.stepId,
            `sequence ${sequenceId} step ${step.stepId} is declared by the view and absent from the artifact`,
          ));
        }
      }
    }
  }

  const viewSteps = new Map();
  for (const records of stepBearing.values()) {
    for (const record of records) {
      for (const step of record.steps) {
        if (!viewSteps.has(step.stepId)) viewSteps.set(step.stepId, step);
      }
    }
  }
  const observedTickets = new Map();
  if (checkTickets) {
    for (const ticket of allTickets(tickets)) {
      for (const unit of ticket?.distribution?.units ?? []) {
        for (const step of unit?.obligation?.steps ?? []) {
          const entry = observedTickets.get(step.stepId) ?? { ticketIds: new Set(), steps: [], occurrences: 0 };
          entry.ticketIds.add(ticket.id);
          entry.steps.push(step);
          entry.occurrences += 1;
          observedTickets.set(step.stepId, entry);
        }
      }
    }
  }

  for (const [sequenceId, steps] of declared) {
    if (artifact !== null) {
      const records = stepBearing.get(sequenceId) ?? [];
      const carried = new Set(records.flatMap((record) => record.steps.map((step) => step.stepId)));
      for (const step of steps) {
        if (!carried.has(step.id)) {
          findings.push(finding(CHAIN_CODES.SEQUENCE_STEPS_UNDISTRIBUTED, step.id, `sequence ${sequenceId} step ${step.id} has no step-bearing view record`));
        }
        const viewStep = viewSteps.get(step.id);
        if (step.record !== undefined && viewStep !== undefined && !stepIdentityMatches(step.record, viewStep)) {
          const code = stepContractMatches(step.record, viewStep)
            ? CHAIN_CODES.STEP_IDENTITY_MISMATCH
            : CHAIN_CODES.STEP_CONTRACT_MISMATCH;
          const message = code === CHAIN_CODES.STEP_CONTRACT_MISMATCH
            ? `sequence ${sequenceId} artifact step contract differs from the view step`
            : `sequence ${sequenceId} artifact step identity differs from the view step`;
          findings.push(finding(code, step.id, message));
        }
      }
    }
    if (!checkTickets) continue;
    for (const step of steps) {
      const observed = observedTickets.get(step.id);
      if (observed === undefined) {
        // A cross-boundary sequence carries the other package's steps too. Only the
        // operation this package's graph owns can be owed by this package's tickets.
        if (graphUnits.has(`op-${step.operationId}`)) {
          findings.push(finding(CHAIN_CODES.TICKET_STEP_MISSING, step.id, `sequence ${sequenceId} step ${step.id} reaches no ticket`));
        }
        continue;
      }
      if (observed.ticketIds.size > 1 || observed.occurrences > 1) {
        findings.push(finding(CHAIN_CODES.DUPLICATE_SEQUENCE_STEP, step.id, `step ${step.id} appears ${observed.occurrences} time(s) in tickets ${[...observed.ticketIds].join(',')}`));
      }
    }
  }

  if (checkTickets) {
    const reported = new Set();
    for (const [stepId, observed] of observedTickets) {
      const viewStep = viewSteps.get(stepId);
      if (viewStep === undefined) continue;
      for (const ticketStep of observed.steps) {
        if (stepIdentityMatches(ticketStep, viewStep) || reported.has(stepId)) continue;
        reported.add(stepId);
        const code = stepContractMatches(ticketStep, viewStep)
          ? CHAIN_CODES.STEP_IDENTITY_MISMATCH
          : CHAIN_CODES.STEP_CONTRACT_MISMATCH;
        const message = code === CHAIN_CODES.STEP_CONTRACT_MISMATCH
          ? `ticket step contract differs from the view step`
          : `ticket step identity differs from the view step`;
        findings.push(finding(code, stepId, message));
      }
    }
  }

  if (checkTickets) {
    for (const ticket of allTickets(tickets)) {
      for (const unit of ticket?.distribution?.units ?? []) {
        const steps = unit?.obligation?.steps ?? [];
        if (steps.length === 0) continue;
        const declaredForSequence = declared.get(unit.unitId.replace(/^(seq|xdir)-/, '')) ?? [];
        const observed = steps.slice().sort((left, right) => (left.order ?? 0) - (right.order ?? 0)).map((step) => step.stepId);
        const observedSet = new Set(observed);
        const expected = declaredForSequence.filter((step) => observedSet.has(step.id)).map((step) => step.id);
        if (observed.join(',') !== expected.join(',')) {
          findings.push(finding(CHAIN_CODES.SEQUENCE_ORDER_MISMATCH, `ticket-${ticket.id}`, `sequence ${unit.unitId} reconstructs as ${observed.join(' -> ')} and is declared as ${expected.join(' -> ')}`));
        }
      }
    }
  }

  // The recorded order check above compares the copied order fields with the view. This
  // check compares the ticket placement itself: a package's local steps must appear in the
  // artifact order across the tickets that implement them. A foreign step is excluded: the
  // other package's Tickets.json is not visible here, and build order is not runtime order.
  if (checkTickets) {
    const placementByStep = new Map();
    for (const [phaseIndex, phase] of (tickets?.phases ?? []).entries()) {
      for (const [ticketIndex, ticket] of (phase?.tickets ?? []).entries()) {
        for (const unit of ticket?.distribution?.units ?? []) {
          for (const step of unit?.obligation?.steps ?? []) {
            if (typeof step?.stepId !== 'string' || placementByStep.has(step.stepId)) continue;
            placementByStep.set(step.stepId, { phaseIndex, ticketIndex });
          }
        }
      }
    }
    for (const [sequenceId, steps] of declared) {
      const local = steps.filter((step) => graphUnits.has(`op-${step.operationId}`) && placementByStep.has(step.id));
      for (let index = 0; index + 1 < local.length; index += 1) {
        const left = placementByStep.get(local[index].id);
        const right = placementByStep.get(local[index + 1].id);
        const inverted = left.phaseIndex > right.phaseIndex
          || (left.phaseIndex === right.phaseIndex && left.ticketIndex > right.ticketIndex);
        if (!inverted) continue;
        findings.push(finding(
          CHAIN_CODES.SEQUENCE_ORDER_MISMATCH,
          `seq-${sequenceId}`,
          `sequence ${sequenceId} places ${local[index].id} after ${local[index + 1].id} in (phase,ticket) order`,
        ));
        break;
      }
    }
  }

  const viewUnitRecords = collectViewUnits(view);
  for (const row of registryRowsForPackage(registry, view?.packageId)) {
    const ctrUnit = `ctr-${row.boundary_id}`;
    const viewRecord = viewUnitRecords.get(ctrUnit)?.record;
    if (viewRecord === undefined) {
      findings.push(finding(CHAIN_CODES.MISSING_BOUNDARY_CONTRACT, ctrUnit, `registry boundary ${row.boundary_id} has no ctr unit in the view`));
      continue;
    }
    const ctrNodes = (graph?.nodes ?? []).filter((node) => (node.unitIds ?? []).includes(ctrUnit));
    if (ctrNodes.length === 0) {
      findings.push(finding(CHAIN_CODES.MISSING_BOUNDARY_CONTRACT, ctrUnit, `registry boundary ${row.boundary_id} has no graph node`));
      continue;
    }
    const directions = directionsFor(view, ctrUnit);
    const edge = carryingEdgeFor(graph, ctrNodes, row, { direction: directions[0] ?? null });
    if (edge === undefined) {
      findings.push(finding(CHAIN_CODES.MISSING_BOUNDARY_CONTRACT, ctrUnit, `registry boundary ${row.boundary_id} has no graph edge`));
      continue;
    }
    if (edge === null) {
      findings.push(finding(CHAIN_CODES.AMBIGUOUS_BOUNDARY_EDGE, ctrUnit, `boundary ${row.boundary_id} has more than one candidate edge`));
      continue;
    }
    const note = parseBoundaryNoteRows(edge.attributes?.note);
    const edgeKey = `${edge.from}→${edge.to}(${edge.type})`;
    const namedRows = note === null ? [] : boundaryRowsFromNote(note, registry, sidecarPath, edgeKey);
    const noteResolves = note !== null
      && namedRows !== null
      && namedRows.some((candidate) => candidate.boundary_id === row.boundary_id);
    if (!noteResolves || note.digest !== combinedBoundaryDigest(namedRows)) {
      findings.push(finding(CHAIN_CODES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `graph edge note does not carry the registry id and clause digest for ${row.boundary_id}`));
    }
    if (!(edge.contracts ?? []).some((contract) => projectionMatches(contract, row))) {
      findings.push(finding(CHAIN_CODES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `graph edge contract does not match the registry projection for ${row.boundary_id}`));
    }
    for (const direction of directions) {
      const directionEdge = carryingEdgeFor(graph, ctrNodes, row, { direction });
      if (directionEdge === undefined || directionEdge === null) {
        findings.push(finding(CHAIN_CODES.BOUNDARY_DIRECTION_MISMATCH, ctrUnit, `boundary ${row.boundary_id} has no unambiguous edge for direction ${direction}`));
        continue;
      }
      const ctrOnFrom = ctrNodes.some((node) => node.id === directionEdge.from);
      if (direction === 'provides' && !ctrOnFrom) {
        findings.push(finding(CHAIN_CODES.BOUNDARY_DIRECTION_MISMATCH, ctrUnit, `boundary ${row.boundary_id} is provided but the ctr node is not the edge source`));
      }
      if (direction === 'consumes' && ctrOnFrom) {
        findings.push(finding(CHAIN_CODES.BOUNDARY_DIRECTION_MISMATCH, ctrUnit, `boundary ${row.boundary_id} is consumed but the ctr node is the edge source`));
      }
    }
    if (checkTickets) {
      const carryingTickets = allTickets(tickets).filter((ticket) => ticketUnitIds(ticket).includes(ctrUnit));
      for (const ticket of carryingTickets) {
        const contract = ticketBoundaryContract(ticket, row);
        if (contract === undefined) {
          findings.push(finding(CHAIN_CODES.MISSING_BOUNDARY_CONTRACT, `${row.boundary_id}/ticket-${ticket.id}`, `ticket ${ticket.id} carries ${ctrUnit} without the registry contract`));
          continue;
        }
        if (contract.clauseDigest !== boundaryClauseDigest(row) || !projectionMatches(contract, row)) {
          findings.push(finding(CHAIN_CODES.BOUNDARY_CONTRACT_MISMATCH, `${row.boundary_id}/ticket-${ticket.id}`, `ticket ${ticket.id} contract does not match the registry projection`));
        }
      }
    }
  }

  const steppedOperations = new Set((artifact?.steps ?? []).map((step) => `op-${step.operation}`));
  for (const operation of artifact?.operations ?? []) {
    if (operation?.disposition !== 'active') continue;
    const unitId = `op-${operation.id}`;
    if (!residualUnits.has(unitId)) continue;
    const suppliedRule = operation.position === 'suppliedRule'
      && operation.grounding?.classification === 'designer_supplied'
      && !steppedOperations.has(unitId);
    if (!suppliedRule) {
      findings.push(finding(CHAIN_CODES.ACTIVE_OPERATION_RESIDUAL, unitId, `active operation ${unitId} is a declared residual without the suppliedRule/designer_supplied/zero-step disposition`));
    }
  }

  return { ok: findings.length === 0, findings };
}

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function readJson(filePath) {
  return filePath !== null && existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf8')) : null;
}

/** The single root `*-sequences.json`, or null when absent or ambiguous. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function findRootArtifact(packagePath) {
  const allocateManifest = findAllocateManifest(packagePath);
  return allocateManifest === null ? null : findSingleSiblingPath(dirname(allocateManifest), '-sequences.json');
}

/**
 * CLI entry point. The stage decides which layers must exist: graphify checks view/map/
 * graph, boundify adds the Dirs-Tree, split adds the tickets. `--require-tickets` turns a
 * missing Tickets.json into a failure at the post-5-2 gate.
 */
// [::TICKET::] PX-312, PX-313, PX-315, PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-315|PX-316) --for-spec --no-implementation-order`.
// [::TICKET::] PX-334 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-334 --for-spec --no-implementation-order`.
export function main(argv = process.argv.slice(2)) {
  const stage = argumentFor(argv, 'stage') ?? 'split';
  const packagePath = argumentFor(argv, 'package') ?? '.';
  const preflight = argv.includes('--preflight');
  const viewPath = argumentFor(argv, 'view') ?? join(packagePath, 'SEQUENCES.json');
  const graphPath = argumentFor(argv, 'graph') ?? findSingleSiblingPath(packagePath, '-GRAPH.json');
  const dirsPath = argumentFor(argv, 'dirs-tree') ?? findSingleSiblingPath(packagePath, '-Dirs-Tree.json');
  const ticketsPath = argumentFor(argv, 'tickets') ?? join(packagePath, 'Tickets.json');
  const sidecarPath = argumentFor(argv, 'sidecar')
    ?? (graphPath === null ? null : join(dirname(graphPath), 'RFC-BOUNDARY-CONTRACTS.json'));
  const inWorkspace = findAllocateManifest(packagePath) !== null;
  const registryPath = argumentFor(argv, 'registry') ?? findAllocateManifest(packagePath);
  const artifactPath = argumentFor(argv, 'artifact') ?? findRootArtifact(packagePath);
  const requireTickets = argv.includes('--require-tickets');

  if (inWorkspace && (artifactPath === null || artifactPath === '' || !existsSync(artifactPath))) {
    console.error('[ERROR] MISSING_SIDECAR: the workspace has an allocate manifest, and the root *-sequences.json is missing, empty or unreadable');
    return 1;
  }
  if (inWorkspace && (registryPath === null || registryPath === '' || !existsSync(registryPath))) {
    console.error('[ERROR] MISSING_REGISTRY: the workspace has an allocate manifest, and the contract_registry is missing, empty or unreadable');
    return 1;
  }

  const view = readJson(viewPath);
  const graph = readJson(graphPath);
  // The graph names its source. A package whose RFC is not literally RFC.md must still
  // resolve the distribution map without the caller repeating the path.
  const sourceFile = typeof graph?.sourceFile === 'string' && graph.sourceFile.length > 0 ? graph.sourceFile : null;
  // The sourceFile may be absolute, package-relative, or relative to the directory the
  // command was invoked from. Choose the first candidate that exists; the package-local
  // RFC.md remains the final legacy fallback.
  const mapCandidates = [];
  if (sourceFile !== null) {
    if (isAbsolute(sourceFile)) mapCandidates.push(sourceFile);
    mapCandidates.push(resolve(packagePath, sourceFile));
    if (graphPath !== null) mapCandidates.push(resolve(dirname(graphPath), basename(sourceFile)));
  }
  mapCandidates.push(join(packagePath, 'RFC.md'));
  const defaultMapPath = mapCandidates.find((candidate) => existsSync(candidate)) ?? mapCandidates[mapCandidates.length - 1];
  const rfcPath = argumentFor(argv, 'map') ?? defaultMapPath;
  const rfcText = rfcPath !== null && existsSync(rfcPath) ? readFileSync(rfcPath, 'utf8') : null;
  const map = rfcText === null ? null : readDistributionMap(rfcText);
  const dirsTree = readJson(dirsPath);
  const tickets = readJson(ticketsPath);
  const registry = registryPath === null ? [] : (readJson(registryPath)?.contract_registry ?? []);
  const treeManifest = registryPath === null
    ? null
    : readJson(join(dirname(registryPath), 'WORKSPACIFY-TREE-MANIFEST.json'));
  const artifact = artifactPath === null ? null : readJson(artifactPath);

  const additiveEmpty = view !== null && isAdditiveEmptyDistribution(view, map);
  if (view === null || graph === null || (map === null && !additiveEmpty)) {
    console.error('[ERROR] MISSING_LAYER: view, map and graph are required');
    return 1;
  }
  if (stage !== 'graphify' && !preflight && dirsTree === null) {
    console.error('[ERROR] MISSING_LAYER: Dirs-Tree is required for this stage');
    return 1;
  }
  if (stage === 'split' && requireTickets && tickets === null) {
    console.error('[ERROR] MISSING_LAYER: Tickets.json is required after 5-2');
    return 1;
  }

  // The view is only as complete as the smooth verdict that proved it. The receipt is
  // workspace-level, so a package graphify's Step 0 heading dedup does not invalidate the
  // next package's gate; a smooth rerun changes the status digest and does.
  const smoothFindings = inWorkspace ? verifySmoothReceipt(packagePath) : [];
  const result = verifyChain({ view, map, graph, dirsTree, tickets, registry, artifact, treeManifest, stage, preflight, sidecarPath });
  const findings = [...smoothFindings, ...result.findings];
  for (const entry of findings) console.error(`${entry.code}: ${entry.subject ?? ''} ${entry.message}`);
  process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, findings })}\n`);
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
