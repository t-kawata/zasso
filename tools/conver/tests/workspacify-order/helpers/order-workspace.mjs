/**
 * A workspacify workspace assembled from fixtures.
 *
 * The command under test reads two manifests and writes nothing, so the fixture is the
 * whole input surface. Levels are authored by the caller wherever the expectation matters,
 * so a test comparing derived levels against published ones never compares the
 * implementation with itself.
 *
 * The real workspace this command was written for lives outside this repository, so the
 * suite never touches it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
export const SEED_FILE_NAME = 'RFC-SEED.md';
/** The explanation document explain-seed writes beside a seed; its presence is the mark. */
export const EXPLAIN_FILE_NAME = 'EXPLAIN-RFC-SEED.md';
/** The design document grill-me-for-rfc writes beside a seed; its presence is the mark. */
export const RFC_FILE_NAME = 'RFC.md';
/** The prose view sequences-slice writes into a package directory. The verdict never opens it. */
export const SEQUENCES_FILE_NAME = 'SEQUENCES.md';
/** The projected view the verdict judges: the units a package carries, and how they were declared. */
export const VIEW_FILE_NAME = 'SEQUENCES.json';
/** The record of how many times a view was distributed with different bytes. */
export const DISTRIBUTIONS_FILE_NAME = 'SEQUENCES-DISTRIBUTIONS.json';
/** The root run directory educe-sequences keeps its generation status in. */
export const EDUSEQUENCES_DIRECTORY = 'educe-sequences';
/** The root run directory smooth-sequences keeps its generation status in. */
export const SMOOTH_SEQUENCES_DIRECTORY = 'smooth-sequences';
/** The heading a package's distribution ledger lives under, as the one parser finds it. */
const LEDGER_HEADING = '## Distribution ledger';
/** The five columns the parser accepts, in the order it accepts them. */
const LEDGER_COLUMNS = '| Unit | Kind | Owner | RFC location | Ground |';
/** A heading whose number a ledger row can cite, so a location resolves inside the document. */
const CITED_SECTION = '1.1';

const DEFAULT_LAYER = 'protocol';
const DEFAULT_TOP_LEVEL = 'crates';

/** `pkg-0001` from index 0, so a fixture reads the way a manifest does. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function packageIdAt(index) {
  return `pkg-${String(index + 1).padStart(4, '0')}`;
}

/** The provider-first levels of a fixture, when the caller does not author them. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function levelsFromEdges(packageIds, edges) {
  const providersOf = new Map(packageIds.map((id) => [id, []]));
  for (const [consumer, provider] of edges) {
    providersOf.get(consumer).push(provider);
  }
  const depthMemo = new Map();
  const depthOf = (id) => {
    if (depthMemo.has(id)) return depthMemo.get(id);
    depthMemo.set(id, 0);
    const providers = providersOf.get(id);
    const depth = providers.length === 0 ? 0 : Math.max(...providers.map(depthOf)) + 1;
    depthMemo.set(id, depth);
    return depth;
  };
  const byDepth = [];
  for (const id of packageIds) {
    const depth = depthOf(id);
    byDepth[depth] = byDepth[depth] ?? [];
    byDepth[depth].push(id);
  }
  return byDepth.map((level) => [...level].sort());
}

/**
 * Write a workspace whose manifests agree with each other.
 *
 * @param {{ packages?: string[], edges?: Array<[string, string]>, levels?: string[][],
 *   paths?: Record<string, string>, documents?: { explained?: string[], grilled?: string[],
 *   carried?: string[] } }} input
 *   `edges` are consumer-provider pairs, the orientation the manifest itself uses.
 *   `levels` is the published order; it is computed from the edges when omitted.
 *   `documents` says what each package directory receives, which is one question with three
 *   answers rather than three questions: `explained` names the packages receiving an
 *   EXPLAIN-RFC-SEED.md and `grilled` those receiving an RFC.md, both written empty because for
 *   those two documents existence is the whole rule, and `carried` names the packages receiving
 *   a judged view and the ledger accounting for it, written through writeCarriedView because
 *   those documents are read rather than counted. The lists are independent, so a package may
 *   appear in any, all or none of them.
 * @returns {{ root: string, treeManifestPath: string, allocateManifestPath: string,
 *   seedPathOf: (id: string) => string, explainPathOf: (id: string) => string,
 *   rfcPathOf: (id: string) => string, viewPathOf: (id: string) => string,
 *   directoryOf: (id: string) => string,
 *   writeTreeManifest: (value: object) => void, remove: () => void }}
 */
