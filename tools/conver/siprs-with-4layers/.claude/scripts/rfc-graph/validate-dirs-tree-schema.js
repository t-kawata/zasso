#!/usr/bin/env node
/**
 * validate-dirs-tree-schema.js — Dirs-Tree.json schema validation script
 *
 * Validates Dirs-Tree.json via --dirs-tree=<path> --graph=<path>.
 * Automatically executed at the end of each Step in the boundify-graph pipeline.
 * Serves the same role as check-all-schema.js in graphify.
 *
 * Validation items (6 items):
 *   1. JSON Schema compliance — existence of schemaVersion, trees, dependencyDirections
 *   2. All mappedNodeIds exist in the source graph
 *   3. No duplicate paths
 *   4. from/to of dependency directions are actual directory paths
 *   5. Nesting depth does not exceed 4
 *   6. Each file name follows the language's naming conventions
 *
 * Output contract:
 *   Success → {"ok":true} (exit code 0)
 *   Failure → {"ok":false, "errors":[...]} (exit code 1)
 *   On failure, also outputs 3-tier template error to stderr
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// Constants
// ============================================================

/** Maximum allowed nesting depth (root is 0) */
const MAX_DEPTH = 4;

/** Expected extension mapping per language */
const LANGUAGE_EXTENSIONS = Object.freeze({
  rust: '.rs',
  go: '.go',
  typescript: '.ts',
});

/** List of supported languages */
const SUPPORTED_LANGUAGES = Object.freeze(['rust', 'go', 'typescript']);

/** 3-tier template error (for stderr) — when arguments are missing */
const ERROR_MISSING_ARGS = '[ERROR] Insufficient arguments\nCause: --dirs-tree=<path> and --graph=<path> are required\nAction: Specify both arguments and re-run';

// ============================================================
// Validation Functions
// ============================================================

