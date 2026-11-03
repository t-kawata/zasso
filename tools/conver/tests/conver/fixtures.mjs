// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIXTURE_DIR = path.resolve(new URL('../../docs/fixtures/gif-animation', import.meta.url).pathname);

/**
 * Materialize a synthetic workspace bundle into a fresh temporary directory.
 * Object values are JSON; string values are raw text, as the fixture README states.
 */
export function materializeBundle(bundleName) {
  const bundlePath = path.join(FIXTURE_DIR, bundleName);
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-progress-'));
  const root = path.join(target, bundle.root);
  for (const [relativePath, value] of Object.entries(bundle.files)) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }
  return { root, target };
}

/** Build a minimal tree manifest with the given package list. */
export function treeManifest(packages) {
  return {
    artifact_kind: 'workspacify-tree-manifest',
    schema_version: '1.0.0',
    status: 'COMPLETE',
    run: { generated_at: '2026-11-01T00:00:00.000Z' },
    input: { spec_path: 'spec.md', source_hash: 'a'.repeat(64), source_lines: 1 },
    workspace: { packages },
    integrity: { manifest_hash: 'b'.repeat(64) },
  };
}

/** Build a minimal allocate manifest with the given package ids and registry rows. */
export function allocateManifest(packageIds, contractRegistry = []) {
  return {
    artifact_kind: 'workspacify-allocate-manifest',
    schema_version: '1.0.0',
    status: 'COMPLETE',
    completion_decision: 'COMPLETE',
    semantic_review: { status: 'APPROVED' },
    run: { workspace_root: '.' },
    input_tree_manifest: {
      path: 'WORKSPACIFY-TREE-MANIFEST.json',
      hash: 'b'.repeat(64),
      spec: { path: 'spec.md', sha256: 'a'.repeat(64) },
    },
    seed_index: packageIds.map((id) => ({ package: id, path: `${id}/RFC-SEED.md`, sha256: 'c'.repeat(64) })),
    contract_registry: contractRegistry,
    implementation_order: { serial: packageIds, levels: [packageIds] },
  };
}

/** Build a package directory with the two manifests and an optional RFC-SEED. */
export function writeWorkspace({ packages, registry = [], files = {} }) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-progress-'));
  fs.writeFileSync(path.join(target, 'WORKSPACIFY-TREE-MANIFEST.json'),
    JSON.stringify(treeManifest(packages), null, 2));
  fs.writeFileSync(path.join(target, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'),
    JSON.stringify(allocateManifest(packages.map((p) => p.id), registry), null, 2));
  for (const [relativePath, value] of Object.entries(files)) {
    const file = path.join(target, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }
  return target;
}

/** Build a ticket object with contract ids and the requested status. */
export function ticket({ phaseId = 0, id = 1, status = 'todo', contracts = [], extra = {} }) {
  return {
    id,
    phaseId,
    title: `ticket ${phaseId}-${id}`,
    status,
    contracts: contracts.map((contractId) => ({
      id: contractId,
      sourceEdge: `edge-${contractId}`,
      precondition: `precondition ${contractId}`,
      postcondition: `postcondition ${contractId}`,
      invariant: `invariant ${contractId}`,
    })),
    ...extra,
  };
}
