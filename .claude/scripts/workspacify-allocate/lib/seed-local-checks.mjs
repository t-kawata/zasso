// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-193 @verifies C002 C003
/**
 * Per-seed local checks.
 *
 * A single seed must be structurally honest before the cross-seed gates run:
 * required headings present/ordered/non-empty, the Allocation Index matching this
 * package's expected allocation, no neighbour-owned item claimed, the three
 * reference paths present and agreeing with the files on disk, and every coupling
 * contract complete against the boundary scope stage 1 declared. Prose quality is
 * never graded here.
 */
import { existsSync } from 'node:fs';

import { SEED_REQUIRED_SECTIONS, assertSeedBodyValid, ALLOCATE_MANIFEST_FILE_NAME } from './seed-model.mjs';
import { validateSeedContractEdges, indexBoundariesByContractId } from './contract-model.mjs';

const ALLOWED_CATEGORIES = new Set(['object', 'claim', 'invariant', 'state_machine', 'error_code', 'required_test']);

/**
 * Run the local checks for one parsed seed.
 *
 * @param {{ parsedSeed: object, package: object, expectedAllocation?: Array<object>, workspace?: { manifest?: object, manifestPath?: string, manifestDir?: string, segmentIds?: Array<string> } }} input
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function runSeedLocalChecks({ parsedSeed, package: pkg, expectedAllocation = [], workspace = {} }) {
  // The locked stage-1 workspace: the manifest that authorises every reference and the
  // segments it declared, which the seed's trace table must stay inside.
  const { manifest, manifestPath, manifestDir, segmentIds } = workspace;
  const errors = [];

  const expectedKeys = new Set(expectedAllocation.map((item) => itemKey(item.category, item.inventory_ref)));

  const sections = parsedSeed.headings ?? [];
  if (sections.length !== SEED_REQUIRED_SECTIONS.length) {
    errors.push(`seed has ${sections.length} headings, expected ${SEED_REQUIRED_SECTIONS.length}`);
  }
  for (let i = 0; i < SEED_REQUIRED_SECTIONS.length; i += 1) {
    const expected = SEED_REQUIRED_SECTIONS[i];
    const actual = sections[i];
    if (!actual) {
      errors.push(`heading ${expected.index} is missing`);
      continue;
    }
    if (actual.index !== expected.index || actual.title !== expected.title) {
      errors.push(`heading ${expected.index} is out of order or mistitled`);
    }
    const reason = assertSeedBodyValid(actual.body);
    if (reason !== null) {
      errors.push(`heading ${expected.index} body invalid: ${reason}`);
    }
  }

  const rows = parsedSeed.allocationIndexRows ?? [];
  const seen = new Set();
  for (const row of rows) {
    const key = itemKey(row.category, row.inventory_ref);
    if (!ALLOWED_CATEGORIES.has(row.category)) {
      errors.push(`index row has unknown category ${row.category}`);
    }
    if (!expectedKeys.has(key)) {
      errors.push(`index claims non-owned item ${key}`);
    }
    if (seen.has(key)) {
      errors.push(`index repeats item ${key}`);
    }
    seen.add(key);
  }
  for (const key of expectedKeys) {
    if (!seen.has(key)) {
      errors.push(`index is missing owned item ${key}`);
    }
  }

  if (manifest) {
    errors.push(...checkReferenceBlock({ parsedSeed, manifest, manifestPath, manifestDir }));
    const boundariesById = indexBoundariesByContractId(manifest);
    const contractReport = validateSeedContractEdges({
      contractEdges: parsedSeed.contractEdges ?? [],
      boundariesById,
      packageId: pkg.id,
    });
    errors.push(...contractReport.errors);
    errors.push(...checkDeclaredBoundariesCovered({ parsedSeed, boundariesById, packageId: pkg.id }));
    if (Array.isArray(segmentIds)) {
      errors.push(...checkSegmentReferences({ parsedSeed, segmentIds, packageId: pkg.id }));
    }
  }

  return { ok: errors.length === 0, errors };
}

/** The three reference paths must be present and agree with the files on disk. */
function checkReferenceBlock({ parsedSeed, manifest, manifestPath, manifestDir }) {
  const errors = [];
  const block = parsedSeed.referenceBlock;
  if (!block || typeof block !== 'object') {
    return ['section 1 must carry the machine reference block'];
  }
  if (block.source_spec?.sha256 !== manifest.input?.source_hash) {
    errors.push('the reference block source_spec.sha256 does not match the manifest input hash');
  }
  if (block.source_spec?.path !== manifest.input?.spec_path) {
    errors.push('the reference block source_spec.path does not match the manifest input spec path');
  }
  if (block.stage1_manifest?.hash !== manifest.integrity?.manifest_hash) {
    errors.push('the reference block stage1_manifest.hash does not match the manifest self-hash');
  }
  if (manifestPath && block.stage1_manifest?.path !== pathBasename(manifestPath)) {
    errors.push('the reference block stage1_manifest.path does not match the manifest on the command line');
  }
  if (block.stage2_manifest?.path !== ALLOCATE_MANIFEST_FILE_NAME) {
    errors.push(`the reference block stage2_manifest.path must be ${ALLOCATE_MANIFEST_FILE_NAME}`);
  }
  if (manifestDir && typeof block.source_spec?.path === 'string') {
    const resolved = `${manifestDir}/${block.source_spec.path}`;
    if (!/^[^/].*/.test(block.source_spec.path) || block.source_spec.path.includes('..')) {
      errors.push('the reference block source_spec.path must stay inside the workspace root');
    } else if (!existsSync(resolved)) {
      errors.push(`the reference block source_spec.path does not resolve inside the workspace: ${resolved}`);
    }
  }
  return errors;
}

/** Every declared boundary touching this package must appear as a contract. */
function checkDeclaredBoundariesCovered({ parsedSeed, boundariesById, packageId }) {
  const carried = new Set((parsedSeed.contractEdges ?? []).map((edge) => edge.contract_id));
  const errors = [];
  for (const [contractId, boundary] of boundariesById) {
    const touchesPackage = boundary.consumer_package === packageId || boundary.provider_package === packageId;
    if (touchesPackage && !carried.has(contractId)) {
      errors.push(`package ${packageId} does not carry its declared contract ${contractId}`);
    }
  }
  return errors;
}

/** Segment references must exist in the manifest segment list. */
function checkSegmentReferences({ parsedSeed, segmentIds, packageId }) {
  const known = new Set(segmentIds);
  const referenced = [
    ...(parsedSeed.referenceBlock?.source_segments ?? []),
    ...(parsedSeed.traceabilityRows ?? []).map((row) => row.segmentId),
  ];
  const errors = [];
  for (const segmentId of new Set(referenced)) {
    if (!known.has(segmentId)) {
      errors.push(`package ${packageId} references the unknown segment ${segmentId}`);
    }
  }
  return errors;
}

function pathBasename(filePath) {
  return filePath.split('/').pop();
}

function itemKey(category, inventoryRef) {
  return `${category}:${inventoryRef}`;
}