// [::TICKET::] PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-228 --for-spec --no-implementation-order`.
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function materializeOrderWorkspace(options = {}) {
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
  const {
    packages = ['pkg-0001'],
    edges = [],
    levels,
    paths = {},
    documents = {},
    rootCounters = {},
    counters = {},
  } = options;
  const { explained = [], grilled = [], carried = [] } = documents;
  const root = mkdtempSync(join(tmpdir(), 'workspacify-order-'));
  const publishedLevels = levels ?? levelsFromEdges(packages, edges);
  const pathOf = new Map(
    packages.map((id, index) => [
      id,
      // A path deeper than three segments exercises the padded column the same way the
      // real workspace does, where storage adapters sit one directory lower.
      paths[id] ?? join(DEFAULT_TOP_LEVEL, DEFAULT_LAYER, `package-${index + 1}`),
    ]),
  );

  const explainedPackages = new Set(explained);
  const grilledPackages = new Set(grilled);
  for (const id of packages) {
    const directory = join(root, pathOf.get(id));
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, SEED_FILE_NAME), `# RFC Seed: ${id}\n`);
    if (explainedPackages.has(id)) writeFileSync(join(directory, EXPLAIN_FILE_NAME), '');
    if (grilledPackages.has(id)) writeFileSync(join(directory, RFC_FILE_NAME), '');
    const counter = counters[id];
    const statusFields = ['completedSessions', 'grillGeneration', 'distributionGeneration']
      .filter((field) => counter?.[field] !== undefined)
      .map((field) => [field, counter[field]]);
    if (statusFields.length > 0) {
      writeFileSync(join(directory, 'Status.json'), JSON.stringify({ state: 'DONE', ...Object.fromEntries(statusFields) }, null, 2));
    }
    if (counter?.distributions !== undefined) {
      writeFileSync(join(directory, DISTRIBUTIONS_FILE_NAME), JSON.stringify({
        schemaVersion: 1,
        distributions: counter.distributions,
        digest: counter.digest ?? 'a'.repeat(64),
      }, null, 2));
    }
  }
  if (rootCounters.educe !== undefined) {
    mkdirSync(join(root, EDUSEQUENCES_DIRECTORY), { recursive: true });
    writeFileSync(join(root, EDUSEQUENCES_DIRECTORY, 'status.json'), JSON.stringify({ generation: rootCounters.educe }, null, 2));
  }
  if (rootCounters.smooth !== undefined) {
    mkdirSync(join(root, SMOOTH_SEQUENCES_DIRECTORY), { recursive: true });
    writeFileSync(join(root, SMOOTH_SEQUENCES_DIRECTORY, 'status.json'), JSON.stringify({ generation: rootCounters.smooth }, null, 2));
  }

  const treeManifest = {
    workspace: {
      packages: packages.map((id, index) => ({
        id,
        // A real manifest names a package after its directory, so the fixture does too.
        name: `package-${index + 1}`,
        path: pathOf.get(id),
        layer: DEFAULT_LAYER,
        kind: 'production-library',
      })),
    },
    dependencies: {
      dag: {
        canonical_edges: edges.map(([from, to]) => ({ from, to })),
        implementation_order: { serial: publishedLevels.flat(), levels: publishedLevels },
      },
    },
  };
  const allocateManifest = {
    implementation_order: { serial: publishedLevels.flat(), levels: publishedLevels },
    seed_index: packages.map((id) => ({ package: id, path: join(pathOf.get(id), SEED_FILE_NAME) })),
  };

  const treeManifestPath = join(root, TREE_MANIFEST_FILE_NAME);
  const allocateManifestPath = join(root, ALLOCATE_MANIFEST_FILE_NAME);
  writeFileSync(treeManifestPath, JSON.stringify(treeManifest, null, 2));
  writeFileSync(allocateManifestPath, JSON.stringify(allocateManifest, null, 2));

  const workspace = {
    root,
    treeManifestPath,
    allocateManifestPath,
    treeManifest,
    allocateManifest,
    pathOf,
    seedPathOf: (id) => join(root, pathOf.get(id), SEED_FILE_NAME),
    explainPathOf: (id) => join(root, pathOf.get(id), EXPLAIN_FILE_NAME),
    rfcPathOf: (id) => join(root, pathOf.get(id), RFC_FILE_NAME),
    viewPathOf: (id) => join(root, pathOf.get(id), VIEW_FILE_NAME),
    distributionPathOf: (id) => join(root, pathOf.get(id), DISTRIBUTIONS_FILE_NAME),
    statusPathOf: (id) => join(root, pathOf.get(id), 'Status.json'),
    directoryOf: (id) => join(root, pathOf.get(id)),
    writeTreeManifest: (value) => writeFileSync(treeManifestPath, JSON.stringify(value, null, 2)),
    writeAllocateManifest: (value) => writeFileSync(allocateManifestPath, JSON.stringify(value, null, 2)),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
  for (const id of carried) writeCarriedView(workspace, id);
  return workspace;
}

