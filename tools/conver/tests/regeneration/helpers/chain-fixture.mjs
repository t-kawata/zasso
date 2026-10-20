/**
 * A workspace whose hash chain is real.
 *
 * The fixture computes every hash with the function the producer uses, so a test
 * can break exactly one link and see exactly that link fail. It is the input
 * surface for the regeneration transaction: the live tree, the candidate, and
 * the snapshot that proves byte-identical isolation.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestOf } from '../../../.claude/scripts/educe-sequences/rail/load.mjs';
import { computeAllocateSelfHash } from '../../../.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { computeSelfHash } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';

export const SPEC_TEXT = '# Spec\n\nthe constraint line\n';
export const CANDIDATE_TEXT = '# Spec\n\nthe constraint line, revised\n';
export const TREE_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
export const ARTIFACT_FILE_NAME = 'example-sequences.json';

const PACKAGE_ID = 'pkg-0001';
const PACKAGE_PATH = 'crates/alpha';

/** The normalized source hash the tree records. */
export function specSourceHash(specPath) {
  return sha256Hex(normalizeTextBytes(readFileSync(specPath)).bytes);
}

/** Write a tree manifest whose input hash and self-hash are real. */
export function writeTreeManifest(root, specPath) {
  const sourceHash = specSourceHash(specPath);
  const manifest = {
    artifact_kind: 'workspacify-tree-manifest',
    schema_version: '1.0.0',
    status: 'COMPLETE',
    run: {},
    input: {
      hash_algorithm: 'SHA-256',
      newline_normalization: 'LF',
      source_hash: sourceHash,
      spec_path: 'spec.md',
    },
    structure: {},
    inventory: {},
    requirements: {},
    workspace: { packages: [{ id: PACKAGE_ID, path: PACKAGE_PATH }] },
    adapters: {},
    dependencies: { boundaries: [] },
    conformance: {},
    stage2_handoff: {},
    gates: {},
    final_audit: {},
    integrity: { canonicalization: 'workspacify-tree-json-v1', manifest_hash: '' },
  };
  manifest.integrity.manifest_hash = computeSelfHash(manifest);
  writeFileSync(join(root, TREE_FILE_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Write an allocate manifest that points at the tree and the spec. */
export function writeAllocateManifest(root, treeManifest, specPath) {
  const seedPath = join(root, PACKAGE_PATH, 'RFC-SEED.md');
  const manifest = {
    artifact_kind: 'workspacify-allocate-manifest',
    schema_version: '1.0.0',
    status: 'COMPLETE',
    input_tree_manifest: {
      path: TREE_FILE_NAME,
      hash: treeManifest.integrity.manifest_hash,
      spec: { path: 'spec.md', sha256: treeManifest.input.source_hash },
    },
    seed_index: [{ package: PACKAGE_ID, path: `${PACKAGE_PATH}/RFC-SEED.md`, sha256: digestOf(seedPath) }],
    contract_registry: [],
    allocation: {},
    integrity: { canonicalization: 'workspacify-allocate-json-v1', manifest_hash: '' },
  };
  manifest.integrity.manifest_hash = computeAllocateSelfHash(manifest);
  writeFileSync(join(root, ALLOCATE_FILE_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Write an artifact whose spec hash is the educe raw digest. */
export function writeArtifact(root, specPath) {
  const artifact = {
    schema_version: 3,
    spec: { path: 'spec.md', sha256: digestOf(specPath), lines: 3 },
    vocabulary: { terminalStatuses: ['closed'], requiredInterfaces: [] },
    pins: {},
    sequences: [],
    steps: [],
    operations: [],
  };
  writeFileSync(join(root, ARTIFACT_FILE_NAME), `${JSON.stringify(artifact, null, 2)}\n`);
  return artifact;
}

/** Write the package documents the chain and the transaction copy. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function writePackageDocuments(root) {
  const directory = join(root, PACKAGE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'RFC-SEED.md'), '# Alpha seed\n');
  writeFileSync(join(directory, 'RFC.md'), '# Alpha\n\nthe package RFC\n');
  writeFileSync(join(directory, 'OBLIGATION.json'), '{ "version": 2, "serves": [], "assignments": [], "adjudications": [] }\n');
  writeFileSync(join(directory, 'SEQUENCES.json'), `${JSON.stringify({
    packageId: PACKAGE_ID,
    ownedOperationUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  }, null, 2)}\n`);
}

/** Write the tree, allocate and artifact for the spec already at `root/spec.md`. */
export function writeChainAt(root, specPath) {
  const treeManifest = writeTreeManifest(root, specPath);
  writeAllocateManifest(root, treeManifest, specPath);
  writeArtifact(root, specPath);
  return treeManifest;
}

/** A consistent chain workspace with a candidate spec beside it. */
export function materializeChainWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'regeneration-chain-'));
  writeFileSync(join(root, 'spec.md'), SPEC_TEXT);
  writePackageDocuments(root);
  writeChainAt(root, join(root, 'spec.md'));
  mkdirSync(join(root, 'candidates'), { recursive: true });
  const candidatePath = join(root, 'candidates', 'spec.md');
  writeFileSync(candidatePath, CANDIDATE_TEXT);
  return { root, candidatePath, remove: () => rmSync(root, { recursive: true, force: true }) };
}

/** A workspace whose spec bytes no longer match the tree input hash. */
export function materializeBrokenChainWorkspace() {
  const workspace = materializeChainWorkspace();
  writeFileSync(join(workspace.root, 'spec.md'), '# changed out of band\n');
  return workspace;
}

/** A deterministic producer for transaction tests: derive the chain in staging. */
export function fixtureProducer({ stagingRoot }) {
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
  // The transaction stages only the frozen inputs, so the producer owns the package
  // documents it derives. The real producer merges the authored ones after allocate.
  writePackageDocuments(stagingRoot);
  writeChainAt(stagingRoot, join(stagingRoot, 'spec.md'));
  return { state: 'derived' };
}

/** Ground checks that pass. */
export function fixtureGroundsOk() {
  return { ok: true, checked: 1 };
}

/** A detector run that passes. */
export function fixtureDetectorOk() {
  return { exitCode: 0, findings: [], withheld: [] };
}

/** The relative paths of every design file under a root, sorted. */
export function listDesignFiles(root, relative = '') {
  const names = readdirSync(join(root, relative)).sort();
  const files = [];
  for (const name of names) {
    const path = relative === '' ? name : `${relative}/${name}`;
    if (name === 'regeneration' || name === 'SMOOTH-SEQUENCES.json' || name === 'SMOOTH-SEQUENCES.md') continue;
    const stat = statSync(join(root, path));
    if (stat.isDirectory()) files.push(...listDesignFiles(root, path));
    else files.push(path);
  }
  return files;
}

/** A hash of every design file, for byte-identical assertions. */
export function snapshotDesignTree(root) {
  return Object.fromEntries(listDesignFiles(root).map((path) => [path, digestOf(join(root, path))]));
}
