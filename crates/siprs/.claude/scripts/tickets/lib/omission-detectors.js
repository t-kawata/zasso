'use strict';

/**
 * PX-406 — the omission detector registry and surface enumeration.
 *
 * The registry is data, not code: a detector is a named runner over one or more
 * surfaces. The evaluator resolves each enumerated surface to mechanical,
 * judgment or notApplicable; a missing mechanical detector is a finding, and a
 * notMeasured detector never counts as a pass.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REGISTRY_FILE_NAME = 'omission-detectors.json';
const REGISTRY_VERSION = 1;

/** Read and parse a JSON file, returning null when it is absent. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    error.code = 'UNREADABLE_ARTIFACT';
    throw error;
  }
}

/** Validate one registry document. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function validateRegistry(document) {
  if (!document || document.version !== REGISTRY_VERSION) {
    throw new Error('omission-detectors.json must declare version ' + REGISTRY_VERSION);
  }
  if (!Array.isArray(document.detectors) || document.detectors.length === 0) {
    throw new Error('omission-detectors.json must declare at least one detector');
  }
  for (const detector of document.detectors) {
    if (typeof detector.id !== 'string' || detector.id.length === 0) {
      throw new Error('every detector needs a non-empty id');
    }
    if (!['mechanical', 'judgment'].includes(detector.kind)) {
      throw new Error('detector ' + detector.id + ' has an unknown kind');
    }
    if (!Array.isArray(detector.surfaces) || detector.surfaces.length === 0) {
      throw new Error('detector ' + detector.id + ' names no surface');
    }
  }
  return document;
}

/**
 * Load the registry. A fixture may carry its own copy; otherwise the bundled
 * registry is the authority.
 */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function loadRegistry({ cwd = null, registryPath = null } = {}) {
  const candidates = [
    registryPath,
    cwd === null ? null : path.join(cwd, REGISTRY_FILE_NAME),
    path.join(__dirname, '..', REGISTRY_FILE_NAME),
  ].filter((candidate) => typeof candidate === 'string');

  for (const candidate of candidates) {
    const document = readJsonIfPresent(candidate);
    if (document !== null) return validateRegistry(document);
  }
  throw new Error('omission-detectors.json not found');
}

