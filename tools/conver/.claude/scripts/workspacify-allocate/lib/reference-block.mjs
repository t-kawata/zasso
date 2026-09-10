// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// PX-193 @verifies C001
/**
 * Machine-injected reference block (seed section 1).
 *
 * Every seed must carry the reference paths to the original long specification,
 * to WORKSPACIFY-TREE-MANIFEST.json and to WORKSPACIFY-ALLOCATE-MANIFEST.json.
 * The block is built here from measurements only — the files on disk, the
 * manifest hashes and the verified implementation order — so an AI can neither
 * omit a reference nor rewrite one.
 *
 * The stage-2 path is referenced without a hash: the stage-2 manifest records
 * every seed hash, so embedding its hash in a seed would create a hash cycle.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';
import { normalizeTextBytes } from '../../workspacify-tree/lib/normalization.mjs';
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { ALLOCATE_MANIFEST_FILE_NAME } from './seed-model.mjs';

/**
 * Build the reference block for one package.
 *
 * The block states where one seed sits: the manifest it points at, and the seed's own
 * facts - its package, its place in the implementation order, the contracts it owes and
 * the segments it carries.
 *
 * @param {{ manifestRef: { manifest: object, manifestPath: string, manifestDir: string }, seed: { package: object, orderEntry?: object, contractIds?: string[], sourceSegments?: string[] } }} input
 * @returns {object} reference block for seed section 1
 * @throws {WorkSpacifyTreeError} gateId "G3.1"
 */
export function buildReferenceBlock({ manifestRef, seed }) {
  const { manifest, manifestPath, manifestDir } = manifestRef;
  const { package: pkg, orderEntry = {}, contractIds = [], sourceSegments = [] } = seed;
  if (!pkg || typeof pkg.id !== 'string') {
    throw new WorkSpacifyTreeError('the reference block needs a package from the manifest catalog', { gateId: 'G3.1' });
  }
  if (!Array.isArray(pkg.responsibilities) || pkg.responsibilities.length === 0) {
    throw new WorkSpacifyTreeError(`package ${pkg.id} declares no responsibilities, so its role in the system is unknown`, { gateId: 'G3.1' });
  }

  const specName = manifest?.input?.spec_path;
  if (typeof specName !== 'string' || specName.length === 0) {
    throw new WorkSpacifyTreeError('the manifest does not record input.spec_path', { gateId: 'G3.1' });
  }
  const specPath = path.resolve(manifestDir, specName);
  let specBytes;
  try {
    specBytes = readFileSync(specPath);
  } catch {
    throw new WorkSpacifyTreeError(`the co-located specification is not readable: ${specName}`, { gateId: 'G3.1' });
  }
  const sourceHash = sha256Hex(normalizeTextBytes(specBytes).bytes);
  if (sourceHash !== manifest?.input?.source_hash) {
    throw new WorkSpacifyTreeError(
      `the specification ${specName} re-hashes to a different source_hash than the manifest records`,
      { gateId: 'G3.1' },
    );
  }

  const recordedStage1Hash = manifest?.integrity?.manifest_hash;
  const onDiskStage1Hash = readManifestHash(manifestPath);
  if (recordedStage1Hash !== onDiskStage1Hash) {
    throw new WorkSpacifyTreeError(
      'the stage-1 manifest hash does not match the manifest file on disk',
      { gateId: 'G3.1' },
    );
  }

  return {
    package: {
      id: pkg.id,
      name: pkg.name,
      path: pkg.path,
      layer: pkg.layer,
      kind: pkg.kind,
      responsibilities: [...pkg.responsibilities],
    },
    source_spec: { path: specName, sha256: sourceHash },
    stage1_manifest: { path: path.basename(manifestPath), hash: recordedStage1Hash },
    stage2_manifest: { path: ALLOCATE_MANIFEST_FILE_NAME },
    implementation_order: {
      before: [...(orderEntry.before ?? [])],
      after: [...(orderEntry.after ?? [])],
      parallel_with: [...(orderEntry.parallel_with ?? [])],
      serial_index: orderEntry.serial_index ?? 0,
      wave: orderEntry.wave ?? 0,
    },
    contract_refs: [...new Set(contractIds)].sort(),
    source_segments: [...new Set(sourceSegments)].sort(),
  };
}

/** Read the self-hash recorded in the manifest file on disk. */
function readManifestHash(manifestPath) {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return parsed?.integrity?.manifest_hash;
  } catch {
    throw new WorkSpacifyTreeError(`the stage-1 manifest is not readable at ${manifestPath}`, { gateId: 'G3.1' });
  }
}
