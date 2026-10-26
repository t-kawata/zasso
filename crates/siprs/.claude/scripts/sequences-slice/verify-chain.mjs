/**
 * The one read-only verifier that proves the distribution chain is the same object at
 * every layer: the package view, the RFC distribution map, the graph, the Dirs-Tree and
 * the tickets. It never writes; every producer keeps its own write path.
 *
 * The verifier is used by graphify as an admission gate, by boundify as a preflight, and
 * by split before and after ticket authoring. A layer that copies a digest but drops a
 * unit, a step, a boundary contract or a direction is named, not silently accepted.
 */
import { collectViewUnits, mapDigest, viewDigest } from './lib/distribution-map.mjs';
import { digestValue } from './lib/digest.mjs';
import { readDistributionMap } from '../rfc-graph/lib/unit-ids.mjs';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { findAllocateManifest, findSingleSiblingPath } = require('../lib/package-artifacts.js');
import {
  boundaryClauseDigest,
  boundaryNoteForRows,
  parseBoundaryNoteRows,
  projectionMatches,
} from './lib/boundary-contract.mjs';

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
  ACTIVE_OPERATION_RESIDUAL: 'ACTIVE_OPERATION_RESIDUAL',
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
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function viewStepBearing(view) {
  const bySequence = new Map();
  for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
    for (const unit of view?.[field] ?? []) {
      if (typeof unit?.sequenceId !== 'string') continue;
      const records = bySequence.get(unit.sequenceId) ?? [];
      records.push({ unitId: unit.unitId, steps: Array.isArray(unit.steps) ? unit.steps : [] });
      bySequence.set(unit.sequenceId, records);
    }
  }
  return bySequence;
}

/** The ordered artifact steps of one sequence. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function artifactStepsBySequence(artifact) {
  const bySequence = new Map();
  for (const step of artifact?.steps ?? []) {
    const steps = bySequence.get(step.sequence) ?? [];
    steps.push({ id: step.id, operationId: step.operation, order: step.order ?? step.line ?? 0 });
    bySequence.set(step.sequence, steps);
  }
  for (const steps of bySequence.values()) {
    steps.sort((left, right) => left.order - right.order);
  }
  return bySequence;
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

/** The graph edge that touches one node, or undefined. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function edgeTouching(graph, nodeId) {
  return (graph?.edges ?? []).find((edge) => edge.from === nodeId || edge.to === nodeId);
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

/**
 * Verify the chain.
 *
 * @param {{ view: object, map: object, graph: object, dirsTree: object, tickets: object, registry?: Array<object>, artifact?: object|null }} input
 * @returns {{ ok: boolean, findings: Array<{ code: string, subject: string|null, message: string }> }}
 */
