// [::TICKET::] PX-177 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`.
/**
 * Workspace model vocabulary and catalog validation (§9.1, §11.2).
 *
 * The layer order is the dependency axis: foundation is the lowest layer and
 * conformance the highest. Layer rules are data-driven so a consumer can ask
 * whether an edge from one layer to another is forbidden.
 */

/** Allowed layers in dependency order (low -> high). */
export const LAYERS = Object.freeze(['foundation', 'protocol', 'ports', 'adapters', 'core', 'interfaces', 'conformance']);

/** Allowed package kinds. */
export const PACKAGE_KINDS = Object.freeze([
  'production-library',
  'adapter',
  'binary',
  'test-support',
  'conformance',
]);

/** Kinds treated as production code (they must not depend on conformance). */
export const PRODUCTION_KINDS = new Set(['production-library', 'adapter', 'binary']);

/** Layer pairs forbidden by §11.2 (target layer per source layer). */
export const LAYER_FORBIDDEN_TARGETS = Object.freeze({
  foundation: new Set(['protocol', 'ports', 'adapters', 'core', 'interfaces', 'conformance']),
  protocol: new Set(['ports', 'adapters', 'core', 'interfaces', 'conformance']),
  ports: new Set(['adapters', 'core', 'interfaces']),
  core: new Set(['adapters']),
  interfaces: new Set(['protocol', 'ports', 'adapters']),
});

/** Return the dependency index of a layer, or -1 when unknown. */
export function layerIndex(layer) {
  return LAYERS.indexOf(layer);
}

/**
 * Validate a package catalog.
 *
 * @param {Array<object>} packages - package descriptors
 * @returns {Array<{ packageId: string, message: string }>} structural errors
 */
export function validatePackageCatalog(packages) {
  const errors = [];
  const seenPaths = new Set();
  for (const pkg of packages ?? []) {
    const packageId = pkg.id ?? '';
    if (typeof pkg.id !== 'string' || pkg.id.length === 0) {
      errors.push({ packageId, message: 'package id must be a non-empty string' });
    }
    if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
      errors.push({ packageId, message: 'package name must be a non-empty string' });
    }
    if (typeof pkg.path !== 'string' || pkg.path.length === 0) {
      errors.push({ packageId, message: 'package path must be a non-empty string' });
    }
    if (!LAYERS.includes(pkg.layer)) {
      errors.push({ packageId, message: `unknown layer "${pkg.layer}"` });
    }
    if (!PACKAGE_KINDS.includes(pkg.kind)) {
      errors.push({ packageId, message: `unknown kind "${pkg.kind}"` });
    }
    if (typeof pkg.path === 'string' && pkg.path.length > 0) {
      if (seenPaths.has(pkg.path)) {
        errors.push({ packageId, message: `duplicate path "${pkg.path}"` });
      }
      seenPaths.add(pkg.path);
    }
  }
  return errors;
}
