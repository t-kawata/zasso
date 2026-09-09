// [::TICKET::] PX-178 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-178 --for-spec --no-implementation-order`.
/**
 * Manifest rendering and self-hash (§12.1, §12.3, integrity).
 *
 * assembleManifest fills the required top-level skeleton and computes
 * integrity.manifest_hash over the canonical serialization of the manifest
 * with the hash field set to an empty string.
 */
import { canonicalSerialize } from './canonical-json.mjs';
import { sha256Hex } from './hash.mjs';

const REQUIRED_TOP_LEVEL_KEYS = [
  'artifact_kind',
  'schema_version',
  'status',
  'run',
  'input',
  'structure',
  'inventory',
  'requirements',
  'workspace',
  'adapters',
  'dependencies',
  'conformance',
  'stage2_handoff',
  'gates',
  'final_audit',
  'integrity',
];

/**
 * Compute the self-hash of a manifest: SHA-256 over canonical serialization
 * with integrity.manifest_hash replaced by an empty string.
 *
 * @param {object} manifest - manifest object
 * @returns {string} lowercase hex digest
 */
export function computeSelfHash(manifest) {
  const withEmptyHash = {
    ...manifest,
    integrity: { ...(manifest.integrity ?? {}), manifest_hash: '' },
  };
  return sha256Hex(Buffer.from(canonicalSerialize(withEmptyHash), 'utf8'));
}

/**
 * Assemble a complete manifest from partial sections.
 *
 * @param {object} partial - caller-provided sections
 * @returns {object} manifest with integrity.manifest_hash computed
 */
export function assembleManifest(partial = {}) {
  const skeleton = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    artifact_kind: 'workspacify-tree-manifest',
    schema_version: '1.0.0',
    status: 'COMPLETE',
    run: {},
    input: {},
    structure: {},
    inventory: {},
    requirements: {},
    workspace: {},
    adapters: {},
    dependencies: {},
    conformance: {},
    stage2_handoff: {},
    gates: {},
    final_audit: {},
    integrity: {},
  };
  const manifest = { ...skeleton, ...partial };
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (manifest[key] === undefined) {
      manifest[key] = {};
    }
  }
  manifest.integrity = {
    canonicalization: 'workspacify-tree-json-v1',
    manifest_hash_algorithm: 'SHA-256',
    manifest_hash: '',
    ...(manifest.integrity ?? {}),
  };
  manifest.integrity.manifest_hash = computeSelfHash(manifest);
  return manifest;
}

/**
 * Render a manifest to its canonical JSON text.
 *
 * @param {object} manifest - manifest object
 * @returns {string} canonical JSON text
 */
export function renderManifestText(manifest) {
  return canonicalSerialize(manifest);
}
