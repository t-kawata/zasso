// [::TICKET::] PX-181, PX-192 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-181|PX-183|PX-185|PX-192) --for-spec --no-implementation-order`.
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
import { validateContractScope } from './contract-clauses.mjs';
import { checkAllocateEntryGate } from '../../workspacify-allocate/lib/tree-manifest-input.mjs';

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

/**
 * Check a published manifest against the ALLOCATE entry gate.
 *
 * @param {object} manifest - WORKSPACIFY-TREE-MANIFEST.json content
 * @param {string} specPath - path to the original specification
 * @returns {{ ok: boolean, errors: Array<string> }}
 */
export function checkTreeEntryGate(manifest, specPath) {
  const errors = [];

  // The authority on "stage 2 will accept this" is stage 2's own entry gate: asking
  // it here makes the two gates one predicate, so neither side can drift.
  const acceptance = checkAllocateEntryGate(manifest, pathDirname(specPath));
  if (!acceptance.ok) {
    errors.push(...acceptance.errors.map((message) => `stage-2 entry gate: ${message}`));
  }

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
  errors.push(...checkContractDefinitionOrder(manifest));
  errors.push(...checkImplementationOrder(manifest));
  errors.push(...checkContractBoundaryMirror(manifest));
  errors.push(...checkBoundaryContractScopes(manifest));

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


/** Contract items whose definition order the hand-off records, in stage-1 order. */
function declaredContractItems(inventory) {
  const names = (list, pick) => (list ?? []).map(pick);
  return [
    ...names(inventory.objects, (item) => item.canonical_name),
    ...names(inventory.claims, (item) => item.canonical_name),
    ...names(inventory.terms, (item) => item.canonical_name ?? item.keyword),
  ];
}

/** The contract-item order must permute exactly the declared contract items. */
function checkContractDefinitionOrder(manifest) {
  const order = manifest.stage2_handoff?.contract_definition_order;
  if (!Array.isArray(order)) {
    return [];
  }
  const declaredItems = declaredContractItems(manifest.inventory ?? {});
  if (declaredItems.length === 0) {
    return [];
  }
  const errors = [];
  if (order.length === 0) {
    errors.push('stage2_handoff.contract_definition_order must not be empty when contract items are declared');
    return errors;
  }
  const countsOf = (list) => list.reduce((counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1), new Map());
  const declaredCounts = countsOf(declaredItems);
  const orderCounts = countsOf(order);
  for (const [name, count] of declaredCounts) {
    if ((orderCounts.get(name) ?? 0) !== count) {
      errors.push(`stage2_handoff.contract_definition_order does not match the declared contract item "${name}"`);
    }
  }
  for (const [name, count] of orderCounts) {
    if ((declaredCounts.get(name) ?? 0) !== count) {
      errors.push(`stage2_handoff.contract_definition_order names an undeclared contract item "${name}"`);
    }
  }
  return errors;
}

/**
 * The package implementation order must be a providers-first wave order over the
 * same edge set, so following it never implements a consumer before its provider.
 */
function checkImplementationOrder(manifest) {
  const dag = manifest.dependencies?.dag;
  if (!dag) {
    return ['dependencies.dag (the persisted dependency proof) must be present'];
  }
  const order = dag.implementation_order;
  const errors = [];
  if (!order || !Array.isArray(order.serial) || !Array.isArray(order.levels)) {
    return ['dependencies.dag.implementation_order must carry serial and levels'];
  }
  const packageIds = (manifest.workspace?.packages ?? []).map((pkg) => pkg.id);
  const expectedIds = [...packageIds].sort();
  const serialIds = [...order.serial].sort();
  if (serialIds.length !== expectedIds.length || serialIds.some((id, index) => id !== expectedIds[index])) {
    errors.push('dependencies.dag.implementation_order.serial must be a permutation of the package catalog');
    return errors;
  }
  const flattened = order.levels.flat();
  if (flattened.length !== order.serial.length || flattened.some((id, index) => id !== order.serial[index])) {
    errors.push('dependencies.dag.implementation_order.levels must partition serial in order');
    return errors;
  }
  for (const level of order.levels) {
    const sorted = [...level].sort();
    if (level.some((id, index) => id !== sorted[index])) {
      errors.push('dependencies.dag.implementation_order.levels must be sorted by package id');
      break;
    }
  }
  const waveByPackage = new Map();
  order.levels.forEach((level, wave) => {
    for (const id of level) {
      waveByPackage.set(id, wave);
    }
  });
  for (const edge of manifest.dependencies?.normal_edges ?? []) {
    if (!waveByPackage.has(edge.from) || !waveByPackage.has(edge.to)) {
      continue;
    }
    if (waveByPackage.get(edge.to) >= waveByPackage.get(edge.from)) {
      errors.push(`dependencies.dag.implementation_order places consumer ${edge.from} no later than its provider ${edge.to}`);
    }
  }
  return errors;
}

/** contract_boundaries must mirror dependencies.boundaries one to one. */
function checkContractBoundaryMirror(manifest) {
  const declared = manifest.dependencies?.boundaries;
  const mirrored = manifest.stage2_handoff?.contract_boundaries;
  if (!Array.isArray(declared) || !Array.isArray(mirrored)) {
    return [];
  }
  const keyOf = (boundary) => `${boundary.id ?? ''}:${boundary.consumer_package ?? boundary.consumer ?? ''}->${boundary.provider_package ?? boundary.provider ?? ''}`;
  const declaredKeys = declared.map(keyOf).sort();
  const mirroredKeys = mirrored.map(keyOf).sort();
  const errors = [];
  for (const key of declaredKeys) {
    if (!mirroredKeys.includes(key)) {
      errors.push(`stage2_handoff.contract_boundaries is missing the dependency boundary ${key}`);
    }
  }
  for (const key of mirroredKeys) {
    if (!declaredKeys.includes(key)) {
      errors.push(`stage2_handoff.contract_boundaries carries an extra boundary ${key}`);
    }
  }
  return errors;
}

/** Every dependency boundary must declare the core clauses and only vocabulary members. */
function checkBoundaryContractScopes(manifest) {
  const errors = [];
  for (const boundary of manifest.dependencies?.boundaries ?? []) {
    const verdict = validateContractScope(boundary.stage2_contract_scope);
    for (const clause of verdict.missingCore) {
      errors.push(`dependencies.boundaries ${boundary.id ?? ''} stage2_contract_scope is missing the core clause "${clause}"`);
    }
    for (const clause of verdict.unknown) {
      errors.push(`dependencies.boundaries ${boundary.id ?? ''} stage2_contract_scope names an unknown clause "${clause}"`);
    }
    for (const clause of verdict.duplicates) {
      errors.push(`dependencies.boundaries ${boundary.id ?? ''} stage2_contract_scope repeats the clause "${clause}"`);
    }
  }
  return errors;
}

/** Directory of the specification (the manifest directory for a published hand-off). */
function pathDirname(filePath) {
  const index = filePath.lastIndexOf('/');
  return index > 0 ? filePath.slice(0, index) : '.';
}

function verifySourceHash(specPath) {
  const rawBuffer = readFileSync(specPath);
  const normalized = normalizeTextBytes(rawBuffer);
  return sha256Hex(normalized.bytes);
}
