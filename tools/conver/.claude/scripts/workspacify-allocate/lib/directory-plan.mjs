// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C004
/**
 * Deterministic directory plan (corrected ALLOCATE §8.2).
 *
 * The plan derives the complete set of directories that must exist under the
 * workspace root from the stage-1 workspace.tree and package catalog. It is a
 * pure function: the same (tree, packages) always yields the same sorted set.
 */
import { validatePackageCatalog, validateWorkspaceTree } from '../../workspacify-tree/lib/workspace-model.mjs';
import { classifyUnsafePath } from './path-safety.mjs';

/**
 * Build the sorted, de-duplicated set of directories to materialize.
 *
 * @param {{ tree: Array<object>, packages: Array<object> }} input
 * @returns {{ relativeDirs: string[], packageLeafByPackageId: object, consistent: boolean, errors: string[] }}
 */
export function buildDirectoryPlan({ tree, packages }) {
  const treeArr = Array.isArray(tree) ? tree : [];
  const packageArr = Array.isArray(packages) ? packages : [];
  const errors = [];

  if (packageArr.length > 0 && treeArr.length === 0) {
    errors.push('workspace.tree is required when packages are declared');
  }

  for (const catalogError of validatePackageCatalog(packageArr)) {
    errors.push(`package catalog: ${catalogError.message}`);
  }

  if (treeArr.length > 0) {
    const treeReport = validateWorkspaceTree({ tree: treeArr, packages: packageArr });
    if (!treeReport.consistent) {
      errors.push(...treeReport.errors);
    }
  }

  const nodePaths = collectTreeNodePaths(treeArr);
  for (const nodePath of nodePaths) {
    const reasons = classifyUnsafePath(nodePath);
    if (reasons.length > 0) {
      errors.push(`unsafe tree path "${nodePath}": ${reasons.join('; ')}`);
    }
  }

  const relativeDirs = [...new Set(nodePaths)].sort();
  const packageLeafByPackageId = Object.fromEntries(packageArr.map((pkg) => [pkg.id, pkg.path]));

  return { relativeDirs, packageLeafByPackageId, consistent: errors.length === 0, errors };
}

/**
 * Collect every directory path named by the workspace tree nodes.
 *
 * @param {Array<object>} nodes - tree nodes ({ path, children })
 * @returns {string[]} node paths (ancestors and leaves), order preserved
 */
function collectTreeNodePaths(nodes) {
  const paths = [];
  for (const node of nodes ?? []) {
    if (node && typeof node.path === 'string' && node.path.length > 0) {
      paths.push(node.path);
    }
    if (node && Array.isArray(node.children) && node.children.length > 0) {
      paths.push(...collectTreeNodePaths(node.children));
    }
  }
  return paths;
}