/**
 * Validates the existence of the schemaVersion field in Dirs-Tree.json
 *
 * @param {object} dirsTree — Dirs-Tree.json object to validate
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkSchemaVersion(dirsTree, errors) {
  if (!dirsTree.schemaVersion) {
    errors.push('schemaVersion is missing');
  }
}

/**
 * Validates the existence of the trees field in Dirs-Tree.json
 *
 * @param {object} dirsTree — Dirs-Tree.json object to validate
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkTreesField(dirsTree, errors) {
  if (!dirsTree.trees) {
    errors.push('trees is missing');
  }
}

/**
 * Validates the existence of the dependencyDirections field in Dirs-Tree.json
 *
 * @param {object} dirsTree — Dirs-Tree.json object to validate
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkDependencyDirectionsField(dirsTree, errors) {
  if (!dirsTree.dependencyDirections) {
    errors.push('dependencyDirections is missing');
  }
}

/**
 * Validates the existence of the 3 required fields (schemaVersion, trees, dependencyDirections)
 *
 * @param {object} dirsTree — Dirs-Tree.json object to validate
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkRequiredFields(dirsTree, errors) {
  checkSchemaVersion(dirsTree, errors);
  checkTreesField(dirsTree, errors);
  checkDependencyDirectionsField(dirsTree, errors);
}

/**
 * Recursively validates that all mappedNodeIds in the tree exist in the source graph
 *
 * @param {object} node — Current DirNode
 * @param {Set<string>} allNodeIds — Set of all node IDs in the source graph
 * @param {string} pathStr — Current path (for error messages)
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkNodeIds(node, allNodeIds, pathStr, errors) {
  if (node.mappedNodeIds) {
    for (const entry of node.mappedNodeIds) {
      // mappedNodeIds accepts both {nodeId, title} object form and string nodeId form
      const nodeId = typeof entry === 'object' ? entry.nodeId : entry;
      if (!allNodeIds.has(nodeId)) {
        errors.push(
          `Non-existent node ID "${nodeId}" referenced in mappedNodeIds of "${pathStr}"`
        );
      }
    }
  }
  if (node.children) {
    for (const child of node.children) {
      checkNodeIds(child, allNodeIds, `${pathStr}/${child.name}`, errors);
    }
  }
}

/**
 * Validates that all paths in the tree are not duplicated
 *
 * If sibling nodes (file/directory) with the same name exist within the same language tree,
 * it is considered a path duplication.
 *
 * @param {object} dirsTree — Dirs-Tree.json object to validate
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkPathDuplication(dirsTree, errors) {
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;

    checkNodeNameDuplication(tree, lang, errors);
  }
}

/**
 * Recursively validates that there are no duplicate names among siblings under the specified node
 *
 * @param {object} node — Current DirNode
 * @param {string} pathStr — Path string (for error messages)
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkNodeNameDuplication(node, pathStr, errors) {
  if (!node.children) return;

  const seenNames = new Set();
  for (const child of node.children) {
    if (seenNames.has(child.name)) {
      errors.push(
        `Path duplication: "${pathStr}" has duplicate child "${child.name}"`
      );
    }
    seenNames.add(child.name);
  }

  // Recursively check children's descendants as well
  for (const child of node.children) {
    if (child.children) {
      checkNodeNameDuplication(child, `${pathStr}/${child.name}`, errors);
    }
  }
}

/**
 * Recursively validates that tree nesting depth does not exceed MAX_DEPTH
 *
 * @param {object} node — Current DirNode
 * @param {number} depth — Current depth (root is 0)
 * @param {string} pathStr — Current path (for error messages)
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkDepth(node, depth, pathStr, errors) {
  if (depth > MAX_DEPTH) {
    errors.push(`Nesting depth limit (${MAX_DEPTH}) exceeded: "${pathStr}" (depth ${depth})`);
  }
  if (node.children) {
    for (const child of node.children) {
      checkDepth(child, depth + 1, `${pathStr}/${child.name}`, errors);
    }
  }
}

/**
 * Validates nesting depth of all nodes across all language trees
 *
 * @param {object} dirsTree — Dirs-Tree.json object to validate
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkAllDepths(dirsTree, errors) {
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;
    checkDepth(tree, 0, `${lang}/${tree.name}`, errors);
  }
}

/**
 * Validates that file names in each language tree follow the language's naming convention (extension)
 *
 * @param {object} dirsTree — Dirs-Tree.json object to validate
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkNamingConventions(dirsTree, errors) {
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;

    const expectedExtension = LANGUAGE_EXTENSIONS[lang];
    checkNodeNaming(tree, lang, expectedExtension, errors);
  }
}

/**
 * Recursively validates the extension of all files under the specified node
 *
 * directory nodes are not subject to extension checking.
 * Only file nodes are checked to match the expected extension of the corresponding language.
 *
 * @param {object} node — Current DirNode
 * @param {string} lang — Language name (rust/go/typescript)
 * @param {string} expectedExt — Expected extension (e.g. ".rs")
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkNodeNaming(node, lang, expectedExt, errors) {
  if (node.type === 'file') {
    const actualExtension = path.extname(node.name);
    if (actualExtension !== expectedExt) {
      errors.push(
        `${lang} file extension is not "${expectedExt}": "${node.name}" (extension: "${actualExtension}")`
      );
    }
  }
  if (node.children) {
    for (const child of node.children) {
      checkNodeNaming(child, lang, expectedExt, errors);
    }
  }
}

/**
 * Validates that file names follow slug format (lower_snake_case + extension)
 *
 * With the slug field introduced in the PX-24 schema, file names
 * take the form <slug><.ext>. The slug part follows lower_snake_case.
 * Extension matching is handled by checkNodeNaming.
 *
 * @param {object} node — Current DirNode
 * @param {string} pathStr — Path string (for error messages)
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkSlugConvention(node, pathStr, errors) {
  if (node.type === 'file') {
    const baseName = path.basename(node.name, path.extname(node.name));
    // slug pattern: lower_snake_case (lowercase letters, digits, underscores only; must start with a lowercase letter)
    const slugPattern = /^[a-z][a-z0-9_]*$/;
    if (baseName === '' || baseName === 'unnamed') {
      // Empty or unnamed is tolerated as a fallback name
      return;
    }
    if (!slugPattern.test(baseName)) {
      errors.push(
        `File name does not follow slug format (lower_snake_case): "${pathStr}/${node.name}" (base name: "${baseName}")`
      );
    }
  }
  if (node.children) {
    for (const child of node.children) {
      const childPath = pathStr + '/' + child.name;
      checkSlugConvention(child, childPath, errors);
    }
  }
}

/**
 * Validates that all directory paths referenced by dependencyDirections exist
 *
 * @param {object} dirsTree — Dirs-Tree.json object to validate
 * @param {string[]} errors — Error accumulation array (mutated as side effect)
 */
function checkDependencyDirections(dirsTree, errors) {
  const allDirectoryPaths = collectAllDirectoryPaths(dirsTree);

  const dependencyDirections = dirsTree.dependencyDirections;
  if (!dependencyDirections) return;

  for (const lang of SUPPORTED_LANGUAGES) {
    const directions = dependencyDirections[lang];
    if (!directions || !Array.isArray(directions)) continue;

    for (const direction of directions) {
      if (!allDirectoryPaths.has(direction.from)) {
        errors.push(
          `dependencyDirections.${lang} references a non-existent directory from: "${direction.from}"`
        );
      }
      if (!allDirectoryPaths.has(direction.to)) {
        errors.push(
          `dependencyDirections.${lang} references a non-existent directory to: "${direction.to}"`
        );
      }
    }
  }
}

/**
 * Collects directory node paths from all language trees and returns them as a Set
 *
 * @param {object} dirsTree — Dirs-Tree.json object
 * @returns {Set<string>} Set of directory paths
 */
