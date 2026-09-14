// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C001 C002
/**
 * Stage-2 input lock (corrected ALLOCATE §7.1-§7.3).
 *
 * The tree manifest is the single stage-2 input. It is schema-validated,
 * self-hash verified, and its co-located original specification is re-hashed
 * against input.source_hash so every source trace a seed later cites is
 * anchored to bytes the manifest actually came from.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';
import { normalizeTextBytes } from '../../workspacify-tree/lib/normalization.mjs';
import { computeSelfHash } from '../../workspacify-tree/lib/render.mjs';
import { loadSchema, validateAgainstSchema } from '../../workspacify-tree/lib/manifest-schema.mjs';
import { checkManifestFormat, MANIFEST_FORMAT_LEAD } from './manifest-format.mjs';
import { isReadableRegularFile } from '../../workspacify-tree/lib/fs-safe.mjs';
import { isPathContained } from './path-safety.mjs';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

const FINAL_AUDIT_ZERO_COUNTS = [
  'orphan_object_count',
  'orphan_claim_count',
  'owner_collision_count',
  'unknown_dependency_count',
  'forbidden_dependency_count',
  'layer_violation_count',
  'cycle_count',
  'review_required_count',
  'unresolved_count',
  'unallocated_count',
  'missing_responsibilities_count',
];

const CATEGORY_OWNERSHIP_LISTS = [
  ['invariants', 'invariant'],
  ['state_machines', 'state_machine'],
  ['error_codes', 'error_code'],
  ['required_tests', 'required_test'],
];

/**
 * Read and parse the tree manifest file.
 *
 * @param {string} absPath - absolute path to WORKSPACIFY-TREE-MANIFEST.json
 * @returns {object} parsed manifest
 * @throws {WorkSpacifyTreeError} gateId "G0" or "G0.1"
 */
export function loadTreeManifest(absPath) {
  if (!isReadableRegularFile(absPath)) {
    throw new WorkSpacifyTreeError(`manifest path is not a readable regular file: ${absPath}`, { gateId: 'G0' });
  }
  const rawBuffer = readFileSync(absPath);
  if (rawBuffer.length === 0) {
    throw new WorkSpacifyTreeError(`manifest file is empty: ${absPath}`, { gateId: 'G0' });
  }
  let text;
  try {
    text = UTF8_DECODER.decode(rawBuffer);
  } catch {
    throw new WorkSpacifyTreeError(`manifest file is not valid UTF-8: ${absPath}`, { gateId: 'G0' });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new WorkSpacifyTreeError(`manifest file is not valid JSON: ${absPath}`, { gateId: 'G0.1' });
  }
}

/**
 * Run the ALLOCATE entry gate over a parsed tree manifest.
 *
 * @param {object} manifest - parsed WORKSPACIFY-TREE-MANIFEST.json
 * @param {string} manifestDir - the manifest directory (workspace root basis)
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function checkAllocateEntryGate(manifest, manifestDir) {
  const format = checkManifestFormat(manifest);
  if (!format.ok) {
    // A malformed manifest cannot be reasoned about, so the format verdict is the
    // whole answer: reporting downstream gate reasons on top would bury the cause.
    return { ok: false, errors: [MANIFEST_FORMAT_LEAD, ...format.errors] };
  }

  const errors = [];

  const schemaReport = validateAgainstSchema(manifest, loadSchema('workspacify-tree-manifest.schema.json'));
  for (const schemaError of schemaReport.errors) {
    errors.push(`schema ${schemaError.path}: ${schemaError.message}`);
  }

  if (manifest.artifact_kind !== 'workspacify-tree-manifest') {
    errors.push('artifact_kind must be workspacify-tree-manifest');
  }
  if (manifest.status !== 'COMPLETE') {
    errors.push('status must be COMPLETE');
  }

  const integrity = manifest.integrity ?? {};
  if (!integrity.manifest_hash || computeSelfHash(manifest) !== integrity.manifest_hash) {
    errors.push('integrity self-hash mismatch');
  }
  if (integrity.reload_validation !== 'PASS') {
    errors.push('integrity.reload_validation must be PASS');
  }

  const audit = manifest.final_audit ?? {};
  for (const key of FINAL_AUDIT_ZERO_COUNTS) {
    if (audit[key] !== undefined && audit[key] !== 0) {
      errors.push(`final_audit.${key} must be 0`);
    }
  }
  if (audit.status !== 'PASS') {
    errors.push('final_audit.status must be PASS');
  }

  const handoff = manifest.stage2_handoff ?? {};
  if (handoff.eligible !== true) {
    errors.push('stage2_handoff.eligible must be true');
  }
  if (handoff.entry_gate && handoff.entry_gate.required_status !== 'COMPLETE') {
    errors.push('stage2_handoff.entry_gate.required_status must be COMPLETE');
  }

  if (manifest.dependencies?.orientation !== 'consumer_to_direct_dependency') {
    errors.push('dependencies.orientation must be consumer_to_direct_dependency');
  }
  errors.push(...checkEdgeBoundaryParity(manifest));

  const packages = manifest.workspace?.packages ?? [];
  const packageIds = new Set(packages.map((pkg) => pkg.id));
  for (const entry of manifest.workspace?.ownership?.entries ?? []) {
    if (!packageIds.has(entry.owner_package)) {
      errors.push(`ownership entry for ${entry.inventory_ref} targets unknown package ${entry.owner_package}`);
    }
  }

  const ownedEntryKeys = new Set((manifest.workspace?.ownership?.entries ?? []).map((entry) => `${entry.category}:${entry.inventory_ref}`));
  const inventory = manifest.inventory ?? {};
  for (const [listKey, categoryLabel] of CATEGORY_OWNERSHIP_LISTS) {
    for (const item of inventory[listKey] ?? []) {
      if (!ownedEntryKeys.has(`${categoryLabel}:${item.id}`)) {
        errors.push(`inventory ${listKey} item ${item.id} has no ownership entry`);
      }
    }
  }

  const specPath = manifest.input?.spec_path;
  if (typeof specPath === 'string' && specPath.length > 0) {
    const resolvedSpec = path.resolve(manifestDir, specPath);
    if (!isPathContained(manifestDir, resolvedSpec)) {
      errors.push('input.spec_path escapes the manifest directory');
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Verify that dependency edges and contract boundaries cover each other.
 *
 * @param {object} manifest - parsed tree manifest
 * @returns {string[]} parity errors
 */
