/**
 * Verify every hash the artefacts record, before a single byte of the document exists.
 *
 * Two of the three checks are recomputations: the specification's hash and the seed's own
 * hash are taken from the bytes on disk. The third compares the stage-one manifest's
 * recorded self-hash with the copy the seed carries, which is the strongest statement
 * available here — recomputing the canonical manifest hash would mean reimplementing the
 * publisher's canonicalisation, and a second implementation of one hash is a second thing
 * to disagree with it.
 *
 * A mismatch is fatal and leaves nothing behind, so a document can never describe a
 * workspace state that has already moved.
 */
import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';
import { ExplainSeedError } from './errors.mjs';
import { requireField } from './seed-document.mjs';
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
import { toHomeRelative } from '../../lib/path-utils.js';

/** Report a recorded hash that the artefact on disk does not reproduce. */
// [::TICKET::] PX-221, PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-231) --for-spec --no-implementation-order`.
function reportMismatch({ field, artefact, path, recorded, computed }) {
  throw new ExplainSeedError(
    `${field} does not match the ${artefact} at ${toHomeRelative(path)}: recorded ${recorded}, computed ${computed}`,
    { field },
  );
}

/** The specification's hash must be the hash of the specification on disk. */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
function verifySpecification({ identity, workspace }) {
  const recorded = requireField(identity, 'source_spec.sha256');
  const computed = sha256Hex(workspace.specBytes);
  if (recorded !== computed) {
    reportMismatch({
      field: 'source_spec.sha256',
      artefact: 'specification',
      path: workspace.specPath,
      recorded,
      computed,
    });
  }
  return computed;
}

/** The stage-one hash the seed carries must be the self-hash of the manifest it names. */
// [::TICKET::] PX-221, PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-231) --for-spec --no-implementation-order`.
function verifyStageOneManifest({ identity, workspace }) {
  const recorded = requireField(identity, 'stage1_manifest.hash');
  const computed = workspace.treeManifest?.integrity?.manifest_hash;
  if (computed === undefined) {
    throw new ExplainSeedError(
      `the stage-one manifest records no integrity.manifest_hash: ${toHomeRelative(workspace.treeManifestPath)}`,
      { field: 'stage1_manifest.hash' },
    );
  }
  if (recorded !== computed) {
    reportMismatch({
      field: 'stage1_manifest.hash',
      artefact: 'stage-one manifest',
      path: workspace.treeManifestPath,
      recorded,
      computed,
    });
  }
  return computed;
}

/** The seed's entry in the stage-two index must be the hash of the seed on disk. */
// [::TICKET::] PX-221, PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-231) --for-spec --no-implementation-order`.
function verifySeed({ identity, workspace, seedText }) {
  const packageId = requireField(identity, 'package.id');
  const entries = workspace.allocateManifest?.seed_index ?? [];
  const entry = entries.find((candidate) => candidate.package === packageId);
  if (entry === undefined) {
    throw new ExplainSeedError(
      `seed_index does not list ${packageId} in the stage-two manifest at ${toHomeRelative(workspace.allocateManifestPath)}`,
      { field: 'seed_index' },
    );
  }
  const recorded = requireField(entry, 'sha256');
  const computed = sha256Hex(Buffer.from(seedText, 'utf8'));
  if (recorded !== computed) {
    reportMismatch({
      field: 'seed_index.sha256',
      artefact: 'seed',
      path: workspace.allocateManifestPath,
      recorded,
      computed,
    });
  }
  return computed;
}

/**
 * Verify all three recorded hashes.
 *
 * @returns {{ specification: string, stageOneManifest: string, seed: string }}
 */
export function verifyRecordedHashes({ identity, workspace, seedText }) {
  return {
    specification: verifySpecification({ identity, workspace }),
    stageOneManifest: verifyStageOneManifest({ identity, workspace }),
    seed: verifySeed({ identity, workspace, seedText }),
  };
}
