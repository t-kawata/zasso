'use strict';

/**
 * PX-407 — the omission detector registry, artifact status and surface enumeration.
 *
 * The inspection universe is enumerated from the canon, not from the detector
 * list. A required artifact family that is absent is reported as notMeasured; it
 * is never silently removed from the universe.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const REGISTRY_FILE_NAME = 'omission-detectors.json';
const REGISTRY_VERSION = 2;
const SUPPORTED_REGISTRY_VERSIONS = new Set([1, 2]);

/** The sixteen surface families the gate must account for. */
const REQUIRED_SURFACE_FAMILIES = Object.freeze([
  'spec', 'rfc', 'graph-node', 'graph-edge', 'dirs-tree', 'ticket', 'contract',
  'acceptance', 'operation', 'sequence-step', 'boundary', 'unit', 'formula',
  'file', 'stub', 'danger',
]);

/** The artifact each family is read from. */
const FAMILY_ARTIFACT = Object.freeze({
  spec: 'spec',
  rfc: 'rfc',
  'graph-node': 'graph',
  'graph-edge': 'graph',
  'dirs-tree': 'dirs-tree',
  ticket: 'tickets',
  contract: 'tickets',
  acceptance: 'tickets',
  operation: 'tickets',
  'sequence-step': 'sequences',
  boundary: 'sequences',
  unit: 'tickets',
  formula: 'formulas',
  file: 'tickets',
  stub: 'source',
  danger: 'tickets',
});

/** A file, or null, with an unreadable marker instead of a throw. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    error.code = 'UNREADABLE_ARTIFACT';
    throw error;
  }
}

/** Validate one registry document. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function validateRegistry(document) {
  if (!document || !SUPPORTED_REGISTRY_VERSIONS.has(document.version)) {
    throw new Error('omission-detectors.json must declare a supported version');
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

/** Load the registry. A fixture may carry its own copy. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function ticketKeyOf(ticket) {
  const phaseId = ticket?.phaseId ?? -1;
  return phaseId === -1 ? 'PX-' + ticket.id : 'P' + phaseId + '-' + ticket.id;
}

/** The unique file in `cwd` matching a suffix, or null. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function uniqueSibling(cwd, suffix) {
  if (!fs.existsSync(cwd)) return null;
  const matches = fs.readdirSync(cwd).filter((name) => name.endsWith(suffix)).sort();
  return matches.length === 1 ? path.join(cwd, matches[0]) : null;
}

/** The first existing candidate, or null. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function firstExisting(cwd, candidates) {
  for (const candidate of candidates) {
    const full = path.isAbsolute(candidate) ? candidate : path.join(cwd, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** JSON artifacts are validated by parsing; every other artifact by reading. */
const JSON_ARTIFACT_EXTENSION = '.json';

/**
 * The state of one artifact path.
 *
 * The rfc family resolves to RFC.md and the spec family may resolve to SPEC.md.
 * Those are prose artifacts: requiring them to parse as JSON would report every
 * present RFC as unreadable and leave the gate unable to measure the surface.
 * Only a .json artifact is parsed; anything else is present when it can be read.
 */
// [::TICKET::] PX-415, PX-416, PX-407, PX-414 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416|PX-407|PX-414) --for-spec --no-implementation-order`.
function artifactState(filePath, { directory = false } = {}) {
  if (!filePath) return { state: 'absent', path: null, reason: 'ARTIFACT_MISSING' };
  if (!fs.existsSync(filePath)) return { state: 'absent', path: filePath, reason: 'ARTIFACT_MISSING' };
  if (directory) return { state: 'present', path: filePath, reason: null };

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { state: 'unreadable', path: filePath, reason: 'ARTIFACT_UNREADABLE' };
  }
  if (path.extname(filePath).toLowerCase() === JSON_ARTIFACT_EXTENSION) {
    try {
      JSON.parse(content);
    } catch {
      return { state: 'unreadable', path: filePath, reason: 'ARTIFACT_UNREADABLE' };
    }
  }
  return { state: 'present', path: filePath, reason: null };
}