function collectAllDirectoryPaths(dirsTree) {
  const allDirectoryPaths = new Set();

  function collectDirPaths(node, prefix) {
    const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'directory') {
      allDirectoryPaths.add(currentPath);
      if (node.children) {
        for (const child of node.children) {
          collectDirPaths(child, currentPath);
        }
      }
    }
  }

  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;
    collectDirPaths(tree, '');
  }

  return allDirectoryPaths;
}

/**
 * Validates all 6 items of Dirs-Tree.json
 *
 * @param {string} dirsTreePath — File path of Dirs-Tree.json
 * @param {string} graphPath — File path of the source graph JSON
 * @returns {{ok: boolean, errors?: string[]}} Validation result
 */
function validateFiles(dirsTreePath, graphPath) {
  const errors = [];

  // Check file existence
  if (!fs.existsSync(dirsTreePath)) {
    console.error(`[ERROR] Dirs-Tree.json not found\nCause: File does not exist at the specified path\nAction: Verify the path and re-run: ${dirsTreePath}`);
    return { ok: false, errors: [`Dirs-Tree.json not found: ${dirsTreePath}`] };
  }
  if (!fs.existsSync(graphPath)) {
    console.error(`[ERROR] Graph JSON not found\nCause: File does not exist at the specified path\nAction: Verify the path and re-run: ${graphPath}`);
    return { ok: false, errors: [`Graph JSON not found: ${graphPath}`] };
  }

  // Parse JSON
  let dirsTree;
  let graph;
  try {
    dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf-8'));
  } catch (parseError) {
    console.error(`[ERROR] Dirs-Tree.json parse failed\nCause: ${parseError.message}\nAction: Verify the file is valid JSON`);
    return { ok: false, errors: [`Dirs-Tree.json parse error: ${parseError.message}`] };
  }
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
  } catch (parseError) {
    console.error(`[ERROR] Graph JSON parse failed\nCause: ${parseError.message}\nAction: Verify the file is valid JSON`);
    return { ok: false, errors: [`Graph JSON parse error: ${parseError.message}`] };
  }

  const allNodeIds = new Set(graph.nodes.map(node => node.id));

  // Validation 1: Required fields
  checkRequiredFields(dirsTree, errors);

  // Validation 2: mappedNodeIds
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;
    checkNodeIds(tree, allNodeIds, `${lang}/${tree.name}`, errors);
  }

  // Validation 3: Path duplication
  checkPathDuplication(dirsTree, errors);

  // Validation 4: Nesting depth
  checkAllDepths(dirsTree, errors);

  // Validation 5: File naming conventions
  checkNamingConventions(dirsTree, errors);

  // Validation 5b: Slug naming convention (lower_snake_case)
  // Starting from PX-24, file names follow slug + extension format,
  // so verify that the slug part follows lower_snake_case.
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;
    checkSlugConvention(tree, `${lang}/${tree.name}`, errors);
  }

  // Validation 6: Verify dependencyDirections path existence
  checkDependencyDirections(dirsTree, errors);

  // If there are errors, add fix-priority instructions at the top
  if (errors.length > 0) {
    errors.unshift(
      `---\n${errors.length} validation errors found. Fix one at a time from top, re-running after each fix.\nFix procedure:\n  1. Start fixing from the first error\n  2. Re-run this script after each fix to verify errors decrease\n  3. Repeat until all errors are resolved\n---`
    );
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true };
}

/**
 * CLI entry point. Parses command line arguments and runs validation
 *
 * @param {string[]} [testArgs] — Argument array for testing (defaults to process.argv)
 */
function validate(testArgs) {
  const args = testArgs || process.argv.slice(2);

  const dirsTreeFlag = args.find(arg => arg.startsWith('--dirs-tree='));
  const graphFlag = args.find(arg => arg.startsWith('--graph='));

  if (!dirsTreeFlag || !graphFlag) {
    console.error(ERROR_MISSING_ARGS);
    process.exit(1);
  }

  const dirsTreePath = path.resolve(dirsTreeFlag.slice('--dirs-tree='.length));
  const graphPath = path.resolve(graphFlag.slice('--graph='.length));

  const result = validateFiles(dirsTreePath, graphPath);

  if (result.ok) {
    // Output contract: Write JSON result to stdout
    process.stdout.write(JSON.stringify({ ok: true }) + '\n');
  } else {
    console.error(
      `[ERROR] Schema validation failed\nCause: ${result.errors.length}  violations\nAction: Fix each error before proceeding to the next step`
    );
    // Output contract: Write JSON result with error info to stdout
    process.stdout.write(JSON.stringify({ ok: false, errors: result.errors }) + '\n');
    process.exit(1);
  }
}

if (require.main === module) {
  validate();
}

module.exports = { validate, validateFiles };