export function verifyChain({ view, map, graph, dirsTree, tickets, registry = [], artifact = null, stage = 'split' } = {}) {
  const findings = [];
  const checkDirs = stage !== 'graphify' && dirsTree !== undefined && dirsTree !== null;
  const checkTickets = stage === 'split' && tickets !== undefined && tickets !== null;

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
  if (checkTickets) {
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
  if (checkTickets) {
    const ticketUnits = new Set(allTickets(tickets).flatMap((ticket) => ticketUnitIds(ticket)));
    compareUnitSets(ticketUnits, graphUnits, 'tickets', findings);
  }

  const declared = artifact === null ? declaredStepsFromView(view) : artifactStepsBySequence(artifact);
  const stepBearing = viewStepBearing(view);
  const observedTickets = new Map();
  if (checkTickets) {
    for (const ticket of allTickets(tickets)) {
      for (const unit of ticket?.distribution?.units ?? []) {
        for (const step of unit?.obligation?.steps ?? []) {
          const entry = observedTickets.get(step.stepId) ?? { ticketIds: new Set(), steps: [] };
          entry.ticketIds.add(ticket.id);
          entry.steps.push(step);
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
      }
    }
    if (!checkTickets) continue;
    for (const step of steps) {
      const observed = observedTickets.get(step.id);
      if (observed === undefined) {
        findings.push(finding(CHAIN_CODES.TICKET_STEP_MISSING, step.id, `sequence ${sequenceId} step ${step.id} reaches no ticket`));
        continue;
      }
      if (observed.ticketIds.size > 1) {
        findings.push(finding(CHAIN_CODES.DUPLICATE_SEQUENCE_STEP, step.id, `step ${step.id} appears in tickets ${[...observed.ticketIds].join(',')}`));
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

  const viewUnitRecords = collectViewUnits(view);
  for (const row of registry ?? []) {
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
    const edge = ctrNodes.map((node) => edgeTouching(graph, node.id)).find((candidate) => candidate !== undefined);
    if (edge === undefined) {
      findings.push(finding(CHAIN_CODES.MISSING_BOUNDARY_CONTRACT, ctrUnit, `registry boundary ${row.boundary_id} has no graph edge`));
      continue;
    }
    const note = parseBoundaryNoteRows(edge.attributes?.note);
    const namedRows = note === null
      ? []
      : note.ids.map((boundaryId) => (registry ?? []).find((candidate) => candidate.boundary_id === boundaryId));
    const noteResolves = note !== null
      && note.ids.includes(row.boundary_id)
      && namedRows.every((candidate) => candidate !== undefined);
    if (!noteResolves || note.digest !== boundaryNoteForRows(namedRows).split('digest:')[1]) {
      findings.push(finding(CHAIN_CODES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `graph edge note does not carry the registry id and clause digest for ${row.boundary_id}`));
    }
    if (!(edge.contracts ?? []).some((contract) => projectionMatches(contract, row))) {
      findings.push(finding(CHAIN_CODES.BOUNDARY_CONTRACT_MISMATCH, ctrUnit, `graph edge contract does not match the registry projection for ${row.boundary_id}`));
    }
    const direction = viewRecord.direction;
    if (edge.attributes?.bidirectional !== true && direction !== undefined) {
      const ctrOnFrom = ctrNodes.some((node) => node.id === edge.from);
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

  for (const operation of artifact?.operations ?? []) {
    if (operation?.disposition !== 'active') continue;
    const unitId = `op-${operation.id}`;
    if (!residualUnits.has(unitId)) continue;
    const suppliedRule = operation.position === 'suppliedRule'
      && operation.grounding?.classification === 'designer_supplied';
    if (!suppliedRule) {
      findings.push(finding(CHAIN_CODES.ACTIVE_OPERATION_RESIDUAL, unitId, `active operation ${unitId} is a declared residual without the suppliedRule/designer_supplied disposition`));
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
export function main(argv = process.argv.slice(2)) {
  const stage = argumentFor(argv, 'stage') ?? 'split';
  const packagePath = argumentFor(argv, 'package');
  if (packagePath === null) {
    console.error('[ERROR] --package=<package-directory> is required');
    return 2;
  }
  const viewPath = argumentFor(argv, 'view') ?? join(packagePath, 'SEQUENCES.json');
  const rfcPath = argumentFor(argv, 'map') ?? join(packagePath, 'RFC.md');
  const graphPath = argumentFor(argv, 'graph') ?? findSingleSiblingPath(packagePath, '-GRAPH.json');
  const dirsPath = argumentFor(argv, 'dirs-tree') ?? findSingleSiblingPath(packagePath, '-Dirs-Tree.json');
  const ticketsPath = argumentFor(argv, 'tickets') ?? join(packagePath, 'Tickets.json');
  const registryPath = argumentFor(argv, 'registry') ?? findAllocateManifest(packagePath);
  const artifactPath = argumentFor(argv, 'artifact') ?? findRootArtifact(packagePath);
  const requireTickets = argv.includes('--require-tickets');

  const view = readJson(viewPath);
  const rfcText = rfcPath !== null && existsSync(rfcPath) ? readFileSync(rfcPath, 'utf8') : null;
  const map = rfcText === null ? null : readDistributionMap(rfcText);
  const graph = readJson(graphPath);
  const dirsTree = readJson(dirsPath);
  const tickets = readJson(ticketsPath);
  const registry = registryPath === null ? [] : (readJson(registryPath)?.contract_registry ?? []);
  const artifact = artifactPath === null ? null : readJson(artifactPath);

  if (view === null || map === null || graph === null) {
    console.error('[ERROR] MISSING_LAYER: view, map and graph are required');
    return 1;
  }
  if (stage !== 'graphify' && dirsTree === null) {
    console.error('[ERROR] MISSING_LAYER: Dirs-Tree is required for this stage');
    return 1;
  }
  if (stage === 'split' && requireTickets && tickets === null) {
    console.error('[ERROR] MISSING_LAYER: Tickets.json is required after 5-2');
    return 1;
  }

  const result = verifyChain({ view, map, graph, dirsTree, tickets, registry, artifact, stage });
  for (const entry of result.findings) console.error(`${entry.code}: ${entry.subject ?? ''} ${entry.message}`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