function checkEdgeBoundaryParity(manifest) {
  const errors = [];
  const normalEdges = manifest.dependencies?.normal_edges ?? [];
  const boundaries = manifest.dependencies?.boundaries ?? [];
  if (normalEdges.length === 0 && boundaries.length === 0) {
    return errors;
  }
  const edgeKeys = new Set(normalEdges.map((edge) => `${edge.from}->${edge.to}`));
  const boundaryKeys = new Set(boundaries.map((boundary) => `${boundary.consumer_package ?? boundary.consumer}->${boundary.provider_package ?? boundary.provider}`));
  for (const key of edgeKeys) {
    if (!boundaryKeys.has(key)) {
      errors.push(`normal edge "${key}" has no contract boundary`);
    }
  }
  for (const key of boundaryKeys) {
    if (!edgeKeys.has(key)) {
      errors.push(`contract boundary "${key}" has no corresponding normal edge`);
    }
  }
  return errors;
}

/**
 * Read the co-located original specification and re-verify its hash.
 *
 * The manifest records only the spec basename; the spec is resolved next to
 * the manifest (the workspace root) and must re-hash to input.source_hash.
 *
 * @param {object} manifest - parsed tree manifest
 * @param {string} manifestDir - directory holding the manifest and the spec
 * @returns {{ sourceText: string, sourceHash: string }}
 * @throws {WorkSpacifyTreeError} gateId "G0.3"
 */
export function readManifestSource(manifest, manifestDir) {
  const specPath = manifest.input?.spec_path;
  const expectedHash = manifest.input?.source_hash;
  if (typeof specPath !== 'string' || specPath.length === 0) {
    throw new WorkSpacifyTreeError('manifest input.spec_path is missing', { gateId: 'G0.3' });
  }
  if (typeof expectedHash !== 'string' || expectedHash.length === 0) {
    throw new WorkSpacifyTreeError('manifest input.source_hash is missing', { gateId: 'G0.3' });
  }
  const resolvedSpec = path.resolve(manifestDir, specPath);
  if (!isPathContained(manifestDir, resolvedSpec)) {
    throw new WorkSpacifyTreeError('input.spec_path escapes the manifest directory', { gateId: 'G0.3' });
  }
  if (!isReadableRegularFile(resolvedSpec)) {
    throw new WorkSpacifyTreeError(`co-located spec is not a readable regular file: ${resolvedSpec}`, { gateId: 'G0.3' });
  }
  const normalized = normalizeTextBytes(readFileSync(resolvedSpec));
  const sourceHash = sha256Hex(normalized.bytes);
  if (sourceHash !== expectedHash) {
    throw new WorkSpacifyTreeError('co-located spec re-hash does not match input.source_hash', { gateId: 'G0.3' });
  }
  return { sourceText: Buffer.from(normalized.bytes).toString('utf8'), sourceHash };
}