/** The public key of a ticket. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function ticketKeyOf(ticket) {
  const phaseId = ticket?.phaseId ?? -1;
  return phaseId === -1 ? 'PX-' + ticket.id : 'P' + phaseId + '-' + ticket.id;
}

/** Collect a surface once, keeping the first occurrence. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function surfaceCollector() {
  const byKey = new Map();
  return {
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
    add(surface, assetId, extra = {}) {
      if (typeof assetId !== 'string' || assetId.length === 0) return;
      const key = surface + '|' + assetId;
      if (!byKey.has(key)) byKey.set(key, { surface, assetId, ...extra });
    },
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
    values() {
      return [...byKey.values()].sort((left, right) => (left.surface + '|' + left.assetId).localeCompare(right.surface + '|' + right.assetId));
    },
  };
}

/**
 * Enumerate the finite inspection universe from the artifacts on disk.
 *
 * The enumeration is from the canon, not from the detector list: a surface that
 * no detector knows still appears, and the coverage evaluator reports it.
 */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function enumerateSurfaces({ cwd, ticketsPath = null, stubs = [] } = {}) {
  const collector = surfaceCollector();
  const ticketsFile = ticketsPath || path.join(cwd, 'Tickets.json');
  const tickets = readJsonIfPresent(ticketsFile);

  for (const phase of tickets?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const ticketKey = ticketKeyOf({ ...ticket, phaseId: ticket.phaseId ?? phase.id });
      collector.add('ticket', ticketKey, { ticketKey });
      for (const contract of ticket.contracts ?? []) collector.add('contract', contract.id, { ticketKey });
      (ticket.acceptanceCriteria ?? []).forEach((criterion, index) => collector.add('acceptance', ticketKey + '/acceptance[' + index + ']', { ticketKey }));
      for (const unitId of ticket.nodeIds ?? []) collector.add('unit', unitId, { ticketKey });
      for (const file of ticket.default_files ?? []) collector.add('file', file, { ticketKey });
      for (const unit of ticket.distribution?.units ?? []) {
        const unitId = unit.unitId ?? unit.operationId;
        if (unitId) {
          collector.add('unit', unitId, { ticketKey });
          collector.add('operation', unitId, { ticketKey });
        }
      }
      for (const obligation of ticket.formulaObligations ?? []) {
        const formulaId = obligation.id ?? obligation.formulaId;
        if (formulaId) collector.add('formula', formulaId, { ticketKey });
      }
    }
  }

  const graph = readJsonIfPresent(path.join(cwd, 'RFC-GRAPH.json'));
  for (const node of graph?.nodes ?? []) collector.add('graph-node', node.id, {});
  for (const edge of graph?.edges ?? []) collector.add('graph-edge', edge.id ?? edge.from + '->' + edge.to, {});

  const dirsTree = readJsonIfPresent(path.join(cwd, 'RFC-Dirs-Tree.json'));
  for (const directory of dirsTree?.directories ?? []) collector.add('dirs-tree', directory.path, {});
  for (const file of dirsTree?.files ?? []) collector.add('dirs-tree', file.path, {});

  const sequences = readJsonIfPresent(path.join(cwd, 'SEQUENCES.json'));
  for (const sequence of sequences?.sequences ?? []) {
    for (const step of sequence.steps ?? []) collector.add('sequence-step', step.id ?? sequence.id + ':' + step.operation, {});
  }
  for (const boundary of sequences?.boundaries ?? []) collector.add('boundary', boundary.id, {});

  const formulas = readJsonIfPresent(path.join(cwd, 'RFC-FORMULAS.json'));
  for (const formula of formulas?.formulas ?? []) collector.add('formula', formula.id, {});

  for (const stub of stubs) collector.add('stub', stub.file + ':' + stub.line, {});

  return collector.values();
}

/**
 * Evaluate the registry against the enumerated surfaces.
 *
 * A surface requirement of `mechanical` is satisfied only by a mechanical
 * detector; a judgment detector cannot substitute for one. `notMeasured` is
 * reported and makes `ok` false.
 */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function evaluateCoverage({ registry, surfaces, measurements = {} }) {
  const findings = [];
  const notMeasured = [];
  const measured = [];

  const decorated = surfaces.map((surface) => {
    const detectors = registry.detectors.filter((detector) => detector.surfaces.includes(surface.surface));
    const mechanical = detectors.filter((detector) => detector.kind === 'mechanical');
    const judgment = detectors.filter((detector) => detector.kind === 'judgment');
    const requirement = registry.surfaceRequirements?.[surface.surface] ?? 'mechanical';
    const notApplicable = registry.notApplicable?.[surface.surface + ':' + surface.assetId]
      ?? registry.notApplicable?.[surface.surface];

    let coveredBy = null;
    if (notApplicable) {
      coveredBy = 'notApplicable';
    } else if (requirement === 'mechanical') {
      coveredBy = mechanical.length > 0 ? 'mechanical' : null;
    } else if (requirement === 'judgment') {
      coveredBy = judgment.length > 0 ? 'judgment' : null;
    } else {
      coveredBy = mechanical.length > 0 ? 'mechanical' : (judgment.length > 0 ? 'judgment' : null);
    }

    if (coveredBy === null) {
      findings.push({
        code: 'SURFACE_UNCOVERED',
        surface: surface.surface,
        assetId: surface.assetId,
        problem: 'no ' + requirement + ' detector covers this surface',
        fixes: [],
        rerun: 'add a detector to omission-detectors.json',
      });
    }

    return {
      ...surface,
      coveredBy,
      detectors: detectors.map((detector) => detector.id),
    };
  });

  for (const [id, status] of Object.entries(measurements)) {
    if (status === 'notMeasured' || status === 'blocked') notMeasured.push(id);
    else measured.push(id);
  }

  return {
    version: registry.version,
    surfaces: decorated,
    findings,
    notMeasured,
    measured,
    ok: findings.length === 0 && notMeasured.length === 0,
  };
}

