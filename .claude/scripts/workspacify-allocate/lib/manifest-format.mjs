// [::TICKET::] PX-189, PX-196 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-189|PX-196) --for-spec --no-implementation-order`.
// PX-189 @verifies C001
/**
 * Stage-1 manifest format check for the ALLOCATE entry gate.
 *
 * "Format" means shape and value domain only: which sections must exist, that
 * each holds the right kind of value, and that enumerations stay inside the
 * stage-1 vocabularies. Consistency between the tree, the package catalog and
 * the ownership table is deliberately NOT a format concern — the plan gate (G2)
 * owns it, and it can only reason once the manifest is well formed.
 *
 * A format failure interrupts stage 2 before any work starts, so the messages
 * are written as full English sentences that name the offending path and the
 * expected form: the reader is an AI agent that must repair the stage-1 output.
 */
import { LAYERS, PACKAGE_KINDS } from '../../workspacify-tree/lib/workspace-model.mjs';

export const MANIFEST_FORMAT_LEAD =
  'The input manifest is not in the stage-1 WORKSPACIFY-TREE-MANIFEST format, so workspacify-allocate is interrupted before any stage-2 work.';

const REQUIRED_SECTIONS = ['input', 'inventory', 'workspace', 'integrity'];
const OPTIONAL_SECTIONS = ['dependencies', 'conformance', 'stage2_handoff', 'final_audit'];
const INVENTORY_CATEGORIES = [
  'objects',
  'claims',
  'invariants',
  'state_machines',
  'error_codes',
  'required_tests',
  'terms',
  'normalization_decisions',
  'unresolved_candidates',
];
const DEPENDENCY_LISTS = ['normal_edges', 'forbidden_edges', 'forbidden_layer_rules', 'dev_dependency_policy', 'boundaries'];
const CONFORMANCE_LISTS = ['test_obligations', 'ci_rules'];
const PACKAGE_STRING_FIELDS = ['id', 'name', 'path', 'layer', 'kind'];
const OWNERSHIP_STRING_FIELDS = ['inventory_ref', 'category', 'owner_package'];
const REQUIRED_STRING_PATHS = [
  'artifact_kind',
  'schema_version',
  'status',
  'input.spec_path',
  'input.source_hash',
  'integrity.manifest_hash',
  'integrity.reload_validation',
];
// Every list is type-checked only where it exists: stage 2 reads the lists it
// needs with an empty-array fallback, so an absent list is a completeness
// question for the later gates, not a malformed-manifest question here.
const ARRAY_PATHS = [
  ...INVENTORY_CATEGORIES.map((category) => `inventory.${category}`),
  'workspace.tree',
  'workspace.packages',
  'workspace.ownership.entries',
  ...DEPENDENCY_LISTS.map((list) => `dependencies.${list}`),
  ...CONFORMANCE_LISTS.map((list) => `conformance.${list}`),
];

/** Article-correct phrases so every message reads as plain English. */
const KIND_PHRASES = Object.freeze({
  object: 'an object',
  array: 'an array',
  string: 'a string',
  boolean: 'a boolean',
});

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeValue(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

function readPath(root, path) {
  return path
    .split('.')
    .reduce((node, key) => (isPlainObject(node) ? node[key] : undefined), root);
}

function requireKind(errors, value, path, kind, { optional = false } = {}) {
  if (optional && value === undefined) return;
  const matches = kind === 'array' ? Array.isArray(value) : kind === 'object' ? isPlainObject(value) : typeof value === kind;
  if (!matches) {
    errors.push(`${path} must be ${KIND_PHRASES[kind]} but is ${describeValue(value)}.`);
  }
}

function requireEnum(errors, value, path, allowed, label) {
  if (!allowed.includes(value)) {
    errors.push(`${path} ${JSON.stringify(value)} is not a ${label}; expected one of: ${allowed.join(', ')}.`);
  }
}

function checkSectionKinds(errors, manifest) {
  for (const section of REQUIRED_SECTIONS) {
    requireKind(errors, manifest[section], section, 'object');
  }
  for (const section of OPTIONAL_SECTIONS) {
    requireKind(errors, manifest[section], section, 'object', { optional: true });
  }
}

function checkScalarKinds(errors, manifest) {
  for (const path of REQUIRED_STRING_PATHS) {
    requireKind(errors, readPath(manifest, path), path, 'string');
  }
  for (const path of ARRAY_PATHS) {
    requireKind(errors, readPath(manifest, path), path, 'array', { optional: true });
  }
}

function checkPackageCatalog(errors, packages) {
  if (!Array.isArray(packages)) return;
  packages.forEach((pkg, index) => {
    const path = `workspace.packages[${index}]`;
    if (!isPlainObject(pkg)) {
      errors.push(`${path} must be an object but is ${describeValue(pkg)}.`);
      return;
    }
    for (const field of PACKAGE_STRING_FIELDS) {
      requireKind(errors, pkg[field], `${path}.${field}`, 'string');
    }
    requireKind(errors, pkg.seed_required, `${path}.seed_required`, 'boolean');
    requireKind(errors, pkg.owns, `${path}.owns`, 'object', { optional: true });
    if (typeof pkg.layer === 'string') {
      requireEnum(errors, pkg.layer, `${path}.layer`, LAYERS, 'stage-1 layer');
    }
    if (typeof pkg.kind === 'string') {
      requireEnum(errors, pkg.kind, `${path}.kind`, PACKAGE_KINDS, 'stage-1 package kind');
    }
  });
}

/**
 * Every segment must declare the material it carries.
 *
 * Without it stage 2 cannot tell a segment no seed owes (prose) from one that must
 * be carried, and the zero-omission proof would pass vacuously.
 */
function checkSegmentOwnership(errors, segments) {
  if (!Array.isArray(segments)) {
    return;
  }
  segments.forEach((segment, index) => {
    const path = `structure.segments[${index}]`;
    if (!isPlainObject(segment)) {
      errors.push(`${path} must be an object but is ${describeValue(segment)}.`);
      return;
    }
    requireKind(errors, segment.owned_inventory_ids, `${path}.owned_inventory_ids`, 'array');
  });
}

function checkOwnershipEntries(errors, entries) {
  if (!Array.isArray(entries)) return;
  entries.forEach((entry, index) => {
    const path = `workspace.ownership.entries[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${path} must be an object but is ${describeValue(entry)}.`);
      return;
    }
    for (const field of OWNERSHIP_STRING_FIELDS) {
      requireKind(errors, entry[field], `${path}.${field}`, 'string');
    }
  });
}

/**
 * Report every way the manifest departs from the stage-1 format.
 *
 * @param {unknown} manifest - parsed WORKSPACIFY-TREE-MANIFEST.json
 * @returns {{ ok: boolean, errors: string[] }} English sentences naming each violation
 */
export function checkManifestFormat(manifest) {
  if (!isPlainObject(manifest)) {
    return { ok: false, errors: [`The manifest must be a JSON object but is ${describeValue(manifest)}.`] };
  }
  const errors = [];
  checkSectionKinds(errors, manifest);
  checkScalarKinds(errors, manifest);
  checkPackageCatalog(errors, manifest.workspace?.packages);
  checkOwnershipEntries(errors, manifest.workspace?.ownership?.entries);
  checkSegmentOwnership(errors, manifest.structure?.segments);
  return { ok: errors.length === 0, errors };
}