/**
 * The unit kind a ledger row must declare for a given unit id.
 *
 * The parser accepts a closed list of kinds and refuses a row that names anything else, so a
 * fixture that guessed would fail for a reason that has nothing to do with the case at hand.
 */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
function kindOfUnitId(unitId) {
  if (unitId.startsWith('ctr-')) return 'contract';
  if (unitId.startsWith('op-')) return 'operation';
  return 'sequence';
}

/** The design document a carrying package is grilled into: the ledger its view is judged against. */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
function renderCarriedRfc({ packageId, units, location }) {
  return [
    `# ${packageId} design`,
    '',
    `## ${CITED_SECTION} What this package carries`,
    '',
    LEDGER_HEADING,
    '',
    // The precedence marker the parser requires before it reads any row.
    'This document is canonical for the units below.',
    '',
    LEDGER_COLUMNS,
    '| --- | --- | --- | --- | --- |',
    ...units.map((unitId) => `| ${unitId} | ${kindOfUnitId(unitId)} | ${packageId} | ${location} | the dependency this unit travels along |`),
    '',
  ].join('\n');
}

/**
 * Write a package the distribution reached: a view carrying units and a ledger accounting for them.
 *
 * `location` is a parameter because a case needs a ledger that cites something the document does
 * not hold, which is the one way a well-formed ledger is still refused.
 */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
export function writeCarriedView(workspace, id, { units = ['op-0001'], source = 'undeclared', location = CITED_SECTION } = {}) {
  const directory = workspace.directoryOf(id);
  writeView(workspace, id, {
    packageId: id,
    ownedOperationUnits: [],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: units.map((unitId) => ({ unitId, relation: 'carries', subject: unitId })),
    obligationSource: source,
    specLines: 1,
    lineRange: { claimedLineCount: 1, multiClaimedLineCount: 0, unclaimedLineCount: 0, statement: '' },
  });
  writeFileSync(join(directory, RFC_FILE_NAME), renderCarriedRfc({ packageId: id, units, location }));
}

/**
 * Write the view a slice that predates the carriage wrote: owned units, and no obligationSource.
 *
 * ~/shyme/gaia is 26 of these. The field's absence is what tells a reader the obligations were
 * never attempted here, so a fixture that set it would remove the case it exists to build.
 */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
export function writePreCarriageView(workspace, id, { units = ['op-0001'] } = {}) {
  writeView(workspace, id, {
    packageId: id,
    ownedOperationUnits: units.map((unitId) => ({ unitId, operationId: unitId.slice(3), resultObjectClasses: [], ownerPackageIds: [id] })),
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    unmatchedClassNames: [],
    specLines: 1,
    lineRange: { claimedLineCount: 1, multiClaimedLineCount: 0, unclaimedLineCount: 0, statement: '' },
  });
}

/** Write a view verbatim, so a case can build the shape it is about rather than a convenient one. */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
export function writeView(workspace, id, view) {
  writeFileSync(workspace.viewPathOf(id), JSON.stringify(view, null, 2));
}

/** A workspace with one package per level, so the level count is the package count. */
export function materializeChainWorkspace(levelCount) {
  const packages = Array.from({ length: levelCount }, (_, index) => packageIdAt(index));
  const edges = packages.slice(1).map((id, index) => [id, packages[index]]);
  return materializeOrderWorkspace({ packages, edges });
}

/** The package whose provider list is `providerCount` long, plus its providers. */
export function materializeWideProviderWorkspace(providerCount) {
  const consumer = 'pkg-9999';
  const providers = Array.from({ length: providerCount }, (_, index) => packageIdAt(index));
  return materializeOrderWorkspace({
    packages: [...providers, consumer],
    edges: providers.map((id) => [consumer, id]),
  });
}

export { packageIdAt };