/** The judgment obligations the AI must adjudicate for the enumerated surfaces. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function judgmentObligations({ registry, surfaces }) {
  const obligations = [];
  for (const surface of surfaces) {
    for (const detector of registry.detectors) {
      if (detector.kind !== 'judgment' || !detector.surfaces.includes(surface.surface)) continue;
      obligations.push({
        surface: surface.surface,
        assetId: surface.assetId,
        criterion: detector.criterion,
        detector: detector.id,
        obligation: detector.obligation,
        ticketKey: surface.ticketKey ?? null,
      });
    }
  }
  return obligations;
}

/** The synthetic fixture the calibration controls run against. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function createSyntheticFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px406-calibration-'));
  const writeJson = (filePath, value) => fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  writeJson(path.join(root, 'Tickets.json'), {
    title: 'omission calibration',
    round: 1,
    metadata: {},
    phases: [{
      id: 0,
      name: 'P0',
      tickets: [
        {
          id: 1,
          phaseId: 0,
          status: 'todo',
          title: 'save path',
          contracts: [{ id: 'C001', precondition: 'value is present', postcondition: 'value is saved', invariant: 'value is unchanged' }],
          acceptanceCriteria: ['the result is saved'],
          testUnit: ['UT: C001 saves the result', 'UT: the result is saved'],
          testIntegration: [],
          nodeIds: ['u-1'],
          default_files: ['src/a.js'],
          distribution: { units: [{ unitId: 'u-1', obligation: { mode: 'implement' } }] },
          formulaObligations: [{ id: 'fx-000000000000' }],
          prerequisites: [],
        },
        {
          id: 2,
          phaseId: 0,
          status: 'todo',
          title: 'error path',
          contracts: [{ id: 'C002', precondition: 'value is invalid', postcondition: 'an error is returned', invariant: 'value is unchanged' }],
          acceptanceCriteria: ['the error is returned'],
          testUnit: ['UT: C002 returns the error', 'UT: the error is returned'],
          testIntegration: [],
          nodeIds: ['u-2'],
          default_files: ['src/b.js'],
          distribution: { units: [{ unitId: 'u-2', obligation: { mode: 'implement' } }] },
          formulaObligations: [],
          prerequisites: [],
        },
      ],
    }],
  });
  writeJson(path.join(root, 'RFC-GRAPH.json'), {
    nodes: [{ id: 'N0001', title: 'node' }],
    edges: [{ from: 'N0001', to: 'N0001', kind: 'depends' }],
  });
  writeJson(path.join(root, 'RFC-Dirs-Tree.json'), {
    directories: [{ path: 'src' }],
    files: [{ path: 'src/a.js' }],
  });
  writeJson(path.join(root, 'SEQUENCES.json'), {
    sequences: [{ id: 'S1', steps: [{ id: 'S1-1', operation: 'op-1' }] }],
    boundaries: [{ id: 'b1' }],
  });
  writeJson(path.join(root, 'RFC-FORMULAS.json'), { version: 1, formulas: [{ id: 'fx-000000000000' }] });
  fs.writeFileSync(path.join(root, 'src/a.js'), 'function save(value) {\n  return value;\n}\n');
  fs.writeFileSync(path.join(root, 'src/b.js'), 'function fail(value) {\n  return value;\n}\n');
  return root;
}

/** Remove a synthetic fixture. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function removeSyntheticFixture(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

module.exports = {
  REGISTRY_FILE_NAME,
  REGISTRY_VERSION,
  createSyntheticFixture,
  enumerateSurfaces,
  evaluateCoverage,
  judgmentObligations,
  loadRegistry,
  readJsonIfPresent,
  removeSyntheticFixture,
  ticketKeyOf,
  validateRegistry,
};
