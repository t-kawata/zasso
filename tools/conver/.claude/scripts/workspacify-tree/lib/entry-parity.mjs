// [::TICKET::] PX-181 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-181|PX-183|PX-185) --for-spec --no-implementation-order`.
/**
 * First-stage manifest entry-check parity with ALLOCATE §7.1-§7.4.
 *
 * The second stage will refuse a manifest that fails these checks. This module
 * re-implements the same checks on the first-stage side so a manifest can be
 * proven acceptable before it is handed over.
 */
import { readFileSync } from 'node:fs';

import { sha256Hex } from './hash.mjs';
import { normalizeTextBytes } from './normalization.mjs';
import { computeSelfHash } from './render.mjs';
import { validateWorkspaceTree } from './workspace-model.mjs';

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
];

/**
 * Check a published manifest against the ALLOCATE entry gate.
 *
 * @param {object} manifest - WORKSPACIFY-TREE-MANIFEST.json content
 * @param {string} specPath - path to the original specification
 * @returns {{ ok: boolean, errors: Array<string> }}
 */
export function checkTreeEntryGate(manifest, specPath) {
  const errors = [];

  if (manifest.artifact_kind !== 'workspacify-tree-manifest') {
    errors.push('artifact_kind must be workspacify-tree-manifest');
  }
  if (manifest.status !== 'COMPLETE') {
    errors.push('manifest.status must be COMPLETE');
  }
  if (!manifest.integrity || computeSelfHash(manifest) !== manifest.integrity.manifest_hash) {
    errors.push('integrity self-hash mismatch');
  }
  if (manifest.integrity?.reload_validation !== 'PASS') {
    errors.push('integrity.reload_validation must be PASS');
  }

  const audit = manifest.final_audit ?? {};
  for (const key of FINAL_AUDIT_ZERO_COUNTS) {
    if (audit[key] !== undefined && audit[key] !== 0) {
      errors.push(`final_audit.${key} must be 0`);
    }
  }

  const handoff = manifest.stage2_handoff ?? {};
  if (handoff.eligible !== true) {
    errors.push('stage2_handoff.eligible must be true');
  }
  if (!handoff.entry_gate || handoff.entry_gate.required_status !== 'COMPLETE') {
    errors.push('stage2_handoff.entry_gate is missing or not COMPLETE');
  }
  if (!Array.isArray(handoff.contract_definition_order) || !Array.isArray(handoff.contract_boundaries)) {
    errors.push('stage2_handoff contract arrays must be present');
  }

  const packages = manifest.workspace?.packages ?? [];
  const packageIds = new Set(packages.map((pkg) => pkg.id));
  const tree = manifest.workspace?.tree;
  if (packages.length > 0 && (!tree || tree.length === 0)) {
    errors.push('workspace.tree is required when packages are declared');
  } else if (tree !== undefined && tree.length > 0) {
    const treeReport = validateWorkspaceTree({ tree, packages });
    if (!treeReport.consistent) {
      errors.push(...treeReport.errors);
    }
  }

  const normalEdges = manifest.dependencies?.normal_edges ?? [];
  const boundaries = manifest.dependencies?.boundaries ?? manifest.stage2_handoff?.contract_boundaries ?? [];
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

  for (const entry of manifest.workspace?.ownership?.entries ?? []) {
    if (!packageIds.has(entry.owner_package)) {
      errors.push(`ownership entry for ${entry.inventory_ref} targets unknown package ${entry.owner_package}`);
    }
  }

  const inventoryData = manifest.inventory ?? {};
  const ownedEntryKeys = new Set((manifest.workspace?.ownership?.entries ?? []).map((entry) => `${entry.category}:${entry.inventory_ref}`));
  const categorySources = [
    ['invariants', 'invariant'],
    ['state_machines', 'state_machine'],
    ['error_codes', 'error_code'],
    ['required_tests', 'required_test'],
  ];
  for (const [listKey, categoryLabel] of categorySources) {
    for (const item of inventoryData[listKey] ?? []) {
      if (!ownedEntryKeys.has(`${categoryLabel}:${item.id}`)) {
        errors.push(`inventory ${listKey} item ${item.id} has no ownership entry`);
      }
    }
  }

  if (manifest.dependencies?.orientation !== 'consumer_to_direct_dependency') {
    errors.push('dependencies.orientation must be consumer_to_direct_dependency');
  }
  for (const boundary of handoff.contract_boundaries ?? []) {
    if (boundary.consumer_package && !packageIds.has(boundary.consumer_package)) {
      errors.push(`boundary consumer ${boundary.consumer_package} is not in the package catalog`);
    }
    if (boundary.provider_package && !packageIds.has(boundary.provider_package)) {
      errors.push(`boundary provider ${boundary.provider_package} is not in the package catalog`);
    }
  }

  const sourceHash = verifySourceHash(specPath);
  if (manifest.input?.source_hash !== sourceHash) {
    errors.push('input.source_hash does not match the normalized specification hash');
  }

  return { ok: errors.length === 0, errors };
}

function verifySourceHash(specPath) {
  const rawBuffer = readFileSync(specPath);
  const normalized = normalizeTextBytes(rawBuffer);
  return sha256Hex(normalized.bytes);
}