/**
 * Resolve the canonical artifacts and the state of every required family.
 *
 * A family is present only when its artifact is readable. A missing graph,
 * Dirs-Tree, sequences view or formula sidecar is notMeasured, never clean.
 */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function artifactStatus({ cwd, ticketsPath = null, graphPath = null } = {}) {
  const ticketsFile = ticketsPath || path.join(cwd, 'Tickets.json');
  const graph = graphPath || firstExisting(cwd, ['RFC-GRAPH.json']) || uniqueSibling(cwd, '-GRAPH.json');
  const dirsTree = firstExisting(cwd, ['RFC-Dirs-Tree.json']) || uniqueSibling(cwd, '-Dirs-Tree.json');
  const sequences = firstExisting(cwd, ['SEQUENCES.json']) || uniqueSibling(cwd, '-sequences.json');
  const formulas = firstExisting(cwd, ['RFC-FORMULAS.json']) || uniqueSibling(cwd, '-FORMULAS.json');
  const rfc = firstExisting(cwd, ['RFC.md', 'RFC_ROOT.md']) || uniqueSibling(cwd, '-RFC.md');
  const specDirectory = firstExisting(cwd, ['specs']);
  const specFile = firstExisting(cwd, ['SPEC.md']);
  const sourcePresent = fs.existsSync(cwd) ? { state: 'present', path: cwd, reason: null } : { state: 'absent', path: cwd, reason: 'ARTIFACT_MISSING' };

  const artifacts = {
    tickets: artifactState(ticketsFile),
    graph: artifactState(graph),
    'dirs-tree': artifactState(dirsTree),
    sequences: artifactState(sequences),
    formulas: artifactState(formulas),
    rfc: artifactState(rfc),
    spec: specFile
      ? artifactState(specFile)
      : (specDirectory ? { state: 'present', path: specDirectory, reason: null } : { state: 'absent', path: null, reason: 'ARTIFACT_MISSING' }),
    source: sourcePresent,
  };

  const families = {};
  for (const family of REQUIRED_SURFACE_FAMILIES) {
    const artifactName = FAMILY_ARTIFACT[family];
    const state = artifacts[artifactName];
    families[family] = { ...state, artifact: artifactName };
  }
  return { paths: { graph, dirsTree, sequences, formulas, rfc, spec: specFile || specDirectory, tickets: ticketsFile }, families };
}

/** Collect a surface once, keeping the first occurrence. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function surfaceCollector() {
  const byKey = new Map();
  return {
    add(surface, assetId, extra = {}) {
      if (typeof assetId !== 'string' || assetId.length === 0) return;
      const key = surface + '|' + assetId;
      if (!byKey.has(key)) byKey.set(key, { surface, assetId, ...extra });
    },
    values() {
      return [...byKey.values()].sort((left, right) => (left.surface + '|' + left.assetId).localeCompare(right.surface + '|' + right.assetId));
    },
  };
}

/** Every file path a Dirs-Tree record names, supporting both schemas. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function dirsTreePaths(dirsTree) {
  const paths = [];
  const walk = (parentPath, node) => {
    if (!node || typeof node !== 'object') return;
    const current = node.name ? (parentPath ? parentPath + '/' + node.name : node.name) : parentPath;
    if (node.type === 'file' || (Array.isArray(node.mappedNodeIds) && !Array.isArray(node.children))) {
      paths.push(current.replace(/^\/+/, ''));
    }
    for (const child of node.children ?? []) walk(current, child);
  };
  for (const tree of Object.values(dirsTree?.trees ?? {})) walk('', tree);
  for (const directory of dirsTree?.directories ?? []) if (directory?.path) paths.push(directory.path);
  for (const file of dirsTree?.files ?? []) if (file?.path) paths.push(file.path);
  return [...new Set(paths)].sort();
}

/** The spec files the design-intent obligation covers. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function specFiles(cwd, specPath) {
  if (!specPath) return [];
  if (fs.existsSync(specPath) && fs.statSync(specPath).isFile()) return [path.relative(cwd, specPath)];
  if (!fs.existsSync(specPath)) return [];
  return fs.readdirSync(specPath)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => path.relative(cwd, path.join(specPath, name)));
}

/**
 * Enumerate the finite inspection universe and the artifact state.
 *
 * The enumeration is from the canon. A family whose artifact is absent appears
 * in `artifacts.families` as absent and is reported by evaluateCoverage.
 */
