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
 *   paths?: Record<string, string>, layers?: Record<string, string> }} input
 *   `edges` are consumer-provider pairs, the orientation the manifest itself uses.
 *   `levels` is the published order; it is computed from the edges when omitted.
 * @returns {{ root: string, treeManifestPath: string, allocateManifestPath: string,
 *   seedPathOf: (id: string) => string, writeTreeManifest: (value: object) => void,
 *   remove: () => void }}
 */
export function materializeOrderWorkspace({ packages = ['pkg-0001'], edges = [], levels, paths = {}, layers = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'workspacify-order-'));
  const publishedLevels = levels ?? levelsFromEdges(packages, edges);
  const pathOf = new Map(
    packages.map((id, index) => [
      id,
      // A path deeper than three segments exercises the padded column the same way the
      // real workspace does, where storage adapters sit one directory lower.
      paths[id] ?? join(DEFAULT_TOP_LEVEL, layers[id] ?? DEFAULT_LAYER, `package-${index + 1}`),
    ]),
  );

  for (const id of packages) {
    const directory = join(root, pathOf.get(id));
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, SEED_FILE_NAME), `# RFC Seed: ${id}\n`);
  }

  const treeManifest = {
    workspace: {
      packages: packages.map((id, index) => ({
        id,
        // A real manifest names a package after its directory, so the fixture does too.
        name: `package-${index + 1}`,
        path: pathOf.get(id),
        layer: layers[id] ?? DEFAULT_LAYER,
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

  return {
    root,
    treeManifestPath,
    allocateManifestPath,
    treeManifest,
    allocateManifest,
    pathOf,
    seedPathOf: (id) => join(root, pathOf.get(id), SEED_FILE_NAME),
    writeTreeManifest: (value) => writeFileSync(treeManifestPath, JSON.stringify(value, null, 2)),
    writeAllocateManifest: (value) => writeFileSync(allocateManifestPath, JSON.stringify(value, null, 2)),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
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