/** A stable acceptance asset id: the criterion text, not its array position. */
// [::TICKET::] PX-415, PX-416, PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416|PX-407) --for-spec --no-implementation-order`.
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function acceptanceAssetId(ticketKey, criterion) {
  const hash = createHash('sha256').update(String(criterion)).digest('hex').slice(0, 16);
  return ticketKey + '/acceptance/' + hash;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function enumerateSurfaceReport({ cwd, ticketsPath = null, graphPath = null, stubs = [] } = {}) {
  const collector = surfaceCollector();
  const ticketsFile = ticketsPath || path.join(cwd, 'Tickets.json');
  const tickets = readJsonIfPresent(ticketsFile);
  const artifacts = artifactStatus({ cwd, ticketsPath: ticketsFile, graphPath });
  const paths = artifacts.paths;

  for (const phase of tickets?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const ticketKey = ticketKeyOf({ ...ticket, phaseId: ticket.phaseId ?? phase.id });
      collector.add('ticket', ticketKey, { ticketKey });
      for (const contract of ticket.contracts ?? []) collector.add('contract', contract.id, { ticketKey });
      (ticket.acceptanceCriteria ?? []).forEach((criterion) => collector.add('acceptance', acceptanceAssetId(ticketKey, criterion), { ticketKey }));
      for (const unitId of ticket.nodeIds ?? []) collector.add('unit', unitId, { ticketKey });
      for (const file of ticket.default_files ?? []) {
        collector.add('file', file, { ticketKey });
        collector.add('danger', file, { ticketKey });
      }
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

  const graph = readJsonIfPresent(paths.graph);
  for (const node of graph?.nodes ?? []) collector.add('graph-node', node.id, {});
  for (const edge of graph?.edges ?? []) collector.add('graph-edge', edge.id ?? edge.from + '->' + edge.to, {});

  const dirsTree = readJsonIfPresent(paths.dirsTree);
  for (const entry of dirsTreePaths(dirsTree)) collector.add('dirs-tree', entry, {});

  const sequences = readJsonIfPresent(paths.sequences);
  for (const sequence of sequences?.sequences ?? []) {
    for (const step of sequence.steps ?? []) collector.add('sequence-step', step.id ?? sequence.id + ':' + step.operation, {});
  }
  for (const boundary of sequences?.boundaries ?? []) collector.add('boundary', boundary.id, {});

  const formulas = readJsonIfPresent(paths.formulas);
  for (const formula of formulas?.formulas ?? []) collector.add('formula', formula.id, {});

  for (const spec of specFiles(cwd, paths.spec)) collector.add('spec', spec, {});
  if (paths.rfc) collector.add('rfc', path.relative(cwd, paths.rfc), {});

  for (const stub of stubs) collector.add('stub', stub.file + ':' + stub.line, {});

  return { surfaces: collector.values(), artifacts };
}

/** Backward-compatible surface-only enumeration. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function enumerateSurfaces(options = {}) {
  return enumerateSurfaceReport(options).surfaces;
}

/**
 * Evaluate the registry against the enumerated surfaces and artifact state.
 *
 * An absent artifact family is a finding and a notMeasured entry. A
 * notMeasured detector is reported and makes ok false.
 */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function evaluateCoverage({ registry, surfaces, measurements = {}, artifacts = null }) {
  const findings = [];
  const notMeasured = new Set();
  const measured = [];

  if (artifacts?.families) {
    for (const [family, state] of Object.entries(artifacts.families)) {
      if (state.state === 'present') continue;
      findings.push({
        code: state.state === 'unreadable' ? 'ARTIFACT_UNREADABLE' : 'ARTIFACT_MISSING',
        surface: family,
        assetId: family,
        problem: 'the ' + family + ' surface has no readable artifact',
        fixes: [],
        rerun: 'provide the artifact or accept the blocked state',
      });
      notMeasured.add(family);
    }
  }

  const decorated = surfaces.map((surface) => {
    const detectors = registry.detectors.filter((detector) => detector.surfaces.includes(surface.surface));
    const mechanical = detectors.filter((detector) => detector.kind === 'mechanical');
    const judgment = detectors.filter((detector) => detector.kind === 'judgment');
    const requirement = registry.surfaceRequirements?.[surface.surface] ?? 'mechanical';
    const notApplicable = registry.notApplicable?.[surface.surface + ':' + surface.assetId]
      ?? registry.notApplicable?.[surface.surface];

    let coveredBy = null;
    if (notApplicable) coveredBy = 'notApplicable';
    else if (requirement === 'mechanical') coveredBy = mechanical.length > 0 ? 'mechanical' : null;
    else if (requirement === 'judgment') coveredBy = judgment.length > 0 ? 'judgment' : null;
    else coveredBy = mechanical.length > 0 ? 'mechanical' : (judgment.length > 0 ? 'judgment' : null);

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

    return { ...surface, coveredBy, detectors: detectors.map((detector) => detector.id) };
  });

  for (const [id, status] of Object.entries(measurements)) {
    if (status === 'notMeasured' || status === 'blocked') notMeasured.add(id);
    else measured.push(id);
  }

  return {
    version: registry.version,
    surfaces: decorated,
    findings,
    notMeasured: [...notMeasured].sort(),
    measured,
    ok: findings.length === 0 && notMeasured.size === 0,
  };
}

/** The judgment obligations the AI must adjudicate for the enumerated surfaces. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function judgmentObligations({ registry, surfaces }) {
  const obligations = [];
  for (const surface of surfaces) {
    if (!REQUIRED_SURFACE_FAMILIES.includes(surface.surface)) continue;
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

/** The synthetic fixture the older calibration controls run against. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function createSyntheticFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px407-calibration-'));
  const writeJson = (filePath, value) => fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  writeJson(path.join(root, 'Tickets.json'), {
    title: 'omission calibration',
    round: 1,
    metadata: {},
    phases: [{
      id: 0,
      name: 'P0',
      tickets: [{
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
      }],
    }],
  });
  writeJson(path.join(root, 'RFC-GRAPH.json'), { nodes: [{ id: 'N0001', title: 'node' }], edges: [] });
  writeJson(path.join(root, 'RFC-Dirs-Tree.json'), { trees: {} });
  writeJson(path.join(root, 'SEQUENCES.json'), { sequences: [], boundaries: [] });
  writeJson(path.join(root, 'RFC-FORMULAS.json'), { version: 1, formulas: [{ id: 'fx-000000000000' }] });
  fs.writeFileSync(path.join(root, 'RFC.md'), '# Fixture\n');
  fs.mkdirSync(path.join(root, 'specs'));
  fs.writeFileSync(path.join(root, 'specs', 'fixture.md'), '# Fixture\n');
  fs.writeFileSync(path.join(root, 'src/a.js'), 'function save(value) {\n  return value;\n}\n');
  return root;
}

/** Remove a synthetic fixture. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function removeSyntheticFixture(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

module.exports = {
  FAMILY_ARTIFACT,
  REGISTRY_FILE_NAME,
  REGISTRY_VERSION,
  REQUIRED_SURFACE_FAMILIES,
  acceptanceAssetId,
  artifactState,
  artifactStatus,
  createSyntheticFixture,
  dirsTreePaths,
  enumerateSurfaceReport,
  enumerateSurfaces,
  evaluateCoverage,
  judgmentObligations,
  loadRegistry,
  readJsonIfPresent,
  removeSyntheticFixture,
  ticketKeyOf,
  validateRegistry,
};
